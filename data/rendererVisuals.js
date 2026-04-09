// === data/rendererVisuals.js ===
/**
 * Visual/layout constants for ui/renderer.js: geometry, scaffold bands,
 * ArchiMate shape types, composite illustration patterns, per-element icon
 * SVG snippets, relationship arrow styles, and §4.2 metamodel diagram data.
 * Loaded after data/elements.js; before ui/renderer.js (see index.html).
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const EL_W   = 120;   
const EL_H   = 52;    
/** Space between element columns (compact + horizontal swimlanes “spread” layout). */
const EL_GAP = (window.RENDER_GEOMETRY && Number.isFinite(window.RENDER_GEOMETRY.EL_GAP))
  ? window.RENDER_GEOMETRY.EL_GAP
  : 96;
/** Tighter column gap for pathFlow “compact” (orthogonal L-routing between layers). */
const SWIMLANE_COMPACT_COL_GAP = 84;

/** Distance from connector line (cx) to the hop badge — minimal so labels hug the spine uniformly. */
const VERT_LABEL_GAP_FROM_LINE = 2;
/**
 * Vertical stroke (spine or outer bus at tx) to the nearest horizontal edge of the numbered badge circle:
 * keeps the relationship line from visually bisecting the badge when label anchors shift (nudge/stair).
 */
const SPINE_BADGE_CLEAR_FROM_LINE = 20;
/** Minimum gap between badge circle and relationship name for spine-aligned straddle (px). */
const SPINE_TEXT_GAP_AFTER_BADGE = 16;
/**
 * Same-column vertical: offset past cx so the label stack clears the main box (right edge = cx + EL_W/2).
 * Hops *into* a flanked composite (subs left/right) use a west straddle instead so notes sit left of the spine
 * and do not cover the right-hand illustration (see makeRelLabel verticalStraddleWest).
 */
const VERT_STRADDLE_PAST_MAIN = EL_W / 2;
/** Estimated max width (px) for wrapped relation name + badge so viewBox does not clip. */
const VERT_LABEL_TEXT_RESERVE = 190;
/** Hard cap (px) on vertical swim-lane column width — guardrail to prevent “horizontal figure” bleed. */
const MAX_VERTICAL_LANE_WIDTH = 350;
/** Minimal padding around spine + flanks when computing vertical lane width (px). */
const VERTICAL_LANE_CONTENT_PAD = 24;
/**
 * Extra safety buffer (px) around the furthest “content” element (boxes, relationship badges, label text)
 * so nothing visually kisses or clips against swimlane boundaries / viewBox edges.
 */
const LANE_CONTENT_PADDING = 30;
// Note: composite illustration visibility is controlled by UI state (see `state.showCompositeSubs`).
/** Vertical gap (px) between composite parent and its “above” corner sub in vertical layouts. */
const COMPOSITE_CORNER_V_GAP_VERTICAL = 40;
/**
 * Left strip for horizontal-band vertical swimlanes (narrower than {@link LANE_LABEL_W} — labels wrap).
 * Diagram xShift uses this + {@link LANE_CONTENT_GAP}.
 */
const VERTICAL_ROW_SWIMLANE_LABEL_W = 118;
/** Horizontal gap between hop number circle and relationship name (same visual group). */
const VERT_BADGE_NAME_GAP = 5;
/** Shorten vertical edges so relationship markers sit fully in the gap (clear of lane borders and box edges). */
const VERT_EDGE_INSET = 14;
/** When a hop’s default polyline pierces another path node, jog to a vertical bus outside all boxes (east or west). */
const OUTER_ROUTE_MARGIN = (window.RENDER_GEOMETRY && Number.isFinite(window.RENDER_GEOMETRY.OUTER_ROUTE_MARGIN))
  ? window.RENDER_GEOMETRY.OUTER_ROUTE_MARGIN
  : 8;
/**
 * Base distance from content bounds to the first outer bypass track (px).
 * Ensures a clear orthogonal “return leg” into side ports (readable open arrowheads).
 */
const OUTER_ROUTE_BASE_GAP = (window.RENDER_GEOMETRY && Number.isFinite(window.RENDER_GEOMETRY.OUTER_ROUTE_BASE_GAP))
  ? window.RENDER_GEOMETRY.OUTER_ROUTE_BASE_GAP
  : 40;
/** Keep labels off the top-right glyph and 3D “roof”; must match text layout in drawStandardElement. */
const SAFE_TEXT_RIGHT_TRIM = 24;
const SAFE_TEXT_TOP_TRIM = 12;
/** Horizontal depth of the cube front face (must match drawShape `cube` case). */
const SHAPE_CUBE_DEPTH = 10;
/** Parallel bypass tracks when multiple hops share the same side (px). */
const OUTER_ROUTE_STAGGER_PX = 20;

const SVG_NS = "http://www.w3.org/2000/svg";
const ICON_BADGE_SIZE = 14;
const ICON_GLYPH_SIZE = 12;
const ICON_PAD = 3;
// Nudge the top-right corner glyph so it doesn't intersect the shape border.
// (Positive X nudges left; positive Y nudges down.)
const CORNER_GLYPH_NUDGE_X = 2;
const CORNER_GLYPH_NUDGE_Y = 2;
/** Must match `drawShape` / mini-SVG `document` case fold (px). */
const DOCUMENT_SHAPE_FOLD = 12;
/**
 * Extra inset for the corner glyph on document (folded-corner) shapes so it clears the diagonal
 * and top edge; paired with a small downward shift so the badge sits in the rectangular area.
 */
const DOCUMENT_ICON_INSET_X = 6;
const DOCUMENT_ICON_INSET_Y = 2;

const MIN_VERTICAL_LANE_CLEARANCE = Math.ceil(1.5 * EL_H);
const LANE_H_MIN  = Math.max(90, MIN_VERTICAL_LANE_CLEARANCE);   // Minimum swimlane row height; taller when a step uses a composite stack
const LANE_LABEL_W = 160;
/** Horizontal gap between the lane label strip and the diagram content (vertical swimlanes). */
const LANE_CONTENT_GAP = 12;
/**
 * Single-column vertical: tight left edge + room east of the connector for hop badge + relationship
 * name (see makeRelLabel verticalStraddle; ~max 170px text + badge + gaps from column center).
 */
const VERT_COL_LEFT_PAD = 8;
/** Minimum space right of the connector column for hop badge + relation name (tight single-column). */
const VERT_COL_RIGHT_PAD = 148;
/** Left inset for wide collaboration rows (subs + main); diagram is left-aligned, not centered in viewBox. */
const VERT_WIDE_LEFT_PAD = 8;
const LANE_LABEL_PAD_X = 10;
const LANE_LABEL_PAD_Y = 8;
const LANE_LABEL_MAX_LINES = 3;

const REL_LABEL_MAX_CHARS = 18;
const REL_LABEL_MAX_LINES = 2;

const SCAFFOLD_BANDS = [
  { id: "top", label: "Motivation & Strategy", color: "#e4d9f3", borderColor: "#7b57b2" },
  { id: "midUpper", label: "Business", color: "#f5e87a", borderColor: "#c0a000" },
  { id: "midLower", label: "Application", color: "#a8d4a8", borderColor: "#208020" },
  { id: "bottom", label: "Technology & Physical", color: "#b9d2e8", borderColor: "#2f5f90" },
];


// ─────────────────────────────────────────────────────────────────────────────
// SHAPE DEFINITIONS
// Each entry describes how to draw the element's base shape.
// type: rect | rounded | parallelogram | ellipse | cloud | chevron | cube | document | dashed
// ─────────────────────────────────────────────────────────────────────────────

const SHAPES = {
  // Motivation
  "Stakeholder": { type: "beveled" },
  "Driver":      { type: "beveled" },
  "Assessment":  { type: "beveled" },
  "Goal":        { type: "beveled" },
  "Outcome":     { type: "beveled" },
  "Principle":   { type: "beveled" },
  "Requirement": { type: "beveled" },
  "Constraint":  { type: "beveled" },
  "Meaning":     { type: "beveled" },
  "Value":       { type: "ellipse" },
  
  // Strategy
  "Resource":       { type: "rounded" },
  "Capability":     { type: "rounded" },
  "Value Stream":   { type: "chevron" },
  "Course of Action": { type: "rounded" },
  // Business
  "Business Actor":         { type: "rounded" },
  "Business Role":          { type: "rounded" },
  "Business Collaboration": { type: "rounded" },
  "Business Interface":     { type: "rounded" },
  "Business Process":       { type: "rounded-arrow" },
  "Business Function":      { type: "rounded" },
  "Business Interaction":   { type: "rounded" },
  "Business Event":         { type: "chevron" },
  "Business Service":       { type: "rounded" },
  "Business Object":        { type: "rect" },
  "Contract":               { type: "rect" },
  "Representation":         { type: "rect" },
  "Product":                { type: "rounded" },
  // Application
  "Application Component":     { type: "rounded" },
  "Application Collaboration": { type: "rounded" },
  "Application Interface":     { type: "rounded" },
  "Application Function":      { type: "rounded" },
  "Application Interaction":   { type: "rounded" },
  "Application Process":       { type: "rounded-arrow" },
  "Application Event":         { type: "chevron" },
  "Application Service":       { type: "rounded" },
  "Data Object":               { type: "rect" },
  // Technology
  "Node":                     { type: "cube" },
  "Device":                   { type: "cube" },
  "System Software":          { type: "rounded" },
  "Technology Collaboration": { type: "rounded" },
  "Technology Interface":     { type: "rounded" },
  "Path":                     { type: "rounded" },
  "Communication Network":    { type: "rounded" },
  "Technology Function":      { type: "rounded" },
  "Technology Process":       { type: "rounded-arrow" },
  "Technology Interaction":   { type: "rounded" },
  "Technology Event":         { type: "chevron" },
  "Technology Service":       { type: "rounded" },
  "Technology Object":        { type: "rect" },
  "Artifact":                 { type: "document" },
  // Physical
  "Equipment":           { type: "cube" },
  "Facility":            { type: "cube" },
  "Distribution Network":{ type: "rounded" },
  "Material":            { type: "rounded" },
  // Implementation
  "Work Package":         { type: "rounded" },
  "Deliverable":          { type: "document" },
  "Implementation Event": { type: "chevron" },
  "Plateau":              { type: "plateau" },
  "Gap":                  { type: "rect" },
  // Composite
  "Location":  { type: "rect" },
  "Grouping":  { type: "dashed" },
};


const COMPOSITE_PATTERNS = {
  /**
   * Illustration-only: we always draw two flanking/stacked parts; `subCandidates` lists plausible part types.
   * When there are more than two candidates, a "⋯" hint is shown (layout stays two-wide; see plan).
   */
  "Path": {
    sub: "Node",
    subCandidates: ["Node", "Device", "System Software"],
    rel: "G",
    label: "aggregates",
    subsSideBySide: true,
  },
  "Communication Network": {
    sub: "Node",
    subCandidates: ["Node", "Device", "System Software", "Path"],
    rel: "G",
    label: "aggregates",
    subsSideBySide: true,
  },
  "Business Collaboration": {
    sub: "Business Role",
    subCandidates: ["Business Role", "Business Actor", "Business Interface"],
    rel: "G",
    label: "aggregates",
    subsSideBySide: true,
  },
  "Application Collaboration": {
    sub: "Application Component",
    subCandidates: ["Application Component", "Application Interface"],
    rel: "G",
    label: "aggregates",
    subsSideBySide: true,
  },
  "Technology Collaboration": {
    sub: "Node",
    subCandidates: ["Node", "Device", "System Software", "Technology Interface"],
    rel: "G",
    label: "aggregates",
    subsSideBySide: true,
  },
};

/**
 * Ensures composite illustration metadata is coherent: collaborations aggregate internal active
 * structure (roles, components, nodes, interfaces), not other collaborations; Path does not nest
 * other illustrated composites; Communication Network may reference Path (network of paths) but
 * not itself or collaboration illustrations.
 * @returns {string[]} human-readable error messages (empty when valid)
 */
function validateCompositePatterns() {
  const errors = [];
  const keys = Object.keys(COMPOSITE_PATTERNS);
  const keySet = new Set(keys);

  function isCollaborationName(name) {
    return typeof name === "string" && name.endsWith(" Collaboration");
  }

  function candidatesFor(pattern) {
    if (Array.isArray(pattern.subCandidates) && pattern.subCandidates.length) return pattern.subCandidates.slice();
    return pattern.sub ? [pattern.sub] : [];
  }

  for (const parent of keys) {
    const p = COMPOSITE_PATTERNS[parent];
    const candidates = candidatesFor(p);

    if (isCollaborationName(parent)) {
      for (const c of candidates) {
        if (isCollaborationName(c)) {
          errors.push(
            `COMPOSITE_PATTERNS["${parent}"]: illustration sub "${c}" must not be a collaboration (collaborations aggregate roles/components/nodes, not other collaborations).`
          );
        }
      }
    }

    if (parent === "Path") {
      for (const c of candidates) {
        if (keySet.has(c)) {
          errors.push(
            `COMPOSITE_PATTERNS["Path"]: illustration sub "${c}" must not be another composite illustration key (${keys.join(", ")}).`
          );
        }
      }
    }

    if (parent === "Communication Network") {
      for (const c of candidates) {
        if (keySet.has(c) && c !== "Path") {
          errors.push(
            `COMPOSITE_PATTERNS["Communication Network"]: illustration sub "${c}" is invalid — only "Path" may appear among composite-pattern keys (network aggregates paths; it must not nest itself or collaboration illustrations).`
          );
        }
      }
    }
  }

  return errors;
}

(function runCompositePatternValidation() {
  const errs = validateCompositePatterns();
  if (!errs.length) return;
  if (typeof console !== "undefined" && console.error) {
    for (const e of errs) console.error("[rendererVisuals]", e);
  }
})();

// Composite stack / flank geometry (must match drawElement layout in renderer).
/** Must match drawElement composite layout (sub-elements above/below main box, or side-by-side). */
const COMPOSITE_V_OFF = 85;
/** Horizontal gap between main collaboration box and flanking sub elements (horizontal compact). */
const COMPOSITE_H_GAP = 14;
/** Wider gap in vertical layout so aggregation segments to subs stay visible beside the main box. */
const COMPOSITE_H_GAP_VERTICAL = 60;
/** Vertical gap between the main box and the "above" sub-element in vertical compact (corner composite layout). */
const COMPOSITE_V_GAP_VERTICAL = Math.max(40, COMPOSITE_CORNER_V_GAP_VERTICAL);

// ─────────────────────────────────────────────────────────────────────────────
// ICON PATHS (SVG path data, scaled to ~12×12, origin top-left of icon area)
// Each function returns an SVG path 'd' string or SVG element string.
// ─────────────────────────────────────────────────────────────────────────────

const ICONS = {
  "Stakeholder": () => `<path d="M5,2 L11,2 L11,10 L5,10 Z" stroke="currentColor" fill="none" stroke-width="1.2"/><path d="M5,2 A4,4 0 0,0 5,10" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Driver": () => `<circle cx="6" cy="6" r="5" stroke="currentColor" fill="none" stroke-width="1.2"/><path d="M6,1 L6,3 M6,9 L6,11 M1,6 L3,6 M9,6 L11,6 M2.5,2.5 L4,4 M8,8 L9.5,9.5 M2.5,9.5 L4,8 M8,4 L9.5,2.5" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Assessment": () => `<circle cx="5" cy="5" r="4.5" stroke="currentColor" fill="none" stroke-width="1.2"/><line x1="8.5" y1="8.5" x2="11.5" y2="11.5" stroke="currentColor" stroke-width="1.5"/>`,
  "Goal": () => `<circle cx="6" cy="6" r="5" stroke="currentColor" fill="none" stroke-width="1.2"/><circle cx="6" cy="6" r="2.5" stroke="currentColor" fill="none" stroke-width="1.2"/><circle cx="6" cy="6" r="0.8" fill="currentColor" stroke="none"/>`,
  "Outcome": () => `<circle cx="6" cy="6" r="5" stroke="currentColor" fill="none" stroke-width="1.2"/><circle cx="6" cy="6" r="2.5" stroke="currentColor" fill="none" stroke-width="1.2"/><circle cx="6" cy="6" r="0.8" fill="currentColor" stroke="none"/><path d="M12,6 L6.5,6 L8,4.5 M6.5,6 L8,7.5" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Principle": () => `<rect x="1" y="1" width="10" height="10" rx="1" stroke="currentColor" fill="none" stroke-width="1.2"/><text x="6" y="9" text-anchor="middle" font-size="8" font-family="sans-serif" font-weight="bold" fill="currentColor" stroke="none">!</text>`,
  "Requirement": () => `<path d="M2,2 L10,2 L11,10 L3,10 Z" stroke="currentColor" fill="none" stroke-width="1.1"/><line x1="3.5" y1="5" x2="9" y2="5" stroke="currentColor" stroke-width="1.1"/><line x1="3.5" y1="8" x2="8" y2="8" stroke="currentColor" stroke-width="1.1"/>`,
  "Constraint": () => `<path d="M2,2 L10,2 L11,10 L3,10 L2.5,8 L1,8 L1,4 L2.5,4 L2,2 Z" stroke="currentColor" fill="none" stroke-width="1.1"/><path d="M3.5,4 L9,9.5 M4.5,2 L10.5,8 M6.5,2 L11,6.5 M1.5,6 L4,8.5" stroke="currentColor" fill="none" stroke-width="0.8"/>`,
  "Meaning": () => `<path d="M 6 1.5 C 4 1.5 2.5 2.5 2.5 4.5 C 1.5 4.5 1 5.5 1.5 6.5 C 1.2 7.5 2.2 8.5 3.5 8.5 C 4 9.2 8 9.2 10 8 C 11 7.5 11.5 5.5 10.5 4.5 C 10.5 2.5 8 1.5 6 1.5 Z" stroke="currentColor" fill="none" stroke-width="1.15" stroke-linejoin="round"/><circle cx="3" cy="10.5" r="0.75" fill="currentColor"/><circle cx="1.4" cy="11.5" r="0.55" fill="currentColor"/>`,
  "Value": () => `<ellipse cx="6" cy="6" rx="5" ry="3.5" stroke="currentColor" fill="none" stroke-width="1.2"/>`,

  "Resource":       () => `<rect x="1" y="3" width="10" height="7" rx="1" stroke="currentColor" fill="none" stroke-width="1.2"/><rect x="3" y="1" width="6" height="3" rx="1" stroke="currentColor" fill="none" stroke-width="1.1"/>`,
  "Capability":     () => `<rect x="1" y="1" width="4" height="4" stroke="currentColor" fill="none" stroke-width="1.1"/><rect x="7" y="1" width="4" height="4" stroke="currentColor" fill="none" stroke-width="1.1"/><rect x="1" y="7" width="4" height="4" stroke="currentColor" fill="none" stroke-width="1.1"/><rect x="7" y="7" width="4" height="4" stroke="currentColor" fill="none" stroke-width="1.1"/>`,
  "Value Stream":   () => `<path d="M1,6 L3,3 L9,3 L11,6 L9,9 L3,9 Z" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Course of Action": () => `<circle cx="6" cy="6" r="5" stroke="currentColor" fill="none" stroke-width="1.2"/><path d="M4,4 C4,4 8,4 8,6 C8,8 4,8 4,8" stroke="currentColor" fill="none" stroke-width="1.1"/><line x1="4" y1="6" x2="8" y2="6" stroke="currentColor" stroke-width="1.1"/>`,

  "Business Actor":         () => `<circle cx="6" cy="3.5" r="2.5" stroke="currentColor" fill="none" stroke-width="1.2"/><path d="M2,11 C2,7.5 10,7.5 10,11" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Business Role":          () => `<path d="M1,11 L1,9 C1,6 11,6 11,9 L11,11" stroke="currentColor" fill="none" stroke-width="1.2"/><circle cx="6" cy="4" r="3" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Business Collaboration": () => `<circle cx="4" cy="6" r="3" stroke="currentColor" fill="none" stroke-width="1.2"/><circle cx="8" cy="6" r="3" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Business Interface":     () => `<line x1="2" y1="6" x2="8" y2="6" stroke="currentColor" stroke-width="1.2"/><circle cx="10" cy="6" r="2" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Business Process":       () => `<path d="M1,3 L8,3 L11,6 L8,9 L1,9 Z" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Business Function":      () => `<path d="M2,1 L10,1 L10,11 L2,11 Z M2,4 C4,4 8,4 10,4" stroke="currentColor" fill="none" stroke-width="1.1"/>`,
  "Business Interaction":   () => `<line x1="1" y1="6" x2="5" y2="6" stroke="currentColor" stroke-width="1.2"/><circle cx="7.5" cy="6" r="2.5" stroke="currentColor" fill="none" stroke-width="1.2"/><line x1="10" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.2"/>`,
  "Business Event":         () => `<path d="M1,4 L7,4 L11,6 L7,8 L1,8 Z" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Business Service":       () => `<line x1="2" y1="6" x2="8" y2="6" stroke="currentColor" stroke-width="1.2"/><circle cx="10" cy="6" r="2" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Business Object":        () => `<rect x="1" y="3" width="10" height="8" stroke="currentColor" fill="none" stroke-width="1.1"/><line x1="1" y1="5" x2="11" y2="5" stroke="currentColor" stroke-width="1.1"/>`,
  "Contract":               () => `<path d="M2,1 L10,1 L10,11 L2,11 Z M4,4 L8,4 M4,6 L8,6 M4,8 L7,8" stroke="currentColor" fill="none" stroke-width="1.1"/>`,
  "Representation":         () => `<rect x="1" y="2" width="10" height="8" stroke="currentColor" fill="none" stroke-width="1.1"/><line x1="3" y1="5" x2="9" y2="5" stroke="currentColor" stroke-width="1"/><line x1="3" y1="7" x2="8" y2="7" stroke="currentColor" stroke-width="1"/>`,
  "Product":                () => `<rect x="1" y="1" width="10" height="10" stroke="currentColor" fill="none" stroke-width="1.1"/><line x1="1" y1="5" x2="11" y2="5" stroke="currentColor" stroke-width="1.2"/>`,

  "Application Component":     () => `<rect x="2" y="2" width="8" height="9" stroke="currentColor" fill="none" stroke-width="1.1"/><rect x="0" y="3.5" width="4" height="2.5" stroke="currentColor" fill="white" stroke-width="1"/><rect x="0" y="7" width="4" height="2.5" stroke="currentColor" fill="white" stroke-width="1"/>`,
  "Application Collaboration": () => `<circle cx="4" cy="6" r="3" stroke="currentColor" fill="none" stroke-width="1.2"/><circle cx="8" cy="6" r="3" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Application Interface":     () => `<line x1="2" y1="6" x2="8" y2="6" stroke="currentColor" stroke-width="1.2"/><circle cx="10" cy="6" r="2" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Application Function":      () => `<path d="M3,2 L3,10 M3,6 L9,6 M9,2 L9,10" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Application Interaction":   () => `<line x1="1" y1="6" x2="5" y2="6" stroke="currentColor" stroke-width="1.2"/><circle cx="7.5" cy="6" r="2.5" stroke="currentColor" fill="none" stroke-width="1.2"/><line x1="10" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.2"/>`,
  "Application Process":       () => `<path d="M1,3 L8,3 L11,6 L8,9 L1,9 Z" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Application Event":         () => `<path d="M1,4 L7,4 L11,6 L7,8 L1,8 Z" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Application Service":       () => `<line x1="2" y1="6" x2="8" y2="6" stroke="currentColor" stroke-width="1.2"/><circle cx="10" cy="6" r="2" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Data Object":               () => `<rect x="1" y="2" width="10" height="9" stroke="currentColor" fill="none" stroke-width="1.1"/><line x1="1" y1="5" x2="11" y2="5" stroke="currentColor" stroke-width="1.1"/>`,

  "Node":                     () => `<path d="M2,9 L2,3 L8,1 L10,3 L10,9 L4,11 Z M2,3 L4,5 L10,3 M4,5 L4,11" stroke="currentColor" fill="none" stroke-width="1.1"/>`,
  "Device":                   () => `<path d="M2,9 L2,3 L8,1 L10,3 L10,9 L4,11 Z M2,3 L4,5 L10,3 M4,5 L4,11" stroke="currentColor" fill="none" stroke-width="1.1"/><rect x="3" y="6" width="4" height="3" stroke="currentColor" fill="none" stroke-width="0.9"/>`,
  "System Software":          () => `<circle cx="6" cy="6" r="5" stroke="currentColor" fill="none" stroke-width="1.2"/><circle cx="6" cy="6" r="2" stroke="currentColor" fill="none" stroke-width="1"/>`,
  "Technology Collaboration": () => `<circle cx="4" cy="6" r="3" stroke="currentColor" fill="none" stroke-width="1.2"/><circle cx="8" cy="6" r="3" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Technology Interface":     () => `<line x1="2" y1="6" x2="8" y2="6" stroke="currentColor" stroke-width="1.2"/><circle cx="10" cy="6" r="2" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Path":                     () => `<line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.4"/><path d="M8,3 L11,6 L8,9" stroke="currentColor" fill="none" stroke-width="1.2"/><path d="M4,3 L1,6 L4,9" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Communication Network":    () => `<circle cx="6" cy="6" r="2" stroke="currentColor" fill="none" stroke-width="1.1"/><line x1="6" y1="1" x2="6" y2="4" stroke="currentColor" stroke-width="1"/><line x1="6" y1="8" x2="6" y2="11" stroke="currentColor" stroke-width="1"/><line x1="1" y1="6" x2="4" y2="6" stroke="currentColor" stroke-width="1"/><line x1="8" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1"/>`,
  "Technology Function":      () => `<path d="M2,1 L2,11 M2,6 L8,6 M8,1 L8,11" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Technology Process":       () => `<path d="M1,3 L8,3 L11,6 L8,9 L1,9 Z" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Technology Interaction":   () => `<line x1="1" y1="6" x2="5" y2="6" stroke="currentColor" stroke-width="1.2"/><circle cx="7.5" cy="6" r="2.5" stroke="currentColor" fill="none" stroke-width="1.2"/><line x1="10" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.2"/>`,
  "Technology Event":         () => `<path d="M1,4 L7,4 L11,6 L7,8 L1,8 Z" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Technology Service":       () => `<line x1="2" y1="6" x2="8" y2="6" stroke="currentColor" stroke-width="1.2"/><circle cx="10" cy="6" r="2" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Technology Object":        () => `<rect x="1" y="2" width="10" height="9" stroke="currentColor" fill="none" stroke-width="1.1"/><line x1="1" y1="5" x2="11" y2="5" stroke="currentColor" stroke-width="1.1"/>`,
  "Artifact":                 () => `<path d="M2,1 L8,1 L11,4 L11,11 L2,11 Z M8,1 L8,4 L11,4" stroke="currentColor" fill="none" stroke-width="1.1"/>`,

  "Equipment":           () => `<circle cx="6" cy="6" r="4" stroke="currentColor" fill="none" stroke-width="1.1"/><path d="M6,2 L6,4 M6,8 L6,10 M2,6 L4,6 M8,6 L10,6" stroke="currentColor" stroke-width="1.1"/><circle cx="6" cy="6" r="1.5" stroke="currentColor" fill="none" stroke-width="1"/>`,
  "Facility":            () => `<path d="M2,9 L2,3 L8,1 L10,3 L10,9 L4,11 Z M2,3 L4,5 L10,3 M4,5 L4,11 M4,7 L8,7 M4,9 L8,9" stroke="currentColor" fill="none" stroke-width="1.1"/>`,
  "Distribution Network":() => `<line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.4"/><path d="M8,3 L11,6 L8,9" stroke="currentColor" fill="none" stroke-width="1.2"/><path d="M4,3 L1,6 L4,9" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Material":            () => `<path d="M3,9 L3,5 L9,3 L9,7 Z M3,9 L9,7 M3,5 L9,3" stroke="currentColor" fill="none" stroke-width="1.1"/>`,

  "Work Package":         () => `<rect x="1" y="3" width="10" height="7" stroke="currentColor" fill="none" stroke-width="1.1"/><line x1="1" y1="5" x2="11" y2="5" stroke="currentColor" stroke-width="1"/>`,
  "Deliverable":          () => `<path d="M2,1 L8,1 L11,4 L11,11 L2,11 Z M8,1 L8,4 L11,4" stroke="currentColor" fill="none" stroke-width="1.1"/>`,
  "Implementation Event": () => `<path d="M1,4 L7,4 L11,6 L7,8 L1,8 Z" stroke="currentColor" fill="none" stroke-width="1.2"/>`,
  "Plateau":              () => `<rect x="1" y="2" width="10" height="8" stroke="currentColor" fill="none" stroke-width="1.1"/><line x1="2" y1="11" x2="11" y2="11" stroke="currentColor" stroke-width="1"/><line x1="3" y1="12.5" x2="11" y2="12.5" stroke="currentColor" stroke-width="1"/>`,
  "Gap":                  () => `<rect x="1" y="1" width="10" height="10" stroke="currentColor" fill="none" stroke-width="1.1" stroke-dasharray="2,2"/>`,

  "Location":  () => `<path d="M6,1 C3.5,1 1.5,3 1.5,5.5 C1.5,8.5 6,12 6,12 C6,12 10.5,8.5 10.5,5.5 C10.5,3 8.5,1 6,1 Z" stroke="currentColor" fill="none" stroke-width="1.1"/><circle cx="6" cy="5.5" r="1.5" stroke="currentColor" fill="none" stroke-width="1"/>`,
  "Grouping":  () => `<rect x="1" y="1" width="10" height="10" stroke="currentColor" fill="none" stroke-width="1.1" stroke-dasharray="3,2"/>`,
};

// ─────────────────────────────────────────────────────────────────────────────
// RELATIONSHIP ARROW DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

const ARROW_STYLES = {
  C: { line: "solid",  startMarker: "diamond-filled", endMarker: "none" },
  G: { line: "solid",  startMarker: "diamond-open",   endMarker: "none" },
  I: { line: "solid",  startMarker: "circle-filled",  endMarker: "arrow-filled" },
  R: { line: "dashed", startMarker: "none",           endMarker: "triangle-open" }, 
  V: { line: "solid",  startMarker: "none",           endMarker: "arrow-open" },
  A: { line: "dashed", startMarker: "none",           endMarker: "arrow-open" },
  N: { line: "dashed", startMarker: "none",           endMarker: "arrow-open" },
  O: { line: "solid",  startMarker: "none",           endMarker: "none" },
  T: { line: "solid",  startMarker: "none",           endMarker: "arrow-filled" },
  F: { line: "dashed", startMarker: "none",           endMarker: "arrow-filled" },
  S: { line: "solid",  startMarker: "none",           endMarker: "triangle-open" },
};

// ─────────────────────────────────────────────────────────────────────────────
// §4.2 metamodel diagram (renderMetamodelDiagram in ui/renderer.js)
// ─────────────────────────────────────────────────────────────────────────────

const W = 680;   // total SVG width
const H = 520;   // total SVG height (extra space for element names below boxes)

const BOXES = {
  "external-behavior": {
    id: "box-ext-behavior",
    x: 220, y: 40, w: 180, h: 80,
    label: ["External Behavior Element", "(Service)"],
    italic: true,
  },
  "external-active": {
    id: "box-ext-active",
    x: 460, y: 40, w: 180, h: 80,
    label: ["External Active Structure", "Element (Interface)"],
    italic: true,
  },
  "passive": {
    id: "box-passive",
    x: 20, y: 160, w: 160, h: 80,
    label: ["Passive Structure", "Element"],
    italic: true,
  },
  "internal-behavior": {
    id: "box-int-behavior",
    x: 220, y: 200, w: 180, h: 80,
    label: ["Internal Behavior", "Element"],
    italic: true,
  },
  "internal-active": {
    id: "box-int-active",
    x: 460, y: 200, w: 180, h: 80,
    label: ["Internal Active Structure", "Element"],
    italic: true,
  },
  "event": {
    id: "box-event",
    x: 220, y: 360, w: 180, h: 80,
    label: ["Event"],
    italic: true,
  },
};

const ARROWS = [
  {
    id: "arr-extbeh-extact",
    roles: ["external-behavior", "external-active"],
    label: "assigned to",
    path: `M460,80 L400,80`,
    labelX: 428, labelY: 70,
    markerEnd: "arrow", markerStart: "none",
  },
  {
    id: "arr-extact-extbeh",
    roles: ["external-active", "external-behavior"],
    label: "serves",
    path: `M460,100 L400,100`,
    labelX: 424, labelY: 115,
    markerEnd: "none", markerStart: "none",
    bidirectional: false,
    customPath: `M460,95 L400,95`,
    belowLabel: true,
  },
  {
    id: "arr-extact-intact",
    roles: ["external-active", "internal-active"],
    label: "composed of",
    path: `M550,120 L550,200`,
    labelX: 558, labelY: 165,
    markerEnd: "arrow", markerStart: "none",
  },
  {
    id: "arr-intact-extact",
    roles: ["internal-active", "external-active"],
    label: "serves",
    path: `M530,200 L530,120`,
    labelX: 486, labelY: 165,
    markerEnd: "arrow", markerStart: "none",
  },
  {
    id: "arr-intact-intbeh",
    roles: ["internal-active", "internal-behavior"],
    label: "assigned to",
    path: `M460,240 L400,240`,
    labelX: 408, labelY: 258,
    markerEnd: "arrow", markerStart: "none",
  },
  {
    id: "arr-intbeh-extbeh",
    roles: ["internal-behavior", "external-behavior"],
    label: "realizes",
    path: `M310,200 L310,120`,
    labelX: 284, labelY: 160,
    markerEnd: "arrow", markerStart: "none",
  },
  {
    id: "arr-extbeh-intact",
    roles: ["external-behavior", "internal-active"],
    label: "serves",
    path: `M400,90 Q440,90 440,200`,
    labelX: 448, labelY: 140,
    markerEnd: "arrow", markerStart: "none",
  },
  // Forward counterpart to “serves” above (e.g. Business Role → Business Service = Assignment in §4.2).
  {
    id: "arr-intact-extbeh",
    roles: ["internal-active", "external-behavior"],
    label: "assigned to",
    path: `M550,200 Q380,150 310,120`,
    labelX: 412, labelY: 168,
    markerEnd: "arrow", markerStart: "none",
  },
  {
    id: "arr-intbeh-passive",
    roles: ["internal-behavior", "passive"],
    label: "accesses",
    path: `M220,240 L180,240 L180,200`,
    labelX: 130, labelY: 228,
    markerEnd: "arrow", markerStart: "none",
  },
  {
    id: "arr-extbeh-passive",
    roles: ["external-behavior", "passive"],
    label: "accesses",
    path: `M220,80 L100,80 L100,160`,
    labelX: 50, labelY: 115,
    markerEnd: "arrow", markerStart: "none",
  },
  {
    id: "arr-intbeh-self",
    roles: ["internal-behavior", "internal-behavior"],
    label: "triggers / flows to",
    path: `M260,200 C220,180 200,220 240,230 L260,230`,
    labelX: 148, labelY: 230,
    markerEnd: "arrow", markerStart: "none",
  },
  {
    id: "arr-extbeh-self",
    roles: ["external-behavior", "external-behavior"],
    label: "triggers / flows to",
    path: `M300,40 C260,20 240,60 270,70 L290,70`,
    labelX: 330, labelY: 34,
    markerEnd: "arrow", markerStart: "none",
  },
  {
    id: "arr-intbeh-extbeh-agg",
    roles: ["internal-behavior", "external-behavior"],
    label: "aggregates /\ncomposed of",
    path: `M330,200 L330,120`,
    labelX: 356, labelY: 168,
    markerEnd: "diamond", markerStart: "none",
  },
  {
    id: "arr-extbeh-passive-tf",
    roles: ["external-behavior", "passive"],
    label: "triggers /\nflows to",
    path: `M220,70 L100,70 L100,160`,
    labelX: 42, labelY: 108,
    markerEnd: "arrow", markerStart: "none",
  },
  {
    id: "arr-event-intbeh",
    roles: ["event", "internal-behavior"],
    label: "triggers / flows to",
    path: `M310,360 L310,280`,
    labelX: 318, labelY: 325,
    markerEnd: "arrow", markerStart: "none",
  },
  {
    id: "arr-intbeh-event",
    roles: ["internal-behavior", "event"],
    label: "triggers / flows to",
    path: `M290,280 L290,360`,
    labelX: 220, labelY: 325,
    markerEnd: "arrow", markerStart: "none",
  },
  {
    id: "arr-event-self",
    roles: ["event", "event"],
    label: "triggers / flows to",
    path: `M300,440 C260,460 240,420 270,410 L290,410`,
    labelX: 290, labelY: 470,
    markerEnd: "arrow", markerStart: "none",
  },
  {
    id: "arr-intact-event",
    roles: ["internal-active", "event"],
    label: "assigned to",
    path: `M460,280 L460,340 L400,400`,
    labelX: 448, labelY: 320,
    markerEnd: "arrow", markerStart: "none",
  },
  {
    id: "arr-passive-event",
    roles: ["passive", "event"],
    label: "triggers / flows to",
    path: `M100,240 L100,400 L220,400`,
    labelX: 42, labelY: 330,
    markerEnd: "arrow", markerStart: "none",
  },
];

const COLORS = {
  boxFill:        "#ffffff",
  boxStroke:      "#111111",
  boxStrokeW:     2,
  arrowStroke:    "#333333",
  arrowStrokeW:   1.5,
  labelFill:      "#333333",
  labelFont:      "11px 'Georgia', serif",
  validFill:      "#6ee7b7",
  validStroke:    "#047857",
  invalidFill:    "#ffd4d4",
  invalidStroke:  "#cc1111",
  validArrow:     "#1a8a1a",
  invalidArrow:   "#cc1111",
  neutralArrow:   "#cccccc",
};
