// === app ===

// ── App state ───────────────────────────────────────────────────────────────
// We use window.state to ensure the HTML dropdowns can see it
window.state = {
  mode:           'compact',
  /** When true, pathfinding also includes §5.7 derived (lowercase) relationships for simplified routing options. */
  includeDerived: true,
  selectionMode:  'set',
  viewpoint:      null,
  allowedElements: null,
  waypoints:      [],
  graph:          null,
  segments:       null,
  activePathIdx:  0,
  lastAutoOrdered: false,
  lastAutoOrderInput: null,
  lastAutoOrderResult: null,
  /** Set after Connect-set find: cost, point count, exact vs heuristic ordering, BFS cap. */
  lastAutoOrderMetrics: null,
  loading: true,
  showBadges: true,
  /** When true, show illustrated composite sub-components (boxes around composites). */
  showCompositeSubs: true,
  /** Path geometry: horizontal (strip or spread swimlanes) → vertical stack → compact orthogonal lanes. */
  pathFlow: "horizontal",
  userChoices: {},
  /** When true, quick examples stay visible even with ≥2 elements chosen. */
  forceShowQuickExamples: false,
  /** Last metamodel hop (for modal + role table sync). */
  mmLast: null,
  /** Pathfinder: max relationship hops per segment (2–12). */
  searchMaxDepth: 6,
  /** Up to this many alternative routes per segment (1–10). */
  searchMaxPaths: 5,
  /** Expansion budget preset: fast | balanced | thorough → maxStates in pathfinder. */
  searchEffort: "balanced",
  /** UCS cost per direct Appendix B hop (integer 1–500). */
  searchPathWeightDirect: 1,
  /** UCS cost per §5.7 derived hop. */
  searchPathWeightDerived: 5,
  /** UCS cost per §5.2.4 Association hop. */
  searchPathWeightAssociation: 100,
  /** UCS surcharge for hops that skip intermediate core layers. */
  searchPathWeightLayerSkip: 15,
  /** UCS cost surcharge for Discovery-mode semantic violations on a hop. */
  searchPathWeightViolation: 50,
  /** Semantic rigor preset: academic | pragmatic | discovery | custom. */
  searchRigorPreset: "academic",
  /** Strict semantic gate: disallow Core→Core detours through Motivation/Strategy. */
  restrictCoreToCore: true,
  /** Strict semantic gate: enforce trajectory grammar (V-shape blocker). */
  enforceGrammar: true,
  /** When grammar is on, treat Realization as directional trajectory carrier. */
  strictRealization: true,
  /** Perspective grouping classifier: exclusive | dominant-share */
  perspectiveClassMode: "exclusive",
  /** Dominant-share classifier threshold in percent (50–90). */
  perspectiveDominantSharePct: 50,
  /** Allow §5.2.4 Association bridges when no strict Appendix B chain exists (penalized unless target is Value/Meaning). */
  allowAssociationFallback: false,
  /** Thematic context for labels and perspective storytelling copy. */
  domainContext: "abstract",
  /** Set after last successful findPath when any segment used penalized Association. */
  lastPathIsFallback: false,
  /** When last search found no path: which relaxations would help (from probePathRelaxations / probeSetRelaxations). */
  pathFailureHints: null,
  /** Last search outcome from pathfinder: ok | no_path | BLOCKED_BY_VIEWPOINT. */
  lastPathSearchStatus: null,
  /** After a successful path from a one-shot relax CTA: which rules were temporarily used (Options stay strict). */
  lastPathTemporaryRelaxation: null,
  /** Snapshot while findPath runs with relaxed rules from overlay/diagnostics; restored after search completes. */
  _relaxOneShotRestore: null,
  /** One-shot override: run next search on a full metamodel graph regardless of active viewpoint. */
  _pathfindFullMetamodelOnce: false,
  /** When true, perspective recommendations are computed on full metamodel (outside active viewpoint). */
  _perspectiveSuggestFullMetamodel: false,
  /** Monotonic id for async path searches; used to ignore stale results. */
  _findRunId: 0,
  /** Last find run id for which the path-failure modal was shown (avoid duplicate modals per search). */
  _pathFailModalShownForRunId: null,
  /** True while an async findPath run is in flight. */
  _finding: false,
  /** requestAnimationFrame gate to avoid redundant renderResults calls in one tick. */
  _renderScheduled: false,
};

// Create a shortcut so the rest of this file's code doesn't break
const state = window.state;

// ── Optional analytics (Umami) ───────────────────────────────────────────────
function trackEvent(name, data) {
  try {
    const fn = window.umami && typeof window.umami.track === "function" ? window.umami.track : null;
    if (!fn) return;
    fn(name, data && typeof data === "object" ? data : undefined);
  } catch (_) {
    // Analytics must never break the app.
  }
}

/**
 * Schedule a single renderResults() on the next animation frame.
 * Prevents double-rendering cascades when multiple UI actions update state in one tick.
 */
function scheduleRenderResults() {
  if (state._renderScheduled) return;
  state._renderScheduled = true;
  requestAnimationFrame(() => {
    state._renderScheduled = false;
    renderResults();
  });
}

/**
 * Minimal explicit action layer: funnels expensive operations (findPath/render) through a single queue point.
 * This makes it harder for UI + engine to drift out-of-sync and avoids stale async search results overwriting newer ones.
 */
window.dispatch = function dispatch(action) {
  const a = action && typeof action === "object" ? action : { type: String(action || "") };
  switch (a.type) {
    case "FIND_PATH": {
      // Bump run id so any in-flight async callbacks can be ignored if they complete later.
      state._findRunId = (state._findRunId | 0) + 1;
      // Preserve existing global entrypoint for onclick handlers, but pass run context via state.
      window.findPath?.({ runId: state._findRunId, reason: a.reason || "" });
      return;
    }
    case "RENDER_RESULTS": {
      scheduleRenderResults();
      return;
    }
    default:
      // no-op for now (future actions can be added here)
      return;
  }
};

const SEARCH_EFFORT_MAX_STATES = {
  fast: 8000,
  balanced: 25000,
  thorough: 100000,
};

const SEARCH_RIGOR_PRESETS = Object.freeze({
  academic:   { restrictCoreToCore: true,  enforceGrammar: true,  allowAssociationFallback: false, strictRealization: true  },
  pragmatic:  { restrictCoreToCore: true,  enforceGrammar: false, allowAssociationFallback: true,  strictRealization: false },
  discovery:  { restrictCoreToCore: false, enforceGrammar: false, allowAssociationFallback: true,  strictRealization: false },
});

function clampSearchDepth(n) {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return 6;
  return Math.max(2, Math.min(12, x));
}

function clampSearchMaxPaths(n) {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return 5;
  return Math.max(1, Math.min(10, x));
}

function normalizeSearchEffort(v) {
  return v === "fast" || v === "thorough" ? v : "balanced";
}

function normalizeSearchRigorPreset(v) {
  const k = String(v || "academic").toLowerCase();
  if (k === "academic" || k === "pragmatic" || k === "discovery" || k === "custom") return k;
  return "academic";
}

function clampSearchPathWeight(n, def) {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return def;
  return Math.max(1, Math.min(500, x));
}

function isPresetSemanticMatch(presetKey) {
  const p = SEARCH_RIGOR_PRESETS[presetKey];
  if (!p) return false;
  return !!state.restrictCoreToCore === !!p.restrictCoreToCore
    && !!state.enforceGrammar === !!p.enforceGrammar
    && !!state.allowAssociationFallback === !!p.allowAssociationFallback
    && !!state.strictRealization === !!p.strictRealization;
}

function applySearchRigorPresetToState(presetKey) {
  const p = SEARCH_RIGOR_PRESETS[presetKey];
  if (!p) return;
  state.searchRigorPreset = presetKey;
  state.restrictCoreToCore = !!p.restrictCoreToCore;
  state.enforceGrammar = !!p.enforceGrammar;
  state.allowAssociationFallback = !!p.allowAssociationFallback;
  state.strictRealization = !!p.strictRealization;
}

function normalizePerspectiveClassMode(v) {
  return v === "dominant-share" ? "dominant-share" : "exclusive";
}

function clampPerspectiveDominantSharePct(n) {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return 50;
  return Math.max(50, Math.min(90, x));
}

function normalizeDomainContext(v) {
  const k = String(v || "abstract");
  if (typeof SCENARIOS !== "undefined" && SCENARIOS && Object.prototype.hasOwnProperty.call(SCENARIOS, k)) {
    return k;
  }
  return "abstract";
}

function resolveViewpointSearchContext({ forceFullMetamodel = false } = {}) {
  const selectedKey = state.viewpoint ? String(state.viewpoint) : null;
  if (forceFullMetamodel || !selectedKey) {
    return { viewpointKey: null, viewpointStrict: false, allowedRelationshipCodes: null };
  }
  const vp = typeof VIEWPOINTS !== "undefined" ? VIEWPOINTS?.[selectedKey] : null;
  const viewpointStrict = !!(vp && !vp.allElements);
  const allowedRelationshipCodes =
    viewpointStrict && typeof getViewpointRelationshipAllowance === "function"
      ? getViewpointRelationshipAllowance(selectedKey)
      : null;
  return {
    viewpointKey: selectedKey,
    viewpointStrict,
    allowedRelationshipCodes: allowedRelationshipCodes instanceof Set ? allowedRelationshipCodes : null,
  };
}

/** Options passed to findPaths / findBestChainForSet (pathfinder.js). */
function getSearchPathOptions({ forceFullMetamodel = false } = {}) {
  const effort = normalizeSearchEffort(state.searchEffort);
  const maxStates = SEARCH_EFFORT_MAX_STATES[effort] ?? SEARCH_EFFORT_MAX_STATES.balanced;
  const perspectiveMode = normalizePerspectiveClassMode(state.perspectiveClassMode);
  const dominantSharePct = clampPerspectiveDominantSharePct(state.perspectiveDominantSharePct);
  const vpCtx = resolveViewpointSearchContext({ forceFullMetamodel });
  return {
    maxDepth: clampSearchDepth(state.searchMaxDepth),
    maxPaths: clampSearchMaxPaths(state.searchMaxPaths),
    maxStates,
    pathWeightDirect: clampSearchPathWeight(state.searchPathWeightDirect, 1),
    pathWeightDerived: clampSearchPathWeight(state.searchPathWeightDerived, 5),
    pathWeightAssociation: clampSearchPathWeight(state.searchPathWeightAssociation, 100),
    pathWeightLayerSkip: clampSearchPathWeight(state.searchPathWeightLayerSkip, 15),
    pathViolationPenalty: clampSearchPathWeight(state.searchPathWeightViolation, 50),
    /** Must match buildGraph({ includeDerived }) — controls which matrix letters appear on each hop. */
    includeDerived: !!state.includeDerived,
    allowAssociationFallback: !!state.allowAssociationFallback,
    restrictCoreToCore: !!state.restrictCoreToCore,
    enforceGrammar: !!state.enforceGrammar,
    strictRealization: !!state.strictRealization,
    perspectiveClassMode: perspectiveMode,
    perspectiveDominantShare: dominantSharePct / 100,
    viewpointKey: vpCtx.viewpointKey,
    viewpointStrict: vpCtx.viewpointStrict,
    allowedRelationshipCodes: vpCtx.allowedRelationshipCodes,
  };
}

function applySearchOptionsToUI() {
  const d = document.getElementById("search-max-depth");
  const p = document.getElementById("search-max-paths");
  const e = document.getElementById("search-effort");
  const wd = document.getElementById("search-weight-direct");
  const wder = document.getElementById("search-weight-derived");
  const wa = document.getElementById("search-weight-association");
  const wls = document.getElementById("search-weight-layer-skip");
  const wv = document.getElementById("search-weight-violation");
  const srp = document.getElementById("search-rigor-preset");
  const rc = document.getElementById("restrict-core-to-core");
  const eg = document.getElementById("enforce-grammar");
  const str = document.getElementById("strict-realization");
  const pcm = document.getElementById("perspective-class-mode");
  const pcs = document.getElementById("perspective-dominant-share");
  const af = document.getElementById("allow-association-fallback");
  if (d) d.value = String(clampSearchDepth(state.searchMaxDepth));
  if (p) p.value = String(clampSearchMaxPaths(state.searchMaxPaths));
  if (e) e.value = normalizeSearchEffort(state.searchEffort);
  if (wd) wd.value = String(clampSearchPathWeight(state.searchPathWeightDirect, 1));
  if (wder) wder.value = String(clampSearchPathWeight(state.searchPathWeightDerived, 5));
  if (wa) wa.value = String(clampSearchPathWeight(state.searchPathWeightAssociation, 100));
  if (wls) wls.value = String(clampSearchPathWeight(state.searchPathWeightLayerSkip, 15));
  if (wv) wv.value = String(clampSearchPathWeight(state.searchPathWeightViolation, 50));
  if (srp) srp.value = normalizeSearchRigorPreset(state.searchRigorPreset);
  if (rc) rc.checked = !!state.restrictCoreToCore;
  if (eg) eg.checked = !!state.enforceGrammar;
  if (str) {
    str.checked = !!state.strictRealization;
    str.disabled = !state.enforceGrammar;
  }
  if (pcm) pcm.value = normalizePerspectiveClassMode(state.perspectiveClassMode);
  if (pcs) {
    pcs.value = String(clampPerspectiveDominantSharePct(state.perspectiveDominantSharePct));
    pcs.disabled = normalizePerspectiveClassMode(state.perspectiveClassMode) !== "dominant-share";
  }
  if (af) af.checked = !!state.allowAssociationFallback;
}

window.onSearchOptionsChange = function onSearchOptionsChange() {
  const d = document.getElementById("search-max-depth");
  const p = document.getElementById("search-max-paths");
  const e = document.getElementById("search-effort");
  const wd = document.getElementById("search-weight-direct");
  const wder = document.getElementById("search-weight-derived");
  const wa = document.getElementById("search-weight-association");
  const wls = document.getElementById("search-weight-layer-skip");
  const wv = document.getElementById("search-weight-violation");
  const rc = document.getElementById("restrict-core-to-core");
  const eg = document.getElementById("enforce-grammar");
  const str = document.getElementById("strict-realization");
  const pcm = document.getElementById("perspective-class-mode");
  const pcs = document.getElementById("perspective-dominant-share");
  if (d) state.searchMaxDepth = clampSearchDepth(d.value);
  if (p) state.searchMaxPaths = clampSearchMaxPaths(p.value);
  if (e) state.searchEffort = normalizeSearchEffort(e.value);
  if (wd) state.searchPathWeightDirect = clampSearchPathWeight(wd.value, 1);
  if (wder) state.searchPathWeightDerived = clampSearchPathWeight(wder.value, 5);
  if (wa) state.searchPathWeightAssociation = clampSearchPathWeight(wa.value, 100);
  if (wls) state.searchPathWeightLayerSkip = clampSearchPathWeight(wls.value, 15);
  if (wv) state.searchPathWeightViolation = clampSearchPathWeight(wv.value, 50);
  if (rc) state.restrictCoreToCore = !!rc.checked;
  if (eg) state.enforceGrammar = !!eg.checked;
  if (str) state.strictRealization = !!str.checked;
  if (pcm) state.perspectiveClassMode = normalizePerspectiveClassMode(pcm.value);
  if (pcs) state.perspectiveDominantSharePct = clampPerspectiveDominantSharePct(pcs.value);
  if (!state.enforceGrammar) state.strictRealization = false;
  const preset = normalizeSearchRigorPreset(state.searchRigorPreset);
  if (preset !== "custom" && !isPresetSemanticMatch(preset)) {
    state.searchRigorPreset = "custom";
  }
  applySearchOptionsToUI();
  updatePathOptionsTriggerSummary();
  schedulePersistSession();
  if (state.segments) window.dispatch({ type: "FIND_PATH", reason: "search-options-change" });
};

window.onSearchRigorPresetChange = function onSearchRigorPresetChange() {
  const sel = document.getElementById("search-rigor-preset");
  const next = normalizeSearchRigorPreset(sel?.value || state.searchRigorPreset);
  if (next !== "custom") {
    applySearchRigorPresetToState(next);
  } else {
    state.searchRigorPreset = "custom";
  }
  state.lastPathTemporaryRelaxation = null;
  applySearchOptionsToUI();
  updatePathOptionsTriggerSummary();
  schedulePersistSession();
  if (state.segments) window.dispatch({ type: "FIND_PATH", reason: "search-rigor-preset-change" });
  const rgm = document.getElementById("rigor-guide-modal");
  if (rgm && rgm.style.display === "flex") syncRigorGuideModalHighlight();
};

window.onAssociationFallbackChange = function onAssociationFallbackChange() {
  const af = document.getElementById("allow-association-fallback");
  state.allowAssociationFallback = !!(af && af.checked);
  const preset = normalizeSearchRigorPreset(state.searchRigorPreset);
  if (preset !== "custom" && !isPresetSemanticMatch(preset)) {
    state.searchRigorPreset = "custom";
  }
  state.lastPathTemporaryRelaxation = null;
  applySearchOptionsToUI();
  updatePathOptionsTriggerSummary();
  schedulePersistSession();
  if (state.segments) window.dispatch({ type: "FIND_PATH", reason: "association-fallback-change" });
};

window.onDomainContextChange = function onDomainContextChange(nextValue = undefined) {
  const prev = state.domainContext;
  const sideSel = document.getElementById("domain-context-select");
  const topSel = document.getElementById("domain-context-top-select");
  const candidate =
    nextValue !== undefined
      ? nextValue
      : sideSel?.value || topSel?.value || state.domainContext;
  state.domainContext = normalizeDomainContext(candidate);
  syncDomainContextSelectors();
  schedulePersistSession();
  if (state.segments?.length) {
    window.dispatch({ type: "RENDER_RESULTS" });
  }
  if (prev !== state.domainContext) {
    maybeShowThemeSplash(state.domainContext);
  }
};

function syncDerivedToggleFromState() {
  document.getElementById("btn-direct")?.classList.toggle("active", !state.includeDerived);
  document.getElementById("btn-derived")?.classList.toggle("active", state.includeDerived);
}

/**
 * Restore Direct/Derived + Association Options after a one-shot relaxed findPath (overlay / widen-search CTAs).
 */
function applyRelaxOneShotRestore() {
  const snap = state._relaxOneShotRestore;
  if (!snap) return;
  state.includeDerived = snap.includeDerived;
  state.allowAssociationFallback = snap.allowAssociationFallback;
  state._relaxOneShotRestore = null;
  syncDerivedToggleFromState();
  const af = document.getElementById("allow-association-fallback");
  if (af) af.checked = !!state.allowAssociationFallback;
  rebuildGraph();
  updatePathOptionsTriggerSummary();
}

/** One-time +Derived search from no-path UI / diagnostics — does not permanently enable +Derived in Options. */
window.tryRelaxPathDerived = function tryRelaxPathDerived() {
  state._relaxOneShotRestore = {
    includeDerived: state.includeDerived,
    allowAssociationFallback: state.allowAssociationFallback,
    relaxMode: "derived",
  };
  state.includeDerived = true;
  syncDerivedToggleFromState();
  rebuildGraph();
  window.dispatch({ type: "FIND_PATH", reason: "one-shot-relax-derived" });
};

/** One-time Association fallback from no-path UI / diagnostics — does not permanently enable it in Options. */
window.tryRelaxPathAssociation = function tryRelaxPathAssociation() {
  state._relaxOneShotRestore = {
    includeDerived: state.includeDerived,
    allowAssociationFallback: state.allowAssociationFallback,
    relaxMode: "association",
  };
  state.allowAssociationFallback = true;
  const el = document.getElementById("allow-association-fallback");
  if (el) el.checked = true;
  rebuildGraph();
  window.dispatch({ type: "FIND_PATH", reason: "one-shot-relax-association" });
};

/** One-time full metamodel search when strict viewpoint scope blocks all paths. */
window.expandPathfindingToFullMetamodel = function expandPathfindingToFullMetamodel() {
  state._pathfindFullMetamodelOnce = true;
  window.dispatch({ type: "FIND_PATH", reason: "one-shot-expand-full-metamodel" });
};

/** Turn on Association fallback and re-run path search. */
window.toggleAlgorithmDetailsPanel = function toggleAlgorithmDetailsPanel(ev) {
  if (ev) {
    ev.preventDefault();
    ev.stopPropagation();
  }
  const btn = ev?.currentTarget;
  if (!btn || btn.nodeName !== "BUTTON") return;
  const root = btn.closest(".connect-set-note-tech, .path-search-report");
  const panel = root?.querySelector(".algorithm-debug-panel");
  if (!panel) return;
  const open = panel.classList.toggle("show");
  btn.setAttribute("aria-expanded", open ? "true" : "false");
  btn.title = open ? "Hide Routing Math" : "Show Routing Math";
  btn.setAttribute(
    "aria-label",
    open ? "Hide routing math details" : "Show routing math details"
  );
  try {
    sessionStorage.setItem("archimateAlgorithmDetailsOpen", open ? "1" : "0");
  } catch (_) {}
};

function computeAndSetPathFailureHints(hasNoPath, picked, orderedWaypointElements) {
  state.pathFailureHints = null;
  if (!hasNoPath || picked.length < 2) return;
  try {
    const so = getSearchPathOptions();
    let h;
    if (state.selectionMode === "set") {
      h = probeSetRelaxations(state.graph, picked, so);
    } else {
      h = probePathRelaxations(state.graph, orderedWaypointElements, so);
    }
    if (h.derivedWouldHelp || h.associationWouldHelp) {
      state.pathFailureHints = {
        derivedWouldHelp: !!h.derivedWouldHelp,
        associationWouldHelp: !!h.associationWouldHelp,
        includeDerived: !!so.includeDerived,
        allowAssociationFallback: !!so.allowAssociationFallback,
      };
    }
  } catch (e) {
    console.warn("computeAndSetPathFailureHints", e);
  }
}

/**
 * When a strict (non–all-elements) viewpoint is active, whether endpoints participate in the routed graph.
 * @param {string} narrFrom
 * @param {string} narrTo
 * @returns {{ strict: false } | { strict: true, name: string, key: string, fromInGraph: boolean, toInGraph: boolean }}
 */
function getStrictViewpointFailureContext(narrFrom, narrTo) {
  const vpCtx = resolveViewpointSearchContext({ forceFullMetamodel: false });
  if (!vpCtx.viewpointStrict) return { strict: false };
  const key = state.viewpoint ? String(state.viewpoint) : "";
  const name =
    key && typeof VIEWPOINTS !== "undefined" && VIEWPOINTS[key]
      ? VIEWPOINTS[key].name || key
      : key || "selected viewpoint";
  const g = state.graph;
  const fn = narrFrom ? String(narrFrom) : "";
  const tn = narrTo ? String(narrTo) : "";
  return {
    strict: true,
    name,
    key,
    fromInGraph: !!(g && g.has(fn)),
    toInGraph: !!(g && g.has(tn)),
  };
}

/** Snapshot of path search settings for no-path diagnostics (matches connect-set tech box style). */
function buildPathSearchReportPayload() {
  const so = getSearchPathOptions();
  const vpCtx = resolveViewpointSearchContext({ forceFullMetamodel: false });
  const vpSel = document.getElementById("viewpoint-select");
  const viewpointKey = vpSel && vpSel.value ? String(vpSel.value) : "";
  let viewpointShort = "All elements";
  if (viewpointKey && typeof VIEWPOINTS !== "undefined" && VIEWPOINTS[viewpointKey]) {
    viewpointShort = VIEWPOINTS[viewpointKey].name || viewpointKey;
  } else if (viewpointKey) {
    viewpointShort = viewpointKey;
  }
  const wps = state.waypoints || [];
  const names = wps.map((wp) => wp.element).filter(Boolean);
  const distinct = [...new Set(names)];
  let waypointChainDescription = "— (incomplete selection)";
  if (state.selectionMode === "ordered") {
    waypointChainDescription = names.length ? names.join(" → ") : waypointChainDescription;
  } else if (distinct.length) {
    waypointChainDescription = `${distinct.length} point${distinct.length !== 1 ? "s" : ""}: ${distinct.join(", ")}`;
  }
  return {
    mode: state.selectionMode === "set" ? "set" : "ordered",
    includeDerived: !!state.includeDerived,
    allowAssociationFallback: !!state.allowAssociationFallback,
    maxDepth: so.maxDepth,
    maxPaths: so.maxPaths,
    maxStates: so.maxStates,
    pathWeightDirect: so.pathWeightDirect,
    pathWeightDerived: so.pathWeightDerived,
    pathWeightAssociation: so.pathWeightAssociation,
    pathWeightLayerSkip: so.pathWeightLayerSkip,
    searchEffort: normalizeSearchEffort(state.searchEffort),
    viewpointKey,
    viewpointShortLabel: viewpointShort,
    viewpointStrict: !!vpCtx.viewpointStrict,
    waypointChainDescription,
    waypointCount: names.length,
    connectSetDistinctCount: distinct.length,
  };
}

function isLayoutTop() {
  return document.getElementById("app-layout")?.classList.contains("layout-top");
}

/** Pathfinding and picker palette both respect the active viewpoint in all layouts. */
function effectiveAllowedElements() {
  return state.allowedElements;
}

/** Explains why §4.2 shows both “assigned to” and “serves” between Internal Active and External Behavior. */
function metamodelInternalActiveExternalBehaviorNote(fromKey, toKey, fromEl, toEl, appendixRelName = "") {
  const pair =
    (fromKey === "internal-active" && toKey === "external-behavior") ||
    (fromKey === "external-behavior" && toKey === "internal-active");
  if (!pair || !fromEl || !toEl) return "";
  const figEdge =
    fromKey === "internal-active" && toKey === "external-behavior"
      ? "assigned to"
      : "serves";
  const companion =
    fromKey === "internal-active" && toKey === "external-behavior"
      ? `The companion edge in the same figure is <strong>serves</strong> (${toEl} → ${fromEl}).`
      : `The companion edge in the same figure is <strong>assigned to</strong> (${toEl} → ${fromEl}).`;
  const appendix = appendixRelName
    ? ` Appendix B names that relationship <strong>${appendixRelName}</strong> according to which element is the relationship’s source in your model — that is not the same label as the §4.2 arrow text.`
    : ` Appendix B relationship names (Assignment, Serving, …) follow the relationship’s source and target in the model, which can differ from the wording printed on the §4.2 graphic.`;
  return `<div class="mm-two-way-note">
    <strong>Why “${figEdge}” here:</strong> §4.2 draws <em>two</em> arrows between <em>Internal Active Structure</em> and <em>External Behavior</em>:
    <strong>assigned to</strong> (internal active → external behavior) and <strong>serves</strong> (external behavior → internal active).
    This view highlights the one that matches <strong>${fromEl} → ${toEl}</strong>. ${companion}${appendix}
  </div>`;
}

/** Previously rendered the green “metamodel hop” strip above the path explanation; removed to avoid duplicating step headers. */
function updateMmConnectionStrip(_opts) {}

window.openMetamodelFromStrip = function openMetamodelFromStrip() {
  const m = state.mmLast;
  if (!m?.fromEl || !m?.toEl) return;
  openMetamodelModal();
  doHighlight(m.fromKey, m.toKey, m.valid !== false);
  if (typeof annotateMetamodel === "function") {
    annotateMetamodel(m.fromKey, m.toKey, m.fromEl, m.toEl);
  }
  renderMetamodelRoleContents(m.fromKey, m.toKey, m.fromEl, m.toEl);
  const appendix = m.appendixRel ? ` · Appendix B: <strong>${m.appendixRel}</strong>` : "";
  setMetamodelStatus(`
    <div><strong>Metamodel:</strong> ${m.fromEl} → ${m.toEl}${appendix}</div>
    ${metamodelInternalActiveExternalBehaviorNote(m.fromKey, m.toKey, m.fromEl, m.toEl, m.appendixRel || "")}
  `);
};

// ── Layout chrome (sidebar / top bar, resize, collapse) ─────────────────────
const LAYOUT_LS = {
  mode: "archimate-layout-mode",
  width: "archimate-panel-width",
  topH: "archimate-panel-top-height",
  collapsed: "archimate-panel-collapsed",
};
const RESULTS_SPLIT_LS = "archimate-results-diagram-pct";
const RESULTS_LAYOUT_LS = "archimate-results-layout";
/** When details are beside the diagram, default vertical stacking on; user toggle persists here. */
const ALIGN_VERTICAL_SIDE_LS = "archimate-align-vertical-side";
/** When path details are below the diagram, separate preference (default off). */
const ALIGN_VERTICAL_STACK_LS = "archimate-align-vertical-stack";
/** Values: horizontal | vertical | compact (migrated from legacy align-vertical 0/1). */
const PATH_FLOW_SIDE_LS = "archimate-path-flow-side";
const PATH_FLOW_STACK_LS = "archimate-path-flow-stack";
const PATH_FLOW_ORDER = ["horizontal", "vertical", "compact"];
const PATH_FLOW_LABEL = { horizontal: "Horizontal", vertical: "Vertical", compact: "Compact" };
const PATH_FLOW_TITLE = {
  horizontal:
    "Path reads left to right: single row (Compact off) or swimlanes with curved cross-layer links (Swimlanes on).",
  vertical: "Path reads top to bottom through layers. Swimlanes on adds lane tints.",
  compact:
    "Tight layer-aligned layout: 90° connectors and narrow columns (turn Swimlanes on for layer bands).",
};
const WELCOME_LS = "archimate-welcome-seen";
const LOCAL_PREFS_CONSENT_LS = "archimate-local-prefs-consent";
/** Once set, quick examples stay collapsed with 0–1 picks until the user opens them again. */
const QUICK_EXAMPLES_VETERAN_LS = "archimate-quick-examples-veteran";
const SESSION_SNAPSHOT_LS = "archimate-session-v2";
const SESSION_SNAPSHOT_VERSION = 2;

// ── One-time per-theme splash (cookie) ───────────────────────────────────────
const THEME_SPLASH_COOKIE_PREFIX = "archimate-theme-splash-seen-";
const THEME_SPLASH_MAX_AGE_S = 60 * 60 * 24 * 365 * 2; // 2 years

function getCookie(name) {
  try {
    const raw = document.cookie || "";
    const parts = raw.split(";").map((p) => p.trim());
    for (const p of parts) {
      if (!p) continue;
      const i = p.indexOf("=");
      const k = i === -1 ? p : p.slice(0, i);
      if (k === name) return i === -1 ? "" : decodeURIComponent(p.slice(i + 1));
    }
  } catch (_) {}
  return null;
}

function setCookie(name, value, { maxAgeSeconds } = {}) {
  try {
    const enc = encodeURIComponent(value == null ? "" : String(value));
    let s = `${name}=${enc}; Path=/; SameSite=Lax`;
    if (typeof maxAgeSeconds === "number" && Number.isFinite(maxAgeSeconds) && maxAgeSeconds > 0) {
      s += `; Max-Age=${Math.floor(maxAgeSeconds)}`;
    }
    if (location.protocol === "https:") s += "; Secure";
    document.cookie = s;
  } catch (_) {}
}

function themeSplashCookieName(domainContext) {
  return `${THEME_SPLASH_COOKIE_PREFIX}${normalizeDomainContext(domainContext)}`;
}

function hasSeenThemeSplash(domainContext) {
  const key = themeSplashCookieName(domainContext);
  return getCookie(key) === "1";
}

function markSeenThemeSplash(domainContext) {
  const key = themeSplashCookieName(domainContext);
  setCookie(key, "1", { maxAgeSeconds: THEME_SPLASH_MAX_AGE_S });
}

function themeDisplayName(domainContext) {
  const k = normalizeDomainContext(domainContext);
  if (k === "circus") return "the Circus";
  if (k === "hospital") return "the Hospital";
  if (k === "death_star") return "the Death Star";
  if (k === "rebel_alliance") return "Star Wars Rebels";
  if (k === "abstract") return "Abstract";
  return k;
}

function buildThemeSplashHtml(domainContext) {
  const name = themeDisplayName(domainContext);
  const isAbstract = normalizeDomainContext(domainContext) === "abstract";
  const lead = isAbstract
    ? `This is the default theme: the app uses neutral labels in explanations.`
    : `This theme changes the <strong>scenario labels</strong> and flavor text (not the underlying ArchiMate rules).`;
  const tip = `ArchiMate relationships are defined in the spec, but it can be <strong>tedious</strong> to search the tables and verify what connects to what. Even when tools help you draw links, it’s not always obvious which chains are allowed — this glossary helps you interpret the route groups and badges the app uses to organize alternatives.`;
  const glossary =
    typeof buildPathLabelsModalHtml === "function"
      ? buildPathLabelsModalHtml()
      : `<p class="theme-splash-note">Glossary is unavailable (UI not initialized yet).</p>`;
  return `
    <p class="theme-splash-intro"><strong>Welcome to ${escapeHtml(name)}.</strong> ${lead}</p>
    <div class="theme-splash-note">${tip}</div>
    <div class="theme-splash-glossary">
      <div class="control-label" style="margin-bottom:6px">What do these labels mean?</div>
      ${glossary}
    </div>
  `;
}

let themeSplashOpenFor = null;

let scrollLockCount = 0;
let scrollLockTop = 0;

function lockBodyScroll() {
  scrollLockCount++;
  if (scrollLockCount !== 1) return;
  try {
    scrollLockTop = window.scrollY || 0;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollLockTop}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
  } catch (_) {}
}

function unlockBodyScroll() {
  if (scrollLockCount > 0) scrollLockCount--;
  if (scrollLockCount !== 0) return;
  try {
    const top = scrollLockTop || 0;
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    window.scrollTo(0, top);
    scrollLockTop = 0;
  } catch (_) {}
}

function openThemeSplashModal(domainContext) {
  const modal = document.getElementById("theme-splash-modal");
  const body = document.getElementById("theme-splash-body");
  const title = document.getElementById("theme-splash-title");
  const dismissForever = document.getElementById("theme-splash-dismiss-forever");
  if (!modal || !body) return;

  themeSplashOpenFor = normalizeDomainContext(domainContext);
  if (title) title.textContent = `Welcome to ${themeDisplayName(domainContext)}`;
  body.innerHTML = buildThemeSplashHtml(domainContext);

  lockBodyScroll();
  modal.style.display = "flex";
  modal.setAttribute("aria-hidden", "false");

  if (dismissForever) {
    dismissForever.onclick = () => {
      markSeenThemeSplash(domainContext);
      closeThemeSplashModal();
    };
  }
}

function closeThemeSplashModal() {
  const modal = document.getElementById("theme-splash-modal");
  if (!modal) return;
  if (themeSplashOpenFor) {
    markSeenThemeSplash(themeSplashOpenFor);
    themeSplashOpenFor = null;
  }
  unlockBodyScroll();
  modal.style.display = "none";
  modal.setAttribute("aria-hidden", "true");
}

function maybeShowThemeSplash(domainContext) {
  const k = normalizeDomainContext(domainContext);
  // Only show for the “story” themes (not Abstract).
  if (k === "abstract") return;
  if (hasSeenThemeSplash(k)) return;
  openThemeSplashModal(k);
}

let persistSessionTimer = null;

function hasQuickExamplesVeteranPref() {
  try {
    return localStorage.getItem(QUICK_EXAMPLES_VETERAN_LS) === "1";
  } catch (_) {
    return false;
  }
}

function markQuickExamplesVeteran() {
  try {
    localStorage.setItem(QUICK_EXAMPLES_VETERAN_LS, "1");
  } catch (_) {}
}

function schedulePersistSession() {
  if (typeof localStorage === "undefined") return;
  try {
    if (localStorage.getItem(LOCAL_PREFS_CONSENT_LS) !== "1") return;
  } catch (_) {
    return;
  }
  if (persistSessionTimer) clearTimeout(persistSessionTimer);
  persistSessionTimer = setTimeout(() => {
    persistSessionTimer = null;
    persistSessionSnapshot();
  }, 450);
}

function gatherSessionSnapshot() {
  const vpSel = document.getElementById("viewpoint-select");
  const viewpoint = vpSel && vpSel.value ? vpSel.value : "";
  const domainSideSel = document.getElementById("domain-context-select");
  const domainTopSel = document.getElementById("domain-context-top-select");
  const domainContext = normalizeDomainContext(
    domainSideSel?.value || domainTopSel?.value || state.domainContext
  );
  const wps = (state.waypoints || []).map((wp) => ({
    layer: wp?.layer ?? null,
    element: wp?.element ?? null,
    label: wp?.label ?? "Point",
  }));
  let hadPath = false;
  if (state.segments && state.segments.length) {
    hadPath = !state.segments.some((s) => !s.paths || s.paths.length === 0);
  }
  return {
    v: SESSION_SNAPSHOT_VERSION,
    includeDerived: !!state.includeDerived,
    selectionMode: state.selectionMode === "ordered" ? "ordered" : "set",
    mode: state.mode === "swimlane" ? "swimlane" : "compact",
    pathFlow: PATH_FLOW_ORDER.includes(state.pathFlow) ? state.pathFlow : "horizontal",
    showBadges: state.showBadges !== false,
    showCompositeSubs: state.showCompositeSubs !== false,
    forceShowQuickExamples: !!state.forceShowQuickExamples,
    domainContext,
    viewpoint: viewpoint || null,
    waypoints: wps,
    hadPath,
    activePathIdx: state.activePathIdx ?? 0,
    userChoices: state.userChoices && typeof state.userChoices === "object" ? { ...state.userChoices } : {},
    searchMaxDepth: clampSearchDepth(state.searchMaxDepth),
    searchMaxPaths: clampSearchMaxPaths(state.searchMaxPaths),
    searchEffort: normalizeSearchEffort(state.searchEffort),
    searchPathWeightDirect: clampSearchPathWeight(state.searchPathWeightDirect, 1),
    searchPathWeightDerived: clampSearchPathWeight(state.searchPathWeightDerived, 5),
    searchPathWeightAssociation: clampSearchPathWeight(state.searchPathWeightAssociation, 100),
    searchPathWeightLayerSkip: clampSearchPathWeight(state.searchPathWeightLayerSkip, 15),
    searchPathWeightViolation: clampSearchPathWeight(state.searchPathWeightViolation, 50),
    searchRigorPreset: normalizeSearchRigorPreset(state.searchRigorPreset),
    restrictCoreToCore: !!state.restrictCoreToCore,
    enforceGrammar: !!state.enforceGrammar,
    strictRealization: !!state.strictRealization,
    perspectiveClassMode: normalizePerspectiveClassMode(state.perspectiveClassMode),
    perspectiveDominantSharePct: clampPerspectiveDominantSharePct(state.perspectiveDominantSharePct),
    allowAssociationFallback: !!state.allowAssociationFallback,
  };
}

function persistSessionSnapshot() {
  try {
    if (localStorage.getItem(LOCAL_PREFS_CONSENT_LS) !== "1") return;
    localStorage.setItem(SESSION_SNAPSHOT_LS, JSON.stringify(gatherSessionSnapshot()));
  } catch (e) {
    console.warn("persistSessionSnapshot failed", e);
  }
}

function sanitizeWaypointForRestore(wp) {
  if (!wp || typeof wp !== "object") return null;
  const element = typeof wp.element === "string" && ELEMENTS[wp.element] ? wp.element : null;
  let layer = wp.layer || null;
  if (element) layer = ELEMENTS[element].layer || null;
  return {
    layer,
    element,
    label: typeof wp.label === "string" ? wp.label : "Point",
  };
}

function restoreSessionSnapshot() {
  try {
    if (localStorage.getItem(LOCAL_PREFS_CONSENT_LS) !== "1") return;
    const raw = localStorage.getItem(SESSION_SNAPSHOT_LS);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data || data.v !== SESSION_SNAPSHOT_VERSION) return;

    if (typeof data.includeDerived === "boolean") setDerived(data.includeDerived);

    if (data.selectionMode === "ordered" || data.selectionMode === "set") {
      setSelectionMode(data.selectionMode);
    }

    if (data.mode === "compact" || data.mode === "swimlane") {
      setMode(data.mode);
    }

    state.domainContext = normalizeDomainContext(data.domainContext);
    syncDomainContextSelectors();

    if (data.pathFlow === "horizontal" || data.pathFlow === "vertical" || data.pathFlow === "compact") {
      state.pathFlow = data.pathFlow;
      try {
        localStorage.setItem(getPathFlowStorageKey(), data.pathFlow);
      } catch (_) {}
      updatePathFlowButton();
    }

    if (typeof data.showBadges === "boolean") {
      state.showBadges = data.showBadges;
      const btn = document.getElementById("btn-toggle-badges");
      if (btn) {
        btn.textContent = state.showBadges ? "Hide #" : "Show #";
        btn.title = state.showBadges ? "Hide hop numbers on arrows" : "Show hop numbers on arrows";
      }
    }

    if (typeof data.showCompositeSubs === "boolean") {
      state.showCompositeSubs = data.showCompositeSubs;
      const cb = document.getElementById("toggle-composite-subs");
      if (cb) cb.checked = state.showCompositeSubs !== false;
    }

    if (typeof data.forceShowQuickExamples === "boolean") {
      state.forceShowQuickExamples = data.forceShowQuickExamples;
    }

    if (typeof data.searchMaxDepth === "number" && Number.isFinite(data.searchMaxDepth)) {
      state.searchMaxDepth = clampSearchDepth(data.searchMaxDepth);
    }
    if (typeof data.searchMaxPaths === "number" && Number.isFinite(data.searchMaxPaths)) {
      state.searchMaxPaths = clampSearchMaxPaths(data.searchMaxPaths);
    }
    if (data.searchEffort === "fast" || data.searchEffort === "balanced" || data.searchEffort === "thorough") {
      state.searchEffort = data.searchEffort;
    }
    if (typeof data.searchPathWeightDirect === "number" && Number.isFinite(data.searchPathWeightDirect)) {
      state.searchPathWeightDirect = clampSearchPathWeight(data.searchPathWeightDirect, 1);
    }
    if (typeof data.searchPathWeightDerived === "number" && Number.isFinite(data.searchPathWeightDerived)) {
      state.searchPathWeightDerived = clampSearchPathWeight(data.searchPathWeightDerived, 5);
    }
    if (typeof data.searchPathWeightAssociation === "number" && Number.isFinite(data.searchPathWeightAssociation)) {
      state.searchPathWeightAssociation = clampSearchPathWeight(data.searchPathWeightAssociation, 100);
    }
    if (typeof data.searchPathWeightLayerSkip === "number" && Number.isFinite(data.searchPathWeightLayerSkip)) {
      state.searchPathWeightLayerSkip = clampSearchPathWeight(data.searchPathWeightLayerSkip, 15);
    }
    if (typeof data.searchPathWeightViolation === "number" && Number.isFinite(data.searchPathWeightViolation)) {
      state.searchPathWeightViolation = clampSearchPathWeight(data.searchPathWeightViolation, 50);
    }
    if (typeof data.restrictCoreToCore === "boolean") {
      state.restrictCoreToCore = data.restrictCoreToCore;
    }
    if (typeof data.enforceGrammar === "boolean") {
      state.enforceGrammar = data.enforceGrammar;
    }
    if (typeof data.strictRealization === "boolean") {
      state.strictRealization = data.strictRealization;
    }
    if (typeof data.searchRigorPreset === "string") {
      state.searchRigorPreset = normalizeSearchRigorPreset(data.searchRigorPreset);
    }
    if (typeof data.perspectiveClassMode === "string") {
      state.perspectiveClassMode = normalizePerspectiveClassMode(data.perspectiveClassMode);
    }
    if (typeof data.perspectiveDominantSharePct === "number" && Number.isFinite(data.perspectiveDominantSharePct)) {
      state.perspectiveDominantSharePct = clampPerspectiveDominantSharePct(data.perspectiveDominantSharePct);
    }
    if (typeof data.allowAssociationFallback === "boolean") {
      state.allowAssociationFallback = data.allowAssociationFallback;
    }
    if (state.searchRigorPreset !== "custom" && SEARCH_RIGOR_PRESETS[state.searchRigorPreset]) {
      applySearchRigorPresetToState(state.searchRigorPreset);
    }
    applySearchOptionsToUI();

    const vpSel = document.getElementById("viewpoint-select");
    if (vpSel && data.viewpoint !== undefined) {
      const key = data.viewpoint == null || data.viewpoint === "" ? "" : data.viewpoint;
      if (key === "" || VIEWPOINTS[key]) {
        vpSel.value = key;
        onViewpointChange();
      }
    }

    if (Array.isArray(data.waypoints) && data.waypoints.length >= 2) {
      const cleaned = data.waypoints.map(sanitizeWaypointForRestore).filter(Boolean);
      if (cleaned.length >= 2) {
        const eff = effectiveAllowedElements();
        for (const wp of cleaned) {
          if (wp.element && eff && !eff.has(wp.element)) {
            wp.element = null;
          }
        }
        state.waypoints = cleaned;
        renderWaypointChain();
      }
    }

    updateQuickExamplesVisibility();

    const picked = state.waypoints.map((wp) => wp.element).filter(Boolean);
    const minOk =
      state.selectionMode === "set"
        ? picked.length >= 2
        : state.waypoints.every((wp) => wp.element);

    if (data.hadPath && minOk) {
      const uc = data.userChoices && typeof data.userChoices === "object" ? { ...data.userChoices } : {};
      const ac =
        typeof data.activePathIdx === "number" && Number.isFinite(data.activePathIdx)
          ? data.activePathIdx
          : 0;
      window.__pendingSessionExtras = { userChoices: uc, activePathIdx: ac };
      window.dispatch({ type: "FIND_PATH", reason: "restore-session" });
    }
  } catch (e) {
    console.warn("restoreSessionSnapshot failed", e);
  }
}

function dismissWelcomeModalAndContinue() {
  const el = document.getElementById("welcome-modal");
  if (el) {
    el.style.display = "none";
    el.setAttribute("aria-hidden", "true");
  }
  try {
    localStorage.setItem(WELCOME_LS, "1");
    localStorage.setItem(LOCAL_PREFS_CONSENT_LS, "1");
  } catch (_) {}
  bootApp();
}

function showWelcomeModal() {
  const el = document.getElementById("welcome-modal");
  if (!el) {
    dismissWelcomeModalAndContinue();
    return;
  }
  el.style.display = "block";
  el.setAttribute("aria-hidden", "false");
  const ok = document.getElementById("welcome-modal-ok");

  function cleanupWelcomeListeners() {
    el.removeEventListener("click", onWelcomeExampleClick);
    if (ok) ok.removeEventListener("click", onWelcomeContinue);
  }

  function onWelcomeContinue() {
    cleanupWelcomeListeners();
    dismissWelcomeModalAndContinue();
  }

  function onWelcomeExampleClick(e) {
    const btn = e.target.closest("[data-welcome-example]");
    if (!btn || !el.contains(btn)) return;
    let wps;
    try {
      wps = JSON.parse(btn.getAttribute("data-welcome-example") || "null");
    } catch (err) {
      console.warn("welcome example JSON", err);
      cleanupWelcomeListeners();
      dismissWelcomeModalAndContinue();
      return;
    }
    if (!Array.isArray(wps) || wps.length < 2) {
      cleanupWelcomeListeners();
      dismissWelcomeModalAndContinue();
      return;
    }
    cleanupWelcomeListeners();
    dismissWelcomeModalAndContinue();
    if (typeof window.loadExample === "function") {
      window.loadExample(wps);
    }
  }

  if (ok) ok.addEventListener("click", onWelcomeContinue);
  el.addEventListener("click", onWelcomeExampleClick);
}

function bootApp() {
  init();
  restoreSessionSnapshot();
}

const RESULTS_SIDE_SPLIT_LS = "archimate-results-side-pct";
const RESULTS_PCT_MIN = 22;
const RESULTS_PCT_MAX = 78;
const RESULTS_SIDE_PCT_MIN = 28;
const RESULTS_SIDE_PCT_MAX = 55;
const PANEL_W_MIN = 220;
const PANEL_W_MAX = 560;
const PANEL_H_MIN = 120;
function getPanelHMax() {
  return Math.min(620, Math.round(window.innerHeight * 0.72));
}

function readLayoutPrefs() {
  let mode = localStorage.getItem(LAYOUT_LS.mode);
  if (mode !== "sidebar" && mode !== "top") mode = "top";
  let width = parseInt(localStorage.getItem(LAYOUT_LS.width) || "", 10);
  if (!Number.isFinite(width)) width = 280;
  width = Math.max(PANEL_W_MIN, Math.min(PANEL_W_MAX, width));
  let topH = parseInt(localStorage.getItem(LAYOUT_LS.topH) || "", 10);
  if (!Number.isFinite(topH)) topH = 200;
  topH = Math.max(PANEL_H_MIN, Math.min(getPanelHMax(), topH));
  const collapsedRaw = localStorage.getItem(LAYOUT_LS.collapsed);
  let collapsed;
  if (collapsedRaw === null || collapsedRaw === "") {
    /* Top bar: default drawer closed (full diagram). Sidebar: default panel open. */
    collapsed = mode === "top";
  } else {
    collapsed = collapsedRaw === "1";
  }
  return { mode, width, topH, collapsed };
}

let pathOptionsEscHandler = null;
let pathOptionsViewportCleanup = null;
let pathChromeEscHandler = null;
let pathChromeViewportCleanup = null;

function syncDomainContextSelectors() {
  const value = normalizeDomainContext(state.domainContext);
  const side = document.getElementById("domain-context-select");
  const top = document.getElementById("domain-context-top-select");
  if (side) side.value = value;
  if (top) top.value = value;
}

function buildDomainContextOptions() {
  if (typeof SCENARIOS === "undefined" || !SCENARIOS || typeof SCENARIOS !== "object") return [];
  const entries = Object.entries(SCENARIOS)
    .filter(([k, v]) => k && v && typeof v === "object")
    .map(([k, v]) => {
      const label = typeof v.label === "string" && v.label.trim() ? v.label.trim() : k;
      return { key: k, label };
    });

  const abstract = entries.filter((e) => e.key === "abstract");
  const rest = entries.filter((e) => e.key !== "abstract").sort((a, b) => a.label.localeCompare(b.label));
  return [...abstract, ...rest];
}

function repopulateDomainContextSelectorsFromScenarios() {
  const side = document.getElementById("domain-context-select");
  const top = document.getElementById("domain-context-top-select");
  if (!side && !top) return;

  const opts = buildDomainContextOptions();
  if (!opts.length) return;

  const current = normalizeDomainContext(state.domainContext);
  const makeOption = (o) => {
    const opt = document.createElement("option");
    opt.value = o.key;
    opt.textContent = o.label;
    return opt;
  };

  const applyTo = (sel) => {
    if (!sel) return;
    const keep = sel.value;
    sel.innerHTML = "";
    for (const o of opts) sel.appendChild(makeOption(o));
    // Preserve current state selection if possible; otherwise preserve previous select value; otherwise default.
    sel.value = current;
    if (sel.value !== current && keep) sel.value = keep;
    if (!sel.value) sel.value = current;
  };

  applyTo(side);
  applyTo(top);
  syncDomainContextSelectors();
}

function updatePathOptionsTriggerSummary() {
  const el = document.getElementById("path-options-trigger-label");
  const trigger = document.getElementById("path-options-trigger");
  if (el) el.textContent = "Options";
  if (!trigger) return;
  const vp = document.getElementById("viewpoint-select");
  let vpShort = "All elements";
  if (vp?.value) {
    const opt = vp.selectedOptions?.[0];
    vpShort = (opt && String(opt.textContent || "").trim()) || vp.value;
  }
  const rel = state.includeDerived ? "+ Derived" : "Direct";
  const mode = state.selectionMode === "set" ? "Connect set" : "Ordered";
  const so = getSearchPathOptions();
  const costs = `costs ${so.pathWeightDirect}/${so.pathWeightDerived}/${so.pathWeightAssociation}/${so.pathWeightLayerSkip}/${so.pathViolationPenalty}`;
  const pMode = normalizePerspectiveClassMode(state.perspectiveClassMode);
  const pLabel =
    pMode === "dominant-share"
      ? `dominant ${clampPerspectiveDominantSharePct(state.perspectiveDominantSharePct)}%`
      : "exclusive";
  const eff =
    normalizeSearchEffort(state.searchEffort) === "fast"
      ? "fast search"
      : normalizeSearchEffort(state.searchEffort) === "thorough"
        ? "thorough search"
        : "balanced search";
  const af = state.allowAssociationFallback ? "Assoc fallback on" : "Assoc fallback off";
  const rigor = normalizeSearchRigorPreset(state.searchRigorPreset);
  const sem = `Semantics: ${so.restrictCoreToCore ? "core-prune on" : "core-prune off"}, ${so.enforceGrammar ? "grammar on" : "grammar off"}, ${so.strictRealization ? "R strict" : "R neutral"}`;
  trigger.title = `Current: ${rel} · ${mode} · ${vpShort} · Up to ${so.maxDepth} hops · ${so.maxPaths} alts · ${eff} · ${costs} · Rigor: ${rigor} · ${sem} · Perspective: ${pLabel} · ${af}`;
}

function closePathOptionsOverlay() {
  if (pathOptionsViewportCleanup) {
    pathOptionsViewportCleanup();
    pathOptionsViewportCleanup = null;
  }
  if (pathOptionsEscHandler) {
    document.removeEventListener("keydown", pathOptionsEscHandler);
    pathOptionsEscHandler = null;
  }
  const overlay = document.getElementById("path-options-overlay");
  const body = document.getElementById("sidebar-controls-body");
  const host = document.getElementById("path-options-body-host");
  if (body && host && !host.contains(body)) {
    host.appendChild(body);
  }
  if (overlay) {
    overlay.classList.remove("open");
    overlay.innerHTML = "";
    overlay.setAttribute("aria-hidden", "true");
    overlay.onclick = null;
  }
}

function closePathChromeOverlay() {
  if (pathChromeViewportCleanup) {
    pathChromeViewportCleanup();
    pathChromeViewportCleanup = null;
  }
  if (pathChromeEscHandler) {
    document.removeEventListener("keydown", pathChromeEscHandler);
    pathChromeEscHandler = null;
  }
  const overlay = document.getElementById("path-chrome-overlay");
  const panel = document.getElementById("path-chrome-body-host");
  const root = document.getElementById("path-chrome-collapsible");
  const trigger = document.getElementById("path-chrome-trigger");
  if (panel && root && !root.contains(panel)) {
    root.appendChild(panel);
  }
  if (panel) panel.hidden = true;
  if (trigger) trigger.setAttribute("aria-expanded", "false");
  if (overlay) {
    overlay.classList.remove("open");
    overlay.innerHTML = "";
    overlay.setAttribute("aria-hidden", "true");
    overlay.onclick = null;
  }
}

function openPathOptionsOverlay(anchorEl) {
  if (!anchorEl) return;
  teardownPickerOverlay();
  closePathChromeOverlay();
  closePathOptionsOverlay();
  const overlay = document.getElementById("path-options-overlay");
  const body = document.getElementById("sidebar-controls-body");
  if (!overlay || !body) return;

  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden", "false");
  overlay.onclick = (e) => {
    if (e.target === overlay) closePathOptionsOverlay();
  };

  const onEsc = (e) => {
    if (e.key === "Escape") closePathOptionsOverlay();
  };
  pathOptionsEscHandler = onEsc;
  document.addEventListener("keydown", onEsc);

  const pop = document.createElement("div");
  pop.className = "picker-popover path-options-popover";
  if (isLayoutTop()) pop.classList.add("path-options-popover--top");

  const header = document.createElement("div");
  header.className = "picker-popover-header";
  header.innerHTML = `<div class="picker-title">Options</div>`;
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "picker-close";
  closeBtn.textContent = "Close";
  closeBtn.onclick = () => closePathOptionsOverlay();
  header.appendChild(closeBtn);

  const popBody = document.createElement("div");
  popBody.className = "picker-popover-body path-options-popover-body";
  popBody.appendChild(body);

  pop.appendChild(header);
  pop.appendChild(popBody);
  overlay.appendChild(pop);

  const onViewportChange = () => fitPickerPopoverInViewport(anchorEl, pop);
  window.addEventListener("resize", onViewportChange);
  window.addEventListener("scroll", onViewportChange, true);
  pathOptionsViewportCleanup = () => {
    window.removeEventListener("resize", onViewportChange);
    window.removeEventListener("scroll", onViewportChange, true);
  };

  requestAnimationFrame(() => {
    fitPickerPopoverInViewport(anchorEl, pop);
    requestAnimationFrame(() => fitPickerPopoverInViewport(anchorEl, pop));
  });
}

window.openPathOptionsOverlay = openPathOptionsOverlay;
window.openPathChromeOverlay = openPathChromeOverlay;

function openPathChromeOverlay(anchorEl) {
  if (!anchorEl) return;
  teardownPickerOverlay();
  closePathOptionsOverlay();
  closePathChromeOverlay();
  const overlay = document.getElementById("path-chrome-overlay");
  const panel = document.getElementById("path-chrome-body-host");
  const trigger = document.getElementById("path-chrome-trigger");
  if (!overlay || !panel) return;

  panel.hidden = false;
  if (trigger) trigger.setAttribute("aria-expanded", "true");
  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden", "false");
  overlay.onclick = (e) => {
    if (e.target === overlay) closePathChromeOverlay();
  };

  const onEsc = (e) => {
    if (e.key === "Escape") closePathChromeOverlay();
  };
  pathChromeEscHandler = onEsc;
  document.addEventListener("keydown", onEsc);

  const pop = document.createElement("div");
  pop.className = "picker-popover path-chrome-popover";

  const header = document.createElement("div");
  header.className = "picker-popover-header";
  header.innerHTML = `<div class="picker-title">Interface options</div>`;
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "picker-close";
  closeBtn.textContent = "Close";
  closeBtn.onclick = () => closePathChromeOverlay();
  header.appendChild(closeBtn);

  const popBody = document.createElement("div");
  popBody.className = "picker-popover-body path-chrome-popover-body";
  popBody.appendChild(panel);

  pop.appendChild(header);
  pop.appendChild(popBody);
  overlay.appendChild(pop);

  const onViewportChange = () => fitPickerPopoverInViewport(anchorEl, pop);
  window.addEventListener("resize", onViewportChange);
  window.addEventListener("scroll", onViewportChange, true);
  pathChromeViewportCleanup = () => {
    window.removeEventListener("resize", onViewportChange);
    window.removeEventListener("scroll", onViewportChange, true);
  };

  requestAnimationFrame(() => {
    fitPickerPopoverInViewport(anchorEl, pop);
    requestAnimationFrame(() => fitPickerPopoverInViewport(anchorEl, pop));
  });
}

function applySidebarControlsCollapse() {
  const body = document.getElementById("sidebar-controls-body");
  if (body) body.classList.remove("is-collapsed");
  try {
    syncTopbarRightCompactClass();
    syncTopPanelHeightForPathOptions();
  } finally {
    updatePathOptionsTriggerSummary();
  }
}

function syncTopbarRightCompactClass() {
  const root = document.getElementById("app-layout");
  const right = document.querySelector(".selector-panel-right");
  if (!right) return;
  if (!root?.classList.contains("layout-top")) {
    right.classList.remove("selector-panel-right--compact");
    return;
  }
  right.classList.add("selector-panel-right--compact");
}

/** Top bar: previously grew --panel-top-height; top layout now uses a fixed slide-down drawer. */
function syncTopPanelHeightForPathOptions() {
  const root = document.getElementById("app-layout");
  if (!root?.classList.contains("layout-top")) return;
}

function initPathChromeCollapsible() {
  const root = document.getElementById("path-chrome-collapsible");
  const trigger = document.getElementById("path-chrome-trigger");
  const panel = document.getElementById("path-chrome-body-host");
  if (!root || !trigger || !panel) return;
  root.classList.remove("is-expanded");
  panel.hidden = true;
  trigger.setAttribute("aria-expanded", "false");
  trigger.addEventListener("click", () => openPathChromeOverlay(trigger));
}

function initPathOptionsOverlay() {
  const trigger = document.getElementById("path-options-trigger");
  if (trigger) {
    trigger.addEventListener("click", () => openPathOptionsOverlay(trigger));
  }
  applySidebarControlsCollapse();
}

function applyLayoutChrome() {
  const root = document.getElementById("app-layout");
  const collapseBtn = document.getElementById("btn-panel-collapse");
  const revealBtn = document.getElementById("panel-reveal-btn");
  const bSide = document.getElementById("btn-layout-sidebar");
  const bTop = document.getElementById("btn-layout-top");
  if (!root) return;

  const { mode, width, topH, collapsed } = readLayoutPrefs();

  root.classList.toggle("layout-sidebar", mode === "sidebar");
  root.classList.toggle("layout-top", mode === "top");
  root.classList.toggle("panel-collapsed", collapsed);

  root.style.setProperty("--panel-width", `${width}px`);
  root.style.setProperty("--panel-top-height", `${topH}px`);

  if (bSide) bSide.classList.toggle("active", mode === "sidebar");
  if (bTop) bTop.classList.toggle("active", mode === "top");
  syncInterfaceLayoutModeButtons();

  const topBarCollapse = document.getElementById("btn-topbar-collapse");

  if (collapseBtn) {
    collapseBtn.hidden = collapsed || mode === "top";
    collapseBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }
  if (topBarCollapse) {
    topBarCollapse.hidden = collapsed || mode !== "top";
    topBarCollapse.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }
  if (revealBtn) {
    revealBtn.hidden = !collapsed;
    revealBtn.textContent = mode === "top" ? "▼" : "»";
    revealBtn.title = mode === "top" ? "Show control bar" : "Show control panel";
    revealBtn.setAttribute("aria-label", mode === "top" ? "Show control bar" : "Show control panel");
  }

  const headerShowBtn = document.getElementById("btn-header-show-controls");
  if (headerShowBtn) {
    headerShowBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    if (collapsed) {
      headerShowBtn.title = mode === "top" ? "Edit path (top bar)" : "Edit path (sidebar)";
      headerShowBtn.setAttribute(
        "aria-label",
        mode === "top" ? "Edit path (open control bar)" : "Edit path (open control panel)"
      );
    } else {
      headerShowBtn.title = mode === "top" ? "Hide edit path (top bar)" : "Hide edit path (sidebar)";
      headerShowBtn.setAttribute(
        "aria-label",
        mode === "top" ? "Hide edit path (close control bar)" : "Hide edit path (close control panel)"
      );
    }
  }

  const drawerBtn = document.getElementById("btn-top-drawer");
  if (drawerBtn) {
    drawerBtn.hidden = mode !== "top";
    drawerBtn.setAttribute("aria-expanded", mode === "top" && !collapsed ? "true" : "false");
  }

  const backdrop = document.getElementById("top-drawer-backdrop");
  if (backdrop) {
    const open = mode === "top" && !collapsed;
    backdrop.hidden = !open;
    backdrop.setAttribute("aria-hidden", open ? "false" : "true");
  }

  const panelWrap = document.getElementById("selector-panel-wrap");
  if (panelWrap && mode === "top") {
    panelWrap.setAttribute("aria-hidden", collapsed ? "true" : "false");
  } else if (panelWrap) {
    panelWrap.removeAttribute("aria-hidden");
  }

  applySidebarControlsCollapse();
  updateDiagramEmptyChrome();
}

function syncInterfaceLayoutModeButtons() {
  const bH = document.getElementById("btn-interface-horizontal");
  const bV = document.getElementById("btn-interface-vertical");
  if (!bH && !bV) return;

  const chrome = readLayoutPrefs();
  const results = readResultsLayoutMode();

  const isHorizontal = chrome.mode === "top" && results === "stack";
  const isVertical = chrome.mode === "sidebar" && results === "side";

  if (bH) bH.classList.toggle("active", isHorizontal);
  if (bV) bV.classList.toggle("active", isVertical);
}

function persistLayoutPrefs(patch) {
  const cur = readLayoutPrefs();
  const next = { ...cur, ...patch };
  localStorage.setItem(LAYOUT_LS.mode, next.mode);
  localStorage.setItem(LAYOUT_LS.width, String(next.width));
  localStorage.setItem(LAYOUT_LS.topH, String(next.topH));
  localStorage.setItem(LAYOUT_LS.collapsed, next.collapsed ? "1" : "0");
  applyLayoutChrome();
}

function updateDiagramEmptyChrome() {
  const emptyEl = document.getElementById("diagram-empty");
  if (!emptyEl) return;

  const toolbar = document.getElementById("diagram-toolbar");
  const viewport = document.getElementById("diagram-viewport-wrap");
  const startBtn = document.getElementById("diagram-empty-start-btn");

  const emptyVisible = getComputedStyle(emptyEl).display !== "none";
  if (toolbar) toolbar.hidden = emptyVisible;
  if (viewport) viewport.hidden = emptyVisible;

  // Only show the "Start editing" CTA when the controls are hidden.
  if (startBtn) {
    const { collapsed } = readLayoutPrefs();
    startBtn.hidden = !emptyVisible || !collapsed;
  }
}

window.setChromeLayout = function setChromeLayout(mode) {
  const m = mode === "top" ? "top" : "sidebar";
  const prev = readLayoutPrefs().mode;
  persistLayoutPrefs({ mode: m });
  if (prev !== m) {
    rebuildGraph();
    renderWaypointChain();
    updatePathModeHint();
    updateQuickExamplesVisibility();
  }
};

window.togglePanelCollapsed = function togglePanelCollapsed() {
  const { collapsed } = readLayoutPrefs();
  persistLayoutPrefs({ collapsed: !collapsed });
};

window.startEditingFromEmpty = function startEditingFromEmpty() {
  const prefs = readLayoutPrefs();
  if (prefs?.collapsed) persistLayoutPrefs({ collapsed: false });
  // Make sure users immediately see what to do next.
  state.forceShowQuickExamples = true;
  updateQuickExamplesVisibility();
  schedulePersistSession();
  updateDiagramEmptyChrome();

  // Focus the first picker trigger if it exists (helps when chrome was hidden).
  setTimeout(() => {
    const first = document.querySelector("#waypoint-chain .element-trigger");
    if (first && typeof first.focus === "function") first.focus();
  }, 0);
};

function initLayoutChrome() {
  applyLayoutChrome();

  const root = document.getElementById("app-layout");
  const v = document.getElementById("panel-resize-v");
  const h = document.getElementById("panel-resize-h");
  const revealBtn = document.getElementById("panel-reveal-btn");
  if (!root) return;

  function startVerticalResize(e) {
    if (e.button !== 0) return;
    if (root.classList.contains("panel-collapsed")) return;
    if (!root.classList.contains("layout-sidebar")) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW =
      parseFloat(getComputedStyle(root).getPropertyValue("--panel-width")) || 280;
    function move(ev) {
      const dx = ev.clientX - startX;
      let nw = Math.round(startW + dx);
      nw = Math.max(PANEL_W_MIN, Math.min(PANEL_W_MAX, nw));
      root.style.setProperty("--panel-width", `${nw}px`);
    }
    function up() {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      const nw = Math.round(
        parseFloat(getComputedStyle(root).getPropertyValue("--panel-width")) || 280
      );
      localStorage.setItem(LAYOUT_LS.width, String(nw));
    }
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }

  function startHorizontalResize(e) {
    if (e.button !== 0) return;
    if (root.classList.contains("panel-collapsed")) return;
    if (!root.classList.contains("layout-top")) return;
    e.preventDefault();
    const startY = e.clientY;
    const startH =
      parseFloat(getComputedStyle(root).getPropertyValue("--panel-top-height")) || 200;
    const maxH = getPanelHMax();
    function move(ev) {
      const dy = ev.clientY - startY;
      let nh = Math.round(startH + dy);
      nh = Math.max(PANEL_H_MIN, Math.min(maxH, nh));
      root.style.setProperty("--panel-top-height", `${nh}px`);
    }
    function up() {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      const nh = Math.round(
        parseFloat(getComputedStyle(root).getPropertyValue("--panel-top-height")) || 200
      );
      localStorage.setItem(LAYOUT_LS.topH, String(nh));
    }
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }

  if (v) v.addEventListener("pointerdown", startVerticalResize);
  if (h) h.addEventListener("pointerdown", startHorizontalResize);

  if (v) {
    v.addEventListener("keydown", (e) => {
      if (root.classList.contains("panel-collapsed") || !root.classList.contains("layout-sidebar"))
        return;
      const step = e.shiftKey ? 24 : 8;
      let w = parseFloat(getComputedStyle(root).getPropertyValue("--panel-width")) || 280;
      if (e.key === "ArrowLeft") {
        w = Math.max(PANEL_W_MIN, w - step);
        root.style.setProperty("--panel-width", `${Math.round(w)}px`);
        localStorage.setItem(LAYOUT_LS.width, String(Math.round(w)));
        e.preventDefault();
      } else if (e.key === "ArrowRight") {
        w = Math.min(PANEL_W_MAX, w + step);
        root.style.setProperty("--panel-width", `${Math.round(w)}px`);
        localStorage.setItem(LAYOUT_LS.width, String(Math.round(w)));
        e.preventDefault();
      }
    });
  }
  if (h) {
    h.addEventListener("keydown", (e) => {
      if (root.classList.contains("panel-collapsed") || !root.classList.contains("layout-top")) return;
      const step = e.shiftKey ? 24 : 8;
      let ph = parseFloat(getComputedStyle(root).getPropertyValue("--panel-top-height")) || 200;
      const maxH = getPanelHMax();
      if (e.key === "ArrowUp") {
        ph = Math.max(PANEL_H_MIN, ph - step);
        root.style.setProperty("--panel-top-height", `${Math.round(ph)}px`);
        localStorage.setItem(LAYOUT_LS.topH, String(Math.round(ph)));
        e.preventDefault();
      } else if (e.key === "ArrowDown") {
        ph = Math.min(maxH, ph + step);
        root.style.setProperty("--panel-top-height", `${Math.round(ph)}px`);
        localStorage.setItem(LAYOUT_LS.topH, String(Math.round(ph)));
        e.preventDefault();
      }
    });
  }

  if (revealBtn) {
    revealBtn.addEventListener("click", () => {
      persistLayoutPrefs({ collapsed: false });
    });
  }

  const headerShowBtn = document.getElementById("btn-header-show-controls");
  if (headerShowBtn) {
    headerShowBtn.addEventListener("click", () => {
      window.togglePanelCollapsed();
    });
  }

  const backdrop = document.getElementById("top-drawer-backdrop");
  if (backdrop) {
    backdrop.addEventListener("click", () => {
      if (!root.classList.contains("layout-top")) return;
      persistLayoutPrefs({ collapsed: true });
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!root.classList.contains("layout-top") || root.classList.contains("panel-collapsed")) return;
    persistLayoutPrefs({ collapsed: true });
  });

  let resizeT = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeT);
    resizeT = window.setTimeout(() => {
      const maxH = getPanelHMax();
      let topH = parseFloat(getComputedStyle(root).getPropertyValue("--panel-top-height")) || 200;
      if (topH > maxH) {
        topH = maxH;
        root.style.setProperty("--panel-top-height", `${topH}px`);
        localStorage.setItem(LAYOUT_LS.topH, String(Math.round(topH)));
      }
      syncTopPanelHeightForPathOptions();
    }, 120);
  });
}

function getResultsDiagramPct(panel) {
  const v = getComputedStyle(panel).getPropertyValue("--results-diagram-pct").trim();
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 45;
}

function readResultsSplitPct() {
  const raw = localStorage.getItem(RESULTS_SPLIT_LS);
  let pct = parseFloat(raw || "");
  if (!Number.isFinite(pct)) pct = 45;
  return Math.max(RESULTS_PCT_MIN, Math.min(RESULTS_PCT_MAX, pct));
}

function applyResultsSplitPct(pct) {
  const panel = document.getElementById("results-panel");
  if (!panel) return;
  pct = Math.max(RESULTS_PCT_MIN, Math.min(RESULTS_PCT_MAX, pct));
  panel.style.setProperty("--results-diagram-pct", `${pct}%`);
}

function getResultsSidePct(panel) {
  const v = getComputedStyle(panel).getPropertyValue("--results-side-pct").trim();
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 40;
}

function readResultsSidePct() {
  const raw = localStorage.getItem(RESULTS_SIDE_SPLIT_LS);
  let pct = parseFloat(raw || "");
  if (!Number.isFinite(pct)) pct = 40;
  return Math.max(RESULTS_SIDE_PCT_MIN, Math.min(RESULTS_SIDE_PCT_MAX, pct));
}

function applyResultsSidePct(pct) {
  const panel = document.getElementById("results-panel");
  if (!panel) return;
  pct = Math.max(RESULTS_SIDE_PCT_MIN, Math.min(RESULTS_SIDE_PCT_MAX, pct));
  panel.style.setProperty("--results-side-pct", `${pct}%`);
}

function readResultsLayoutMode() {
  return localStorage.getItem(RESULTS_LAYOUT_LS) === "side" ? "side" : "stack";
}

function applyResultsLayoutMode(mode) {
  const panel = document.getElementById("results-panel");
  const handle = document.getElementById("results-split-resize");
  const btn = document.getElementById("btn-results-layout");
  const bBelow = document.getElementById("btn-details-below");
  const bBeside = document.getElementById("btn-details-beside");
  if (!panel) return;
  const side = mode === "side";
  panel.classList.toggle("results-layout--side", side);
  localStorage.setItem(RESULTS_LAYOUT_LS, side ? "side" : "stack");
  if (btn) {
    btn.textContent = side ? "Details below" : "Details beside";
    btn.title = side
      ? "Put path tabs and explanations back under the diagram"
      : "Put path tabs and explanations to the right of the diagram";
  }
  if (bBelow) bBelow.classList.toggle("active", !side);
  if (bBeside) bBeside.classList.toggle("active", side);
  syncInterfaceLayoutModeButtons();
  if (handle) {
    handle.setAttribute("aria-orientation", side ? "vertical" : "horizontal");
    handle.setAttribute(
      "aria-label",
      side
        ? "Resize diagram and path details (drag left or right)"
        : "Resize diagram and path details (drag up or down)"
    );
  }
  applyPathFlowFromStorage();
  if (state.segments) window.dispatch({ type: "RENDER_RESULTS" });
}

function getPathFlowStorageKey() {
  return isResultsSideLayoutActive() ? PATH_FLOW_SIDE_LS : PATH_FLOW_STACK_LS;
}

/** Defaults match former align-vertical: beside-diagram → vertical; stacked → horizontal. */
function readPathFlowForCurrentUi() {
  const key = getPathFlowStorageKey();
  const defaultFlow = isResultsSideLayoutActive() ? "vertical" : "horizontal";
  const raw = localStorage.getItem(key);
  if (raw === "horizontal" || raw === "vertical" || raw === "compact") return raw;
  const legacyKey = key === PATH_FLOW_SIDE_LS ? ALIGN_VERTICAL_SIDE_LS : ALIGN_VERTICAL_STACK_LS;
  const legacy = localStorage.getItem(legacyKey);
  if (legacy === "1") return "vertical";
  if (legacy === "0") return "horizontal";
  return defaultFlow;
}

function updatePathFlowButton() {
  const btn = document.getElementById("btn-toggle-vertical");
  if (!btn) return;
  const f = state.pathFlow;
  btn.textContent = PATH_FLOW_LABEL[f] || PATH_FLOW_LABEL.horizontal;
  btn.title =
    (PATH_FLOW_TITLE[f] || PATH_FLOW_TITLE.horizontal) +
    " Click again to cycle layout (Horizontal → Vertical → Compact).";
}

function applyPathFlowFromStorage() {
  state.pathFlow = readPathFlowForCurrentUi();
  updatePathFlowButton();
}

/** True when details are actually beside the diagram (row flex), not forced stacked by CSS. */
function isResultsSideLayoutActive() {
  const panel = document.getElementById("results-panel");
  if (!panel?.classList.contains("results-layout--side")) return false;
  return getComputedStyle(panel).flexDirection === "row";
}

const FEEDBACK_MAIL_TO = "hron@hey.com";
const FEEDBACK_MAIL_SUBJECT = "Bug report — ArchiTrek";

function buildFeedbackContextBody() {
  const lines = [];
  const vpSel = document.getElementById("viewpoint-select");
  const vpVal = vpSel?.value || "";
  const vpOpt = vpSel?.selectedOptions?.[0];
  const viewpointLabel =
    vpVal && vpOpt ? String(vpOpt.textContent || "").trim() : vpVal ? vpVal : "All elements";

  const domainKey = normalizeDomainContext(state.domainContext);
  let domainHuman = domainKey;
  if (typeof SCENARIOS !== "undefined" && SCENARIOS && SCENARIOS[domainKey]) {
    const s = SCENARIOS[domainKey];
    const bits = [s.label, s.name].filter(Boolean);
    domainHuman = bits.length ? `${bits.join(" · ")} (key: ${domainKey})` : domainKey;
  }

  const layout = readLayoutPrefs();
  const chromeLabel = layout.mode === "top" ? "Top bar" : "Sidebar";
  const resultsMode = readResultsLayoutMode();
  const resultsLabel =
    resultsMode === "side"
      ? isResultsSideLayoutActive()
        ? "Beside diagram (split)"
        : "Beside requested (narrow viewport — stacked)"
      : "Stacked below diagram";

  const so = getSearchPathOptions();
  let searchSnap = null;
  try {
    searchSnap = buildPathSearchReportPayload();
  } catch (_) {
    searchSnap = null;
  }

  lines.push("--- Auto-filled context (please keep) ---");
  lines.push(`When: ${new Date().toISOString()}`);
  try {
    lines.push(`Page: ${window.location.href}`);
  } catch (_) {
    lines.push("Page: (unavailable)");
  }
  lines.push(
    `Viewport: ${typeof window.innerWidth === "number" ? window.innerWidth : "?"}×${
      typeof window.innerHeight === "number" ? window.innerHeight : "?"
    }`
  );
  lines.push(`User agent: ${typeof navigator !== "undefined" ? navigator.userAgent : ""}`);
  lines.push(`- App loading / busy: ${state.loading ? "yes" : "no"}`);

  lines.push("");
  lines.push("Layout / chrome:");
  lines.push(`- Controls: ${chromeLabel}`);
  lines.push(`- Panel width / top height (px): ${layout.width} / ${layout.topH}`);
  lines.push(`- Control panel hidden: ${layout.collapsed ? "yes" : "no"}`);
  lines.push(`- Path details layout: ${resultsLabel}`);
  const rp = document.getElementById("results-panel");
  if (rp) {
    lines.push(
      `- Diagram vs details split: ~${Math.round(getResultsDiagramPct(rp))}% diagram (stack mode)`
    );
    if (resultsMode === "side" && isResultsSideLayoutActive()) {
      lines.push(`- Side split: ~${Math.round(getResultsSidePct(rp))}% diagram`);
    }
  }

  lines.push("");
  lines.push("Scenario & viewpoint (how the app was used):");
  lines.push(`- Domain / storytelling context: ${domainHuman}`);
  lines.push(
    `- Viewpoint (dropdown): ${viewpointLabel}${vpVal ? ` (key: ${vpVal})` : ""}`
  );
  const paletteRestricted =
    vpVal &&
    typeof VIEWPOINTS !== "undefined" &&
    VIEWPOINTS[vpVal] &&
    !VIEWPOINTS[vpVal].allElements;
  lines.push(
    `- Element palette: ${
      paletteRestricted
        ? "restricted to elements allowed by the selected viewpoint"
        : "full Appendix B (All elements or a viewpoint that allows all elements)"
    }`
  );
  if (searchSnap) {
    lines.push(`- Waypoint chain summary: ${searchSnap.waypointChainDescription}`);
    lines.push(
      `- Path mode: ${searchSnap.mode === "set" ? "Connect set" : "Ordered waypoints"} · picked element slots: ${searchSnap.waypointCount} · distinct elements (connect set): ${searchSnap.connectSetDistinctCount}`
    );
  } else {
    lines.push(`- Path mode: ${state.selectionMode === "set" ? "Connect set" : "Ordered waypoints"}`);
  }

  lines.push("");
  lines.push("Pathfinder & graph settings:");
  lines.push(`- Relationships: ${state.includeDerived ? "+ Derived" : "Direct only"}`);
  lines.push(`- Association fallback (§5.2.4 bridges): ${state.allowAssociationFallback ? "on" : "off"}`);
  lines.push(
    `- Weighted UCS: direct=${so.pathWeightDirect} · derived=${so.pathWeightDerived} · association=${so.pathWeightAssociation} · layerSkip=${so.pathWeightLayerSkip} · violation=${so.pathViolationPenalty}`
  );
  lines.push(
    `- Semantic rigor: preset=${normalizeSearchRigorPreset(state.searchRigorPreset)} · corePrune=${so.restrictCoreToCore} · grammar=${so.enforceGrammar} · strictRealization=${so.strictRealization}`
  );
  const pcm = so.perspectiveClassMode || normalizePerspectiveClassMode(state.perspectiveClassMode);
  const domPct =
    pcm === "dominant-share"
      ? Math.round((so.perspectiveDominantShare != null ? so.perspectiveDominantShare : clampPerspectiveDominantSharePct(state.perspectiveDominantSharePct) / 100) * 100)
      : null;
  lines.push(
    `- Perspective grouping: ${pcm}${domPct != null ? ` · dominant-share threshold ${domPct}%` : ""}`
  );
  lines.push(
    `- Limits: max ${so.maxDepth} hops/segment · ${so.maxPaths} route alternatives · expansion budget ${normalizeSearchEffort(state.searchEffort)} (maxStates≈${so.maxStates})`
  );
  if (searchSnap) {
    lines.push(
      `- Snapshot flags: includeDerived=${searchSnap.includeDerived} · allowAssociationFallback=${searchSnap.allowAssociationFallback}`
    );
  }

  lines.push("");
  lines.push("Diagram view:");
  lines.push(`- Mode: ${state.mode === "swimlane" ? "Swimlanes" : "Compact"}`);
  lines.push(`- Path layout: ${state.pathFlow}`);
  lines.push(`- Step numbers on arrows: ${state.showBadges ? "on" : "off"}`);
  lines.push(`- Composite sub-component illustrations: ${state.showCompositeSubs !== false ? "on" : "off"}`);
  lines.push(`- Quick examples pinned: ${state.forceShowQuickExamples ? "yes" : "no"}`);

  lines.push("");
  lines.push("Waypoints (layer → element per slot):");
  const wps = state.waypoints || [];
  if (!wps.length) {
    lines.push("- (none)");
  } else {
    wps.forEach((wp, i) => {
      const layer = wp.layer || "—";
      const el = wp.element || "—";
      lines.push(`- ${i + 1}. ${layer} → ${el}`);
    });
  }
  if (state.selectionMode === "set" && state.lastAutoOrderInput?.length) {
    lines.push(
      `- Connect-set solver input (unordered names): ${state.lastAutoOrderInput.filter(Boolean).join(", ")}`
    );
  }

  lines.push("");
  lines.push("Path finder / last run:");
  if (state.lastPathSearchStatus) {
    lines.push(`- Last search status: ${state.lastPathSearchStatus}`);
  }
  if (state.lastPathTemporaryRelaxation && typeof state.lastPathTemporaryRelaxation === "object") {
    lines.push(`- Last successful path used temporary relax (one-shot CTA): ${JSON.stringify(state.lastPathTemporaryRelaxation)}`);
  }
  if (state._perspectiveSuggestFullMetamodel) {
    lines.push("- Perspective “add elements” suggestions: expanded to full metamodel (outside strict viewpoint)");
  }
  const gSize = state.graph && typeof state.graph.size === "number" ? state.graph.size : null;
  lines.push(`- Graph size (nodes): ${gSize != null ? gSize : "—"}`);
  const segs = state.segments;
  const hasNoPath =
    !Array.isArray(segs) ||
    segs.length === 0 ||
    segs.some((s) => !s.paths || s.paths.length === 0);
  const hasAnyPath = Array.isArray(segs) && segs.length > 0 && !hasNoPath;

  if (!Array.isArray(segs)) {
    lines.push("- Segments: (none — cleared or find not run yet).");
  } else if (segs.length === 0) {
    lines.push("- Segments: [] (last connect-set search found no valid chain).");
  } else {
    lines.push(`- Segments: ${segs.length}`);
    lines.push(`- Any complete route: ${hasAnyPath ? "yes" : "no"}`);
    if (hasAnyPath) {
      lines.push(
        `- Last successful path used Association fallback (penalized hop): ${state.lastPathIsFallback ? "yes" : "no"}`
      );
    }
    lines.push(`- Active alternative tab: ${(state.activePathIdx ?? 0) + 1}`);
    if (state.selectionMode === "set" && state.lastAutoOrderResult?.length) {
      lines.push(`- Auto-ordered chain: ${state.lastAutoOrderResult.join(" → ")}`);
      const m = state.lastAutoOrderMetrics;
      if (m && Number.isFinite(m.totalScore)) {
        lines.push(
          `- Connect-set metrics: weighted cost ${m.totalScore} · ${m.pointCount} points · ${m.orderingExact ? "exact" : "heuristic"} ordering · max ${so.maxDepth} hops/segment`
        );
      }
    }
  }
  if (hasNoPath && state.pathFailureHints && typeof state.pathFailureHints === "object") {
    lines.push(
      `- No-path probe (would Derived / Association help?): ${JSON.stringify(state.pathFailureHints)}`
    );
  }
  const uc = state.userChoices && typeof state.userChoices === "object" ? state.userChoices : {};
  const ucKeys = Object.keys(uc);
  if (ucKeys.length) {
    lines.push(`- Ambiguous-hop disambiguation (userChoices): ${JSON.stringify(uc)}`);
  }

  const mm = state.mmLast;
  if (mm?.fromEl && mm?.toEl) {
    lines.push("");
    lines.push("Last metamodel focus (if relevant):");
    lines.push(`- ${mm.fromEl} → ${mm.toEl}${mm.appendixRel ? ` (${mm.appendixRel})` : ""}`);
  }

  lines.push("");
  lines.push("--- End context ---");

  return lines.join("\n");
}

function buildFullFeedbackReport(message, replyEmail) {
  const parts = [];
  parts.push(`To: ${FEEDBACK_MAIL_TO}`);
  parts.push(`Subject: ${FEEDBACK_MAIL_SUBJECT}`);
  parts.push("");
  parts.push("--- Your message ---");
  parts.push(message.trim() || "(no message)");
  if (replyEmail && replyEmail.trim()) {
    parts.push("");
    parts.push(`Reply contact: ${replyEmail.trim()}`);
  }
  parts.push("");
  parts.push(buildFeedbackContextBody());
  return parts.join("\n");
}

window.openFeedbackModal = function openFeedbackModal() {
  const modal = document.getElementById("feedback-modal");
  const ctx = document.getElementById("feedback-context-field");
  const msg = document.getElementById("feedback-message-field");
  const reply = document.getElementById("feedback-reply-email");
  const status = document.getElementById("feedback-status");
  if (!modal) return;
  if (ctx) ctx.value = buildFeedbackContextBody();
  if (msg) msg.value = "";
  if (reply) reply.value = "";
  if (status) {
    status.textContent = "";
    status.classList.remove("feedback-status--error");
  }
  modal.style.display = "flex";
  modal.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => {
    msg?.focus();
  });
};

window.closeFeedbackModal = function closeFeedbackModal() {
  const modal = document.getElementById("feedback-modal");
  if (!modal) return;
  modal.style.display = "none";
  modal.setAttribute("aria-hidden", "true");
};

function syncRigorGuideModalHighlight() {
  const preset = normalizeSearchRigorPreset(state.searchRigorPreset);
  document.querySelectorAll(".rigor-guide-table tbody tr[data-rigor-preset]").forEach((tr) => {
    const key = tr.getAttribute("data-rigor-preset");
    const active = key === preset && preset !== "custom";
    tr.classList.toggle("rigor-guide-highlight", active);
  });
}

window.openRigorGuideModal = function openRigorGuideModal() {
  syncRigorGuideModalHighlight();
  const modal = document.getElementById("rigor-guide-modal");
  if (!modal) return;
  modal.style.display = "flex";
  modal.setAttribute("aria-hidden", "false");
  const card = modal.querySelector(".rigor-guide-modal-card");
  requestAnimationFrame(() => {
    if (card && typeof card.focus === "function") card.focus();
  });
};

window.closeRigorGuideModal = function closeRigorGuideModal() {
  const modal = document.getElementById("rigor-guide-modal");
  if (!modal) return;
  modal.style.display = "none";
  modal.setAttribute("aria-hidden", "true");
};

window.openSearchDepthGuideModal = function openSearchDepthGuideModal() {
  const modal = document.getElementById("search-depth-guide-modal");
  if (!modal) return;
  modal.style.display = "flex";
  modal.setAttribute("aria-hidden", "false");
  const card = modal.querySelector(".rigor-guide-modal-card");
  requestAnimationFrame(() => {
    if (card && typeof card.focus === "function") card.focus();
  });
};

window.closeSearchDepthGuideModal = function closeSearchDepthGuideModal() {
  const modal = document.getElementById("search-depth-guide-modal");
  if (!modal) return;
  modal.style.display = "none";
  modal.setAttribute("aria-hidden", "true");
};

function getFeedbackWeb3AccessKey() {
  try {
    const k = typeof window !== "undefined" && window.FEEDBACK_WEB3FORMS_ACCESS_KEY;
    return typeof k === "string" ? k.trim() : "";
  } catch (_) {
    return "";
  }
}

function setFeedbackStatus(text, isError) {
  const status = document.getElementById("feedback-status");
  if (!status) return;
  status.textContent = text;
  status.classList.toggle("feedback-status--error", !!isError);
}

window.copyFeedbackReport = async function copyFeedbackReport() {
  const msg = document.getElementById("feedback-message-field")?.value?.trim() ?? "";
  const reply = document.getElementById("feedback-reply-email")?.value?.trim() ?? "";
  const text = buildFullFeedbackReport(msg, reply);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      throw new Error("clipboard unavailable");
    }
  } catch (_) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("aria-hidden", "true");
    ta.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } finally {
      document.body.removeChild(ta);
    }
  }
  setFeedbackStatus(
    "Copied to clipboard. Paste into your email or webmail if you still need to send manually.",
    false
  );
};

window.submitFeedbackReport = async function submitFeedbackReport() {
  const key = getFeedbackWeb3AccessKey();
  const msg = document.getElementById("feedback-message-field")?.value?.trim() ?? "";
  const reply = document.getElementById("feedback-reply-email")?.value?.trim() ?? "";
  const sendBtn = document.getElementById("feedback-send-btn");
  const copyBtn = document.getElementById("feedback-copy-btn");

  if (!key) {
    setFeedbackStatus(
      "Email sending is not set up yet. Add your Web3Forms access key in config/feedback-config.js, or use Copy report.",
      true
    );
    trackEvent("feedback_submit", { ok: false, reason: "missing_web3forms_key" });
    return;
  }

  const bodyText = buildFullFeedbackReport(msg, reply);
  const emailField = reply || "anonymous@example.com";
  const prevLabel = sendBtn?.textContent;

  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.setAttribute("aria-busy", "true");
    sendBtn.textContent = "Sending…";
  }
  if (copyBtn) copyBtn.disabled = true;

  try {
    const res = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        access_key: key,
        subject: FEEDBACK_MAIL_SUBJECT,
        from_name: "ArchiTrek feedback",
        email: emailField,
        ...(reply ? { replyto: reply } : {}),
        message: bodyText,
        botcheck: false,
      }),
    });
    const data = await res.json().catch(() => ({}));
    const ok =
      res.ok &&
      (data.success === true || (data.body && data.body.success === true));
    if (!ok) {
      const errText =
        (typeof data.message === "string" && data.message) ||
        (data.body && typeof data.body.message === "string" && data.body.message) ||
        `Could not send (${res.status}). Try Copy report.`;
      throw new Error(errText);
    }
    setFeedbackStatus(
      "Sent. Thank you — if you left a reply address, you may get a follow-up there.",
      false
    );
    trackEvent("feedback_submit", { ok: true });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    setFeedbackStatus(m, true);
    trackEvent("feedback_submit", { ok: false, reason: "network_or_api_error" });
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.removeAttribute("aria-busy");
      if (prevLabel != null) sendBtn.textContent = prevLabel;
    }
    if (copyBtn) copyBtn.disabled = false;
  }
};

/** Toggle path details: stacked under the graph vs column to the right. */
window.toggleResultsLayout = function toggleResultsLayout() {
  const panel = document.getElementById("results-panel");
  const cur = panel?.classList.contains("results-layout--side") ? "side" : "stack";
  applyResultsLayoutMode(cur === "side" ? "stack" : "side");
};

window.setResultsLayoutMode = function setResultsLayoutMode(mode) {
  applyResultsLayoutMode(mode === "side" ? "side" : "stack");
};

window.setInterfaceLayout = function setInterfaceLayout(mode) {
  const m = mode === "vertical" ? "vertical" : "horizontal";

  // Horizontal panels: controls on top, details below; default graph layout: Horizontal.
  // Vertical panels: controls on left, details beside; default graph layout: Vertical.
  if (m === "horizontal") {
    persistLayoutPrefs({ mode: "top" });
    applyResultsLayoutMode("stack");
    localStorage.setItem(PATH_FLOW_STACK_LS, "horizontal");
  } else {
    persistLayoutPrefs({ mode: "sidebar" });
    applyResultsLayoutMode("side");
    localStorage.setItem(PATH_FLOW_SIDE_LS, "vertical");
  }

  applyPathFlowFromStorage();
  rebuildGraph();
  if (state.segments) window.dispatch({ type: "RENDER_RESULTS" });
  renderWaypointChain();
  updatePathModeHint();
  updateQuickExamplesVisibility();
};

/** Draggable divider: horizontal split (stacked) or vertical split (details beside graph). */
function initResultsSplit() {
  const panel = document.getElementById("results-panel");
  const handle = document.getElementById("results-split-resize");
  if (!panel || !handle) return;

  applyResultsLayoutMode(readResultsLayoutMode());
  applyResultsSplitPct(readResultsSplitPct());
  applyResultsSidePct(readResultsSidePct());

  let resizeAlignT = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeAlignT);
    resizeAlignT = window.setTimeout(() => {
      const before = state.pathFlow;
      applyPathFlowFromStorage();
      if (state.segments && before !== state.pathFlow) window.dispatch({ type: "RENDER_RESULTS" });
    }, 150);
  });

  function startResizeStack(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const startY = e.clientY;
    const panelRect = panel.getBoundingClientRect();
    const panelH = panelRect.height;
    if (panelH < 80) return;
    const startPct = getResultsDiagramPct(panel);

    function move(ev) {
      const dy = ev.clientY - startY;
      const deltaPct = (dy / panelH) * 100;
      let next = startPct + deltaPct;
      next = Math.max(RESULTS_PCT_MIN, Math.min(RESULTS_PCT_MAX, next));
      panel.style.setProperty("--results-diagram-pct", `${next}%`);
    }
    function up() {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      const pct = Math.round(getResultsDiagramPct(panel));
      localStorage.setItem(RESULTS_SPLIT_LS, String(pct));
    }
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }

  function startResizeSide(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const panelRect = panel.getBoundingClientRect();
    const panelW = panelRect.width;
    if (panelW < 160) return;
    const startPct = getResultsSidePct(panel);

    function move(ev) {
      const dx = ev.clientX - startX;
      const deltaPct = -(dx / panelW) * 100;
      let next = startPct + deltaPct;
      next = Math.max(RESULTS_SIDE_PCT_MIN, Math.min(RESULTS_SIDE_PCT_MAX, next));
      panel.style.setProperty("--results-side-pct", `${next}%`);
    }
    function up() {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      const pct = Math.round(getResultsSidePct(panel));
      localStorage.setItem(RESULTS_SIDE_SPLIT_LS, String(pct));
    }
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }

  function startResize(e) {
    if (e.button !== 0) return;
    if (isResultsSideLayoutActive()) startResizeSide(e);
    else startResizeStack(e);
  }

  handle.addEventListener("pointerdown", startResize);

  handle.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 4 : 1;
    if (isResultsSideLayoutActive()) {
      let pct = getResultsSidePct(panel);
      if (e.key === "ArrowRight") {
        pct = Math.min(RESULTS_SIDE_PCT_MAX, pct + step);
        panel.style.setProperty("--results-side-pct", `${pct}%`);
        localStorage.setItem(RESULTS_SIDE_SPLIT_LS, String(Math.round(pct)));
        e.preventDefault();
      } else if (e.key === "ArrowLeft") {
        pct = Math.max(RESULTS_SIDE_PCT_MIN, pct - step);
        panel.style.setProperty("--results-side-pct", `${pct}%`);
        localStorage.setItem(RESULTS_SIDE_SPLIT_LS, String(Math.round(pct)));
        e.preventDefault();
      }
      return;
    }
    let pct = getResultsDiagramPct(panel);
    if (e.key === "ArrowDown") {
      pct = Math.min(RESULTS_PCT_MAX, pct + step);
      panel.style.setProperty("--results-diagram-pct", `${pct}%`);
      localStorage.setItem(RESULTS_SPLIT_LS, String(Math.round(pct)));
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      pct = Math.max(RESULTS_PCT_MIN, pct - step);
      panel.style.setProperty("--results-diagram-pct", `${pct}%`);
      localStorage.setItem(RESULTS_SPLIT_LS, String(Math.round(pct)));
      e.preventDefault();
    }
  });
}


// ── Initialise ──────────────────────────────────────────────────────────────

window.showHelp = function() {
  const m = document.getElementById("help-modal");
  if (!m) return;
  m.setAttribute("aria-hidden", "false");
  lockBodyScroll();
  // Focus the dialog so Esc/keyboard users start inside it.
  const card = m.querySelector(".help-modal-card");
  if (card && typeof card.focus === "function") card.focus();
};

window.hideHelp = function() {
  const m = document.getElementById("help-modal");
  if (!m) return;
  m.setAttribute("aria-hidden", "true");
  unlockBodyScroll();
};

/** Official ArchiMate 3.x specification (same family as embedded § references). */
const ARCHIMATE_SPEC_BASE = "https://pubs.opengroup.org/architecture/archimate32-doc/";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sortLayerEntries(layerCounts) {
  const order = typeof LAYERS !== "undefined" ? LAYERS.map((l) => l.id) : [];
  const entries = Object.entries(layerCounts || {});
  entries.sort((a, b) => {
    const ia = order.indexOf(a[0]);
    const ib = order.indexOf(b[0]);
    const va = ia === -1 ? 999 : ia;
    const vb = ib === -1 ? 999 : ib;
    if (va !== vb) return va - vb;
    return b[1] - a[1];
  });
  return entries;
}

function relCodeLabel(code) {
  const r = typeof RELATIONSHIPS !== "undefined" ? RELATIONSHIPS[code] : null;
  return r ? `${r.name} (${code})` : String(code);
}

function formatCodePills(codesObj, emptyLabel) {
  const pairs = Object.entries(codesObj || {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!pairs.length) return `<span class="el-info-muted">${emptyLabel}</span>`;
  return pairs
    .map(
      ([c, n]) =>
        `<span class="el-code-pill" title="${escapeHtml(relCodeLabel(c))}"><code>${escapeHtml(c)}</code><span class="el-code-n">×${n}</span></span>`
    )
    .join(" ");
}

function codesArrayToCountObj(arr) {
  const o = Object.create(null);
  for (const c of arr || []) {
    const u = String(c).toUpperCase();
    o[u] = (o[u] || 0) + 1;
  }
  return o;
}

function layerBridgeHint(centerLayer, partnerLayer, direction) {
  const key =
    direction === "out"
      ? `${centerLayer}→${partnerLayer}`
      : `${partnerLayer}→${centerLayer}`;
  const rule = typeof LAYER_RULES !== "undefined" ? LAYER_RULES[key] : null;
  if (rule) {
    return `<span class="el-neighbor-bridge" title="${escapeHtml(rule.explanation)}">${escapeHtml(rule.pattern)}</span>`;
  }
  if (centerLayer === partnerLayer) {
    return `<span class="el-neighbor-bridge el-neighbor-bridge--same" title="Both element types belong to the same ArchiMate layer">Same layer</span>`;
  }
  return `<span class="el-neighbor-bridge el-neighbor-bridge--cross" title="Cross-layer link in Appendix B (no curated layer-pattern snippet in this tool)">Cross-layer</span>`;
}

function getLayerBorderColor(layerId) {
  const L = typeof LAYERS !== "undefined" ? LAYERS : [];
  const row = L.find((l) => l.id === layerId);
  return row?.borderColor || "#64748b";
}

/**
 * Up to 6 nodes: top 3 same-layer + top 3 other-layer (by Appendix B row richness), then fill if one side is thin.
 */
function pickConstellationNeighbors(ranks, centerLayer, maxTotal = 6) {
  const list = ranks || [];
  if (!list.length) return [];
  const same = list.filter((n) => n.layer === centerLayer);
  const cross = list.filter((n) => n.layer !== centerLayer);
  const maxPer = 3;
  const picked = [];
  const seen = new Set();
  const pushUnique = (row, kind) => {
    if (picked.length >= maxTotal || seen.has(row.partner)) return;
    seen.add(row.partner);
    picked.push({ ...row, _kind: kind });
  };
  for (let k = 0; k < Math.min(maxPer, same.length); k++) pushUnique(same[k], "same");
  for (let k = 0; k < Math.min(maxPer, cross.length); k++) pushUnique(cross[k], "cross");
  if (picked.length < maxTotal) {
    const rest = [...same.slice(maxPer), ...cross.slice(maxPer)];
    for (const r of rest) {
      pushUnique(r, r.layer === centerLayer ? "same" : "cross");
      if (picked.length >= maxTotal) break;
    }
  }
  return picked;
}

function splitLabelLines(name, maxLine = 22) {
  const s = String(name || "").trim();
  if (s.length <= maxLine) return [s];
  const mid = s.lastIndexOf(" ", maxLine);
  const cut = mid > 10 ? mid : maxLine;
  const a = s.slice(0, cut).trim();
  const b = s.slice(cut).trim();
  if (!b) return [a];
  return [a, b.length > maxLine ? b.slice(0, maxLine - 1) + "…" : b];
}

function buildNeighborConstellationSvg(centerName, ranks, direction, centerLayer) {
  const neighbors = pickConstellationNeighbors(ranks, centerLayer, 6);
  if (neighbors.length === 0) return "";
  const sameStroke = getLayerBorderColor(centerLayer);
  const crossStroke = "#7c3aed";
  const n = neighbors.length;
  const cx = 200;
  const cyHub = 108;
  const R = 74;
  const hubR = 11;
  const parts = [];
  const sameCenter = escapeHtml(centerLayer);
  for (let i = 0; i < n; i++) {
    const angle = Math.PI - (Math.PI * i) / Math.max(n - 1, 1);
    const x = cx + R * Math.cos(angle);
    const y = cyHub - R * Math.sin(angle);
    const isSame = neighbors[i].layer === centerLayer;
    const stroke = isSame ? sameStroke : crossStroke;
    const sw = isSame ? 2.25 : 2;
    if (direction === "out") {
      parts.push(
        `<line x1="${cx}" y1="${cyHub}" x2="${x}" y2="${y}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" opacity="0.92"/>`
      );
    } else {
      parts.push(
        `<line x1="${x}" y1="${y}" x2="${cx}" y2="${cyHub}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" opacity="0.92"/>`
      );
    }
    parts.push(
      `<circle cx="${x}" cy="${y}" r="8.5" fill="#fff" stroke="${stroke}" stroke-width="1.8"/>`
    );
    const dx = x - cx;
    const dy = y - cyHub;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const pad = 14;
    const labX = x + ux * pad;
    const labY = y + uy * pad;
    let anchor = "middle";
    if (ux > 0.25) anchor = "start";
    else if (ux < -0.25) anchor = "end";
    const lines = splitLabelLines(neighbors[i].partner, 20);
    const line0 = escapeHtml(lines[0]);
    const line1 = lines[1] ? escapeHtml(lines[1]) : "";
    if (line1) {
      parts.push(
        `<text x="${labX}" y="${labY - 3}" text-anchor="${anchor}" font-size="9" fill="#334155" font-family="system-ui,sans-serif" font-weight="600">${line0}</text>`
      );
      parts.push(
        `<text x="${labX}" y="${labY + 8}" text-anchor="${anchor}" font-size="9" fill="#334155" font-family="system-ui,sans-serif" font-weight="600">${line1}</text>`
      );
    } else {
      parts.push(
        `<text x="${labX}" y="${labY + 3}" text-anchor="${anchor}" font-size="9.5" fill="#334155" font-family="system-ui,sans-serif" font-weight="600">${line0}</text>`
      );
    }
  }
  parts.push(
    `<circle cx="${cx}" cy="${cyHub}" r="${hubR}" fill="#1e3a5f" stroke="${sameStroke}" stroke-width="2"/>`
  );
  const centerLines = splitLabelLines(centerName, 16);
  const c0 = escapeHtml(centerLines[0]);
  const c1 = centerLines[1] ? escapeHtml(centerLines[1]) : "";
  const titleY = cyHub + hubR + 12;
  if (c1) {
    parts.push(
      `<text x="${cx}" y="${titleY}" text-anchor="middle" font-size="9.5" fill="#0f172a" font-family="system-ui,sans-serif" font-weight="700">${c0}</text>`
    );
    parts.push(
      `<text x="${cx}" y="${titleY + 11}" text-anchor="middle" font-size="9.5" fill="#0f172a" font-family="system-ui,sans-serif" font-weight="700">${c1}</text>`
    );
  } else {
    parts.push(
      `<text x="${cx}" y="${titleY + 4}" text-anchor="middle" font-size="10" fill="#0f172a" font-family="system-ui,sans-serif" font-weight="700">${c0}</text>`
    );
  }
  parts.push(
    `<text x="${cx}" y="${titleY + (c1 ? 26 : 20)}" text-anchor="middle" font-size="9" fill="#64748b" font-family="system-ui,sans-serif">${sameCenter}</text>`
  );
  const caption =
    direction === "out" ? "Direct targets (richest rows)" : "Direct sources (richest rows)";
  parts.push(
    `<text x="${cx}" y="${titleY + (c1 ? 40 : 34)}" text-anchor="middle" font-size="9.5" fill="#64748b" font-family="system-ui,sans-serif">${escapeHtml(caption)}</text>`
  );
  const legY = titleY + (c1 ? 52 : 46);
  parts.push(
    `<g aria-label="Legend">
      <line x1="88" y1="${legY}" x2="108" y2="${legY}" stroke="${sameStroke}" stroke-width="2.25" stroke-linecap="round"/>
      <text x="114" y="${legY + 3}" font-size="8.5" fill="#475569" font-family="system-ui,sans-serif">Same layer</text>
      <line x1="218" y1="${legY}" x2="238" y2="${legY}" stroke="${crossStroke}" stroke-width="2" stroke-linecap="round"/>
      <text x="244" y="${legY + 3}" font-size="8.5" fill="#475569" font-family="system-ui,sans-serif">Other layer</text>
    </g>`
  );
  const aria = `${caption} around ${centerName}; same-layer lines use ${centerLayer} accent, other layers violet`;
  const vbH = Math.max(182, legY + 14);
  return `<svg class="el-neighbor-constellation" viewBox="0 0 400 ${vbH}" role="img" aria-label="${escapeHtml(aria)}">${parts.join("")}</svg>`;
}

function neighborRowHtml(neighbor, direction, centerLayer, rank) {
  const enc = encodeURIComponent(neighbor.partner);
  const bridge = layerBridgeHint(centerLayer, neighbor.layer, direction);
  const pills = formatCodePills(codesArrayToCountObj(neighbor.codesDirect), "—");
  let icon = "";
  if (typeof window.getElementMiniSvg === "function") {
    try {
      icon = window.getElementMiniSvg(neighbor.partner, 20);
    } catch (e) {
      icon = "";
    }
  }
  const topClass = rank <= 3 ? " el-neighbor-row--top" : "";
  return `
    <li class="el-neighbor-row${topClass}">
      <span class="el-neighbor-rank">${rank}</span>
      <div class="el-neighbor-main">
        <div class="el-neighbor-head">
          <button type="button" class="el-neighbor-chip el-info-trigger" data-element="${enc}">
            <span class="el-neighbor-icon-wrap" aria-hidden="true">${icon}</span>
            <span class="el-neighbor-name">${escapeHtml(neighbor.partner)}</span>
          </button>
          <span class="el-neighbor-meta">${escapeHtml(neighbor.layer)} · ${escapeHtml(neighbor.aspect)}</span>
        </div>
        <div class="el-neighbor-foot">
          <span class="el-neighbor-bridge-wrap">${bridge}</span>
          <span class="el-neighbor-codes">${pills}</span>
        </div>
      </div>
    </li>`;
}

function buildNeighborExplorerHtml(name, outgoing, incoming, centerLayer) {
  const outR = outgoing.neighborRanks || [];
  const inR = incoming.neighborRanks || [];
  if (!outR.length && !inR.length) return "";

  const topOut = sortLayerEntries(outgoing.layersDirect)[0];
  const topIn = sortLayerEntries(incoming.layersDirect)[0];
  const focusParts = [];
  if (topOut) {
    focusParts.push(
      `targets most often in <strong>${escapeHtml(topOut[0])}</strong> (${topOut[1]} type${topOut[1] === 1 ? "" : "s"})`
    );
  }
  if (topIn) {
    focusParts.push(
      `sources most often from <strong>${escapeHtml(topIn[0])}</strong> (${topIn[1]} type${topIn[1] === 1 ? "" : "s"})`
    );
  }
  const focusLine = focusParts.length
    ? `<p class="el-neighbor-focus">Layer mix (direct partners): ${focusParts.join("; ")}.</p>`
    : "";

  const outList = outR
    .slice(0, 8)
    .map((n, i) => neighborRowHtml(n, "out", centerLayer, i + 1))
    .join("");
  const inList = inR
    .slice(0, 8)
    .map((n, i) => neighborRowHtml(n, "in", centerLayer, i + 1))
    .join("");

  const svgOut = buildNeighborConstellationSvg(name, outR, "out", centerLayer);
  const svgIn = buildNeighborConstellationSvg(name, inR, "in", centerLayer);

  return `
    <div class="el-neighbor-explorer">
      <h5 class="el-neighbor-heading">Closest neighbors</h5>
      <p class="el-neighbor-lede">
        Ranked by how many <em>direct</em> relationship codes sit on the Appendix B row for that partner (more codes = a richer “neighbor” row).
        Sketches show up to three <strong>same-layer</strong> partners (lines match the layer color from the stack) and up to three <strong>other-layer</strong> partners (violet). Lines read <strong>out</strong> from the center to targets, and <strong>in</strong> from sources to the center.
      </p>
      ${focusLine}
      <div class="el-neighbor-diagrams">
        ${svgOut ? `<div class="el-neighbor-svg-wrap">${svgOut}</div>` : ""}
        ${svgIn ? `<div class="el-neighbor-svg-wrap">${svgIn}</div>` : ""}
      </div>
      <div class="el-neighbor-columns">
        <div class="el-neighbor-col">
          <div class="el-neighbor-col-title">Outgoing — top targets</div>
          <ol class="el-neighbor-list">${outList || `<li class="el-info-muted">—</li>`}</ol>
        </div>
        <div class="el-neighbor-col">
          <div class="el-neighbor-col-title">Incoming — top sources</div>
          <ol class="el-neighbor-list">${inList || `<li class="el-info-muted">—</li>`}</ol>
        </div>
      </div>
    </div>`;
}

function buildMatrixConnectivityHtml(name) {
  if (typeof getMatrixConnectivitySummary !== "function") return "";
  const s = getMatrixConnectivitySummary(name);
  const { outgoing, incoming } = s;
  const meta = typeof ELEMENTS !== "undefined" ? ELEMENTS[name] : null;
  const centerLayer = meta?.layer || "Unknown";

  const outLayers = sortLayerEntries(outgoing.layersDirect)
    .map(([L, n]) => `<span class="el-layer-chip">${escapeHtml(L)} <strong>${n}</strong></span>`)
    .join("");
  const inLayers = sortLayerEntries(incoming.layersDirect)
    .map(([L, n]) => `<span class="el-layer-chip">${escapeHtml(L)} <strong>${n}</strong></span>`)
    .join("");

  const outIntro = `<strong>${outgoing.directPartnerCount}</strong> target element type${outgoing.directPartnerCount === 1 ? "" : "s"} with at least one <em>direct</em> (Appendix B) relationship`;
  const inIntro = `<strong>${incoming.directPartnerCount}</strong> source element type${incoming.directPartnerCount === 1 ? "" : "s"} with at least one <em>direct</em> relationship`;

  const derOut =
    outgoing.derivedOnlyPartnerCount > 0
      ? ` <span class="el-info-muted">· ${outgoing.derivedOnlyPartnerCount} target type${outgoing.derivedOnlyPartnerCount === 1 ? "" : "s"} only via <strong>derived</strong> (§5.7)</span>`
      : "";
  const derIn =
    incoming.derivedOnlyPartnerCount > 0
      ? ` <span class="el-info-muted">· ${incoming.derivedOnlyPartnerCount} source type${incoming.derivedOnlyPartnerCount === 1 ? "" : "s"} only via <strong>derived</strong> (§5.7)</span>`
      : "";

  return `
    <section class="el-matrix-section" aria-label="Appendix B connectivity">
      <h4 class="el-matrix-heading">Appendix B matrix (this tool)</h4>
      <p class="el-matrix-one-liner">
        Appendix B (as encoded here): <strong>${escapeHtml(name)}</strong> has a direct row toward
        <strong>${outgoing.directPartnerCount}</strong> other element type(s)
        and a direct row from <strong>${incoming.directPartnerCount}</strong> other element type(s).
      </p>
      <p class="el-matrix-lede">
        Below: partner layers for those direct rows, and how often each relationship code occurs on matrix entries (one row may list several codes).
      </p>
      ${buildNeighborExplorerHtml(name, outgoing, incoming, centerLayer)}
      <div class="el-matrix-grid">
        <div class="el-matrix-col">
          <div class="el-matrix-col-title">Outgoing — from <strong>${escapeHtml(name)}</strong></div>
          <p class="el-matrix-partner-line">${outIntro}.${derOut}</p>
          ${outLayers ? `<div class="el-layer-row"><span class="el-layer-label">Targets by layer (direct):</span> ${outLayers}</div>` : ""}
          <div class="el-code-block">
            <span class="el-code-label">Direct codes:</span>
            ${formatCodePills(outgoing.codesDirect, "—")}
          </div>
          <div class="el-code-block">
            <span class="el-code-label">Derived codes:</span>
            ${formatCodePills(outgoing.codesDerived, "—")}
          </div>
        </div>
        <div class="el-matrix-col">
          <div class="el-matrix-col-title">Incoming — to <strong>${escapeHtml(name)}</strong></div>
          <p class="el-matrix-partner-line">${inIntro}.${derIn}</p>
          ${inLayers ? `<div class="el-layer-row"><span class="el-layer-label">Sources by layer (direct):</span> ${inLayers}</div>` : ""}
          <div class="el-code-block">
            <span class="el-code-label">Direct codes:</span>
            ${formatCodePills(incoming.codesDirect, "—")}
          </div>
          <div class="el-code-block">
            <span class="el-code-label">Derived codes:</span>
            ${formatCodePills(incoming.codesDerived, "—")}
          </div>
        </div>
      </div>
      <p class="el-matrix-footnote">
        <strong>Association</strong> (O) is always permitted between any two elements (§5.2.4) but is not listed in Appendix B’s matrix. ArchiTrek encodes that as optional bridges: with <strong>Semantic rigor</strong> Academic (or Association off in Advanced Logic Overrides), the pathfinder does not use §5.2.4 Association as a bridge; <strong>Direct vs +Derived</strong> still controls whether Appendix B only or §5.7 derived edges are in the graph. Looser rigor or overrides allow Association as a last resort, flagged in results.
      </p>
    </section>`;
}

function fillElementInfoHero(name, meta) {
  const hero = document.getElementById("element-info-hero");
  if (!hero) return;
  if (!name || typeof window.getElementMiniSvg !== "function") {
    hero.hidden = true;
    hero.innerHTML = "";
    return;
  }
  const bg = meta?.color ? meta.color : "#e0e8f0";
  const svg = window.getElementMiniSvg(name, 84);
  hero.hidden = false;
  hero.innerHTML = `
    <div class="element-info-hero-inner" style="--el-hero-tint:${escapeHtml(bg)}">
      <div class="element-info-hero-svg" aria-hidden="true">${svg}</div>
      <div class="element-info-hero-label">
        <span class="element-info-hero-name">${escapeHtml(name)}</span>
      </div>
    </div>`;
}

function closeElementInfoModal() {
  const m = document.getElementById("element-info-modal");
  if (!m) return;
  m.setAttribute("aria-hidden", "true");
}

function openElementInfoModal() {
  const m = document.getElementById("element-info-modal");
  if (!m) return;
  closeMetamodelModal();
  m.setAttribute("aria-hidden", "false");
}

/**
 * Educational overlay: spec-aligned definition from data/elements.js (ELEMENT_DEFINITIONS).
 * Called from path diagram element clicks (ui/renderer.js).
 */
window.showElementDetails = function showElementDetails(elementName) {
  const name = String(elementName || "").trim();
  const titleEl = document.getElementById("element-info-title");
  const subEl = document.getElementById("element-info-sub");
  const bodyEl = document.getElementById("element-info-body");
  const actionsEl = document.getElementById("element-info-actions");
  if (!titleEl || !subEl || !bodyEl || !actionsEl) return;

  const def = typeof ELEMENT_DEFINITIONS !== "undefined" ? ELEMENT_DEFINITIONS[name] : null;
  const meta = typeof ELEMENTS !== "undefined" ? ELEMENTS[name] : null;

  titleEl.textContent = name || "Element";
  const subParts = [];
  if (meta) subParts.push(`${meta.layer} · ${meta.aspect}`);
  if (def?.section) subParts.push(def.section);
  subEl.textContent = subParts.join(" · ") || "ArchiMate 3.1";

  fillElementInfoHero(name, meta);

  let definitionBlock = "";
  if (!def && !meta) {
    definitionBlock = `<div class="el-def-block"><p class="el-def-missing">
      No embedded definition was found for <strong>${escapeHtml(name)}</strong>.
    </p></div>`;
  } else {
    const sectionLine = def?.section
      ? `<p class="el-def-section">Spec reference: <cite>${escapeHtml(def.section)}</cite></p>`
      : "";
    const defPara = def?.definition
      ? `<p class="el-def-text">${escapeHtml(def.definition)}</p>`
      : `<p class="el-def-text">This element is in the tool’s matrix; extend <code>data/elements.js</code> to add a definition.</p>`;
    definitionBlock = `
      <div class="el-def-block">
        ${sectionLine}
        ${defPara}
        <p class="el-def-note">Definitions follow the ArchiMate Specification element chapters (Ch. 4–13).</p>
      </div>`;
  }

  const matrixBlock = buildMatrixConnectivityHtml(name);
  bodyEl.innerHTML = `${definitionBlock}${matrixBlock}`;

  const specLink = `<a href="${ARCHIMATE_SPEC_BASE}" target="_blank" rel="noopener noreferrer"
    style="font-size:13px;color:var(--accent);font-weight:600">Open full specification (Open Group) ↗</a>`;

  const enc = encodeURIComponent(name);
  const inExplanation = document.querySelector(`#explanation-content [data-explain-element="${enc}"]`);
  if (inExplanation) {
    actionsEl.innerHTML = `
      <div class="element-info-actions-row">
        <button type="button" class="text-link-btn" id="element-info-scroll-btn">Show in path explanation</button>
        <span class="element-info-actions-sep" aria-hidden="true">·</span>
        ${specLink}
      </div>`;
    const btn = document.getElementById("element-info-scroll-btn");
    if (btn) {
      btn.onclick = (e) => {
        e.preventDefault();
        window.scrollToElementDefinitionInExplanation?.(name);
      };
    }
  } else {
    actionsEl.innerHTML = `
      <div style="padding-top:12px;border-top:1px solid var(--border-light)">
        ${specLink}
      </div>`;
  }

  openElementInfoModal();
};

// ── Diagram pan / zoom (path SVG) ───────────────────────────────────────────
const diagramView = { scale: 1, tx: 0, ty: 0, min: 0.25, max: 4, step: 1.2 };
/** When mode / badges / layout / story theme / or segment result ref changes, reset pan-zoom; not when only switching path tab. */
let _diagramPanCtx = { modeKey: null, segmentsRef: null };

function diagramPanShouldReset(segments) {
  // Keep the camera stable when toggling Compact ↔ Swimlanes.
  // Both are just alternative renderings of the same result set; resetting pan/zoom feels like the diagram
  // "disappears" even though only lane bands/layout changed.
  const panModeKey = (state.mode === "swimlane") ? "compact" : state.mode;
  const modeKey = `${panModeKey}|${state.pathFlow}|${state.showBadges}|${normalizeDomainContext(state.domainContext)}`;
  const segRef = segments;
  if (_diagramPanCtx.modeKey !== modeKey || _diagramPanCtx.segmentsRef !== segRef) {
    _diagramPanCtx = { modeKey, segmentsRef: segRef };
    return true;
  }
  return false;
}

function resetDiagramPanContext() {
  _diagramPanCtx = { modeKey: null, segmentsRef: null };
}

/** No-path UI sits above the pan/zoom surface (not inside #path-diagram) so the canvas is not draggable. */
function showDiagramNoPathOverlay(html) {
  const inner = document.getElementById("diagram-no-path-overlay-inner");
  const ov = document.getElementById("diagram-no-path-overlay");
  const area = document.getElementById("diagram-area");
  if (inner) inner.innerHTML = html || "";
  if (ov) {
    ov.hidden = false;
    ov.setAttribute("aria-hidden", "false");
  }
  if (area) area.classList.add("diagram-area--no-path-overlay");
}

function hideDiagramNoPathOverlay() {
  const inner = document.getElementById("diagram-no-path-overlay-inner");
  const ov = document.getElementById("diagram-no-path-overlay");
  const area = document.getElementById("diagram-area");
  if (inner) inner.innerHTML = "";
  if (ov) {
    ov.hidden = true;
    ov.setAttribute("aria-hidden", "true");
  }
  if (area) area.classList.remove("diagram-area--no-path-overlay");
}

/** First segment with no UCS result (ordered mode: first directed leg that fails). */
function getFirstFailingSegment(segments) {
  if (!Array.isArray(segments)) return null;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (s && (!s.paths || s.paths.length === 0)) {
      return { from: s.from, to: s.to, index: i };
    }
  }
  return null;
}

function hidePathFailureModal() {
  const modal = document.getElementById("path-fail-modal");
  if (!modal) return;
  modal.style.display = "none";
  modal.setAttribute("aria-hidden", "true");
}

window.hidePathFailureModal = hidePathFailureModal;

function showPathFailureModal(opts) {
  const modal = document.getElementById("path-fail-modal");
  const body = document.getElementById("path-fail-modal-body");
  const titleEl = document.getElementById("path-fail-modal-title");
  if (!modal || !body || !titleEl) return;

  const {
    narrFrom,
    narrTo,
    fail,
    chainStr,
    segmentCount = 0,
    selectionMode,
    pathHints,
    includeDerived,
    allowAssociationFallback,
  } = opts;

  modal.dataset.narrFrom = narrFrom || "";
  modal.dataset.narrTo = narrTo || "";

  const isOrdered = selectionMode === "ordered";
  const vpF = getStrictViewpointFailureContext(narrFrom, narrTo);
  titleEl.textContent =
    vpF.strict && !vpF.fromInGraph && !vpF.toInGraph
      ? "No path in this viewpoint"
      : isOrdered
        ? "No path for your waypoint order"
        : "No path found";

  const nf = escapeHtml(narrFrom || "—");
  const nt = escapeHtml(narrTo || "—");
  const chainEsc = chainStr ? escapeHtml(chainStr) : "";

  let lead = "";
  if (vpF.strict) {
    const vpn = escapeHtml(vpF.name);
    let vpExpl = "";
    if (!vpF.fromInGraph && !vpF.toInGraph) {
      vpExpl = `With viewpoint <strong>${vpn}</strong>, neither endpoint is in this viewpoint’s element palette, so they are not part of the pathfinding graph while this filter is on.`;
    } else if (!vpF.fromInGraph) {
      vpExpl = `With viewpoint <strong>${vpn}</strong>, <strong>${nf}</strong> is not in this viewpoint’s element palette.`;
    } else if (!vpF.toInGraph) {
      vpExpl = `With viewpoint <strong>${vpn}</strong>, <strong>${nt}</strong> is not in this viewpoint’s element palette.`;
    } else {
      vpExpl = `Viewpoint <strong>${vpn}</strong> limits which element types and matrix relationships the search may use. There is no route within that scope for this query — either no permitted chain exists between these points under your options, or a chain would need element types or links this viewpoint does not include.`;
    }
    if (isOrdered && chainEsc) {
      if (fail && typeof fail.index === "number") {
        lead = `<p class="path-fail-modal-lead">${vpExpl} You asked for the directed chain <strong>${chainEsc}</strong>; the first failing hop is <strong>${nf} → ${nt}</strong> (segment ${fail.index + 1} of ${segmentCount || "?"}).</p>`;
      } else {
        lead = `<p class="path-fail-modal-lead">${vpExpl} You asked for <strong>${chainEsc}</strong>. Try widening the viewpoint, raising max hops, or using a one-off relaxed search below.</p>`;
      }
    } else {
      lead = `<p class="path-fail-modal-lead">${vpExpl} No valid path was found for <strong>${nf}</strong> → <strong>${nt}</strong> with the current connect-set search.</p>`;
    }
  } else if (isOrdered && chainEsc) {
    if (fail && typeof fail.index === "number") {
      lead = `<p class="path-fail-modal-lead">You asked for the directed chain <strong>${chainEsc}</strong>. There is no valid route under your current settings for the hop <strong>${nf} → ${nt}</strong> (segment ${fail.index + 1} of ${segmentCount || "?"}) — the Appendix B graph may have no forward path between these elements within the hop limit and search effort, or filters such as <strong>Viewpoint</strong> / <strong>Direct only</strong> removed the needed edges.</p>`;
    } else {
      lead = `<p class="path-fail-modal-lead">You asked for <strong>${chainEsc}</strong>. The pathfinder could not build a complete chain under your current limits and options. Try a different order, raise max hops, widen the viewpoint, or relax Direct / Association settings.</p>`;
    }
  } else {
    lead = `<p class="path-fail-modal-lead">No valid architectural path was found for <strong>${nf}</strong> → <strong>${nt}</strong> with the current connect-set search.</p>`;
  }

  const ruleKey = typeof getAspectRuleKey === "function" ? getAspectRuleKey(narrFrom, narrTo) : "";
  const aspectRule = ruleKey && typeof ASPECT_RULES !== "undefined" ? ASPECT_RULES[ruleKey] : null;
  const layerRuleKey = typeof getLayerRuleKey === "function" ? getLayerRuleKey(narrFrom, narrTo) : "";
  const layerRule = layerRuleKey && typeof LAYER_RULES !== "undefined" ? LAYER_RULES[layerRuleKey] : null;
  const aspectOk = !aspectRule || aspectRule.valid !== false;
  const layerOk = !layerRule || layerRule.valid !== false;
  const mmOk = aspectOk && layerOk;

  let whyDetails = "<ul>";
  whyDetails +=
    `<li>The search follows <strong>directed</strong> edges (Appendix B tail → head; §5.7 derived only if enabled). If no edge sequence exists from <strong>${nf}</strong> to <strong>${nt}</strong> within the max hops per segment, the segment is empty.</li>`;
  if (!mmOk) {
    if (!aspectOk && aspectRule?.reason) {
      whyDetails += `<li><strong>§4.2 aspect rule:</strong> ${escapeHtml(aspectRule.reason)}</li>`;
    }
    if (!layerOk && layerRule?.reason) {
      whyDetails += `<li><strong>Layer pattern:</strong> ${escapeHtml(layerRule.reason)}</li>`;
    }
  } else {
    whyDetails += vpF.strict
      ? "<li>For this pair, the core metamodel aspect/layer check is not an automatic “forbidden” hit; remaining blockers include matrix reachability, hop depth, or Direct-only mode (viewpoint limits are explained in the next bullet).</li>"
      : "<li>For this pair, the core metamodel aspect/layer check is not an automatic “forbidden” hit; the usual blockers are matrix reachability, hop depth, viewpoint palette, or Direct-only mode.</li>";
  }
  if (vpF.strict) {
    whyDetails += `<li><strong>Viewpoint (${escapeHtml(vpF.name)}):</strong> The routed graph only includes elements in this viewpoint’s palette and matrix entries between allowed types. A “no path” here means no such chain under those limits — not necessarily that every ArchiMate link is forbidden in the full metamodel.</li>`;
  }
  if (pathHints?.derivedWouldHelp) {
    whyDetails +=
      "<li>Automatic check: enabling <strong>+ Derived</strong> (§5.7) would add traversable edges for this query.</li>";
  }
  if (pathHints?.associationWouldHelp) {
    whyDetails +=
      "<li>Automatic check: allowing <strong>Association</strong> fallback (§5.2.4) would connect under the same limits.</li>";
  }
  if (includeDerived && allowAssociationFallback && !pathHints?.derivedWouldHelp && !pathHints?.associationWouldHelp) {
    whyDetails +=
      "<li>With +Derived and Association already on, try raising <strong>max hops per segment</strong> or <strong>search effort</strong>, or switch to <strong>All elements</strong>.</li>";
  }
  whyDetails += "</ul>";

  const derivedDisabled = includeDerived ? " disabled" : "";
  const assocDisabled = allowAssociationFallback ? " disabled" : "";
  const relaxBlock = `
    <div class="path-fail-relax-wrap" role="group" aria-label="Expand search one time">
      <p class="path-fail-relax-intro">Same actions as the diagram overlay: run <strong>one</strong> search with relaxed rules. Your saved <strong>Options</strong> are not changed permanently.</p>
      <div class="path-fail-relax-buttons">
        <button type="button" class="path-dead-end__btn path-dead-end__btn--choice"${derivedDisabled} onclick="if(!this.disabled){window.hidePathFailureModal();window.tryRelaxPathDerived();}">🔍 Search with Derived Relations</button>
        ${includeDerived ? '<span class="path-dead-end__pill" aria-hidden="true">On</span>' : ""}
        <button type="button" class="path-dead-end__btn path-dead-end__btn--choice"${assocDisabled} onclick="if(!this.disabled){window.hidePathFailureModal();window.tryRelaxPathAssociation();}">🤝 Search with Informal Associations</button>
        ${allowAssociationFallback ? '<span class="path-dead-end__pill" aria-hidden="true">On</span>' : ""}
      </div>
    </div>`;

  body.innerHTML =
    lead +
    `<details class="path-fail-details"><summary>Why this search failed</summary><div class="path-fail-details-body">${whyDetails}</div></details>` +
    relaxBlock;

  modal.style.display = "flex";
  modal.setAttribute("aria-hidden", "false");
}

function initPathFailureModal() {
  const modal = document.getElementById("path-fail-modal");
  if (!modal) return;
  const close = () => hidePathFailureModal();
  modal.querySelectorAll("[data-path-fail-close]").forEach((el) => {
    el.addEventListener("click", close);
  });
  document.getElementById("path-fail-open-mm")?.addEventListener("click", () => {
    const from = modal.dataset.narrFrom;
    const to = modal.dataset.narrTo;
    hidePathFailureModal();
    if (from && to && typeof window.focusMetamodel === "function") {
      window.focusMetamodel(from, to);
    }
  });
  document.getElementById("path-fail-scroll-explain")?.addEventListener("click", () => {
    hidePathFailureModal();
    document.getElementById("explanation-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (modal.style.display !== "flex") return;
    close();
  });
}

function applyDiagramTransform() {
  const surf = document.getElementById("diagram-pan-surface");
  if (!surf) return;
  surf.style.transform = `translate(${diagramView.tx}px, ${diagramView.ty}px) scale(${diagramView.scale})`;
}

function resetDiagramView() {
  diagramView.scale = 1;
  diagramView.tx = 0;
  diagramView.ty = 0;
  applyDiagramTransform();
}

function diagramZoomAtPoint(clientX, clientY, factor) {
  const nov = document.getElementById("diagram-no-path-overlay");
  if (nov && !nov.hidden) return;
  const vp = document.getElementById("diagram-pan-viewport");
  if (!vp) return;
  const rect = vp.getBoundingClientRect();
  const vx = clientX - rect.left;
  const vy = clientY - rect.top;
  const s0 = diagramView.scale;
  let s1 = s0 * factor;
  s1 = Math.max(diagramView.min, Math.min(diagramView.max, s1));
  if (Math.abs(s1 - s0) < 1e-9) return;
  const r = s1 / s0;
  diagramView.tx = vx - (vx - diagramView.tx) * r;
  diagramView.ty = vy - (vy - diagramView.ty) * r;
  diagramView.scale = s1;
  applyDiagramTransform();
}

window.diagramZoomStep = function diagramZoomStep(dir) {
  const vp = document.getElementById("diagram-pan-viewport");
  if (!vp) return;
  const r = vp.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const factor = dir > 0 ? diagramView.step : 1 / diagramView.step;
  diagramZoomAtPoint(cx, cy, factor);
};

window.diagramZoomReset = function diagramZoomReset() {
  resetDiagramView();
};

function initDiagramPanZoom() {
  const vp = document.getElementById("diagram-pan-viewport");
  const pathDiagram = document.getElementById("path-diagram");
  if (!vp || !pathDiagram) return;

  let activeId = null;
  let start = null;
  let dragged = false;
  const thresh = 6;

  function cleanupDocListeners() {
    document.removeEventListener("pointermove", onDocMove);
    document.removeEventListener("pointerup", onDocEnd, true);
    document.removeEventListener("pointercancel", onDocEnd, true);
  }

  function onDocMove(e) {
    if (e.pointerId !== activeId || !start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!dragged && dx * dx + dy * dy > thresh * thresh) {
      dragged = true;
      vp.classList.add("diagram-pan--dragging");
    }
    if (dragged) {
      diagramView.tx = start.tx + dx;
      diagramView.ty = start.ty + dy;
      applyDiagramTransform();
    }
  }

  function onDocEnd(e) {
    if (e.pointerId !== activeId) return;
    cleanupDocListeners();
    if (dragged) {
      const suppress = (ev) => {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        pathDiagram.removeEventListener("click", suppress, true);
      };
      pathDiagram.addEventListener("click", suppress, true);
    }
    activeId = null;
    start = null;
    dragged = false;
    vp.classList.remove("diagram-pan--dragging");
  }

  vp.addEventListener("pointerdown", (e) => {
    const ov = document.getElementById("diagram-no-path-overlay");
    if (ov && !ov.hidden) return;
    if (e.button !== 0) return;
    activeId = e.pointerId;
    start = { x: e.clientX, y: e.clientY, tx: diagramView.tx, ty: diagramView.ty };
    dragged = false;
    document.addEventListener("pointermove", onDocMove, { passive: true });
    document.addEventListener("pointerup", onDocEnd, true);
    document.addEventListener("pointercancel", onDocEnd, true);
  });

  vp.addEventListener(
    "wheel",
    (e) => {
      const ov = document.getElementById("diagram-no-path-overlay");
      if (ov && !ov.hidden) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
      diagramZoomAtPoint(e.clientX, e.clientY, factor);
    },
    { passive: false }
  );
}

/** Opens the “Element definitions” details block and scrolls to the matching card. */
window.scrollToElementDefinitionInExplanation = function scrollToElementDefinitionInExplanation(elementName) {
  const name = String(elementName || "").trim();
  const enc = encodeURIComponent(name);
  const panel = document.getElementById("explanation-panel");
  const details = document.querySelector("#explanation-content .explain-element-defs");
  const card = document.querySelector(`#explanation-content [data-explain-element="${enc}"]`);
  if (details) details.open = true;
  if (panel) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  if (card) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  closeElementInfoModal();
};

function init() {
  // Single metamodel instance lives in the explanation panel.
  const mm = document.getElementById('metamodel-diagram');
  if (mm) renderMetamodelDiagram(mm);
  rebuildGraph();
  updateDiagramEmptyChrome();

  // Self-test: verify pathfinder works in this browser context
  try {
    const _fp = findPaths(state.graph, ["Business Interface", "Business Service"], {
      ...getSearchPathOptions(),
      maxPaths: 1,
    });
    const _t = _fp?.segments;
    const _ok = _t?.length === 1 && _t[0]?.paths?.length > 0;
    const _vdOpts = {
      maxDepth: 12,
      maxPaths: 3,
      maxStates: 25000,
      includeDerived: true,
      allowAssociationFallback: false,
      pathWeightDirect: 1,
      pathWeightDerived: 5,
      pathWeightAssociation: 100,
      pathWeightLayerSkip: 15,
    };
    const _vdStrict = findPaths(state.graph, ["Value", "Data Object"], _vdOpts);
    const _vdNoStrict = !segmentsSearchSucceeded(_vdStrict.segments);
    const _vdFb = findPaths(state.graph, ["Value", "Data Object"], {
      ..._vdOpts,
      allowAssociationFallback: true,
    });
    const _vdAssocOk = segmentsSearchSucceeded(_vdFb.segments);
    const _vdOk = _vdNoStrict && _vdAssocOk;
    console.log(
      "[NAV] Graph nodes:",
      state.graph?.size,
      "| Pathfinder self-test:",
      _ok ? "PASS ✓" : "FAIL ✗",
      "| Value→DataObject strict empty / Assoc ok:",
      _vdOk ? "PASS ✓" : "FAIL ✗"
    );
    if (!_vdOk) {
      console.error(
        "[NAV] Directionality check: strict Value→Data Object must be unreachable; Association fallback must connect.",
        { _vdNoStrict, _vdAssocOk }
      );
    }
    if (!_ok) console.error("[NAV] Pathfinder failed. MATRIX entries:", MATRIX?.length, "| BI edges:", state.graph?.get("Business Interface")?.length);
    // Show visible warning if self-test fails
    if (!_ok || !_vdOk) {
      const warn = document.createElement('div');
      warn.style.cssText = 'background:#fff3cd;border:1px solid #ffc107;padding:8px 12px;font-size:12px;border-radius:4px;';
      warn.textContent =
        '⚠ Pathfinder self-test failed. Check console. Graph: ' +
        (state.graph?.size || 0) +
        ' nodes, MATRIX: ' +
        (MATRIX?.length || 0) +
        ' entries.' +
        (!_vdOk ? ' (Directionality: Value→Data Object)' : '');
      document.getElementById('waypoint-chain').before(warn);
    }
  } catch(e) { console.error("[NAV] Self-test error:", e); }

  const baseLabel = state.selectionMode === "set" ? "Point" : "Start";
  const endLabel = state.selectionMode === "set" ? "Point" : "End";
  addWaypointSlot(0, baseLabel);
  addWaypointSlot(1, endLabel);
  renderWaypointChain();
  setSelectionMode(state.selectionMode);
  state.domainContext = normalizeDomainContext(state.domainContext);
  repopulateDomainContextSelectorsFromScenarios();
  syncDomainContextSelectors();

  initLayoutChrome();
  initPathOptionsOverlay();
  initPathChromeCollapsible();
  initResultsSplit();
  initDiagramPanZoom();
  initPathFailureModal();
  initPathLabelsHelp();

  updateQuickExamplesVisibility();

  applySearchOptionsToUI();
  document.getElementById("btn-direct")?.classList.toggle("active", !state.includeDerived);
  document.getElementById("btn-derived")?.classList.toggle("active", state.includeDerived);
  updatePathOptionsTriggerSummary();

  // Hide initial loading indicator after first paint.
  setLoading(false);
}

function setLoading(on, label = "") {
  state.loading = !!on;
  const bar = document.getElementById('loading-bar');
  if (bar) bar.style.display = on ? 'block' : 'none';

  const btn = document.getElementById('find-path-btn');
  const clearBtn = document.getElementById('clear-all-btn');
  if (btn) {
    if (on) {
      btn.dataset.prevText = btn.textContent;
      btn.textContent = label || "Working…";
      btn.disabled = true;
    } else {
      if (btn.dataset.prevText) btn.textContent = btn.dataset.prevText;
      checkReady();
    }
  }
  if (clearBtn) clearBtn.disabled = !!on;
}

// ── Graph ───────────────────────────────────────────────────────────────────

function rebuildGraph() {
  state.graph = buildGraph({
    allowedElements: effectiveAllowedElements(),
    includeDerived:  state.includeDerived,
  });
}

// ── Viewpoint ───────────────────────────────────────────────────────────────

window.onViewpointChange = function() {
  const key = document.getElementById('viewpoint-select').value;
  state.viewpoint = key || null;
  state._perspectiveSuggestFullMetamodel = false;

  if (key && VIEWPOINTS[key] && !VIEWPOINTS[key].allElements) {
    state.allowedElements = new Set(VIEWPOINTS[key].elements);
  } else {
    state.allowedElements = null;
  }

  // If the viewpoint makes the current selections invalid, clear them.
  // (This also makes the layer selector reflect only layers that still have any allowed elements.)
  const layersWithAllowed = getLayersWithAllowedElements(state.allowedElements);
  for (const wp of state.waypoints) {
    if (!wp) continue;
    if (wp.element && state.allowedElements && !state.allowedElements.has(wp.element)) {
      wp.element = null;
    }
    if (wp.layer && state.allowedElements && !layersWithAllowed.has(wp.layer)) {
      wp.layer = null;
      wp.element = null;
    }
  }

  rebuildGraph();
  // Rerender all waypoint element pickers to reflect dimmed elements
  renderWaypointChain();
  updatePathOptionsTriggerSummary();
  schedulePersistSession();
};

function getLayersWithAllowedElements(allowedElements) {
  // No viewpoint filter -> all layers are available
  if (!allowedElements) return new Set(LAYERS.map(l => l.id));
  const s = new Set();
  for (const name of allowedElements) {
    const layerId = ELEMENTS?.[name]?.layer;
    if (layerId) s.add(layerId);
  }
  return s;
}

// ── Waypoint management ─────────────────────────────────────────────────────

// ── Waypoint management ─────────────────────────────────────────────────────

function addWaypointSlot(index, label) {
  state.waypoints[index] = state.waypoints[index] ?? { layer: null, element: null, label };
}

function ensureEditingControlsVisible() {
  try {
    const prefs = readLayoutPrefs();
    if (prefs?.collapsed) persistLayoutPrefs({ collapsed: false });
  } catch (_) {
    // Layout prefs are best-effort only.
  }
}

function withVisibleEditingControls(actionFn) {
  ensureEditingControlsVisible();
  requestAnimationFrame(() => {
    try {
      actionFn?.();
    } catch (_) {
      // ignore UI animation wrapper failures
    }
  });
}

function animateWaypointCardOut(index, onDone) {
  const chain = document.getElementById("waypoint-chain");
  const card = chain?.querySelector(`.waypoint-card[data-waypoint-index="${index}"]`);
  if (!card) {
    onDone?.();
    return;
  }
  card.classList.add("waypoint-card--leave");
  setTimeout(() => onDone?.(), 190);
}

function animateWaypointCardIn(index) {
  const chain = document.getElementById("waypoint-chain");
  const card = chain?.querySelector(`.waypoint-card[data-waypoint-index="${index}"]`);
  if (!card) return;
  card.classList.add("waypoint-card--enter");
  setTimeout(() => card.classList.remove("waypoint-card--enter"), 240);
}



window.addWaypoint = function() {
  let insertAt = 0;
  if (state.selectionMode === 'set') {
    // Connect Set mode: just add to the end of the list
    insertAt = state.waypoints.length;
    state.waypoints.push({ layer: null, element: null, label: 'Point' });
  } else {
    // Ordered mode: insert before the "End" point
    insertAt = Math.max(1, state.waypoints.length - 1);
    state.waypoints.splice(insertAt, 0, { layer: null, element: null, label: 'Via' });
  }
  renderWaypointChain();
  animateWaypointCardIn(insertAt);
  return insertAt;
};

window.clearAllElements = function() {
  // Clear data
  state.waypoints = [];
  const baseLabel = state.selectionMode === "set" ? "Point" : "Start";
  const endLabel = state.selectionMode === "set" ? "Point" : "End";
  addWaypointSlot(0, baseLabel);
  addWaypointSlot(1, endLabel);
  state.segments = null;
  state.pathFailureHints = null;
  state.lastPathIsFallback = false;
  state.lastPathTemporaryRelaxation = null;
  state._relaxOneShotRestore = null;
  renderWaypointChain();
  
  // Clear the UI visually
  const diagramEl = document.getElementById('path-diagram');
  const emptyEl = document.getElementById('diagram-empty');
  const tabsEl = document.getElementById('path-tabs');
  const explainEl = document.getElementById('explanation-content');
  const toolsEl = document.getElementById('diagram-tools');
  
  if (diagramEl) diagramEl.innerHTML = "";
  hideDiagramNoPathOverlay();
  resetDiagramPanContext();
  resetDiagramView();
  if (emptyEl) emptyEl.style.display = 'flex';
  updateDiagramEmptyChrome();
  if (tabsEl) tabsEl.style.display = 'none';
  const pathTabsHelp = document.getElementById("path-tabs-help");
  if (pathTabsHelp) pathTabsHelp.hidden = true;
  if (explainEl) explainEl.innerHTML = 'Path explanation will appear here after finding a path.';
  setExplanationRouteColumn("");
  if (toolsEl) toolsEl.hidden = true;
  state.mmLast = null;
  updateMmConnectionStrip(null);

  checkReady();
  updateQuickExamplesVisibility();
  schedulePersistSession();
};

function removeWaypoint(index, { animate = true, suppressSearch = false, after = null } = {}) {
  // Always keep at least 2 points.
  if (state.waypoints.length <= 2) return;
  const commit = () => {
    state.waypoints.splice(index, 1);
    renderWaypointChain();
    checkReady();
    if (!suppressSearch && state.segments) window.dispatch({ type: "FIND_PATH", reason: "remove-waypoint" });
    if (typeof after === "function") after();
  };
  if (!animate) {
    commit();
    return;
  }
  animateWaypointCardOut(index, commit);
}

function moveWaypoint(index, dir) {
  const j = index + dir;
  if (j < 0 || j >= state.waypoints.length) return;
  // Only allow moving within the list; keep semantics (start/end) by swapping slots
  const tmp = state.waypoints[index];
  state.waypoints[index] = state.waypoints[j];
  state.waypoints[j] = tmp;
  renderWaypointChain();
  if (state.segments) window.dispatch({ type: "FIND_PATH", reason: "move-waypoint" });
}

function moveWaypointTo(fromIndex, toIndex) {
  if (fromIndex === toIndex) return;
  if (fromIndex < 0 || fromIndex >= state.waypoints.length) return;
  if (toIndex < 0 || toIndex >= state.waypoints.length) return;
  const [item] = state.waypoints.splice(fromIndex, 1);
  state.waypoints.splice(toIndex, 0, item);
  renderWaypointChain();
  if (state.segments) window.dispatch({ type: "FIND_PATH", reason: "move-waypoint-to" });
}

window.swapStartEnd = function() {
  if (state.waypoints.length !== 2) return;
  moveWaypoint(0, +1);
};

/** Position the visual element picker so it stays inside the viewport (anchor = trigger button). */
function fitPickerPopoverInViewport(anchorEl, popEl) {
  if (!anchorEl || !popEl) return;
  const padding = 12;
  const gap = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const availableH = Math.max(160, vh - 2 * padding);
  popEl.style.position = "fixed";
  popEl.style.zIndex = "600";
  popEl.style.maxHeight = `${Math.min(560, availableH)}px`;

  const r = anchorEl.getBoundingClientRect();
  let left = r.left;
  let top = r.bottom + gap;

  popEl.style.left = `${left}px`;
  popEl.style.top = `${top}px`;

  let pr = popEl.getBoundingClientRect();

  if (left + pr.width > vw - padding) {
    left = Math.max(padding, vw - padding - pr.width);
  }
  if (left < padding) left = padding;
  popEl.style.left = `${left}px`;
  pr = popEl.getBoundingClientRect();

  const fitsBelow = top + pr.height <= vh - padding;
  if (!fitsBelow) {
    const aboveTop = r.top - gap - pr.height;
    if (aboveTop >= padding) {
      top = aboveTop;
    } else {
      top = Math.max(padding, vh - padding - pr.height);
    }
  }
  popEl.style.top = `${top}px`;
  pr = popEl.getBoundingClientRect();

  if (pr.bottom > vh - padding) {
    top = Math.max(padding, vh - padding - pr.height);
    popEl.style.top = `${top}px`;
    pr = popEl.getBoundingClientRect();
  }
  if (pr.top < padding) {
    top = padding;
    popEl.style.top = `${top}px`;
  }
}

let pickerOverlayEscHandler = null;
let pickerViewportCleanup = null;

/** Close the element picker overlay and detach global listeners (resize/scroll/Escape). */
function teardownPickerOverlay() {
  if (pickerViewportCleanup) {
    pickerViewportCleanup();
    pickerViewportCleanup = null;
  }
  if (pickerOverlayEscHandler) {
    document.removeEventListener("keydown", pickerOverlayEscHandler);
    pickerOverlayEscHandler = null;
  }
  const root = document.getElementById("picker-overlay");
  if (root?.classList.contains("open")) {
    root.classList.remove("open");
    root.innerHTML = "";
    root.setAttribute("aria-hidden", "true");
    root.onclick = null;
  }
}

function renderWaypointChain() {
  teardownPickerOverlay();
  const chain = document.getElementById('waypoint-chain');
  chain.innerHTML = '';
  let dragFromIndex = null;
  const overlayRoot = document.getElementById('picker-overlay');
  const effAllowed = effectiveAllowedElements();
  const layersWithAllowed = getLayersWithAllowedElements(effAllowed);
  const isTopLayout = isLayoutTop();
  const tileSvgW = isTopLayout ? 168 : 240;
  const tileSvgH = isTopLayout ? 52 : 72;
  const tileMini = isTopLayout ? 40 : 56;

  /** Shorter labels in the waypoint layer select (tint already hints layer); full name in option title. */
  const waypointLayerSelectText = (layer) => {
    const id = layer.id;
    if (id === "Motivation") return "Motiv.";
    if (id === "Application") return "App.";
    if (id === "Technology") return "Tech.";
    if (id === "Implementation") return "Impl.";
    return id;
  };

  const LAYER_COLORS = {
    'Motivation': '#dcdcff', 'Strategy': '#e8d4b8', 'Business': '#f5e87a',
    'Application': '#a8d4a8', 'Technology': '#a0c4e8', 'Physical': '#d4c8a0',
    'Composite': '#e0e0e0', 'Implementation': '#e8b8b8',
  };

  const closeOverlay = () => {
    teardownPickerOverlay();
  };

  const onEsc = (e) => {
    if (e.key === 'Escape') closeOverlay();
  };

  const openElementOverlay = (anchorEl, waypointIdx, layerId) => {
    if (!overlayRoot) return;
    closePathOptionsOverlay();
    teardownPickerOverlay();
    overlayRoot.classList.add('open');
    overlayRoot.setAttribute('aria-hidden', 'false');
    overlayRoot.innerHTML = '';
    overlayRoot.onclick = (e) => {
      if (e.target === overlayRoot) closeOverlay();
    };
    pickerOverlayEscHandler = onEsc;
    document.addEventListener('keydown', onEsc);

    const pop = document.createElement('div');
    pop.className = 'picker-popover';

    const scheduleFit = () => {
      requestAnimationFrame(() => {
        fitPickerPopoverInViewport(anchorEl, pop);
        requestAnimationFrame(() => fitPickerPopoverInViewport(anchorEl, pop));
      });
    };

    const header = document.createElement('div');
    header.className = 'picker-popover-header';
    const titleText = layerId
      ? `Pick an element (${layerId})`
      : 'Pick an element';
    header.innerHTML = `<div class="picker-title">${titleText}</div>`;
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'picker-close';
    closeBtn.textContent = 'Close';
    closeBtn.onclick = closeOverlay;
    header.appendChild(closeBtn);

    const onViewportChange = () => fitPickerPopoverInViewport(anchorEl, pop);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    pickerViewportCleanup = () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };

    const body = document.createElement('div');
    body.className = 'picker-popover-body';

    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'visual-picker-search';
    search.placeholder = 'Search all layers…';
    body.appendChild(search);

    const grid = document.createElement('div');
    grid.className = 'element-grid popover-grid';
    body.appendChild(grid);

    const filterLayerId = canonicalLayerIdForWaypoint(layerId);
    const elementsForLayer = filterLayerId
      ? Object.entries(ELEMENTS)
          .filter(([, meta]) => meta.layer === filterLayerId)
          .map(([name]) => name)
          .sort()
      : [];

    const ASPECT_ORDER = [
      'Active Structure',
      'Behavior',
      'Passive Structure',
      'Composite',
      'Motivation',
    ];

    const layerList = typeof LAYERS !== "undefined" && Array.isArray(LAYERS) ? LAYERS : [];
    const layerRank = new Map(layerList.map((l, i) => [l.id, i]));

    /** When a layer is not chosen but a strict viewpoint is active, show the full viewpoint palette (sorted). */
    const viewpointBrowseSorted =
      !filterLayerId && effAllowed && effAllowed.size
        ? [...effAllowed].sort((a, b) => {
            const la = ELEMENTS[a]?.layer;
            const lb = ELEMENTS[b]?.layer;
            const dr = (layerRank.get(la) ?? 999) - (layerRank.get(lb) ?? 999);
            if (dr) return dr;
            const ia = ASPECT_ORDER.indexOf(ELEMENTS[a]?.aspect);
            const ib = ASPECT_ORDER.indexOf(ELEMENTS[b]?.aspect);
            const ar = (ia >= 0 ? ia : 999) - (ib >= 0 ? ib : 999);
            if (ar) return ar;
            return a.localeCompare(b);
          })
        : null;

    const renderGrid = () => {
      const raw = String(search.value || "").replace(/\u200b/g, "").trim();
      const q = raw.toLowerCase();
      grid.innerHTML = '';

      const addCard = (name) => {
        const allowed = !effAllowed || effAllowed.has(name);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'element-card' +
          (state.waypoints[waypointIdx]?.element === name ? ' selected' : '') +
          (!allowed ? ' disabled' : '');
        btn.disabled = !allowed;

        // The tile itself is the ArchiMate element shape with label inside.
        btn.innerHTML = (window.getElementPickerTileSvg
          ? window.getElementPickerTileSvg(name, 240, 72)
          : (window.getElementMiniSvg ? window.getElementMiniSvg(name, 56) : '')
        );

        btn.onclick = () => {
          selectElement(waypointIdx, name);
          closeOverlay();
        };
        grid.appendChild(btn);
      };

      let renderedAny = false;

      if (q) {
        const pool = Object.keys(ELEMENTS)
          .filter((name) => name.toLowerCase().includes(q))
          .sort((a, b) => {
            const la = ELEMENTS[a]?.layer;
            const lb = ELEMENTS[b]?.layer;
            const dr = (layerRank.get(la) ?? 999) - (layerRank.get(lb) ?? 999);
            if (dr) return dr;
            const ia = ASPECT_ORDER.indexOf(ELEMENTS[a]?.aspect);
            const ib = ASPECT_ORDER.indexOf(ELEMENTS[b]?.aspect);
            const ar = (ia >= 0 ? ia : 999) - (ib >= 0 ? ib : 999);
            if (ar) return ar;
            return a.localeCompare(b);
          });

        let prevLayer = null;
        let prevAspect = null;
        for (const name of pool) {
          const layer = ELEMENTS[name]?.layer || 'Other';
          const aspect = ELEMENTS[name]?.aspect || 'Other';
          if (layer !== prevLayer || aspect !== prevAspect) {
            const title = document.createElement('div');
            title.className = 'element-group-title';
            title.textContent = `${layer} — ${aspect}`;
            grid.appendChild(title);
            prevLayer = layer;
            prevAspect = aspect;
          }
          addCard(name);
          renderedAny = true;
        }
      } else if (viewpointBrowseSorted && viewpointBrowseSorted.length) {
        let prevLayer = null;
        let prevAspect = null;
        for (const name of viewpointBrowseSorted) {
          const layer = ELEMENTS[name]?.layer || 'Other';
          const aspect = ELEMENTS[name]?.aspect || 'Other';
          if (layer !== prevLayer || aspect !== prevAspect) {
            const title = document.createElement('div');
            title.className = 'element-group-title';
            title.textContent = `${layer} — ${aspect}`;
            grid.appendChild(title);
            prevLayer = layer;
            prevAspect = aspect;
          }
          addCard(name);
          renderedAny = true;
        }
      } else {
        const groups = new Map();
        for (const a of ASPECT_ORDER) groups.set(a, []);
        groups.set('Other', []);

        for (const name of elementsForLayer) {
          const aspect = ELEMENTS?.[name]?.aspect || 'Other';
          (groups.get(aspect) || groups.get('Other')).push(name);
        }

        for (const [aspect, names] of groups.entries()) {
          if (!names.length) continue;
          renderedAny = true;

          const title = document.createElement('div');
          title.className = 'element-group-title';
          title.textContent = aspect;
          grid.appendChild(title);

          for (const name of names) addCard(name);
        }
      }

      if (!renderedAny) {
        const empty = document.createElement('div');
        empty.className = 'element-grid-empty';
        let hint;
        if (q) {
          hint = 'No matching elements.';
        } else if (!filterLayerId && !(effAllowed && effAllowed.size)) {
          hint =
            'Type above to search all layers, or choose a layer on the waypoint to browse by category.';
        } else {
          hint = 'No elements available.';
        }
        empty.textContent = hint;
        grid.appendChild(empty);
      }
    };

    search.addEventListener("input", () => {
      renderGrid();
      scheduleFit();
    });
    pop.appendChild(header);
    pop.appendChild(body);
    overlayRoot.appendChild(pop);

    renderGrid();
    scheduleFit();
    setTimeout(() => search.focus(), 0);
  };

  state.waypoints.forEach((wp, i) => {
    const isFirst = i === 0;
    const isLast  = i === state.waypoints.length - 1;
    const isSetMode = state.selectionMode === 'set';
    const letter = isSetMode ? String(i + 1) : (isFirst ? 'A' : isLast ? String.fromCharCode(65 + state.waypoints.length - 1) : String.fromCharCode(65 + i));
    // Connect-set: numbered badge is enough ("1", "2", …). Ordered path: keep Start / End / Via.
    const roleLabel = isSetMode ? '' : (isFirst ? 'Start' : isLast ? 'End' : `Via ${i}`);

    // Connector between waypoints (vertical in sidebar, horizontal in top bar)
    if (i > 0) {
      const conn = document.createElement("div");
      conn.className = "waypoint-chain-connector";
      conn.setAttribute("aria-hidden", "true");
      chain.appendChild(conn);
    }

    // Waypoint card
    const card = document.createElement('div');
    card.className = 'waypoint-card' + (isTopLayout ? ' waypoint-card--compact' : '');
    card.style.cssText = 'border:1px solid var(--border);border-radius:6px;overflow:hidden;background:var(--surface)';
    card.setAttribute('draggable', 'true');
    card.dataset.waypointIndex = String(i);
    card.addEventListener('dragstart', (e) => {
      dragFromIndex = i;
      card.classList.add('dragging');
      try {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(i));
      } catch (_) {}
    });
    card.addEventListener('dragend', () => {
      dragFromIndex = null;
      card.classList.remove('dragging');
      [...chain.querySelectorAll('.waypoint-drop-target')].forEach(el => el.classList.remove('waypoint-drop-target'));
    });
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      card.classList.add('waypoint-drop-target');
      try { e.dataTransfer.dropEffect = 'move'; } catch (_) {}
    });
    card.addEventListener('dragleave', () => card.classList.remove('waypoint-drop-target'));
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('waypoint-drop-target');
      let from = dragFromIndex;
      try {
        const dt = e.dataTransfer.getData('text/plain');
        if (dt !== '') from = Number(dt);
      } catch (_) {}
      if (Number.isFinite(from)) moveWaypointTo(from, i);
    });

    // Card header row: drag handle, subtle index, layer (same row), optional Start/End/Via, actions
    const header = document.createElement('div');
    header.className = 'waypoint-card-header' + (isTopLayout ? ' waypoint-card-header--compact' : '');

    // Drag handle (drag-and-drop reordering)
    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.title = 'Drag to reorder';
    handle.textContent = '⋮⋮';
    header.appendChild(handle);

    const indexEl = document.createElement('span');
    indexEl.className = 'waypoint-index';
    indexEl.textContent = letter;
    indexEl.title = isSetMode ? `Point ${i + 1}` : (roleLabel ? `${roleLabel} (${letter})` : `Step ${letter}`);
    header.appendChild(indexEl);

    if (roleLabel) {
      const roleSpan = document.createElement('span');
      roleSpan.className = 'waypoint-role';
      roleSpan.textContent = roleLabel;
      header.appendChild(roleSpan);
    }

    const layerSel = document.createElement('select');
    layerSel.className = 'viewpoint-select waypoint-layer-select';
    const blankOpt = document.createElement('option');
    blankOpt.value = '';
    blankOpt.textContent = '— Layer —';
    layerSel.appendChild(blankOpt);

    LAYERS.forEach(layer => {
      if (effAllowed && !layersWithAllowed.has(layer.id)) return;
      const opt = document.createElement('option');
      opt.value = layer.id;
      opt.textContent = waypointLayerSelectText(layer);
      opt.title = layer.label;
      if (wp.layer === layer.id) opt.selected = true;
      layerSel.appendChild(opt);
    });

    layerSel.onchange = () => selectLayer(i, layerSel.value || null);

    if (wp.layer) {
      layerSel.style.background = LAYER_COLORS[wp.layer] || 'var(--surface-2)';
      const full = LAYERS.find((l) => l.id === wp.layer);
      layerSel.title = full ? `Layer: ${full.label}` : "";
    } else {
      layerSel.style.background = '';
      layerSel.title = "ArchiMate layer";
    }

    header.appendChild(layerSel);

    // Reorder controls
    const canMoveUp = i > 0;
    const canMoveDown = i < state.waypoints.length - 1;
    const isTwoOnly = state.waypoints.length === 2;

    if (!isSetMode && isTwoOnly && (isFirst || isLast)) {
      const swapBtn = document.createElement('button');
      swapBtn.className = 'waypoint-move';
      swapBtn.title = 'Swap Start and End';
      swapBtn.textContent = isTopLayout ? '⇄' : '⇅';
      swapBtn.onclick = () => window.swapStartEnd();
      header.appendChild(swapBtn);
    } else {
      const upBtn = document.createElement('button');
      upBtn.className = 'waypoint-move';
      upBtn.title = isTopLayout ? 'Move earlier (left in chain)' : 'Move up';
      upBtn.textContent = isTopLayout ? '←' : '↑';
      upBtn.disabled = !canMoveUp;
      upBtn.onclick = () => moveWaypoint(i, -1);
      header.appendChild(upBtn);

      const downBtn = document.createElement('button');
      downBtn.className = 'waypoint-move';
      downBtn.title = isTopLayout ? 'Move later (right in chain)' : 'Move down';
      downBtn.textContent = isTopLayout ? '→' : '↓';
      downBtn.disabled = !canMoveDown;
      downBtn.onclick = () => moveWaypoint(i, +1);
      header.appendChild(downBtn);
    }

    // Allow deleting any point as long as 2 remain (applies to both modes).
    if (state.waypoints.length > 2) {
      const rmBtn = document.createElement('button');
      rmBtn.className = 'waypoint-remove';
      rmBtn.textContent = '×';
      rmBtn.onclick = () => removeWaypoint(i);
      header.appendChild(rmBtn);
    }

    card.appendChild(header);

    // Body: element picker (layer lives in header; layer optional — search works without it)
    {
      const body = document.createElement('div');
      body.className = 'waypoint-card-body' + (isTopLayout ? ' waypoint-card-body--compact' : '');

      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'element-trigger';

      const left = document.createElement('span');
      left.className = 'left';
      const iconWrap = document.createElement('span');
      iconWrap.className = 'element-icon';
      iconWrap.innerHTML = wp.element && window.getElementPickerTileSvg
        ? window.getElementPickerTileSvg(wp.element, tileSvgW, tileSvgH)
        : (wp.element && window.getElementMiniSvg ? window.getElementMiniSvg(wp.element, tileMini) : '');
      left.appendChild(iconWrap);

      const name = document.createElement('span');
      name.className = 'name';
      const tileShowsName = !!(wp.element && window.getElementPickerTileSvg);
      if (tileShowsName) {
        trigger.classList.add('element-trigger--tile-label');
        trigger.setAttribute(
          'aria-label',
          `${wp.element}: open picker to change element`
        );
        name.textContent = '';
      } else {
        trigger.classList.remove('element-trigger--tile-label');
        trigger.removeAttribute('aria-label');
        if (wp.element) {
          name.textContent = wp.element;
        } else if (!wp.layer && !(effAllowed && effAllowed.size)) {
          name.textContent = 'Type to search, or pick layer…';
        } else {
          name.textContent = 'Select element…';
        }
      }
      left.appendChild(name);
      trigger.appendChild(left);

      const chev = document.createElement('span');
      chev.className = 'chev';
      chev.textContent = '▾';
      trigger.appendChild(chev);

      trigger.onclick = () => openElementOverlay(trigger, i, wp.layer ?? null);
      body.appendChild(trigger);
      card.appendChild(body);
    }
    chain.appendChild(card);
  });

  checkReady();
  updateQuickExamplesVisibility();
  schedulePersistSession();
}

function updatePathModeHint() {
  const top = document.getElementById("app-layout")?.classList.contains("layout-top");
  const text =
    state.selectionMode === "set"
      ? "Order does not matter: pick points and the engine will reorder them into the strongest legal chain."
      : top
        ? "The route follows your waypoint order left to right (Start → … → End). Use + Add element for extra stops."
        : "The route follows your list from top to bottom (Start → … → End). Use + Add element for extra stops.";
  const pop = document.getElementById("path-mode-popover");
  const btn = document.getElementById("path-mode-info-btn");
  if (pop) pop.textContent = text;
  if (btn) btn.title = text;
}

function updateConnectSetExploratoryWarning() {
  const warning = document.getElementById("connect-set-exploratory-warning");
  if (!warning) return;
  warning.hidden = state.selectionMode !== "set";
}

function updateQuickExamplesVisibility() {
  const block = document.getElementById("quick-examples-block");
  const showRow = document.getElementById("quick-examples-show-row");
  const hideBtn = document.getElementById("quick-examples-hide-btn");
  if (!block) return;
  const picked = state.waypoints.filter(wp => wp?.element).length;
  const shouldAutoHide = picked >= 2;
  const veteran = hasQuickExamplesVeteranPref();
  if (shouldAutoHide) markQuickExamplesVeteran();
  if (!shouldAutoHide && !veteran) state.forceShowQuickExamples = false;
  const blockVisible =
    !veteran && !shouldAutoHide ? true : !!state.forceShowQuickExamples;
  block.hidden = !blockVisible;
  if (showRow) showRow.hidden = blockVisible || (!shouldAutoHide && !veteran);
  if (hideBtn) hideBtn.hidden = !blockVisible || (!shouldAutoHide && !veteran);

  // Empty-state CTA is redundant once examples are visible.
  const emptyExamplesBtn = document.getElementById("diagram-empty-examples-btn");
  if (emptyExamplesBtn) emptyExamplesBtn.hidden = blockVisible;
}

window.showQuickExamplesPanel = function () {
  state.forceShowQuickExamples = true;
  updateQuickExamplesVisibility();
  schedulePersistSession();
};

window.hideQuickExamplesPanel = function () {
  markQuickExamplesVeteran();
  state.forceShowQuickExamples = false;
  updateQuickExamplesVisibility();
  schedulePersistSession();
};

function selectLayer(waypointIdx, layerId) {
  state.waypoints[waypointIdx].layer   = layerId || null;
  state.waypoints[waypointIdx].element = null;
  renderWaypointChain();
}

function selectElement(waypointIdx, elementName) {
  state.waypoints[waypointIdx].element = elementName || null;
  if (elementName && ELEMENTS?.[elementName]?.layer) {
    state.waypoints[waypointIdx].layer = ELEMENTS[elementName].layer;
  }
  renderWaypointChain();
}

function checkReady() {
  const picked = state.waypoints.filter(wp => wp?.element).length;
  const minOk = state.selectionMode === 'set' ? picked >= 2 : state.waypoints.every(wp => wp.element);
  document.getElementById('find-path-btn').disabled = !minOk;
}

// ── Mode & Derived toggles ──────────────────────────────────────────────────


window.setMode = function(mode) {
  const prevMode = state.mode;
  const isCompactSwimToggle =
    (prevMode === "compact" && mode === "swimlane") ||
    (prevMode === "swimlane" && mode === "compact");

  // When switching Compact ↔ Swimlanes, the renderer changes the SVG viewBox width/height.
  // Even if we keep the same pan/zoom state, that viewBox delta changes pixel-to-world scaling,
  // which feels like a "jump". We compensate by adjusting the camera so the viewport center stays fixed.
  const captureDiagramViewBox = () => {
    const host = document.getElementById("path-diagram");
    const svg = host?.querySelector?.("svg");
    if (!svg) return null;
    const vb = String(svg.getAttribute("viewBox") || "").trim().split(/\s+/).map(Number);
    if (vb.length !== 4 || vb.some((n) => !Number.isFinite(n))) return null;
    const vp = document.getElementById("diagram-pan-viewport");
    if (!vp) return null;
    const r = vp.getBoundingClientRect();
    return {
      w: vb[2],
      h: vb[3],
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
    };
  };

  const vbBefore = (isCompactSwimToggle && state.segments) ? captureDiagramViewBox() : null;

  state.mode = mode;
  const swimBtn = document.getElementById('btn-toggle-swimlanes');
  if (swimBtn) swimBtn.classList.toggle('active', mode === 'swimlane');
  if (state.segments) window.dispatch({ type: "RENDER_RESULTS" });

  if (vbBefore) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const vbAfter = captureDiagramViewBox();
        if (!vbAfter) return;
        if (!Number.isFinite(vbBefore.w) || vbBefore.w <= 0) return;
        if (!Number.isFinite(vbAfter.w) || vbAfter.w <= 0) return;

        // Maintain apparent scale by compensating for viewBox width change.
        // px/world ∝ 1/viewBoxW, so when viewBoxW grows, increase camera scale proportionally.
        const factor = vbAfter.w / vbBefore.w;
        if (!Number.isFinite(factor) || factor <= 0) return;
        if (Math.abs(factor - 1) < 1e-6) return;
        diagramZoomAtPoint(vbBefore.cx, vbBefore.cy, factor);
      });
    });
  }
  schedulePersistSession();
};

window.toggleSwimlanes = function() {
  setMode(state.mode === 'swimlane' ? 'compact' : 'swimlane');
};

window.cyclePathFlow = function () {
  const cur = state.pathFlow;
  const ix = PATH_FLOW_ORDER.indexOf(cur);
  const next = PATH_FLOW_ORDER[ix === -1 ? 0 : (ix + 1) % PATH_FLOW_ORDER.length];
  state.pathFlow = next;
  try {
    localStorage.setItem(getPathFlowStorageKey(), next);
  } catch (_) {}
  updatePathFlowButton();
  if (state.segments) window.dispatch({ type: "RENDER_RESULTS" });
  schedulePersistSession();
};

/** @deprecated use cyclePathFlow */
window.toggleVertical = window.cyclePathFlow;


window.setDerived = function(include) {
  state.includeDerived = include;
  state.lastPathTemporaryRelaxation = null;
  document.getElementById('btn-direct').classList.toggle('active',  !include);
  document.getElementById('btn-derived').classList.toggle('active',  include);
  rebuildGraph();
  if (state.segments) window.dispatch({ type: "FIND_PATH", reason: "set-derived" });
  updatePathOptionsTriggerSummary();
  schedulePersistSession();
};

/**
 * Connect-set mode finds a directed chain but leaves waypoint slots in pick order.
 * Ordered mode uses slot order as Start → Via → End; after switching, align slots with
 * the last successful solver chain so the directed search matches what was shown in set mode.
 */
function reorderWaypointsToMatchLastSolverChainIfPossible() {
  const chain = state.lastAutoOrderResult;
  const wps = state.waypoints;
  if (!Array.isArray(chain) || chain.length < 2 || !Array.isArray(wps) || wps.length !== chain.length) {
    return;
  }

  const picked = wps.map((wp) => wp?.element).filter(Boolean);
  if (picked.length !== wps.length) return;
  if (new Set(picked).size !== picked.length) return;

  const sortKey = (arr) =>
    [...arr]
      .filter(Boolean)
      .sort()
      .join("\u0000");
  if (sortKey(picked) !== sortKey(chain)) return;

  const lastIn = state.lastAutoOrderInput;
  if (!Array.isArray(lastIn) || sortKey(lastIn) !== sortKey(picked)) return;

  const byEl = new Map();
  for (const wp of wps) {
    const el = wp?.element;
    if (!el || byEl.has(el)) return;
    byEl.set(el, wp);
  }

  const reordered = chain.map((el) => byEl.get(el));
  if (reordered.some((wp) => !wp)) return;
  state.waypoints = reordered;
}

window.setSelectionMode = function(mode) {
  const prev = state.selectionMode;
  state.selectionMode = (mode === 'set') ? 'set' : 'ordered';
  document.getElementById('btn-ordered')?.classList.toggle('active', state.selectionMode === 'ordered');
  document.getElementById('btn-set')?.classList.toggle('active', state.selectionMode === 'set');

  updatePathModeHint();
  updateConnectSetExploratoryWarning();
  updatePathOptionsTriggerSummary();

  // In set mode, there is no Start/End semantics; allow removing any point.
  // Keep existing selections as-is.
  if (state.selectionMode === "ordered" && prev === "set") {
    reorderWaypointsToMatchLastSolverChainIfPossible();
  }
  renderWaypointChain();

  // Re-run if we already have results.
  if (state.segments) window.dispatch({ type: "FIND_PATH", reason: "set-selection-mode" });
  schedulePersistSession();
};

// ── Quick Examples ─────────────────────────────────────────────────────────────

window.loadExample = function(waypoints) {
  // waypoints = [{layer, element}, ...]
  state.waypoints = waypoints.map(wp => ({ layer: wp.layer, element: wp.element }));
  renderWaypointChain();
  window.dispatch({ type: "FIND_PATH", reason: "load-example" });
  schedulePersistSession();
};

// ── Find Path ───────────────────────────────────────────────────────────────

window.findPath = function(opts = {}) {
  const runId = Number.isFinite(opts?.runId) ? opts.runId : state._findRunId;
  const picked = state.waypoints.map(wp => wp.element).filter(Boolean);
  const forceFullMetamodel = !!state._pathfindFullMetamodelOnce;
  state.lastAutoOrdered = false;

  trackEvent("find_path", {
    selectionMode: state.selectionMode,
    includeDerived: !!state.includeDerived,
    allowAssociationFallback: !!state.allowAssociationFallback,
    waypointCount: picked.length,
    reason: (opts && typeof opts.reason === "string" && opts.reason) || undefined,
  });
  
  window.state.userChoices = {}; // Reset decisions for the new path
  
  // ... rest of function

  try {
    setLoading(true, "Finding…");
    state.userChoices = {}; // Clear previous decisions
    // Allow browser to paint loading state before doing BFS work.
    setTimeout(() => {
    let usedFullMetamodelOnce = false;
    try {
    // If a newer run started while we were waiting for the UI to paint, ignore this callback.
    if (runId !== state._findRunId) return;
    if (!state._relaxOneShotRestore) {
      state.lastPathTemporaryRelaxation = null;
    }

    let segs = [];
    let pathIsFallback = false;
    let chainForExplain = null;

    state.userChoices = {}; // Clear previous decisions
    state.lastAutoOrderMetrics = null;
    const searchGraph = forceFullMetamodel
      ? buildGraph({ allowedElements: null, includeDerived: state.includeDerived })
      : state.graph;
    usedFullMetamodelOnce = forceFullMetamodel;
    const searchOptions = getSearchPathOptions({ forceFullMetamodel });
    let searchStatus = "no_path";
    if (state.selectionMode === 'set') {
      const res = findBestChainForSet(searchGraph, picked, searchOptions);
      segs = res?.segments ?? [];
      pathIsFallback = !!res?.isFallback;
      searchStatus = String(res?.searchStatus || "no_path");
      chainForExplain = res?.orderedPoints ?? null;
      state.lastAutoOrdered = true;
      state.lastAutoOrderInput = picked.slice();
      state.lastAutoOrderResult = chainForExplain ? chainForExplain.slice() : null;
      const uniqN = [...new Set(picked)].length;
      if (chainForExplain?.length && res && Number.isFinite(res.totalScore)) {
        state.lastAutoOrderMetrics = {
          totalScore: res.totalScore,
          pointCount: uniqN,
          // Must match findBestChainForSet default exactMaxPoints in logic/pathfinder.js
          orderingExact: uniqN <= 8,
        };
      }
    } else {
      const waypointNames = state.waypoints.map(wp => wp.element);
      chainForExplain = waypointNames;
      const fp = findPaths(searchGraph, waypointNames, searchOptions);
      segs = fp.segments;
      pathIsFallback = !!fp.isFallback;
      searchStatus = String(fp?.searchStatus || "no_path");
    }

    let hasNoPath = !segs || segs.length === 0 || segs.some(s => !s.paths || s.paths.length === 0);

    // Guard against stale async completion (e.g. user toggles options rapidly).
    if (runId !== state._findRunId) return;

    state.segments = segs;
    state.lastPathSearchStatus = searchStatus;
    state.lastPathIsFallback = !hasNoPath && pathIsFallback;

    trackEvent("find_path_result", {
      ok: !hasNoPath,
      selectionMode: state.selectionMode,
      includeDerived: !!state.includeDerived,
      allowAssociationFallback: !!state.allowAssociationFallback,
      waypointCount: picked.length,
      isFallback: !hasNoPath && !!pathIsFallback,
      segmentCount: Array.isArray(segs) ? segs.length : 0,
    });
    if (state._relaxOneShotRestore) {
      const snap = state._relaxOneShotRestore;
      if (!hasNoPath) {
        const relaxedDerived =
          snap.relaxMode === "derived" && snap.includeDerived === false;
        const relaxedAssoc =
          snap.relaxMode === "association" && snap.allowAssociationFallback === false;
        if (relaxedDerived || relaxedAssoc) {
          state.lastPathTemporaryRelaxation = {
            derived: !!relaxedDerived,
            association: !!relaxedAssoc,
          };
        } else {
          state.lastPathTemporaryRelaxation = null;
        }
      } else {
        state.lastPathTemporaryRelaxation = null;
      }
    }
    state.activePathIdx = 0;
    computeAndSetPathFailureHints(
      hasNoPath,
      picked,
      state.waypoints.map((wp) => wp.element)
    );
    applyRelaxOneShotRestore();

    if (window.__pendingSessionExtras) {
      const ex = window.__pendingSessionExtras;
      window.__pendingSessionExtras = undefined;
      if (ex.userChoices && typeof ex.userChoices === "object") {
        state.userChoices = { ...ex.userChoices };
      }
      if (typeof ex.activePathIdx === "number" && state.segments && state.segments.length) {
        const maxAlts = Math.max(...state.segments.map((s) => s.paths.length), 1);
        state.activePathIdx = Math.max(0, Math.min(Math.floor(ex.activePathIdx), maxAlts - 1));
      }
      sanitizeUserChoicesForActivePath();
    }
    // Single render after all state (including session extras) is applied.
    scheduleRenderResults();
    } finally {
      applyRelaxOneShotRestore();
      if (usedFullMetamodelOnce) {
        state._pathfindFullMetamodelOnce = false;
        rebuildGraph();
      }
      setLoading(false);
      schedulePersistSession();
    }
    }, 0);
  } catch (e) {
    console.error('findPath error:', e);
    showError(e.message);
    setLoading(false);
  }
};

function algorithmDetailsPanelInitiallyOpen() {
  try {
    return sessionStorage.getItem("archimateAlgorithmDetailsOpen") === "1";
  } catch (_) {
    return false;
  }
}

/** Sum hops across segments for the given alternative index (Connect set / ordered). */
function totalHopsInSegments(segments, pathIdx) {
  if (!segments?.length) return 0;
  let h = 0;
  for (const seg of segments) {
    const p = seg.paths?.[pathIdx] ?? seg.paths?.[0];
    if (p?.length) h += p.length - 1;
  }
  return h;
}

const ALGORITHM_DETAILS_TOGGLE_SVG = `<svg class="algorithm-details-toggle__icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 16v-4M12 8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

/** Single grey box: connect-set order visible; cost / UCS math behind Algorithm Details toggle. */
function buildConnectSetTechHtml(metrics, segments, pathIdx, orderedChain) {
  if (!metrics) return "";
  const hops = totalHopsInSegments(segments, pathIdx);
  const scoreStr = Number.isFinite(metrics.totalScore) ? String(metrics.totalScore) : "—";
  const orderShort = metrics.orderingExact ? "exact ordering" : "heuristic ordering";
  const so = getSearchPathOptions();
  const chainStr =
    orderedChain?.length ? orderedChain.map((n) => String(n).trim()).filter(Boolean).join(" → ") : "";
  const panelOpen = algorithmDetailsPanelInitiallyOpen();
  const headMain = chainStr
    ? `<div class="connect-set-note-tech-chain"><strong>Connect set</strong> · ${chainStr}</div>`
    : `<div class="connect-set-note-tech-chain connect-set-note-tech-chain--titleonly"><strong>Connect set</strong></div>`;
  const btnTitle = panelOpen ? "Hide Routing Math" : "Show Routing Math";
  const btnAria =
    panelOpen ? "Hide routing math details" : "Show routing math details";
  return `<div class="connect-set-note-tech" role="note">
    <div class="connect-set-note-tech-headrow">
      ${headMain}
      <button type="button" class="algorithm-details-toggle" title="${btnTitle}" aria-label="${btnAria}" aria-expanded="${panelOpen ? "true" : "false"}" onclick="window.toggleAlgorithmDetailsPanel(event)">${ALGORITHM_DETAILS_TOGGLE_SVG}</button>
    </div>
    <div class="algorithm-debug-panel${panelOpen ? " show" : ""}">
      <span class="connect-set-note-tech-line">
        <strong>Total cost</strong> ${scoreStr}
        <span class="connect-set-note-sep" aria-hidden="true">·</span>
        <strong>Chain</strong> ${hops} hop${hops !== 1 ? "s" : ""}
        <span class="connect-set-note-sep" aria-hidden="true">·</span>
        <strong>Points</strong> ${metrics.pointCount}
        <span class="connect-set-note-sep" aria-hidden="true">·</span>
        ${orderShort}
        <span class="connect-set-note-sep" aria-hidden="true">·</span>
        <strong>UCS</strong> · max ${so.maxDepth} hops/segment
      </span>
      <span class="connect-set-note-tech-hint">Strongest Legal Chain ranking uses weighted syntax cost: direct = ${so.pathWeightDirect}, derived = ${so.pathWeightDerived}, Association = ${so.pathWeightAssociation}, layer-skip = ${so.pathWeightLayerSkip}.</span>
    </div>
  </div>`;
}

function getPerspectiveTitlesForDomain() {
  const key = normalizeDomainContext(state.domainContext);
  const fallback = {
    A: "Business Operations",
    B: "System Infrastructure",
    C: "Strategic Realization",
  };
  if (typeof SCENARIOS === "undefined" || !SCENARIOS) return fallback;
  const cur = SCENARIOS[key]?.perspectiveTitles;
  const abs = SCENARIOS.abstract?.perspectiveTitles;
  return cur || abs || fallback;
}

function layerBadgeClassForLabel(layerLabel) {
  switch (layerLabel) {
    case "Business-Heavy":
      return "path-badge--layer-business";
    case "Application-Heavy":
      return "path-badge--layer-application";
    case "Tech/Physical-Heavy":
      return "path-badge--layer-tech";
    default:
      return "path-badge--layer-fullstack";
  }
}

function precisionBadgeClassForLabel(precisionLabel) {
  return precisionLabel === "Executive Summary"
    ? "path-badge--precision-executive"
    : "path-badge--precision-ground";
}

function escapeHtmlAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function precisionTooltip(precisionLabel) {
  if (precisionLabel === "Executive Summary") {
    return "This path uses ArchiMate Derivation rules (Cost=5) to hide technical complexity for a business audience.";
  }
  return "This path follows only direct ArchiMate relationships (Cost=1) to provide the most granular engineering view.";
}

function buildCoachActionsFromPerspectiveAction(action, recCtx = {}) {
  if (!action) return [];
  if (action.mode === "swap" && Array.isArray(action.candidates) && action.candidates.length) {
    return action.candidates.slice(0, 2).map((c) => ({
      label: `Replace ${c.removeElement} -> ${c.addElement}`,
      onClick: () =>
        withVisibleEditingControls(() =>
          replacePerspectiveFocusPoint(c.removeIndex, c.addElement, {
            expandedScope: isElementOutsideStrictViewpoint(c.addElement, recCtx) && !!recCtx.usingFullMetamodel,
          })
        ),
    }));
  }
  if (action.mode === "remove" && Array.isArray(action.candidates) && action.candidates.length) {
    return action.candidates.slice(0, 2).map((c) => ({
      label: `Remove ${c.element}`,
      onClick: () => withVisibleEditingControls(() => removeWaypoint(c.index)),
    }));
  }
  if (action.mode === "add" && Array.isArray(action.candidates) && action.candidates.length) {
    return action.candidates.slice(0, 2).map((c) => ({
      label: `Add ${c.element}`,
      onClick: () =>
        withVisibleEditingControls(() =>
          addPerspectiveSuggestedElement(c.element, {
            expandedScope: isElementOutsideStrictViewpoint(c.element, recCtx) && !!recCtx.usingFullMetamodel,
          })
        ),
    }));
  }
  return [];
}

function widenSearchForVariation() {
  let changed = false;

  const curPaths = clampSearchMaxPaths(state.searchMaxPaths);
  if (curPaths < 10) {
    state.searchMaxPaths = clampSearchMaxPaths(curPaths + 2);
    changed = true;
  } else {
    const effort = normalizeSearchEffort(state.searchEffort);
    if (effort === "fast") {
      state.searchEffort = "balanced";
      changed = true;
    } else if (effort === "balanced") {
      state.searchEffort = "thorough";
      changed = true;
    } else {
      const curDepth = clampSearchDepth(state.searchMaxDepth);
      if (curDepth < 12) {
        state.searchMaxDepth = clampSearchDepth(curDepth + 1);
        changed = true;
      }
    }
  }

  if (!changed) return false;
  applySearchOptionsToUI();
  updatePathOptionsTriggerSummary();
  schedulePersistSession();
  if (state.segments) window.dispatch({ type: "FIND_PATH", reason: "variation-coach-widen-search" });
  return true;
}

function buildPerspectiveVariationCoach(sectionId, items, grouped, segments, activePathIdx, recCtx = {}) {
  if (!Array.isArray(items) || items.length < 3) return null;

  const precisionCounts = new Map();
  const layerCounts = new Map();
  for (const item of items) {
    const p = String(item?.precisionLabel || "");
    const l = String(item?.layerLabel || "");
    if (p) precisionCounts.set(p, (precisionCounts.get(p) || 0) + 1);
    if (l) layerCounts.set(l, (layerCounts.get(l) || 0) + 1);
  }

  const topOf = (m) => {
    let bestKey = "";
    let bestCount = 0;
    for (const [k, v] of m.entries()) {
      if (v > bestCount) {
        bestKey = k;
        bestCount = v;
      }
    }
    return { key: bestKey, count: bestCount };
  };

  const pTop = topOf(precisionCounts);
  const lTop = topOf(layerCounts);
  const pShare = pTop.count / items.length;
  const lShare = lTop.count / items.length;

  if (pShare >= 0.8 && pTop.key === "Engineering Ground-Truth") {
    const canEnableSimplified = !state.includeDerived;
    const canWiden = clampSearchMaxPaths(state.searchMaxPaths) < 10
      || normalizeSearchEffort(state.searchEffort) !== "thorough"
      || clampSearchDepth(state.searchMaxDepth) < 12;
    const actions = [];
    if (canEnableSimplified) {
      actions.push({
        label: "Enable Simplified (+Derived)",
        onClick: () => setDerived(true),
      });
    }
    if (canWiden) {
      actions.push({
        label: "Widen search",
        onClick: () => widenSearchForVariation(),
      });
    }
    if (!actions.length) return null;
    return {
      text: "Most routes here are Ground-Truth. Consider trying Simplified variants for a higher-level explanation.",
      actions,
    };
  }

  if (pShare >= 0.8 && pTop.key === "Executive Summary") {
    const canGroundTruth = state.includeDerived;
    const canWiden = clampSearchMaxPaths(state.searchMaxPaths) < 10
      || normalizeSearchEffort(state.searchEffort) !== "thorough"
      || clampSearchDepth(state.searchMaxDepth) < 12;
    const actions = [];
    if (canGroundTruth) {
      actions.push({
        label: "Switch to Ground-Truth (Direct)",
        onClick: () => setDerived(false),
      });
    }
    if (canWiden) {
      actions.push({
        label: "Widen search",
        onClick: () => widenSearchForVariation(),
      });
    }
    if (!actions.length) return null;
    return {
      text: "Most routes here are Simplified. Consider Ground-Truth variants for full relationship detail.",
      actions,
    };
  }

  if (lShare >= 0.85 && lTop.key) {
    // Pick another lens and surface concrete add/remove/replace actions from its existing suggestion engine.
    const targetSection = sectionId === "A" ? "B" : sectionId === "B" ? "A" : "A";
    const targetPrimary = buildPerspectiveSuggestions(targetSection, grouped, segments, activePathIdx, recCtx);
    const targetAction = resolvePerspectiveEmptyCta(targetSection, grouped, targetPrimary, recCtx);
    const targetAdd = targetAction.mode === "add" && (!targetPrimary || targetPrimary.length === 0)
      ? buildFallbackPerspectiveAddSuggestions(targetSection, grouped, segments, activePathIdx, recCtx)
      : targetPrimary;
    const effectiveAction = targetAction.mode === "add"
      ? { ...targetAction, candidates: targetAdd }
      : targetAction;
    const actions = buildCoachActionsFromPerspectiveAction(effectiveAction, recCtx);
    return {
      text: `Routes here are heavily concentrated on ${lTop.key}. Try one of these concrete changes to diversify the perspective.`,
      actions,
    };
  }

  return null;
}

function layerTooltip(layerLabel) {
  switch (layerLabel) {
    case "Business-Heavy":
      return "Most hops touch Motivation, Strategy, or Business elements.";
    case "Application-Heavy":
      return "Most hops touch Application-layer elements.";
    case "Tech/Physical-Heavy":
      return "Most hops touch Technology, Physical, or Implementation elements.";
    case "Full-Stack Alignment":
      return "Connects upper layers (Motivation/Strategy/Business) with infrastructure (Application and/or Technology/Physical), or a balanced mix.";
    default:
      return layerLabel;
  }
}

function buildPathLabelsModalHtml() {
  const t = getPerspectiveTitlesForDomain();
  const pMode = normalizePerspectiveClassMode(state.perspectiveClassMode);
  const sharePct = clampPerspectiveDominantSharePct(state.perspectiveDominantSharePct);
  const classifierLine =
    pMode === "dominant-share"
      ? `Grouping is currently set to <strong>Dominant share</strong>: a route is grouped as upper or infrastructure only when that band reaches at least <strong>${sharePct}%</strong> of upper+infrastructure hops; otherwise it is grouped as cross-layer.`
      : `Grouping is currently set to <strong>Exclusive</strong>: upper and infrastructure groups require routes to stay strictly inside those bands; mixed routes are grouped as cross-layer.`;
  const te = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  return `
    <div class="path-labels-section path-labels-section--route">
      <div class="path-labels-section-head">
        <span class="path-labels-section-kicker">Grouping</span>
        <h4 class="path-labels-h">Route groups</h4>
      </div>
      <p class="path-labels-p">Each group lists path alternatives that share the same <em>layer mix</em> on the route (Motivation/Strategy/Business vs Application vs Technology/Physical). Section titles follow your <strong>story theme</strong> when one is selected.</p>
      <p class="path-labels-p">${classifierLine}</p>
      <div class="path-labels-route-grid">
        <div class="path-labels-route-card path-labels-route-card--upper">
          <div class="path-labels-route-card__title">${te(t.A)}</div>
          <p class="path-labels-route-card__text">Every element on the route sits in the upper band (Motivation, Strategy, or Business). There are no Application-only or Technology/Physical hops.</p>
          <div class="path-labels-mini-legend" aria-hidden="true">
            <span class="path-labels-mini-swatch" style="background:var(--layer-motivation)"></span>
            <span class="path-labels-mini-swatch" style="background:var(--layer-strategy)"></span>
            <span class="path-labels-mini-swatch" style="background:var(--layer-business)"></span>
          </div>
        </div>
        <div class="path-labels-route-card path-labels-route-card--infra">
          <div class="path-labels-route-card__title">${te(t.B)}</div>
          <p class="path-labels-route-card__text">The route stays in Application and/or Technology/Physical (and Implementation). It does not pass through Motivation, Strategy, or Business elements.</p>
          <div class="path-labels-mini-legend" aria-hidden="true">
            <span class="path-labels-mini-swatch" style="background:var(--layer-application)"></span>
            <span class="path-labels-mini-swatch" style="background:var(--layer-technology)"></span>
            <span class="path-labels-mini-swatch" style="background:var(--layer-physical)"></span>
          </div>
        </div>
        <div class="path-labels-route-card path-labels-route-card--cross">
          <div class="path-labels-route-card__title">${te(t.C)}</div>
          <p class="path-labels-route-card__text">The route mixes upper layers with Application or infrastructure — typical “vertical slice” or realization-style alignment.</p>
          <div class="path-labels-mini-legend path-labels-mini-legend--blend" aria-hidden="true"></div>
        </div>
      </div>
    </div>
    <div class="path-labels-section path-labels-section--badges">
      <div class="path-labels-section-head">
        <span class="path-labels-section-kicker">On each route</span>
        <h4 class="path-labels-h">Layer mix badge</h4>
      </div>
      <p class="path-labels-p">Estimated from hop counts by ArchiMate layer (same logic as the pathfinder). Colors match the small badges in the path list.</p>
      <ul class="path-labels-badge-explainer">
        <li class="path-labels-badge-explainer__row">
          <span class="path-labels-pill path-labels-pill--business">Business-Heavy</span>
          <span class="path-labels-badge-explainer__desc">Most hops are in Motivation, Strategy, or Business.</span>
        </li>
        <li class="path-labels-badge-explainer__row">
          <span class="path-labels-pill path-labels-pill--application">Application-Heavy</span>
          <span class="path-labels-badge-explainer__desc">Most hops are in the Application layer.</span>
        </li>
        <li class="path-labels-badge-explainer__row">
          <span class="path-labels-pill path-labels-pill--tech">Tech/Physical-Heavy</span>
          <span class="path-labels-badge-explainer__desc">Most hops are in Technology, Physical, or Implementation.</span>
        </li>
        <li class="path-labels-badge-explainer__row">
          <span class="path-labels-pill path-labels-pill--fullstack">Full-Stack Alignment</span>
          <span class="path-labels-badge-explainer__desc">Connects upper layers with infrastructure (e.g. Business with Tech), or a tie / balanced mix — not dominated by a single band.</span>
        </li>
      </ul>
    </div>
    <div class="path-labels-section path-labels-section--precision">
      <div class="path-labels-section-head">
        <span class="path-labels-section-kicker">Path precision</span>
        <h4 class="path-labels-h">Simplified vs ground-truth</h4>
      </div>
      <div class="path-labels-precision-grid">
        <div class="path-labels-precision-card path-labels-precision-card--simplified">
          <div class="path-labels-precision-card__head">
            <span class="path-labels-pill path-labels-pill--precision path-labels-pill--precision-simplified">Simplified</span>
          </div>
          <p class="path-labels-precision-card__text">${te(precisionTooltip("Executive Summary"))}</p>
        </div>
        <div class="path-labels-precision-card path-labels-precision-card--ground">
          <div class="path-labels-precision-card__head">
            <span class="path-labels-pill path-labels-pill--precision path-labels-pill--precision-ground">Ground-Truth</span>
          </div>
          <p class="path-labels-precision-card__text">${te(precisionTooltip("Engineering Ground-Truth"))}</p>
        </div>
      </div>
    </div>
  `;
}

window.openPathLabelsModal = function openPathLabelsModal() {
  const modal = document.getElementById("path-labels-modal");
  const body = document.getElementById("path-labels-body");
  if (!modal || !body) return;
  body.innerHTML = buildPathLabelsModalHtml();
  modal.setAttribute("aria-hidden", "false");
  document.getElementById("path-categories-help-btn")?.setAttribute("aria-expanded", "true");
};

window.closePathLabelsModal = function closePathLabelsModal() {
  const modal = document.getElementById("path-labels-modal");
  if (!modal) return;
  modal.setAttribute("aria-hidden", "true");
  document.getElementById("path-categories-help-btn")?.setAttribute("aria-expanded", "false");
};

function initPathLabelsHelp() {
  const tabs = document.getElementById("path-tabs");
  if (!tabs || tabs.dataset.pathLabelsDelegated) return;
  tabs.dataset.pathLabelsDelegated = "1";
  tabs.addEventListener("click", (e) => {
    const btn = e.target.closest("#path-categories-help-btn");
    if (!btn) return;
    e.preventDefault();
    window.openPathLabelsModal();
  });
}

function getPerspectiveEmptyUiForDomain() {
  const key = normalizeDomainContext(state.domainContext);
  const fallback = {
    A: { intro: "No route currently stays only in Motivation, Strategy, or Business.", cta: "Add element to explore business lens", suggestionsLead: "Closest upper-layer elements to involve" },
    B: { intro: "No route currently stays only in Application, Technology, Physical, or Implementation.", cta: "Add element to explore infrastructure lens", suggestionsLead: "Closest infrastructure elements to involve" },
    C: { intro: "No route currently bridges upper layers and infrastructure in one chain.", cta: "Add element to explore cross-layer lens", suggestionsLead: "Closest bridge candidates to involve" },
  };
  if (typeof SCENARIOS === "undefined" || !SCENARIOS) return fallback;
  const cur = SCENARIOS[key]?.perspectiveEmpty;
  const abs = SCENARIOS.abstract?.perspectiveEmpty;
  return cur || abs || fallback;
}

function perspectiveSectionMeaning(sectionId) {
  switch (sectionId) {
    case "A":
      return "Upper-band lens: route hops remain in Motivation, Strategy, and Business.";
    case "B":
      return "Infrastructure lens: route hops remain in Application and/or Technology, Physical, and Implementation.";
    default:
      return "Cross-layer lens: route hops connect upper layers with Application or infrastructure.";
  }
}

function explainWhyPerspectiveEmpty(sectionId, grouped) {
  const counts = {
    A: grouped?.byPerspective?.A?.length || 0,
    B: grouped?.byPerspective?.B?.length || 0,
    C: grouped?.byPerspective?.C?.length || 0,
  };
  if (sectionId === "A") {
    if (counts.B > 0 || counts.C > 0) return "Current routes enter Application and/or infrastructure layers, so no upper-only chain is available.";
    return "Current selection did not produce an upper-band-only route.";
  }
  if (sectionId === "B") {
    if (counts.A > 0 || counts.C > 0) return "Current routes include upper-layer hops, so no infrastructure-only chain is available.";
    return "Current selection did not produce an infrastructure-only route.";
  }
  if (counts.A > 0 && counts.B === 0) return "Current routes stay in upper layers, so no cross-layer chain is available.";
  if (counts.B > 0 && counts.A === 0) return "Current routes stay in Application/infrastructure, so no cross-layer chain is available.";
  return "Current selection did not produce a cross-layer chain.";
}

function perspectiveModeIsDominantShare() {
  return normalizePerspectiveClassMode(state.perspectiveClassMode) === "dominant-share";
}

function dominantSharePctLabel() {
  return clampPerspectiveDominantSharePct(state.perspectiveDominantSharePct);
}

function perspectiveEmptyIntro(sectionId, grouped, copy) {
  const fallback = copy?.intro || explainWhyPerspectiveEmpty(sectionId, grouped);
  if (!perspectiveModeIsDominantShare()) return fallback;
  const pct = dominantSharePctLabel();
  if (sectionId === "A") {
    return `No route currently stays mostly in Motivation, Strategy, or Business (at least ${pct}% of upper/infrastructure hops).`;
  }
  if (sectionId === "B") {
    return `No route currently stays mostly in Application and infrastructure layers (at least ${pct}% of upper/infrastructure hops).`;
  }
  return `No route currently qualifies as a cross-layer balance under the ${pct}% dominant-share grouping rule.`;
}

function collectPerspectiveSuggestionSources(segments, activePathIdx) {
  const picked = (state.waypoints || []).map((wp) => wp?.element).filter(Boolean);
  const unique = Array.from(new Set(picked));
  if (unique.length) return unique;
  if (typeof flattenSegmentsForIndex !== "function") return unique;
  const flat = flattenSegmentsForIndex(segments, activePathIdx) || [];
  return Array.from(new Set(flat.map((s) => s?.element).filter(Boolean)));
}

const lensProfileCache = new Map();
const perspectiveOutcomeCache = new Map();
const RECOMMENDATION_POOL_SIZE = 8;

function weightedRandomSample(items, count, weightFn) {
  const pool = (items || []).slice();
  const out = [];
  const pickCount = Math.max(0, Math.min(Number(count || 0), pool.length));
  for (let n = 0; n < pickCount; n++) {
    let total = 0;
    const weights = pool.map((item, idx) => {
      const w = Math.max(0, Number(weightFn?.(item, idx) ?? 1));
      total += w;
      return w;
    });
    if (!(total > 0)) break;
    let r = Math.random() * total;
    let chosen = 0;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        chosen = i;
        break;
      }
    }
    out.push(pool[chosen]);
    pool.splice(chosen, 1);
  }
  return out;
}

function diversifyRankedRows(rows, { pickCount = 3, poolSize = RECOMMENDATION_POOL_SIZE } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const rankedPool = rows.slice(0, Math.max(1, Math.min(poolSize, rows.length)));
  const sampled = weightedRandomSample(rankedPool, pickCount, (_row, idx) => 1 / (1 + idx));
  return sampled.length ? sampled : rankedPool.slice(0, pickCount);
}

function getElementLensProfile(elementName) {
  const key = String(elementName || "");
  if (!key) return { upper: 0, infra: 0, crossStrength: 0, upperRatio: 0, infraRatio: 0 };
  if (lensProfileCache.has(key)) return lensProfileCache.get(key);

  let upper = 0;
  let infra = 0;
  const seenPartners = new Set();
  const rows = (typeof MATRIX !== "undefined" && Array.isArray(MATRIX)) ? MATRIX : [];
  for (const row of rows) {
    if (!row || (row.from !== key && row.to !== key)) continue;
    const directCount = Array.isArray(row.direct) ? row.direct.length : 0;
    const derivedCount = Array.isArray(row.derived) ? row.derived.length : 0;
    if (directCount + derivedCount <= 0) continue;
    const partner = row.from === key ? row.to : row.from;
    if (!partner || seenPartners.has(partner)) continue;
    seenPartners.add(partner);
    const bucket = getLayerBucketForPathMeta(partner);
    if (bucket === "upper") upper += 1;
    if (bucket === "middle" || bucket === "lower") infra += 1;
  }

  const total = upper + infra;
  const profile = {
    upper,
    infra,
    crossStrength: upper > 0 && infra > 0 ? Math.min(upper, infra) : 0,
    upperRatio: total > 0 ? upper / total : 0,
    infraRatio: total > 0 ? infra / total : 0,
  };
  lensProfileCache.set(key, profile);
  return profile;
}

function perspectiveCountsFromCluster(clustered) {
  return {
    A: clustered?.byPerspective?.A?.length || 0,
    B: clustered?.byPerspective?.B?.length || 0,
    C: clustered?.byPerspective?.C?.length || 0,
  };
}

function perspectiveActionScore(sectionId, clustered) {
  const c = perspectiveCountsFromCluster(clustered);
  if (sectionId === "A") {
    if (c.A <= 0) return -Infinity;
    return c.A * 100 - c.C * 30 - c.B * 10;
  }
  if (sectionId === "B") {
    if (c.B <= 0) return -Infinity;
    return c.B * 100 - c.C * 30 - c.A * 10;
  }
  if (c.C <= 0) return -Infinity;
  return c.C * 100 + Math.min(c.A, c.B) * 10;
}

function simulatePerspectiveClusterForElements(elementNames, ctx = {}) {
  const names = (elementNames || []).filter(Boolean);
  const graph = ctx.graph || state.graph;
  const options = ctx.options || getSearchPathOptions();
  if (state.selectionMode === "set") {
    const unique = Array.from(new Set(names));
    if (unique.length < 2 || typeof findBestChainForSet !== "function") return null;
    const res = findBestChainForSet(graph, unique, options);
    const segs = res?.segments || [];
    if (!segs.length || segs.some((s) => !s.paths || !s.paths.length)) return null;
    return typeof clusterPaths === "function"
      ? clusterPaths(segs, options)
      : null;
  }

  if (names.length < 2 || names.some((n) => !n) || typeof findPaths !== "function") return null;
  const fp = findPaths(graph, names, options);
  const segs = fp?.segments || [];
  if (!segs.length || segs.some((s) => !s.paths || !s.paths.length)) return null;
  return typeof clusterPaths === "function"
    ? clusterPaths(segs, options)
    : null;
}

function buildElementsForAction({ removeIndex = null, addElement = null } = {}) {
  const wps = (state.waypoints || []).map((wp) => ({
    layer: wp?.layer || null,
    element: wp?.element || null,
  }));
  if (typeof removeIndex === "number" && removeIndex >= 0 && removeIndex < wps.length) {
    wps.splice(removeIndex, 1);
  }
  if (addElement) {
    if (state.selectionMode === "set") {
      wps.push({ layer: normalizeWaypointLayerForElement(addElement), element: addElement });
    } else {
      const insertAt = Math.max(1, wps.length - 1);
      wps.splice(insertAt, 0, { layer: normalizeWaypointLayerForElement(addElement), element: addElement });
    }
  }
  return wps.map((w) => w.element).filter(Boolean);
}

function scorePerspectiveAction(sectionId, { removeIndex = null, addElement = null } = {}, ctx = {}) {
  const key = [
    sectionId,
    state.selectionMode,
    String(removeIndex ?? ""),
    String(addElement ?? ""),
    (state.waypoints || []).map((wp) => wp?.element || "").join("|"),
    String(state.includeDerived),
    String(state.allowAssociationFallback),
    String(state.searchMaxDepth),
    String(state.searchMaxPaths),
    String(state.viewpoint || ""),
    String(!!ctx.usingFullMetamodel),
  ].join("::");
  if (perspectiveOutcomeCache.has(key)) return perspectiveOutcomeCache.get(key);
  const elements = buildElementsForAction({ removeIndex, addElement });
  const clustered = simulatePerspectiveClusterForElements(elements, ctx);
  const score = perspectiveActionScore(sectionId, clustered);
  perspectiveOutcomeCache.set(key, score);
  return score;
}

function rankPerspectiveSuggestions(sectionId, candidates, ctx = {}) {
  const selected = new Set((state.waypoints || []).map((wp) => wp?.element).filter(Boolean));
  let rows = (candidates || [])
    .filter((c) => c && c.element && !selected.has(c.element))
    .map((c) => ({ ...c, profile: getElementLensProfile(c.element) }));

  if (sectionId === "A") {
    rows.sort((a, b) => {
      const bOutcome = scorePerspectiveAction(sectionId, { addElement: b.element }, ctx);
      const aOutcome = scorePerspectiveAction(sectionId, { addElement: a.element }, ctx);
      if (bOutcome !== aOutcome) return bOutcome - aOutcome;
      // For business/upper focus, prefer upper-heavy and less cross-layer-bridging elements.
      if (b.profile.upperRatio !== a.profile.upperRatio) return b.profile.upperRatio - a.profile.upperRatio;
      if (a.profile.crossStrength !== b.profile.crossStrength) return a.profile.crossStrength - b.profile.crossStrength;
      if (a.distance !== b.distance) return a.distance - b.distance;
      return String(a.element).localeCompare(String(b.element));
    });
    const ranked = rows.filter((r) => Number.isFinite(scorePerspectiveAction(sectionId, { addElement: r.element }, ctx)));
    return diversifyRankedRows(ranked, { pickCount: 3 }).map(({ profile, ...rest }) => rest);
  }

  if (sectionId === "B") {
    rows.sort((a, b) => {
      const bOutcome = scorePerspectiveAction(sectionId, { addElement: b.element }, ctx);
      const aOutcome = scorePerspectiveAction(sectionId, { addElement: a.element }, ctx);
      if (bOutcome !== aOutcome) return bOutcome - aOutcome;
      // For infra focus, prefer infra-heavy and less cross-layer-bridging elements.
      if (b.profile.infraRatio !== a.profile.infraRatio) return b.profile.infraRatio - a.profile.infraRatio;
      if (a.profile.crossStrength !== b.profile.crossStrength) return a.profile.crossStrength - b.profile.crossStrength;
      if (a.distance !== b.distance) return a.distance - b.distance;
      return String(a.element).localeCompare(String(b.element));
    });
    const ranked = rows.filter((r) => Number.isFinite(scorePerspectiveAction(sectionId, { addElement: r.element }, ctx)));
    return diversifyRankedRows(ranked, { pickCount: 3 }).map(({ profile, ...rest }) => rest);
  }

  // Cross-layer lens: prefer elements that actually bridge both upper and infra neighbors.
  const bridgeFirst = rows.filter((r) => r.profile.crossStrength > 0);
  const pool = bridgeFirst.length ? bridgeFirst : rows;
  pool.sort((a, b) => {
    const bOutcome = scorePerspectiveAction(sectionId, { addElement: b.element }, ctx);
    const aOutcome = scorePerspectiveAction(sectionId, { addElement: a.element }, ctx);
    if (bOutcome !== aOutcome) return bOutcome - aOutcome;
    if (b.profile.crossStrength !== a.profile.crossStrength) return b.profile.crossStrength - a.profile.crossStrength;
    if (a.distance !== b.distance) return a.distance - b.distance;
    return String(a.element).localeCompare(String(b.element));
  });
  const ranked = pool.filter((r) => Number.isFinite(scorePerspectiveAction(sectionId, { addElement: r.element }, ctx)));
  return diversifyRankedRows(ranked, { pickCount: 3 }).map(({ profile, ...rest }) => rest);
}

function perspectiveSuggestionBuckets(sectionId, grouped) {
  if (sectionId === "A") return ["upper"];
  if (sectionId === "B") return ["middle", "lower"];
  const countA = grouped?.byPerspective?.A?.length || 0;
  const countB = grouped?.byPerspective?.B?.length || 0;
  const countC = grouped?.byPerspective?.C?.length || 0;
  if (countC > 0) return [];
  if (countA > 0 && countB === 0) return ["middle", "lower"];
  if (countB > 0 && countA === 0) return ["upper"];
  return ["upper", "middle", "lower"];
}

function buildPerspectiveSuggestions(sectionId, grouped, segments, activePathIdx, ctx = {}) {
  if (typeof findNearestElementsByBucket !== "function") return [];
  const buckets = perspectiveSuggestionBuckets(sectionId, grouped);
  if (!buckets.length) return [];
  const sources = collectPerspectiveSuggestionSources(segments, activePathIdx);
  if (!sources.length) return [];
  const nearest = findNearestElementsByBucket(ctx.graph || state.graph, sources, buckets, {
    maxResults: 12,
    maxDepth: 6,
    skipAssociation: true,
  });
  return rankPerspectiveSuggestions(sectionId, nearest, ctx);
}

function sortPerspectiveCandidatesHeuristic(sectionId, candidates) {
  const rows = (candidates || []).map((c) => ({ ...c, profile: getElementLensProfile(c.element) }));
  if (sectionId === "A") {
    rows.sort((a, b) =>
      (b.profile.upperRatio - a.profile.upperRatio) ||
      (a.profile.crossStrength - b.profile.crossStrength) ||
      (a.distance - b.distance) ||
      String(a.element).localeCompare(String(b.element))
    );
  } else if (sectionId === "B") {
    rows.sort((a, b) =>
      (b.profile.infraRatio - a.profile.infraRatio) ||
      (a.profile.crossStrength - b.profile.crossStrength) ||
      (a.distance - b.distance) ||
      String(a.element).localeCompare(String(b.element))
    );
  } else {
    rows.sort((a, b) =>
      (b.profile.crossStrength - a.profile.crossStrength) ||
      (a.distance - b.distance) ||
      String(a.element).localeCompare(String(b.element))
    );
  }
  return diversifyRankedRows(rows, { pickCount: 3 }).map(({ profile, ...rest }) => rest);
}

function keepPerspectiveCandidatesThatImproveLens(sectionId, candidates, ctx = {}) {
  const out = [];
  for (const c of candidates || []) {
    if (!c?.element) continue;
    const outcome = scorePerspectiveAction(sectionId, { addElement: c.element }, ctx);
    if (!Number.isFinite(outcome)) continue;
    out.push(c);
  }
  return out;
}

function buildFallbackPerspectiveAddSuggestions(sectionId, grouped, segments, activePathIdx, ctx = {}) {
  const buckets = perspectiveSuggestionBuckets(sectionId, grouped);
  if (!buckets.length) return [];
  const selected = new Set((state.waypoints || []).map((wp) => wp?.element).filter(Boolean));
  const sources = collectPerspectiveSuggestionSources(segments, activePathIdx);
  let candidates = [];
  if (typeof findNearestElementsByBucket === "function" && sources.length) {
    candidates = findNearestElementsByBucket(ctx.graph || state.graph, sources, buckets, {
      maxResults: 24,
      maxDepth: 8,
      skipAssociation: true,
    });
  }
  candidates = candidates.filter((c) => c?.element && !selected.has(c.element));
  if (candidates.length) {
    const ranked = sortPerspectiveCandidatesHeuristic(sectionId, candidates);
    return keepPerspectiveCandidatesThatImproveLens(sectionId, ranked, ctx);
  }

  const bucketSet = new Set(buckets);
  const fromRegistry = Object.keys(ELEMENTS || {})
    .filter((name) => !selected.has(name))
    .filter((name) => !(ctx.strictAllowedElements instanceof Set) || ctx.strictAllowedElements.has(name))
    .filter((name) => bucketSet.has(getLayerBucketForPathMeta(name)))
    .map((name) => ({
      element: name,
      distance: 99,
      layer: ELEMENTS?.[name]?.layer ?? "Unknown",
      bucket: getLayerBucketForPathMeta(name),
    }));
  const fallbackRanked = sortPerspectiveCandidatesHeuristic(sectionId, fromRegistry);
  return keepPerspectiveCandidatesThatImproveLens(sectionId, fallbackRanked, ctx);
}

function conflictingBucketsForPerspective(sectionId) {
  if (sectionId === "A") return new Set(["middle", "lower"]);
  if (sectionId === "B") return new Set(["upper"]);
  return new Set();
}

function buildPerspectiveRemovalCandidates(sectionId, grouped, ctx = {}) {
  if (sectionId !== "A" && sectionId !== "B") return [];
  if ((state.waypoints || []).length <= 2) return [];
  const countC = grouped?.byPerspective?.C?.length || 0;
  // In exclusive mode, removals are most useful when mixed/cross-layer results dominate.
  // In dominant-share mode, removals can still be useful even without explicit C results.
  if (!perspectiveModeIsDominantShare() && countC === 0) return [];

  const conflicts = conflictingBucketsForPerspective(sectionId);
  if (!conflicts.size) return [];

  const out = [];
  for (let idx = 0; idx < (state.waypoints || []).length; idx++) {
    const wp = state.waypoints[idx];
    const el = wp?.element;
    if (!el) continue;
    if (state.selectionMode === "ordered" && (idx === 0 || idx === state.waypoints.length - 1)) {
      continue; // keep Start/End fixed in ordered mode
    }
    const bucket = getLayerBucketForPathMeta(el);
    if (!conflicts.has(bucket)) continue;
    const outcomeScore = scorePerspectiveAction(sectionId, { removeIndex: idx }, ctx);
    out.push({ index: idx, element: el, bucket, outcomeScore });
  }
  out.sort((a, b) => {
    const as = Number.isFinite(a.outcomeScore) ? a.outcomeScore : -Infinity;
    const bs = Number.isFinite(b.outcomeScore) ? b.outcomeScore : -Infinity;
    if (bs !== as) return bs - as;
    return String(a.element).localeCompare(String(b.element));
  });
  return diversifyRankedRows(out, { pickCount: 3, poolSize: 6 }).map(({ outcomeScore, ...rest }) => rest);
}

function addPerspectiveExplorationWaypoint() {
  const targetIdx = typeof window.addWaypoint === "function"
    ? window.addWaypoint()
    : (state.selectionMode === "set" ? state.waypoints.length - 1 : Math.max(1, state.waypoints.length - 2));
  setTimeout(() => {
    const chain = document.getElementById("waypoint-chain");
    const card = chain?.querySelector(`.waypoint-card[data-waypoint-index="${targetIdx}"]`);
    const field = card?.querySelector(".waypoint-layer-select");
    if (chain && typeof chain.scrollIntoView === "function") {
      chain.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    if (card && typeof card.scrollIntoView === "function") {
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    if (field && typeof field.focus === "function") {
      field.focus();
    }
  }, 0);
}

function normalizeWaypointLayerForElement(elementName) {
  const layer = ELEMENTS?.[elementName]?.layer || null;
  if (!layer) return null;
  return layer === "Implementation & Migration" ? "Implementation" : layer;
}

/** Match `ELEMENTS[].layer` ids (same normalization as waypoint persistence / labels). */
function canonicalLayerIdForWaypoint(layerId) {
  if (!layerId) return layerId;
  return layerId === "Implementation & Migration" ? "Implementation" : layerId;
}

function addPerspectiveSuggestedElement(elementName, { expandedScope = false } = {}) {
  const name = String(elementName || "").trim();
  if (!name) return;
  const targetLayer = normalizeWaypointLayerForElement(name);
  if (typeof window.addWaypoint !== "function") return;
  const targetIdx = window.addWaypoint();
  if (!state.waypoints[targetIdx]) return;
  state.waypoints[targetIdx].layer = targetLayer;
  state.waypoints[targetIdx].element = name;
  renderWaypointChain();
  animateWaypointCardIn(targetIdx);
  if (expandedScope) state._pathfindFullMetamodelOnce = true;
  if (state.segments) {
    window.dispatch({
      type: "FIND_PATH",
      reason: expandedScope ? "perspective-suggestion-add-expanded" : "perspective-suggestion-add",
    });
  }

  setTimeout(() => {
    const chain = document.getElementById("waypoint-chain");
    const card = chain?.querySelector(`.waypoint-card[data-waypoint-index="${targetIdx}"]`);
    const trigger = card?.querySelector(".element-trigger");
    if (card && typeof card.scrollIntoView === "function") {
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    if (trigger && typeof trigger.focus === "function") {
      trigger.focus();
    }
  }, 0);
}

function replacePerspectiveFocusPoint(removeIndex, addElementName, { expandedScope = false } = {}) {
  if (typeof removeIndex !== "number" || removeIndex < 0 || removeIndex >= state.waypoints.length) return;
  removeWaypoint(removeIndex, {
    suppressSearch: true,
    after: () => addPerspectiveSuggestedElement(addElementName, { expandedScope }),
  });
}

function buildPerspectiveSwapCandidates(sectionId, grouped, addSuggestions, ctx = {}) {
  if (sectionId !== "A" && sectionId !== "B") return [];
  const countC = grouped?.byPerspective?.C?.length || 0;
  if (countC === 0) return [];
  const removal = buildPerspectiveRemovalCandidates(sectionId, grouped, ctx);
  if (!removal.length || !addSuggestions.length) return [];

  const pairs = [];
  for (const add of addSuggestions) {
    if (!add?.element) continue;
    for (const rem of removal) {
      if (!rem?.element) continue;
      if (add.element === rem.element) continue;
      const score = scorePerspectiveAction(sectionId, {
        removeIndex: rem.index,
        addElement: add.element,
      }, ctx);
      if (!Number.isFinite(score)) continue;
      pairs.push({
        removeIndex: rem.index,
        removeElement: rem.element,
        addElement: add.element,
        score,
      });
    }
  }
  pairs.sort((a, b) => b.score - a.score || String(a.removeElement).localeCompare(String(b.removeElement)));
  return diversifyRankedRows(pairs, { pickCount: 3, poolSize: 10 }).map(({ score, ...rest }) => rest);
}

function resolvePerspectiveEmptyCta(sectionId, grouped, addSuggestions, ctx = {}) {
  const dominantMode = perspectiveModeIsDominantShare();
  const swap = buildPerspectiveSwapCandidates(sectionId, grouped, addSuggestions, ctx);
  if (swap.length && (dominantMode || sectionId === "A" || sectionId === "B")) {
    return {
      mode: "swap",
      label: "",
      lead: "To narrow this lens, replace one focus point with:",
      candidates: swap,
    };
  }

  const removal = buildPerspectiveRemovalCandidates(sectionId, grouped, ctx);
  if (removal.length && (dominantMode || sectionId === "A" || sectionId === "B")) {
    return {
      mode: "remove",
      label: "Remove one focus point to narrow this lens",
      lead: "To explore this perspective, consider removing:",
      candidates: removal,
    };
  }
  return {
    mode: "add",
    label: "",
    lead: "To explore this perspective, consider adding:",
    candidates: [],
  };
}

function createPerspectiveRecommendationContext() {
  const vpCtx = resolveViewpointSearchContext({ forceFullMetamodel: false });
  const strictViewpoint = !!vpCtx.viewpointStrict;
  const usingFullMetamodel = strictViewpoint && !!state._perspectiveSuggestFullMetamodel;
  const graph = usingFullMetamodel
    ? buildGraph({ allowedElements: null, includeDerived: state.includeDerived })
    : state.graph;
  const options = getSearchPathOptions({ forceFullMetamodel: usingFullMetamodel });
  const strictAllowedElements = usingFullMetamodel ? null : effectiveAllowedElements();
  const viewpointName =
    state.viewpoint && VIEWPOINTS?.[state.viewpoint]
      ? VIEWPOINTS[state.viewpoint].name || state.viewpoint
      : (state.viewpoint || "current viewpoint");
  return {
    strictViewpoint,
    usingFullMetamodel,
    graph,
    options,
    strictAllowedElements,
    viewpointName,
  };
}

function isElementOutsideStrictViewpoint(elementName, ctx) {
  if (!ctx?.strictViewpoint) return false;
  if (!(ctx?.strictAllowedElements instanceof Set)) return false;
  return !ctx.strictAllowedElements.has(elementName);
}

window.expandPerspectiveSuggestionsToFullMetamodel = function expandPerspectiveSuggestionsToFullMetamodel() {
  state._perspectiveSuggestFullMetamodel = true;
  scheduleRenderResults();
};

window.restorePerspectiveSuggestionsToViewpoint = function restorePerspectiveSuggestionsToViewpoint() {
  state._perspectiveSuggestFullMetamodel = false;
  scheduleRenderResults();
};

function renderPerspectiveAccordion(tabsEl, segments, activePathIdx) {
  if (!tabsEl) return { byPathIndex: {} };
  const recCtx = createPerspectiveRecommendationContext();
  if (!recCtx.strictViewpoint && state._perspectiveSuggestFullMetamodel) {
    state._perspectiveSuggestFullMetamodel = false;
  }
  const grouped = typeof clusterPaths === "function"
    ? clusterPaths(segments, getSearchPathOptions())
    : { byPerspective: { A: [], B: [], C: [] }, byPathIndex: {}, all: [] };
  const titles = getPerspectiveTitlesForDomain();
  const emptyUi = getPerspectiveEmptyUiForDomain();
  const sections = ["A", "B", "C"];
  const hasAny = grouped.all && grouped.all.length > 0;
  const activePerspective = grouped?.byPathIndex?.[String(activePathIdx)]?.perspective || null;

  tabsEl.style.display = "block";
  tabsEl.classList.add("path-tabs--perspective");
  tabsEl.innerHTML = "";

  if (!hasAny) {
    tabsEl.style.display = "none";
    return grouped;
  }

  for (const sectionId of sections) {
    const items = grouped.byPerspective?.[sectionId] || [];

    const wrap = document.createElement("details");
    wrap.className = "path-perspective";
    wrap.open = activePerspective ? sectionId === activePerspective : sectionId === "A";
    wrap.innerHTML = `
      <summary class="path-perspective-head">
        <span class="path-perspective-title">${titles[sectionId] || sectionId}</span>
        <span class="path-perspective-count">${items.length}</span>
      </summary>
    `;

    const body = document.createElement("div");
    body.className = "path-perspective-body";
    const sectionMeaning = document.createElement("p");
    sectionMeaning.className = "path-perspective-explainer";
    sectionMeaning.textContent = perspectiveSectionMeaning(sectionId);
    body.appendChild(sectionMeaning);

    if (items.length > 0) {
      for (const meta of items) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "path-perspective-item" + (meta.pathIndex === activePathIdx ? " active" : "");
        row.title = precisionTooltip(meta.precisionLabel);
        row.onclick = () => selectPath(meta.pathIndex);
        row.innerHTML = `
          <span class="path-perspective-item-main">
            <strong>Route ${meta.pathIndex + 1}</strong>
            <span class="hop-badge">${meta.hopCount} hop${meta.hopCount !== 1 ? "s" : ""}</span>
          </span>
          <span class="path-perspective-item-badges">
            <span class="path-badge ${layerBadgeClassForLabel(meta.layerLabel)}" title="${escapeHtmlAttr(layerTooltip(meta.layerLabel))}">${meta.layerLabel}</span>
            <span class="path-badge ${precisionBadgeClassForLabel(meta.precisionLabel)}" title="${escapeHtmlAttr(precisionTooltip(meta.precisionLabel))}">${meta.precisionLabel === "Executive Summary" ? "Simplified" : "Ground-Truth"}</span>
          </span>
        `;
        body.appendChild(row);
      }

      const coach = buildPerspectiveVariationCoach(sectionId, items, grouped, segments, activePathIdx, recCtx);
      if (coach) {
        const coachWrap = document.createElement("div");
        coachWrap.className = "path-perspective-coach";
        const coachText = document.createElement("p");
        coachText.className = "path-perspective-coach-text";
        coachText.textContent = coach.text;
        coachWrap.appendChild(coachText);
        if (Array.isArray(coach.actions) && coach.actions.length) {
          const actionRow = document.createElement("div");
          actionRow.className = "path-perspective-coach-actions";
          for (const a of coach.actions.slice(0, 3)) {
            if (!a?.label || typeof a?.onClick !== "function") continue;
            const coachBtn = document.createElement("button");
            coachBtn.type = "button";
            coachBtn.className = "path-perspective-coach-btn";
            coachBtn.textContent = a.label;
            coachBtn.onclick = () => a.onClick();
            actionRow.appendChild(coachBtn);
          }
          if (actionRow.childElementCount > 0) coachWrap.appendChild(actionRow);
        }
        body.appendChild(coachWrap);
      }
    } else {
      body.classList.add("path-perspective-body--empty");
      const copy = emptyUi?.[sectionId] || {};
      const primaryAddSuggestions = buildPerspectiveSuggestions(sectionId, grouped, segments, activePathIdx, recCtx);
      const action = resolvePerspectiveEmptyCta(sectionId, grouped, primaryAddSuggestions, recCtx);
      const addSuggestions =
        action.mode === "add" && primaryAddSuggestions.length === 0
          ? buildFallbackPerspectiveAddSuggestions(sectionId, grouped, segments, activePathIdx, recCtx)
          : primaryAddSuggestions;
      const hasAnyActionCandidates =
        (Array.isArray(action?.candidates) && action.candidates.length > 0) ||
        (Array.isArray(addSuggestions) && addSuggestions.length > 0);
      const viewpointBlocksLens = recCtx.strictViewpoint && !recCtx.usingFullMetamodel && !hasAnyActionCandidates;
      const alert = document.createElement("div");
      alert.className = "path-perspective-empty-alert";
      const emptyLine = document.createElement("p");
      emptyLine.className = "path-perspective-empty-copy";
      emptyLine.textContent = perspectiveEmptyIntro(sectionId, grouped, copy);
      alert.appendChild(emptyLine);
      if (viewpointBlocksLens) {
        const reason = document.createElement("p");
        reason.className = "path-perspective-empty-copy";
        reason.textContent = `No valid recommendation is available within ${recCtx.viewpointName}.`;
        alert.appendChild(reason);
      }
      if (recCtx.usingFullMetamodel) {
        const scopeNote = document.createElement("p");
        scopeNote.className = "path-perspective-empty-copy";
        scopeNote.textContent = "Showing expanded recommendations outside the current viewpoint scope.";
        alert.appendChild(scopeNote);
      }
      body.appendChild(alert);

      if (action.mode === "swap" && action.candidates.length) {
        const lead = document.createElement("p");
        lead.className = "path-perspective-suggestion-lead";
        lead.textContent = action.lead;
        body.appendChild(lead);

        const chips = document.createElement("div");
        chips.className = "path-perspective-suggestion-chips";
        for (const candidate of action.candidates) {
          const outsideStrict = isElementOutsideStrictViewpoint(candidate.addElement, recCtx);
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = "path-perspective-suggestion-chip path-perspective-suggestion-chip--swap";
          chip.title =
            `Replace ${candidate.removeElement} with ${candidate.addElement}` +
            (outsideStrict ? " (outside current viewpoint)" : "");
          chip.innerHTML = `
            <span class="path-perspective-suggestion-swap-icon" aria-hidden="true">×+</span>
            <span class="path-perspective-suggestion-text">${candidate.removeElement} → ${candidate.addElement}${outsideStrict ? " · outside scope" : ""}</span>
          `;
          chip.onclick = () =>
            withVisibleEditingControls(() =>
              replacePerspectiveFocusPoint(candidate.removeIndex, candidate.addElement, {
                expandedScope: outsideStrict && recCtx.usingFullMetamodel,
              })
            );
          chips.appendChild(chip);
        }
        body.appendChild(chips);
      } else if (action.mode === "remove" && action.candidates.length) {
        const lead = document.createElement("p");
        lead.className = "path-perspective-suggestion-lead";
        lead.textContent = action.lead;
        body.appendChild(lead);

        const chips = document.createElement("div");
        chips.className = "path-perspective-suggestion-chips";
        for (const candidate of action.candidates) {
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = "path-perspective-suggestion-chip path-perspective-suggestion-chip--remove";
          chip.title = `Remove ${candidate.element} from current focus points`;
          chip.innerHTML = `
            <span class="path-perspective-suggestion-plus" aria-hidden="true">×</span>
            <span class="path-perspective-suggestion-text">${candidate.element}</span>
          `;
          chip.querySelector(".path-perspective-suggestion-plus")?.classList.add("path-perspective-suggestion-plus--remove");
          chip.onclick = () => withVisibleEditingControls(() => removeWaypoint(candidate.index));
          chips.appendChild(chip);
        }
        body.appendChild(chips);
      } else {
        if (addSuggestions.length) {
          const lead = document.createElement("p");
          lead.className = "path-perspective-suggestion-lead";
          lead.textContent = action.lead;
          body.appendChild(lead);

          const chips = document.createElement("div");
          chips.className = "path-perspective-suggestion-chips";
          for (const suggestion of addSuggestions) {
            const outsideStrict = isElementOutsideStrictViewpoint(suggestion.element, recCtx);
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "path-perspective-suggestion-chip path-perspective-suggestion-chip--add";
            chip.title =
              `${suggestion.element} (${suggestion.layer}, ${suggestion.distance} hop${suggestion.distance !== 1 ? "s" : ""})` +
              (outsideStrict ? " — outside current viewpoint" : "");
            chip.innerHTML = `
              <span class="path-perspective-suggestion-plus" aria-hidden="true">+</span>
              <span class="path-perspective-suggestion-text">${suggestion.element}${outsideStrict ? " · outside scope" : ""}</span>
            `;
            chip.onclick = () =>
              withVisibleEditingControls(() =>
                addPerspectiveSuggestedElement(suggestion.element, { expandedScope: outsideStrict && recCtx.usingFullMetamodel })
              );
            chips.appendChild(chip);
          }
          body.appendChild(chips);
        }
      }

      const shouldShowCta = action.mode === "remove";
      if (shouldShowCta) {
        const cta = document.createElement("button");
        cta.type = "button";
        cta.className = "path-perspective-cta";
        cta.textContent = action.mode === "remove"
          ? action.label
          : (copy.cta || "Add element to explore this perspective");
        cta.onclick = () => {
          if (action.mode === "remove" && action.candidates.length) {
            withVisibleEditingControls(() => removeWaypoint(action.candidates[0].index));
            return;
          }
          withVisibleEditingControls(() => addPerspectiveExplorationWaypoint());
        };
        body.appendChild(cta);
      }

      if (viewpointBlocksLens) {
        const expandBtn = document.createElement("button");
        expandBtn.type = "button";
        expandBtn.className = "path-perspective-cta";
        expandBtn.textContent = "Expand search to full metamodel";
        expandBtn.onclick = () => window.expandPerspectiveSuggestionsToFullMetamodel?.();
        body.appendChild(expandBtn);
      } else if (recCtx.usingFullMetamodel) {
        const restoreBtn = document.createElement("button");
        restoreBtn.type = "button";
        restoreBtn.className = "path-perspective-cta";
        restoreBtn.textContent = "Back to viewpoint-scoped recommendations";
        restoreBtn.onclick = () => window.restorePerspectiveSuggestionsToViewpoint?.();
        body.appendChild(restoreBtn);
      }
    }

    wrap.appendChild(body);
    tabsEl.appendChild(wrap);
  }

  const prevHelp = document.getElementById("path-tabs-help");
  if (prevHelp) prevHelp.remove();
  const helpWrap = document.createElement("div");
  helpWrap.className = "path-tabs-help path-tabs-help--after-groups";
  helpWrap.id = "path-tabs-help";
  helpWrap.innerHTML = `<button type="button" class="path-tabs-help-link" id="path-categories-help-btn"
    aria-expanded="false" aria-controls="path-labels-modal"
    title="Open definitions for route groups and badges">What do these labels mean?</button>`;
  tabsEl.appendChild(helpWrap);

  return grouped;
}

/** Element strip + waypoint note under path tabs (wide stacked layout); path title & narrative stay in the main panel. */
function setExplanationRouteColumn(html) {
  const el = document.getElementById("explanation-route-column");
  if (!el) return;
  const s = html && String(html).trim() ? String(html) : "";
  el.innerHTML = s;
  el.hidden = !s;
}

/** One-time relax banner (blue) — only when not merged with the Association fallback warning below. */
function buildTemporaryRelaxationBanner() {
  const t = state.lastPathTemporaryRelaxation;
  if (!t || (!t.derived && !t.association)) return "";
  const parts = [];
  if (t.derived) parts.push("§5.7 derived relations");
  if (t.association) parts.push("Association fallback (§5.2.4)");
  return `<div class="path-temp-relax-banner" role="status">This route was found with a <strong>one-time</strong> relaxed run (${parts.join(" and ")}). Your saved <strong>Options</strong> (<strong>Direct vs +Derived</strong>; <strong>Semantic rigor</strong> / Association) were <strong>not</strong> changed. Use <strong>Find Path</strong> again with your saved options, or open Options if you want relaxed rules to stay on.</div>`;
}

/**
 * Banners for explanation panel: avoids duplicate Association messaging when one-shot relax
 * and penalized hops both apply — single yellow warning with spec ref + Options guidance.
 */
function buildPathResultBanners() {
  const t = state.lastPathTemporaryRelaxation;
  const hasTemp = t && (t.derived || t.association);
  const isFallback = state.lastPathIsFallback;
  const mergeAssocOneShot =
    isFallback && hasTemp && t.association;

  if (mergeAssocOneShot) {
    const parts = [];
    if (t.derived) parts.push("§5.7 derived relations");
    parts.push("Association fallback (§5.2.4)");
    return `<div class="path-fallback-banner" role="status">⚠️ <strong>Fallback path used</strong> — at least one hop uses penalized Association (§5.2.4), not a specific Appendix B relationship. This route was found with a <strong>one-time</strong> relaxed run (${parts.join(" and ")}). Your saved <strong>Options</strong> (<strong>Direct vs +Derived</strong>; <strong>Semantic rigor</strong> / Association) were <strong>not</strong> changed. Use <strong>Find Path</strong> again with your saved options, or open <strong>Options</strong> if you want relaxed rules to stay on.</div>`;
  }

  let html = "";
  if (hasTemp) html += buildTemporaryRelaxationBanner();
  if (isFallback) {
    html += `<div class="path-fallback-banner" role="status">⚠️ Fallback Path Used — at least one hop uses penalized Association (§5.2.4), not a specific Appendix B relationship.</div>`;
  }
  return html;
}

// ── Render Results ───────────────────────────────────────────────────────────

/** Snapshot open explanation accordions so a full re-render (e.g. relationship pick) does not collapse them. */
function captureExplainUiState() {
  const container = document.getElementById("explanation-content");
  if (!container) return null;
  const hops = [];
  container.querySelectorAll("details.explain-hop-justification").forEach((det) => {
    if (!det.open) return;
    const dataHop = det.querySelector("[data-hop][data-from][data-to]");
    if (!dataHop) return;
    const h = parseInt(dataHop.getAttribute("data-hop"), 10);
    if (!Number.isFinite(h)) return;
    hops.push({ hop: h });
  });
  return { hops, scrollTop: container.scrollTop };
}

function restoreExplainUiState(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.hops)) return;
  const container = document.getElementById("explanation-content");
  if (!container) return;
  for (const { hop } of snapshot.hops) {
    const el = container.querySelector(`[data-hop="${hop}"][data-from][data-to]`);
    const outer = el?.closest("details.explain-hop-justification");
    if (!outer) continue;
    outer.open = true;
  }
  requestAnimationFrame(() => {
    container.scrollTop = snapshot.scrollTop;
  });
}

/**
 * Per-hop formal metamodel disclosure ("View Formal Metamodel Logic", nested derivation, etc.) must
 * never open except when the user explicitly toggles its summary.
 * Native <details> can interact badly with nested accordions / re-renders; we handle open state manually.
 */
function wireDefinitionsRelationshipDisclosures(container) {
  if (!container) return;
  container.querySelectorAll("details.explain-details").forEach((det) => {
    det.open = false;
    const sum = det.querySelector(":scope > summary");
    if (!sum) return;
    if (!sum.dataset.defsManualToggle) {
      sum.dataset.defsManualToggle = "1";
      sum.addEventListener(
        "click",
        (e) => {
          if (!e.isTrusted) return;
          e.preventDefault();
          det.open = !det.open;
        },
        true
      );
    }
  });
}

function ensureDefinitionsRelationshipDetailsClosed(container) {
  if (!container) return;
  container.querySelectorAll("details.explain-details").forEach((d) => {
    d.open = false;
  });
}

function renderResults() {
  const segments    = state.segments;
  const pathIdx     = state.activePathIdx;
  const diagramEl   = document.getElementById('path-diagram');
  const emptyEl     = document.getElementById('diagram-empty');
  const viewportWrap = document.getElementById("diagram-viewport-wrap");
  const resultsPanel = document.getElementById("results-panel");
  const tabsEl      = document.getElementById('path-tabs');
  const explainEl   = document.getElementById('explanation-content');
  const toolsEl     = document.getElementById('diagram-tools');

  const hasResults = Array.isArray(segments);
  // Match findPath / pathfinder: empty segments[] happens when connect-set search finds no valid chain
  // ([]).some(...) is false — must treat length 0 as no path or the diagram stays blank.
  const hasNoPath =
    hasResults &&
    (segments.length === 0 || segments.some((s) => !s.paths || s.paths.length === 0));

  // Show/Hide path tools (compact/swimlanes always visible)
  if (toolsEl) {
    toolsEl.hidden = !hasResults || hasNoPath;
  }

  // Initial state (no results yet): show the "Build a path" empty panel only.
  if (!hasResults) {
    if (resultsPanel) resultsPanel.classList.add("results-panel--empty");
    state.lastPathIsFallback = false;
    state.mmLast = null;
    updateMmConnectionStrip(null);
    clearDiagram(diagramEl);
    hideDiagramNoPathOverlay();
    hidePathFailureModal();
    resetDiagramPanContext();
    resetDiagramView();
    if (emptyEl) emptyEl.style.display = "flex";
    if (tabsEl) tabsEl.style.display = "none";
    const pth = document.getElementById("path-tabs-help");
    if (pth) pth.hidden = true;
    if (explainEl) {
      explainEl.innerHTML = "Path explanation will appear here after finding a path.";
    }
    setExplanationRouteColumn("");
    if (viewportWrap) viewportWrap.hidden = true;
    updateDiagramEmptyChrome();
    return;
  }

  if (resultsPanel) resultsPanel.classList.remove("results-panel--empty");

  if (hasNoPath) {
    state.lastPathIsFallback = false;
    state.mmLast = null;
    updateMmConnectionStrip(null);
    // No-path case
    clearDiagram(diagramEl);
    emptyEl.style.display = 'none';
    updateDiagramEmptyChrome();
    tabsEl.style.display  = 'none';
    const pth = document.getElementById("path-tabs-help");
    if (pth) pth.hidden = true;
    resetDiagramPanContext();
    resetDiagramView();
    if (viewportWrap) viewportWrap.hidden = false;

    const pickedNames = state.waypoints.map((wp) => wp.element).filter(Boolean);
    const fail = getFirstFailingSegment(segments);
    const narrFrom =
      fail?.from ?? (pickedNames[0] || state.waypoints[0]?.element);
    const narrTo =
      fail?.to ??
      (pickedNames.length >= 2
        ? pickedNames[pickedNames.length - 1]
        : state.waypoints[state.waypoints.length - 1]?.element);
    const chainLabel = pickedNames.length >= 2 ? pickedNames.join(" → ") : "";
    const blockedByViewpoint = state.lastPathSearchStatus === "BLOCKED_BY_VIEWPOINT";
    const vpFailCtx = getStrictViewpointFailureContext(narrFrom, narrTo);
    const deadEndHtml =
      blockedByViewpoint && typeof renderViewpointBlockedPanel === "function"
        ? renderViewpointBlockedPanel({
            viewpointKey: state.viewpoint || null,
            viewpointName: VIEWPOINTS?.[state.viewpoint]?.name || state.viewpoint || "current",
          })
        : typeof renderNoPathEducationalPanel === "function"
        ? renderNoPathEducationalPanel(narrFrom, narrTo, {
            includeDerived: !!state.includeDerived,
            allowAssociationFallback: !!state.allowAssociationFallback,
            selectionMode: state.selectionMode === "ordered" ? "ordered" : "set",
            pickedCount: pickedNames.length,
            waypointChainLabel: state.selectionMode === "ordered" ? chainLabel : "",
            failingSegmentOrdinal: fail ? fail.index + 1 : undefined,
            segmentTotal: segments.length,
            viewpointStrict: vpFailCtx.strict,
            viewpointName: vpFailCtx.strict ? vpFailCtx.name : "",
            viewpointFromInGraph: !vpFailCtx.strict || vpFailCtx.fromInGraph,
            viewpointToInGraph: !vpFailCtx.strict || vpFailCtx.toInGraph,
          })
        : `<div class="path-dead-end path-dead-end--fallback" role="status"><div class="path-dead-end__icon-wrap" aria-hidden="true"><svg class="path-dead-end__svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" stroke-width="1.75" opacity="0.5"/><circle cx="32" cy="32" r="4" fill="currentColor" opacity="0.35"/><path d="M32 8 L36 28 L32 32 L28 28 Z" fill="currentColor" opacity="0.55"/></svg></div><p class="path-dead-end__fallback">No valid path found within the current settings.</p></div>`;
    showDiagramNoPathOverlay(deadEndHtml);
    const diagnostics =
      typeof renderPathSearchDiagnostics === "function"
        ? renderPathSearchDiagnostics(buildPathSearchReportPayload(), state.pathFailureHints)
        : typeof renderPathFailureSuggestions === "function"
          ? renderPathFailureSuggestions(state.pathFailureHints)
          : "";
    setExplanationRouteColumn("");
    explainEl.innerHTML =
      explainNoPath(narrFrom, narrTo, blockedByViewpoint ? "viewpoint" : "unknown", {
        selectionMode: state.selectionMode === "ordered" ? "ordered" : "set",
        waypointChain: pickedNames,
        failingSegmentIndex: fail?.index ?? null,
        totalSegments: segments.length,
      }) + diagnostics;

    const fromRole = ELEMENTS[narrFrom]?.metamodelRole;
    const toRole   = ELEMENTS[narrTo]?.metamodelRole;
    const fromKey  = getMetamodelBoxKey(fromRole);
    const toKey    = getMetamodelBoxKey(toRole);
    if (fromKey || toKey) {
      highlightMetamodel(fromKey, toKey, false);
    }

    const ruleKey = getAspectRuleKey(narrFrom, narrTo);
    const aspectRule = ASPECT_RULES[ruleKey];
    const layerRuleKey = getLayerRuleKey(narrFrom, narrTo);
    const layerRule = LAYER_RULES[layerRuleKey];
    const aspectOk = !aspectRule || aspectRule.valid !== false;
    const layerOk = !layerRule || layerRule.valid !== false;
    const ok = aspectOk && layerOk;

    setMetamodelStatus(`
      <div><strong>No valid path:</strong> ${narrFrom} → ${narrTo}${fail && state.selectionMode === "ordered" ? ` <span style="color:var(--text-3)">(first failing segment)</span>` : ""}</div>
      <div style="margin-top:6px">
        <span class="${ok ? 'good' : 'bad'}">${ok ? 'Metamodel allows it; the graph settings blocked it.' : 'Metamodel forbids it.'}</span>
        <span style="color:var(--text-3)"> · Aspect: ${ruleKey}${aspectRule?.label ? ` (${aspectRule.label})` : ''} · Layer: ${layerRuleKey}</span>
      </div>
      ${ok ? `<div style="margin-top:6px;color:var(--text-2)">
        This usually means: relationship set/derivation/viewpoint constraints prevented a route, even though the core aspect/layer pairing is allowed.
      </div>` : `<div style="margin-top:6px;color:var(--text-2)">
        ${!aspectOk ? `Aspect rule violation: <span class="bad">${aspectRule?.reason ?? 'Not permitted by §4.2 aspect constraints.'}</span><br>` : ''}
        ${!layerOk ? `Layer rule violation: <span class="bad">${layerRule?.reason ?? 'Not permitted by layer constraints.'}</span>` : ''}
      </div>`}
    `);

    const fk = getMetamodelBoxKey(fromRole);
    const tk = getMetamodelBoxKey(toRole);
    renderMetamodelRoleContents(fk, tk, narrFrom, narrTo);

    if (!blockedByViewpoint && state._pathFailModalShownForRunId !== state._findRunId) {
      state._pathFailModalShownForRunId = state._findRunId;
      requestAnimationFrame(() => {
        showPathFailureModal({
          narrFrom,
          narrTo,
          fail,
          chainStr: chainLabel,
          segmentCount: segments.length,
          selectionMode: state.selectionMode,
          pathHints: state.pathFailureHints,
          includeDerived: state.includeDerived,
          allowAssociationFallback: state.allowAssociationFallback,
        });
      });
    }
    return;
  }

  hideDiagramNoPathOverlay();
  hidePathFailureModal();
  if (viewportWrap) viewportWrap.hidden = false;

  sanitizeUserChoicesForActivePath();

  // Build contextual perspective groups from path alternatives.
  emptyEl.style.display = 'none';
  updateDiagramEmptyChrome();

  const clustered = renderPerspectiveAccordion(tabsEl, segments, pathIdx);
  state.pathClusters = clustered;
  const pathTabsHelpEl = document.getElementById("path-tabs-help");
  if (pathTabsHelpEl) {
    pathTabsHelpEl.hidden = tabsEl.style.display === "none";
  }
  const activePathMeta = clustered?.byPathIndex?.[String(pathIdx)] || null;

  // Render diagram
  try {
    renderPath(diagramEl, segments, {
      mode: state.mode,
      segmentPathIndex: pathIdx,
      showBadges: state.showBadges,
      pathFlow: state.pathFlow,
    });
    if (diagramPanShouldReset(segments)) resetDiagramView();
  } catch (e) {
    console.error('[NAV] renderPath failed', e);
    diagramEl.innerHTML = `<p style="color:var(--invalid);font-size:13px;padding:12px">Diagram could not be drawn. ${String(e.message || e)}</p>`;
    resetDiagramPanContext();
    resetDiagramView();
  }
  // Render explanation (connect-set routing math + UCS details at bottom — see buildConnectSetTechHtml)
  const connectSetRoutingFooter =
    state.selectionMode === "set" &&
    state.lastAutoOrdered &&
    state.lastAutoOrderResult?.length &&
    state.lastAutoOrderMetrics
      ? `<div class="explain-routing-math-footer" role="note">${buildConnectSetTechHtml(
          state.lastAutoOrderMetrics,
          segments,
          pathIdx,
          state.lastAutoOrderResult
        )}</div>`
      : "";
  const pathResultBanners = buildPathResultBanners();
  const preserveExplainUi = !!state._preserveExplainUiOnNextRender;
  state._preserveExplainUiOnNextRender = false;
  const explainUiSnapshot = preserveExplainUi && explainEl ? captureExplainUiState() : null;
  try {
    const explained = explainPath(segments, pathIdx, {
      constrained: state.selectionMode === "ordered",
      perspectiveMeta: activePathMeta,
      perspectiveTitles: getPerspectiveTitlesForDomain(),
      domainContext: state.domainContext,
      rigorPreset: state.searchRigorPreset,
    });
    setExplanationRouteColumn(explained.routeColumn);
    explainEl.innerHTML = pathResultBanners + explained.detailColumn + connectSetRoutingFooter;
  } catch (e) {
    console.error('[NAV] explainPath failed', e);
    setExplanationRouteColumn("");
    explainEl.innerHTML =
      pathResultBanners +
      `
      <div style="color:var(--invalid);padding:12px;font-size:13px">
        Error rendering explanation. Check console for details.
      </div>` +
      connectSetRoutingFooter;
  }

  // Highlight metamodel
  updateMetamodelHighlight(segments, pathIdx);
  setMetamodelStatus('Hover a hop (diagram arrow or Step N) to see what it means here.');

  // Wire explanation hover to highlight the corresponding hop everywhere.
  wireHopInteractions();
  if (explainUiSnapshot) restoreExplainUiState(explainUiSnapshot);
  ensureDefinitionsRelationshipDetailsClosed(explainEl);
}

function clearHopHighlights() {
  document.querySelectorAll('.archimate-arrow.active').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('[data-hop].explain-edge-block.active').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.explain-edge-block.active').forEach(el => el.classList.remove('active'));
}

function setMetamodelStatus(html) {
  const el = document.getElementById('metamodel-status');
  if (!el) return;
  el.innerHTML = html || 'Hover a hop (diagram arrow or Step N) to see what it means here.';
}

function isMetamodelModalOpen() {
  const m = document.getElementById('mm-modal');
  return !!m && m.getAttribute('aria-hidden') === 'false';
}

window.expandHopDetails = function expandHopDetails(hopIdx, opts = {}) {
  if (hopIdx == null || hopIdx === '') return;
  const container = document.getElementById('explanation-content');
  if (!container) return;
  const hopEl = container.querySelector(`[data-hop="${hopIdx}"]`);
  if (!hopEl) return;
  const hopOuter = hopEl.closest("details.explain-hop-justification");
  if (hopOuter) hopOuter.open = true;
  // Do not open details.explain-details (formal metamodel / definitions) here — only the user toggling
  // that summary should expand it; otherwise diagram/hop clicks feel like the glossary opens on its own.
  const block = hopEl.closest('.explain-edge-block');
  if (block && opts.scroll === true) {
    block.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
};

window.focusMetamodel = function focusMetamodel(fromEl, toEl) {
  // Called from inline explanation links (“Show on metamodel”).
  try {
    const fromKey = getMetamodelBoxKey(ELEMENTS?.[fromEl]?.metamodelRole);
    const toKey   = getMetamodelBoxKey(ELEMENTS?.[toEl]?.metamodelRole);

    const ruleKey = getAspectRuleKey(fromEl, toEl);
    const aspectRule = ASPECT_RULES?.[ruleKey];
    const layerRuleKey = getLayerRuleKey(fromEl, toEl);
    const layerRule = LAYER_RULES?.[layerRuleKey];
    const aspectOk = !aspectRule || aspectRule.valid !== false;
    const layerOk = !layerRule || layerRule.valid !== false;
    const ok = aspectOk && layerOk;

    state.mmLast = {
      fromKey,
      toKey,
      fromEl,
      toEl,
      appendixRel: "",
      valid: ok,
    };

    openMetamodelModal();

    doHighlight(fromKey, toKey, ok);
    if (typeof annotateMetamodel === 'function') {
      annotateMetamodel(fromKey, toKey, fromEl, toEl);
    }
    renderMetamodelRoleContents(fromKey, toKey, fromEl, toEl);

    const twoWayNote = metamodelInternalActiveExternalBehaviorNote(fromKey, toKey, fromEl, toEl, "");

    setMetamodelStatus(`
      <div><strong>Metamodel:</strong> ${fromEl} → ${toEl}</div>
      <div style="margin-top:6px">
        <span class="${ok ? 'good' : 'bad'}">${ok ? 'Allowed by metamodel' : 'Violates metamodel rule'}</span>
        <span style="color:var(--text-3)"> · Aspect: ${ruleKey}${aspectRule?.label ? ` (${aspectRule.label})` : ''} · Layer: ${layerRuleKey}</span>
      </div>
      ${ok ? '' : `<div style="margin-top:6px;color:var(--text-2)">
        ${!aspectOk ? `Aspect rule violation: <span class="bad">${aspectRule?.reason ?? 'Not permitted by §4.2 aspect constraints.'}</span><br>` : ''}
        ${!layerOk ? `Layer rule violation: <span class="bad">${layerRule?.reason ?? 'Not permitted by layer constraints.'}</span>` : ''}
      </div>`}
      ${twoWayNote}
    `);
  } catch (e) {
    console.warn('focusMetamodel failed', e);
  }
};

function openMetamodelModal() {
  closeElementInfoModal();
  const m = document.getElementById('mm-modal');
  if (!m) return;
  m.setAttribute('aria-hidden', 'false');
  // Lazy render (in case init ran before modal existed)
  const mm = document.getElementById('metamodel-diagram');
  if (mm && !mm.querySelector('svg')) renderMetamodelDiagram(mm);
  if (state.mmLast?.fromEl && state.mmLast?.toEl) {
    const x = state.mmLast;
    renderMetamodelRoleContents(x.fromKey, x.toKey, x.fromEl, x.toEl);
  } else {
    renderMetamodelRoleContents();
  }
}

function closeMetamodelModal() {
  const m = document.getElementById('mm-modal');
  if (!m) return;
  m.setAttribute('aria-hidden', 'true');
}

function renderMetamodelRoleContents(activeFromKey = null, activeToKey = null, activeFromEl = null, activeToEl = null) {
  const root = document.getElementById('mm-role-contents');
  if (!root) return;

  // Build role→elements index (only core metamodel boxes)
  const roles = [
    "external-behavior",
    "external-active",
    "passive",
    "internal-behavior",
    "internal-active",
    "event",
  ];
  const roleLabels = {
    "external-behavior": "External Behavior Element (Service)",
    "external-active":   "External Active Structure Element (Interface)",
    "passive":           "Passive Structure Element",
    "internal-behavior": "Internal Behavior Element",
    "internal-active":   "Internal Active Structure Element",
    "event":             "Event",
  };

  const buckets = {};
  for (const r of roles) buckets[r] = [];
  for (const [name, meta] of Object.entries(ELEMENTS || {})) {
    const key = getMetamodelBoxKey(meta?.metamodelRole);
    if (key && buckets[key]) buckets[key].push(name);
  }
  for (const r of roles) buckets[r].sort((a,b) => a.localeCompare(b));

  const hint = `
    <div style="font-size:12px;color:var(--text-2);margin-bottom:10px">
      <strong>What lives in each metamodel box:</strong>
      these are the concrete ArchiMate element types from this tool’s dataset.
    </div>`;

  const makeCard = (roleKey) => {
    const isActive = roleKey === activeFromKey || roleKey === activeToKey;
    const list = buckets[roleKey] || [];
    const highlighted = new Set([activeFromEl, activeToEl].filter(Boolean));
    const rendered = list.map(n => highlighted.has(n) ? `<code>${n}</code>` : n).join(", ");
    return `
      <div class="mm-role-card ${isActive ? "active" : ""}">
        <div class="mm-role-title">${roleLabels[roleKey] || roleKey}</div>
        <div class="mm-role-list">${rendered || `<span style="color:var(--text-3);font-style:italic">No mapped elements</span>`}</div>
      </div>`;
  };

  root.innerHTML = hint + `<div class="mm-roles-grid">
    ${roles.map(makeCard).join("\n")}
  </div>`;
}

function highlightHop(hopIdx) {
  if (!state?.segments) return;
  const flat = flattenSegments(state.segments, state.activePathIdx ?? 0);
  if (!flat || hopIdx <= 0 || hopIdx >= flat.length) return;

  // Diagram arrow highlight
  document.querySelectorAll(`[data-hop="${hopIdx}"].archimate-arrow`).forEach(el => el.classList.add('active'));
  document.querySelectorAll(`#path-diagram [data-hop="${hopIdx}"]`).forEach(el => el.classList.add('active'));

  // Explanation block highlight
  document.querySelectorAll(`#explanation-content [data-hop="${hopIdx}"]`).forEach(el => {
    const block = el.closest('.explain-edge-block');
    if (block) block.classList.add('active');
  });

  // Metamodel highlight
  // If the metamodel modal is open, we treat it as “locked” to the user’s explicit focus
  // (via the “Show on metamodel” button) and avoid hover-driven overrides.
  if (isMetamodelModalOpen()) return;
  const fromEl = flat[hopIdx - 1]?.element;
  const toEl   = flat[hopIdx]?.element;
  const fromKey = getMetamodelBoxKey(ELEMENTS[fromEl]?.metamodelRole);
  const toKey   = getMetamodelBoxKey(ELEMENTS[toEl]?.metamodelRole);
  doHighlight(fromKey, toKey, true);
  if (typeof annotateMetamodel === "function") {
    annotateMetamodel(fromKey, toKey, fromEl, toEl);
  }
  renderMetamodelRoleContents(fromKey, toKey, fromEl, toEl);

  const stepAtHop = flat[hopIdx];
  const codes = stepAtHop?.codes ?? [];
  const codeList = codes.map(c => String(c).toUpperCase());
  const multiHop = codeList.length > 1;
  const edgeCommitted =
    typeof window.edgeChoiceCommittedForHop === "function"
      ? window.edgeChoiceCommittedForHop(hopIdx, codes)
      : true;
  const primaryCodeRaw =
    multiHop && !edgeCommitted
      ? null
      : typeof window.resolvedRelationshipCodeForHop === "function"
        ? window.resolvedRelationshipCodeForHop(stepAtHop, hopIdx)
        : codeList[0] ?? null;
  const primaryCode = primaryCodeRaw != null ? String(primaryCodeRaw).toUpperCase() : null;
  const relName = primaryCode
    ? RELATIONSHIPS?.[primaryCode]?.name ?? primaryCode
    : multiHop && !edgeCommitted
      ? "Not chosen yet"
      : "Relationship";
  const dirRule = primaryCode ? RELATIONSHIP_DIRECTIONALITY?.[primaryCode] : null;

  const ruleKey = getAspectRuleKey(fromEl, toEl);
  const aspectRule = ASPECT_RULES[ruleKey];
  const layerRuleKey = getLayerRuleKey(fromEl, toEl);
  const layerRule = LAYER_RULES[layerRuleKey];
  const aspectOk = !aspectRule || aspectRule.valid !== false;
  const layerOk = !layerRule || layerRule.valid !== false;
  const ok = aspectOk && layerOk;

  state.mmLast = {
    fromKey,
    toKey,
    fromEl,
    toEl,
    appendixRel: relName,
    valid: true,
  };

  updateMmConnectionStrip({
    fromEl,
    toEl,
    fromKey,
    toKey,
    hopIdx,
    appendixRel: relName,
  });

  const twoWayNote = metamodelInternalActiveExternalBehaviorNote(fromKey, toKey, fromEl, toEl, relName);

  setMetamodelStatus(`
    <div><strong>Hop ${hopIdx}:</strong> ${fromEl} → ${toEl}</div>
    <div style="margin-top:6px">
      <span class="${ok ? 'good' : 'bad'}">${ok ? 'Allowed by metamodel' : 'Violates metamodel rule'}</span>
      <span style="color:var(--text-3)"> · Aspect: ${ruleKey}${aspectRule?.label ? ` (${aspectRule.label})` : ''} · Layer: ${layerRuleKey}</span>
    </div>
    ${multiHop && !edgeCommitted
      ? `<div style="margin-top:6px;color:var(--text-2)">
      <strong>Relationship:</strong> <span style="color:var(--text-3)">Choose in the path explanation — options: [${codeList.join(", ")}]</span>
    </div>`
      : primaryCode
        ? `<div style="margin-top:6px;color:var(--text-2)">
      <strong>Relationship:</strong> ${relName} <span style="color:var(--text-3)">[${codeList.join(", ")}]</span>
      ${dirRule?.rule ? `· <span style="color:var(--text-3)">${dirRule.rule} <cite>${dirRule.section}</cite></span>` : ""}
    </div>`
        : ""}
    ${ok ? '' : `<div style="margin-top:6px;color:var(--text-2)">
      ${!aspectOk ? `Aspect rule violation: <span class="bad">${aspectRule?.reason ?? 'Not permitted by §4.2 aspect constraints.'}</span><br>` : ''}
      ${!layerOk ? `Layer rule violation: <span class="bad">${layerRule?.reason ?? 'Not permitted by layer constraints.'}</span>` : ''}
    </div>`}
    ${twoWayNote}
  `);
}

// Expose for diagram clicks (SVG lives in ui/renderer.js).
window.highlightHop = highlightHop;
window.clearHopHighlights = clearHopHighlights;

function wireHopInteractions() {
  const container = document.getElementById('explanation-content');
  if (!container) return;

  // Delegated click handler for injected HTML buttons/links.
  if (!container.dataset.mmDelegated) {
    container.dataset.mmDelegated = '1';
    container.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('.mm-jump');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      // Prefer the hop container’s from/to (source of truth for what the user is viewing).
      // This avoids mismatches if a button’s data-* becomes stale across rerenders.
      const hopHost = btn.closest?.('[data-hop][data-from][data-to]');
      const fromHostRaw = hopHost?.getAttribute?.('data-from') ?? null;
      const toHostRaw   = hopHost?.getAttribute?.('data-to') ?? null;

      const fromRaw = fromHostRaw || btn.getAttribute('data-mm-from');
      const toRaw   = toHostRaw || btn.getAttribute('data-mm-to');
      const relRaw  = btn.getAttribute('data-mm-rel');

      const fromEl = fromRaw ? decodeURIComponent(fromRaw) : null;
      const toEl   = toRaw ? decodeURIComponent(toRaw) : null;
      if (fromEl && toEl && window.focusMetamodel) window.focusMetamodel(fromEl, toEl);
      const rel = relRaw ? decodeURIComponent(relRaw) : null;
      if (rel) {
        const status = document.getElementById('metamodel-status');
        if (status) {
          const topLine = status.querySelector('div');
          if (topLine) {
            // Replace (don’t “stick”) the relationship badge.
            topLine.querySelectorAll('.mm-rel-badge').forEach(n => n.remove());
            const span = document.createElement('span');
            span.className = 'mm-rel-badge';
            span.textContent = rel;
            topLine.appendChild(span);
          }
        }
      }
    }, true);
  }

  container.querySelectorAll('[data-hop][data-from][data-to]').forEach(el => {
    const hopIdx = Number(el.getAttribute('data-hop'));
    const block  = el.closest('.explain-edge-block');
    if (!block) return;
    block.onmouseenter = () => {
      if (isMetamodelModalOpen()) return;
      clearHopHighlights();
      highlightHop(hopIdx);
    };
    block.onmouseleave = () => {
      if (isMetamodelModalOpen()) return;
      clearHopHighlights();
      updateMetamodelHighlight(state.segments, state.activePathIdx ?? 0);
    };
    block.onclick = (e) => {
      clearHopHighlights();
      highlightHop(hopIdx);
      // Clicks on the per-hop <summary> toggle <details> natively; do not force-open afterward
      // or requestAnimationFrame(expandHopDetails) would immediately re-open and block collapse.
      const clickEl = e.target instanceof Element ? e.target : e.target?.parentElement;
      if (clickEl?.closest?.(".el-info-trigger")) return;
      if (clickEl?.closest?.("details.explain-details > summary")) return;
      if (clickEl?.closest?.("details.explain-hop-justification > summary")) return;
      requestAnimationFrame(() => {
        if (typeof window.expandHopDetails === 'function') window.expandHopDetails(hopIdx, { scroll: true });
      });
    };
  });

  if (typeof window.initExplainBadgeTips === "function") {
    window.initExplainBadgeTips();
  }

  wireDefinitionsRelationshipDisclosures(container);
}

function countHops(segments, pathIdx) {
  let total = 0;
  for (const seg of segments) {
    const path = seg.paths[pathIdx] ?? seg.paths[0];
    if (path) total += path.length - 1;
  }
  return total;
}

function selectPath(idx) {
  state.activePathIdx = idx;
  sanitizeUserChoicesForActivePath();
  window.dispatch({ type: "RENDER_RESULTS" });
  schedulePersistSession();
}

function doHighlight(fromKey, toKey, valid) {
  highlightMetamodel(fromKey, toKey, valid);
  const fillOk = "#6ee7b7";
  const strokeOk = "#047857";
  const fillBad = "#ffd4d4";
  const strokeBad = "#cc1111";
  const fillNeutral = "#ffffff";
  const strokeNeutral = "#111111";
  document.querySelectorAll('.mm-box').forEach(g => {
    const role = g.getAttribute('data-role');
    const rect = g.querySelector('rect');
    if (!rect) return;
    if (role === fromKey || role === toKey) {
      rect.setAttribute('fill',         valid ? fillOk : fillBad);
      rect.setAttribute('stroke',       valid ? strokeOk : strokeBad);
      rect.setAttribute('stroke-width', '5');
    } else {
      rect.setAttribute('fill', fillNeutral);
      rect.setAttribute('stroke', strokeNeutral);
      rect.setAttribute('stroke-width', '2');
    }
  });
}

function updateMetamodelHighlight(segments, pathIdx) {
  // While the modal is open, keep the explicit focus (don’t auto-jump back to the
  // “default” hop on mouseleave / rerender).
  if (isMetamodelModalOpen()) return;
  const flatSteps = flattenSegments(segments, pathIdx);
  if (flatSteps.length < 2) {
    state.mmLast = null;
    updateMmConnectionStrip(null);
    return;
  }

  let fromRole = null;
  let toRole   = null;
  let fromEl = null;
  let toEl = null;
  let hopIdx = 1;
  let appendixRel = "";

  // Prefer the first path hop that maps to at least one §4.2 core box. Requiring both
  // endpoints (old pk && ck) skipped hops like Business Process → Product (composite
  // has no box) and incorrectly defaulted to a later hop — e.g. Technology Collaboration.
  for (let i = 1; i < flatSteps.length; i++) {
    const prev = flatSteps[i - 1].element;
    const curr = flatSteps[i].element;
    const pr = ELEMENTS[prev]?.metamodelRole;
    const cr = ELEMENTS[curr]?.metamodelRole;
    const pk = getMetamodelBoxKey(pr);
    const ck = getMetamodelBoxKey(cr);
    if (pk || ck) {
      fromRole = pk;
      toRole = ck;
      fromEl = prev;
      toEl = curr;
      hopIdx = i;
      const stepAtHop = flatSteps[i];
      const codes = stepAtHop?.codes ?? [];
      const codeList = codes.map((c) => String(c).toUpperCase());
      const multiHop = codeList.length > 1;
      const edgeCommitted =
        typeof window.edgeChoiceCommittedForHop === "function"
          ? window.edgeChoiceCommittedForHop(i, codes)
          : true;
      const primaryCodeRaw =
        multiHop && !edgeCommitted
          ? null
          : typeof window.resolvedRelationshipCodeForHop === "function"
            ? window.resolvedRelationshipCodeForHop(stepAtHop, i)
            : codeList[0] ?? null;
      const primaryCode = primaryCodeRaw != null ? String(primaryCodeRaw).toUpperCase() : null;
      appendixRel = primaryCode ? (RELATIONSHIPS?.[primaryCode]?.name ?? primaryCode) : "";
      break;
    }
  }

  if (fromRole || toRole) {
    doHighlight(fromRole, toRole, true);
    if (fromEl && toEl) {
      if (typeof annotateMetamodel === "function") {
        annotateMetamodel(fromRole, toRole, fromEl, toEl);
      }
      renderMetamodelRoleContents(fromRole, toRole, fromEl, toEl);
      state.mmLast = {
        fromKey: fromRole,
        toKey: toRole,
        fromEl,
        toEl,
        appendixRel,
        valid: true,
      };
      updateMmConnectionStrip({
        fromEl,
        toEl,
        fromKey: fromRole,
        toKey: toRole,
        hopIdx,
        appendixRel,
      });
    }
  } else {
    highlightMetamodel();
    state.mmLast = null;
    updateMmConnectionStrip(null);
  }
}

function flattenSegments(segments, pathIdx) {
  const steps = [];
  for (let s = 0; s < segments.length; s++) {
    const path = segments[s].paths[pathIdx] ?? segments[s].paths[0];
    if (!path) continue;
    steps.push(...(s === 0 ? path : path.slice(1)));
  }
  return steps;
}

/** Drop {@code userChoices[h]} when it is not valid for the active path’s hop {@code h} (stale tab switch / session). */
function sanitizeUserChoicesForActivePath() {
  if (!state.segments?.length) return;
  if (!state.userChoices || typeof state.userChoices !== "object") return;
  const flat = flattenSegments(state.segments, state.activePathIdx ?? 0);
  const next = { ...state.userChoices };
  let changed = false;
  for (const k of Object.keys(next)) {
    const i = Number(k);
    if (!Number.isInteger(i)) continue;
    if (i < 1 || i >= flat.length) {
      delete next[k];
      changed = true;
      continue;
    }
    const step = flat[i];
    const raw = next[k];
    if (raw == null || raw === "") continue;
    const codes = step?.codes || [];
    const validPicker =
      codes.length > 1 && typeof window.relationshipPickerCodesFromMatrixCodes === "function"
        ? window.relationshipPickerCodesFromMatrixCodes(codes)
        : codes;
    if (!validPicker.some((c) => String(c).toUpperCase() === String(raw).toUpperCase())) {
      delete next[k];
      changed = true;
    }
  }
  if (changed) state.userChoices = next;
}

function showError(msg) {
  setExplanationRouteColumn("");
  document.getElementById('explanation-content').innerHTML =
    `<div style="color:var(--invalid);padding:12px;font-size:13px">Error: ${msg}</div>`;
}

// ── Boot ────────────────────────────────────────────────────────────────────

(function startUi() {
  let showWelcome;
  try {
    showWelcome = localStorage.getItem(WELCOME_LS) !== "1";
  } catch (_) {
    showWelcome = true;
  }
  if (showWelcome) {
    showWelcomeModal();
  } else {
    try {
      if (localStorage.getItem(LOCAL_PREFS_CONSENT_LS) !== "1") {
        localStorage.setItem(LOCAL_PREFS_CONSENT_LS, "1");
      }
    } catch (_) {}
    bootApp();
  }
})();

document.getElementById("feedback-form")?.addEventListener("submit", (e) => {
  e.preventDefault();
  submitFeedbackReport();
});
document.getElementById("feedback-copy-btn")?.addEventListener("click", () => {
  copyFeedbackReport();
});

// Modal close wiring (backdrop / close button / ESC)
document.addEventListener('click', (e) => {
  const el = e.target;
  if (!(el instanceof Element)) return;
  if (el.closest('[data-feedback-close="1"]')) closeFeedbackModal();
  if (el.closest('[data-el-close="1"]')) closeElementInfoModal();
  if (el.closest('[data-mm-close="1"]')) closeMetamodelModal();
  if (el.closest('[data-path-labels-close="1"]')) closePathLabelsModal();
  if (el.closest('[data-theme-splash-close="1"]')) closeThemeSplashModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const ts = document.getElementById('theme-splash-modal');
  if (ts && ts.style.display === 'flex') {
    closeThemeSplashModal();
    e.preventDefault();
    return;
  }
  const pl = document.getElementById('path-labels-modal');
  if (pl && pl.getAttribute('aria-hidden') === 'false') {
    closePathLabelsModal();
    e.preventDefault();
    return;
  }
  const sd = document.getElementById('search-depth-guide-modal');
  if (sd && sd.style.display === 'flex') {
    closeSearchDepthGuideModal();
    e.preventDefault();
    return;
  }
  const rg = document.getElementById('rigor-guide-modal');
  if (rg && rg.style.display === 'flex') {
    closeRigorGuideModal();
    e.preventDefault();
    return;
  }
  const fb = document.getElementById('feedback-modal');
  if (fb && fb.style.display === 'flex') {
    closeFeedbackModal();
    e.preventDefault();
    return;
  }
  const elM = document.getElementById('element-info-modal');
  if (elM && elM.getAttribute('aria-hidden') === 'false') {
    closeElementInfoModal();
    e.preventDefault();
    return;
  }
  closeMetamodelModal();
});

// Note: “Show on metamodel” is handled by the delegated handler wired to
// `#explanation-content` in `wireHopInteractions()`. Keeping a single handler
// prevents stale or “sticky” focus when the explanation rerenders.

// Element info chips (path explanation, element modal neighbor lists, etc.)
document.addEventListener(
  "click",
  (e) => {
    const chip = e.target?.closest?.(".el-info-trigger");
    if (!chip) return;
    e.preventDefault();
    const raw = chip.getAttribute("data-element");
    const n = raw ? decodeURIComponent(raw) : "";
    if (n && window.showElementDetails) window.showElementDetails(n);
  },
  true
);

// ── Export & UI Utilities ───────────────────────────────────────────────────

window.toggleFullScreen = function() {
  const diagramArea = document.getElementById('diagram-area');
  
  if (!document.fullscreenElement) {
    trackEvent("toggle_fullscreen", { enabled: true });
    diagramArea.requestFullscreen().catch(err => {
      console.error(`Error attempting to enable fullscreen: ${err.message}`);
    });
    // Add a temporary white background so it doesn't go transparent black in fullscreen
    diagramArea.style.backgroundColor = "var(--surface)"; 
  } else {
    trackEvent("toggle_fullscreen", { enabled: false });
    document.exitFullscreen();
    diagramArea.style.backgroundColor = ""; 
  }
};

window.downloadDiagram = function() {
  const svg = document.querySelector('#path-diagram svg');
  if (!svg) {
    alert("No diagram to download!");
    return;
  }

  trackEvent("download_diagram", {
    waypointCount: (state.waypoints || []).map((w) => w && w.element).filter(Boolean).length,
    mode: state.mode,
  });

  // Clone the SVG so we don't accidentally modify the live DOM
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  // Convert SVG node to a string
  const svgData = new XMLSerializer().serializeToString(clone);
  
  // Create a Blob and a URL for it
  const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  // Generate a dynamic filename based on the selected waypoints
  const waypoints = state.waypoints.map(w => w.element).filter(Boolean).join("_to_").replace(/\s+/g, "");
  const filename = waypoints ? `ArchiTrek_${waypoints}.svg` : "ArchiTrek_Path.svg";

  // Create a temporary link to trigger the download
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  
  document.body.appendChild(link);
  link.click();
  
  // Clean up
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};


window.toggleBadges = function() {
  state.showBadges = !state.showBadges;
  const btn = document.getElementById('btn-toggle-badges');
  if (btn) {
    btn.textContent = state.showBadges ? "Hide #" : "Show #";
    btn.title = state.showBadges ? "Hide hop numbers on arrows" : "Show hop numbers on arrows";
  }
  if (state.segments) window.dispatch({ type: "RENDER_RESULTS" });
  schedulePersistSession();
};

window.onCompositeSubsToggle = function onCompositeSubsToggle() {
  const cb = document.getElementById("toggle-composite-subs");
  const next = cb ? !!cb.checked : true;
  state.showCompositeSubs = next;
  if (state.segments) window.dispatch({ type: "RENDER_RESULTS" });
  schedulePersistSession();
};


window.setEdgeChoice = function(hopIndex, code) {
  console.log(`[DECISION] Hop ${hopIndex} set to ${code}`);
  window.state.userChoices[hopIndex] = code;
  state._preserveExplainUiOnNextRender = true;
  // Re-run render to update the diagram and explanation; accordions stay open via capture/restore.
  if (window.state.segments) {
    window.dispatch({ type: "RENDER_RESULTS" });
  }
  schedulePersistSession();
};

window.cycleEdgeChoice = function(hopIndex) {
  if (!state.segments) return;
  
  // Find the exact step data for this hop
  const flatSteps = flattenSegments(state.segments, state.activePathIdx ?? 0);
  const step = flatSteps[hopIndex];
  if (!step || !step.codes || step.codes.length <= 1) return;

  const list = step.codes;
  const raw = state.userChoices[hopIndex];
  const committed =
    raw != null &&
    raw !== "" &&
    list.some((c) => String(c).toUpperCase() === String(raw).toUpperCase());
  let currentIndex;
  if (!committed) {
    currentIndex = -1;
  } else {
    const currentChoice =
      typeof window.resolvedRelationshipCodeForHop === "function"
        ? window.resolvedRelationshipCodeForHop(step, hopIndex)
        : (state.userChoices[hopIndex] ?? step.codes[0]);
    currentIndex = step.codes.findIndex(
      (c) => String(c).toUpperCase() === String(currentChoice).toUpperCase()
    );
  }
  const nextIndex = (currentIndex + 1) % list.length;

  window.setEdgeChoice(hopIndex, list[nextIndex]);
};