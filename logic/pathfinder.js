// === logic/pathfinder.js ===
/**
 * logic/pathfinder.js
 * ArchiTrek — Weighted pathfinder (UCS + §5.2.4 Association)
 *
 * Finds valid relationship paths between ArchiMate elements.
 * Supports:
 *   - Two-endpoint queries (start → end)
 *   - Multi-waypoint queries (start → mid1 → mid2 → ... → end)
 *   - Direct-only or direct+derived traversal
 *   - Max hop depth per segment
 *   - Path scoring (fewest hops, fewest derived edges)
 *
 * EXPORTS:
 *   findPaths(graph, waypoints, options) → { segments, isFallback }
 *   scorePath(path) → number (lower = better; tie-break after weighted cost)
 *   pathTotalWeight(path, weights?) → number (pedagogical base sum of hop weights; defaults 1 / 5 / 20 / 100 / 15)
 *   path.ucsRoutingCost — when present on UCS results, internal routing total (exponential cognitive-load depth penalty on relationship hops only); sortPathsByMetric prefers this over base total.
 *   pathCostBreakdown(path, weights?) → per–cost-type weighted subtotals (direct / derived / derivedPotential / association / layer-skip / violation); uses base hop weights only
 *   normalizePathWeights(options) → { direct, derived, derivedPotential, association, violation, layerSkip }
 *   clusterPaths(segments, options?) → perspective/label metadata (precision: Simplified vs Ground-Truth + precisionScore 0–100, precisionFactors)
 *   findBestChainForSet(graph, points, options) → { orderedPoints, segments, totalScore, isFallback }
 *   findNearbyExecutiveElements(startElement, targetElement, graph, options?) → [{ id, name, type, distance }]
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES (JSDoc for editor support)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} PathStep
 * @property {string} element   — element name at this node
 * @property {string[]|null} codes — merged Appendix B row (direct + derived); UI picks one to display.
 *                                   null for the first node (no incoming edge)
 * @property {boolean|null} isDirect — whether pathfinding used the graph’s direct arc (vs derived)
 *                                     for this hop (scoring); label styling uses matrixDirect/DerivedCodes.
 * @property {string[]=} matrixDirectCodes — Appendix B direct letters for this directed pair
 * @property {string[]=} matrixDerivedCodes — Appendix B.2 derived letters for this directed pair
 * @property {string[]=} matrixDerivedPotentialCodes — Appendix B.3 potential derived letters for this directed pair
 * @property {boolean=} isAssociation — true when this hop used the universal §5.2.4 Association arc
 * @property {{ hopIndex: number, from: string, to: string, rule: string, ruleLabel?: string, primaryCode?: string, violation?: string, violationLabel?: string, violationExplain?: string, layerSkipPenalty?: number }=} semanticHop
 *    per-hop pedagogy trace metadata (mirrors path.ruleTrace[hopIndex-1]) for UI drill-down rendering.
 */

/**
 * @typedef {PathStep[]} Path
 * A sequence of steps from start to end of one segment.
 */

/**
 * @typedef {object} SegmentResult
 * @property {string} from
 * @property {string} to
 * @property {Path[]} paths — top N paths for this segment, sorted by score
 */

/**
 * @typedef {object} PathResult
 * @property {string[]} waypoints — the full waypoint chain [start, ...mids, end]
 * @property {SegmentResult[]} segments — one entry per consecutive waypoint pair
 * @property {number} totalHops — sum of hops across all segments (best weighted combo)
 * @property {number} derivedCount — number of derived edges in the best combo
 */

// ─────────────────────────────────────────────────────────────────────────────
// PATH STEP NORMALIZATION (single matrix relationship per hop)
// ─────────────────────────────────────────────────────────────────────────────
//
// Appendix B may list several relationship letters in one cell. The adjacency graph may
// expose two parallel edges for the same pair (direct vs derived §5.7); BFS walks only one
// edge, so we merge the matrix row onto each step for UI cycling. When the user runs search
// in “Direct only” mode, merged codes must omit §5.7 derived letters — matching buildGraph().

/**
 * @param {string} fromEl
 * @param {string} toEl
 * @param {boolean} [includeDerived=true] — same meaning as buildGraph({ includeDerived })
 * @returns {{ merged: string[], direct: string[], derived: string[], derivedPotential: string[] }}
 */
function mergeMatrixRowForPair(fromEl, toEl, includeDerived = true) {
  if (typeof MATRIX === "undefined") return { merged: [], direct: [], derived: [], derivedPotential: [] };
  for (const row of MATRIX) {
    if (row.from === fromEl && row.to === toEl) {
      const direct = (row.direct || []).map((c) => String(c).toUpperCase());
      const derived = (row.derived || []).map((c) => String(c).toUpperCase());
      const derivedPotential = (row.derivedPotential || []).map((c) => String(c).toUpperCase());
      if (!includeDerived) {
        return { merged: [...direct], direct, derived: [], derivedPotential: [] };
      }
      const seen = new Set();
      const merged = [];
      for (const c of direct) {
        if (!seen.has(c)) {
          seen.add(c);
          merged.push(c);
        }
      }
      for (const c of derived) {
        if (!seen.has(c)) {
          seen.add(c);
          merged.push(c);
        }
      }
      for (const c of derivedPotential) {
        if (!seen.has(c)) {
          seen.add(c);
          merged.push(c);
        }
      }
      return { merged, direct, derived, derivedPotential };
    }
  }
  return { merged: [], direct: [], derived: [], derivedPotential: [] };
}

/**
 * @param {{ to: string, codes: string[], isDirect: boolean }} edge
 * @param {string} fromEl — source node of this hop (Appendix B “from”)
 * @param {{ includeDerived?: boolean, matrixRow?: { merged: string[], direct: string[], derived: string[], derivedPotential: string[] }|null }} [opts]
 * @returns {{ element: string, codes: string[], isDirect: boolean, matrixDirectCodes: string[], matrixDerivedCodes: string[], matrixDerivedPotentialCodes: string[] }}
 */
function pathStepFromEdge(edge, fromEl, { includeDerived = true, matrixRow = null } = {}) {
  const { to, codes, isDirect } = edge;
  const row =
    matrixRow != null
      ? matrixRow
      : mergeMatrixRowForPair(fromEl, to, includeDerived);
  const edgeCodes = codes && codes.length > 0 ? codes.map((c) => String(c).toUpperCase()) : [];
  let merged = row.merged;
  let md = row.direct;
  let mder = row.derived;
  let mpdr = row.derivedPotential || [];

  if (merged.length === 0 && edgeCodes.length) {
    if (!includeDerived && !isDirect) {
      merged = [];
      md = [];
      mder = [];
      mpdr = [];
    } else {
      merged = [...edgeCodes];
      md = isDirect ? edgeCodes : [];
      mder = isDirect ? [] : edge.isPotentialDerived ? [] : edgeCodes;
      mpdr = isDirect ? [] : edge.isPotentialDerived ? edgeCodes : [];
    }
  }

  const step = {
    element: to,
    codes: merged,
    isDirect,
    matrixDirectCodes: md,
    matrixDerivedCodes: mder,
    matrixDerivedPotentialCodes: mpdr,
  };
  if (edge.isAssociation) step.isAssociation = true;
  if (edge.isPotentialDerived) step.isPotentialDerived = true;
  return step;
}

// ─────────────────────────────────────────────────────────────────────────────
// Weighted hops (§5.2.4 Association vs Appendix B relationships)
// ─────────────────────────────────────────────────────────────────────────────

const PATH_DIRECT_WEIGHT = 1;
const PATH_DERIVED_WEIGHT = 5;
const PATH_DERIVED_POTENTIAL_WEIGHT = 20;
const PATH_ASSOCIATION_PENALTY = 100;
const PATH_VIOLATION_PENALTY = 50;
const PATH_LAYER_SKIP_PENALTY = 15;
/** First N hops use exponent 0 for cognitive depth penalty (tunable via options). */
const DEFAULT_PENALTY_GRACE_PERIOD = 3;
/** Base of exponential multiplier on relationship hop weight after the grace period. */
const DEFAULT_PENALTY_GROWTH_FACTOR = 2.5;
const CORE_STACK_LAYERS = new Set(["Business", "Application", "Technology"]);

const PEDAGOGY_RULE_LABELS = Object.freeze({
  Direct: "Explicit relationship (Appendix B).",
  Derived: "Certain inferred link (Appendix B.2 derivation rules).",
  DerivedPotential: "Potential inferred link (Appendix B.3 derivation rules).",
  Association: "Generic link (§5.2.4 Association).",
});

const PEDAGOGY_VIOLATION_COPY = Object.freeze({
  "V-Shape": {
    label: "Indirect dependency loop (up-then-down behavior).",
    explain: "This hop reverses dependency direction after moving across layers, which is treated as out-of-grammar in strict mode.",
  },
  MotivationDetour: {
    label: "Core path detours through Motivation or Strategy layer.",
    explain: "Core-to-core derivation should not pass through Motivation/Strategy intermediates in strict mode.",
  },
});

function clampWeight(n, def) {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return def;
  return Math.max(1, Math.min(500, x));
}

/**
 * @param {{ pathWeightDirect?: number, pathWeightDerived?: number, pathWeightDerivedPotential?: number, pathWeightAssociation?: number, pathWeightLayerSkip?: number }} [o]
 * @returns {{ direct: number, derived: number, derivedPotential: number, association: number, violation: number, layerSkip: number }}
 */
function normalizePathWeights(o = {}) {
  return {
    direct: clampWeight(o.pathWeightDirect, PATH_DIRECT_WEIGHT),
    derived: clampWeight(o.pathWeightDerived, PATH_DERIVED_WEIGHT),
    derivedPotential: clampWeight(o.pathWeightDerivedPotential, PATH_DERIVED_POTENTIAL_WEIGHT),
    association: clampWeight(o.pathWeightAssociation, PATH_ASSOCIATION_PENALTY),
    violation: clampWeight(o.pathViolationPenalty, PATH_VIOLATION_PENALTY),
    layerSkip: clampWeight(o.pathWeightLayerSkip, PATH_LAYER_SKIP_PENALTY),
  };
}

function clampPenaltyGracePeriod(n) {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return DEFAULT_PENALTY_GRACE_PERIOD;
  return Math.max(0, Math.min(24, x));
}

function clampPenaltyGrowthFactor(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return DEFAULT_PENALTY_GROWTH_FACTOR;
  return Math.max(1.01, Math.min(10, x));
}

/**
 * @param {{ cognitiveLoadPenalty?: boolean, penaltyGracePeriod?: number, penaltyGrowthFactor?: number }} [o]
 */
function normalizeCognitiveLoadOptions(o = {}) {
  return {
    cognitiveLoadPenalty: o.cognitiveLoadPenalty !== false,
    penaltyGracePeriod: clampPenaltyGracePeriod(o.penaltyGracePeriod ?? DEFAULT_PENALTY_GRACE_PERIOD),
    penaltyGrowthFactor: clampPenaltyGrowthFactor(o.penaltyGrowthFactor ?? DEFAULT_PENALTY_GROWTH_FACTOR),
  };
}

/**
 * @param {number} depth1Based — hop index of the edge being added (first hop = 1)
 * @param {{ cognitiveLoadPenalty: boolean, penaltyGracePeriod: number, penaltyGrowthFactor: number }} opts
 */
function cognitivePenaltyMultiplier(depth1Based, opts) {
  if (!opts.cognitiveLoadPenalty) return 1;
  return Math.pow(opts.penaltyGrowthFactor, Math.max(0, depth1Based - opts.penaltyGracePeriod));
}

/**
 * @param {object} o
 */
function normalizeSemanticOptions(o = {}) {
  return {
    restrictCoreToCore: o.restrictCoreToCore !== false,
    enforceGrammar: o.enforceGrammar !== false,
    strictRealization: o.strictRealization !== false,
  };
}

function getLayerRank(elementName) {
  const layer = typeof getElementLayer === "function" ? getElementLayer(elementName) : "Unknown";
  switch (layer) {
    case "Motivation":
      return 0;
    case "Strategy":
      return 1;
    case "Business":
      return 2;
    case "Application":
      return 3;
    case "Technology":
      return 4;
    case "Composite":
      return 5;
    case "Implementation":
      return 6;
    default:
      return Number.POSITIVE_INFINITY;
  }
}

function getArchimateLayerElevation(elementName) {
  const layer = typeof getElementLayer === "function" ? getElementLayer(elementName) : "Unknown";
  switch (layer) {
    case "Motivation":
      return 6;
    case "Strategy":
      return 5;
    case "Business":
      return 4;
    case "Application":
      return 3;
    case "Technology":
      return 2;
    default:
      return null;
  }
}

function layerSkipPenaltyForHop(fromElement, toElement, weights) {
  const fromElevation = getArchimateLayerElevation(fromElement);
  const toElevation = getArchimateLayerElevation(toElement);
  if (!Number.isFinite(fromElevation) || !Number.isFinite(toElevation)) return 0;
  return Math.abs(fromElevation - toElevation) > 1 ? weights.layerSkip : 0;
}

function pickPrimaryRelCode(codes) {
  const list = Array.isArray(codes) ? codes : [];
  let fallback = "O";
  for (const raw of list) {
    const c = String(raw || "").toUpperCase();
    if (!c) continue;
    if (fallback === "O") fallback = c;
    if (c !== "O") return c;
  }
  return fallback;
}

function normalizeAllowedRelationshipCodes(rawCodes) {
  if (!rawCodes) return null;
  const arr =
    rawCodes instanceof Set
      ? [...rawCodes]
      : Array.isArray(rawCodes)
        ? rawCodes
        : null;
  if (!arr || arr.length === 0) return null;
  const out = new Set();
  for (const raw of arr) {
    const code = String(raw || "").trim().toUpperCase();
    if (code) out.add(code);
  }
  return out.size ? out : null;
}

function edgeMatchesAllowedRelationshipCodes(edge, allowedCodes) {
  if (!allowedCodes) return true;
  if (edge?.isAssociation) return allowedCodes.has("O");
  const edgeCodes = Array.isArray(edge?.codes) ? edge.codes : [];
  for (const raw of edgeCodes) {
    const code = String(raw || "").toUpperCase();
    if (code && allowedCodes.has(code)) return true;
  }
  return false;
}

function relationRuleFromEdge(edge) {
  if (edge.isAssociation) return "Association";
  if (edge.isPotentialDerived) return "DerivedPotential";
  return edge.isDirect === false ? "Derived" : "Direct";
}

function pedagogyRuleLabel(rule) {
  return PEDAGOGY_RULE_LABELS[rule] || String(rule || "");
}

function pedagogyViolationLabel(violation) {
  return PEDAGOGY_VIOLATION_COPY[violation]?.label;
}

function pedagogyViolationExplain(violation) {
  return PEDAGOGY_VIOLATION_COPY[violation]?.explain;
}

function computeNextTrajectory(prevTraj, primaryCode, delta, edge, sem) {
  if (edge.isAssociation) return "neutral";
  if (primaryCode === "V") {
    if (delta < 0) return "dep_up";
    if (delta > 0) return "dep_down";
    return "neutral";
  }
  if (primaryCode === "R") {
    if (!sem.strictRealization) return "neutral";
    if (delta < 0) return "dep_up";
    if (delta > 0) return "dep_down";
    return "neutral";
  }
  if (primaryCode === "C" || primaryCode === "G" || primaryCode === "I" || primaryCode === "T" || primaryCode === "F") {
    return "neutral";
  }
  return prevTraj || "neutral";
}

function violatesVShape(prevTraj, nextTraj) {
  return (prevTraj === "dep_up" && nextTraj === "dep_down")
    || (prevTraj === "dep_down" && nextTraj === "dep_up");
}

function semanticStrengthFromPathStrength(pathStrength) {
  if (pathStrength >= 4) return "Strong";
  if (pathStrength >= 3) return "Valid";
  return "Informal";
}

/**
 * Whether the *chosen* relationship letter is Appendix B direct vs §5.7 derived for this hop.
 * Uses matrix lists on the step so UI picks (e.g. Triggering) stay consistent when the pathfinder
 * walked a different parallel edge than the user’s selection.
 */
function isResolvedCodeAppendixBDirect(step, codeUpper) {
  if (!codeUpper || !step) return step?.isDirect ?? true;
  const U = String(codeUpper).toUpperCase();
  if (step.matrixDirectCodes?.length && step.matrixDirectCodes.includes(U)) return true;
  if (step.matrixDerivedCodes?.length && step.matrixDerivedCodes.includes(U)) return false;
  if (step.matrixDerivedPotentialCodes?.length && step.matrixDerivedPotentialCodes.includes(U)) return false;
  return step?.isDirect ?? true;
}

function isResolvedCodePotential(step, codeUpper) {
  if (!codeUpper || !step) return !!step?.isPotentialDerived;
  const U = String(codeUpper).toUpperCase();
  if (step.matrixDerivedPotentialCodes?.length && step.matrixDerivedPotentialCodes.includes(U)) return true;
  return !!step?.isPotentialDerived;
}

/**
 * Resolve the relationship code used for semantic tier (user-resolved choice wins over pathfinder trace).
 * @param {PathStep|undefined|null} step
 * @param {{ primaryCode?: string }|undefined|null} semanticHop
 * @param {{ resolvedPrimaryCode?: string }|undefined} [opts]
 */
function resolvePrimaryCodeForSemanticTier(step, semanticHop, opts) {
  const raw = opts?.resolvedPrimaryCode;
  if (raw != null && String(raw).trim() !== "") {
    return String(raw).toUpperCase();
  }
  if (semanticHop?.primaryCode != null && String(semanticHop.primaryCode).trim() !== "") {
    return String(semanticHop.primaryCode).toUpperCase();
  }
  return pickPrimaryRelCode(step?.codes || []);
}

/**
 * Delegates to isAssociationHopPedagogySanctioned (viewpoints.js) when present.
 * @param {PathStep|undefined|null} step
 * @param {{ from?: string, to?: string }|undefined|null} semanticHop
 * @param {{ allowedRelationshipCodes?: Set<string>|null, viewpointKey?: string|null }|undefined} [opts]
 */
function isAssociationSanctionedForPedagogy(step, semanticHop, opts) {
  if (typeof isAssociationHopPedagogySanctioned === "function") {
    return isAssociationHopPedagogySanctioned(step, semanticHop, opts);
  }
  if (step?.isAssociation !== true) return false;
  const fromEl = semanticHop?.from ?? "";
  const toEl = step?.element ?? semanticHop?.to ?? "";
  if (fromEl === "Value" || fromEl === "Meaning" || toEl === "Value" || toEl === "Meaning") return true;
  const allowed = opts?.allowedRelationshipCodes;
  return !!(allowed && typeof allowed.has === "function" && allowed.has("O"));
}

/**
 * Classify a single hop's semantic tier for drill-down pedagogy UI.
 * Order: violations → Association [O] (informal, except sanctioned cases) → derived §5.7 → direct structural.
 * @param {PathStep|undefined|null} step
 * @param {{ rule?: string, ruleLabel?: string, violation?: string, violationLabel?: string, primaryCode?: string }|undefined|null} semanticHop
 * @param {{ resolvedPrimaryCode?: string, allowedRelationshipCodes?: Set<string>|null }|undefined} [opts] — pass UI-resolved code so Association (O) is not masked by pickPrimaryRelCode’s non-O preference; optional viewpoint O whitelist
 * @returns {{ strength: "Strong"|"Valid"|"Informal", title: string, reason: string }}
 */
function classifyHopSemanticTier(step, semanticHop, opts) {
  const violation = semanticHop?.violation;
  const hasViolation = !!(violation && violation !== "None");
  const primaryUpper = resolvePrimaryCodeForSemanticTier(step, semanticHop, opts);
  const isAssociationHop = step?.isAssociation === true || primaryUpper === "O";

  if (hasViolation) {
    return {
      strength: "Informal",
      title: "Semantic violation detected.",
      reason:
        semanticHop?.violationLabel || semanticHop?.ruleLabel || "semantic rule exception",
    };
  }
  if (isAssociationHop) {
    if (isAssociationSanctionedForPedagogy(step, semanticHop, opts)) {
      const reason =
        typeof associationPedagogySanctionReason === "function"
          ? associationPedagogySanctionReason(step, semanticHop, opts)
          : "Association (§5.2.4) is permitted in this modeling context.";
      return {
        strength: "Valid",
        title: "Association (§5.2.4) — permitted in this context.",
        reason,
        badgeMapping: "Permitted",
        skipRouteChainDowngrade: true,
      };
    }
    return {
      strength: "Informal",
      title: "Generic Association (§5.2.4).",
      reason: semanticHop?.ruleLabel || "a generic Association bridge (§5.2.4)",
    };
  }
  if (!isResolvedCodeAppendixBDirect(step, primaryUpper)) {
    if (isResolvedCodePotential(step, primaryUpper)) {
      return {
        strength: "Informal",
        title: "Potentially derived via Appendix B.3.",
        reason: pedagogyRuleLabel("DerivedPotential"),
      };
    }
    return {
      strength: "Valid",
      title: "Strictly derived per Appendix B.2.",
      reason: pedagogyRuleLabel("Derived"),
    };
  }
  if (typeof viewpointPaletteCapsDirectStrengthTier === "function") {
    const cap = viewpointPaletteCapsDirectStrengthTier(semanticHop, step, opts);
    if (cap) return cap;
  }
  return {
    strength: "Strong",
    title: "Direct or Structural connection.",
    reason: semanticHop?.ruleLabel || pedagogyRuleLabel("Direct"),
  };
}

function pathStrengthFromTrace(path, ruleTrace) {
  const trace = Array.isArray(ruleTrace) ? ruleTrace : [];
  const hasAssociation = trace.some((h) => h?.rule === "Association");
  const hasViolation = trace.some((h) => h?.violation && h.violation !== "None");
  const structuralOnly = trace.length > 0
    && trace.every((h) => h?.primaryCode === "C" || h?.primaryCode === "G" || h?.primaryCode === "I")
    && !hasAssociation
    && !hasViolation;
  if (structuralOnly) return 4;
  if (!hasAssociation && !hasViolation) return 3;
  if (!hasAssociation) return 2;
  return 1;
}

/** True if the path uses at least one §5.2.4 Association hop (used for strict vs fallback filtering). */
function pathHasAssociationHop(path) {
  for (let i = 1; i < path.length; i++) {
    if (path[i]?.isAssociation) return true;
  }
  return false;
}

/**
 * @param {{ isAssociation?: boolean, isPotentialDerived?: boolean }} edge
 * @param {string} _toElement — target node of this hop (reserved)
 * @param {{ direct: number, derived: number, derivedPotential: number, association: number }} weights
 */
function hopWeight(edge, _toElement, weights) {
  if (edge.isAssociation) {
    return weights.association;
  }
  if (edge.isPotentialDerived) {
    return weights.derivedPotential;
  }
  if (edge.isDirect === false) {
    return weights.derived;
  }
  return weights.direct;
}

/**
 * Sum of hop weights for a completed path (first step has no incoming edge).
 * @param {Path} path
 * @param {{ direct: number, derived: number, derivedPotential: number, association: number, violation: number, layerSkip: number }} [weights] — omit for defaults (1 / 5 / 20 / 100 / 15)
 */
function pathTotalWeight(path, weights) {
  if (path && Number.isFinite(path.totalWeight)) {
    return path.totalWeight;
  }
  const wcfg = weights || normalizePathWeights({});
  const ruleTrace = Array.isArray(path?.ruleTrace) ? path.ruleTrace : [];
  let w = 0;
  for (let i = 1; i < path.length; i++) {
    const step = path[i];
    if (step.isAssociation) {
      w += wcfg.association;
    } else if (step.isPotentialDerived) {
      w += wcfg.derivedPotential;
    } else if (step.isDirect === false) {
      w += wcfg.derived;
    } else {
      w += wcfg.direct;
    }
    const hopMeta = ruleTrace[i - 1] || step?.semanticHop;
    if (hopMeta && hopMeta.violation && hopMeta.violation !== "None") {
      w += wcfg.violation;
    }
    if (hopMeta && Number.isFinite(hopMeta.layerSkipPenalty) && hopMeta.layerSkipPenalty > 0) {
      w += hopMeta.layerSkipPenalty;
    }
  }
  return w;
}

/**
 * Per–cost-type weighted subtotals for a stitched path (same rules as {@link pathTotalWeight}).
 * @param {Path} path
 * @param {{ direct: number, derived: number, derivedPotential: number, association: number, violation: number, layerSkip: number }} [weights]
 * @returns {{ direct: number, derived: number, derivedPotential: number, association: number, violation: number, layerSkip: number, total: number }}
 */
function pathCostBreakdown(path, weights) {
  const wcfg = weights || normalizePathWeights({});
  const ruleTrace = Array.isArray(path?.ruleTrace) ? path.ruleTrace : [];
  let direct = 0;
  let derived = 0;
  let derivedPotential = 0;
  let association = 0;
  let violation = 0;
  let layerSkip = 0;
  for (let i = 1; i < path.length; i++) {
    const step = path[i];
    if (step.isAssociation) {
      association += wcfg.association;
    } else if (step.isPotentialDerived) {
      derivedPotential += wcfg.derivedPotential;
    } else if (step.isDirect === false) {
      derived += wcfg.derived;
    } else {
      direct += wcfg.direct;
    }
    const hopMeta = ruleTrace[i - 1] || step?.semanticHop;
    if (hopMeta && hopMeta.violation && hopMeta.violation !== "None") {
      violation += wcfg.violation;
    }
    if (hopMeta && Number.isFinite(hopMeta.layerSkipPenalty) && hopMeta.layerSkipPenalty > 0) {
      layerSkip += hopMeta.layerSkipPenalty;
    }
  }
  const total = direct + derived + derivedPotential + association + violation + layerSkip;
  return { direct, derived, derivedPotential, association, violation, layerSkip, total };
}

function sortPathsByMetric(paths, weights) {
  const wcfg = weights || normalizePathWeights({});
  return paths.sort((a, b) => {
    const ra = Number.isFinite(a?.ucsRoutingCost) ? a.ucsRoutingCost : pathTotalWeight(a, wcfg);
    const rb = Number.isFinite(b?.ucsRoutingCost) ? b.ucsRoutingCost : pathTotalWeight(b, wcfg);
    if (ra !== rb) return ra - rb;
    const wa = pathTotalWeight(a, wcfg);
    const wb = pathTotalWeight(b, wcfg);
    if (wa !== wb) return wa - wb;
    return scorePath(a) - scorePath(b);
  });
}

function heapParent(i) {
  return (i - 1) >> 1;
}
function heapLeft(i) {
  return (i << 1) + 1;
}
function heapRight(i) {
  return (i << 1) + 2;
}

function stateLess(a, b) {
  if (a.cost !== b.cost) return a.cost < b.cost;
  if (a.hopCount !== b.hopCount) return a.hopCount < b.hopCount;
  return a.derCount < b.derCount;
}

function heapSiftUp(heap, i) {
  while (i > 0) {
    const p = heapParent(i);
    if (!stateLess(heap[i], heap[p])) break;
    const t = heap[i];
    heap[i] = heap[p];
    heap[p] = t;
    i = p;
  }
}

function heapSiftDown(heap, i) {
  const n = heap.length;
  for (;;) {
    let sm = i;
    const l = heapLeft(i);
    const r = heapRight(i);
    if (l < n && stateLess(heap[l], heap[sm])) sm = l;
    if (r < n && stateLess(heap[r], heap[sm])) sm = r;
    if (sm === i) break;
    const t = heap[i];
    heap[i] = heap[sm];
    heap[sm] = t;
    i = sm;
  }
}

function heapPush(heap, st) {
  heap.push(st);
  heapSiftUp(heap, heap.length - 1);
}

function heapPop(heap) {
  if (heap.length === 0) return undefined;
  const top = heap[0];
  const last = heap.pop();
  if (heap.length) {
    heap[0] = last;
    heapSiftDown(heap, 0);
  }
  return top;
}

/**
 * Uniform-cost search: minimize total hop weight (defaults: direct = 1, derived = 5, Association = 100, layer-skip = 15).
 * Tie-break: fewer hops, then fewer derived edges — matches former BFS ordering when all weights are 1.
 *
 * @param {Map} graph
 * @param {string} start
 * @param {string} target
 * @param {object} options
 * @returns {Path[]}
 */
function ucsSegment(graph, start, target, options = {}) {
  const { maxDepth = 6, maxPaths = 5, maxStates = 25000, includeDerived = true } = options;
  const weights = normalizePathWeights(options);
  const cognitiveOpts = normalizeCognitiveLoadOptions(options);
  const sem = normalizeSemanticOptions(options);
  const allowedRelationshipCodes = normalizeAllowedRelationshipCodes(options.allowedRelationshipCodes);
  const startLayer = typeof getElementLayer === "function" ? getElementLayer(start) : "Unknown";
  const targetLayer = typeof getElementLayer === "function" ? getElementLayer(target) : "Unknown";
  const coreToCore = CORE_STACK_LAYERS.has(startLayer) && CORE_STACK_LAYERS.has(targetLayer);

  const withPathMeta = (path, ruleTrace, baseCost, routingCost) => {
    path.ruleTrace = ruleTrace;
    path.totalWeight = baseCost;
    path.ucsRoutingCost = routingCost;
    const pathStrength = pathStrengthFromTrace(path, ruleTrace);
    path.pathStrength = pathStrength;
    path.semanticStrength = semanticStrengthFromPathStrength(pathStrength);
    return path;
  };

  if (start === target) {
    const p = [{ element: start, codes: null, isDirect: null }];
    return [withPathMeta(p, [], 0, 0)];
  }

  if (!graph.has(start)) return [];

  const results = [];
  const heap = [];
  const startVisited = new Set([sem.enforceGrammar ? `${start}::neutral` : start]);
  heapPush(heap, {
    path: [{ element: start, codes: null, isDirect: null }],
    ruleTrace: [],
    visited: startVisited,
    cost: 0,
    baseCost: 0,
    hopCount: 0,
    derCount: 0,
    traj: "neutral",
  });

  let exploredStates = 0;

  while (heap.length && results.length < maxPaths * 4) {
    const st = heapPop(heap);
    if (!st) break;
    const { path, ruleTrace, visited, cost, baseCost, hopCount, derCount, traj } = st;
    const current = path[path.length - 1].element;

    if (hopCount >= maxDepth) continue;

    const edges = graph.get(current) ?? [];

    for (const edge of edges) {
      if (++exploredStates > maxStates) {
        return sortPathsByMetric(results, weights).slice(0, maxPaths);
      }

      const { to } = edge;

      // Expand only along outgoing adjacency from `current`. Appendix B arcs are directed
      // (tail→head); undirected §5.2.4 Association bridges are flagged on the edge object.
      if (!edge.isAssociation && edge.isDirected === false) continue;

      // Strict hops must match MATRIX[from=current, to=] — never the reverse cell (e.g. cannot
      // step A→B using a row that only authorizes B→A). §5.2.4 O is synthetic and not matrix-encoded.
      let matrixRowForStep = null;
      if (!edge.isAssociation) {
        matrixRowForStep = mergeMatrixRowForPair(current, to, includeDerived);
        if (!matrixRowForStep.merged.length) {
          continue;
        }
      }
      if (!edgeMatchesAllowedRelationshipCodes(edge, allowedRelationshipCodes)) continue;

      const primary = pickPrimaryRelCode(edge.codes);
      const delta = getLayerRank(to) - getLayerRank(current);

      let violation = "None";
      const nextLayer = typeof getElementLayer === "function" ? getElementLayer(to) : "Unknown";
      const detourMotivationOrStrategy =
        coreToCore && (nextLayer === "Motivation" || nextLayer === "Strategy");

      if (detourMotivationOrStrategy) {
        if (sem.restrictCoreToCore) continue;
        violation = "MotivationDetour";
      }

      const nextTraj = computeNextTrajectory(traj, primary, delta, edge, sem);
      if (!edge.isAssociation && violatesVShape(traj, nextTraj)) {
        if (sem.enforceGrammar) continue;
        if (violation === "None") violation = "V-Shape";
      }

      if (sem.enforceGrammar) {
        const compositeKey = `${to}::${nextTraj}`;
        if (visited.has(compositeKey)) continue;
      } else {
        if (visited.has(to)) continue;
      }

      const w = hopWeight(edge, to, weights);
      const vp = violation !== "None" ? weights.violation : 0;
      const layerSkipAdd = layerSkipPenaltyForHop(current, to, weights);
      const currentDepth = hopCount + 1;
      const mult = cognitivePenaltyMultiplier(currentDepth, cognitiveOpts);
      const step = pathStepFromEdge(edge, current, {
        includeDerived,
        matrixRow: matrixRowForStep ?? undefined,
      });
      const newPath = [...path, step];
      const hopIndex = path.length - 1;
      const hopRule = relationRuleFromEdge(edge);
      const hopMeta = {
        hopIndex,
        from: current,
        to,
        rule: hopRule,
        ruleLabel: pedagogyRuleLabel(hopRule),
        primaryCode: primary,
        violation,
        violationLabel: violation === "None" ? undefined : pedagogyViolationLabel(violation),
        violationExplain: violation === "None" ? undefined : pedagogyViolationExplain(violation),
        layerSkipPenalty: layerSkipAdd,
      };
      step.semanticHop = hopMeta;
      const newRuleTrace = [...ruleTrace, hopMeta];
      const newDer = derCount + (edge.isDirect === false ? 1 : 0);
      const baseStep = w + vp + layerSkipAdd;
      const newBaseCost = baseCost + baseStep;
      const newCost = cost + w * mult + vp + layerSkipAdd;

      if (to === target) {
        results.push(withPathMeta(newPath, newRuleTrace, newBaseCost, newCost));
      } else {
        const newVisited = new Set(visited);
        if (sem.enforceGrammar) {
          newVisited.add(`${to}::${nextTraj}`);
        } else {
          newVisited.add(to);
        }
        heapPush(heap, {
          path: newPath,
          ruleTrace: newRuleTrace,
          visited: newVisited,
          cost: newCost,
          baseCost: newBaseCost,
          hopCount: hopCount + 1,
          derCount: newDer,
          traj: nextTraj,
        });
      }
    }
  }

  return sortPathsByMetric(results, weights).slice(0, maxPaths);
}

/**
 * @param {boolean} [options.allowAssociationFallback=false] — if false, drop paths that use Association (O) hops
 */
function segmentPaths(graph, from, to, options = {}) {
  const { allowAssociationFallback = false } = options;
  const raw = ucsSegment(graph, from, to, options);
  if (!raw.length) return raw;
  // When fallback is off, prefer any strict (non-Association) path in the UCS result set.
  // Do not drop the whole result just because the *cheapest* ranked path uses Association (§5.2.4):
  // a matrix-backed route may still appear as an alternative tab.
  if (!allowAssociationFallback) {
    const strictOnly = raw.filter((p) => !pathHasAssociationHop(p));
    return strictOnly.length ? strictOnly : [];
  }
  return raw;
}

// ─────────────────────────────────────────────────────────────────────────────
// PATH SCORING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Score a path: lower is better.
 * Primary: fewest hops (edges = path.length - 1)
 * Secondary: fewest derived edges
 *
 * @param {Path} path
 * @returns {number}
 */
function scorePath(path) {
  const hops = path.length - 1;
  const derivedCount = path.filter(step => step.isDirect === false).length;
  // Weight hops heavily so 1-hop always beats 2-hop regardless of derived count
  return hops * 100 + derivedCount;
}

// ─────────────────────────────────────────────────────────────────────────────
// UNORDERED SET → BEST ORDERED CHAIN
// ─────────────────────────────────────────────────────────────────────────────

function pathWeightedScoreOrInfinity(path, weights) {
  if (!path || path.length === 0) return Infinity;
  return pathTotalWeight(path, weights);
}

function pairKey(a, b) {
  return `${a}→${b}`;
}

/**
 * Compute best path + score between two points (directed).
 * Cached because the ordering solver queries many pairs repeatedly.
 */
function makePairwiseBestPathGetter(graph, opts = {}) {
  const weights = normalizePathWeights(opts);
  const allowAssociationForPairs =
    opts.allowAssociationForPairs instanceof Set ? opts.allowAssociationForPairs : null;
  const cache = new Map(); // key: "A→B" -> { bestPath, score }
  return (a, b) => {
    const k = pairKey(a, b);
    const hit = cache.get(k);
    if (hit) return hit;
    const pairOpts =
      allowAssociationForPairs &&
      allowAssociationForPairs.has(k) &&
      opts.allowAssociationFallback !== true
        ? { ...opts, allowAssociationFallback: true }
        : opts;
    const paths = segmentPaths(graph, a, b, pairOpts);
    const bestPath = paths?.[0] ?? null;
    const score = pathWeightedScoreOrInfinity(bestPath, weights);
    const res = { bestPath, score };
    cache.set(k, res);
    return res;
  };
}

function buildSetDirectionRules(points, edgeConstraints = []) {
  const pointSet = new Set(points || []);
  const nextBySource = new Map();
  const prevByTarget = new Map();
  const allowAssociationForPairs = new Set();
  const rules = [];
  for (const raw of edgeConstraints || []) {
    if (!raw || raw.type !== "FORCED_DIRECTION") continue;
    const sourceId = String(raw.sourceId || "").trim();
    const targetId = String(raw.targetId || "").trim();
    if (!sourceId || !targetId || sourceId === targetId) continue;
    if (!pointSet.has(sourceId) || !pointSet.has(targetId)) continue;
    if (nextBySource.has(sourceId) && nextBySource.get(sourceId) !== targetId) {
      return { ok: false, reason: "CONFLICTING_SOURCE", nextBySource, prevByTarget, rules, allowAssociationForPairs };
    }
    if (prevByTarget.has(targetId) && prevByTarget.get(targetId) !== sourceId) {
      return { ok: false, reason: "CONFLICTING_TARGET", nextBySource, prevByTarget, rules, allowAssociationForPairs };
    }
    nextBySource.set(sourceId, targetId);
    prevByTarget.set(targetId, sourceId);
    rules.push({ sourceId, targetId });
    if (raw.requiresAssociation === true) {
      allowAssociationForPairs.add(pairKey(sourceId, targetId));
    }
  }

  for (const start of nextBySource.keys()) {
    const visited = new Set();
    let cur = start;
    while (nextBySource.has(cur)) {
      if (visited.has(cur)) return { ok: false, reason: "CYCLE", nextBySource, prevByTarget, rules, allowAssociationForPairs };
      visited.add(cur);
      cur = nextBySource.get(cur);
    }
  }

  return {
    ok: true,
    reason: null,
    nextBySource,
    prevByTarget,
    rules,
    allowAssociationForPairs,
  };
}

function canAppendSetPointWithRules(order, depth, candidate, rules) {
  if (!rules || (!rules.nextBySource?.size && !rules.prevByTarget?.size)) return true;
  if (depth === 0) {
    return !rules.prevByTarget.has(candidate);
  }
  const prev = order[depth - 1];
  const requiredNext = rules.nextBySource.get(prev);
  if (requiredNext && requiredNext !== candidate) return false;
  const requiredPrev = rules.prevByTarget.get(candidate);
  if (requiredPrev && requiredPrev !== prev) return false;
  return true;
}

function chainSatisfiesSetRules(order, rules) {
  if (!rules || (!rules.nextBySource?.size && !rules.prevByTarget?.size)) return true;
  if (!Array.isArray(order) || order.length === 0) return true;
  for (let i = 0; i < order.length; i++) {
    const cur = order[i];
    const prev = i > 0 ? order[i - 1] : null;
    if (i === 0 && rules.prevByTarget.has(cur)) return false;
    const mustPrev = rules.prevByTarget.get(cur);
    if (mustPrev && mustPrev !== prev) return false;
    if (i > 0) {
      const mustNext = rules.nextBySource.get(prev);
      if (mustNext && mustNext !== cur) return false;
    }
  }
  return true;
}

/**
 * Exact best Hamiltonian PATH (not cycle) by brute-force permutations.
 * Use for small N only.
 */
function bestOrderingExact(points, getPair, { canAppend = null } = {}) {
  const n = points.length;
  let best = null; // { order, score }

  const used = new Array(n).fill(false);
  const order = new Array(n);

  const dfs = (depth, runningScore) => {
    if (runningScore >= (best?.score ?? Infinity)) return;
    if (depth === n) {
      best = { order: order.slice(), score: runningScore };
      return;
    }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      const el = points[i];
      if (typeof canAppend === "function" && !canAppend(order, depth, el)) continue;
      if (depth > 0) {
        const prev = order[depth - 1];
        const { score } = getPair(prev, el);
        if (!Number.isFinite(score)) continue; // unreachable edge kills this ordering
        used[i] = true;
        order[depth] = el;
        dfs(depth + 1, runningScore + score);
        used[i] = false;
      } else {
        used[i] = true;
        order[depth] = el;
        dfs(depth + 1, runningScore);
        used[i] = false;
      }
    }
  };

  dfs(0, 0);
  return best;
}

/**
 * Greedy heuristic for larger sets:
 * - pick a good start (try a few candidates)
 * - nearest-neighbor build
 * - optional 2-opt improvement
 */
function bestOrderingHeuristic(points, getPair, { tries = 4, do2opt = true, canAppend = null, isOrderValid = null } = {}) {
  const uniq = [...new Set(points)];
  const n = uniq.length;
  if (n <= 2) {
    const base = uniq.slice();
    if (typeof isOrderValid === "function" && !isOrderValid(base)) return { order: null, score: Infinity };
    return { order: base, score: n === 2 ? getPair(base[0], base[1]).score : 0 };
  }

  const scoreChain = (ord) => {
    let s = 0;
    for (let i = 1; i < ord.length; i++) {
      const w = getPair(ord[i - 1], ord[i]).score;
      if (!Number.isFinite(w)) return Infinity;
      s += w;
    }
    return s;
  };

  const buildFromStart = (startIdx) => {
    const remaining = new Set(uniq);
    const order = [];
    let current = uniq[startIdx];
    if (typeof canAppend === "function" && !canAppend(order, 0, current)) {
      return { order: null, score: Infinity };
    }
    order.push(current);
    remaining.delete(current);

    while (remaining.size) {
      let bestNext = null;
      let bestScore = Infinity;
      for (const cand of remaining) {
        if (typeof canAppend === "function" && !canAppend(order, order.length, cand)) continue;
        const w = getPair(current, cand).score;
        if (w < bestScore) {
          bestScore = w;
          bestNext = cand;
        }
      }
      if (!bestNext || !Number.isFinite(bestScore)) return { order: null, score: Infinity };
      order.push(bestNext);
      remaining.delete(bestNext);
      current = bestNext;
    }
    if (typeof isOrderValid === "function" && !isOrderValid(order)) return { order: null, score: Infinity };
    return { order, score: scoreChain(order) };
  };

  // Candidate starts: first, plus a few spread-out picks.
  const startCandidates = [0];
  for (let i = 1; i < Math.min(n, tries); i++) startCandidates.push(Math.floor((i * (n - 1)) / (tries - 1)));

  let best = null;
  for (const idx of startCandidates) {
    const cand = buildFromStart(idx);
    if (cand.score < (best?.score ?? Infinity)) best = cand;
  }
  if (!best || !best.order) return { order: null, score: Infinity };

  if (do2opt) {
    // Standard 2-opt for path (not cycle): reverse subsegments to reduce cost.
    let improved = true;
    while (improved) {
      improved = false;
      for (let i = 1; i < n - 2; i++) {
        for (let k = i + 1; k < n - 1; k++) {
          const ord = best.order;
          const a = ord[i - 1], b = ord[i];
          const c = ord[k], d = ord[k + 1];
          const before = getPair(a, b).score + getPair(c, d).score;
          const after  = getPair(a, c).score + getPair(b, d).score;
          if (after < before) {
            const newOrd = ord.slice(0, i).concat(ord.slice(i, k + 1).reverse(), ord.slice(k + 1));
            if (typeof isOrderValid === "function" && !isOrderValid(newOrd)) continue;
            const newScore = scoreChain(newOrd);
            if (newScore < best.score) {
              best = { order: newOrd, score: newScore };
              improved = true;
            }
          }
        }
      }
    }
  }

  return { order: best.order, score: best.score };
}

/**
 * Given an unordered set of element names, choose an ordered chain that minimizes
 * total segment score, then return standard `segments` for rendering.
 *
 * Notes:
 * - This respects directionality (uses directed BFS A→B).
 * - If no Hamiltonian path exists (some consecutive pair unreachable), returns
 *   empty segments.
 */
const SEARCH_STATUS = Object.freeze({
  OK: "ok",
  NO_PATH: "no_path",
  BLOCKED_BY_VIEWPOINT: "BLOCKED_BY_VIEWPOINT",
});

function shouldProbeViewpointBlock(options = {}) {
  return options.viewpointStrict === true && options._skipViewpointProbe !== true;
}

function probeOptionsWithoutViewpoint(options = {}) {
  return {
    ...options,
    viewpointStrict: false,
    viewpointKey: null,
    allowedRelationshipCodes: null,
    _skipViewpointProbe: true,
  };
}

function buildFullMetamodelProbeGraph(options = {}) {
  if (typeof buildGraph !== "function") return null;
  return buildGraph({
    allowedElements: null,
    includeDerived: !!options.includeDerived,
  });
}

function countRelevantForcedDirectionConstraints(points, edgeConstraints = []) {
  const pointSet = new Set(points || []);
  let count = 0;
  for (const raw of edgeConstraints || []) {
    if (!raw || raw.type !== "FORCED_DIRECTION") continue;
    const sourceId = String(raw.sourceId || "").trim();
    const targetId = String(raw.targetId || "").trim();
    if (!sourceId || !targetId || sourceId === targetId) continue;
    if (!pointSet.has(sourceId) || !pointSet.has(targetId)) continue;
    count++;
  }
  return count;
}

function solveBestChainForSetCore(graph, points, options = {}) {
  const { exactMaxPoints = 8 } = options;
  const uniq = [...new Set((points ?? []).filter(Boolean))];
  if (uniq.length < 2) {
    return { orderedPoints: uniq, segments: [], totalScore: 0, isFallback: false };
  }

  const rules = buildSetDirectionRules(uniq, options.edgeConstraints);
  if (!rules.ok) {
    return { orderedPoints: [], segments: [], totalScore: Infinity, isFallback: false };
  }

  const getPair = makePairwiseBestPathGetter(graph, {
    ...options,
    allowAssociationForPairs: rules.allowAssociationForPairs,
  });
  const canAppend = (order, depth, el) => canAppendSetPointWithRules(order, depth, el, rules);
  const isOrderValid = (order) => chainSatisfiesSetRules(order, rules);
  const hasRules = rules.nextBySource.size > 0 || rules.prevByTarget.size > 0;

  let best;
  if (uniq.length <= exactMaxPoints) {
    best = bestOrderingExact(uniq, getPair, { canAppend });
    if (!best?.order) {
      return { orderedPoints: [], segments: [], totalScore: Infinity, isFallback: false };
    }
  } else {
    /**
     * Heuristic may miss a valid constrained chain for larger sets; if that happens we may relax
     * constraints in the wrapper as a pragmatic fallback to avoid hard no-path dead ends.
     */
    const h = bestOrderingHeuristic(uniq, getPair, {
      canAppend,
      isOrderValid,
      do2opt: !hasRules,
    });
    if (!h?.order) {
      return { orderedPoints: [], segments: [], totalScore: Infinity, isFallback: false };
    }
    best = { order: h.order, score: h.score };
  }

  // Build segments using the actual best path for each consecutive pair.
  const orderedPoints = best.order;
  const segments = [];
  let totalScore = 0;
  let isFallback = false;
  for (let i = 0; i < orderedPoints.length - 1; i++) {
    const from = orderedPoints[i];
    const to = orderedPoints[i + 1];
    const pairOpts =
      rules.allowAssociationForPairs.has(pairKey(from, to)) && options.allowAssociationFallback !== true
        ? { ...options, allowAssociationFallback: true }
        : options;
    const paths = segmentPaths(graph, from, to, pairOpts);
    segments.push({ from, to, paths });
    if (!paths?.length) {
      // In case cache/heuristic picked something that became unreachable under depth caps.
      return { orderedPoints, segments, totalScore: Infinity, isFallback: false };
    }
    const w = pathTotalWeight(paths[0], normalizePathWeights(options));
    totalScore += w;
    if (pathHasAssociationHop(paths[0])) isFallback = true;
  }

  return { orderedPoints, segments, totalScore, isFallback };
}

function findBestChainForSet(graph, points, options = {}) {
  const uniq = [...new Set((points ?? []).filter(Boolean))];
  const finalizeSetResult = (base) => {
    const hasPath = segmentsSearchSucceeded(base?.segments);
    const out = { ...base, searchStatus: hasPath ? SEARCH_STATUS.OK : SEARCH_STATUS.NO_PATH };
    if (out.searchStatus !== SEARCH_STATUS.NO_PATH || !shouldProbeViewpointBlock(options)) {
      return out;
    }
    const fullGraph = buildFullMetamodelProbeGraph(options);
    if (!fullGraph) return out;
    const probe = findBestChainForSet(fullGraph, points, probeOptionsWithoutViewpoint(options));
    if (probe?.searchStatus === SEARCH_STATUS.OK || segmentsSearchSucceeded(probe?.segments)) {
      out.searchStatus = SEARCH_STATUS.BLOCKED_BY_VIEWPOINT;
      // Use the full-metamodel route for display; the filtered graph had no valid chain.
      out.orderedPoints = probe.orderedPoints;
      out.segments = probe.segments;
      out.totalScore = probe.totalScore;
      out.isFallback = probe.isFallback;
    }
    return out;
  };

  const primary = finalizeSetResult(solveBestChainForSetCore(graph, points, options));
  if (options._skipConstraintRelax === true) {
    return { ...primary, edgeConstraintsRelaxed: false, relaxedConstraintCount: 0 };
  }
  if (segmentsSearchSucceeded(primary?.segments)) {
    return { ...primary, edgeConstraintsRelaxed: false, relaxedConstraintCount: 0 };
  }
  const relevantConstraintCount = countRelevantForcedDirectionConstraints(uniq, options.edgeConstraints);
  if (relevantConstraintCount <= 0) {
    return { ...primary, edgeConstraintsRelaxed: false, relaxedConstraintCount: 0 };
  }

  const relaxed = findBestChainForSet(graph, points, {
    ...options,
    edgeConstraints: [],
    _skipConstraintRelax: true,
  });
  if (!segmentsSearchSucceeded(relaxed?.segments)) {
    return { ...primary, edgeConstraintsRelaxed: false, relaxedConstraintCount: 0 };
  }
  return {
    ...relaxed,
    edgeConstraintsRelaxed: true,
    relaxedConstraintCount: relevantConstraintCount,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-WAYPOINT PATHFINDING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find paths through an ordered list of waypoints.
 *
 * Waypoints = [start, ...optionalMidpoints, end]
 * Minimum: 2 waypoints (start + end).
 *
 * For each consecutive pair in the waypoint chain, weighted UCS is run independently.
 * The results are returned as `{ segments, isFallback }` — one segment entry per pair.
 *
 * The caller (UI) is responsible for combining segment paths into full chains
 * and rendering them.  Keeping segments separate means the UI can highlight
 * each segment individually and show the best combo.
 *
 * @param {Map} graph — from buildGraph()
 * @param {string[]} waypoints — e.g. ["Device", "Application Component", "Business Process"]
 * @param {object} options
 * @param {number} [options.maxDepth=4] — max hops per segment
 * @param {number} [options.maxPaths=5] — max paths per segment
 * @param {number} [options.maxStates=25000] — expansion budget per segment
 * @param {boolean} [options.allowAssociationFallback=false] — allow paths whose cheapest route uses penalized Association
 * @param {boolean} [options.includeDerived=true] — must match buildGraph({ includeDerived })
 * @param {number} [options.pathWeightDirect=1] — UCS cost per direct Appendix B hop
 * @param {number} [options.pathWeightDerived=5] — UCS cost per Appendix B.2 derived hop
 * @param {number} [options.pathWeightDerivedPotential=20] — UCS cost per Appendix B.3 potential derived hop
 * @param {number} [options.pathWeightAssociation=100] — UCS cost per §5.2.4 Association hop
 * @param {number} [options.pathWeightLayerSkip=15] — UCS surcharge for hops that skip one or more intermediate core layers
 * @param {boolean} [options.cognitiveLoadPenalty=true] — apply exponential depth penalty to relationship hop weight in UCS routing cost only
 * @param {number} [options.penaltyGracePeriod=3] — first N hops use no depth exponent bump
 * @param {number} [options.penaltyGrowthFactor=2.5] — exponential base after the grace period
 * @returns {{ segments: SegmentResult[], isFallback: boolean, searchStatus: string }}
 */
function findPaths(graph, waypoints, options = {}) {
  if (!waypoints || waypoints.length < 2) {
    throw new Error("findPaths requires at least 2 waypoints (start and end).");
  }

  // Validate all waypoints exist in the graph
  for (const wp of waypoints) {
    if (!graph.has(wp)) {
      // Return an empty result rather than throwing — UI will show "no path"
      console.warn(`findPaths: element "${wp}" not found in graph (may be filtered by viewpoint).`);
    }
  }

  const segments = [];
  let isFallback = false;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i];
    const to   = waypoints[i + 1];
    const paths = segmentPaths(graph, from, to, options);
    segments.push({ from, to, paths });
    if (paths.length && pathHasAssociationHop(paths[0])) {
      isFallback = true;
    }
  }

  let searchStatus = segmentsSearchSucceeded(segments) ? SEARCH_STATUS.OK : SEARCH_STATUS.NO_PATH;
  if (searchStatus === SEARCH_STATUS.NO_PATH && shouldProbeViewpointBlock(options)) {
    const fullGraph = buildFullMetamodelProbeGraph(options);
    if (fullGraph) {
      const probe = findPaths(fullGraph, waypoints, probeOptionsWithoutViewpoint(options));
      if (probe?.searchStatus === SEARCH_STATUS.OK || segmentsSearchSucceeded(probe?.segments)) {
        return {
          segments: probe.segments,
          isFallback: probe.isFallback,
          searchStatus: SEARCH_STATUS.BLOCKED_BY_VIEWPOINT,
        };
      }
    }
  }

  return { segments, isFallback, searchStatus };
}

/**
 * True when every segment has at least one path.
 * @param {SegmentResult[]|null|undefined} segments
 */
function segmentsSearchSucceeded(segments) {
  return Array.isArray(segments) && segments.length > 0 && !segments.some((s) => !s.paths || s.paths.length === 0);
}

/**
 * After a strict search failed under current options, discover which relaxations would connect the waypoints.
 *
 * @param {Map} graph
 * @param {string[]} waypointNames — ordered, may contain empty slots like findPaths receives
 * @param {object} options — same shape as getSearchPathOptions() / findPaths
 * @returns {{ derivedWouldHelp: boolean, associationWouldHelp: boolean }}
 */
function probePathRelaxations(graph, waypointNames, options) {
  let derivedWouldHelp = false;
  if (!options.includeDerived) {
    const r = findPaths(graph, waypointNames, {
      ...options,
      includeDerived: true,
      allowAssociationFallback: false,
    });
    derivedWouldHelp = segmentsSearchSucceeded(r.segments);
  }
  let associationWouldHelp = false;
  if (!options.allowAssociationFallback) {
    const r = findPaths(graph, waypointNames, { ...options, allowAssociationFallback: true });
    associationWouldHelp = segmentsSearchSucceeded(r.segments);
  }
  return { derivedWouldHelp, associationWouldHelp };
}

/**
 * Same as probePathRelaxations for Connect-set mode.
 * @param {Map} graph
 * @param {string[]} points — element names
 * @param {object} options
 * @returns {{ derivedWouldHelp: boolean, associationWouldHelp: boolean }}
 */
function probeSetRelaxations(graph, points, options) {
  let derivedWouldHelp = false;
  if (!options.includeDerived) {
    const r = findBestChainForSet(graph, points, {
      ...options,
      includeDerived: true,
      allowAssociationFallback: false,
    });
    derivedWouldHelp = segmentsSearchSucceeded(r.segments);
  }
  let associationWouldHelp = false;
  if (!options.allowAssociationFallback) {
    const r = findBestChainForSet(graph, points, { ...options, allowAssociationFallback: true });
    associationWouldHelp = segmentsSearchSucceeded(r.segments);
  }
  return { derivedWouldHelp, associationWouldHelp };
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULT SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Summarise segment results into a flat PathResult for display.
 *
 * Picks the best (lowest-score) path from each segment and stitches them
 * together into a single summary object.
 *
 * @param {string[]} waypoints
 * @param {SegmentResult[]} segments
 * @returns {PathResult|null} null if any segment has no paths
 */
function buildBestPathResult(waypoints, segments) {
  const bestPaths = [];
  let totalHops = 0;
  let derivedCount = 0;

  for (const seg of segments) {
    if (seg.paths.length === 0) return null; // No route through this segment
    const best = seg.paths[0]; // already sorted by score
    bestPaths.push(best);
    totalHops    += best.length - 1;
    derivedCount += best.filter(s => s.isDirect === false).length;
  }

  return { waypoints, segments, bestPaths, totalHops, derivedCount };
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSPECTIVE ENGINE — PATH CLUSTERING
// ─────────────────────────────────────────────────────────────────────────────

function flattenSegmentsForIndex(segments, pathIdx) {
  const flat = [];
  for (let s = 0; s < (segments?.length || 0); s++) {
    const path = segments[s].paths?.[pathIdx] ?? segments[s].paths?.[0];
    if (!path || !path.length) continue;
    flat.push(...(s === 0 ? path : path.slice(1)));
  }
  return flat;
}

/**
 * Sum UCS routing costs across waypoint segments for one composite route alternative.
 * @param {{ paths?: Path[] }[]} segments
 * @param {number} pathIdx
 * @param {{ direct: number, derived: number, association: number, violation: number, layerSkip: number }} weights
 */
function compositeStitchedUcsRoutingCost(segments, pathIdx, weights) {
  let sum = 0;
  for (let s = 0; s < (segments?.length || 0); s++) {
    const path = segments[s].paths?.[pathIdx] ?? segments[s].paths?.[0];
    if (!path?.length) continue;
    if (Number.isFinite(path.ucsRoutingCost)) sum += path.ucsRoutingCost;
    else sum += pathTotalWeight(path, weights);
  }
  return sum;
}

function getLayerBucketForPathMeta(elementName) {
  const layer =
    typeof getElementLayer === "function"
      ? getElementLayer(elementName)
      : (() => {
          const L = ELEMENTS?.[elementName]?.layer ?? "Unknown";
          return L === "Physical" ? "Technology" : L;
        })();
  if (layer === "Motivation" || layer === "Strategy" || layer === "Business") return "upper";
  if (layer === "Application") return "middle";
  if (layer === "Technology") return "lower";
  if (layer === "Implementation") return "project";
  if (layer === "Composite") return "composite";
  return "other";
}

function normalizePerspectiveBucketSupport(raw, fallback) {
  if (raw == null || typeof raw !== "object") return { ...fallback };
  return {
    A: typeof raw.A === "boolean" ? raw.A : !!fallback.A,
    B: typeof raw.B === "boolean" ? raw.B : !!fallback.B,
    C: typeof raw.C === "boolean" ? raw.C : !!fallback.C,
  };
}

/**
 * Compute which perspective buckets are naturally reachable under a viewpoint palette.
 * A = upper, B = infrastructure, C = cross-layer.
 * @param {string|null|undefined} viewpointKey
 * @returns {{ A: boolean, B: boolean, C: boolean }}
 */
function getViewpointPerspectiveSupport(viewpointKey) {
  const key = viewpointKey == null ? "" : String(viewpointKey);
  const vp = key && typeof VIEWPOINTS !== "undefined" ? VIEWPOINTS?.[key] : null;
  const allowAll = !vp || !!vp.allElements;
  const computed = allowAll
    ? { A: true, B: true, C: true }
    : (() => {
      let supportsUpperPalette = false;
      let supportsInfraPalette = false;
      const elements = Array.isArray(vp.elements) ? vp.elements : [];
      for (const elementName of elements) {
        const bucket = getLayerBucketForPathMeta(elementName);
        if (bucket === "upper") supportsUpperPalette = true;
        if (bucket === "middle" || bucket === "lower" || bucket === "project") supportsInfraPalette = true;
      }
      return {
        A: supportsUpperPalette,
        B: supportsInfraPalette,
        C: supportsUpperPalette && supportsInfraPalette,
      };
    })();

  const overrides =
    typeof VIEWPOINT_PERSPECTIVE_SUPPORT_OVERRIDES !== "undefined" && key
      ? VIEWPOINT_PERSPECTIVE_SUPPORT_OVERRIDES?.[key]
      : null;
  return normalizePerspectiveBucketSupport(overrides, computed);
}

/**
 * Human-readable summary of the active viewpoint's layer focus.
 * @param {string|null|undefined} viewpointKey
 * @returns {string}
 */
function describeViewpointLayerFocus(viewpointKey) {
  const key = viewpointKey == null ? "" : String(viewpointKey);
  const vp = key && typeof VIEWPOINTS !== "undefined" ? VIEWPOINTS?.[key] : null;
  if (!vp) return "all layers";
  if (vp.allElements) return "all ArchiMate layers";
  const labels = [];
  const seen = new Set();
  const elements = Array.isArray(vp.elements) ? vp.elements : [];
  for (const name of elements) {
    const layer =
      typeof getElementLayer === "function"
        ? getElementLayer(name)
        : (() => {
            const L = ELEMENTS?.[name]?.layer;
            if (!L) return null;
            return L === "Physical" ? "Technology" : L;
          })();
    if (!layer || seen.has(layer)) continue;
    seen.add(layer);
    labels.push(layer);
  }
  if (!labels.length) return "the selected element palette";
  if (labels.length === 1) return `${labels[0]} layer`;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]} layers`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]} layers`;
}

/**
 * Recommend viewpoints that support a target perspective bucket.
 * @param {"A"|"B"|"C"|string} targetBucket
 * @param {string|null|undefined} currentKey
 * @param {{ max?: number }} [opts]
 * @returns {Array<{ key: string, name: string }>}
 */
function suggestAlternativeViewpoints(targetBucket, currentKey, opts = {}) {
  const bucket = String(targetBucket || "").toUpperCase();
  if (bucket !== "A" && bucket !== "B" && bucket !== "C") return [];
  const max = Math.max(1, Math.min(5, Number(opts.max ?? 2)));
  const cur = currentKey == null ? "" : String(currentKey);
  const out = [];
  const all = typeof VIEWPOINTS !== "undefined" && VIEWPOINTS ? Object.keys(VIEWPOINTS) : [];
  for (const key of all) {
    if (!key || key === cur) continue;
    const vp = VIEWPOINTS[key];
    if (!vp) continue;
    const support = getViewpointPerspectiveSupport(key);
    if (!support[bucket]) continue;
    out.push({ key, name: vp.name || key });
  }
  out.sort((a, b) => {
    const aLayered = a.key === "layered" ? 0 : 1;
    const bLayered = b.key === "layered" ? 0 : 1;
    if (aLayered !== bLayered) return aLayered - bLayered;
    return String(a.name).localeCompare(String(b.name));
  });
  return out.slice(0, max);
}

/**
 * Resolve ArchiMate element type name for a path step (registry keys are canonical type names).
 * @param {PathStep} s
 * @returns {string}
 */
function archimateElementTypeForPrecisionStep(s) {
  const elems = typeof ELEMENTS !== "undefined" ? ELEMENTS : globalThis.ELEMENTS;
  if (typeof s?.targetType === "string" && s.targetType.trim()) return s.targetType.trim();
  if (s?.targetId && elems && elems[s.targetId]) {
    const meta = elems[s.targetId];
    return typeof meta?.type === "string" && meta.type.trim() ? meta.type.trim() : String(s.targetId);
  }
  const el = typeof s?.element === "string" ? s.element.trim() : "";
  if (el && elems && elems[el]) {
    const meta = elems[el];
    return typeof meta?.type === "string" && meta.type.trim() ? meta.type.trim() : el;
  }
  return el;
}

/** ArchiMate element names on the path that indicate Motivation / Strategy “executive” semantics for precision scoring. */
const EXECUTIVE_ELEMENT_TYPES = [
  "Stakeholder", "Driver", "Assessment", "Goal", "Outcome", "Value", "Meaning",
  "Requirement", "Constraint", "Principle", "Resource", "Capability", "Course of Action",
];

/**
 * Continuous simplification index (0–100) from semantic weight (30), compression (70), and Association penalty (−50 gate).
 * UI still maps the returned `label` only (Simplified vs Ground-Truth).
 * @param {PathStep[]} flatSteps
 * @param {number} [routingCost=0] — UCS routing total for this alternative (stitched across segments when multi-waypoint)
 * @param {boolean} [isLenient=false] — when true, Simplified vs Ground-Truth uses threshold 40 instead of 60
 * @returns {{
 *   label: "Simplified"|"Ground-Truth",
 *   totalScore: number,
 *   semanticScore: number,
 *   compressionScore: number,
 *   penaltyScore: number,
 *   hasAssociation: boolean
 * }}
 */
function calculatePrecisionMetrics(flatSteps, routingCost = 0, isLenient = false) {
  const hasDerived = flatSteps.some((s, i) => i > 0 && s?.isDirect === false);
  const hasAssociation = flatSteps.some((s) => s?.isAssociation);

  let semanticScore = 0;
  let compressionScore = 0;
  let penaltyScore = 0;

  if (hasDerived) {
    const hasExecutiveSemantics = flatSteps.some((s) => {
      const type = archimateElementTypeForPrecisionStep(s);
      return type && EXECUTIVE_ELEMENT_TYPES.includes(type);
    });
    semanticScore = hasExecutiveSemantics ? 30 : 0;

    const MAX_EXPECTED_COST = 15;
    const COMPRESSION_WEIGHT_MAX = 70;
    const cost = Number(routingCost);
    const safeCost = Number.isFinite(cost) && cost > 0 ? cost : 0;
    compressionScore = Math.min(
      (safeCost / MAX_EXPECTED_COST) * COMPRESSION_WEIGHT_MAX,
      COMPRESSION_WEIGHT_MAX
    );
  }

  if (hasAssociation) {
    penaltyScore = -50;
  }

  const rawTotal = semanticScore + compressionScore + penaltyScore;
  const totalScore = Math.max(0, Math.min(Math.round(rawTotal), 100));

  const SIMPLIFIED_THRESHOLD = isLenient ? 40 : 60;
  const label = totalScore >= SIMPLIFIED_THRESHOLD ? "Simplified" : "Ground-Truth";

  return {
    label,
    totalScore,
    semanticScore,
    compressionScore,
    penaltyScore,
    hasAssociation,
  };
}

function classifyLayerLabel(flatSteps) {
  const counts = { upper: 0, middle: 0, lower: 0, project: 0, composite: 0, other: 0 };
  for (const step of flatSteps) {
    const elementName = archimateElementTypeForPrecisionStep(step);
    const bucket = getLayerBucketForPathMeta(elementName);
    if (counts[bucket] !== undefined) counts[bucket] += 1;
  }

  const { upper, middle, lower, project } = counts;

  if (project > upper && project > middle && project > lower) return "Implementation-Heavy";
  if (
    (middle > upper && middle > lower && middle > project) ||
    (lower > upper && lower >= middle && lower > project)
  ) {
    return "Technology-Heavy";
  }
  if (upper > lower && upper >= middle && upper > project) return "Business-Heavy";
  if (upper > 0 && lower > 0) return "Full-Stack Alignment";
  if (project > 0 && upper === 0 && middle === 0 && lower === 0) return "Implementation-Heavy";
  if (middle > 0 && upper === 0 && lower === 0) return "Technology-Heavy";
  if (lower > 0 && upper === 0) return "Technology-Heavy";
  if (upper > 0 && lower === 0) return "Business-Heavy";

  return "Cross-Layer Alignment";
}

function classifyPerspective(
  flatSteps,
  { perspectiveClassMode = "exclusive", perspectiveDominantShare = 0.7 } = {}
) {
  let hasUpper = false;
  let hasInfra = false;
  let upperCount = 0;
  let infraCount = 0;
  for (const step of flatSteps) {
    const b = getLayerBucketForPathMeta(step?.element);
    if (b === "upper") {
      hasUpper = true;
      upperCount += 1;
    }
    if (b === "middle" || b === "lower" || b === "project") {
      hasInfra = true;
      infraCount += 1;
    }
  }

  const mode = perspectiveClassMode === "dominant-share" ? "dominant-share" : "exclusive";
  if (mode === "dominant-share") {
    const total = upperCount + infraCount;
    if (total <= 0) return "C";
    const threshold = Math.max(0.5, Math.min(0.9, Number(perspectiveDominantShare) || 0.7));
    const upperShare = upperCount / total;
    const infraShare = infraCount / total;
    if (upperShare >= threshold && upperShare > infraShare) return "A";
    if (infraShare >= threshold && infraShare > upperShare) return "B";
    return "C";
  }
  if (hasUpper && !hasInfra) return "A";
  if (!hasUpper && hasInfra) return "B";
  return "C";
}

/**
 * Build perspective metadata for all current path alternatives.
 * @param {SegmentResult[]} segments
 * @param {{
 *   pathWeightDirect?: number,
 *   pathWeightDerived?: number,
 *   pathWeightDerivedPotential?: number,
 *   pathWeightAssociation?: number,
 *   pathWeightLayerSkip?: number,
 *   perspectiveClassMode?: "exclusive"|"dominant-share",
 *   perspectiveDominantShare?: number,
 *   lenientSimplification?: boolean
 * }} [weightOpts] — same hop costs as path search (for totalWeight display and perspective grouping)
 * @returns {{
 *   byPerspective: { A: any[], B: any[], C: any[] },
 *   byPathIndex: Record<string, any>,
 *   all: any[]
 * }} Each meta includes costDirect, costDerived, costDerivedPotential, costAssociation, costLayerSkip, costViolation (weighted subtotals), ucsRoutingTotal,
 *   precisionScore (0–100), precisionFactors: { semantic, compression, penalty }.
 */
function clusterPaths(segments, weightOpts = {}) {
  const weights = normalizePathWeights(weightOpts);
  const lenientSimplification = !!weightOpts.lenientSimplification;
  const maxAlts = Math.max(0, ...((segments || []).map((s) => s.paths?.length || 0)));
  const byPerspective = { A: [], B: [], C: [] };
  const byPathIndex = {};
  const all = [];

  for (let i = 0; i < maxAlts; i++) {
    const flatSteps = flattenSegmentsForIndex(segments, i);
    if (!flatSteps.length) continue;
    const hopCount = Math.max(0, flatSteps.length - 1);
    const totalWeight = pathTotalWeight(flatSteps, weights);
    const ucsRoutingTotal = compositeStitchedUcsRoutingCost(segments, i, weights);
    const pathCost = ucsRoutingTotal;
    const bd = pathCostBreakdown(flatSteps, weights);
    const layerLabel = classifyLayerLabel(flatSteps);
    const precisionMetrics = calculatePrecisionMetrics(flatSteps, pathCost, lenientSimplification);
    const perspective = classifyPerspective(flatSteps, {
      perspectiveClassMode: weightOpts?.perspectiveClassMode,
      perspectiveDominantShare: weightOpts?.perspectiveDominantShare,
    });

    const meta = {
      pathIndex: i,
      hopCount,
      totalWeight,
      ucsRoutingTotal,
      costDirect: bd.direct,
      costDerived: bd.derived,
      costDerivedPotential: bd.derivedPotential,
      costAssociation: bd.association,
      costLayerSkip: bd.layerSkip,
      costViolation: bd.violation,
      layerLabel,
      precisionLabel: precisionMetrics.label,
      precisionScore: precisionMetrics.totalScore,
      precisionFactors: {
        semantic: precisionMetrics.semanticScore,
        compression: precisionMetrics.compressionScore,
        penalty: precisionMetrics.penaltyScore,
      },
      perspective,
      hasDerived: precisionMetrics.label === "Simplified",
      hasAssociation: precisionMetrics.hasAssociation,
      isGroundTruth: precisionMetrics.label === "Ground-Truth",
    };
    byPerspective[perspective].push(meta);
    byPathIndex[String(i)] = meta;
    all.push(meta);
  }

  return { byPerspective, byPathIndex, all };
}

/**
 * Find nearest candidate elements (by hop count) from one or more source nodes,
 * filtered by layer bucket.
 *
 * Uses BFS over the active graph and skips universal Association bridges by default,
 * otherwise every node could appear 1 hop away when fallback is enabled.
 *
 * @param {Map<string, Array<{to:string,isAssociation?:boolean}>>} graph
 * @param {string[]} sourceElements
 * @param {string[]|Set<string>} targetBuckets - bucket ids from getLayerBucketForPathMeta
 * @param {{ maxResults?: number, maxDepth?: number, skipAssociation?: boolean }} [options]
 * @returns {Array<{ element: string, distance: number, layer: string, bucket: string }>}
 */
/**
 * Motivation + Strategy element names that read as business / strategy waypoints
 * (explicit matrix hops; not generic Business-layer application types).
 */
const EXECUTIVE_SUGGESTION_ELEMENT_NAMES = new Set([
  "Stakeholder",
  "Driver",
  "Assessment",
  "Goal",
  "Outcome",
  "Principle",
  "Requirement",
  "Value",
  "Resource",
  "Capability",
  "Value Stream",
  "Course of Action",
]);

function buildReverseAdjacencyForSuggestions(graph, skipAssociation) {
  const rev = new Map();
  if (!graph || typeof graph.entries !== "function") return rev;
  for (const [from, edges] of graph.entries()) {
    if (!Array.isArray(edges)) continue;
    for (const edge of edges) {
      if (!edge || !edge.to) continue;
      if (skipAssociation && edge.isAssociation) continue;
      if (!rev.has(edge.to)) rev.set(edge.to, []);
      rev.get(edge.to).push(from);
    }
  }
  return rev;
}

/**
 * Suggest Motivation/Strategy element types 1–2 explicit (non-Association) hops from the
 * route endpoints, using the same directed graph the pathfinder uses.
 *
 * @param {string|null|undefined} startElement
 * @param {string|null|undefined} targetElement
 * @param {Map<string, Array<{ to: string, isAssociation?: boolean }>>} graph
 * @param {{ maxResults?: number, maxDepth?: number, skipAssociation?: boolean, excludeElements?: Set<string>|string[] }} [options]
 * @returns {Array<{ id: string, name: string, type: string, distance: number }>}
 */
function findNearbyExecutiveElements(startElement, targetElement, graph, options = {}) {
  const maxResults = Math.max(1, Number(options.maxResults ?? 2));
  const maxDepth = Math.min(2, Math.max(1, Number(options.maxDepth ?? 2)));
  const skipAssociation = options.skipAssociation !== false;
  const rawEx = options.excludeElements;
  const exclude =
    rawEx instanceof Set ? rawEx : new Set(Array.isArray(rawEx) ? rawEx : []);

  const seeds = Array.from(
    new Set(
      [startElement, targetElement]
        .map((s) => String(s || "").trim())
        .filter((n) => n && graph && typeof graph.has === "function" && graph.has(n))
    )
  );
  if (!seeds.length || !graph || typeof graph.get !== "function") return [];

  const revAdj = buildReverseAdjacencyForSuggestions(graph, skipAssociation);
  const bestDist = new Map();
  const queue = [];
  for (const s of seeds) {
    bestDist.set(s, 0);
    queue.push({ node: s, dist: 0 });
  }

  while (queue.length) {
    const cur = queue.shift();
    if (!cur) continue;
    const { node, dist } = cur;
    if (dist >= maxDepth) continue;

    const relax = (next) => {
      if (!next || next === node) return;
      const nd = dist + 1;
      const prev = bestDist.get(next);
      if (prev !== undefined && prev <= nd) return;
      bestDist.set(next, nd);
      queue.push({ node: next, dist: nd });
    };

    const outs = graph.get(node) || [];
    for (const edge of outs) {
      if (!edge || !edge.to) continue;
      if (skipAssociation && edge.isAssociation) continue;
      relax(edge.to);
    }
    const ins = revAdj.get(node) || [];
    for (const from of ins) {
      relax(from);
    }
  }

  const rows = [];
  for (const [el, d] of bestDist) {
    if (d < 1 || d > maxDepth) continue;
    if (seeds.includes(el)) continue;
    if (exclude.has(el)) continue;
    if (!EXECUTIVE_SUGGESTION_ELEMENT_NAMES.has(el)) continue;
    const layer = ELEMENTS?.[el]?.layer || "";
    const typeLabel = layer === "Motivation" || layer === "Strategy" ? layer : el;
    rows.push({ el, d, typeLabel });
  }
  rows.sort((a, b) => a.d - b.d || a.el.localeCompare(b.el));
  return rows.slice(0, maxResults).map(({ el, d, typeLabel }) => ({
    id: el,
    name: el,
    type: typeLabel,
    distance: d,
  }));
}

function findNearestElementsByBucket(graph, sourceElements, targetBuckets, options = {}) {
  if (!graph || typeof graph.get !== "function") return [];
  const maxResults = Math.max(1, Number(options.maxResults ?? 3));
  const maxDepth = Math.max(1, Number(options.maxDepth ?? 5));
  const skipAssociation = options.skipAssociation !== false;
  const bucketSet = targetBuckets instanceof Set ? targetBuckets : new Set(targetBuckets || []);
  if (bucketSet.size === 0) return [];

  const seeds = Array.from(new Set((sourceElements || []).filter((n) => !!n && graph.has(n))));
  if (!seeds.length) return [];
  const seedSet = new Set(seeds);

  const queue = [];
  const visited = new Set();
  for (const s of seeds) {
    queue.push({ node: s, dist: 0 });
    visited.add(s);
  }

  const out = [];
  while (queue.length) {
    const cur = queue.shift();
    if (!cur) continue;
    const { node, dist } = cur;
    if (dist > maxDepth) continue;

    if (dist > 0 && !seedSet.has(node)) {
      const bucket = getLayerBucketForPathMeta(node);
      if (bucketSet.has(bucket)) {
        out.push({
          element: node,
          distance: dist,
          layer:
            typeof getElementLayer === "function"
              ? getElementLayer(node)
              : (() => {
                  const L = ELEMENTS?.[node]?.layer ?? "Unknown";
                  return L === "Physical" ? "Technology" : L;
                })(),
          bucket,
        });
        if (out.length >= maxResults) break;
      }
    }

    if (dist >= maxDepth) continue;
    const edges = graph.get(node) || [];
    for (const edge of edges) {
      if (!edge || !edge.to) continue;
      if (skipAssociation && edge.isAssociation) continue;
      const next = edge.to;
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push({ node: next, dist: dist + 1 });
    }
  }

  return out;
}

/**
 * Get a human-readable label for a path's relationship codes.
 * Used by the explanation panel.
 *
 * @param {string[]} codes — e.g. ["I","V"]
 * @param {boolean} isDirect
 * @returns {string} — e.g. "Assignment, Serving (direct)"
 */
function describeEdge(codes, isDirect) {
  const CODE_NAMES = {
    S:"Specialization", C:"Composition", G:"Aggregation",
    I:"Assignment",     R:"Realization", V:"Serving",
    A:"Access",         N:"Influence",   O:"Association", T:"Triggering",
    F:"Flow",
    // derived (lowercase) — same names, isDirect flag distinguishes them
    s:"Specialization", c:"Composition", g:"Aggregation",
    i:"Assignment",     r:"Realization", v:"Serving",
    a:"Access",         n:"Influence",   o:"Association", t:"Triggering",
    f:"Flow",
  };
  const names = codes.map(c => CODE_NAMES[c] ?? c).join(", ");
  return `${names} (${isDirect ? "direct" : "derived"})`;
}
