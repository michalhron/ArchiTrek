// === logic/graph.js ===
/**
 * logic/graph.js
 * ArchiTrek — Graph Builder
 *
 * Converts the flat MATRIX edge list into an adjacency list suitable for BFS.
 * Supports viewpoint filtering and direct/derived edge toggling.
 *
 * EXPORTS:
 *   buildGraph(options) → adjacency list (Map)
 *   getElementLayer(element) → layer name string
 *   ELEMENTS            → full element registry with layer metadata
 *   LAYERS              → ordered layer definitions for swimlane rendering
 */

// ─────────────────────────────────────────────────────────────────────────────
// ELEMENT REGISTRY
// Maps every ArchiMate element name to its layer and aspect metadata.
// Used for: layer tile selector, swimlane rendering, viewpoint filtering.
// ─────────────────────────────────────────────────────────────────────────────

/** Appendix B still lists these in matrix.js; the app omits them from registry, UI, and pathfinding. */
const EXCLUDED_APP_ELEMENTS = new Set(["Grouping"]);

/**
 * metamodelRole — position of each element in the ArchiMate core metamodel diagram
 * (Figure 4 in §4.2 of the spec, uploaded as IMG_1081).
 *
 * Values:
 *   "external-active"   — External Active Structure Element (Interface)
 *   "internal-active"   — Internal Active Structure Element (Actor/Component/Node)
 *   "external-behavior" — External Behavior Element (Service)
 *   "internal-behavior" — Internal Behavior Element (Process/Function/Interaction)
 *   "event"             — Event
 *   "passive"           — Passive Structure Element
 *   "motivation"        — Motivation element (outside the core metamodel box)
 *   "strategy"          — Strategy element (outside the core metamodel box)
 *   "composite"         — Composite / grouping element
 *   "implementation"    — Implementation & Migration element
 *
 * Used by ui/metamodelDiagram.js to highlight the correct boxes and arrows
 * when explaining valid or invalid connections.
 */

const ELEMENTS = {

  // ── Motivation — chamfered / passive motivation elements use lavender #CCCCFF
  "Stakeholder":      { layer: "Motivation", aspect: "Active Structure",  color: "#CCCCFF", metamodelRole: "motivation" },
  "Driver":           { layer: "Motivation", aspect: "Motivation",        color: "#CCCCFF", metamodelRole: "motivation" },
  "Assessment":       { layer: "Motivation", aspect: "Motivation",        color: "#CCCCFF", metamodelRole: "motivation" },
  "Goal":             { layer: "Motivation", aspect: "Motivation",        color: "#CCCCFF", metamodelRole: "motivation" },
  "Outcome":          { layer: "Motivation", aspect: "Motivation",        color: "#CCCCFF", metamodelRole: "motivation" },
  "Principle":        { layer: "Motivation", aspect: "Motivation",        color: "#CCCCFF", metamodelRole: "motivation" },
  "Requirement":      { layer: "Motivation", aspect: "Motivation",        color: "#CCCCFF", metamodelRole: "motivation" },
  "Constraint":       { layer: "Motivation", aspect: "Motivation",        color: "#CCCCFF", metamodelRole: "motivation" },
  "Meaning":          { layer: "Motivation", aspect: "Passive Structure", color: "#CCCCFF", metamodelRole: "motivation" },
  "Value":            { layer: "Motivation", aspect: "Passive Structure", color: "#CCCCFF", metamodelRole: "motivation" },

  // ── Strategy ───────────────────────────────────────────────────────────────
  "Resource":         { layer: "Strategy",   aspect: "Active Structure",  color: "#f5ede0", metamodelRole: "strategy" },
  "Capability":       { layer: "Strategy",   aspect: "Behavior",          color: "#f5ede0", metamodelRole: "strategy" },
  "Value Stream":     { layer: "Strategy",   aspect: "Behavior",          color: "#f5ede0", metamodelRole: "strategy" },
  "Course of Action": { layer: "Strategy",   aspect: "Behavior",          color: "#f5ede0", metamodelRole: "strategy" },

  // ── Business ───────────────────────────────────────────────────────────────
  "Business Actor":         { layer: "Business", aspect: "Active Structure",  color: "#fffbe6", metamodelRole: "internal-active" },
  "Business Role":          { layer: "Business", aspect: "Active Structure",  color: "#fffbe6", metamodelRole: "internal-active" },
  "Business Collaboration": { layer: "Business", aspect: "Active Structure",  color: "#fffbe6", metamodelRole: "internal-active" },
  "Business Interface":     { layer: "Business", aspect: "Active Structure",  color: "#fffbe6", metamodelRole: "external-active" },
  "Business Process":       { layer: "Business", aspect: "Behavior",          color: "#fffbe6", metamodelRole: "internal-behavior" },
  "Business Function":      { layer: "Business", aspect: "Behavior",          color: "#fffbe6", metamodelRole: "internal-behavior" },
  "Business Interaction":   { layer: "Business", aspect: "Behavior",          color: "#fffbe6", metamodelRole: "internal-behavior" },
  "Business Event":         { layer: "Business", aspect: "Behavior",          color: "#fffbe6", metamodelRole: "event" },
  "Business Service":       { layer: "Business", aspect: "Behavior",          color: "#fffbe6", metamodelRole: "external-behavior" },
  "Business Object":        { layer: "Business", aspect: "Passive Structure", color: "#fffbe6", metamodelRole: "passive" },
  "Contract":               { layer: "Business", aspect: "Passive Structure", color: "#fffbe6", metamodelRole: "passive" },
  "Representation":         { layer: "Business", aspect: "Passive Structure", color: "#fffbe6", metamodelRole: "passive" },
  "Product":                { layer: "Business", aspect: "Composite",         color: "#fffbe6", metamodelRole: "composite" },

  // ── Application ────────────────────────────────────────────────────────────
  "Application Component":     { layer: "Application", aspect: "Active Structure",  color: "#BFFFFF", metamodelRole: "internal-active" },
  "Application Collaboration": { layer: "Application", aspect: "Active Structure",  color: "#BFFFFF", metamodelRole: "internal-active" },
  "Application Interface":     { layer: "Application", aspect: "Active Structure",  color: "#BFFFFF", metamodelRole: "external-active" },
  "Application Function":      { layer: "Application", aspect: "Behavior",          color: "#BFFFFF", metamodelRole: "internal-behavior" },
  "Application Process":       { layer: "Application", aspect: "Behavior",          color: "#BFFFFF", metamodelRole: "internal-behavior" },
  "Application Interaction":   { layer: "Application", aspect: "Behavior",          color: "#BFFFFF", metamodelRole: "internal-behavior" },
  "Application Event":         { layer: "Application", aspect: "Behavior",          color: "#BFFFFF", metamodelRole: "event" },
  "Application Service":       { layer: "Application", aspect: "Behavior",          color: "#BFFFFF", metamodelRole: "external-behavior" },
  "Data Object":               { layer: "Application", aspect: "Passive Structure", color: "#BFFFFF", metamodelRole: "passive" },

  // ── Technology ─────────────────────────────────────────────────────────────
  "Node":                      { layer: "Technology", aspect: "Active Structure",  color: "#c1ffb1", metamodelRole: "internal-active" },
  "Device":                    { layer: "Technology", aspect: "Active Structure",  color: "#c1ffb1", metamodelRole: "internal-active" },
  "System Software":           { layer: "Technology", aspect: "Active Structure",  color: "#c1ffb1", metamodelRole: "internal-active" },
  "Technology Collaboration":  { layer: "Technology", aspect: "Active Structure",  color: "#c1ffb1", metamodelRole: "internal-active" },
  "Technology Interface":      { layer: "Technology", aspect: "Active Structure",  color: "#c1ffb1", metamodelRole: "external-active" },
  "Path":                      { layer: "Technology", aspect: "Active Structure",  color: "#c1ffb1", metamodelRole: "internal-active" },
  "Communication Network":     { layer: "Technology", aspect: "Active Structure",  color: "#c1ffb1", metamodelRole: "internal-active" },
  "Technology Function":       { layer: "Technology", aspect: "Behavior",          color: "#c1ffb1", metamodelRole: "internal-behavior" },
  "Technology Process":        { layer: "Technology", aspect: "Behavior",          color: "#c1ffb1", metamodelRole: "internal-behavior" },
  "Technology Interaction":    { layer: "Technology", aspect: "Behavior",          color: "#c1ffb1", metamodelRole: "internal-behavior" },
  "Technology Event":          { layer: "Technology", aspect: "Behavior",          color: "#c1ffb1", metamodelRole: "event" },
  "Technology Service":        { layer: "Technology", aspect: "Behavior",          color: "#c1ffb1", metamodelRole: "external-behavior" },
  "Artifact":                  { layer: "Technology", aspect: "Passive Structure", color: "#c1ffb1", metamodelRole: "passive" },
  // Equipment, Facility, … (ArchiMate §10.4) — same Technology layer as IT infrastructure in this app.
  "Equipment":           { layer: "Technology", aspect: "Active Structure",  color: "#c1ffb1", metamodelRole: "internal-active" },
  "Facility":            { layer: "Technology", aspect: "Active Structure",  color: "#c1ffb1", metamodelRole: "internal-active" },
  "Distribution Network":{ layer: "Technology", aspect: "Active Structure",  color: "#c1ffb1", metamodelRole: "internal-active" },
  "Material":            { layer: "Technology", aspect: "Passive Structure", color: "#c1ffb1", metamodelRole: "passive" },

  // ── Composite ──────────────────────────────────────────────────────────────
  "Location":             { layer: "Composite",      aspect: "Composite", color: "#e0e8f0", metamodelRole: "composite" },
  // "Grouping":          { layer: "Composite",      aspect: "Composite", color: "#f0f0f0", metamodelRole: "composite" },

  // ── Implementation & Migration ─────────────────────────────────────────────
  "Work Package":         { layer: "Implementation", aspect: "Behavior",          color: "#FCE4E4", metamodelRole: "implementation" },
  "Deliverable":          { layer: "Implementation", aspect: "Passive Structure",  color: "#FCE4E4", metamodelRole: "implementation" },
  "Implementation Event": { layer: "Implementation", aspect: "Behavior",          color: "#FCE4E4", metamodelRole: "implementation" },
  "Plateau":              { layer: "Implementation", aspect: "Composite",          color: "#FCE4E4", metamodelRole: "implementation" },
  "Gap":                  { layer: "Implementation", aspect: "Composite",          color: "#FCE4E4", metamodelRole: "implementation" },

};

/**
 * Canonical ArchiMate layer stack order (top → bottom in vertical diagrams): Motivation, Strategy,
 * Business, Application, Technology, … Lane tints and horizontal swimlane rows use this.
 * Vertical path diagrams stack nodes in extracted path order (first step at bottom, last at top;
 * see ui/renderer.js orderCompactVerticalSteps).
 */
const LAYERS = [
  { id: "Motivation",     label: "Motivation",                 color: "#dcdcff", borderColor: "#6b6bb8" },
  { id: "Strategy",       label: "Strategy",                   color: "#e8d4b8", borderColor: "#c07820" },
  { id: "Business",       label: "Business",                   color: "#f5e87a", borderColor: "#c0a000" },
  { id: "Application",    label: "Application",                color: "#BFFFFF", borderColor: "#1a1a1a" },
  { id: "Technology",     label: "Technology",                 color: "#c1ffb1", borderColor: "#1a6b28" },
  { id: "Composite",      label: "Composite",                  color: "#d0dce8", borderColor: "#406080" },
  { id: "Implementation", label: "Implementation & Migration", color: "#FCE4E4", borderColor: "#a02020" },
];

/**
 * Return the layer id for a given element name.
 * Falls back to "Unknown" if the element isn't registered.
 */
function getElementLayer(elementName) {
  const raw = ELEMENTS[elementName]?.layer ?? "Unknown";
  if (raw === "Physical") return "Technology";
  return raw;
}

/**
 * Return the metamodel role for a given element name.
 * Used by ui/metamodelDiagram.js to highlight the correct box and arrows.
 * Falls back to "composite" if the element isn't registered.
 */
function getMetamodelRole(elementName) {
  return ELEMENTS[elementName]?.metamodelRole ?? "composite";
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTUAL INFLUENCE — CANONICAL DIRECTION FOR PATHFINDING
// ─────────────────────────────────────────────────────────────────────────────
//
// Appendix B often lists Influence (N) in both directions between the same motivation
// elements. The matrix is correct for “what may be modeled”, but BFS pathfinding treats
// each row as a traversable arc — so the graph effectively had two opposite edges for
// the same relationship. Connect-set ordering could then pick Constraint → Meaning
// (same hop cost as Meaning → Constraint) and the walk no longer reads as one
// consistent directed chain.
//
// For mutual pairs with identical direct/derived/potential codes where the only direct code is N,
// we keep a single canonical arc: Motivation element order follows the ELEMENTS registry
// (top → bottom in the stack), except Meaning ↔ Constraint where Meaning → Constraint
// is kept (typical “upward” motivation link in layered views).
//
// Neighbor summaries and matrix.js are unchanged; only buildGraph() adjacency is filtered.

/**
 * @returns {Map<string, number>} Motivation element name → order index (ELEMENTS key order)
 */
function getMotivationOrderIndex() {
  const order = Object.create(null);
  let i = 0;
  for (const name of Object.keys(ELEMENTS)) {
    if (ELEMENTS[name]?.layer === "Motivation") order[name] = i++;
  }
  return order;
}

/**
 * For a mutual Influence-only pair (from,to), return the one directed edge to keep [cf, ct].
 */
function canonicalMutualInfluenceEdge(from, to, motivationOrder) {
  if (from === "Meaning" && to === "Constraint") return ["Meaning", "Constraint"];
  if (from === "Constraint" && to === "Meaning") return ["Meaning", "Constraint"];
  const oa = motivationOrder[from];
  const ob = motivationOrder[to];
  if (oa === undefined || ob === undefined) return null;
  return oa < ob ? [from, to] : [to, from];
}

/**
 * Set of "from|to" keys to omit from the pathfinding graph (reverse of canonical arc).
 */
function computeMutualInfluenceEdgeDrops() {
  const drops = new Set();
  const motivationOrder = getMotivationOrderIndex();
  const sig = (r) => JSON.stringify({ d: r.direct || [], der: r.derived || [], pdr: r.derivedPotential || [] });
  const byKey = new Map();
  for (const r of MATRIX) {
    byKey.set(`${r.from}|${r.to}`, r);
  }

  for (const r of MATRIX) {
    const { from, to, direct, derived, derivedPotential } = r;
    if (from === to) continue;
    if (!direct || direct.length !== 1 || direct[0] !== "N") continue;
    if ((derived || []).length > 0) continue;
    if ((derivedPotential || []).length > 0) continue;

    const rev = byKey.get(`${to}|${from}`);
    if (!rev) continue;
    if (sig(rev) !== sig(r)) continue;
    if (motivationOrder[from] === undefined || motivationOrder[to] === undefined) continue;

    const canon = canonicalMutualInfluenceEdge(from, to, motivationOrder);
    if (!canon) continue;
    const [cf, ct] = canon;
    if (from !== cf || to !== ct) drops.add(`${from}|${to}`);
  }
  return drops;
}

const MUTUAL_INFLUENCE_EDGE_DROPS = computeMutualInfluenceEdgeDrops();

// ─────────────────────────────────────────────────────────────────────────────
// GRAPH BUILDER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build an adjacency list (Map) from the MATRIX edge list.
 *
 * @param {object} options
 * @param {Set<string>|null} options.allowedElements
 *   If non-null, only elements in this set are included as nodes and targets.
 *   Used for viewpoint filtering. null = all elements allowed.
 * @param {boolean} options.includeDerived
 *   If true, derived (lowercase) edges are included in the graph.
 *   If false, only direct (uppercase) edges are traversable.
 * @param {boolean} [options.includeDerivedPotential=true]
 *   If true, include potential derivations (Appendix B.3) when includeDerived is enabled.
 * @param {boolean} [options.includeAssociationBridges=true]
 *   If true, add directed Association (O) arcs for every ordered pair of allowed nodes (§5.2.4 —
 *   always permitted; not listed per-cell in Appendix B). Pathfinder applies a penalty so matrix
 *   routes are preferred unless the user allows fallback.
 *
 * @returns {Map<string, EdgeList>}
 *   Map from element name → array of outgoing edges:
 *   [{ to, codes, isDirect, isDirected?, isAssociation? }, ...]
 *
 *   Each edge carries:
 *     to       — target element name
 *     codes    — array of relationship code strings (e.g. ["I","V"])
 *     isDirect — true if these are direct (uppercase) relationships
 *     isDirected — false for §5.2.4 Association bridges only; true for Appendix B arcs (tail→head)
 *     isAssociation — true for §5.2.4 universal Association edges only
 *
 *   A single matrix entry may yield TWO edges if it has both direct and derived
 *   relationships — the caller can choose which to prefer.
 */
function buildGraph({
  allowedElements = null,
  includeDerived = false,
  includeDerivedPotential = true,
  includeAssociationBridges = true,
} = {}) {
  const graph = new Map();

  /** Ensure a node exists in the graph */
  const ensureNode = (name) => {
    if (!graph.has(name)) graph.set(name, []);
  };

  // Register ALL known elements as nodes, even those with no matrix edges
  // (e.g. Location — reachable via §5.2.4 Association when bridges are on)
  for (const name of Object.keys(ELEMENTS)) {
    if (!allowedElements || allowedElements.has(name)) {
      ensureNode(name);
    }
  }

  for (const entry of MATRIX) {
    // Appendix B: one directed arc per record — tail `from` → head `to` only.
    const { from, to, direct, derived, derivedPotential = [] } = entry;

    if (EXCLUDED_APP_ELEMENTS.has(from) || EXCLUDED_APP_ELEMENTS.has(to)) continue;

    // Viewpoint filter: skip if either endpoint is outside allowed set
    if (allowedElements && (!allowedElements.has(from) || !allowedElements.has(to))) {
      continue;
    }

    ensureNode(from);
    ensureNode(to);

    // Add direct edge (omit reverse of canonical mutual Influence — see MUTUAL_INFLUENCE_EDGE_DROPS)
    if (direct.length > 0 && !MUTUAL_INFLUENCE_EDGE_DROPS.has(`${from}|${to}`)) {
      graph.get(from).push({ to, codes: direct, isDirect: true, isDirected: true, derivationTier: "direct" });
    }

    // Add derived edge (only if toggle is on)
    if (includeDerived && derived.length > 0) {
      graph.get(from).push({ to, codes: derived, isDirect: false, isDirected: true, derivationTier: "derived" });
    }

    if (includeDerived && includeDerivedPotential && derivedPotential.length > 0) {
      graph.get(from).push({
        to,
        codes: derivedPotential,
        isDirect: false,
        isPotentialDerived: true,
        isDirected: true,
        derivationTier: "potential",
      });
    }
  }

  // §5.2.4 Association is always allowed between any two elements; Appendix B does not repeat O per cell.
  if (includeAssociationBridges) {
    const nodes = [...graph.keys()];
    for (let i = 0; i < nodes.length; i++) {
      const from = nodes[i];
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const to = nodes[j];
        graph.get(from).push({
          to,
          codes: ["O"],
          isDirect: true,
          isAssociation: true,
          isDirected: false,
        });
      }
    }
  }

  return graph;
}

/**
 * Convenience: get all element names known to the graph (from ELEMENTS registry).
 * Optionally filtered to a set of allowed names.
 */
function getAllElements(allowedElements = null) {
  const names = Object.keys(ELEMENTS);
  return allowedElements
    ? names.filter(n => allowedElements.has(n))
    : names;
}

/**
 * Convenience: group elements by layer for the layer-tile picker.
 * Returns { layerId: [elementName, ...], ... }
 */
function getElementsByLayer(allowedElements = null) {
  const result = {};
  for (const layer of LAYERS) result[layer.id] = [];
  for (const [name, meta] of Object.entries(ELEMENTS)) {
    if (allowedElements && !allowedElements.has(name)) continue;
    if (result[meta.layer]) result[meta.layer].push(name);
  }
  return result;
}

/**
 * Summarize Appendix B matrix connectivity for one element (educational / UI).
 * Counts unique partner element types and relationship-code usage on matrix rows.
 * Association (O) is not encoded in MATRIX — callers should mention §5.2.4 separately.
 *
 * @param {string} elementName
 * @returns {{
 *   outgoing: {
 *     directPartnerCount: number,
 *     derivedPartnerCount: number,
 *     derivedOnlyPartnerCount: number,
 *     layersDirect: Record<string, number>,
 *     codesDirect: Record<string, number>,
 *     codesDerived: Record<string, number>,
 *     neighborRanks: Array<{ partner: string, layer: string, aspect: string, directCount: number, derivedCount: number, codesDirect: string[], codesDerived: string[] }>,
 *   },
 *   incoming: {
 *     directPartnerCount: number,
 *     derivedPartnerCount: number,
 *     derivedOnlyPartnerCount: number,
 *     layersDirect: Record<string, number>,
 *     codesDirect: Record<string, number>,
 *     codesDerived: Record<string, number>,
 *     neighborRanks: Array<{ partner: string, layer: string, aspect: string, directCount: number, derivedCount: number, codesDirect: string[], codesDerived: string[] }>,
 *   },
 * }}
 */
function rankMatrixNeighborRows(el, mode) {
  const rows = [];
  for (const row of MATRIX) {
    let partner = null;
    if (mode === "out") {
      if (row.from !== el) continue;
      partner = row.to;
    } else {
      if (row.to !== el) continue;
      partner = row.from;
    }
    if (EXCLUDED_APP_ELEMENTS.has(partner)) continue;
    const direct = row.direct || [];
    const derived = row.derived || [];
    const derivedPotential = row.derivedPotential || [];
    if (direct.length === 0) continue;
    const meta = ELEMENTS[partner] || {};
    rows.push({
      partner,
      layer: meta.layer || "Unknown",
      aspect: meta.aspect || "Unknown",
      directCount: direct.length,
      derivedCount: derived.length + derivedPotential.length,
      codesDirect: [...direct].map((c) => String(c).toUpperCase()).sort(),
      codesDerived: [...derived, ...derivedPotential].map((c) => String(c).toUpperCase()).sort(),
    });
  }
  rows.sort((a, b) =>
    b.directCount - a.directCount ||
    b.derivedCount - a.derivedCount ||
    a.partner.localeCompare(b.partner)
  );
  return rows;
}

function getMatrixConnectivitySummary(elementName) {
  const el = String(elementName || "").trim();

  const outD = new Set();
  const outDer = new Set();
  const outDerOnly = new Set();
  const codesOutD = Object.create(null);
  const codesOutDer = Object.create(null);

  const inD = new Set();
  const inDer = new Set();
  const inDerOnly = new Set();
  const codesInD = Object.create(null);
  const codesInDer = Object.create(null);

  const bump = (obj, code) => {
    const u = String(code).toUpperCase();
    obj[u] = (obj[u] || 0) + 1;
  };

  for (const row of MATRIX) {
    const { from, to, direct = [], derived = [], derivedPotential = [] } = row;
    if (EXCLUDED_APP_ELEMENTS.has(from) || EXCLUDED_APP_ELEMENTS.has(to)) continue;
    const hasD = direct.length > 0;
    const hasDer = derived.length + derivedPotential.length > 0;

    if (from === el) {
      if (hasD) {
        outD.add(to);
        for (const c of direct) bump(codesOutD, c);
      }
      if (hasDer) {
        outDer.add(to);
        if (!hasD) outDerOnly.add(to);
        for (const c of derived) bump(codesOutDer, c);
        for (const c of derivedPotential) bump(codesOutDer, c);
      }
    }
    if (to === el) {
      if (hasD) {
        inD.add(from);
        for (const c of direct) bump(codesInD, c);
      }
      if (hasDer) {
        inDer.add(from);
        if (!hasD) inDerOnly.add(from);
        for (const c of derived) bump(codesInDer, c);
        for (const c of derivedPotential) bump(codesInDer, c);
      }
    }
  }

  const layerCounts = (set) => {
    const o = Object.create(null);
    for (const n of set) {
      const L = ELEMENTS[n]?.layer || "Unknown";
      o[L] = (o[L] || 0) + 1;
    }
    return o;
  };

  return {
    outgoing: {
      directPartnerCount: outD.size,
      derivedPartnerCount: outDer.size,
      derivedOnlyPartnerCount: outDerOnly.size,
      layersDirect: layerCounts(outD),
      codesDirect: codesOutD,
      codesDerived: codesOutDer,
      neighborRanks: rankMatrixNeighborRows(el, "out").slice(0, 12),
    },
    incoming: {
      directPartnerCount: inD.size,
      derivedPartnerCount: inDer.size,
      derivedOnlyPartnerCount: inDerOnly.size,
      layersDirect: layerCounts(inD),
      codesDirect: codesInD,
      codesDerived: codesInDer,
      neighborRanks: rankMatrixNeighborRows(el, "in").slice(0, 12),
    },
  };
}
