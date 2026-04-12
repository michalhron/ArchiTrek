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
  /**
   * Diagram edge overlays: 0 none; 1 flip; 2 hop; 3 hop+flip; 4 rel names only;
   * 5 hop+rel; 6 flip+rel; 7 hop+flip+rel. Toolbar cycle still uses 0–4 presets.
   */
  diagramOverlayMode: 3,
  /** Show lock/unpin markers on diagram edges for user-forced directions. */
  showDiagramLockControls: false,
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
  /** When true, UCS applies exponential cognitive-load depth penalty to relationship hop weight (routing cost only). */
  searchCognitiveLoadPenalty: true,
  /** Hops 1..N use no depth exponent bump (N = grace period). */
  searchPenaltyGracePeriod: 3,
  /** Exponential base for depth penalty after grace period. */
  searchPenaltyGrowthFactor: 2.5,
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
  /**
   * Index into {@code SCENARIOS[domainContext].clusters} when the theme defines micro-clusters;
   * null when the theme has no clusters (flat labels only).
   */
  activeClusterIndex: null,
  /** Set after last successful findPath when any segment used penalized Association. */
  lastPathIsFallback: false,
  /** When last search found no path: which relaxations would help (from probePathRelaxations / probeSetRelaxations). */
  pathFailureHints: null,
  /** Last search outcome from pathfinder: ok | no_path | BLOCKED_BY_VIEWPOINT. */
  lastPathSearchStatus: null,
  /** User-imposed directional constraints between selected waypoints. */
  edgeConstraints: [],
  /** One-shot warning message set when a flip had to degrade to Association. */
  edgeConstraintWarning: null,
  /** True when direction flips changed constraints since the last path recompute. */
  pendingConstraintRecompute: false,
  /** Number of post-recompute direction flips currently pending. */
  pendingConstraintRecomputeCount: 0,
  /** Find-run id snapshot when pendingConstraintRecompute was first set. */
  pendingConstraintRecomputeSinceRunId: null,
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
  /** After at least one findPath completion that applied results (min loading delay when inputs change). */
  _findPathCompletedOnce: false,
  /** Input fingerprint from the last completed findPath (min loading duration when inputs change). */
  _lastFindPathInputKey: null,
  /** True while an async findPath run is in flight. */
  _finding: false,
  /** requestAnimationFrame gate to avoid redundant renderResults calls in one tick. */
  _renderScheduled: false,
  /** When true, next successful path diagram render resets pan/zoom (explicit only — never infer from heuristics). */
  _diagramNeedsCameraReset: false,
  /**
   * After a strict viewpoint change cleared waypoint elements while there was no valid search to re-run,
   * brief copy for the diagram empty state: { removed: string[], viewpointName, viewpointKey }.
   */
  _viewpointClearNotice: null,
};

function parseHydrationFromUrl() {
  try {
    const sp = new URLSearchParams(window.location.search || "");
    const out = {};
    const vpRaw = sp.get("viewpoint");
    if (vpRaw && VIEWPOINTS?.[normalizeViewpointKey(vpRaw)]) {
      out.viewpoint = normalizeViewpointKey(vpRaw);
    }
    const modeRaw = sp.get("mode");
    if (modeRaw === "ordered" || modeRaw === "set") {
      out.selectionMode = modeRaw;
    }
    const pathRaw = sp.get("path");
    if (pathRaw != null && pathRaw !== "") {
      const idx = Number(pathRaw);
      if (Number.isFinite(idx) && idx >= 0) out.activePathIdx = Math.floor(idx);
    }
    const hasFlowParam = sp.has("flow") || sp.has("pathFlow");
    const flowRaw = String(sp.get("flow") || sp.get("pathFlow") || "").trim().toLowerCase();
    if (hasFlowParam && (flowRaw === "horizontal" || flowRaw === "vertical" || flowRaw === "compact")) {
      out.pathFlow = flowRaw;
    }
    const hasRoutingParam = sp.has("route") || sp.has("routing");
    if (hasRoutingParam) {
      out._hasRoutingParam = true;
      const routingRaw = String(sp.get("route") || sp.get("routing") || "").trim();
      const parsedRouting = parseSharedRoutingPayload(routingRaw);
      if (parsedRouting) {
        out.edgeConstraints = parsedRouting.edgeConstraints;
        out.userChoices = parsedRouting.userChoices;
      } else {
        out.edgeConstraints = [];
        out.userChoices = {};
      }
    }
    const waypointEntries = [...sp.entries()]
      .map(([k, v]) => {
        const m = /^wp(\d+)$/i.exec(k);
        return m ? { i: Number(m[1]), v } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.i - b.i);
    if (waypointEntries.length >= 2) {
      out.waypoints = waypointEntries.map(({ i, v }) => ({
        layer: null,
        element: ELEMENTS?.[v] ? v : null,
        label: i === 0 ? "Start" : "Via",
      }));
      if (out.waypoints.length >= 2) {
        out.waypoints[out.waypoints.length - 1].label = "End";
      }
    }
    return out;
  } catch (_) {
    return {};
  }
}

function mergeInitialState(defaults, persisted, fromUrl) {
  const base = { ...(defaults || {}) };
  const p = persisted && typeof persisted === "object" ? persisted : {};
  const u = fromUrl && typeof fromUrl === "object" ? fromUrl : {};
  Object.assign(base, p);
  Object.assign(base, u);
  if (!Array.isArray(base.waypoints) || base.waypoints.length < 2) {
    base.waypoints = [{ layer: null, element: null, label: "Start" }, { layer: null, element: null, label: "End" }];
  }
  if (base.selectionMode !== "ordered" && base.selectionMode !== "set") {
    base.selectionMode = "set";
  }
  return base;
}

const __phase4PersistedState = typeof window.loadPersistedState === "function" ? window.loadPersistedState() : null;
const __phase4UrlState = parseHydrationFromUrl();
window.state = mergeInitialState(window.state, __phase4PersistedState, __phase4UrlState);
window.state.__phase4Hydrated = !!(__phase4PersistedState || Object.keys(__phase4UrlState).length);

if (typeof window.createAppStore === "function") {
  const created = window.createAppStore(window.state);
  window.store = created.store;
  window.state = created.stateProxy;
}

// Create a shortcut so the rest of this file's code doesn't break.
// In Phase 3 this points to a proxy backed by store dispatch.
const state = window.state;

/**
 * Plain snapshot from the store (not the legacy `window.state` Proxy).
 * URL sync and session snapshots must read this: passing the Proxy into helpers that
 * enumerate or stringify routing fields can recurse infinitely in the Proxy get trap.
 */
function getPlainAppState() {
  try {
    if (typeof window !== "undefined" && window.store && typeof window.store.getState === "function") {
      return window.store.getState();
    }
  } catch (_) {}
  const s = typeof window !== "undefined" ? window.state : null;
  if (s && typeof s === "object" && typeof s.__raw__ === "object" && s.__raw__ != null) {
    return s.__raw__;
  }
  return s;
}

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
      const findPathReason = typeof a.reason === "string" ? a.reason : "";
      if (findPathReason !== "edge-flip") {
        state._pendingEdgeFlipUserChoice = null;
      }
      // Preserve existing global entrypoint for onclick handlers, but pass run context via state.
      window.findPath?.({ runId: state._findRunId, reason: findPathReason });
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

window.applyEdgeConstraintFlip = function applyEdgeConstraintFlip(source, target, opts = {}) {
  const src = String(source || "").trim();
  const dst = String(target || "").trim();
  if (!src || !dst || src === dst || !window.store) return false;
  const codeOpt =
    opts &&
    opts.relationshipCode != null &&
    String(opts.relationshipCode).trim() !== ""
      ? String(opts.relationshipCode).trim().toUpperCase()
      : "";
  const hopHint = opts && Number.isFinite(Number(opts.hopIndex)) ? Math.floor(Number(opts.hopIndex)) : null;
  const before = JSON.stringify(normalizedEdgeConstraintsFromState());
  const next = window.store.dispatch("FLIP_EDGE_DIRECTION", { source: src, target: dst });
  const afterList = Array.isArray(next?.edgeConstraints) ? next.edgeConstraints : [];
  const after = JSON.stringify(afterList);
  if (before === after) {
    state._pendingEdgeFlipUserChoice = null;
    const msg = String(next?.edgeConstraintWarning || "").trim();
    if (msg) {
      state.edgeConstraintWarning = msg;
    }
    // No re-find: still redraw so warnings / diagram / explanation stay in sync (e.g. flip blocked after a bad choice).
    window.dispatch({ type: "RENDER_RESULTS" });
    return false;
  }
  /** Same as cycling a hop’s relationship: keep explanation accordions / scroll on redraw. */
  state._preserveExplainUiOnNextRender = true;
  state.pendingConstraintRecompute = true;
  state.pendingConstraintRecomputeCount = Math.max(
    1,
    Number(state.pendingConstraintRecomputeCount || 0) + 1
  );
  if (state.pendingConstraintRecomputeSinceRunId == null) {
    state.pendingConstraintRecomputeSinceRunId = state._findRunId;
  }
  state._pendingEdgeFlipUserChoice = null;
  if (codeOpt && hopHint != null && state.segments?.length) {
    const flat = flattenSegments(state.segments, state.activePathIdx ?? 0);
    const picker = pickerCodesForHopWithConstraints(flat, hopHint, afterList);
    const resolvedCode = resolvedPendingFlipChoiceForPicker(codeOpt, picker);
    if (resolvedCode) {
      window.store.dispatch("SET_USER_CHOICE", { hopIndex: hopHint, code: resolvedCode });
    }
  }
  // Strict flip UX: preserve the current route composition and only redraw direction/labels.
  window.dispatch({ type: "RENDER_RESULTS" });
  return true;
};

window.recomputePathAfterDirectionFlips = function recomputePathAfterDirectionFlips(ev) {
  if (ev) {
    ev.preventDefault();
    ev.stopPropagation();
  }
  window.dispatch({ type: "FIND_PATH", reason: "edge-flip-recompute" });
};

window.applyEdgeConstraintPinCurrent = function applyEdgeConstraintPinCurrent(source, target) {
  const src = String(source || "").trim();
  const dst = String(target || "").trim();
  if (!src || !dst || src === dst || !window.store) return false;
  const before = JSON.stringify(normalizedEdgeConstraintsFromState());
  const next = window.store.dispatch("PIN_EDGE_DIRECTION", { source: src, target: dst });
  const afterList = Array.isArray(next?.edgeConstraints) ? next.edgeConstraints : [];
  const after = JSON.stringify(afterList);
  if (before === after) {
    const msg = String(next?.edgeConstraintWarning || "").trim();
    if (msg) {
      state.edgeConstraintWarning = msg;
      window.dispatch({ type: "RENDER_RESULTS" });
    }
    return false;
  }
  state._preserveExplainUiOnNextRender = true;
  window.dispatch({ type: "FIND_PATH", reason: "edge-pin" });
  return true;
};

const SEARCH_EFFORT_MAX_STATES = {
  fast: 8000,
  balanced: 25000,
  thorough: 100000,
};

/** Default UCS hop weights (Advanced options → Hop cost tuning). */
const DEFAULT_SEARCH_PATH_WEIGHTS = Object.freeze({
  searchPathWeightDirect: 1,
  searchPathWeightDerived: 5,
  searchPathWeightAssociation: 100,
  searchPathWeightLayerSkip: 15,
  searchPathWeightViolation: 50,
  searchCognitiveLoadPenalty: true,
  searchPenaltyGracePeriod: 3,
  searchPenaltyGrowthFactor: 2.5,
});

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

function clampSearchPenaltyGracePeriod(n) {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return DEFAULT_SEARCH_PATH_WEIGHTS.searchPenaltyGracePeriod;
  return Math.max(0, Math.min(24, x));
}

function clampSearchPenaltyGrowthFactor(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return DEFAULT_SEARCH_PATH_WEIGHTS.searchPenaltyGrowthFactor;
  return Math.max(1.01, Math.min(10, x));
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

function clusterCountForScenarioKey(domainKey) {
  const k = normalizeDomainContext(domainKey);
  const sc = typeof SCENARIOS !== "undefined" && SCENARIOS ? SCENARIOS[k] : null;
  return Array.isArray(sc?.clusters) ? sc.clusters.length : 0;
}

/** Random narrative slice for themes with {@code clusters}; null when none. Does not clear label caches. */
function assignRandomClusterIndexForTheme(domainKey) {
  const n = clusterCountForScenarioKey(domainKey);
  if (n === 0) {
    state.activeClusterIndex = null;
    return;
  }
  state.activeClusterIndex = Math.floor(Math.random() * n);
}

/**
 * Effective label map for tooltips / samples: active cluster slice or flat {@code labels}.
 */
function getEffectiveScenarioLabelsObject(scenarioKey) {
  const k = normalizeDomainContext(scenarioKey);
  const sc = typeof SCENARIOS !== "undefined" && SCENARIOS ? SCENARIOS[k] : null;
  if (!sc) return {};
  const n = Array.isArray(sc.clusters) ? sc.clusters.length : 0;
  if (n > 0) {
    let idx = state.activeClusterIndex;
    if (idx == null || !Number.isFinite(Number(idx))) idx = 0;
    idx = Math.max(0, Math.min(n - 1, Math.floor(Number(idx))));
    const lb = sc.clusters[idx]?.labels;
    return lb && typeof lb === "object" ? lb : {};
  }
  return sc.labels && typeof sc.labels === "object" ? sc.labels : {};
}

function syncStoryShuffleButton() {
  const btn = document.getElementById("theme-shuffle-story-btn");
  if (!btn) return;
  const n = clusterCountForScenarioKey(state.domainContext);
  const show = n > 0;
  btn.hidden = !show;
  btn.setAttribute("aria-hidden", show ? "false" : "true");
}

/** After hydrate: ensure cluster index is valid for themes with clusters (store / URL may omit it). */
function ensureActiveClusterIndexCoherent() {
  const k = normalizeDomainContext(state.domainContext);
  const n = clusterCountForScenarioKey(k);
  if (n === 0) {
    state.activeClusterIndex = null;
    return;
  }
  if (state.activeClusterIndex == null || !Number.isFinite(Number(state.activeClusterIndex))) {
    assignRandomClusterIndexForTheme(k);
    if (typeof window.clearScenarioLabelVariantCache === "function") {
      window.clearScenarioLabelVariantCache();
    }
    return;
  }
  state.activeClusterIndex = Math.max(0, Math.min(n - 1, Math.floor(Number(state.activeClusterIndex))));
}

window.onShuffleStoryCluster = function onShuffleStoryCluster() {
  if (clusterCountForScenarioKey(state.domainContext) === 0) return;
  assignRandomClusterIndexForTheme(state.domainContext);
  if (typeof window.clearScenarioLabelVariantCache === "function") {
    window.clearScenarioLabelVariantCache();
  }
  rebuildGraph();
  updateThemeHelpUi();
  schedulePersistSession();
  if (state.segments?.length) {
    window.dispatch({ type: "RENDER_RESULTS" });
  }
};

function normalizeViewpointKey(rawViewpoint) {
  let raw = rawViewpoint == null ? "" : String(rawViewpoint).trim();
  if (raw === "physical") raw = "technology";
  if (!raw || typeof VIEWPOINTS === "undefined" || !VIEWPOINTS) return "";
  if (VIEWPOINTS[raw]) return raw;
  const lowerRaw = raw.toLowerCase();
  for (const [key, vp] of Object.entries(VIEWPOINTS)) {
    const nm = String(vp?.name || "").trim().toLowerCase();
    if (nm && nm === lowerRaw) return key;
  }
  return "";
}

function resolveViewpointSearchContext({ forceFullMetamodel = false } = {}) {
  const selectedKey = normalizeViewpointKey(state.viewpoint) || null;
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
    cognitiveLoadPenalty: state.searchCognitiveLoadPenalty !== false,
    penaltyGracePeriod: clampSearchPenaltyGracePeriod(state.searchPenaltyGracePeriod),
    penaltyGrowthFactor: clampSearchPenaltyGrowthFactor(state.searchPenaltyGrowthFactor),
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

function normalizeEdgeConstraintEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const sourceId = String(raw.sourceId ?? raw.source ?? "").trim();
  const targetId = String(raw.targetId ?? raw.target ?? "").trim();
  if (!sourceId || !targetId || sourceId === targetId) return null;
  const type = raw.type === "LOCKED_RELATIONSHIP" ? "LOCKED_RELATIONSHIP" : "FORCED_DIRECTION";
  const out = { sourceId, targetId, type };
  if (raw.requiresAssociation === true) out.requiresAssociation = true;
  return out;
}

function normalizedEdgeConstraintsFromState() {
  if (!Array.isArray(state.edgeConstraints)) return [];
  return state.edgeConstraints
    .map((entry) => normalizeEdgeConstraintEntry(entry))
    .filter(Boolean);
}

function sameUndirectedEdgePair(a, b, c, d) {
  return (a === c && b === d) || (a === d && b === c);
}

/**
 * Context-menu “flip + pick reverse row” schedules {@link state._pendingEdgeFlipUserChoice} for the
 * in-flight findPath run. If that run is superseded or aborted, drop the pending payload so a stale
 * choice cannot attach to a later path.
 */
function clearPendingEdgeFlipUserChoiceIfForRun(runId) {
  const p = state._pendingEdgeFlipUserChoice;
  if (p && Number(p.applyOnRunId) === Number(runId)) {
    state._pendingEdgeFlipUserChoice = null;
  }
}

function pickerCodesForHopWithConstraints(flatSteps, hopIndex, edgeConstraints) {
  const i = Number(hopIndex);
  if (!Array.isArray(flatSteps) || !Number.isInteger(i) || i < 1 || i >= flatSteps.length) return [];
  const step = flatSteps[i];
  const effective =
    typeof window.appendixMatrixCodesForPathHopIndex === "function"
      ? window.appendixMatrixCodesForPathHopIndex(flatSteps, i, edgeConstraints)
      : Array.isArray(step?.codes)
        ? step.codes.map((c) => String(c || "").toUpperCase()).filter(Boolean)
        : [];
  if (!effective.length) return [];
  const validPicker =
    effective.length > 1 && typeof window.relationshipPickerCodesFromMatrixCodes === "function"
      ? window.relationshipPickerCodesFromMatrixCodes(effective)
      : effective;
  return validPicker.map((c) => String(c || "").toUpperCase()).filter(Boolean);
}

/**
 * For flip-first flows, keep the user-selected reverse code when valid; if routing degrades to a single
 * allowed code (e.g. Association fallback), commit that canonical singleton instead of leaving the hop provisional.
 */
function resolvedPendingFlipChoiceForPicker(selectedCode, pickerCodes) {
  const pickers = Array.isArray(pickerCodes)
    ? pickerCodes.map((c) => String(c || "").toUpperCase()).filter(Boolean)
    : [];
  if (!pickers.length) return null;
  const selected = String(selectedCode || "").toUpperCase();
  if (selected && pickers.includes(selected)) return selected;
  if (pickers.length === 1) return pickers[0];
  return null;
}

/**
 * After an edge-flip re-find, map the chosen Appendix B letter to the hop index for the same
 * undirected element pair (connect-set reorder can shift hop indices).
 */
function applyPendingEdgeFlipUserChoiceAfterPathResolved(runId) {
  const p = state._pendingEdgeFlipUserChoice;
  if (!p || Number(p.applyOnRunId) !== Number(runId) || runId !== state._findRunId) return;
  const code = String(p.code || "").trim().toUpperCase();
  const elA = String(p.elA || "").trim();
  const elB = String(p.elB || "").trim();
  const hopHint = Number.isFinite(Number(p.hopHint)) ? Math.floor(Number(p.hopHint)) : null;
  state._pendingEdgeFlipUserChoice = null;
  if (!code || !elA || !elB || !state.segments?.length || !window.store) return;

  const flat = flattenSegments(state.segments, state.activePathIdx ?? 0);
  const ec = normalizedEdgeConstraintsFromState();
  const matches = [];
  for (let i = 1; i < flat.length; i++) {
    const prev = String(flat[i - 1]?.element || "").trim();
    const curr = String(flat[i]?.element || "").trim();
    if (!sameUndirectedEdgePair(prev, curr, elA, elB)) continue;
    const validPicker = pickerCodesForHopWithConstraints(flat, i, ec);
    const resolvedCode = resolvedPendingFlipChoiceForPicker(code, validPicker);
    if (!resolvedCode) continue;
    matches.push({ hopIndex: i, code: resolvedCode });
  }
  let chosen = null;
  if (matches.length === 1) {
    chosen = matches[0];
  } else if (matches.length > 1 && hopHint != null) {
    const exact = matches.find((m) => m.hopIndex === hopHint);
    if (exact) chosen = exact;
    else {
      chosen = matches.reduce((best, entry) =>
        Math.abs(entry.hopIndex - hopHint) < Math.abs(best.hopIndex - hopHint) ? entry : best
      );
    }
  } else if (matches.length > 1) {
    // Deterministic fallback for repeated undirected pairs when no hop hint was provided.
    chosen = matches[0];
  }
  if (chosen) {
    window.store.dispatch("SET_USER_CHOICE", { hopIndex: chosen.hopIndex, code: chosen.code });
  } else {
    console.warn("[edge-flip] pending reverse relationship could not be committed", {
      code,
      elA,
      elB,
      hopHint,
    });
  }
}

function removeEdgeConstraintPair(source, target, { reason = "edge-unpin" } = {}) {
  const src = String(source || "").trim();
  const dst = String(target || "").trim();
  if (!src || !dst || src === dst) return false;
  const beforeList = normalizedEdgeConstraintsFromState();
  const nextList = beforeList.filter(
    (c) => !sameUndirectedEdgePair(c.sourceId, c.targetId, src, dst)
  );
  if (nextList.length === beforeList.length) return false;
  if (window.store && typeof window.store.dispatch === "function") {
    window.store.dispatch("SET_EDGE_CONSTRAINTS", nextList);
  } else {
    state.edgeConstraints = nextList;
  }
  state.edgeConstraintWarning = null;
  state._preserveExplainUiOnNextRender = true;
  if (state.segments) {
    window.dispatch({ type: "FIND_PATH", reason });
  } else {
    window.dispatch({ type: "RENDER_RESULTS" });
  }
  return true;
}

window.removeEdgeConstraintPair = removeEdgeConstraintPair;

window.__validateEdgeConstraintFlip = function __validateEdgeConstraintFlip(prevDir, nextDir) {
  const from = String(nextDir?.sourceId || "").trim();
  const to = String(nextDir?.targetId || "").trim();
  if (!from || !to || from === to) {
    return { ok: false, degradedToAssociation: false, message: "Invalid edge flip request." };
  }
  const graph = state.graph;
  if (!graph || typeof segmentPaths !== "function") {
    return { ok: false, degradedToAssociation: false, message: "Path graph is not ready yet." };
  }

  const baseOptions = getSearchPathOptions({ forceFullMetamodel: false });
  const strictOptions = { ...baseOptions, allowAssociationFallback: false };
  const strictPaths = segmentPaths(graph, from, to, strictOptions);
  if (Array.isArray(strictPaths) && strictPaths.length > 0) {
    return { ok: true, degradedToAssociation: false, message: null };
  }

  const assocOptions = { ...baseOptions, allowAssociationFallback: true };
  const assocPaths = segmentPaths(graph, from, to, assocOptions);
  if (Array.isArray(assocPaths) && assocPaths.length > 0) {
    const hadStrictFallback = !!baseOptions.allowAssociationFallback;
    return {
      ok: true,
      degradedToAssociation: !hadStrictFallback,
      message: hadStrictFallback ? null : "Forced flip resulted in an Association.",
    };
  }

  return {
    ok: false,
    degradedToAssociation: false,
    message: `Cannot force ${from} → ${to} under current metamodel/viewpoint constraints.`,
  };
};

function applySearchOptionsToUI() {
  const d = document.getElementById("search-max-depth");
  const p = document.getElementById("search-max-paths");
  const e = document.getElementById("search-effort");
  const wd = document.getElementById("search-weight-direct");
  const wder = document.getElementById("search-weight-derived");
  const wa = document.getElementById("search-weight-association");
  const wls = document.getElementById("search-weight-layer-skip");
  const wv = document.getElementById("search-weight-violation");
  const cog = document.getElementById("search-cognitive-load-penalty");
  const pg = document.getElementById("search-penalty-grace-period");
  const pgr = document.getElementById("search-penalty-growth-factor");
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
  if (cog) cog.checked = state.searchCognitiveLoadPenalty !== false;
  if (pg) pg.value = String(clampSearchPenaltyGracePeriod(state.searchPenaltyGracePeriod));
  if (pgr) pgr.value = String(clampSearchPenaltyGrowthFactor(state.searchPenaltyGrowthFactor));
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
  const cog = document.getElementById("search-cognitive-load-penalty");
  const pg = document.getElementById("search-penalty-grace-period");
  const pgr = document.getElementById("search-penalty-growth-factor");
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
  if (cog) {
    if (window.store && !!cog.checked !== !!state.searchCognitiveLoadPenalty) {
      window.store.dispatch("TOGGLE_COGNITIVE_PENALTY");
    } else {
      state.searchCognitiveLoadPenalty = !!cog.checked;
    }
  }
  if (pg) state.searchPenaltyGracePeriod = clampSearchPenaltyGracePeriod(pg.value);
  if (pgr) state.searchPenaltyGrowthFactor = clampSearchPenaltyGrowthFactor(pgr.value);
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

/** Reset hop cost inputs to built-in defaults (1 / 5 / 100 / 15 / 50). */
window.restoreHopCostSearchDefaults = function restoreHopCostSearchDefaults() {
  state.searchPathWeightDirect = DEFAULT_SEARCH_PATH_WEIGHTS.searchPathWeightDirect;
  state.searchPathWeightDerived = DEFAULT_SEARCH_PATH_WEIGHTS.searchPathWeightDerived;
  state.searchPathWeightAssociation = DEFAULT_SEARCH_PATH_WEIGHTS.searchPathWeightAssociation;
  state.searchPathWeightLayerSkip = DEFAULT_SEARCH_PATH_WEIGHTS.searchPathWeightLayerSkip;
  state.searchPathWeightViolation = DEFAULT_SEARCH_PATH_WEIGHTS.searchPathWeightViolation;
  state.searchCognitiveLoadPenalty = DEFAULT_SEARCH_PATH_WEIGHTS.searchCognitiveLoadPenalty;
  state.searchPenaltyGracePeriod = DEFAULT_SEARCH_PATH_WEIGHTS.searchPenaltyGracePeriod;
  state.searchPenaltyGrowthFactor = DEFAULT_SEARCH_PATH_WEIGHTS.searchPenaltyGrowthFactor;
  applySearchOptionsToUI();
  updatePathOptionsTriggerSummary();
  schedulePersistSession();
  if (state.segments) window.dispatch({ type: "FIND_PATH", reason: "restore-hop-cost-defaults" });
};

/**
 * Reset Advanced Logic Overrides checkboxes to the active Semantic rigor preset.
 * If the main control is Custom, applies Academic defaults (strictest baseline).
 */
window.restoreAdvancedLogicOverridesDefaults = function restoreAdvancedLogicOverridesDefaults() {
  let preset = normalizeSearchRigorPreset(state.searchRigorPreset);
  if (preset === "custom") preset = "academic";
  applySearchRigorPresetToState(preset);
  state.lastPathTemporaryRelaxation = null;
  applySearchOptionsToUI();
  updatePathOptionsTriggerSummary();
  schedulePersistSession();
  if (state.segments) window.dispatch({ type: "FIND_PATH", reason: "restore-logic-overrides-defaults" });
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
  if (prev !== state.domainContext) {
    if (typeof window.clearScenarioLabelVariantCache === "function") {
      window.clearScenarioLabelVariantCache();
    }
    assignRandomClusterIndexForTheme(state.domainContext);
    rebuildGraph();
  }
  updateThemeHelpUi();
  schedulePersistSession();
  if (prev !== state.domainContext && state.segments?.length) {
    state._diagramNeedsCameraReset = true;
  }
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
    pathViolationPenalty: so.pathViolationPenalty,
    cognitiveLoadPenalty: so.cognitiveLoadPenalty !== false,
    penaltyGracePeriod: so.penaltyGracePeriod,
    penaltyGrowthFactor: so.penaltyGrowthFactor,
    searchEffort: normalizeSearchEffort(state.searchEffort),
    searchRigorPreset: normalizeSearchRigorPreset(state.searchRigorPreset),
    restrictCoreToCore: !!state.restrictCoreToCore,
    enforceGrammar: !!state.enforceGrammar,
    strictRealization: !!state.strictRealization,
    perspectiveClassMode: normalizePerspectiveClassMode(state.perspectiveClassMode),
    perspectiveDominantSharePct: clampPerspectiveDominantSharePct(state.perspectiveDominantSharePct),
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
/**
 * When {@link localStorage} writes fail (file:// quirks, private mode, quota),
 * we mirror layout prefs here so {@link readLayoutPrefs}, {@link persistLayoutPrefs},
 * and {@link applyLayoutChrome} stay consistent — otherwise the panel can re-collapse
 * on the next chrome pass because persisted "collapsed" never updates.
 */
let layoutPrefsMemoryFallback = null;

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
/** Session flag: user chose “use desktop layout” on small viewports (see boot / mobile gate). */
const MOBILE_FORCE_DESKTOP_SESSION_KEY = "architrek_force_desktop_shell";

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
  if (k === "university") return "the University";
  if (k === "f1_team") return "Formula One";
  if (k === "bored") return "Bored";
  return k;
}

function buildThemeSplashHtml(domainContext) {
  const k = normalizeDomainContext(domainContext);
  const name = themeDisplayName(domainContext);
  const isAbstract = k === "abstract";
  const sc = typeof SCENARIOS !== "undefined" ? SCENARIOS[k] : null;
  const rawLines = sc?.splashLines;

  let scenarioHtml = "";
  if (!isAbstract && Array.isArray(rawLines) && rawLines.length) {
    const L0 = String(rawLines[0] ?? "").trim();
    const L1 = String(rawLines[1] ?? "").trim();
    if (L0 || L1) {
      scenarioHtml = `
    <div class="theme-splash-scenario" role="region" aria-labelledby="theme-splash-scenario-h">
      <h3 class="theme-splash-scenario-kicker" id="theme-splash-scenario-h">What this theme is</h3>
      ${L0 ? `<p class="theme-splash-scenario-line theme-splash-scenario-line--primary">${escapeHtml(L0)}</p>` : ""}
      ${L1 ? `<p class="theme-splash-scenario-line theme-splash-scenario-line--secondary">${escapeHtml(L1)}</p>` : ""}
    </div>`;
    }
  }

  const lead = isAbstract
    ? `This is the default theme: the app uses neutral labels in explanations.`
    : `Only <strong>labels and flavor text</strong> use this scenario; search, viewpoints, and relationship validity stay ArchiMate-correct.`;
  const introHtml = scenarioHtml
    ? `<p class="theme-splash-meta">${lead}</p>`
    : `<p class="theme-splash-intro"><strong>Welcome to ${escapeHtml(name)}.</strong> ${lead}</p>`;

  const tip = isAbstract
    ? `Path alternatives are grouped into three route types: <strong>upper-only</strong> (Motivation, Strategy, Business), <strong>infrastructure-only</strong> (Application and/or Technology and Implementation), and <strong>cross-layer</strong> (mixing those bands). Element chips and steps use standard ArchiMate names unless another control relabels them.`
    : `ArchiMate relationships are defined in the spec, but it can be <strong>tedious</strong> to search the tables and verify what connects to what. Even when tools help you draw links, it’s not always obvious which chains are allowed — this glossary helps you interpret the route groups and badges the app uses to organize alternatives.`;
  const noteTitle = isAbstract ? "Tip" : "Why the glossary is here";
  const glossary =
    typeof buildPathLabelsModalHtml === "function"
      ? buildPathLabelsModalHtml()
      : `<p class="theme-splash-note-p">Glossary is unavailable (UI not initialized yet).</p>`;
  return `
    ${scenarioHtml}
    ${introHtml}
    <div class="theme-splash-note">
      <div class="theme-splash-note-title">${noteTitle}</div>
      <p class="theme-splash-note-p">${tip}</p>
    </div>
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
let urlSyncSuspend = false;
let urlSyncLast = "";
let urlSyncBootstrapped = false;
/** Debounce store-driven URL updates so we do not call history.replaceState on every transient dispatch. */
let urlSyncStoreDebounceTimer = null;
const URL_SYNC_FROM_STORE_MS = 320;
const SHARE_ROUTE_PARAM = "route";
const SHARE_ROUTE_LEGACY_PARAM = "routing";
const SHARE_FLOW_PARAM = "flow";
const SHARE_FLOW_LEGACY_PARAM = "pathFlow";
const SHARE_URL_SOFT_LIMIT = 1900;
window.SHARE_URL_SOFT_LIMIT = SHARE_URL_SOFT_LIMIT;

function encodeSharePayloadBase64Url(jsonText) {
  if (typeof jsonText !== "string" || !jsonText) return "";
  try {
    const bytes = new TextEncoder().encode(jsonText);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  } catch (_) {
    return "";
  }
}

function decodeSharePayloadBase64Url(payload) {
  const raw = String(payload || "").trim();
  if (!raw) return "";
  try {
    const padded = raw + "=".repeat((4 - (raw.length % 4 || 4)) % 4);
    const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch (_) {
    return "";
  }
}

function normalizeUserChoicesForShare(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  const entries = Object.entries(raw);
  for (const [k, v] of entries) {
    const idx = Number(k);
    if (!Number.isFinite(idx) || idx < 1) continue;
    const code = String(v || "").trim().toUpperCase();
    if (!code) continue;
    out[String(Math.floor(idx))] = code;
  }
  return out;
}

function buildSharedRoutingPayload(currentState) {
  const edgeConstraints = Array.isArray(currentState?.edgeConstraints)
    ? currentState.edgeConstraints.map((entry) => normalizeEdgeConstraintEntry(entry)).filter(Boolean)
    : [];
  const userChoices = normalizeUserChoicesForShare(currentState?.userChoices);
  if (!edgeConstraints.length && !Object.keys(userChoices).length) return "";
  const payload = {};
  if (edgeConstraints.length) payload.ec = edgeConstraints;
  if (Object.keys(userChoices).length) payload.uc = userChoices;
  try {
    const json = JSON.stringify(payload);
    return encodeSharePayloadBase64Url(json);
  } catch (_) {
    return "";
  }
}

function parseSharedRoutingPayload(rawPayload) {
  const raw = String(rawPayload || "").trim();
  if (!raw) return null;
  let parsed = null;
  try {
    const candidate = raw.startsWith("{") ? raw : decodeSharePayloadBase64Url(raw);
    if (!candidate) return null;
    parsed = JSON.parse(candidate);
  } catch (_) {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const edgeConstraints = Array.isArray(parsed.ec)
    ? parsed.ec.map((entry) => normalizeEdgeConstraintEntry(entry)).filter(Boolean)
    : [];
  const userChoices = normalizeUserChoicesForShare(parsed.uc);
  return { edgeConstraints, userChoices };
}

function shareUrlHasSoftLengthWarning(url) {
  return typeof url === "string" && url.length > SHARE_URL_SOFT_LIMIT;
}

function stateToSearchParams(currentState) {
  const params = new URLSearchParams(window.location.search || "");
  params.delete("viewpoint");
  params.delete("mode");
  params.delete("path");
  params.delete(SHARE_FLOW_PARAM);
  params.delete(SHARE_FLOW_LEGACY_PARAM);
  params.delete(SHARE_ROUTE_PARAM);
  params.delete(SHARE_ROUTE_LEGACY_PARAM);
  [...params.keys()].forEach((k) => {
    if (/^wp\d+$/i.test(k)) params.delete(k);
  });

  if (currentState?.viewpoint) params.set("viewpoint", String(currentState.viewpoint));
  if (currentState?.selectionMode === "ordered" || currentState?.selectionMode === "set") {
    params.set("mode", currentState.selectionMode);
  }
  if (Number.isFinite(currentState?.activePathIdx) && currentState.activePathIdx > 0) {
    params.set("path", String(Math.floor(currentState.activePathIdx)));
  }
  const waypointElements = (currentState?.waypoints || [])
    .map((w) => w?.element)
    .filter((el) => typeof el === "string" && el.trim() !== "");
  waypointElements.forEach((el, idx) => params.set(`wp${idx}`, el));
  const flow = String(currentState?.pathFlow || "").trim().toLowerCase();
  if (flow && flow !== "horizontal" && PATH_FLOW_ORDER.includes(flow)) {
    params.set(SHARE_FLOW_PARAM, flow);
  }
  const routingPayload = buildSharedRoutingPayload(currentState);
  if (routingPayload) params.set(SHARE_ROUTE_PARAM, routingPayload);
  return params;
}

/** Full URL (including origin) that restores the current diagram route via query params. */
function getShareableDiagramUrl() {
  const params = stateToSearchParams(getPlainAppState());
  const u = new URL(window.location.href);
  u.search = params.toString();
  const nextUrl = u.toString();
  window.__lastShareUrlWarning = shareUrlHasSoftLengthWarning(nextUrl);
  if (window.__lastShareUrlWarning) {
    console.warn("[share-link] URL may be too long for some apps", {
      length: nextUrl.length,
      softLimit: SHARE_URL_SOFT_LIMIT,
    });
  }
  return nextUrl;
}

window.getShareableDiagramUrl = getShareableDiagramUrl;

function syncUrlFromState(opts = {}) {
  if (urlSyncStoreDebounceTimer) {
    clearTimeout(urlSyncStoreDebounceTimer);
    urlSyncStoreDebounceTimer = null;
  }
  if (urlSyncSuspend) return;
  const push = !!opts.push;
  const params = stateToSearchParams(getPlainAppState());
  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash || ""}`;
  if (nextUrl === urlSyncLast || nextUrl === `${window.location.pathname}${window.location.search}${window.location.hash || ""}`) {
    urlSyncLast = nextUrl;
    return;
  }
  if (push) window.history.pushState({ architrek: true }, "", nextUrl);
  else window.history.replaceState({ architrek: true }, "", nextUrl);
  urlSyncLast = nextUrl;
}

function applyUrlStateFromLocation({ triggerFindPath = false } = {}) {
  const route = parseHydrationFromUrl();
  const hasRoute = !!(
    route.viewpoint ||
    route.selectionMode ||
    Number.isFinite(route.activePathIdx) ||
    route.pathFlow ||
    (Array.isArray(route.waypoints) && route.waypoints.length >= 2) ||
    (Array.isArray(route.edgeConstraints) && route.edgeConstraints.length > 0) ||
    (route.userChoices && Object.keys(route.userChoices).length > 0)
  );
  if (!hasRoute) return false;
  urlSyncSuspend = true;
  try {
    if (route.selectionMode) setSelectionMode(route.selectionMode);
    if (route.viewpoint) {
      const vpSel = document.getElementById("viewpoint-select");
      if (vpSel) {
        vpSel.value = route.viewpoint;
        onViewpointChange();
      }
    }
    if (Array.isArray(route.waypoints) && route.waypoints.length >= 2) {
      state.waypoints = route.waypoints.map((wp, i, arr) => ({
        layer: migrateLegacyLayerId(wp.layer ?? null),
        element: wp.element ?? null,
        label: i === 0 ? "Start" : i === arr.length - 1 ? "End" : "Via",
      }));
      renderWaypointChain();
      updateQuickExamplesVisibility();
      checkReady();
    }
    if (Number.isFinite(route.activePathIdx)) {
      state.activePathIdx = Math.max(0, Math.floor(route.activePathIdx));
    }
    if (route.pathFlow === "horizontal" || route.pathFlow === "vertical" || route.pathFlow === "compact") {
      state.pathFlow = route.pathFlow;
      try {
        localStorage.setItem(getPathFlowStorageKey(), route.pathFlow);
      } catch (_) {}
      updatePathFlowButton();
    }
    if (route._hasRoutingParam) {
      const nextConstraints = Array.isArray(route.edgeConstraints) ? route.edgeConstraints : [];
      if (window.store && typeof window.store.dispatch === "function") {
        window.store.dispatch("SET_EDGE_CONSTRAINTS", nextConstraints);
      } else {
        state.edgeConstraints = nextConstraints.map((entry) => normalizeEdgeConstraintEntry(entry)).filter(Boolean);
      }
    }
    const routeUserChoices =
      route._hasRoutingParam && route.userChoices && typeof route.userChoices === "object"
        ? normalizeUserChoicesForShare(route.userChoices)
        : {};
    const pendingExtras = {};
    if (route._hasRoutingParam) {
      state.userChoices = { ...routeUserChoices };
      if (Object.keys(routeUserChoices).length) {
        pendingExtras.userChoices = routeUserChoices;
      }
    }
    if (Number.isFinite(route.activePathIdx)) {
      pendingExtras.activePathIdx = Math.max(0, Math.floor(route.activePathIdx));
    }
    if (triggerFindPath) {
      const picked = state.waypoints.map((wp) => wp.element).filter(Boolean);
      if (picked.length >= 2) {
        if (Object.keys(pendingExtras).length) {
          window.__pendingSessionExtras = pendingExtras;
        }
        window.dispatch({ type: "FIND_PATH", reason: "url-popstate" });
      }
    }
    syncUrlFromState({ push: false });
    return true;
  } finally {
    urlSyncSuspend = false;
  }
}

function initUrlSync() {
  if (urlSyncBootstrapped) return;
  urlSyncBootstrapped = true;
  window.addEventListener("popstate", () => {
    applyUrlStateFromLocation({ triggerFindPath: true });
  });
  if (window.store && typeof window.store.subscribe === "function") {
    window.store.subscribe(
      (s) =>
        JSON.stringify({
          viewpoint: s?.viewpoint ?? null,
          mode: s?.selectionMode ?? "set",
          path: s?.activePathIdx ?? 0,
          waypoints: (s?.waypoints || []).map((w) => w?.element || null),
          flow: s?.pathFlow ?? "horizontal",
          edgeConstraints: Array.isArray(s?.edgeConstraints)
            ? s.edgeConstraints.map((entry) => normalizeEdgeConstraintEntry(entry)).filter(Boolean)
            : [],
          userChoices: normalizeUserChoicesForShare(s?.userChoices),
        }),
      () => {
        if (urlSyncStoreDebounceTimer) clearTimeout(urlSyncStoreDebounceTimer);
        urlSyncStoreDebounceTimer = window.setTimeout(() => {
          urlSyncStoreDebounceTimer = null;
          syncUrlFromState({ push: false });
        }, URL_SYNC_FROM_STORE_MS);
      }
    );
  }
  syncUrlFromState({ push: false });
}

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

function clampDiagramOverlayMode(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 3;
  return Math.max(0, Math.min(7, n));
}

function diagramOverlayShowsHop(mode) {
  const m = clampDiagramOverlayMode(mode);
  return m === 2 || m === 3 || m === 5 || m === 7;
}

function diagramOverlayShowsFlip(mode) {
  const m = clampDiagramOverlayMode(mode);
  return m === 1 || m === 3 || m === 6 || m === 7;
}

/** True when “Relationship names on arrows” should drive label text (modes 4–7). */
function diagramOverlayShowsRelNames(mode) {
  const m = clampDiagramOverlayMode(mode);
  return m >= 4 && m <= 7;
}

/** Maps session overlay mode to checkbox triple (hop / flip / relationship names). */
function overlayChecksFromMode(mode) {
  const m = clampDiagramOverlayMode(mode);
  switch (m) {
    case 0:
      return { hop: false, flip: false, relOnly: false };
    case 1:
      return { hop: false, flip: true, relOnly: false };
    case 2:
      return { hop: true, flip: false, relOnly: false };
    case 3:
      return { hop: true, flip: true, relOnly: false };
    case 4:
      return { hop: false, flip: false, relOnly: true };
    case 5:
      return { hop: true, flip: false, relOnly: true };
    case 6:
      return { hop: false, flip: true, relOnly: true };
    case 7:
      return { hop: true, flip: true, relOnly: true };
    default:
      return { hop: true, flip: true, relOnly: false };
  }
}

function overlayModeFromChecks(hop, flip, relOnly) {
  const h = !!hop;
  const f = !!flip;
  const r = !!relOnly;
  if (!h && !f && !r) return 0;
  if (h && f && r) return 7;
  if (h && f && !r) return 3;
  if (h && !f && r) return 5;
  if (h && !f && !r) return 2;
  if (!h && f && r) return 6;
  if (!h && f && !r) return 1;
  if (!h && !f && r) return 4;
  return 0;
}

function gatherSessionSnapshot() {
  const plain = getPlainAppState();
  const vpSel = document.getElementById("viewpoint-select");
  const viewpoint = vpSel && vpSel.value ? vpSel.value : "";
  const domainSideSel = document.getElementById("domain-context-select");
  const domainTopSel = document.getElementById("domain-context-top-select");
  const domainContext = normalizeDomainContext(
    domainSideSel?.value || domainTopSel?.value || plain.domainContext
  );
  const wps = (plain.waypoints || []).map((wp) => ({
    layer: wp?.layer ?? null,
    element: wp?.element ?? null,
    label: wp?.label ?? "Point",
  }));
  let hadPath = false;
  if (plain.segments && plain.segments.length) {
    hadPath = !plain.segments.some((s) => !s.paths || s.paths.length === 0);
  }
  const overlayMode = clampDiagramOverlayMode(
    plain.diagramOverlayMode != null
      ? plain.diagramOverlayMode
      : plain.showBadges === false
        ? 0
        : 3
  );
  return {
    v: SESSION_SNAPSHOT_VERSION,
    includeDerived: !!plain.includeDerived,
    selectionMode: plain.selectionMode === "ordered" ? "ordered" : "set",
    mode: plain.mode === "swimlane" ? "swimlane" : "compact",
    pathFlow: PATH_FLOW_ORDER.includes(plain.pathFlow) ? plain.pathFlow : "horizontal",
    diagramOverlayMode: overlayMode,
    showDiagramLockControls: plain.showDiagramLockControls !== false,
    showBadges: overlayMode !== 0,
    showCompositeSubs: plain.showCompositeSubs !== false,
    forceShowQuickExamples: !!plain.forceShowQuickExamples,
    domainContext,
    activeClusterIndex:
      typeof plain.activeClusterIndex === "number" && Number.isFinite(plain.activeClusterIndex)
        ? plain.activeClusterIndex
        : null,
    viewpoint: viewpoint || null,
    waypoints: wps,
    hadPath,
    activePathIdx: plain.activePathIdx ?? 0,
    userChoices: plain.userChoices && typeof plain.userChoices === "object" ? { ...plain.userChoices } : {},
    searchMaxDepth: clampSearchDepth(plain.searchMaxDepth),
    searchMaxPaths: clampSearchMaxPaths(plain.searchMaxPaths),
    searchEffort: normalizeSearchEffort(plain.searchEffort),
    searchPathWeightDirect: clampSearchPathWeight(plain.searchPathWeightDirect, 1),
    searchPathWeightDerived: clampSearchPathWeight(plain.searchPathWeightDerived, 5),
    searchPathWeightAssociation: clampSearchPathWeight(plain.searchPathWeightAssociation, 100),
    searchPathWeightLayerSkip: clampSearchPathWeight(plain.searchPathWeightLayerSkip, 15),
    searchPathWeightViolation: clampSearchPathWeight(plain.searchPathWeightViolation, 50),
    searchCognitiveLoadPenalty: plain.searchCognitiveLoadPenalty !== false,
    searchPenaltyGracePeriod: clampSearchPenaltyGracePeriod(plain.searchPenaltyGracePeriod),
    searchPenaltyGrowthFactor: clampSearchPenaltyGrowthFactor(plain.searchPenaltyGrowthFactor),
    searchRigorPreset: normalizeSearchRigorPreset(plain.searchRigorPreset),
    restrictCoreToCore: !!plain.restrictCoreToCore,
    enforceGrammar: !!plain.enforceGrammar,
    strictRealization: !!plain.strictRealization,
    perspectiveClassMode: normalizePerspectiveClassMode(plain.perspectiveClassMode),
    perspectiveDominantSharePct: clampPerspectiveDominantSharePct(plain.perspectiveDominantSharePct),
    allowAssociationFallback: !!plain.allowAssociationFallback,
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
  if (element) layer = migrateLegacyLayerId(ELEMENTS[element].layer || null);
  else layer = migrateLegacyLayerId(layer);
  return {
    layer,
    element,
    label: typeof wp.label === "string" ? wp.label : "Point",
  };
}

function restoreSessionSnapshot() {
  try {
    if (state.__phase4Hydrated) return;
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
    if (typeof data.activeClusterIndex === "number" && Number.isFinite(data.activeClusterIndex)) {
      const n = clusterCountForScenarioKey(state.domainContext);
      if (n > 0) {
        state.activeClusterIndex = Math.max(
          0,
          Math.min(n - 1, Math.floor(data.activeClusterIndex))
        );
      } else {
        state.activeClusterIndex = null;
      }
    } else {
      assignRandomClusterIndexForTheme(state.domainContext);
    }
    if (typeof window.clearScenarioLabelVariantCache === "function") {
      window.clearScenarioLabelVariantCache();
    }
    updateThemeHelpUi();

    if (data.pathFlow === "horizontal" || data.pathFlow === "vertical" || data.pathFlow === "compact") {
      state.pathFlow = data.pathFlow;
      try {
        localStorage.setItem(getPathFlowStorageKey(), data.pathFlow);
      } catch (_) {}
      updatePathFlowButton();
    }

    if (typeof data.diagramOverlayMode === "number" && Number.isFinite(data.diagramOverlayMode)) {
      state.diagramOverlayMode = clampDiagramOverlayMode(data.diagramOverlayMode);
      syncDiagramOverlayButton();
    } else if (typeof data.showBadges === "boolean") {
      state.diagramOverlayMode = data.showBadges ? 3 : 0;
      syncDiagramOverlayButton();
    }
    if (typeof data.showDiagramLockControls === "boolean") {
      state.showDiagramLockControls = data.showDiagramLockControls;
      syncDiagramOptionsFormFromState();
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
    if (typeof data.searchCognitiveLoadPenalty === "boolean") {
      state.searchCognitiveLoadPenalty = data.searchCognitiveLoadPenalty;
    }
    if (typeof data.searchPenaltyGracePeriod === "number" && Number.isFinite(data.searchPenaltyGracePeriod)) {
      state.searchPenaltyGracePeriod = clampSearchPenaltyGracePeriod(data.searchPenaltyGracePeriod);
    }
    if (typeof data.searchPenaltyGrowthFactor === "number" && Number.isFinite(data.searchPenaltyGrowthFactor)) {
      state.searchPenaltyGrowthFactor = clampSearchPenaltyGrowthFactor(data.searchPenaltyGrowthFactor);
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
      const key =
        data.viewpoint == null || data.viewpoint === ""
          ? ""
          : normalizeViewpointKey(data.viewpoint);
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

window.resetToDefaults = function resetToDefaults() {
  const ok = window.confirm("Reset all saved settings and start fresh?");
  if (!ok) return;
  try {
    window.store?.dispatch("RESET_TO_DEFAULTS");
  } catch (_) {}
  try {
    if (typeof window.clearPersistedState === "function") window.clearPersistedState();
    localStorage.removeItem(SESSION_SNAPSHOT_LS);
  } catch (_) {}
  const clean = `${window.location.pathname}${window.location.hash || ""}`;
  window.history.replaceState(null, "", clean);
  window.location.reload();
};

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

/**
 * True when the user has at least one alternative path to review (diagram + explanation).
 * `state.segments` may be `[]` or hold segments with empty `paths` after a failed search — those
 * must not block opening the control panel on boot (truthy [] used to skip auto-open incorrectly).
 */
function hasReviewablePathResults() {
  const s = state.segments;
  if (s == null || !Array.isArray(s) || s.length === 0) return false;
  return s.some((seg) => seg && Array.isArray(seg.paths) && seg.paths.length > 0);
}

/**
 * Collapsed control chrome hides path controls (top: slide-up drawer; sidebar: slide-left strip)
 * with pointer-events: none on the shell. Open the panel when there is nothing to
 * review yet so waypoints / quick examples / Add element stay reachable without hunting for
 * header "Edit path".
 */
function openPathPanelIfCollapsedForBoot() {
  const root = document.getElementById("app-layout");
  if (!root?.classList.contains("panel-collapsed")) return;
  if (hasReviewablePathResults()) return;
  const top = root.classList.contains("layout-top");
  const sidebar = root.classList.contains("layout-sidebar");
  if (!top && !sidebar) return;
  try {
    openEditPathControls();
  } catch (_) {
    /* ignore */
  }
}

/** Deferred pass so URL + session restore (after init) can settle before we decide. */
function scheduleOpenPathPanelIfCollapsedForBoot() {
  window.setTimeout(() => {
    openPathPanelIfCollapsedForBoot();
  }, 0);
  window.setTimeout(() => {
    openPathPanelIfCollapsedForBoot();
  }, 250);
}

function bootApp() {
  init();
  initUrlSync();
  applyUrlStateFromLocation({ triggerFindPath: false });
  restoreSessionSnapshot();
  ensureActiveClusterIndexCoherent();
  syncStoryShuffleButton();
  syncDiagramOverlayButton();
  if (window.store && typeof window.store.clearUndoHistory === "function") {
    window.store.clearUndoHistory();
  }
  openPathPanelIfCollapsedForBoot();
  scheduleOpenPathPanelIfCollapsedForBoot();
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
  if (layoutPrefsMemoryFallback) {
    return { ...layoutPrefsMemoryFallback };
  }
  try {
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
  } catch (_) {
    return { mode: "top", width: 280, topH: 200, collapsed: true };
  }
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

window.buildDomainContextOptions = buildDomainContextOptions;

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
  updateThemeHelpUi();
}

/**
 * @param {string} scenarioKey
 * @param {number} limit
 * @returns {string[]}
 */
function sampleThemedElementExamples(scenarioKey, limit = 5) {
  const labels = getEffectiveScenarioLabelsObject(scenarioKey);
  const keys = Object.keys(labels);
  const out = [];
  for (let i = 0; i < keys.length && out.length < limit; i++) {
    const el = keys[i];
    const raw = labels[el];
    const phrase = Array.isArray(raw) ? raw[0] : raw;
    if (phrase) out.push(`${el} → ${phrase}`);
  }
  return out;
}

function copyViewpointSelectOptionsToHeader() {
  const main = document.getElementById("viewpoint-select");
  const head = document.getElementById("header-viewpoint-select");
  if (!main || !head) return;
  const v = main.value;
  head.replaceChildren();
  for (const n of main.childNodes) {
    head.appendChild(n.cloneNode(true));
  }
  head.value = v;
}

/**
 * Hover content for the header viewpoint control: same DOM pattern as path element chips /
 * hop summary endpoints — .step-el-tip-kicker / title / meta / .step-el-tip-row--scenario / foot.
 */
function appendHeaderViewpointScenarioRow(inner, label, value) {
  if (!value) return;
  const row = document.createElement("span");
  row.className = "step-el-tip-row step-el-tip-row--scenario";
  const lab = document.createElement("span");
  lab.className = "step-el-tip-muted";
  lab.textContent = label;
  row.appendChild(lab);
  row.appendChild(document.createTextNode(" "));
  const val = document.createElement("span");
  val.className = "header-viewpoint-tip-value";
  val.textContent = value;
  row.appendChild(val);
  inner.appendChild(row);
}

function renderHeaderViewpointTipInner(viewpointKey) {
  const inner = document.getElementById("header-viewpoint-tip-inner");
  if (!inner) return;
  inner.replaceChildren();

  const k = viewpointKey != null ? String(viewpointKey).trim() : "";

  const kicker = document.createElement("span");
  kicker.className = "step-el-tip-kicker";
  kicker.textContent = "ArchiMate viewpoint";
  inner.appendChild(kicker);

  if (!k) {
    const title = document.createElement("span");
    title.className = "step-el-tip-title";
    title.textContent = "Full metamodel";
    inner.appendChild(title);
    const meta = document.createElement("span");
    meta.className = "step-el-tip-meta";
    meta.textContent = "No Appendix C filter · All element types";
    inner.appendChild(meta);
    appendHeaderViewpointScenarioRow(
      inner,
      "Effect",
      "Every core element type is available in the pickers and on the graph; nothing is greyed out."
    );
    const foot = document.createElement("span");
    foot.className = "step-el-tip-foot";
    foot.textContent = "More settings: Edit path → Options in the panel";
    inner.appendChild(foot);
    return;
  }

  const vp = typeof VIEWPOINTS !== "undefined" ? VIEWPOINTS[k] : null;
  if (!vp) {
    const title = document.createElement("span");
    title.className = "step-el-tip-title";
    title.textContent = "Unknown viewpoint";
    inner.appendChild(title);
    const foot = document.createElement("span");
    foot.className = "step-el-tip-foot";
    foot.textContent = "More settings: Edit path → Options in the panel";
    inner.appendChild(foot);
    return;
  }

  const title = document.createElement("span");
  title.className = "step-el-tip-title";
  title.textContent = vp.name || k;
  inner.appendChild(title);

  const metaParts = [vp.category, vp.section].filter(Boolean);
  if (metaParts.length) {
    const meta = document.createElement("span");
    meta.className = "step-el-tip-meta";
    meta.textContent = metaParts.join(" · ");
    inner.appendChild(meta);
  }

  appendHeaderViewpointScenarioRow(inner, "Scope", vp.scope);
  appendHeaderViewpointScenarioRow(inner, "Stakeholders", vp.stakeholders);
  appendHeaderViewpointScenarioRow(inner, "Concerns", vp.concerns);
  appendHeaderViewpointScenarioRow(inner, "Typical use", vp.purpose);

  if (vp.allElements) {
    appendHeaderViewpointScenarioRow(
      inner,
      "Palette",
      "All element types — no restriction (same as full metamodel)."
    );
  } else {
    const els = Array.isArray(vp.elements) ? vp.elements : [];
    appendHeaderViewpointScenarioRow(
      inner,
      "Palette",
      `${els.length} element type(s) allowed in this viewpoint.`
    );
    const preview = els.slice(0, 14).join(", ");
    if (preview) {
      const pal = document.createElement("p");
      pal.className = "header-viewpoint-tip-palette";
      pal.textContent = preview + (els.length > 14 ? ` … +${els.length - 14} more` : "");
      inner.appendChild(pal);
    }
    let rel =
      "Appendix B matrix plus your Explicit / +Inferred and Semantic rigor settings.";
    if (typeof getViewpointRelationshipAllowance === "function") {
      const codes = getViewpointRelationshipAllowance(k);
      if (codes && codes.size) {
        rel = `Codes limited to: ${Array.from(codes).sort().join(", ")}.`;
      }
    }
    appendHeaderViewpointScenarioRow(inner, "Relationships", rel);
  }

  const foot = document.createElement("span");
  foot.className = "step-el-tip-foot";
  foot.textContent = "More settings: Edit path → Options in the panel";
  inner.appendChild(foot);
}

/** Resolve theme key for header / panel theme help (prefer live selects; avoid proxy edge cases). */
function domainContextKeyForThemeHelp() {
  const top = document.getElementById("domain-context-top-select");
  const side = document.getElementById("domain-context-select");
  let fb = "abstract";
  try {
    if (window.store && typeof window.store.getState === "function") {
      const s = window.store.getState();
      if (s && s.domainContext != null) fb = s.domainContext;
    }
  } catch (_) {}
  return normalizeDomainContext(top?.value || side?.value || fb);
}

/** Hover content for the header theme control (same structure as the viewpoint card). */
function renderHeaderThemeTipInner(domainKey) {
  const inner = document.getElementById("header-theme-tip-inner");
  if (!inner) return;

  const k = normalizeDomainContext(domainKey);
  const sc = typeof SCENARIOS !== "undefined" ? SCENARIOS[k] : null;
  const frag = document.createDocumentFragment();

  const kicker = document.createElement("span");
  kicker.className = "step-el-tip-kicker";
  kicker.textContent = "Story theme";
  frag.appendChild(kicker);

  if (!sc) {
    const title = document.createElement("span");
    title.className = "step-el-tip-title";
    title.textContent = "Unknown theme";
    frag.appendChild(title);
    const foot = document.createElement("span");
    foot.className = "step-el-tip-foot";
    foot.textContent = "Pick a theme from the list.";
    frag.appendChild(foot);
    inner.replaceChildren(frag);
    return;
  }

  const title = document.createElement("span");
  title.className = "step-el-tip-title";
  title.textContent = String(sc.label || k).trim() || k;
  frag.appendChild(title);

  const metaParts = [];
  if (sc.name) metaParts.push(sc.name);
  metaParts.push(k === "abstract" ? "Neutral labels · Default" : "Thematic labels · Same rules");
  const meta = document.createElement("span");
  meta.className = "step-el-tip-meta";
  meta.textContent = metaParts.join(" · ");
  frag.appendChild(meta);

  if (k === "abstract") {
    appendHeaderViewpointScenarioRow(
      frag,
      "Route groups",
      "Upper-only (Motivation, Strategy, Business); infrastructure-only (Application & Technology & Implementation); cross-layer (mixes both). Standard ArchiMate element names unless relabeled."
    );
  } else {
    appendHeaderViewpointScenarioRow(
      frag,
      "What changes",
      "Display names and path flavor text use this scenario’s vocabulary. Search, viewpoints, and validity stay ArchiMate-correct."
    );
  }

  const pt = sc.perspectiveTitles;
  if (pt && typeof pt === "object") {
    const line = ["A", "B", "C"]
      .map((id) => (pt[id] ? `${id}: ${pt[id]}` : ""))
      .filter(Boolean)
      .join(" ");
    if (line) appendHeaderViewpointScenarioRow(frag, "Perspective titles", line);
  }

  const nLabels = Object.keys(getEffectiveScenarioLabelsObject(k)).length;
  const examples = sampleThemedElementExamples(k, 5);
  if (examples.length) {
    const more = nLabels > examples.length ? ` · +${nLabels - examples.length} more types` : "";
    appendHeaderViewpointScenarioRow(frag, "Sample relabels", `${examples.join("; ")}${more}`);
  } else if (k === "abstract") {
    appendHeaderViewpointScenarioRow(
      frag,
      "Themed labels",
      "None in Abstract — choose a story theme to see alternate names on elements."
    );
  }

  appendHeaderViewpointScenarioRow(
    frag,
    "Welcome panel",
    "The first time you pick a story theme, a short intro may open with the full label glossary."
  );

  const foot = document.createElement("span");
  foot.className = "step-el-tip-foot";
  foot.textContent = "Theme is also under Edit path → Options.";
  frag.appendChild(foot);

  inner.replaceChildren(frag);
}

let headerViewpointHoverWired = false;
let headerThemeHoverWired = false;

const HEADER_CHROME_HOVERCARD_OPEN = "header-chrome-hovercard--open";

function mountHeaderChromeHovercardTip(tip) {
  const layer = document.getElementById("header-chrome-tip-layer");
  if (!layer || !tip) return;
  if (tip.parentElement !== layer) layer.appendChild(tip);
}

function restoreHeaderChromeHovercardTip(tip, shell) {
  if (!tip || !shell) return;
  if (tip.parentElement !== shell) shell.appendChild(tip);
}

function isHeaderChromeHovercardPointerActive(shell, tip) {
  return (
    shell.matches(":hover") ||
    shell.matches(":focus-within") ||
    tip.matches(":hover") ||
    tip.matches(":focus-within")
  );
}

/**
 * Viewpoint/theme hovercards are reparented into #header-chrome-tip-layer so they are not trapped
 * under .app-header’s stacking context (z-index 100) while .selector-panel-wrap uses 102.
 * @param {HTMLElement} shell
 * @param {HTMLElement} tip
 * @param {{ onOpen?: () => void, position: () => void, clearPosition: () => void }} opts
 */
function wireHeaderChromeHovercardCore(shell, tip, opts) {
  const { onOpen, position, clearPosition } = opts;
  let hideTimer = null;
  let viewportCleanup = null;

  const detachViewportListeners = () => {
    if (viewportCleanup) {
      viewportCleanup();
      viewportCleanup = null;
    }
  };

  const cancelHide = () => {
    if (hideTimer != null) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  };

  const hide = () => {
    cancelHide();
    detachViewportListeners();
    tip.classList.remove(HEADER_CHROME_HOVERCARD_OPEN);
    tip.setAttribute("aria-hidden", "true");
    clearPosition();
    restoreHeaderChromeHovercardTip(tip, shell);
  };

  const scheduleHide = () => {
    if (shell?.dataset?.headerRichMenuOpen === "1") return;
    cancelHide();
    hideTimer = window.setTimeout(() => {
      hideTimer = null;
      if (shell?.dataset?.headerRichMenuOpen === "1") return;
      if (isHeaderChromeHovercardPointerActive(shell, tip)) return;
      hide();
    }, 50);
  };

  const show = () => {
    if (shell?.dataset?.headerRichMenuOpen === "1") return;
    cancelHide();
    if (onOpen) {
      try {
        onOpen();
      } catch (e) {
        console.warn("header chrome hovercard onOpen", e);
      }
    }
    mountHeaderChromeHovercardTip(tip);
    tip.classList.add(HEADER_CHROME_HOVERCARD_OPEN);
    tip.setAttribute("aria-hidden", "false");
    position();
    requestAnimationFrame(() => position());
    detachViewportListeners();
    const onMove = () => position();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    viewportCleanup = () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  };

  shell._architrekHeaderHoverShow = show;
  shell._architrekHeaderHoverHide = hide;
  shell._architrekHeaderHoverCancelHide = cancelHide;

  shell.addEventListener("pointerenter", show);
  shell.addEventListener("pointerleave", scheduleHide);
  shell.addEventListener("focusin", show);
  shell.addEventListener("focusout", (e) => {
    const r = e.relatedTarget;
    if (r && (shell.contains(r) || tip.contains(r))) return;
    scheduleHide();
  });
  tip.addEventListener("pointerenter", cancelHide);
  tip.addEventListener("pointerleave", scheduleHide);
  tip.addEventListener("focusin", cancelHide);
  tip.addEventListener("focusout", (e) => {
    const r = e.relatedTarget;
    if (r && (shell.contains(r) || tip.contains(r))) return;
    scheduleHide();
  });
}

/**
 * Fixed-position hovercard under a header chrome shell (viewpoint / theme).
 * @param {HTMLElement | null} shell
 * @param {HTMLElement | null} tip
 * @param {string} aboveClass toggled when flipped above the anchor
 */
function positionHeaderChromeHovercard(shell, tip, aboveClass) {
  if (!shell || !tip || !aboveClass) return;

  const padding = 12;
  const gap = 6;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const availableH = Math.max(160, vh - 2 * padding);
  const r = shell.getBoundingClientRect();

  tip.style.position = "fixed";
  tip.style.maxHeight = `${Math.min(420, availableH)}px`;
  /* Generic .step-el-tip uses bottom:+ — must clear or fixed + top fight bottom and the card vanishes. */
  tip.style.bottom = "auto";
  tip.style.right = "auto";
  tip.style.left = "";
  tip.style.top = "";
  tip.style.transform = "";

  const centerX = r.left + r.width / 2;
  let top = r.bottom + gap;
  tip.style.left = `${centerX}px`;
  tip.style.top = `${top}px`;
  tip.style.transform = "translateX(-50%)";

  let pr = tip.getBoundingClientRect();
  let leftAdj = 0;
  if (pr.left < padding) leftAdj = padding - pr.left;
  if (pr.right > vw - padding) leftAdj = vw - padding - pr.right;
  if (leftAdj !== 0) {
    tip.style.left = `${centerX + leftAdj}px`;
    pr = tip.getBoundingClientRect();
  }

  let flipped = false;
  if (pr.bottom > vh - padding) {
    const aboveTop = r.top - gap - pr.height;
    if (aboveTop >= padding) {
      top = aboveTop;
      flipped = true;
    } else {
      top = Math.max(padding, vh - padding - pr.height);
    }
    tip.style.top = `${top}px`;
    pr = tip.getBoundingClientRect();
  }

  if (pr.top < padding) {
    tip.style.top = `${padding}px`;
    pr = tip.getBoundingClientRect();
  }
  if (pr.bottom > vh - padding) {
    tip.style.top = `${Math.max(padding, vh - padding - pr.height)}px`;
  }

  tip.classList.toggle(aboveClass, flipped);
}

function clearHeaderChromeHovercardPosition(tip, aboveClass) {
  if (!tip) return;
  if (aboveClass) tip.classList.remove(aboveClass);
  tip.style.position = "";
  tip.style.left = "";
  tip.style.top = "";
  tip.style.right = "";
  tip.style.bottom = "";
  tip.style.transform = "";
  tip.style.maxHeight = "";
}

/** Keeps the header viewpoint card on-screen (same idea as {@link fitPickerPopoverInViewport}). */
function positionHeaderViewpointHovercard() {
  positionHeaderChromeHovercard(
    document.getElementById("header-viewpoint-shell"),
    document.getElementById("header-viewpoint-hovercard"),
    "header-viewpoint-step-tip--above"
  );
}

function positionHeaderThemeHovercard() {
  positionHeaderChromeHovercard(
    document.getElementById("header-theme-shell"),
    document.getElementById("header-theme-hovercard"),
    "header-theme-step-tip--above"
  );
}

function clearHeaderViewpointHovercardPosition() {
  clearHeaderChromeHovercardPosition(
    document.getElementById("header-viewpoint-hovercard"),
    "header-viewpoint-step-tip--above"
  );
}

function clearHeaderThemeHovercardPosition() {
  clearHeaderChromeHovercardPosition(
    document.getElementById("header-theme-hovercard"),
    "header-theme-step-tip--above"
  );
}

function wireHeaderViewpointHovercardPositioning() {
  if (headerViewpointHoverWired) return;
  const shell = document.getElementById("header-viewpoint-shell");
  const tip = document.getElementById("header-viewpoint-hovercard");
  if (!shell || !tip) return;
  headerViewpointHoverWired = true;
  wireHeaderChromeHovercardCore(shell, tip, {
    position: positionHeaderViewpointHovercard,
    clearPosition: clearHeaderViewpointHovercardPosition,
  });
}

function wireHeaderThemeHovercardPositioning() {
  if (headerThemeHoverWired) return;
  const shell = document.getElementById("header-theme-shell");
  const tip = document.getElementById("header-theme-hovercard");
  if (!shell || !tip) return;
  headerThemeHoverWired = true;
  wireHeaderChromeHovercardCore(shell, tip, {
    onOpen() {
      renderHeaderThemeTipInner(domainContextKeyForThemeHelp());
    },
    position: positionHeaderThemeHovercard,
    clearPosition: clearHeaderThemeHovercardPosition,
  });
}

function updateThemeHelpUi() {
  const top = document.getElementById("domain-context-top-select");
  const side = document.getElementById("domain-context-select");
  const key = domainContextKeyForThemeHelp();
  /* No native title — avoids double tooltips with the header hover card. */
  if (top) top.removeAttribute("title");
  if (side) side.removeAttribute("title");
  syncStoryShuffleButton();
  renderHeaderThemeTipInner(key);
  try {
    const shell = document.getElementById("header-theme-shell");
    if (shell && shell.matches(":hover, :focus-within")) {
      positionHeaderThemeHovercard();
      requestAnimationFrame(() => positionHeaderThemeHovercard());
    }
  } catch (_) {
    /* ignore */
  }
  try {
    if (typeof window.refreshHeaderThemeRichSelectUI === "function") {
      window.refreshHeaderThemeRichSelectUI();
    }
  } catch (_) {
    /* ignore */
  }
}

function updateViewpointHelpUi() {
  const main = document.getElementById("viewpoint-select");
  const head = document.getElementById("header-viewpoint-select");
  const key = main ? String(main.value || "").trim() : "";
  /* No native title — avoids double tooltips with the header hover card. */
  if (main) main.removeAttribute("title");
  if (head) head.removeAttribute("title");
  renderHeaderViewpointTipInner(key);
  try {
    const shell = document.getElementById("header-viewpoint-shell");
    if (shell && shell.matches(":hover, :focus-within")) {
      positionHeaderViewpointHovercard();
      requestAnimationFrame(() => positionHeaderViewpointHovercard());
    }
  } catch (_) {
    /* ignore */
  }
  try {
    if (typeof window.refreshHeaderViewpointRichSelectUI === "function") {
      window.refreshHeaderViewpointRichSelectUI();
    }
  } catch (_) {
    /* ignore */
  }
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
  const rel = state.includeDerived ? "+ Inferred" : "Explicit";
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

/**
 * @param {HTMLElement} anchorEl
 * @param {{ scrollIntoViewSelector?: string, focusSelector?: string }|undefined} [opts]
 */
function openPathOptionsOverlay(anchorEl, opts) {
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
  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "picker-close";
  resetBtn.textContent = "Reset defaults";
  resetBtn.onclick = () => window.resetToDefaults?.();
  header.appendChild(resetBtn);
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

  const scrollSel = opts?.scrollIntoViewSelector ? String(opts.scrollIntoViewSelector).trim() : "";
  const focusSel = opts?.focusSelector ? String(opts.focusSelector).trim() : "";

  requestAnimationFrame(() => {
    fitPickerPopoverInViewport(anchorEl, pop);
    requestAnimationFrame(() => {
      fitPickerPopoverInViewport(anchorEl, pop);
      try {
        if (scrollSel) {
          const t = document.querySelector(scrollSel);
          if (t && typeof t.scrollIntoView === "function") {
            t.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }
        }
        if (focusSel) {
          const f = document.querySelector(focusSel);
          if (f && typeof f.focus === "function") f.focus({ preventScroll: true });
        }
      } catch (_) {
        /* scroll/focus are best-effort */
      }
    });
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
  if (trigger.dataset.architrekPathChromeClickBound === "1") return;
  trigger.dataset.architrekPathChromeClickBound = "1";
  trigger.addEventListener("click", () => openPathChromeOverlay(trigger));
}

function initPathOptionsOverlay() {
  const trigger = document.getElementById("path-options-trigger");
  if (trigger && trigger.dataset.architrekPathOptionsClickBound !== "1") {
    trigger.dataset.architrekPathOptionsClickBound = "1";
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

  if (collapseBtn) {
    collapseBtn.hidden = collapsed || mode === "top";
    collapseBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
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
  if (panelWrap) {
    if (mode === "top" || mode === "sidebar") {
      panelWrap.setAttribute("aria-hidden", collapsed ? "true" : "false");
    } else {
      panelWrap.removeAttribute("aria-hidden");
    }
    /* Keep panel slide controlled by CSS (.panel-collapsed), not leftover inline styles. */
    panelWrap.style.removeProperty("transform");
    panelWrap.style.removeProperty("pointer-events");
    const slide = panelWrap.querySelector(".selector-panel-slide");
    if (slide) {
      slide.style.removeProperty("transform");
      slide.style.removeProperty("pointer-events");
    }
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
  try {
    localStorage.setItem(LAYOUT_LS.mode, next.mode);
    localStorage.setItem(LAYOUT_LS.width, String(next.width));
    localStorage.setItem(LAYOUT_LS.topH, String(next.topH));
    localStorage.setItem(LAYOUT_LS.collapsed, next.collapsed ? "1" : "0");
    layoutPrefsMemoryFallback = null;
  } catch (_) {
    layoutPrefsMemoryFallback = next;
  }
  applyLayoutChrome();
}

/**
 * Top layout: primary pointer-down outside the path panel closes it.
 * Stop propagation only on the backdrop so the same pointerdown can still reach #diagram-pan-viewport and arm pan.
 */
function dismissPathPanelFromOutsidePointerIfNeeded(e) {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  const root = document.getElementById("app-layout");
  if (!root?.classList.contains("layout-top") || root.classList.contains("panel-collapsed")) return;

  let t = e.target;
  if (t && t.nodeType === Node.TEXT_NODE) t = t.parentElement;
  if (!(t instanceof Element)) return;

  if (
    t.closest("#results-split-resize") ||
    t.closest("#panel-resize-v") ||
    t.closest("#panel-resize-h")
  ) {
    return;
  }
  if (t.closest(".app-header")) return;
  const panel = document.getElementById("selector-panel-wrap");
  if (panel?.contains(t)) return;
  if (
    document.getElementById("path-options-overlay")?.classList.contains("open") ||
    document.getElementById("path-chrome-overlay")?.classList.contains("open") ||
    document.getElementById("picker-overlay")?.classList.contains("open")
  ) {
    return;
  }

  try {
    closePathChromeOverlay?.();
    closePathOptionsOverlay?.();
    teardownPickerOverlay?.();
  } catch (_) {}
  try {
    persistLayoutPrefs({ collapsed: true });
  } catch (_) {
    try {
      localStorage.setItem(LAYOUT_LS.collapsed, "1");
    } catch (_) {}
    const bd = document.getElementById("top-drawer-backdrop");
    root.classList.add("panel-collapsed");
    if (bd) {
      bd.hidden = true;
      bd.setAttribute("aria-hidden", "true");
    }
    applyLayoutChrome();
  }

  if (t.closest("#top-drawer-backdrop")) {
    e.stopPropagation();
  }
}

(function wirePathPanelOutsideDismiss() {
  if (document.documentElement.dataset.architrekPathPanelDismissBound === "1") return;
  document.documentElement.dataset.architrekPathPanelDismissBound = "1";
  document.addEventListener("pointerdown", dismissPathPanelFromOutsidePointerIfNeeded, true);
})();

function openEditPathControls() {
  try {
    closePathChromeOverlay?.();
    closePathOptionsOverlay?.();
    teardownPickerOverlay?.();
  } catch (_) {}
  const root = document.getElementById("app-layout");
  const panelWrap = document.getElementById("selector-panel-wrap");
  const headerShowBtn = document.getElementById("btn-header-show-controls");
  const backdrop = document.getElementById("top-drawer-backdrop");
  if (root) root.classList.remove("panel-collapsed");
  if (panelWrap) {
    panelWrap.removeAttribute("aria-hidden");
  }
  if (headerShowBtn) headerShowBtn.setAttribute("aria-expanded", "true");
  if (backdrop && root?.classList.contains("layout-top")) {
    backdrop.hidden = false;
    backdrop.setAttribute("aria-hidden", "false");
  }
  try {
    persistLayoutPrefs({ collapsed: false });
  } catch (_) {
    // localStorage can fail in privacy-restricted contexts; keep UI open anyway.
  }
  requestAnimationFrame(() => {
    const trigger = document.getElementById("path-options-trigger");
    if (trigger) {
      try {
        trigger.scrollIntoView({ block: "nearest", behavior: "smooth" });
        trigger.focus({ preventScroll: true });
      } catch (_) {}
    }
  });
}

/** Header “Edit path”: open when collapsed, close when open (top drawer uses CSS transform transition). */
function toggleEditPathControls() {
  const { collapsed } = readLayoutPrefs();
  if (collapsed) {
    openEditPathControls();
    return;
  }
  try {
    closePathChromeOverlay?.();
    closePathOptionsOverlay?.();
    teardownPickerOverlay?.();
  } catch (_) {}
  try {
    persistLayoutPrefs({ collapsed: true });
  } catch (_) {
    const root = document.getElementById("app-layout");
    if (root) root.classList.add("panel-collapsed");
    const bd = document.getElementById("top-drawer-backdrop");
    if (bd) {
      bd.hidden = true;
      bd.setAttribute("aria-hidden", "true");
    }
    applyLayoutChrome();
  }
}

window.openEditPathControls = openEditPathControls;
window.toggleEditPathControls = toggleEditPathControls;

/**
 * When the control panel is collapsed (default top layout), waypoint DOM updates happen off-screen
 * and the drawer has pointer-events: none — quick examples / Add element feel broken. Match
 * showQuickExamplesPanel + startEditingFromEmpty: open the panel before changing waypoints.
 */
function ensurePathControlsVisibleUnlessAlreadyOpen() {
  const root = document.getElementById("app-layout");
  const prefs = readLayoutPrefs();
  if (prefs?.collapsed || root?.classList.contains("panel-collapsed")) {
    openEditPathControls();
    return true;
  }
  return false;
}

/** Wire early: if boot/init throws later in this file, code below startUi() would never run. */
(function wireHeaderEditPathButton() {
  const btn = document.getElementById("btn-header-show-controls");
  if (!btn || btn.dataset.architrekEditPathBound === "1") return;
  btn.dataset.architrekEditPathBound = "1";
  btn.addEventListener(
    "click",
    (e) => {
      e.preventDefault();
      try {
        toggleEditPathControls();
      } catch (err) {
        console.error("[ArchiTrek] Edit path control failed:", err);
      }
    },
    { capture: true }
  );
})();

/** Center tab under header (top layout, collapsed): same boot gap as header — initLayoutChrome may not have run yet. */
(function wirePanelRevealButton() {
  const btn = document.getElementById("panel-reveal-btn");
  if (!btn || btn.dataset.architrekPanelRevealBound === "1") return;
  btn.dataset.architrekPanelRevealBound = "1";
  btn.addEventListener(
    "click",
    (e) => {
      e.preventDefault();
      try {
        openEditPathControls();
      } catch (err) {
        console.error("[ArchiTrek] Panel reveal failed:", err);
      }
    },
    { capture: true }
  );
})();

/* Same boot gap as header: init() may not run (welcome first) or may throw before initPathOptionsOverlay. */
initPathOptionsOverlay();
initPathChromeCollapsible();

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
  const root = document.getElementById("app-layout");
  const prefs = readLayoutPrefs();
  // Match openEditPathControls: update the DOM first so the drawer opens even when
  // localStorage throws (private mode / quota). Prefs alone can desync from the class.
  if (prefs?.collapsed || root?.classList.contains("panel-collapsed")) {
    openEditPathControls();
  }
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
  if (!root) return;

  function startVerticalResize(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (root.classList.contains("panel-collapsed")) return;
    if (!root.classList.contains("layout-sidebar")) return;
    e.preventDefault();
    const el = v;
    if (el && typeof el.setPointerCapture === "function") {
      try {
        el.setPointerCapture(e.pointerId);
      } catch (_) {}
    }
    const startX = e.clientX;
    const startW =
      parseFloat(getComputedStyle(root).getPropertyValue("--panel-width")) || 280;
    function move(ev) {
      const dx = ev.clientX - startX;
      let nw = Math.round(startW + dx);
      nw = Math.max(PANEL_W_MIN, Math.min(PANEL_W_MAX, nw));
      root.style.setProperty("--panel-width", `${nw}px`);
    }
    function up(ev) {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
      if (el && typeof el.releasePointerCapture === "function" && ev?.pointerId != null) {
        try {
          if (el.hasPointerCapture?.(ev.pointerId)) el.releasePointerCapture(ev.pointerId);
        } catch (_) {}
      }
      const nw = Math.round(
        parseFloat(getComputedStyle(root).getPropertyValue("--panel-width")) || 280
      );
      localStorage.setItem(LAYOUT_LS.width, String(nw));
    }
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
  }

  function startHorizontalResize(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (root.classList.contains("panel-collapsed")) return;
    if (!root.classList.contains("layout-top")) return;
    e.preventDefault();
    const el = h;
    if (el && typeof el.setPointerCapture === "function") {
      try {
        el.setPointerCapture(e.pointerId);
      } catch (_) {}
    }
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
    function up(ev) {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
      if (el && typeof el.releasePointerCapture === "function" && ev?.pointerId != null) {
        try {
          if (el.hasPointerCapture?.(ev.pointerId)) el.releasePointerCapture(ev.pointerId);
        } catch (_) {}
      }
      const nh = Math.round(
        parseFloat(getComputedStyle(root).getPropertyValue("--panel-top-height")) || 200
      );
      localStorage.setItem(LAYOUT_LS.topH, String(nh));
    }
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
  }

  if (v) v.addEventListener("pointerdown", startVerticalResize, true);
  if (h) h.addEventListener("pointerdown", startHorizontalResize, true);

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

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (root.classList.contains("panel-collapsed")) return;
    if (!root.classList.contains("layout-top") && !root.classList.contains("layout-sidebar")) return;
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

function syncDiagramOptionsFormFromState() {
  const flow = PATH_FLOW_ORDER.includes(state.pathFlow) ? state.pathFlow : "horizontal";
  const radio = document.querySelector(`input[name="diagram-path-flow"][value="${flow}"]`);
  if (radio instanceof HTMLInputElement) radio.checked = true;

  const hopEl = document.getElementById("opt-hop-numbers");
  const flipEl = document.getElementById("opt-flip-controls");
  const relEl = document.getElementById("opt-rel-names");
  const lockEl = document.getElementById("opt-lock-controls");
  if (!hopEl || !flipEl || !relEl || !lockEl) return;

  const { hop, flip, relOnly } = overlayChecksFromMode(state.diagramOverlayMode);
  hopEl.checked = hop;
  flipEl.checked = flip;
  relEl.checked = relOnly;
  lockEl.checked = state.showDiagramLockControls !== false;
}

function updatePathFlowButton() {
  syncDiagramOptionsFormFromState();
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
const FEEDBACK_MAIL_SUBJECT = "ArchiTrek Feedback";
const FEEDBACK_RELATIONSHIP_SUBMIT_LABEL = "Submit";
const FEEDBACK_RELATIONSHIP_SUBMIT_BUSY_LABEL = "Submitting...";
const FEEDBACK_CATEGORY_GENERAL = "General feedback";
const FEEDBACK_SUCCESS_REL_WEBHOOK =
  "Thank you! Your feedback has been recorded.";
const FEEDBACK_SUCCESS_GENERAL_EMAIL =
  "Thank you! Your message was sent by email (not posted to the public review sheet).";
const relationshipFeedbackState = {
  edge: null,
  /** When true, the relationship feedback form shows the extra “General feedback” category (header entry). */
  allowGeneralCategory: false,
  /** Header “Feedback” flow: type picker + general form or hop-based relationship report. */
  isToolbarEntry: false,
  /** @type {"general"|"logical"|"metamodel"} */
  toolbarFeedbackKind: "general",
};

/** One line per MATRIX row for email / diagnostics (Appendix B encoding in this app). */
function buildAppendixBMatrixDumpLines() {
  if (typeof MATRIX === "undefined" || !Array.isArray(MATRIX)) {
    return ["(MATRIX not loaded in this page — appendix dump skipped.)"];
  }
  const lines = [
    `Total directed pairs (non–O-only rows): ${MATRIX.length}`,
    "Format: from → to · direct · derived (letters as stored; Association O is not listed per cell).",
    "",
  ];
  for (const row of MATRIX) {
    const from = row?.from != null ? String(row.from) : "?";
    const to = row?.to != null ? String(row.to) : "?";
    const direct = Array.isArray(row.direct) && row.direct.length ? row.direct.join("") : "—";
    const derived = Array.isArray(row.derived) && row.derived.length ? row.derived.join("") : "—";
    lines.push(`${from} → ${to} · ${direct} · ${derived}`);
  }
  return lines;
}

/**
 * Flattened hop list for the active path alternative (same shape as diagram / explanation).
 * @param {object} fb plain state snapshot (e.g. state.__raw__ || state)
 */
function buildChosenPathFeedbackLines(fb) {
  const lines = [];
  const segs = fb?.segments;
  const pathIdx = Number.isFinite(fb?.activePathIdx) ? Math.max(0, Math.floor(fb.activePathIdx)) : 0;
  if (!Array.isArray(segs) || segs.length === 0) {
    lines.push("(No path in memory — Find Path may not have been run, or results were cleared.)");
    return lines;
  }
  let flat;
  try {
    flat = flattenSegments(segs, pathIdx);
  } catch (err) {
    lines.push(`(Could not read path: ${String(err?.message || err)})`);
    return lines;
  }
  if (!flat.length) {
    lines.push("(Empty path for this alternative.)");
    return lines;
  }
  const edgeConstraints = Array.isArray(fb.edgeConstraints) ? fb.edgeConstraints : [];
  const uc = fb.userChoices && typeof fb.userChoices === "object" ? fb.userChoices : {};
  lines.push(`Active alternative (0-based path index): ${pathIdx}`);
  lines.push(`Nodes in flattened route: ${flat.length}`);
  lines.push("");
  lines.push(`0. ${flat[0]?.element || "?"}`);
  for (let i = 1; i < flat.length; i++) {
    const st = flat[i];
    const prevEl = flat[i - 1]?.element ?? "?";
    const toEl = st?.element ?? "?";
    let codes = Array.isArray(st?.codes) && st.codes.length ? st.codes.join("") : "";
    if (typeof window.appendixMatrixCodesForPathHopIndex === "function") {
      try {
        const eff = window.appendixMatrixCodesForPathHopIndex(flat, i, edgeConstraints);
        if (Array.isArray(eff) && eff.length) codes = eff.join("");
      } catch (_) {}
    }
    const assoc = st?.isAssociation ? " · hop=Association(§5.2.4)" : "";
    const sem = st?.semanticHop;
    const semBits = [];
    if (sem?.primaryCode) semBits.push(`code=${sem.primaryCode}`);
    if (sem?.rule) semBits.push(`rule=${sem.rule}`);
    if (sem?.violation && sem.violation !== "None") semBits.push(`violation=${sem.violation}`);
    const semStr = semBits.length ? ` · ${semBits.join(", ")}` : "";
    const pick = uc[String(i)] != null && String(uc[String(i)]).trim() !== "" ? ` · userResolved=${uc[String(i)]}` : "";
    lines.push(`${i}. ${prevEl} → ${toEl} · matrixCodes=${codes || "?"}${assoc}${semStr}${pick}`);
  }
  return lines;
}

/**
 * @param {{ includeFullAppendixB?: boolean }} [opts]
 */
function buildFeedbackContextBody(opts = {}) {
  const includeFullAppendixB = !!opts.includeFullAppendixB;
  /** Plain store snapshot — avoids nested Proxy traps during deep reads (feedback context only). */
  const fb = typeof state.__raw__ === "object" && state.__raw__ != null ? state.__raw__ : state;
  const lines = [];
  const vpSel = document.getElementById("viewpoint-select");
  const vpVal = vpSel?.value || "";
  const vpOpt = vpSel?.selectedOptions?.[0];
  const viewpointLabel =
    vpVal && vpOpt ? String(vpOpt.textContent || "").trim() : vpVal ? vpVal : "All elements";

  const domainKey = normalizeDomainContext(fb.domainContext);
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
  lines.push(`- App loading / busy: ${fb.loading ? "yes" : "no"}`);

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
    lines.push(`- Path mode: ${fb.selectionMode === "set" ? "Connect set" : "Ordered waypoints"}`);
  }

  lines.push("");
  lines.push("Pathfinder & graph settings:");
  lines.push(`- Relationships: ${fb.includeDerived ? "+ Inferred" : "Explicit only"}`);
  lines.push(`- Association fallback (§5.2.4 bridges): ${fb.allowAssociationFallback ? "on" : "off"}`);
  lines.push(
    `- Weighted UCS: explicit=${so.pathWeightDirect} · inferred=${so.pathWeightDerived} · association=${so.pathWeightAssociation} · layerSkip=${so.pathWeightLayerSkip} · violation=${so.pathViolationPenalty}`
  );
  lines.push(
    `- Semantic rigor: preset=${normalizeSearchRigorPreset(fb.searchRigorPreset)} · corePrune=${so.restrictCoreToCore} · grammar=${so.enforceGrammar} · strictRealization=${so.strictRealization}`
  );
  const pcm = so.perspectiveClassMode || normalizePerspectiveClassMode(fb.perspectiveClassMode);
  const domPct =
    pcm === "dominant-share"
      ? Math.round((so.perspectiveDominantShare != null ? so.perspectiveDominantShare : clampPerspectiveDominantSharePct(fb.perspectiveDominantSharePct) / 100) * 100)
      : null;
  lines.push(
    `- Perspective grouping: ${pcm}${domPct != null ? ` · dominant-share threshold ${domPct}%` : ""}`
  );
  lines.push(
    `- Limits: max ${so.maxDepth} hops/segment · ${so.maxPaths} route alternatives · expansion budget ${normalizeSearchEffort(fb.searchEffort)} (maxStates≈${so.maxStates})`
  );
  lines.push(
    `- Cognitive load (routing cost): ${so.cognitiveLoadPenalty !== false ? "on" : "off"} · grace ${so.penaltyGracePeriod} hop(s) · growth factor ${so.penaltyGrowthFactor}`
  );
  if (searchSnap) {
    lines.push(
      `- Snapshot flags: includeDerived=${searchSnap.includeDerived} · allowAssociationFallback=${searchSnap.allowAssociationFallback}`
    );
  }

  const vpRoute = resolveViewpointSearchContext({ forceFullMetamodel: false });
  lines.push("");
  lines.push("Viewpoint routing (pathfinder graph scope):");
  lines.push(
    `- viewpointKey: ${vpRoute.viewpointKey != null && vpRoute.viewpointKey !== "" ? vpRoute.viewpointKey : "∅ (no strict viewpoint key)"}`
  );
  lines.push(`- strict palette + relationship filter: ${vpRoute.viewpointStrict ? "yes" : "no"}`);
  if (vpRoute.viewpointStrict && vpRoute.allowedRelationshipCodes instanceof Set) {
    lines.push(`- strict viewpoint allowed relationship matrix codes (count): ${vpRoute.allowedRelationshipCodes.size}`);
  }
  const sv = fb.viewpoint != null && fb.viewpoint !== "" ? String(fb.viewpoint).trim() : "";
  if (sv && vpVal && sv !== vpVal) {
    lines.push(`- Note: state.viewpoint (${sv}) ≠ dropdown (${vpVal}) — possible UI sync issue`);
  }

  lines.push("");
  lines.push("Runtime / environment:");
  lines.push(`- Async find in progress: ${fb._finding ? "yes" : "no"}`);
  if (fb._pathfindFullMetamodelOnce) {
    lines.push("- Next findPath: one-shot full metamodel graph (Expand search scope)");
  }
  if (fb._relaxOneShotRestore) {
    lines.push("- One-shot rule relax restore snapshot: pending (between CTA and find completion)");
  }
  try {
    const algoOpen = sessionStorage.getItem("archimateAlgorithmDetailsOpen") === "1";
    lines.push(`- Routing math panel (session): ${algoOpen ? "expanded" : "collapsed"}`);
  } catch (_) {
    lines.push("- Routing math panel (session): (unavailable)");
  }
  try {
    const consent = localStorage.getItem(LOCAL_PREFS_CONSENT_LS) === "1";
    lines.push(`- Local session snapshot (restore): ${consent ? "consented" : "not stored / declined"}`);
  } catch (_) {
    lines.push("- Local session snapshot (restore): (unavailable)");
  }
  try {
    lines.push(
      `- Mobile “use desktop layout” (session): ${sessionStorage.getItem(MOBILE_FORCE_DESKTOP_SESSION_KEY) === "1" ? "yes" : "no"}`
    );
  } catch (_) {
    lines.push('- Mobile “use desktop layout” (session): (unavailable)');
  }

  lines.push("");
  lines.push("Diagram view:");
  lines.push(`- Mode: ${fb.mode === "swimlane" ? "Swimlanes" : "Compact"}`);
  lines.push(`- Path layout: ${fb.pathFlow}`);
  lines.push(
    `- Diagram overlays (hop numbers / flip controls): ${diagramOverlayExportLabel(fb.diagramOverlayMode, fb.showBadges)}`
  );
  lines.push(`- Composite sub-component illustrations: ${fb.showCompositeSubs !== false ? "on" : "off"}`);
  lines.push(`- Quick examples pinned: ${fb.forceShowQuickExamples ? "yes" : "no"}`);

  lines.push("");
  lines.push("Waypoints (layer → element per slot):");
  const wps = fb.waypoints || [];
  if (!wps.length) {
    lines.push("- (none)");
  } else {
    wps.forEach((wp, i) => {
      const layer = wp.layer || "—";
      const el = wp.element || "—";
      lines.push(`- ${i + 1}. ${layer} → ${el}`);
    });
  }
  if (fb.selectionMode === "set" && fb.lastAutoOrderInput?.length) {
    lines.push(
      `- Connect-set solver input (unordered names): ${fb.lastAutoOrderInput.filter(Boolean).join(", ")}`
    );
  }

  lines.push("");
  lines.push("Path finder / last run:");
  if (fb.lastPathSearchStatus) {
    lines.push(`- Last search status: ${fb.lastPathSearchStatus}`);
  }
  if (fb.lastPathTemporaryRelaxation && typeof fb.lastPathTemporaryRelaxation === "object") {
    lines.push(`- Last successful path used temporary relax (one-shot CTA): ${JSON.stringify(fb.lastPathTemporaryRelaxation)}`);
  }
  if (fb._perspectiveSuggestFullMetamodel) {
    lines.push("- Perspective “add elements” suggestions: expanded to full metamodel (outside strict viewpoint)");
  }
  const gSize = fb.graph && typeof fb.graph.size === "number" ? fb.graph.size : null;
  lines.push(`- Graph size (nodes): ${gSize != null ? gSize : "—"}`);
  const segs = fb.segments;
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
        `- Last successful path used Association fallback (penalized hop): ${fb.lastPathIsFallback ? "yes" : "no"}`
      );
    }
    lines.push(`- Active alternative tab: ${(fb.activePathIdx ?? 0) + 1}`);
    if (fb.selectionMode === "set" && fb.lastAutoOrderResult?.length) {
      lines.push(`- Auto-ordered chain: ${fb.lastAutoOrderResult.join(" → ")}`);
      const m = fb.lastAutoOrderMetrics;
      if (m && Number.isFinite(m.totalScore)) {
        lines.push(
          `- Connect-set metrics: weighted cost ${m.totalScore} · ${m.pointCount} points · ${m.orderingExact ? "exact" : "heuristic"} ordering · max ${so.maxDepth} hops/segment`
        );
      }
    }
  }
  if (hasNoPath && fb.pathFailureHints && typeof fb.pathFailureHints === "object") {
    lines.push(
      `- No-path probe (would Derived / Association help?): ${JSON.stringify(fb.pathFailureHints)}`
    );
  }
  const uc = fb.userChoices && typeof fb.userChoices === "object" ? fb.userChoices : {};
  const ucKeys = Object.keys(uc);
  if (ucKeys.length) {
    lines.push(`- Ambiguous-hop disambiguation (userChoices): ${JSON.stringify(uc)}`);
  }

  const mm = fb.mmLast;
  if (mm?.fromEl && mm?.toEl) {
    lines.push("");
    lines.push("Last metamodel focus (if relevant):");
    lines.push(`- ${mm.fromEl} → ${mm.toEl}${mm.appendixRel ? ` (${mm.appendixRel})` : ""}`);
  }

  if (includeFullAppendixB) {
    lines.push("");
    lines.push("--- Active route (current results) — flattened hops ---");
    for (const pl of buildChosenPathFeedbackLines(fb)) {
      lines.push(pl);
    }
    lines.push("");
    lines.push("--- Appendix B matrix — full in-app encoding (all rows) ---");
    for (const ml of buildAppendixBMatrixDumpLines()) {
      lines.push(ml);
    }
  }

  lines.push("");
  lines.push("--- End context ---");

  return lines.join("\n");
}

/**
 * @param {string} message
 * @param {string} replyEmail
 * @param {{ includeFullAppendixB?: boolean }} [contextOpts]
 */
function buildFullFeedbackReport(message, replyEmail, contextOpts) {
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
  parts.push(buildFeedbackContextBody(contextOpts || {}));
  return parts.join("\n");
}

function setRelationshipCategoryWarningVisible(visible) {
  const warning = document.getElementById("feedback-relationship-category-warning");
  if (!warning) return;
  warning.hidden = !visible;
}

function clearFeedbackStatus() {
  const status = document.getElementById("feedback-status");
  if (!status) return;
  status.textContent = "";
  status.classList.remove("feedback-status--error");
}

function setRelationshipSubmitBusy(busy) {
  const submitBtn = document.getElementById("feedback-relationship-submit");
  if (!submitBtn) return;
  submitBtn.disabled = !!busy;
  if (busy) {
    submitBtn.setAttribute("aria-busy", "true");
    submitBtn.textContent = FEEDBACK_RELATIONSHIP_SUBMIT_BUSY_LABEL;
  } else {
    submitBtn.removeAttribute("aria-busy");
    submitBtn.textContent = FEEDBACK_RELATIONSHIP_SUBMIT_LABEL;
  }
}

function setFeedbackModalMode(mode) {
  const generalSection = document.getElementById("feedback-general-section");
  const relationshipSection = document.getElementById("feedback-relationship-section");
  const successSection = document.getElementById("feedback-success-section");
  const toolbarTypeWrap = document.getElementById("feedback-toolbar-type-wrap");
  if (generalSection) generalSection.hidden = mode !== "general";
  if (relationshipSection) relationshipSection.hidden = mode !== "relationship";
  if (successSection) successSection.hidden = mode !== "success";
  if (toolbarTypeWrap) {
    if (relationshipFeedbackState.isToolbarEntry) {
      toolbarTypeWrap.hidden = mode === "success";
    } else {
      toolbarTypeWrap.hidden = true;
    }
  }
}

function syncFeedbackGeneralCategoryOptionVisible() {
  const row = document.getElementById("feedback-rel-general-wrap");
  if (!row) return;
  row.hidden =
    !relationshipFeedbackState.allowGeneralCategory || relationshipFeedbackState.isToolbarEntry;
}

function syncRelationshipFeedbackReplyEmailRow() {
  const wrap = document.getElementById("feedback-relationship-reply-wrap");
  const generalRadio = document.getElementById("feedback-rel-category-general");
  if (!wrap) return;
  const show =
    !relationshipFeedbackState.isToolbarEntry &&
    relationshipFeedbackState.allowGeneralCategory &&
    generalRadio instanceof HTMLInputElement &&
    generalRadio.checked;
  wrap.hidden = !show;
}

function onToolbarFeedbackKindChange() {
  if (!relationshipFeedbackState.isToolbarEntry) return;
  const c = document.querySelector('input[name="feedback-toolbar-kind"]:checked');
  const v = c instanceof HTMLInputElement ? c.value : "general";
  relationshipFeedbackState.toolbarFeedbackKind =
    v === "metamodel" ? "metamodel" : v === "logical" ? "logical" : "general";
  syncToolbarFeedbackPanels();
}

function updateToolbarRelationshipSummaryText() {
  const edge = relationshipFeedbackState.edge;
  const el = document.getElementById("feedback-relationship-summary");
  if (!el) return;
  if (!edge) {
    if (
      relationshipFeedbackState.isToolbarEntry &&
      relationshipFeedbackState.toolbarFeedbackKind !== "general"
    ) {
      el.textContent =
        "Pick a hop from the list, or run Find Path to load a route. You can switch back to General feedback anytime.";
    } else {
      el.textContent = "";
    }
    return;
  }
  el.textContent =
    `Reporting: ${edge.source?.name || edge.source?.type || "Unknown"} \u2192 ` +
    `${edge.type || edge.code || "Relationship"} \u2192 ` +
    `${edge.target?.name || edge.target?.type || "Unknown"}`;
}

function populateFeedbackToolbarHopSelect() {
  const sel = document.getElementById("feedback-toolbar-hop-select");
  const emptyHint = document.getElementById("feedback-toolbar-hop-empty");
  if (!sel) return;
  sel.innerHTML = "";
  const flat = getFlatStepsForFeedback();
  for (let i = 1; i < flat.length; i++) {
    const meta = getHopMetaForFeedback(i);
    if (!meta) continue;
    const code = meta.currentCode || "?";
    const relName =
      typeof RELATIONSHIPS !== "undefined" && RELATIONSHIPS?.[code]?.name ? RELATIONSHIPS[code].name : code;
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `Hop ${i}: ${meta.from} → ${relName} (${code}) → ${meta.to}`;
    sel.appendChild(opt);
  }
  if (!sel.options.length) {
    sel.disabled = true;
    if (emptyHint) emptyHint.hidden = false;
    relationshipFeedbackState.edge = null;
  } else {
    sel.disabled = false;
    if (emptyHint) emptyHint.hidden = true;
    sel.selectedIndex = 0;
    const firstIx = Number(sel.options[0].value);
    relationshipFeedbackState.edge = buildEdgeFromFeedbackHopMeta(getHopMetaForFeedback(firstIx));
  }
  updateToolbarRelationshipSummaryText();
}

function syncToolbarFeedbackPanels() {
  const tb = relationshipFeedbackState.isToolbarEntry;
  const kind = relationshipFeedbackState.toolbarFeedbackKind;
  const hopWrap = document.getElementById("feedback-toolbar-hop-wrap");
  const catFs = document.getElementById("feedback-rel-category-fieldset");

  if (!tb) {
    if (hopWrap) hopWrap.hidden = true;
    if (catFs) catFs.hidden = false;
    return;
  }

  if (kind === "general") {
    setFeedbackModalMode("general");
    if (hopWrap) hopWrap.hidden = true;
    if (catFs) catFs.hidden = true;
    relationshipFeedbackState.edge = null;
    const ctx = document.getElementById("feedback-context-field");
    if (ctx) {
      try {
        ctx.value = buildFeedbackContextBody();
      } catch (e) {
        ctx.value = `Feedback context unavailable: ${String(e?.message || e || "unknown error")}`;
      }
    }
    updateToolbarRelationshipSummaryText();
    return;
  }

  setFeedbackModalMode("relationship");
  if (catFs) catFs.hidden = true;
  if (hopWrap) hopWrap.hidden = false;
  populateFeedbackToolbarHopSelect();
}

function resetRelationshipFeedbackFields() {
  relationshipFeedbackState.edge = null;
  relationshipFeedbackState.allowGeneralCategory = false;
  relationshipFeedbackState.isToolbarEntry = false;
  relationshipFeedbackState.toolbarFeedbackKind = "general";
  const summary = document.getElementById("feedback-relationship-summary");
  const comments = document.getElementById("feedback-relationship-comments");
  const bountyLink = document.getElementById("feedback-success-bounty-link");
  const replyEmail = document.getElementById("feedback-relationship-reply-email");
  const toolbarWrap = document.getElementById("feedback-toolbar-type-wrap");
  const hopWrap = document.getElementById("feedback-toolbar-hop-wrap");
  const catFs = document.getElementById("feedback-rel-category-fieldset");
  document.querySelectorAll('input[name="feedback-rel-category"]').forEach((input) => {
    if (input instanceof HTMLInputElement) input.checked = false;
  });
  document.querySelectorAll('input[name="feedback-toolbar-kind"]').forEach((input) => {
    if (input instanceof HTMLInputElement) input.checked = input.value === "general";
  });
  if (toolbarWrap) toolbarWrap.hidden = true;
  if (hopWrap) hopWrap.hidden = true;
  if (catFs) catFs.hidden = false;
  if (summary) summary.textContent = "";
  if (comments) comments.value = "";
  if (replyEmail) replyEmail.value = "";
  syncFeedbackGeneralCategoryOptionVisible();
  syncRelationshipFeedbackReplyEmailRow();
  if (bountyLink) {
    bountyLink.href = "#";
    bountyLink.hidden = false;
  }
  setRelationshipCategoryWarningVisible(false);
  setRelationshipSubmitBusy(false);
}

window.openFeedbackModal = function openFeedbackModal(opts = {}) {
  const modal = document.getElementById("feedback-modal");
  const title = document.getElementById("feedback-modal-title");
  const msg = document.getElementById("feedback-message-field");
  const reply = document.getElementById("feedback-reply-email");
  const relationshipSummary = document.getElementById("feedback-relationship-summary");
  const relationshipFirstRadio = document.getElementById("feedback-rel-category-logical");
  const generalCategoryRadio = document.getElementById("feedback-rel-category-general");
  if (!modal) return;
  try {
    closePathChromeOverlay?.();
    closePathOptionsOverlay?.();
    teardownPickerOverlay?.();
  } catch (_) {}

  clearFeedbackStatus();
  resetRelationshipFeedbackFields();

  const relationshipEdge = opts && typeof opts === "object" ? opts.relationshipEdge : null;
  if (relationshipEdge && typeof relationshipEdge === "object") {
    relationshipFeedbackState.isToolbarEntry = false;
    relationshipFeedbackState.edge = relationshipEdge;
    relationshipFeedbackState.allowGeneralCategory = false;
    syncFeedbackGeneralCategoryOptionVisible();
    syncRelationshipFeedbackReplyEmailRow();
    setFeedbackModalMode("relationship");
    if (title) title.textContent = "Report relationship";
    if (relationshipSummary) {
      relationshipSummary.textContent =
        `Reporting: ${relationshipEdge.source?.name || relationshipEdge.source?.type || "Unknown"} \u2192 ` +
        `${relationshipEdge.type || relationshipEdge.code || "Relationship"} \u2192 ` +
        `${relationshipEdge.target?.name || relationshipEdge.target?.type || "Unknown"}`;
    }
    const comments = document.getElementById("feedback-relationship-comments");
    if (comments) comments.value = "";
  } else {
    relationshipFeedbackState.edge = null;
    relationshipFeedbackState.allowGeneralCategory = false;
    relationshipFeedbackState.isToolbarEntry = true;
    relationshipFeedbackState.toolbarFeedbackKind = "general";
    syncFeedbackGeneralCategoryOptionVisible();
    syncRelationshipFeedbackReplyEmailRow();
    document.querySelectorAll('input[name="feedback-toolbar-kind"]').forEach((inp) => {
      if (inp instanceof HTMLInputElement) inp.checked = inp.value === "general";
    });
    syncToolbarFeedbackPanels();
    if (title) title.textContent = "Feedback";
    const comments = document.getElementById("feedback-relationship-comments");
    if (comments) comments.value = "";
    const replyRel = document.getElementById("feedback-relationship-reply-email");
    if (replyRel) replyRel.value = "";
    if (msg) msg.value = "";
    if (reply) reply.value = "";
  }

  const bountyLink = document.getElementById("feedback-success-bounty-link");
  if (bountyLink) bountyLink.hidden = false;
  const successLead = document.getElementById("feedback-success-lead");
  if (successLead) successLead.textContent = FEEDBACK_SUCCESS_REL_WEBHOOK;
  modal.style.display = "flex";
  modal.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => {
    if (relationshipEdge) relationshipFirstRadio?.focus();
    else if (relationshipFeedbackState.isToolbarEntry) {
      if (relationshipFeedbackState.toolbarFeedbackKind === "general") {
        msg?.focus();
      } else {
        document.getElementById("feedback-toolbar-hop-select")?.focus();
      }
    } else if (relationshipFeedbackState.allowGeneralCategory) {
      generalCategoryRadio?.focus();
    } else {
      msg?.focus();
    }
  });
};

window.closeFeedbackModal = function closeFeedbackModal() {
  const modal = document.getElementById("feedback-modal");
  const title = document.getElementById("feedback-modal-title");
  if (!modal) return;
  modal.style.display = "none";
  modal.setAttribute("aria-hidden", "true");
  if (title) title.textContent = "Feedback";
  setFeedbackModalMode("general");
  resetRelationshipFeedbackFields();
  clearFeedbackStatus();
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

function getRelationshipFeedbackWebhookUrl() {
  try {
    const raw = typeof window !== "undefined" ? window.FEEDBACK_WEBHOOK_URL : "";
    return typeof raw === "string" ? raw.trim() : "";
  } catch (_) {
    return "";
  }
}

function getRelationshipFeedbackSpreadsheetUrl() {
  try {
    const raw = typeof window !== "undefined" ? window.FEEDBACK_SPREADSHEET_URL : "";
    return typeof raw === "string" ? raw.trim() : "";
  } catch (_) {
    return "";
  }
}

window.submitRelationshipFeedback = async function submitRelationshipFeedback() {
  const edge = relationshipFeedbackState.edge;
  const commentsEl = document.getElementById("feedback-relationship-comments");
  const successLink = document.getElementById("feedback-success-bounty-link");
  const successCloseBtn = document.getElementById("feedback-success-close-btn");
  const successLead = document.getElementById("feedback-success-lead");
  const comments = commentsEl?.value?.trim() ?? "";

  clearFeedbackStatus();

  let selectedCategory = "";
  if (relationshipFeedbackState.isToolbarEntry) {
    if (relationshipFeedbackState.toolbarFeedbackKind === "general") {
      setFeedbackStatus(
        "For general notes, keep the first option selected above and use “Send feedback”.",
        true
      );
      return;
    }
    selectedCategory =
      relationshipFeedbackState.toolbarFeedbackKind === "logical"
        ? "Logical Mismatch"
        : "Metamodel Conflict";
  } else {
    const checkedCategory = document.querySelector('input[name="feedback-rel-category"]:checked');
    selectedCategory =
      checkedCategory instanceof HTMLInputElement ? checkedCategory.value.trim() : "";
    if (!selectedCategory) {
      setRelationshipCategoryWarningVisible(true);
      return;
    }
  }
  setRelationshipCategoryWarningVisible(false);

  if (selectedCategory !== FEEDBACK_CATEGORY_GENERAL && !edge) {
    setFeedbackStatus(
      relationshipFeedbackState.isToolbarEntry
        ? "Choose a hop from the list, or run Find Path to load a route first."
        : "To post a specific relationship to the review sheet, right-click that hop on the diagram and choose Report feedback. Or pick “General feedback” to email the team instead.",
      true
    );
    return;
  }

  if (!comments) {
    setFeedbackStatus("Please provide a short justification before submitting.", true);
    commentsEl?.focus();
    return;
  }

  if (selectedCategory === FEEDBACK_CATEGORY_GENERAL) {
    if (!getFeedbackWeb3AccessKey()) {
      setFeedbackStatus(
        "Email sending is not set up yet. Add your Web3Forms access key in config/feedback-config.js.",
        true
      );
      trackEvent("feedback_submit", { ok: false, reason: "missing_web3forms_key" });
      return;
    }
    const replyRel =
      document.getElementById("feedback-relationship-reply-email")?.value?.trim() ?? "";
    const bodyText = buildFullFeedbackReport(
      `${FEEDBACK_CATEGORY_GENERAL}\n\n${comments}`,
      replyRel,
      { includeFullAppendixB: true }
    ).replace(`Subject: ${FEEDBACK_MAIL_SUBJECT}`, `Subject: ${FEEDBACK_MAIL_SUBJECT} (General)`);

    setRelationshipSubmitBusy(true);
    try {
      await submitArchitrekFeedbackEmail(bodyText, replyRel);
      setRelationshipSubmitBusy(false);
      if (successLead) successLead.textContent = FEEDBACK_SUCCESS_GENERAL_EMAIL;
      if (successLink) {
        successLink.href = "#";
        successLink.hidden = true;
      }
      setFeedbackModalMode("success");
      const title = document.getElementById("feedback-modal-title");
      if (title) title.textContent = "Thank you";
      requestAnimationFrame(() => {
        successCloseBtn?.focus();
      });
      trackEvent("feedback_submit", { ok: true, via: "relationship_modal_general" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setRelationshipSubmitBusy(false);
      setFeedbackStatus(message || "Failed to send feedback. Please try again.", true);
      trackEvent("feedback_submit", {
        ok: false,
        via: "relationship_modal_general",
        reason: err?.code === "missing_web3forms_key" ? "missing_web3forms_key" : "network_or_api_error",
      });
    }
    return;
  }

  const url = getRelationshipFeedbackWebhookUrl();
  if (!url) {
    setFeedbackStatus("Webhook URL is not configured yet.", true);
    return;
  }

  /** Same diagnostics as email “auto-filled context”, plus flattened hops (no full Appendix B matrix — size). */
  const MAX_REL_FEEDBACK_TECHNICAL_CONTEXT_CHARS = 49000;
  const fbSnapshot =
    typeof state.__raw__ === "object" && state.__raw__ != null ? state.__raw__ : state;
  let technicalContext = "";
  try {
    const base = buildFeedbackContextBody({ includeFullAppendixB: false });
    const pathBlock =
      "\n\n--- Active route (current results) — flattened hops ---\n" +
      buildChosenPathFeedbackLines(fbSnapshot).join("\n");
    technicalContext = base + pathBlock;
    if (technicalContext.length > MAX_REL_FEEDBACK_TECHNICAL_CONTEXT_CHARS) {
      technicalContext =
        technicalContext.slice(0, MAX_REL_FEEDBACK_TECHNICAL_CONTEXT_CHARS - 48) +
        "\n...[technicalContext truncated for storage limit]";
    }
  } catch (err) {
    try {
      const href =
        typeof window !== "undefined" && window.location ? window.location.href : "";
      const so = typeof getSearchPathOptions === "function" ? getSearchPathOptions() : {};
      const wps = Array.isArray(fbSnapshot?.waypoints) ? fbSnapshot.waypoints : [];
      const wpNames = wps.map((w) => w?.element || "—").join(" → ");
      technicalContext = [
        `Page: ${href}`,
        `Rigor preset: ${fbSnapshot?.searchRigorPreset ?? "?"}`,
        `Relationships: ${fbSnapshot?.includeDerived ? "+ Inferred" : "Explicit only"}`,
        `Association fallback: ${fbSnapshot?.allowAssociationFallback ? "on" : "off"}`,
        `Waypoint mode: ${fbSnapshot?.selectionMode === "set" ? "Connect set" : "Ordered waypoints"}`,
        `Waypoints: ${wpNames || "—"}`,
        `UCS weights (if available): direct=${so?.pathWeightDirect ?? "?"} inferred=${so?.pathWeightDerived ?? "?"} maxDepth=${so?.maxDepth ?? "?"}`,
        `(technicalContext build failed: ${String(err?.message || err)})`,
      ].join("\n");
    } catch (_) {
      technicalContext = "(technicalContext unavailable)";
    }
  }

  const payload = {
    timestamp: new Date().toISOString(),
    category: selectedCategory,
    sourceElementType: edge.source?.type || "",
    sourceElementName: edge.source?.name || "",
    targetElementType: edge.target?.type || "",
    targetElementName: edge.target?.name || "",
    relationshipType: edge.type || "",
    relationshipCode: edge.code || "",
    hopIndex: edge.hopIndex,
    userComments: comments,
    technicalContext,
  };

  setRelationshipSubmitBusy(true);
  try {
    const payloadText = JSON.stringify(payload);
    const response = await fetch(url, {
      method: "POST",
      // Use a CORS-simple request to avoid browser preflight against Apps Script web-app endpoints.
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: payloadText,
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          "Webhook denied access (403). Ask an admin to redeploy the Apps Script Web App with access set to 'Anyone'."
        );
      }
      throw new Error(`Failed to send feedback (${response.status}).`);
    }

    setRelationshipSubmitBusy(false);
    if (successLead) successLead.textContent = FEEDBACK_SUCCESS_REL_WEBHOOK;
    const spreadsheetUrl = getRelationshipFeedbackSpreadsheetUrl();
    if (successLink) {
      if (spreadsheetUrl) {
        successLink.href = spreadsheetUrl;
        successLink.hidden = false;
      } else {
        successLink.href = "#";
        successLink.hidden = true;
      }
    }
    setFeedbackModalMode("success");
    const title = document.getElementById("feedback-modal-title");
    if (title) title.textContent = "Thank you";
    requestAnimationFrame(() => {
      successCloseBtn?.focus();
    });
    trackEvent("relationship_feedback_submit", { ok: true, category: selectedCategory });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setRelationshipSubmitBusy(false);
    setFeedbackStatus(message || "Failed to send feedback. Please try again.", true);
    trackEvent("relationship_feedback_submit", { ok: false, category: selectedCategory });
  }
};

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

/**
 * Sends the given plain-text body through Web3Forms (same inbox as the legacy general feedback form).
 * @param {string} bodyText
 * @param {string} replyEmail optional address for Web3Forms “email” field
 */
async function submitArchitrekFeedbackEmail(bodyText, replyEmail) {
  const key = getFeedbackWeb3AccessKey();
  if (!key) {
    const err = new Error(
      "Email sending is not set up yet. Add your Web3Forms access key in config/feedback-config.js, or use Copy report."
    );
    err.code = "missing_web3forms_key";
    throw err;
  }
  const emailField = replyEmail?.trim() ? replyEmail.trim() : "anonymous@example.com";
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
      replyto: FEEDBACK_MAIL_TO,
      message: bodyText,
      botcheck: false,
    }),
  });
  const data = await res.json().catch(() => ({}));
  const ok =
    res.ok && (data.success === true || (data.body && data.body.success === true));
  if (!ok) {
    const errText =
      (typeof data.message === "string" && data.message) ||
      (data.body && typeof data.body.message === "string" && data.body.message) ||
      `Could not send (${res.status}). Try Copy report.`;
    throw new Error(errText);
  }
}

window.submitFeedbackReport = async function submitFeedbackReport() {
  const msg = document.getElementById("feedback-message-field")?.value?.trim() ?? "";
  const reply = document.getElementById("feedback-reply-email")?.value?.trim() ?? "";
  const sendBtn = document.getElementById("feedback-send-btn");
  const copyBtn = document.getElementById("feedback-copy-btn");

  if (!getFeedbackWeb3AccessKey()) {
    setFeedbackStatus(
      "Email sending is not set up yet. Add your Web3Forms access key in config/feedback-config.js, or use Copy report.",
      true
    );
    trackEvent("feedback_submit", { ok: false, reason: "missing_web3forms_key" });
    return;
  }

  const bodyText = buildFullFeedbackReport(
    msg,
    reply,
    relationshipFeedbackState.isToolbarEntry ? { includeFullAppendixB: true } : {}
  );
  const prevLabel = sendBtn?.textContent;

  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.setAttribute("aria-busy", "true");
    sendBtn.textContent = "Sending…";
  }
  if (copyBtn) copyBtn.disabled = true;

  try {
    await submitArchitrekFeedbackEmail(bodyText, reply);
    setFeedbackStatus(
      "Sent. Thank you — if you left a reply address, you may get a follow-up there.",
      false
    );
    trackEvent("feedback_submit", { ok: true });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    setFeedbackStatus(m, true);
    trackEvent("feedback_submit", {
      ok: false,
      reason: e?.code === "missing_web3forms_key" ? "missing_web3forms_key" : "network_or_api_error",
    });
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.removeAttribute("aria-busy");
      if (prevLabel != null) sendBtn.textContent = prevLabel;
    }
    if (copyBtn) copyBtn.disabled = false;
  }
};

function setMobileReminderStatus(text, isError) {
  const status = document.getElementById("mobile-reminder-status");
  if (!status) return;
  status.textContent = text;
  status.classList.toggle("feedback-status--error", !!isError);
}

/**
 * Sends a Web3Forms request (subject: "Your link to ArchiTrek") so the autoresponder can email the user.
 * Mirrors {@link submitFeedbackReport} (same API key, same endpoint pattern).
 */
window.sendMobileReminder = async function sendMobileReminder() {
  const key = getFeedbackWeb3AccessKey();
  const emailInput = document.getElementById("mobile-reminder-email");
  const sendBtn = document.getElementById("mobile-reminder-btn");
  const reply = emailInput?.value?.trim() ?? "";
  const prevLabel = sendBtn?.textContent;

  if (!key) {
    setMobileReminderStatus(
      "Email sending is not set up yet. Add your Web3Forms access key in config/feedback-config.js.",
      true
    );
    trackEvent("mobile_reminder", { ok: false, reason: "missing_web3forms_key" });
    return;
  }

  if (!reply || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reply)) {
    setMobileReminderStatus("Please enter a valid email address.", true);
    return;
  }

  const desktopUrl =
    typeof location !== "undefined" ? String(location.href).split("#")[0] : "";
  const message = [
    "Hi there,",
    "",
    "Earlier today, you tried to access ArchiTrek from your mobile device. Because Enterprise Architecture needs room to breathe, we saved your spot for when you're back at a larger screen.",
    "",
    "Whenever you are ready to dive into ArchiMate relationship matrices, pathfinding, and derivation rules, just click the link below from your desktop or laptop:",
    "",
    desktopUrl,
    "",
    "Happy modeling,",
    "",
    "The ArchiTrek Team",
  ].join("\n");

  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.setAttribute("aria-busy", "true");
    sendBtn.textContent = "Sending…";
  }
  setMobileReminderStatus("", false);

  try {
    const res = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        access_key: key,
        subject: "Your link to ArchiTrek",
        from_name: "ArchiTrek reminder",
        email: reply,
        replyto: reply,
        message,
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
        `Could not send (${res.status}).`;
      throw new Error(errText);
    }
    setMobileReminderStatus("", false);
    if (sendBtn) sendBtn.textContent = "Sent!";
    trackEvent("mobile_reminder", { ok: true });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    setMobileReminderStatus(m, true);
    trackEvent("mobile_reminder", { ok: false, reason: "network_or_api_error" });
    if (sendBtn && prevLabel != null) sendBtn.textContent = prevLabel;
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.removeAttribute("aria-busy");
    }
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
  if (document.documentElement.dataset.architrekResultsSplitWired === "1") {
    applyResultsLayoutMode(readResultsLayoutMode());
    applyResultsSplitPct(readResultsSplitPct());
    applyResultsSidePct(readResultsSidePct());
    return;
  }
  document.documentElement.dataset.architrekResultsSplitWired = "1";

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
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    const startY = e.clientY;
    const panelRect = panel.getBoundingClientRect();
    const panelH = panelRect.height;
    if (panelH < 80) return;
    if (handle && typeof handle.setPointerCapture === "function") {
      try {
        handle.setPointerCapture(e.pointerId);
      } catch (_) {}
    }
    const startPct = getResultsDiagramPct(panel);

    function move(ev) {
      const dy = ev.clientY - startY;
      const deltaPct = (dy / panelH) * 100;
      let next = startPct + deltaPct;
      next = Math.max(RESULTS_PCT_MIN, Math.min(RESULTS_PCT_MAX, next));
      panel.style.setProperty("--results-diagram-pct", `${next}%`);
    }
    function up(ev) {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
      if (handle && typeof handle.releasePointerCapture === "function" && ev?.pointerId != null) {
        try {
          if (handle.hasPointerCapture?.(ev.pointerId)) handle.releasePointerCapture(ev.pointerId);
        } catch (_) {}
      }
      const pct = Math.round(getResultsDiagramPct(panel));
      localStorage.setItem(RESULTS_SPLIT_LS, String(pct));
    }
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
  }

  function startResizeSide(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const panelRect = panel.getBoundingClientRect();
    const panelW = panelRect.width;
    if (panelW < 160) return;
    if (handle && typeof handle.setPointerCapture === "function") {
      try {
        handle.setPointerCapture(e.pointerId);
      } catch (_) {}
    }
    const startPct = getResultsSidePct(panel);

    function move(ev) {
      const dx = ev.clientX - startX;
      const deltaPct = -(dx / panelW) * 100;
      let next = startPct + deltaPct;
      next = Math.max(RESULTS_SIDE_PCT_MIN, Math.min(RESULTS_SIDE_PCT_MAX, next));
      panel.style.setProperty("--results-side-pct", `${next}%`);
    }
    function up(ev) {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
      if (handle && typeof handle.releasePointerCapture === "function" && ev?.pointerId != null) {
        try {
          if (handle.hasPointerCapture?.(ev.pointerId)) handle.releasePointerCapture(ev.pointerId);
        } catch (_) {}
      }
      const pct = Math.round(getResultsSidePct(panel));
      localStorage.setItem(RESULTS_SIDE_SPLIT_LS, String(pct));
    }
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
  }

  function startResize(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (isResultsSideLayoutActive()) startResizeSide(e);
    else startResizeStack(e);
  }

  handle.addEventListener("pointerdown", startResize, true);

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

const HELP_PANE_APP = "app";
const HELP_PANE_TECH = "tech";
const HELP_PANE_LABELS = "labels";

function setHelpModalPane(pane) {
  const showApp = pane === HELP_PANE_APP;
  const showTech = pane === HELP_PANE_TECH;
  const showLabels = pane === HELP_PANE_LABELS;
  const appPane = document.getElementById("help-pane-app");
  const techPane = document.getElementById("help-pane-tech");
  const labelsPane = document.getElementById("help-pane-labels");
  const tabApp = document.getElementById("help-tab-app");
  const tabTech = document.getElementById("help-tab-tech");
  const tabLabels = document.getElementById("help-tab-labels");
  if (appPane) appPane.hidden = !showApp;
  if (techPane) techPane.hidden = !showTech;
  if (labelsPane) labelsPane.hidden = !showLabels;
  if (tabApp) {
    tabApp.setAttribute("aria-selected", String(showApp));
    tabApp.classList.toggle("help-modal-tab--active", showApp);
    tabApp.tabIndex = showApp ? 0 : -1;
  }
  if (tabTech) {
    tabTech.setAttribute("aria-selected", String(showTech));
    tabTech.classList.toggle("help-modal-tab--active", showTech);
    tabTech.tabIndex = showTech ? 0 : -1;
  }
  if (tabLabels) {
    tabLabels.setAttribute("aria-selected", String(showLabels));
    tabLabels.classList.toggle("help-modal-tab--active", showLabels);
    tabLabels.tabIndex = showLabels ? 0 : -1;
  }
  if (showLabels) {
    const body = document.getElementById("help-labels-body");
    if (body && typeof buildPathLabelsModalHtml === "function") {
      body.innerHTML = buildPathLabelsModalHtml();
    }
  }
}

function initHelpModalTabs() {
  const list = document.querySelector(".help-modal-tabs");
  if (!list || list.dataset.helpTabsBound) return;
  list.dataset.helpTabsBound = "1";
  list.addEventListener("click", (e) => {
    const t = e.target.closest(".help-modal-tab");
    if (!t || !list.contains(t)) return;
    if (t.id === "help-tab-app") setHelpModalPane(HELP_PANE_APP);
    else if (t.id === "help-tab-tech") setHelpModalPane(HELP_PANE_TECH);
    else if (t.id === "help-tab-labels") setHelpModalPane(HELP_PANE_LABELS);
  });
}

window.showHelp = function (pane) {
  const p =
    pane === HELP_PANE_LABELS
      ? HELP_PANE_LABELS
      : pane === HELP_PANE_TECH
        ? HELP_PANE_TECH
        : HELP_PANE_APP;
  const m = document.getElementById("help-modal");
  if (!m) return;
  setHelpModalPane(p);
  m.setAttribute("aria-hidden", "false");
  lockBodyScroll();
  const card = m.querySelector(".help-modal-card");
  if (card && typeof card.focus === "function") card.focus();
};

window.hideHelp = function () {
  const m = document.getElementById("help-modal");
  if (!m) return;
  m.setAttribute("aria-hidden", "true");
  unlockBodyScroll();
  setHelpModalPane(HELP_PANE_APP);
  document.getElementById("path-categories-help-btn")?.setAttribute("aria-expanded", "false");
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

/** When the diagram shows the initial empty panel, align title/body with {@link state._viewpointClearNotice} if set. */
function syncDiagramEmptyPanelCopy() {
  const wrap = document.getElementById("diagram-empty");
  const titleEl = wrap?.querySelector(".diagram-empty-title");
  const subEl = wrap?.querySelector(".diagram-empty-sub");
  if (!wrap || !titleEl || !subEl) return;
  const n = state._viewpointClearNotice;
  if (n && Array.isArray(n.removed) && n.removed.length) {
    titleEl.textContent = "Selections removed for this viewpoint";
    const vp = escapeHtml(n.viewpointName || "This viewpoint");
    const list = n.removed.map(escapeHtml).join(", ");
    subEl.innerHTML = `Switching to <strong>${vp}</strong> cleared types outside this viewpoint\u2019s palette: <strong>${list}</strong>. Add allowed elements from the sidebar or header, then run <strong>Find Path</strong> to see a connection diagram.`;
  } else {
    titleEl.textContent = "Build a path";
    subEl.innerHTML = `Select at least <strong>2 elements</strong>, then click <strong>Find Path</strong>.`;
  }
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
            <span class="el-code-label">Explicit codes:</span>
            ${formatCodePills(outgoing.codesDirect, "—")}
          </div>
          <div class="el-code-block">
            <span class="el-code-label">Inferred codes:</span>
            ${formatCodePills(outgoing.codesDerived, "—")}
          </div>
        </div>
        <div class="el-matrix-col">
          <div class="el-matrix-col-title">Incoming — to <strong>${escapeHtml(name)}</strong></div>
          <p class="el-matrix-partner-line">${inIntro}.${derIn}</p>
          ${inLayers ? `<div class="el-layer-row"><span class="el-layer-label">Sources by layer (direct):</span> ${inLayers}</div>` : ""}
          <div class="el-code-block">
            <span class="el-code-label">Explicit codes:</span>
            ${formatCodePills(incoming.codesDirect, "—")}
          </div>
          <div class="el-code-block">
            <span class="el-code-label">Inferred codes:</span>
            ${formatCodePills(incoming.codesDerived, "—")}
          </div>
        </div>
      </div>
      <p class="el-matrix-footnote">
        <strong>Association</strong> (O) is always permitted between any two elements (§5.2.4) but is not listed in Appendix B’s matrix. ArchiTrek encodes that as optional bridges: with <strong>Semantic rigor</strong> Academic (or Association off in Advanced Logic Overrides), the pathfinder does not use §5.2.4 Association as a bridge; <strong>Explicit vs +Inferred</strong> still controls whether Appendix B explicit-only or §5.7 inferred edges are in the graph. Looser rigor or overrides allow Association as a last resort, flagged in results.
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
  subEl.textContent = subParts.join(" · ") || "ArchiMate 3.2";

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

function resetDiagramPanContext() {}

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

/** Drop path results and modal when the waypoint chain no longer meets Find Path rules. */
function invalidatePathSearchResults() {
  state.segments = null;
  state.pathFailureHints = null;
  state._pathFailModalShownForRunId = null;
  state.edgeConstraintWarning = null;
  if (window.store && typeof window.store.dispatch === "function") {
    window.store.dispatch("CLEAR_EDGE_CONSTRAINTS");
  } else {
    state.edgeConstraints = [];
  }
  hidePathFailureModal();
  hideDiagramNoPathOverlay();
  scheduleRenderResults();
  syncUrlFromState({ push: true });
}

function showPathFailureModal(opts) {
  const modal = document.getElementById("path-fail-modal");
  const body = document.getElementById("path-fail-modal-body");
  const titleEl = document.getElementById("path-fail-modal-title");
  if (!modal || !body || !titleEl) return;
  teardownPickerOverlay();
  closePathOptionsOverlay();
  closePathChromeOverlay();

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
      lead = `<p class="path-fail-modal-lead">You asked for the directed chain <strong>${chainEsc}</strong>. There is no valid route under your current settings for the hop <strong>${nf} → ${nt}</strong> (segment ${fail.index + 1} of ${segmentCount || "?"}) — the Appendix B graph may have no forward path between these elements within the hop limit and search effort, or filters such as <strong>Viewpoint</strong> / <strong>Explicit only</strong> (Search Depth) removed the needed edges.</p>`;
    } else {
      lead = `<p class="path-fail-modal-lead">You asked for <strong>${chainEsc}</strong>. The pathfinder could not build a complete chain under your current limits and options. Try a different order, raise max hops, widen the viewpoint, or relax Search Depth (Explicit / + Inferred) / Association settings.</p>`;
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
    `<li>The search follows <strong>directed</strong> edges (Appendix B tail → head; §5.7 inferred edges only if <strong>+ Inferred</strong> is on). If no edge sequence exists from <strong>${nf}</strong> to <strong>${nt}</strong> within the max hops per segment, the segment is empty.</li>`;
  if (!mmOk) {
    if (!aspectOk && aspectRule?.reason) {
      whyDetails += `<li><strong>§4.2 aspect rule:</strong> ${escapeHtml(aspectRule.reason)}</li>`;
    }
    if (!layerOk && layerRule?.reason) {
      whyDetails += `<li><strong>Layer pattern:</strong> ${escapeHtml(layerRule.reason)}</li>`;
    }
  } else {
    whyDetails += vpF.strict
      ? "<li>For this pair, the core metamodel aspect/layer check is not an automatic “forbidden” hit; remaining blockers include matrix reachability, hop depth, or Explicit-only Search Depth (viewpoint limits are explained in the next bullet).</li>"
      : "<li>For this pair, the core metamodel aspect/layer check is not an automatic “forbidden” hit; the usual blockers are matrix reachability, hop depth, viewpoint palette, or Explicit-only Search Depth.</li>";
  }
  if (vpF.strict) {
    whyDetails += `<li><strong>Viewpoint (${escapeHtml(vpF.name)}):</strong> The routed graph only includes elements in this viewpoint’s palette and matrix entries between allowed types. A “no path” here means no such chain under those limits — not necessarily that every ArchiMate link is forbidden in the full metamodel.</li>`;
  }
  if (pathHints?.derivedWouldHelp) {
    whyDetails +=
      "<li>Automatic check: enabling <strong>+ Inferred</strong> (§5.7) would add traversable edges for this query.</li>";
  }
  if (pathHints?.associationWouldHelp) {
    whyDetails +=
      "<li>Automatic check: allowing <strong>Association</strong> fallback (§5.2.4) would connect under the same limits.</li>";
  }
  if (includeDerived && allowAssociationFallback && !pathHints?.derivedWouldHelp && !pathHints?.associationWouldHelp) {
    whyDetails +=
      "<li>With +Inferred and Association already on, try raising <strong>max hops per segment</strong> or <strong>search effort</strong>, or switch to <strong>All elements</strong>.</li>";
  }
  whyDetails += "</ul>";

  const derivedDisabled = includeDerived ? " disabled" : "";
  const assocDisabled = allowAssociationFallback ? " disabled" : "";
  const relaxBlock = `
    <div class="path-fail-relax-wrap" role="group" aria-label="Expand search one time">
      <p class="path-fail-relax-intro">Same actions as the diagram overlay: run <strong>one</strong> search with relaxed rules. Your saved <strong>Options</strong> are not changed permanently.</p>
      <div class="path-fail-relax-buttons">
        <button type="button" class="path-dead-end__btn path-dead-end__btn--choice"${derivedDisabled} onclick="if(!this.disabled){window.hidePathFailureModal();window.tryRelaxPathDerived();}">🔍 Search with + Inferred (§5.7)</button>
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
  scheduleViewportCulling();
}

let viewportCullingRaf = null;
function scheduleViewportCulling() {
  if (viewportCullingRaf != null) return;
  viewportCullingRaf = requestAnimationFrame(() => {
    viewportCullingRaf = null;
    applyViewportCulling();
  });
}

function applyViewportCulling() {
  const vp = document.getElementById("diagram-pan-viewport");
  const svg = document.querySelector("#path-diagram svg");
  if (!vp || !svg) return;
  const margin = 160;
  const vpRect = vp.getBoundingClientRect();
  const visLeft = vpRect.left - margin;
  const visRight = vpRect.right + margin;
  const visTop = vpRect.top - margin;
  const visBottom = vpRect.bottom + margin;

  const elements = svg.querySelectorAll(".archimate-element");
  for (const el of elements) {
    const prevInline = el.style.display;
    if (prevInline === "none") el.style.display = "";
    let r;
    try {
      r = el.getBoundingClientRect();
    } catch (_) {
      el.style.display = prevInline;
      continue;
    }
    const hasSize = r.width > 0.5 && r.height > 0.5;
    const visible =
      hasSize &&
      r.right >= visLeft &&
      r.left <= visRight &&
      r.bottom >= visTop &&
      r.top <= visBottom;
    el.style.display = visible ? "" : "none";
  }
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
  const panViewportEl = document.getElementById("diagram-pan-viewport");
  if (!panViewportEl || !document.getElementById("path-diagram")) return;
  if (document.documentElement.dataset.diagramPanZoomWired === "1") return;
  document.documentElement.dataset.diagramPanZoomWired = "1";

  function livePanViewport() {
    return document.getElementById("diagram-pan-viewport");
  }

  function livePathDiagram() {
    return document.getElementById("path-diagram");
  }

  const pointers = new Map();
  let activeId = null;
  let start = null;
  let dragged = false;
  let pinchLastDist = 0;
  let pinchMoved = false;
  let docListening = false;
  const thresh = 6;

  function suppressNextDiagramClick() {
    const pd = livePathDiagram();
    if (!pd) return;
    const suppress = (ev) => {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      pd.removeEventListener("click", suppress, true);
    };
    pd.addEventListener("click", suppress, true);
  }

  function clearPanDragState() {
    activeId = null;
    start = null;
    dragged = false;
    livePanViewport()?.classList.remove("diagram-pan--dragging");
  }

  function ensureDocListeners() {
    if (docListening) return;
    document.addEventListener("pointermove", onDocMove, { passive: true });
    document.addEventListener("pointerup", onDocEnd, true);
    document.addEventListener("pointercancel", onDocEnd, true);
    docListening = true;
  }

  function cleanupDocListeners() {
    if (!docListening) return;
    document.removeEventListener("pointermove", onDocMove, { passive: true });
    document.removeEventListener("pointerup", onDocEnd, true);
    document.removeEventListener("pointercancel", onDocEnd, true);
    docListening = false;
  }

  function firstTwoPointers() {
    const it = pointers.values();
    const a = it.next().value;
    const b = it.next().value;
    return a && b ? [a, b] : null;
  }

  function pointerDistance(p1, p2) {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }

  function pointerMidpoint(p1, p2) {
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  }

  function beginPinchGesture() {
    const pair = firstTwoPointers();
    if (!pair) return;
    clearPanDragState();
    pinchLastDist = pointerDistance(pair[0], pair[1]);
    pinchMoved = false;
  }

  function resumePanFromRemainingPointer() {
    if (pointers.size !== 1) return;
    const only = pointers.values().next().value;
    if (!only) return;
    activeId = only.id;
    start = { x: only.x, y: only.y, tx: diagramView.tx, ty: diagramView.ty };
    dragged = false;
  }

  function onDocMove(e) {
    if (pointers.has(e.pointerId)) {
      pointers.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });
    }
    if (pointers.size >= 2) {
      const pair = firstTwoPointers();
      if (!pair) return;
      const dist = pointerDistance(pair[0], pair[1]);
      if (pinchLastDist > 0 && dist > 0) {
        const factor = dist / pinchLastDist;
        if (Math.abs(factor - 1) > 0.001) {
          const mid = pointerMidpoint(pair[0], pair[1]);
          diagramZoomAtPoint(mid.x, mid.y, factor);
          pinchMoved = true;
        }
      }
      pinchLastDist = dist;
      return;
    }
    if (e.pointerId !== activeId || !start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const vp = livePanViewport();
    if (!dragged && dx * dx + dy * dy > thresh * thresh) {
      dragged = true;
      vp?.classList.add("diagram-pan--dragging");
      // Capture only once the user is clearly panning — keeps hop clicks working on pointerdown,
      // but ensures we keep receiving moves even if the pointer leaves the SVG hit geometry.
      if (vp && typeof vp.setPointerCapture === "function") {
        try {
          vp.setPointerCapture(e.pointerId);
        } catch (_) {}
      }
    }
    if (dragged) {
      diagramView.tx = start.tx + dx;
      diagramView.ty = start.ty + dy;
      applyDiagramTransform();
    }
  }

  function onDocEnd(e) {
    const hadPointer = pointers.delete(e.pointerId);
    const vp = livePanViewport();
    if (hadPointer && vp && typeof vp.releasePointerCapture === "function") {
      try {
        if (vp.hasPointerCapture?.(e.pointerId)) vp.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }

    const wasPinching = pinchLastDist > 0;
    if (wasPinching && pointers.size < 2) {
      if (pinchMoved) suppressNextDiagramClick();
      pinchLastDist = 0;
      pinchMoved = false;
      clearPanDragState();
      resumePanFromRemainingPointer();
    }

    if (e.pointerId === activeId) {
      if (dragged) suppressNextDiagramClick();
      clearPanDragState();
    }

    if (pointers.size === 0) cleanupDocListeners();
  }

  function diagramNoPathOverlayOpen() {
    const ov = document.getElementById("diagram-no-path-overlay");
    return ov && !ov.hidden;
  }

  /**
   * Document capture + target containment check: arms pan even when capture does not visit
   * #diagram-pan-viewport the same way for every SVG hit target. Listener is registered in init()
   * after dismissPathPanelFromOutsidePointerIfNeeded so the top drawer still handles outside taps first.
   */
  function onDocumentDiagramPanPointerDownCapture(e) {
    const vp = livePanViewport();
    if (!vp?.isConnected) return;
    let t = e.target;
    if (t && t.nodeType === Node.TEXT_NODE) t = t.parentElement;
    if (!(t instanceof Element)) return;
    if (!vp.contains(t)) return;

    const appLayout0 = document.getElementById("app-layout");
    const ov0 = diagramNoPathOverlayOpen();
    const lt0 = appLayout0?.classList.contains("layout-top");
    const pc0 = appLayout0?.classList.contains("panel-collapsed");
    let skip0 = null;
    if (ov0) skip0 = "no-path-overlay";
    else if (e.pointerType === "mouse" && e.button !== 0) skip0 = "non-primary-button";
    if (diagramNoPathOverlayOpen()) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointers.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });
    ensureDocListeners();
    if (pointers.size === 1) {
      activeId = e.pointerId;
      start = { x: e.clientX, y: e.clientY, tx: diagramView.tx, ty: diagramView.ty };
      dragged = false;
      pinchLastDist = 0;
      pinchMoved = false;
      return;
    }
    beginPinchGesture();
  }

  function onViewportWheelCapture(e) {
    if (diagramNoPathOverlayOpen()) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    diagramZoomAtPoint(e.clientX, e.clientY, factor);
  }

  document.addEventListener("pointerdown", onDocumentDiagramPanPointerDownCapture, true);
  panViewportEl.addEventListener("wheel", onViewportWheelCapture, { passive: false, capture: true });
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
  /* Wire pan/zoom first so diagram dragging works even if a later init step throws (e.g. stack errors in pathfinder self-test). */
  initDiagramPanZoom();
  refreshViewpointSelectFromCatalog();
  wireHeaderViewpointHovercardPositioning();
  wireHeaderThemeHovercardPositioning();

  // Single metamodel instance lives in the explanation panel.
  const mm = document.getElementById('metamodel-diagram');
  if (mm) renderMetamodelDiagram(mm);
  rebuildGraph();
  updateDiagramEmptyChrome();
  syncStoryShuffleButton();

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
  try {
    if (typeof window.initHeaderChromeRichSelects === "function") {
      window.initHeaderChromeRichSelects();
    }
  } catch (e) {
    console.warn("[ArchiTrek] header rich selects init:", e);
  }

  initLayoutChrome();
  initPathOptionsOverlay();
  initPathChromeCollapsible();
  initResultsSplit();
  initPathFailureModal();
  initPathLabelsHelp();
  initHelpModalTabs();

  updateQuickExamplesVisibility();

  applySearchOptionsToUI();
  document.getElementById("btn-direct")?.classList.toggle("active", !state.includeDerived);
  document.getElementById("btn-derived")?.classList.toggle("active", state.includeDerived);
  updatePathOptionsTriggerSummary();

  // Hide initial loading indicator after first paint.
  setLoading(false);

  openPathPanelIfCollapsedForBoot();
}

/** Production value for min loading when search inputs change (restore after local experiments). */
const MIN_FIND_PATH_LOADING_MS_DEFAULT = 1500;
/** Temporary: set to `MIN_FIND_PATH_LOADING_MS_DEFAULT` before shipping (5s is for tuning UX only). */
const MIN_FIND_PATH_LOADING_MS = 5000;

/** Stable fingerprint of current find-path inputs (waypoints, mode, options, constraints). */
function getFindPathInputFingerprintForNextRun() {
  const plain = getPlainAppState();
  const wps = Array.isArray(plain.waypoints) ? plain.waypoints : [];
  const waypointElements = wps.map((wp) => (wp && wp.element) || "");
  const forceFullMetamodel = !!state._pathfindFullMetamodelOnce;
  const opt = getSearchPathOptions({ forceFullMetamodel });
  const allowed = opt.allowedRelationshipCodes;
  const optsForJson = {
    ...opt,
    allowedRelationshipCodes:
      allowed instanceof Set ? [...allowed].sort() : allowed,
  };
  return JSON.stringify({
    waypointElements,
    selectionMode: state.selectionMode,
    forceFullMetamodelOnce: forceFullMetamodel,
    opts: optsForJson,
    edgeConstraints: normalizedEdgeConstraintsFromState(),
  });
}

/** Wave-style label for #find-path-btn while pathfinding runs (per-character translateY loop). */
function findPathButtonWaveHtml(visibleLabel) {
  const text = visibleLabel || "Finding…";
  const chars = [...text];
  const inner = chars
    .map((ch, i) => {
      const esc =
        ch === "&"
          ? "&amp;"
          : ch === "<"
            ? "&lt;"
            : ch === ">"
              ? "&gt;"
              : ch === '"'
                ? "&quot;"
                : ch;
      return `<span class="find-path-btn__wave-char" style="--wave-i:${i}">${esc}</span>`;
    })
    .join("");
  return `<span class="find-path-btn__wave-label" aria-hidden="true">${inner}</span>`;
}

function setLoading(on, label = "", opts = {}) {
  const useWave = !!opts.wave;
  state.loading = !!on;
  const bar = document.getElementById('loading-bar');
  if (bar) bar.style.display = on ? 'block' : 'none';

  const btn = document.getElementById('find-path-btn');
  const clearBtn = document.getElementById('clear-all-btn');
  if (btn) {
    if (on) {
      const prev = (btn.textContent || "").trim();
      btn.dataset.prevText = prev || "Find Path";
      const waveLabel = label || "Finding…";
      if (useWave) {
        btn.innerHTML = findPathButtonWaveHtml(waveLabel);
      } else {
        btn.textContent = waveLabel;
      }
      btn.setAttribute("aria-busy", "true");
      btn.setAttribute("aria-label", "Finding path");
      btn.classList.toggle("find-path-btn--wave-active", useWave);
      btn.disabled = true;
    } else {
      btn.classList.remove("find-path-btn--wave-active");
      btn.removeAttribute("aria-busy");
      btn.removeAttribute("aria-label");
      if (btn.dataset.prevText) btn.textContent = btn.dataset.prevText;
      delete btn.dataset.prevText;
      checkReady();
    }
  }
  if (clearBtn) clearBtn.disabled = !!on;
}

/**
 * Call when pathfinding work has finished (success, no path, or early exit): show "Find Path" again
 * and stop the wave, even if a minimum UI delay is still pending before other cleanup runs.
 */
function endFindPathButtonLoadingUi() {
  state.loading = false;
  const bar = document.getElementById("loading-bar");
  if (bar) bar.style.display = "none";
  const clearBtn = document.getElementById("clear-all-btn");
  if (clearBtn) clearBtn.disabled = false;
  const btn = document.getElementById("find-path-btn");
  if (btn) {
    btn.classList.remove("find-path-btn--wave-active");
    btn.removeAttribute("aria-busy");
    btn.removeAttribute("aria-label");
    if (btn.dataset.prevText) {
      btn.textContent = btn.dataset.prevText;
      delete btn.dataset.prevText;
    }
    checkReady();
  }
}

// ── Graph ───────────────────────────────────────────────────────────────────

function rebuildGraph() {
  state.graph = buildGraph({
    allowedElements: effectiveAllowedElements(),
    includeDerived:  state.includeDerived,
  });
}

// ── Viewpoint ───────────────────────────────────────────────────────────────

/**
 * Fills #viewpoint-select from {@link getViewpointSelectGroups} and {@link VIEWPOINTS}
 * so every catalogued viewpoint stays visible without duplicating labels in index.html.
 * Viewpoints missing from the grouped list are appended at the end (ungrouped) as a safety net.
 */
function refreshViewpointSelectFromCatalog() {
  const sel = document.getElementById("viewpoint-select");
  if (!sel || typeof VIEWPOINTS === "undefined" || !VIEWPOINTS) return;

  const prev = String(sel.value || "");
  sel.replaceChildren();

  const allOpt = document.createElement("option");
  allOpt.value = "";
  allOpt.textContent = "All elements";
  sel.appendChild(allOpt);

  const catalogued = new Set();
  const groups =
    typeof getViewpointSelectGroups === "function" ? getViewpointSelectGroups() : null;

  if (Array.isArray(groups)) {
    for (const g of groups) {
      const keys = g?.keys;
      const groupLabel = g?.label;
      if (!Array.isArray(keys) || keys.length === 0) continue;
      const og = document.createElement("optgroup");
      og.label = String(groupLabel || "").trim() || "Viewpoints";
      for (const rawKey of keys) {
        const key = String(rawKey || "").trim();
        if (!key) continue;
        const vp = VIEWPOINTS[key];
        if (!vp) continue;
        catalogued.add(key);
        const opt = document.createElement("option");
        opt.value = key;
        opt.textContent = vp.name || key;
        og.appendChild(opt);
      }
      if (og.childElementCount > 0) sel.appendChild(og);
    }
  }

  for (const key of Object.keys(VIEWPOINTS)) {
    if (catalogued.has(key)) continue;
    const vp = VIEWPOINTS[key];
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = vp?.name || key;
    sel.appendChild(opt);
  }

  const hasPrev = prev !== "" && [...sel.options].some((o) => o.value === prev);
  sel.value = hasPrev ? prev : "";

  const vpCount = Object.keys(VIEWPOINTS).length;
  const optionCount = [...sel.options].filter((o) => o.value).length;
  if (optionCount !== vpCount) {
    console.error(
      "[viewpoints] Viewpoint dropdown out of sync:",
      optionCount,
      "options vs",
      vpCount,
      "VIEWPOINTS entries"
    );
  }

  copyViewpointSelectOptionsToHeader();
  updateViewpointHelpUi();
}

window.onViewpointChange = function() {
  const main = document.getElementById("viewpoint-select");
  const head = document.getElementById("header-viewpoint-select");
  if (main && head) {
    if (document.activeElement === head) {
      main.value = head.value;
    } else {
      head.value = main.value;
    }
  }
  const key = main ? String(main.value || "").trim() : "";
  if (window.store) {
    window.store.dispatch("SET_VIEWPOINT", key || null);
  } else {
    state.viewpoint = key || null;
  }
  state._perspectiveSuggestFullMetamodel = false;

  if (key && VIEWPOINTS[key] && !VIEWPOINTS[key].allElements) {
    state.allowedElements = new Set(VIEWPOINTS[key].elements);
  } else {
    state.allowedElements = null;
  }

  state._viewpointClearNotice = null;

  // If the viewpoint makes the current selections invalid, clear them.
  // (This also makes the layer selector reflect only layers that still have any allowed elements.)
  const removed = [];
  const layersWithAllowed = getLayersWithAllowedElements(state.allowedElements);
  for (const wp of state.waypoints) {
    if (!wp) continue;
    if (wp.element && state.allowedElements && !state.allowedElements.has(wp.element)) {
      removed.push(wp.element);
      wp.element = null;
    }
    if (wp.layer && state.allowedElements && !layersWithAllowed.has(wp.layer)) {
      if (wp.element) removed.push(wp.element);
      wp.layer = null;
      wp.element = null;
    }
  }

  rebuildGraph();
  // Rerender all waypoint element pickers to reflect dimmed elements
  renderWaypointChain();
  updatePathOptionsTriggerSummary();
  updateViewpointHelpUi();
  checkReady();

  const hadSegments = Array.isArray(state.segments);
  const vpDisplayName =
    key && typeof VIEWPOINTS !== "undefined" && VIEWPOINTS[key]
      ? VIEWPOINTS[key].name || key
      : key || "Current viewpoint";

  if (hadSegments && isPathSearchInputReady()) {
    window.dispatch({ type: "FIND_PATH", reason: "viewpoint-change" });
  } else if (hadSegments && !isPathSearchInputReady()) {
    if (removed.length) {
      state._viewpointClearNotice = {
        removed: [...new Set(removed)],
        viewpointName: vpDisplayName,
        viewpointKey: key || null,
      };
    }
    invalidatePathSearchResults();
  } else if (!hadSegments && removed.length) {
    state._viewpointClearNotice = {
      removed: [...new Set(removed)],
      viewpointName: vpDisplayName,
      viewpointKey: key || null,
    };
    scheduleRenderResults();
  }

  schedulePersistSession();
  syncUrlFromState({ push: true });
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
  const wps = getPlainAppState().waypoints;
  const existing = Array.isArray(wps) ? wps[index] : undefined;
  if (existing && typeof existing === "object") {
    state.waypoints[index] = {
      layer: existing.layer ?? null,
      element: existing.element ?? null,
      label: typeof existing.label === "string" ? existing.label : label,
    };
    return;
  }
  state.waypoints[index] = { layer: null, element: null, label };
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
  ensurePathControlsVisibleUnlessAlreadyOpen();
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
  syncUrlFromState({ push: true });
  // Only add/focus the new waypoint card. Picker opens on explicit click.
  requestAnimationFrame(() => {
    const chain = document.getElementById("waypoint-chain");
    const card = chain?.querySelector(`.waypoint-card[data-waypoint-index="${insertAt}"]`);
    const trigger = card?.querySelector(".element-trigger");
    if (card && typeof card.scrollIntoView === "function") {
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    if (trigger && typeof trigger.focus === "function") {
      trigger.focus({ preventScroll: true });
    }
  });
  return insertAt;
};

window.clearAllElements = function() {
  // Clear data
  state.waypoints = [];
  const baseLabel = state.selectionMode === "set" ? "Point" : "Start";
  const endLabel = state.selectionMode === "set" ? "Point" : "End";
  addWaypointSlot(0, baseLabel);
  addWaypointSlot(1, endLabel);
  state._viewpointClearNotice = null;
  state.segments = null;
  state.pathFailureHints = null;
  state.lastPathIsFallback = false;
  state.lastPathTemporaryRelaxation = null;
  state._relaxOneShotRestore = null;
  state.edgeConstraintWarning = null;
  if (window.store && typeof window.store.dispatch === "function") {
    window.store.dispatch("CLEAR_EDGE_CONSTRAINTS");
  } else {
    state.edgeConstraints = [];
  }
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
  state._diagramNeedsCameraReset = false;
  resetDiagramView();
  if (emptyEl) emptyEl.style.display = 'flex';
  syncDiagramEmptyPanelCopy();
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
  syncUrlFromState({ push: true });
};

function removeWaypoint(index, { animate = true, suppressSearch = false, after = null } = {}) {
  // Always keep at least 2 points.
  if (state.waypoints.length <= 2) return;
  const commit = () => {
    state.waypoints.splice(index, 1);
    renderWaypointChain();
    checkReady();
    if (!suppressSearch && state.segments) {
      if (isPathSearchInputReady()) {
        window.dispatch({ type: "FIND_PATH", reason: "remove-waypoint" });
      } else {
        invalidatePathSearchResults();
      }
    }
    syncUrlFromState({ push: true });
    if (typeof after === "function") after();
  };
  if (!animate) {
    commit();
    return;
  }
  animateWaypointCardOut(index, commit);
}

/**
 * Reorder waypoints without mutating the store-backed proxy in-place: splice/swap on `state.waypoints`
 * emits many INTERNAL_SET_AT_PATH updates and the waypoint editor subscriber can call
 * renderWaypointChain() mid-mutation (empty/partial #waypoint-chain).
 */
function cloneWaypointListForReorder() {
  const plain = getPlainAppState().waypoints;
  const wps = Array.isArray(plain) ? plain : [];
  return wps.map((wp) =>
    wp != null && typeof wp === "object" ? { ...wp } : { layer: null, element: null }
  );
}

function commitWaypointListReplace(nextList) {
  if (!Array.isArray(nextList)) return;
  if (window.store && typeof window.store.dispatch === "function") {
    window.store.dispatch("UPDATE_WAYPOINTS", nextList);
  } else {
    state.waypoints = nextList;
  }
}

function moveWaypoint(index, dir) {
  const len = (() => {
    const plain = getPlainAppState().waypoints;
    return Array.isArray(plain) ? plain.length : 0;
  })();
  const j = index + dir;
  if (j < 0 || j >= len) return;
  const elsBefore = cloneWaypointListForReorder().map((w) => w?.element);
  const next = cloneWaypointListForReorder();
  const tmp = next[index];
  next[index] = next[j];
  next[j] = tmp;
  // #region agent log
  fetch('http://127.0.0.1:7740/ingest/657e0ba7-c505-4241-8c90-51207a13e493',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b73c26'},body:JSON.stringify({sessionId:'b73c26',location:'app.js:moveWaypoint',message:'moveWaypoint commit',data:{hypothesisId:'H_move',index,dir,mode:state.selectionMode,elsBefore,elsNext:next.map((w)=>w?.element)},timestamp:Date.now(),runId:'pre-fix'})}).catch(()=>{});
  // #endregion
  commitWaypointListReplace(next);
  renderWaypointChain();
  if (state.segments) {
    if (isPathSearchInputReady()) window.dispatch({ type: "FIND_PATH", reason: "move-waypoint" });
    else invalidatePathSearchResults();
  }
}

function moveWaypointTo(fromIndex, toIndex) {
  const fi = Math.trunc(Number(fromIndex));
  const ti = Math.trunc(Number(toIndex));
  if (fi === ti) return;
  if (!Number.isInteger(fi) || !Number.isInteger(ti)) return;
  const plainWps = getPlainAppState().waypoints;
  const len = Array.isArray(plainWps) ? plainWps.length : 0;
  if (fi < 0 || fi >= len || ti < 0 || ti >= len) return;
  const next = cloneWaypointListForReorder();
  const [item] = next.splice(fi, 1);
  if (item === undefined) return;
  next.splice(ti, 0, item);
  commitWaypointListReplace(next);
  renderWaypointChain();
  if (state.segments) {
    if (isPathSearchInputReady()) window.dispatch({ type: "FIND_PATH", reason: "move-waypoint-to" });
    else invalidatePathSearchResults();
  }
}

window.swapStartEnd = function() {
  // #region agent log
  fetch('http://127.0.0.1:7740/ingest/657e0ba7-c505-4241-8c90-51207a13e493',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b73c26'},body:JSON.stringify({sessionId:'b73c26',location:'app.js:swapStartEnd',message:'swapStartEnd called',data:{hypothesisId:'H_swap',len:state.waypoints.length,mode:state.selectionMode,els:(getPlainAppState().waypoints||[]).map((w)=>w?.element)},timestamp:Date.now(),runId:'pre-fix'})}).catch(()=>{});
  // #endregion
  const wps = getPlainAppState().waypoints;
  if (!Array.isArray(wps) || wps.length !== 2) return;
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
let waypointChainDelegated = false;
/** >0 while `renderWaypointChain` is mutating the DOM; ignore synthetic `change` on layer selects. */
let waypointChainRenderDepth = 0;
let waypointOpenPicker = null;
let waypointPickerContext = null;
let waypointDragSession = null;
/** Pointerdown on `.element-trigger` waits for slop before reorder (keeps click-to-open picker). */
let waypointDragPending = null;
let waypointSuppressNextTriggerClick = false;

const WAYPOINT_DRAG_THRESHOLD_PX = 6;

function parseWaypointIndexFromNode(node) {
  const card = node instanceof Element ? node.closest(".waypoint-card") : null;
  if (!card) return null;
  const idx = Number(card.dataset.waypointIndex);
  return Number.isFinite(idx) ? idx : null;
}

function clearWaypointDragTargets(chain) {
  if (!chain) return;
  chain.querySelectorAll(".waypoint-drop-target").forEach((el) => el.classList.remove("waypoint-drop-target"));
  chain.querySelectorAll(".waypoint-card.dragging").forEach((el) => el.classList.remove("dragging"));
}

function ensureWaypointChainInteractionDelegation() {
  if (waypointChainDelegated) return;
  waypointChainDelegated = true;

  document.addEventListener("change", (event) => {
    if (waypointChainRenderDepth > 0) return;
    const target = event.target;
    if (!(target instanceof Element) || !target.classList.contains("waypoint-layer-select")) return;
    const idx = parseWaypointIndexFromNode(target);
    if (!Number.isFinite(idx)) return;
    const nextLayer = target.value || null;
    selectLayer(idx, nextLayer);
  });

  document.addEventListener(
    "click",
    (event) => {
      if (!waypointSuppressNextTriggerClick) return;
      const t = event.target;
      if (t instanceof Element && t.closest("#waypoint-chain .element-trigger")) {
        waypointSuppressNextTriggerClick = false;
        event.preventDefault();
        event.stopPropagation();
      } else {
        waypointSuppressNextTriggerClick = false;
      }
    },
    true
  );

  document.addEventListener("click", (event) => {
    const rawTarget = event.target;
    const target =
      rawTarget instanceof Element
        ? rawTarget
        : rawTarget instanceof Node
          ? rawTarget.parentElement
          : null;
    if (!(target instanceof Element)) return;

    const trigger = target.closest(".element-trigger");
    if (trigger instanceof Element) {
      const idx = parseWaypointIndexFromNode(trigger);
      if (!Number.isFinite(idx) || typeof waypointOpenPicker !== "function") return;
      const layerId = state.waypoints?.[idx]?.layer ?? null;
      waypointOpenPicker(trigger, idx, layerId);
      return;
    }

    const moveBtn = target.closest(".waypoint-move");
    if (moveBtn instanceof HTMLButtonElement) {
      const idx = parseWaypointIndexFromNode(moveBtn);
      if (!Number.isFinite(idx)) return;
      const action = String(moveBtn.dataset.action || "");
      // #region agent log
      fetch('http://127.0.0.1:7740/ingest/657e0ba7-c505-4241-8c90-51207a13e493',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b73c26'},body:JSON.stringify({sessionId:'b73c26',location:'app.js:waypoint-move-click',message:'waypoint-move click',data:{hypothesisId:'H_click',idx,action,delta:String(moveBtn.dataset.delta||''),mode:state.selectionMode},timestamp:Date.now(),runId:'pre-fix'})}).catch(()=>{});
      // #endregion
      if (action === "swap") {
        window.swapStartEnd();
        return;
      }
      const delta = Number(moveBtn.dataset.delta);
      if (Number.isFinite(delta) && delta !== 0) {
        moveWaypoint(idx, delta);
      }
      return;
    }

    const rmBtn = target.closest(".waypoint-remove");
    if (rmBtn instanceof HTMLButtonElement) {
      const idx = parseWaypointIndexFromNode(rmBtn);
      if (!Number.isFinite(idx)) return;
      removeWaypoint(idx);
    }
  });

  document.addEventListener(
    "dragstart",
    (event) => {
      const t = event.target;
      if (!(t instanceof Element)) return;
      if (t.closest("#waypoint-chain") && t.closest(".waypoint-card")) {
        event.preventDefault();
      }
    },
    true
  );

  document.addEventListener("pointerdown", (event) => {
    if (!(event.target instanceof Element)) return;
    const chain = document.getElementById("waypoint-chain");
    if (!chain || !chain.contains(event.target)) return;

    const handle = event.target.closest(".drag-handle");
    const trigger = event.target.closest(".element-trigger");
    if (!handle && !trigger) return;

    const card = (handle || trigger).closest(".waypoint-card");
    if (!(card instanceof Element)) return;
    const fromIndex = Number(card.dataset.waypointIndex);
    if (!Number.isFinite(fromIndex)) return;

    if (trigger && !handle) {
      waypointDragPending = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        chain,
        card,
        fromIndex,
        captureEl: trigger,
      };
      return;
    }

    event.preventDefault();
    clearWaypointDragTargets(chain);
    card.classList.add("dragging");

    waypointDragSession = {
      pointerId: event.pointerId,
      fromIndex,
      chain,
      activeCard: card,
      overIndex: null,
      suppressPickerClickAfter: false,
    };

    if (typeof handle.setPointerCapture === "function") {
      try {
        handle.setPointerCapture(event.pointerId);
      } catch (_) {}
    }
  });

  document.addEventListener("pointermove", (event) => {
    if (waypointDragPending && event.pointerId === waypointDragPending.pointerId) {
      const dx = event.clientX - waypointDragPending.startX;
      const dy = event.clientY - waypointDragPending.startY;
      const th = WAYPOINT_DRAG_THRESHOLD_PX;
      if (dx * dx + dy * dy >= th * th) {
        const pending = waypointDragPending;
        waypointDragPending = null;
        const { chain, card, fromIndex, captureEl } = pending;
        event.preventDefault();
        clearWaypointDragTargets(chain);
        card.classList.add("dragging");
        waypointDragSession = {
          pointerId: event.pointerId,
          fromIndex,
          chain,
          activeCard: card,
          overIndex: null,
          suppressPickerClickAfter: true,
        };
        if (typeof captureEl.setPointerCapture === "function") {
          try {
            captureEl.setPointerCapture(event.pointerId);
          } catch (_) {}
        }
      }
    }

    if (!waypointDragSession || event.pointerId !== waypointDragSession.pointerId) return;
    const chain = waypointDragSession.chain;
    const under = document.elementFromPoint(event.clientX, event.clientY);
    const overCard = under instanceof Element ? under.closest(".waypoint-card") : null;
    clearWaypointDragTargets(chain);
    waypointDragSession.activeCard?.classList.add("dragging");
    if (!(overCard instanceof Element) || !chain.contains(overCard)) {
      waypointDragSession.overIndex = null;
      return;
    }
    const overIndex = Number(overCard.dataset.waypointIndex);
    if (!Number.isFinite(overIndex) || overIndex === waypointDragSession.fromIndex) {
      waypointDragSession.overIndex = null;
      return;
    }
    waypointDragSession.overIndex = overIndex;
    overCard.classList.add("waypoint-drop-target");
  });

  const finishPointerDrag = (event) => {
    if (waypointDragPending && event.pointerId === waypointDragPending.pointerId) {
      waypointDragPending = null;
    }
    if (!waypointDragSession || event.pointerId !== waypointDragSession.pointerId) return;
    const { chain, fromIndex } = waypointDragSession;
    let overIndex = waypointDragSession.overIndex;
    const suppressPickerClickAfter = !!waypointDragSession.suppressPickerClickAfter;
    clearWaypointDragTargets(chain);
    waypointDragSession = null;

    const under = document.elementFromPoint(event.clientX, event.clientY);
    const overCard = under instanceof Element ? under.closest(".waypoint-card") : null;
    if (overCard instanceof Element && chain.contains(overCard)) {
      const ix = Number(overCard.dataset.waypointIndex);
      if (Number.isFinite(ix) && ix !== fromIndex) overIndex = ix;
    }

    if (suppressPickerClickAfter) waypointSuppressNextTriggerClick = true;
    const willMove = Number.isFinite(overIndex) && overIndex !== fromIndex;
    if (willMove) {
      moveWaypointTo(fromIndex, overIndex);
    }
  };

  document.addEventListener("pointerup", finishPointerDrag);
  document.addEventListener("pointercancel", finishPointerDrag);
}

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
  ensureWaypointChainInteractionDelegation();
  const chain = document.getElementById('waypoint-chain');
  if (!chain) return;
  syncWaypointLayersFromElements();
  waypointChainRenderDepth += 1;
  try {
  const animateConstraintReorder =
    Number.isFinite(state._waypointConstraintReorderAnimUntil) &&
    Date.now() <= state._waypointConstraintReorderAnimUntil;
  const overlayRoot = document.getElementById('picker-overlay');
  const restorePicker =
    !!overlayRoot?.classList.contains("open") &&
    waypointPickerContext &&
    Number.isFinite(waypointPickerContext.waypointIdx);
  const restoreContext = restorePicker ? { ...waypointPickerContext } : null;
  chain.innerHTML = '';
  // Store-backed `state.waypoints` is a nested Proxy with a non-array target, so Array.isArray is false
  // and some Array.prototype methods may not iterate — always snapshot plain rows for this render.
  const wpsPlain = getPlainAppState().waypoints;
  const wpsList = Array.isArray(wpsPlain) ? wpsPlain : [];
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
    'Application': '#BFFFFF', 'Technology': '#c1ffb1',
    'Composite': '#e0e0e0', 'Implementation': '#FCE4E4',
  };

  const closeOverlay = () => {
    waypointPickerContext = null;
    teardownPickerOverlay();
  };

  const onEsc = (e) => {
    if (e.key === 'Escape') closeOverlay();
  };

  const openElementOverlay = (anchorEl, waypointIdx, layerId, options = {}) => {
    if (!overlayRoot) return;
    const preservedQuery =
      options && typeof options.query === "string" ? options.query : String(waypointPickerContext?.query || "");
    waypointPickerContext = {
      waypointIdx,
      layerId: layerId ?? null,
      query: preservedQuery,
    };
    closePathOptionsOverlay();
    teardownPickerOverlay();
    overlayRoot.classList.add('open');
    overlayRoot.setAttribute('aria-hidden', 'false');
    overlayRoot.innerHTML = '';
    const backdrop = document.createElement("div");
    backdrop.className = "picker-backdrop";
    backdrop.addEventListener("click", () => closeOverlay());
    overlayRoot.appendChild(backdrop);
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
    search.value = preservedQuery;
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

    const sortElementNamesForBrowse = (names) =>
      [...names].sort((a, b) => {
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

    /**
     * When no waypoint layer is chosen: show everything valid for the active viewpoint.
     * Strict viewpoints → allowed set; all-elements viewpoints (allowedElements null) → full metamodel.
     */
    const viewpointBrowseSorted = (() => {
      if (filterLayerId) return null;
      if (effAllowed && effAllowed.size) return sortElementNamesForBrowse(effAllowed);
      if (!effAllowed) return sortElementNamesForBrowse(Object.keys(ELEMENTS));
      return null;
    })();

    const renderGrid = () => {
      const raw = String(search.value || "").replace(/\u200b/g, "").trim();
      const q = raw.toLowerCase();
      grid.innerHTML = '';

      const addCard = (name) => {
        const allowed = !effAllowed || effAllowed.has(name);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'element-card' +
          (wpsList[waypointIdx]?.element === name ? ' selected' : '') +
          (!allowed ? ' disabled' : '');
        btn.disabled = !allowed;

        // The tile itself is the ArchiMate element shape with label inside.
        // If renderer helpers fail, fall back to plain text so picker remains usable.
        try {
          btn.innerHTML = (window.getElementPickerTileSvg
            ? window.getElementPickerTileSvg(name, 240, 72)
            : (window.getElementMiniSvg ? window.getElementMiniSvg(name, 56) : '')
          );
        } catch (_) {
          btn.innerHTML = `<span class="element-card-fallback-label">${escapeHtml(name)}</span>`;
        }

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
        } else if (!filterLayerId && effAllowed && effAllowed.size === 0) {
          hint = 'This viewpoint has no elements to browse.';
        } else {
          hint = 'No elements available.';
        }
        empty.textContent = hint;
        grid.appendChild(empty);
      }
    };

    search.addEventListener("input", () => {
      if (waypointPickerContext && waypointPickerContext.waypointIdx === waypointIdx) {
        waypointPickerContext.query = String(search.value || "");
      }
      renderGrid();
      scheduleFit();
    });
    pop.appendChild(header);
    pop.appendChild(body);
    overlayRoot.appendChild(pop);

    try {
      renderGrid();
    } catch (_err) {
      grid.innerHTML = "";
      const empty = document.createElement("div");
      empty.className = "element-grid-empty";
      empty.textContent = "Picker failed to render visuals. Type to search, then select from plain labels.";
      grid.appendChild(empty);
    }
    scheduleFit();
    // Do not auto-focus search: keep visual picker cards front-and-center.
  };
  waypointOpenPicker = openElementOverlay;

  wpsList.forEach((wp, i) => {
    const isFirst = i === 0;
    const isLast  = i === wpsList.length - 1;
    const isSetMode = state.selectionMode === 'set';
    const letter = isSetMode ? String(i + 1) : (isFirst ? 'A' : isLast ? String.fromCharCode(65 + wpsList.length - 1) : String.fromCharCode(65 + i));
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
    if (animateConstraintReorder) {
      card.style.transition = "transform 180ms ease, box-shadow 180ms ease";
      card.style.boxShadow = "0 0 0 1px rgba(59,130,246,0.35)";
      requestAnimationFrame(() => {
        card.style.boxShadow = "";
      });
    }
    card.dataset.waypointIndex = String(i);

    // Card header row: drag handle, subtle index, layer (same row), optional Start/End/Via, actions
    const header = document.createElement('div');
    header.className = 'waypoint-card-header' + (isTopLayout ? ' waypoint-card-header--compact' : '');

    // Drag handle (drag-and-drop reordering)
    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.title = 'Drag to reorder';
    handle.textContent = '⋮⋮';
    handle.dataset.dragHandle = "1";
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
    const canMoveDown = i < wpsList.length - 1;
    const isTwoOnly = wpsList.length === 2;

    if (!isSetMode && isTwoOnly && (isFirst || isLast)) {
      const swapBtn = document.createElement('button');
      swapBtn.type = "button";
      swapBtn.className = 'waypoint-move';
      swapBtn.title = 'Swap Start and End';
      swapBtn.textContent = isTopLayout ? '⇄' : '⇅';
      swapBtn.dataset.action = "swap";
      header.appendChild(swapBtn);
    } else {
      const upBtn = document.createElement('button');
      upBtn.type = "button";
      upBtn.className = 'waypoint-move';
      upBtn.title = isTopLayout ? 'Move earlier (left in chain)' : 'Move up';
      upBtn.textContent = isTopLayout ? '←' : '↑';
      upBtn.disabled = !canMoveUp;
      upBtn.dataset.delta = "-1";
      header.appendChild(upBtn);

      const downBtn = document.createElement('button');
      downBtn.type = "button";
      downBtn.className = 'waypoint-move';
      downBtn.title = isTopLayout ? 'Move later (right in chain)' : 'Move down';
      downBtn.textContent = isTopLayout ? '→' : '↓';
      downBtn.disabled = !canMoveDown;
      downBtn.dataset.delta = "1";
      header.appendChild(downBtn);
    }

    // Allow deleting any point as long as 2 remain (applies to both modes).
    if (wpsList.length > 2) {
      const rmBtn = document.createElement('button');
      rmBtn.type = "button";
      rmBtn.className = 'waypoint-remove';
      rmBtn.textContent = '×';
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
      trigger.setAttribute('draggable', 'false');

      const left = document.createElement('span');
      left.className = 'left';
      const iconWrap = document.createElement('span');
      iconWrap.className = 'element-icon';
      if (wp.element) {
        try {
          iconWrap.innerHTML = window.getElementPickerTileSvg
            ? window.getElementPickerTileSvg(wp.element, tileSvgW, tileSvgH)
            : window.getElementMiniSvg
              ? window.getElementMiniSvg(wp.element, tileMini)
              : '';
        } catch (_) {
          iconWrap.innerHTML = `<span class="element-card-fallback-label">${escapeHtml(String(wp.element))}</span>`;
        }
      }
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

      body.appendChild(trigger);
      card.appendChild(body);
    }
    chain.appendChild(card);
  });

  if (restoreContext) {
    const restoreIndex = restoreContext.waypointIdx;
    const restoreCard = chain.querySelector(`.waypoint-card[data-waypoint-index="${restoreIndex}"]`);
    const restoreTrigger = restoreCard?.querySelector(".element-trigger");
    if (restoreTrigger instanceof Element) {
      const restoreLayer = wpsList?.[restoreIndex]?.layer ?? restoreContext.layerId ?? null;
      requestAnimationFrame(() => {
        if (!waypointOpenPicker) return;
        const rootAfter = document.getElementById("picker-overlay");
        // If the user dismissed the picker before this frame, do not reopen (restoreContext is from render start).
        if (!rootAfter?.classList.contains("open")) return;
        if (!waypointPickerContext || waypointPickerContext.waypointIdx !== restoreIndex) return;
        waypointOpenPicker(restoreTrigger, restoreIndex, restoreLayer, { query: restoreContext.query || "" });
      });
    } else {
      closeOverlay();
    }
  }

  checkReady();
  updateQuickExamplesVisibility();
  schedulePersistSession();
  } finally {
    waypointChainRenderDepth -= 1;
  }
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
  const picked = (getPlainAppState().waypoints || []).filter((wp) => wp?.element).length;
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
  const root = document.getElementById("app-layout");
  const prefs = readLayoutPrefs();
  if (prefs?.collapsed || root?.classList.contains("panel-collapsed")) {
    openEditPathControls();
  }
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
  const plain = getPlainAppState().waypoints;
  const cur = Array.isArray(plain) ? plain[waypointIdx] : null;
  const next = layerId || null;
  if (cur && typeof cur === "object") {
    if ((cur.layer ?? null) === next) return;
    const implied = cur.element ? normalizeWaypointLayerForElement(cur.element) : null;
    if (cur.element && implied === next) return;
  }
  state.waypoints[waypointIdx].layer = next;
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

/** Same rule as the Find Path button: set mode needs ≥2 picked elements; ordered needs every slot filled. */
function isPathSearchInputReady() {
  const plain = getPlainAppState();
  const wps = plain.waypoints || [];
  const picked = wps.filter((wp) => wp?.element).length;
  return plain.selectionMode === "set"
    ? picked >= 2
    : wps.every((wp) => wp.element);
}

function checkReady() {
  const minOk = isPathSearchInputReady();
  const btn = document.getElementById("find-path-btn");
  if (btn) btn.disabled = !minOk;
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
  if (state.segments) {
    // Use the same FLIP animation as path-tab switches (renderWithAnimation). Camera reset would skip it.
    window.dispatch({ type: "RENDER_RESULTS" });
  }
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

  const reordered = chain.map((el) => {
    const wp = byEl.get(el);
    if (!wp || typeof wp !== "object") return null;
    const layerFromEl = normalizeWaypointLayerForElement(el);
    return {
      layer: layerFromEl ?? wp.layer ?? null,
      element: wp.element ?? null,
      label: typeof wp.label === "string" ? wp.label : "Point",
    };
  });
  if (reordered.some((wp) => !wp)) return;
  state.waypoints = reordered;
}

function requestWaypointConstraintReorderAnimation() {
  state._waypointConstraintReorderAnimUntil = Date.now() + 280;
}

function syncWaypointSlotsToSolverChainIfPossible() {
  const before = (state.waypoints || []).map((wp) => wp?.element || "");
  reorderWaypointsToMatchLastSolverChainIfPossible();
  const after = (state.waypoints || []).map((wp) => wp?.element || "");
  // #region agent log
  fetch('http://127.0.0.1:7740/ingest/657e0ba7-c505-4241-8c90-51207a13e493',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b73c26'},body:JSON.stringify({sessionId:'b73c26',location:'app.js:syncWaypointSlotsToSolverChainIfPossible',message:'sync solver chain vs panel',data:{hypothesisId:'H_sync',mode:state.selectionMode,before:before.join('|'),after:after.join('|'),changed:before.join('|')!==after.join('|')},timestamp:Date.now(),runId:'pre-fix'})}).catch(()=>{});
  // #endregion
  if (before.join("|") !== after.join("|")) {
    requestWaypointConstraintReorderAnimation();
    renderWaypointChain();
  }
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
    syncWaypointSlotsToSolverChainIfPossible();
  }
  renderWaypointChain();

  // Re-run if we already have results.
  if (state.segments) window.dispatch({ type: "FIND_PATH", reason: "set-selection-mode" });
  schedulePersistSession();
};

// ── Quick Examples ─────────────────────────────────────────────────────────────

window.loadExample = function(waypoints) {
  // waypoints = [{layer, element}, ...]
  ensurePathControlsVisibleUnlessAlreadyOpen();
  if (window.store && typeof window.store.dispatch === "function") {
    window.store.dispatch("CLEAR_EDGE_CONSTRAINTS");
  } else {
    state.edgeConstraints = [];
  }
  state.waypoints = waypoints.map(wp => ({ layer: wp.layer, element: wp.element }));
  renderWaypointChain();
  window.dispatch({ type: "FIND_PATH", reason: "load-example" });
  schedulePersistSession();
  syncUrlFromState({ push: true });
};

// ── Find Path ───────────────────────────────────────────────────────────────

window.findPath = function(opts = {}) {
  // Button uses `onclick="findPath()"` (no runId). `dispatch({ type: "FIND_PATH" })` bumps
  // `_findRunId` then calls `findPath({ runId })`. If we reuse a stale `_findRunId`, the
  // setTimeout body can hit `runId !== state._findRunId` and return without rendering.
  let runId;
  if (Number.isFinite(opts?.runId)) {
    runId = opts.runId;
  } else {
    state._findRunId = (state._findRunId | 0) + 1;
    runId = state._findRunId;
  }
  // Same as renderWaypointChain: `state.waypoints` is a nested Proxy with a non-array target,
  // so Array methods may not iterate — read plain rows from the store.
  const _plainWps0 = getPlainAppState().waypoints;
  const wpsForPick = Array.isArray(_plainWps0) ? _plainWps0 : [];
  const picked = wpsForPick.map((wp) => wp?.element).filter(Boolean);
  const forceFullMetamodel = !!state._pathfindFullMetamodelOnce;
  state.lastAutoOrdered = false;
  state.edgeConstraintWarning = null;

  if (!isPathSearchInputReady()) {
    invalidatePathSearchResults();
    checkReady();
    return;
  }

  let findPathCoalesce = false;
  if (window.store && typeof window.store.beginUndoCoalesce === "function") {
    if (typeof window.store.abortUndoCoalesce === "function") {
      window.store.abortUndoCoalesce();
    }
    window.store.beginUndoCoalesce();
    findPathCoalesce = true;
  }

  const findReason = (opts && typeof opts.reason === "string" && opts.reason) || "";
  const recomputeKeepWaypointChain = findReason === "edge-flip-recompute";
  /** Same waypoints + constraint tweak: keep hop disambiguation; full find clears it. */
  const preserveUserChoices =
    findReason === "edge-flip" || recomputeKeepWaypointChain;
  if (preserveUserChoices && state._pendingEdgeFlipUserChoice?.code) {
    state._pendingEdgeFlipUserChoice.applyOnRunId = runId;
  }

  trackEvent("find_path", {
    selectionMode: state.selectionMode,
    includeDerived: !!state.includeDerived,
    allowAssociationFallback: !!state.allowAssociationFallback,
    waypointCount: picked.length,
    reason: findReason || undefined,
  });

  if (!preserveUserChoices) {
    window.state.userChoices = {}; // Reset decisions for the new path
  }

  const fpThisRun = getFindPathInputFingerprintForNextRun();
  const hadPriorCompletedFind = !!state._findPathCompletedOnce;
  const inputsChangedFromLast =
    hadPriorCompletedFind &&
    state._lastFindPathInputKey != null &&
    state._lastFindPathInputKey !== fpThisRun;
  const minFindPathLoadingMs =
    hadPriorCompletedFind && inputsChangedFromLast ? MIN_FIND_PATH_LOADING_MS : 0;

  try {
    const tFindPathLoadingStart = performance.now();
    setLoading(true, "Finding…", { wave: true });
    if (!preserveUserChoices) {
      state.userChoices = {}; // Clear previous decisions
    }
    // Allow browser to paint loading state before doing BFS work.
    setTimeout(() => {
    let usedFullMetamodelOnce = false;
    let findPathRunApplied = false;
    try {
    // If a newer run started while we were waiting for the UI to paint, ignore this callback.
    if (runId !== state._findRunId) {
      clearPendingEdgeFlipUserChoiceIfForRun(runId);
      return;
    }
    if (!isPathSearchInputReady()) {
      clearPendingEdgeFlipUserChoiceIfForRun(runId);
      invalidatePathSearchResults();
      checkReady();
      return;
    }
    const _plainWps = getPlainAppState().waypoints;
    const wpsPlain = Array.isArray(_plainWps) ? _plainWps : [];
    const picked = wpsPlain.map((wp) => wp?.element).filter(Boolean);
    if (!state._relaxOneShotRestore) {
      state.lastPathTemporaryRelaxation = null;
    }

    let segs = [];
    let pathIsFallback = false;
    let chainForExplain = null;
    let edgeConstraintsRelaxed = false;
    let relaxedConstraintCount = 0;

    if (!preserveUserChoices) {
      state.userChoices = {}; // Clear previous decisions
    }
    state.lastAutoOrderMetrics = null;
    const searchGraph = forceFullMetamodel
      ? buildGraph({ allowedElements: null, includeDerived: state.includeDerived })
      : state.graph;
    usedFullMetamodelOnce = forceFullMetamodel;
    const searchOptions = {
      ...getSearchPathOptions({ forceFullMetamodel }),
      edgeConstraints: normalizedEdgeConstraintsFromState(),
    };
    let searchStatus = "no_path";
    if (state.selectionMode === 'set' && !recomputeKeepWaypointChain) {
      const res = findBestChainForSet(searchGraph, picked, searchOptions);
      segs = res?.segments ?? [];
      pathIsFallback = !!res?.isFallback;
      searchStatus = String(res?.searchStatus || "no_path");
      chainForExplain = res?.orderedPoints ?? null;
      edgeConstraintsRelaxed = !!res?.edgeConstraintsRelaxed;
      relaxedConstraintCount = Math.max(0, Number(res?.relaxedConstraintCount) || 0);
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
      if (chainForExplain?.length) {
        // #region agent log
        fetch('http://127.0.0.1:7740/ingest/657e0ba7-c505-4241-8c90-51207a13e493',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b73c26'},body:JSON.stringify({sessionId:'b73c26',location:'app.js:findPath-before-sync',message:'set mode before syncWaypointSlots',data:{hypothesisId:'H_sync',findReason,chainPreview:(chainForExplain||[]).slice(0,8)},timestamp:Date.now(),runId:'pre-fix'})}).catch(()=>{});
        // #endregion
        // Manual slot reorder (arrows / drag) must not be overwritten: sync maps slots to the
        // solver’s ordered chain, which would immediately undo move-waypoint / move-waypoint-to.
        const skipSlotSync =
          findReason === "move-waypoint" || findReason === "move-waypoint-to";
        if (!skipSlotSync) syncWaypointSlotsToSolverChainIfPossible();
      }
    } else {
      const waypointNames = wpsPlain.map((wp) => wp.element);
      chainForExplain = waypointNames;
      const fp = findPaths(searchGraph, waypointNames, searchOptions);
      segs = fp.segments;
      pathIsFallback = !!fp.isFallback;
      searchStatus = String(fp?.searchStatus || "no_path");
    }

    let hasNoPath = !segs || segs.length === 0 || segs.some(s => !s.paths || s.paths.length === 0);
    if (!hasNoPath && edgeConstraintsRelaxed) {
      if (window.store && typeof window.store.dispatch === "function") {
        window.store.dispatch("CLEAR_EDGE_CONSTRAINTS");
      } else {
        state.edgeConstraints = [];
      }
      const count = relaxedConstraintCount > 0 ? relaxedConstraintCount : 1;
      state.edgeConstraintWarning =
        count === 1
          ? "A pinned relationship direction was too restrictive and was unpinned for this path."
          : `${count} pinned relationship directions were too restrictive and were unpinned for this path.`;
    }

    // Guard against stale async completion (e.g. user toggles options rapidly).
    if (runId !== state._findRunId) {
      clearPendingEdgeFlipUserChoiceIfForRun(runId);
      return;
    }

    state.segments = segs;
    state.lastPathSearchStatus = searchStatus;
    state.lastPathIsFallback = !hasNoPath && pathIsFallback;
    state.pendingConstraintRecompute = false;
    state.pendingConstraintRecomputeCount = 0;
    state.pendingConstraintRecomputeSinceRunId = null;

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
    if (!recomputeKeepWaypointChain) {
      state.activePathIdx = 0;
    } else if (state.segments?.length) {
      const maxAlts = Math.max(...state.segments.map((s) => s.paths.length), 1);
      state.activePathIdx = Math.max(0, Math.min(Number(state.activePathIdx) || 0, maxAlts - 1));
    } else {
      state.activePathIdx = 0;
    }
    computeAndSetPathFailureHints(
      hasNoPath,
      picked,
      wpsPlain.map((wp) => wp.element)
    );
    applyRelaxOneShotRestore();

    if (!hasNoPath) {
      if (findReason === "edge-flip") {
        // Refresh breadcrumb chips when connect-set reordering or slot sync changed waypoint order.
        renderWaypointChain();
      } else {
        state._diagramNeedsCameraReset = true;
      }
    }

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
    if (findReason === "edge-flip") {
      if (hasNoPath) {
        clearPendingEdgeFlipUserChoiceIfForRun(runId);
      } else {
        applyPendingEdgeFlipUserChoiceAfterPathResolved(runId);
      }
    }
    // Single render after all state (including session extras) is applied.
    scheduleRenderResults();
    syncUrlFromState({ push: true });
    findPathRunApplied = true;
    } finally {
      if (findPathRunApplied) {
        state._findPathCompletedOnce = true;
        state._lastFindPathInputKey = fpThisRun;
      }
      endFindPathButtonLoadingUi();
      const elapsed = performance.now() - tFindPathLoadingStart;
      const extraWait =
        minFindPathLoadingMs > 0 ? Math.max(0, minFindPathLoadingMs - elapsed) : 0;
      const finishFindPathLoading = () => {
        applyRelaxOneShotRestore();
        if (usedFullMetamodelOnce) {
          state._pathfindFullMetamodelOnce = false;
          rebuildGraph();
        }
        schedulePersistSession();
        if (findPathCoalesce && window.store && typeof window.store.endUndoCoalesce === "function") {
          try {
            window.store.endUndoCoalesce();
          } catch (_) {}
        }
      };
      if (extraWait > 0) setTimeout(finishFindPathLoading, extraWait);
      else finishFindPathLoading();
    }
    }, 0);
  } catch (e) {
    if (findPathCoalesce && window.store && typeof window.store.endUndoCoalesce === "function") {
      try {
        window.store.endUndoCoalesce();
      } catch (_) {}
    }
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

/**
 * HTML table: every composite route alternative with total syntax cost and rank
 * (same tie order as the help text: cost → hops → fewer inferred hops).
 * @param {{ all: any[] }|null|undefined} [groupedPre] — reuse clusterPaths() result if already computed
 */
function buildPathAlternativesRankingTableHtml(segments, activePathIdx, groupedPre) {
  if (!Array.isArray(segments) || segments.length === 0) return "";
  const grouped =
    groupedPre ??
    (typeof clusterPaths === "function" ? clusterPaths(segments, getSearchPathOptions()) : null);
  const { all } = grouped || {};
  if (!all?.length) return "";

  const so = getSearchPathOptions();
  const cogOn = so.cognitiveLoadPenalty !== false;
  const wLegend = cogOn
    ? `Per-hop weights: explicit <strong>${so.pathWeightDirect}</strong>, inferred <strong>${so.pathWeightDerived}</strong>, Association <strong>${so.pathWeightAssociation}</strong>, layer-skip <strong>${so.pathWeightLayerSkip}</strong>, violation <strong>${so.pathViolationPenalty}</strong>. <strong>Syntax</strong> columns and <strong>Syntax Σ</strong> are base-weight totals (no depth multiplier). <strong>Total cost</strong> is the UCS objective (sum of per-segment routing costs), including cognitive-load depth penalty on relationship hops when enabled (grace <strong>${so.penaltyGracePeriod}</strong> hops, growth <strong>${so.penaltyGrowthFactor}</strong>× per extra hop).`
    : `Per-hop weights: explicit <strong>${so.pathWeightDirect}</strong>, inferred <strong>${so.pathWeightDerived}</strong>, Association <strong>${so.pathWeightAssociation}</strong>, layer-skip <strong>${so.pathWeightLayerSkip}</strong>, violation <strong>${so.pathViolationPenalty}</strong>. <strong>Total cost</strong> matches <strong>Syntax Σ</strong> when cognitive-load penalty is off.`;

  const fmtCost = (v) => (Number.isFinite(v) ? String(v) : "—");
  const fmtRouting = (v) => {
    if (!Number.isFinite(v)) return "—";
    const x = Math.round(v * 1000) / 1000;
    return String(Number.isInteger(x) ? x : x.toFixed(3).replace(/\.?0+$/, ""));
  };

  const sorted = [...all].sort((a, b) => {
    const ar = Number.isFinite(a.ucsRoutingTotal) ? a.ucsRoutingTotal : a.totalWeight;
    const br = Number.isFinite(b.ucsRoutingTotal) ? b.ucsRoutingTotal : b.totalWeight;
    if (ar !== br) return ar - br;
    if (a.totalWeight !== b.totalWeight) return a.totalWeight - b.totalWeight;
    if (a.hopCount !== b.hopCount) return a.hopCount - b.hopCount;
    if (a.hasDerived !== b.hasDerived) return a.hasDerived ? 1 : -1;
    return a.pathIndex - b.pathIndex;
  });

  const rows = sorted
    .map((meta, ord) => {
      const rank = ord + 1;
      const isSel = meta.pathIndex === activePathIdx;
      const pathLabel = meta.pathIndex + 1;
      const rowCls = isSel ? " algorithm-path-rank-row--current" : "";
      const aria = isSel ? ' aria-current="true"' : "";
      const cd = meta.costDirect ?? 0;
      const cder = meta.costDerived ?? 0;
      const ca = meta.costAssociation ?? 0;
      const cls = meta.costLayerSkip ?? 0;
      const cv = meta.costViolation ?? 0;
      const syntaxSum = Number.isFinite(meta.totalWeight) ? meta.totalWeight : cd + cder + ca + cls + cv;
      const routeCost = Number.isFinite(meta.ucsRoutingTotal) ? meta.ucsRoutingTotal : syntaxSum;
      return `<tr class="algorithm-path-rank-row${rowCls}"${aria}>
        <td class="algorithm-path-rank-cell--idx">${rank}</td>
        <td class="algorithm-path-rank-cell--idx">${pathLabel}</td>
        <td class="algorithm-path-rank-cell--num algorithm-path-rank-cell--total-cost">${fmtRouting(routeCost)}</td>
        <td class="algorithm-path-rank-cell--num">${fmtCost(cd)}</td>
        <td class="algorithm-path-rank-cell--num">${fmtCost(cder)}</td>
        <td class="algorithm-path-rank-cell--num">${fmtCost(ca)}</td>
        <td class="algorithm-path-rank-cell--num">${fmtCost(cls)}</td>
        <td class="algorithm-path-rank-cell--num">${fmtCost(cv)}</td>
        <td class="algorithm-path-rank-cell--num">${fmtCost(syntaxSum)}</td>
        <td class="algorithm-path-rank-cell--num">${meta.hopCount}</td>
      </tr>`;
    })
    .join("");

  return `<div class="algorithm-path-rank-wrap" role="region" aria-label="Route alternatives ranked by total cost">
    <div class="algorithm-path-rank-title"><strong>All route alternatives</strong> — ranked by <strong>total cost</strong> (UCS routing total; includes cognitive-load depth penalty when enabled), then base syntax total, then hops (same ordering as the perspective list: Route 1 = composite index 0).</div>
    <div class="algorithm-path-rank-weights">${wLegend}</div>
    <div class="algorithm-path-rank-scroll">
    <table class="algorithm-path-rank-table">
      <thead>
        <tr>
          <th scope="col" class="algorithm-path-rank-cell--idx">Rank</th>
          <th scope="col" class="algorithm-path-rank-cell--idx">Route</th>
          <th scope="col" class="algorithm-path-rank-cell--num algorithm-path-rank-cell--total-cost" title="UCS routing total (sum of per-segment costs); includes cognitive-load depth penalty on relationship hops when enabled — this is what ranking uses">Total cost</th>
          <th scope="col" class="algorithm-path-rank-cell--num" title="Appendix B explicit (uppercase) hops × explicit weight">${so.pathWeightDirect}× Explicit</th>
          <th scope="col" class="algorithm-path-rank-cell--num" title="§5.7 inferred (lowercase) hops × inferred weight">${so.pathWeightDerived}× Inferred</th>
          <th scope="col" class="algorithm-path-rank-cell--num" title="§5.2.4 Association bridge hops × association weight">${so.pathWeightAssociation}× Assoc.</th>
          <th scope="col" class="algorithm-path-rank-cell--num" title="Layer-skipping surcharge (per hop meta)">${so.pathWeightLayerSkip}× Layer-skip</th>
          <th scope="col" class="algorithm-path-rank-cell--num" title="Semantic / pedagogy violation add-on (per flagged hop)">${so.pathViolationPenalty}× Violation</th>
          <th scope="col" class="algorithm-path-rank-cell--num" title="Sum of syntax-weight columns (base weights; excludes cognitive depth multiplier)">Syntax Σ</th>
          <th scope="col" class="algorithm-path-rank-cell--num" title="Relationship hops (nodes − 1)">Hops</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    </div>
  </div>`;
}

/** Single grey box: connect-set order visible; cost / UCS math behind Algorithm Details toggle. */
function buildConnectSetTechHtml(metrics, segments, pathIdx, orderedChain) {
  if (!metrics) return "";
  const hops = totalHopsInSegments(segments, pathIdx);
  const grouped =
    typeof clusterPaths === "function"
      ? clusterPaths(segments, getSearchPathOptions())
      : null;
  const selectedMeta = grouped?.byPathIndex?.[String(pathIdx)];
  const so = getSearchPathOptions();
  const routingSelected =
    selectedMeta && Number.isFinite(selectedMeta.ucsRoutingTotal)
      ? selectedMeta.ucsRoutingTotal
      : null;
  const baseSelected =
    selectedMeta && Number.isFinite(selectedMeta.totalWeight) ? selectedMeta.totalWeight : null;
  const scoreStr =
    routingSelected != null
      ? String(Math.round(routingSelected * 1000) / 1000)
      : baseSelected != null
        ? String(baseSelected)
        : Number.isFinite(metrics.totalScore)
          ? String(metrics.totalScore)
          : "—";
  const syntaxBaseSuffix =
    so.cognitiveLoadPenalty !== false &&
    routingSelected != null &&
    baseSelected != null &&
    Math.abs(routingSelected - baseSelected) > 1e-6
      ? ` <span class="connect-set-note-syntax-base" title="Unmultiplied syntax-weight sum">(syntax base ${String(baseSelected)})</span>`
      : "";
  const orderShort = metrics.orderingExact ? "exact ordering" : "heuristic ordering";
  const chainStr =
    orderedChain?.length ? orderedChain.map((n) => String(n).trim()).filter(Boolean).join(" → ") : "";
  const panelOpen = algorithmDetailsPanelInitiallyOpen();
  const headMain = chainStr
    ? `<div class="connect-set-note-tech-chain"><strong>Connect set</strong> · ${chainStr}</div>`
    : `<div class="connect-set-note-tech-chain connect-set-note-tech-chain--titleonly"><strong>Connect set</strong></div>`;
  const btnTitle = panelOpen ? "Hide Routing Math" : "Show Routing Math";
  const btnAria =
    panelOpen ? "Hide routing math details" : "Show routing math details";
  const rankingTable = buildPathAlternativesRankingTableHtml(segments, pathIdx, grouped);
  return `<div class="connect-set-note-tech" role="note">
    <div class="connect-set-note-tech-headrow">
      ${headMain}
      <button type="button" class="algorithm-details-toggle" title="${btnTitle}" aria-label="${btnAria}" aria-expanded="${panelOpen ? "true" : "false"}" onclick="window.toggleAlgorithmDetailsPanel(event)">${ALGORITHM_DETAILS_TOGGLE_SVG}</button>
    </div>
    <div class="algorithm-debug-panel${panelOpen ? " show" : ""}">
      <span class="connect-set-note-tech-line">
        <strong>Total cost</strong> ${scoreStr}${syntaxBaseSuffix}
        <span class="connect-set-note-sep" aria-hidden="true">·</span>
        <strong>Chain</strong> ${hops} hop${hops !== 1 ? "s" : ""}
        <span class="connect-set-note-sep" aria-hidden="true">·</span>
        <strong>Points</strong> ${metrics.pointCount}
        <span class="connect-set-note-sep" aria-hidden="true">·</span>
        ${orderShort}
        <span class="connect-set-note-sep" aria-hidden="true">·</span>
        <strong>UCS</strong> · max ${so.maxDepth} hops/segment
      </span>
      <span class="connect-set-note-tech-hint">Strongest Legal Chain ranking uses weighted syntax cost: explicit = ${so.pathWeightDirect}, inferred = ${so.pathWeightDerived}, Association = ${so.pathWeightAssociation}, layer-skip = ${so.pathWeightLayerSkip}.</span>
      ${rankingTable}
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
    case "Technology-Heavy":
      return "path-badge--layer-tech";
    default:
      return "path-badge--layer-fullstack";
  }
}

function precisionBadgeClassForLabel(precisionLabel) {
  switch (precisionLabel) {
    case "Simplified":
      return "path-badge--precision-executive";
    case "Ground-Truth":
      return "path-badge--precision-ground";
    case "Executive Summary":
      return "path-badge--precision-executive";
    case "Abstracted Topology":
      return "path-badge--precision-abstracted";
    case "Informal Bridge":
      return "path-badge--precision-informal";
    default:
      return "path-badge--precision-ground";
  }
}

function precisionBadgeShortLabel(precisionLabel) {
  switch (precisionLabel) {
    case "Simplified":
      return "Simplified";
    case "Ground-Truth":
      return "Ground-Truth";
    case "Executive Summary":
      return "Simplified";
    case "Abstracted Topology":
      return "Abstracted";
    case "Informal Bridge":
      return "Informal";
    case "Engineering Ground-Truth":
      return "Ground-Truth";
    default:
      return "Ground-Truth";
  }
}

function escapeHtmlAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function precisionTooltip(precisionLabel) {
  if (precisionLabel === "Simplified") {
    return 'Hides the technical "plumbing" to focus on the big picture. Use this when communicating with business stakeholders or when you need a high-level summary of how distant layers connect.';
  }
  return "Follows strict, step-by-step structural relationships. Use this when you need absolute precision for engineering, solution design, or auditing the exact mechanics of how a system is wired.";
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

/**
 * Chip / pill UI for perspective variation coach — matches empty-tab suggestion chips (lead + pills).
 */
function buildPerspectiveCoachActionButton(label, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.onclick = onClick;
  const raw = String(label);

  if (raw.startsWith("Add ")) {
    const elName = raw.slice(4);
    btn.className = "path-perspective-suggestion-chip path-perspective-suggestion-chip--add";
    btn.title = elName;
    btn.innerHTML = `
      <span class="path-perspective-suggestion-plus" aria-hidden="true">+</span>
      <span class="path-perspective-suggestion-text">${escapeHtml(elName)}</span>
    `;
    return btn;
  }
  if (raw.startsWith("Remove ")) {
    const elName = raw.slice(7);
    btn.className = "path-perspective-suggestion-chip path-perspective-suggestion-chip--remove";
    btn.title = `Remove ${elName}`;
    btn.innerHTML = `
      <span class="path-perspective-suggestion-plus path-perspective-suggestion-plus--remove" aria-hidden="true">×</span>
      <span class="path-perspective-suggestion-text">${escapeHtml(elName)}</span>
    `;
    return btn;
  }
  if (raw.startsWith("Replace ")) {
    const rest = raw.slice(8);
    const idx = rest.indexOf(" -> ");
    if (idx !== -1) {
      const fromEl = rest.slice(0, idx);
      const toEl = rest.slice(idx + 4);
      btn.className = "path-perspective-suggestion-chip path-perspective-suggestion-chip--swap";
      btn.setAttribute("title", escapeHtmlAttr(`Replace ${fromEl} with ${toEl}`));
      btn.innerHTML = `
        <span class="path-perspective-suggestion-swap-icon" aria-hidden="true">×+</span>
        <span class="path-perspective-suggestion-text">${escapeHtml(fromEl)} → ${escapeHtml(toEl)}</span>
      `;
      return btn;
    }
  }

  btn.className = "path-perspective-suggestion-chip path-perspective-suggestion-chip--coach-meta";
  btn.innerHTML = `<span class="path-perspective-suggestion-text">${escapeHtml(raw)}</span>`;
  return btn;
}

const PERSPECTIVE_VARIATION_COACH_MAX_ACTIONS = 3;

/**
 * Add/remove/replace suggestions for a single perspective section (swap/remove/add engine).
 */
function appendPerspectiveCoachCrossLensActions(actions, targetSection, grouped, segments, activePathIdx, recCtx) {
  if (!Array.isArray(actions)) return;
  if (actions.length >= PERSPECTIVE_VARIATION_COACH_MAX_ACTIONS) return;
  if (!isPerspectiveBucketSupported(targetSection, recCtx)) return;

  const existingLabels = new Set(actions.map((a) => String(a?.label || "")));
  const primary = buildPerspectiveSuggestions(targetSection, grouped, segments, activePathIdx, recCtx);
  const targetAction = resolvePerspectiveEmptyCta(targetSection, grouped, primary, recCtx, segments, activePathIdx);
  const targetAdd =
    targetAction.mode === "add" && (!primary || primary.length === 0)
      ? buildFallbackPerspectiveAddSuggestions(targetSection, grouped, segments, activePathIdx, recCtx)
      : primary;
  const effectiveAction =
    targetAction.mode === "add" ? { ...targetAction, candidates: targetAdd } : targetAction;
  const extra = buildCoachActionsFromPerspectiveAction(effectiveAction, recCtx);

  for (const a of extra) {
    if (actions.length >= PERSPECTIVE_VARIATION_COACH_MAX_ACTIONS) break;
    if (!a?.label || typeof a.onClick !== "function") continue;
    const lab = String(a.label);
    if (existingLabels.has(lab)) continue;
    actions.push(a);
    existingLabels.add(lab);
  }
}

/**
 * Suggestions from the opposite grouping (A↔B) or both A and B for C — avoids repeating “more of this tab”.
 */
function appendPerspectiveCoachBroadeningActions(actions, sectionId, grouped, segments, activePathIdx, recCtx) {
  const crossOrder =
    sectionId === "A" ? ["B"] : sectionId === "B" ? ["A"] : ["A", "B"];
  for (const target of crossOrder) {
    if (actions.length >= PERSPECTIVE_VARIATION_COACH_MAX_ACTIONS) break;
    appendPerspectiveCoachCrossLensActions(actions, target, grouped, segments, activePathIdx, recCtx);
  }
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

  if (pShare >= 0.8 && pTop.key === "Ground-Truth") {
    const canEnableSimplified = !state.includeDerived;
    const actions = [];
    if (canEnableSimplified) {
      actions.push({
        label: "Turn on inferred relationships (Simplified)",
        onClick: () => setDerived(true),
      });
    }
    appendPerspectiveCoachBroadeningActions(actions, sectionId, grouped, segments, activePathIdx, recCtx);
    if (!actions.length) return null;
    const text = canEnableSimplified
      ? "Most routes here are Ground-Truth: only explicit structural steps. Turn on inferred shortcuts for Simplified storylines, or broaden the story using a suggestion from the opposite lens."
      : "Most routes here are Ground-Truth. Inferred edges are already on; these paths still read as explicit-heavy. Broaden the story with a waypoint change from the opposite lens (see buttons).";
    return { text, actions };
  }

  if (pShare >= 0.8 && pTop.key === "Simplified") {
    const canGroundTruth = state.includeDerived;
    const actions = [];
    if (canGroundTruth) {
      actions.push({
        label: "Use explicit-only routing (Ground-Truth)",
        onClick: () => setDerived(false),
      });
    }
    appendPerspectiveCoachBroadeningActions(actions, sectionId, grouped, segments, activePathIdx, recCtx);
    if (!actions.length) return null;
    const text = canGroundTruth
      ? "Most routes here are Simplified: they use inferred shortcuts. Turn inferred off for strict Ground-Truth hops, or broaden the story from the opposite lens."
      : "Most routes here are Simplified. Broaden the story with a waypoint change from the opposite lens (see buttons).";
    return { text, actions };
  }

  if (lShare >= 0.85 && lTop.key) {
    // Pick another lens and surface concrete add/remove/replace actions from its existing suggestion engine.
    const targetSection = sectionId === "A" ? "B" : sectionId === "B" ? "A" : "A";
    if (!isPerspectiveBucketSupported(targetSection, recCtx)) {
      return null;
    }
    const targetPrimary = buildPerspectiveSuggestions(targetSection, grouped, segments, activePathIdx, recCtx);
    const targetAction = resolvePerspectiveEmptyCta(targetSection, grouped, targetPrimary, recCtx, segments, activePathIdx);
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
    case "Technology-Heavy":
      return "Most hops are in the Technology, Application, or Physical layers.";
    case "Full-Stack Alignment":
      return "Connects upper layers (Motivation/Strategy/Business) with infrastructure (Application and/or Technology), or a balanced mix.";
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
      <p class="path-labels-p">Each group lists path alternatives that share the same <em>layer mix</em> on the route (Motivation/Strategy/Business vs Application vs Technology). Section titles follow your <strong>story theme</strong> when one is selected.</p>
      <p class="path-labels-p">${classifierLine}</p>
      <div class="path-labels-route-grid">
        <div class="path-labels-route-card path-labels-route-card--upper">
          <div class="path-labels-route-card__title">${te(t.A)}</div>
          <p class="path-labels-route-card__text">Every element on the route sits in the upper band (Motivation, Strategy, or Business). There are no Application-only or Technology hops.</p>
          <div class="path-labels-mini-legend" aria-hidden="true">
            <span class="path-labels-mini-swatch" style="background:var(--layer-motivation)"></span>
            <span class="path-labels-mini-swatch" style="background:var(--layer-strategy)"></span>
            <span class="path-labels-mini-swatch" style="background:var(--layer-business)"></span>
          </div>
        </div>
        <div class="path-labels-route-card path-labels-route-card--infra">
          <div class="path-labels-route-card__title">${te(t.B)}</div>
          <p class="path-labels-route-card__text">The route stays in Application and/or Technology (and Implementation). It does not pass through Motivation, Strategy, or Business elements.</p>
          <div class="path-labels-mini-legend" aria-hidden="true">
            <span class="path-labels-mini-swatch" style="background:var(--layer-application)"></span>
            <span class="path-labels-mini-swatch" style="background:var(--layer-technology)"></span>
            <span class="path-labels-mini-swatch" style="background:var(--layer-implementation)"></span>
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
          <span class="path-labels-pill path-labels-pill--tech">Technology-Heavy</span>
          <span class="path-labels-badge-explainer__desc">Most hops are in the Technology, Application, or Physical layers.</span>
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
        <h4 class="path-labels-h">Path precision badges</h4>
      </div>
      <div class="path-labels-precision-grid">
        <div class="path-labels-precision-card path-labels-precision-card--simplified">
          <div class="path-labels-precision-card__head">
            <span class="path-labels-pill path-labels-pill--precision path-labels-pill--precision-simplified">Simplified</span>
          </div>
          <p class="path-labels-precision-card__text">${te(precisionTooltip("Simplified"))}</p>
        </div>
        <div class="path-labels-precision-card path-labels-precision-card--ground">
          <div class="path-labels-precision-card__head">
            <span class="path-labels-pill path-labels-pill--precision path-labels-pill--precision-ground">Ground-Truth</span>
          </div>
          <p class="path-labels-precision-card__text">${te(precisionTooltip("Ground-Truth"))}</p>
        </div>
      </div>
    </div>
  `;
}

window.openPathLabelsModal = function openPathLabelsModal() {
  showHelp(HELP_PANE_LABELS);
  document.getElementById("path-categories-help-btn")?.setAttribute("aria-expanded", "true");
};

window.closePathLabelsModal = function closePathLabelsModal() {
  hideHelp();
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
    B: { intro: "No route currently stays only in Application, Technology, or Implementation.", cta: "Add element to explore infrastructure lens", suggestionsLead: "Closest infrastructure elements to involve" },
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
      return "Infrastructure lens: route hops remain in Application and/or Technology and Implementation.";
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

function getPerspectiveSupportForUi(recCtx = {}) {
  if (!recCtx?.strictViewpoint) return { A: true, B: true, C: true };
  if (typeof getViewpointPerspectiveSupport !== "function") return { A: true, B: true, C: true };
  return getViewpointPerspectiveSupport(normalizeViewpointKey(state.viewpoint));
}

function isPerspectiveBucketSupported(sectionId, recCtx = {}) {
  const support = getPerspectiveSupportForUi(recCtx);
  return !!support?.[sectionId];
}

function applySuggestedViewpoint(viewpointKey) {
  const key = normalizeViewpointKey(viewpointKey);
  if (!key) return;
  const vpSel = document.getElementById("viewpoint-select");
  if (!vpSel) return;
  vpSel.value = key;
  if (typeof window.onViewpointChange === "function") {
    window.onViewpointChange();
  }
  const picked = (state.waypoints || []).filter((wp) => !!wp?.element).length;
  const minOk = state.selectionMode === "set"
    ? picked >= 2
    : (state.waypoints || []).every((wp) => !!wp?.element);
  if (state.segments && minOk) {
    window.dispatch({ type: "FIND_PATH", reason: "perspective-constrained-change-viewpoint" });
  }
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
    if (!partner || partner === "Grouping" || seenPartners.has(partner)) continue;
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
    const pool = ranked.length ? ranked : rows;
    return diversifyRankedRows(pool, { pickCount: 3 }).map(({ profile, ...rest }) => rest);
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
    const pool = ranked.length ? ranked : rows;
    return diversifyRankedRows(pool, { pickCount: 3 }).map(({ profile, ...rest }) => rest);
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
  const usePool = ranked.length ? ranked : pool;
  return diversifyRankedRows(usePool, { pickCount: 3 }).map(({ profile, ...rest }) => rest);
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
    const improved = keepPerspectiveCandidatesThatImproveLens(sectionId, ranked, ctx);
    return improved.length ? improved : ranked.slice(0, 3);
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
  const improved = keepPerspectiveCandidatesThatImproveLens(sectionId, fallbackRanked, ctx);
  return improved.length ? improved : fallbackRanked.slice(0, 3);
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

function migrateLegacyLayerId(layerId) {
  if (layerId == null || layerId === "") return layerId;
  if (layerId === "Physical") return "Technology";
  if (layerId === "Implementation & Migration") return "Implementation";
  return layerId;
}

function normalizeWaypointLayerForElement(elementName) {
  const layer = ELEMENTS?.[elementName]?.layer || null;
  if (!layer) return null;
  return migrateLegacyLayerId(layer);
}

/**
 * Keeps each waypoint's layer field aligned with its selected element. Connect-set reorder,
 * path redraw (e.g. edge-flip), and other flows can leave a stale layer next to an updated chip.
 */
function syncWaypointLayersFromElements() {
  const plain = getPlainAppState().waypoints;
  if (!Array.isArray(plain)) return;
  for (let i = 0; i < plain.length; i++) {
    const el = plain[i]?.element;
    if (!el) continue;
    const implied = normalizeWaypointLayerForElement(el);
    if (!implied) continue;
    const cur = plain[i]?.layer ?? null;
    if (implied !== cur) {
      state.waypoints[i].layer = implied;
    }
  }
}

/** Match `ELEMENTS[].layer` ids (same normalization as waypoint persistence / labels). */
function canonicalLayerIdForWaypoint(layerId) {
  return migrateLegacyLayerId(layerId);
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

function resolvePerspectiveEmptyCta(sectionId, grouped, addSuggestions, ctx = {}, segments = null, activePathIdx = 0) {
  const dominantMode = perspectiveModeIsDominantShare();
  let addsForSwap = Array.isArray(addSuggestions) ? addSuggestions : [];
  if (!addsForSwap.length && segments != null) {
    addsForSwap = buildFallbackPerspectiveAddSuggestions(sectionId, grouped, segments, activePathIdx, ctx);
  }
  const swap = buildPerspectiveSwapCandidates(sectionId, grouped, addsForSwap, ctx);
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
  const viewpointKey = vpCtx.viewpointKey || normalizeViewpointKey(state.viewpoint);
  const viewpointName =
    viewpointKey && VIEWPOINTS?.[viewpointKey]
      ? VIEWPOINTS[viewpointKey].name || viewpointKey
      : (state.viewpoint || "current viewpoint");
  return {
    viewpointKey,
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

window.expandPerspectiveSuggestionsToFullMetamodel = function expandPerspectiveSuggestionsToFullMetamodel(opts = {}) {
  const fromConstrainedBucket = String(opts?.fromConstrainedBucket || "");
  if (fromConstrainedBucket) {
    const ok = window.confirm(
      "Warning: Adding these elements will break your current Viewpoint constraints and revert the canvas to the Full ArchiMate Metamodel."
    );
    if (!ok) return;
  }
  state._perspectiveExpandFromConstrainedTab = fromConstrainedBucket || null;
  state._perspectiveSuggestFullMetamodel = true;
  scheduleRenderResults();
};

window.restorePerspectiveSuggestionsToViewpoint = function restorePerspectiveSuggestionsToViewpoint() {
  state._perspectiveSuggestFullMetamodel = false;
  scheduleRenderResults();
};

let perspectiveAccordionDelegated = false;
function ensurePerspectiveAccordionDelegation() {
  if (perspectiveAccordionDelegated) return;
  perspectiveAccordionDelegated = true;
  const tabsEl = document.getElementById("path-tabs");
  if (!tabsEl) return;
  tabsEl.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const row = target.closest(".path-perspective-item[data-path-index]");
    if (!(row instanceof HTMLButtonElement)) return;
    const idx = Number(row.dataset.pathIndex);
    if (!Number.isFinite(idx)) return;
    selectPath(idx);
  });
}

function renderPerspectiveAccordion(tabsEl, segments, activePathIdx) {
  if (!tabsEl) return { byPathIndex: {} };
  ensurePerspectiveAccordionDelegation();
  const recCtx = createPerspectiveRecommendationContext();
  if (!recCtx.strictViewpoint && state._perspectiveSuggestFullMetamodel) {
    state._perspectiveSuggestFullMetamodel = false;
  }
  const grouped = typeof clusterPaths === "function"
    ? clusterPaths(segments, getSearchPathOptions())
    : { byPerspective: { A: [], B: [], C: [] }, byPathIndex: {}, all: [] };
  const titles = getPerspectiveTitlesForDomain();
  const vpSupport = getPerspectiveSupportForUi(recCtx);
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
    const bucketViewpointSupported = !!vpSupport?.[sectionId];
    const isConstrainedBucket = !!recCtx.strictViewpoint && !bucketViewpointSupported;

    const wrap = document.createElement("details");
    wrap.className = "path-perspective" + (isConstrainedBucket ? " path-perspective--viewpoint-constrained" : "");
    wrap.open = activePerspective ? sectionId === activePerspective : sectionId === "A";
    wrap.innerHTML = `
      <summary class="path-perspective-head">
        <span class="path-perspective-title">${titles[sectionId] || sectionId}</span>
        <span class="path-perspective-head-right">
          ${isConstrainedBucket ? '<span class="path-perspective-scope-tag">Out of scope</span>' : ""}
          <span class="path-perspective-count">${items.length}</span>
        </span>
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
        row.dataset.pathIndex = String(meta.pathIndex);
        row.innerHTML = `
          <span class="path-perspective-item-main">
            <strong>Route ${meta.pathIndex + 1}</strong>
            <span class="hop-badge">${meta.hopCount} hop${meta.hopCount !== 1 ? "s" : ""}</span>
          </span>
          <span class="path-perspective-item-badges">
            <span class="path-badge ${layerBadgeClassForLabel(meta.layerLabel)}" title="${escapeHtmlAttr(layerTooltip(meta.layerLabel))}">${meta.layerLabel}</span>
            <span class="path-badge ${precisionBadgeClassForLabel(meta.precisionLabel)}" title="${escapeHtmlAttr(precisionTooltip(meta.precisionLabel))}">${precisionBadgeShortLabel(meta.precisionLabel)}</span>
          </span>
        `;
        body.appendChild(row);
      }

      const coach = buildPerspectiveVariationCoach(sectionId, items, grouped, segments, activePathIdx, recCtx);
      if (coach) {
        const coachWrap = document.createElement("div");
        coachWrap.className = "path-perspective-coach";
        const coachText = document.createElement("p");
        coachText.className = "path-perspective-suggestion-lead";
        coachText.textContent = coach.text;
        coachWrap.appendChild(coachText);
        if (Array.isArray(coach.actions) && coach.actions.length) {
          const actionRow = document.createElement("div");
          actionRow.className = "path-perspective-suggestion-chips";
          for (const a of coach.actions.slice(0, 3)) {
            if (!a?.label || typeof a?.onClick !== "function") continue;
            actionRow.appendChild(buildPerspectiveCoachActionButton(a.label, () => a.onClick()));
          }
          if (actionRow.childElementCount > 0) coachWrap.appendChild(actionRow);
        }
        body.appendChild(coachWrap);
      }
    } else {
      body.classList.add("path-perspective-body--empty");
      const copy = emptyUi?.[sectionId] || {};
      if (isConstrainedBucket) {
        const focusText =
          typeof describeViewpointLayerFocus === "function"
            ? describeViewpointLayerFocus(state.viewpoint)
            : "the currently allowed layers";
        const alert = document.createElement("div");
        alert.className = "path-perspective-empty-alert";
        const intro = document.createElement("p");
        intro.className = "path-perspective-empty-copy";
        intro.textContent =
          `The active ${recCtx.viewpointName} viewpoint is strictly focused on ${focusText}. ` +
          `Exploring this ${titles[sectionId] || sectionId} perspective would require elements outside the scope of this viewpoint.`;
        alert.appendChild(intro);
        body.appendChild(alert);

        const alternatives = typeof suggestAlternativeViewpoints === "function"
          ? suggestAlternativeViewpoints(sectionId, recCtx.viewpointKey || state.viewpoint, { max: 2 })
          : [];
        if (alternatives.length) {
          const lead = document.createElement("p");
          lead.className = "path-perspective-suggestion-lead";
          lead.textContent = "To explore this perspective, try switching viewpoint:";
          body.appendChild(lead);

          const chips = document.createElement("div");
          chips.className = "path-perspective-suggestion-chips";
          for (const alt of alternatives) {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "path-perspective-suggestion-chip path-perspective-suggestion-chip--viewpoint";
            chip.title = `Switch viewpoint to ${alt.name}`;
            chip.innerHTML = `
              <span class="path-perspective-suggestion-plus" aria-hidden="true">↔</span>
              <span class="path-perspective-suggestion-text">${alt.name}</span>
            `;
            chip.onclick = () => applySuggestedViewpoint(alt.key);
            chips.appendChild(chip);
          }
          body.appendChild(chips);
        }

        if (recCtx.usingFullMetamodel) {
          const restoreBtn = document.createElement("button");
          restoreBtn.type = "button";
          restoreBtn.className = "path-perspective-cta";
          restoreBtn.textContent = "Back to viewpoint-scoped recommendations";
          restoreBtn.onclick = () => window.restorePerspectiveSuggestionsToViewpoint?.();
          body.appendChild(restoreBtn);
        }

        wrap.appendChild(body);
        tabsEl.appendChild(wrap);
        continue;
      }

      const primaryAddSuggestions = buildPerspectiveSuggestions(sectionId, grouped, segments, activePathIdx, recCtx);
      const action = resolvePerspectiveEmptyCta(sectionId, grouped, primaryAddSuggestions, recCtx, segments, activePathIdx);
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

      const shouldShowCta =
        action.mode === "remove" || (action.mode === "add" && addSuggestions.length === 0);
      if (shouldShowCta) {
        const cta = document.createElement("button");
        cta.type = "button";
        cta.className = "path-perspective-cta";
        cta.textContent =
          action.mode === "remove" && action.label
            ? action.label
            : copy.cta || "Add element to explore this perspective";
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
    aria-expanded="false" aria-controls="help-modal"
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
  return `<div class="path-temp-relax-banner" role="status">This route was found with a <strong>one-time</strong> relaxed run (${parts.join(" and ")}). Your saved <strong>Options</strong> (<strong>Explicit vs +Inferred</strong>; <strong>Semantic rigor</strong> / Association) were <strong>not</strong> changed. Use <strong>Find Path</strong> again with your saved options, or open Options if you want relaxed rules to stay on.</div>`;
}

/**
 * True when the active route includes at least one Association hop and each such hop is
 * pedagogy-sanctioned (VIEWPOINTS[].pedagogy / Value/Meaning, or O allowlist).
 */
function activeRouteAssociationHopsAllPedagogySanctioned() {
  const segs = state.segments;
  if (!Array.isArray(segs) || segs.length === 0) return false;
  if (typeof isAssociationHopPedagogySanctioned !== "function") return false;
  const pathIdx = Math.max(0, Number(state.activePathIdx) || 0);
  const baseOpts = {};
  try {
    const vk = state.viewpoint != null ? String(state.viewpoint) : "";
    if (vk && typeof getViewpointRelationshipAllowance === "function") {
      const a = getViewpointRelationshipAllowance(vk);
      if (a && a.size) baseOpts.allowedRelationshipCodes = a;
    }
  } catch (_) {}
  let foundAnyAssoc = false;
  for (const seg of segs) {
    const paths = seg.paths;
    if (!paths || !paths.length) continue;
    const path = paths[Math.min(pathIdx, paths.length - 1)];
    if (!path || path.length < 2) continue;
    for (let i = 1; i < path.length; i++) {
      const step = path[i];
      if (!step?.isAssociation) continue;
      foundAnyAssoc = true;
      const sem = step.semanticHop;
      if (!isAssociationHopPedagogySanctioned(step, sem, { ...baseOpts, resolvedPrimaryCode: "O" })) {
        return false;
      }
    }
  }
  return foundAnyAssoc;
}

function pathFallbackBannerSoftHtml() {
  return `<div class="path-fallback-banner path-fallback-banner--viewpoint-sanctioned" role="status">⚠️ <strong>Association-based route</strong> — the search used §5.2.4 Association where no cheaper Appendix B chain won under your weights. <strong>Every Association hop on this path fits your selected viewpoint</strong> (palette or relationship policy), so it is <strong>not</strong> shown as an informal modeling mistake. Prefer specific Appendix B relationships when they exist.</div>`;
}

function pathFallbackBannerStrictHtml() {
  return `<div class="path-fallback-banner" role="status">⚠️ Fallback Path Used — at least one hop uses penalized Association (§5.2.4), not a specific Appendix B relationship.</div>`;
}

function pathFallbackBannerMergedOneShotHtml(parts) {
  return `<div class="path-fallback-banner" role="status">⚠️ <strong>Fallback path used</strong> — at least one hop uses penalized Association (§5.2.4), not a specific Appendix B relationship. This route was found with a <strong>one-time</strong> relaxed run (${parts.join(" and ")}). Your saved <strong>Options</strong> (<strong>Explicit vs +Inferred</strong>; <strong>Semantic rigor</strong> / Association) were <strong>not</strong> changed. Use <strong>Find Path</strong> again with your saved options, or open <strong>Options</strong> if you want relaxed rules to stay on.</div>`;
}

/**
 * Banners for explanation panel: avoids duplicate Association messaging when one-shot relax
 * and penalized hops both apply — single yellow warning with spec ref + Options guidance.
 */
function buildPathResultBanners() {
  const t = state.lastPathTemporaryRelaxation;
  const hasTemp = t && (t.derived || t.association);
  const isFallback = state.lastPathIsFallback;
  const edgeConstraintWarning = String(state.edgeConstraintWarning || "").trim();
  const pendingRecompute = !!state.pendingConstraintRecompute;
  const pendingRecomputeCount = Math.max(0, Number(state.pendingConstraintRecomputeCount) || 0);
  const mergeAssocOneShot =
    isFallback && hasTemp && t.association;
  const assocSanctioned = activeRouteAssociationHopsAllPedagogySanctioned();

  if (mergeAssocOneShot) {
    if (assocSanctioned) {
      let h = "";
      if (t.derived) {
        h += `<div class="path-temp-relax-banner" role="status">This route was found with a <strong>one-time</strong> relaxed run (§5.7 inferred relations). Your saved <strong>Options</strong> (<strong>Explicit vs +Inferred</strong>; <strong>Semantic rigor</strong> / Association) were <strong>not</strong> changed. Use <strong>Find Path</strong> again with your saved options, or open Options if you want relaxed rules to stay on.</div>`;
      }
      h += pathFallbackBannerSoftHtml();
      return h;
    }
    const parts = [];
    if (t.derived) parts.push("§5.7 derived relations");
    parts.push("Association fallback (§5.2.4)");
    return pathFallbackBannerMergedOneShotHtml(parts);
  }

  let html = "";
  if (pendingRecompute) {
    const repeatFlipText =
      pendingRecomputeCount >= 2
        ? ` You flipped ${pendingRecomputeCount} directions since the last recompute.`
        : "";
    html += `<div class="path-temp-relax-banner path-temp-relax-banner--recompute" role="status">⚠️ Direction flips changed path constraints.${repeatFlipText} This route and explanation may no longer match your intended direction set. <button type="button" class="path-recompute-btn" onclick="window.recomputePathAfterDirectionFlips(event)">Recompute path now</button></div>`;
  }
  if (edgeConstraintWarning) {
    html += `<div class="path-temp-relax-banner" role="status">⚠️ ${escapeHtml(edgeConstraintWarning)}</div>`;
  }
  if (hasTemp) html += buildTemporaryRelaxationBanner();
  if (isFallback) {
    html += assocSanctioned ? pathFallbackBannerSoftHtml() : pathFallbackBannerStrictHtml();
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

  /** Keep diagram toolbar controls aligned with app state after any redraw (e.g. edge-flip re-find). */
  syncDiagramOverlayButton();
  updatePathFlowButton();

  const hasResults = Array.isArray(segments);
  if (hasResults) {
    state._viewpointClearNotice = null;
  }
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
    state._diagramNeedsCameraReset = false;
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
    syncDiagramEmptyPanelCopy();
    updateDiagramEmptyChrome();
    return;
  }

  if (resultsPanel) resultsPanel.classList.remove("results-panel--empty");

  const pickedNames = state.waypoints.map((wp) => wp.element).filter(Boolean);

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
    state._diagramNeedsCameraReset = false;
    resetDiagramView();
    if (viewportWrap) viewportWrap.hidden = false;

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
    const academicDirectBlocked =
      !state.includeDerived &&
      normalizeSearchRigorPreset(state.searchRigorPreset) === "academic" &&
      !state.allowAssociationFallback;
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
            academicDirectBlocked,
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
        academicDirectBlocked: academicDirectBlocked && !blockedByViewpoint,
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

  const diagramWasEmpty = !diagramEl?.querySelector("svg");

  // Render diagram
  try {
    const renderOptions = {
      mode: state.mode,
      segmentPathIndex: pathIdx,
      showHopNumbers: diagramOverlayShowsHop(state.diagramOverlayMode),
      showFlipControls: diagramOverlayShowsFlip(state.diagramOverlayMode),
      relationshipLabelsOnly: diagramOverlayShowsRelNames(state.diagramOverlayMode),
      showLockControls: state.showDiagramLockControls !== false,
      pathFlow: state.pathFlow,
      viewpointName: state.viewpoint ? (VIEWPOINTS?.[state.viewpoint]?.name || state.viewpoint) : "All elements",
      waypointNames: pickedNames,
      waypointElementSet: new Set(pickedNames),
      edgeConstraints: normalizedEdgeConstraintsFromState(),
    };
    if (state._diagramNeedsCameraReset) {
      renderPath(diagramEl, segments, renderOptions);
      state._diagramNeedsCameraReset = false;
      resetDiagramView();
    } else {
      renderWithAnimation(diagramEl, segments, {
        ...renderOptions,
        onAfterAnimation: scheduleViewportCulling,
      });
    }
  } catch (e) {
    console.error('[NAV] renderPath failed', e);
    state._diagramNeedsCameraReset = false;
    diagramEl.innerHTML = `<p style="color:var(--invalid);font-size:13px;padding:12px">Diagram could not be drawn. ${String(e.message || e)}</p>`;
    resetDiagramPanContext();
    resetDiagramView();
  }
  if (
    diagramWasEmpty &&
    diagramEl?.querySelector("svg") &&
    typeof window.matchMedia === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    diagramEl.classList.add("path-diagram--entrance-fade");
    diagramEl.addEventListener(
      "animationend",
      () => {
        diagramEl.classList.remove("path-diagram--entrance-fade");
      },
      { once: true }
    );
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
      staleAfterDirectionFlips: !!state.pendingConstraintRecompute,
    });
    setExplanationRouteColumn(explained.routeColumn);
    explainEl.innerHTML = pathResultBanners + explained.detailColumn + connectSetRoutingFooter;
    explainEl.setAttribute("role", "region");
    explainEl.setAttribute("aria-label", "Pedagogical narrative and path description");
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
    explainEl.setAttribute("role", "region");
    explainEl.setAttribute("aria-label", "Pedagogical narrative and path description");
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
  if (opts.scroll !== true) return;

  const reducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const behavior = reducedMotion ? "auto" : "smooth";

  const runScroll = () => {
    const panel = document.getElementById("explanation-panel");
    if (panel) panel.scrollIntoView({ behavior, block: "nearest" });
    // Scroll the hop’s expanded body (matrix + narrative), not only the step summary — diagram clicks
    // target the arrow, rel-label hit rect, and hop badge; opening <details> needs a frame before layout.
    hopEl.scrollIntoView({ behavior, block: "start", inline: "nearest" });
  };
  requestAnimationFrame(() => requestAnimationFrame(runScroll));
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
  const codes =
    typeof window.appendixMatrixCodesForPathHopIndex === "function"
      ? window.appendixMatrixCodesForPathHopIndex(flat, hopIdx, state.edgeConstraints)
      : stepAtHop?.codes ?? [];
  const codeList = codes.map(c => String(c).toUpperCase());
  const multiHop = codeList.length > 1;
  const edgeCommitted =
    typeof window.edgeChoiceCommittedForHop === "function"
      ? window.edgeChoiceCommittedForHop(hopIdx, codes, state.edgeConstraints)
      : true;
  const primaryCodeRaw =
    multiHop && !edgeCommitted
      ? null
      : typeof window.resolvedRelationshipCodeForHop === "function"
        ? window.resolvedRelationshipCodeForHop(stepAtHop, hopIdx, flat[hopIdx - 1]?.element, state.edgeConstraints)
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
  if (window.store) {
    window.store.dispatch("SET_ACTIVE_PATH", idx);
  } else {
    state.activePathIdx = idx;
  }
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
      const codes =
        typeof window.appendixMatrixCodesForPathHopIndex === "function"
          ? window.appendixMatrixCodesForPathHopIndex(flatSteps, i, state.edgeConstraints)
          : stepAtHop?.codes ?? [];
      const codeList = codes.map((c) => String(c).toUpperCase());
      const multiHop = codeList.length > 1;
      const edgeCommitted =
        typeof window.edgeChoiceCommittedForHop === "function"
          ? window.edgeChoiceCommittedForHop(i, codes, state.edgeConstraints)
          : true;
      const primaryCodeRaw =
        multiHop && !edgeCommitted
          ? null
          : typeof window.resolvedRelationshipCodeForHop === "function"
            ? window.resolvedRelationshipCodeForHop(stepAtHop, i, flatSteps[i - 1]?.element, state.edgeConstraints)
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

function getFlatStepsForFeedback() {
  if (!Array.isArray(state.segments) || state.segments.length === 0) return [];
  return flattenSegments(state.segments, state.activePathIdx ?? 0);
}

/** Same hop metadata as the diagram edge context menu (for header feedback hop picker). */
function getHopMetaForFeedback(hopIndex) {
  const ix = Number(hopIndex);
  if (!Number.isInteger(ix) || ix < 1) return null;
  const flat = getFlatStepsForFeedback();
  if (!flat.length || ix >= flat.length) return null;
  const prev = flat[ix - 1];
  const curr = flat[ix];
  const from = String(prev?.element || "").trim();
  const to = String(curr?.element || "").trim();
  if (!from || !to || from === to) return null;
  const codes =
    typeof window.appendixMatrixCodesForPathHopIndex === "function"
      ? window.appendixMatrixCodesForPathHopIndex(flat, ix, state.edgeConstraints)
      : Array.isArray(curr?.codes)
        ? curr.codes.map((c) => String(c || "").toUpperCase()).filter(Boolean)
        : [];
  const pickerCodes =
    codes.length > 1 && typeof window.relationshipPickerCodesFromMatrixCodes === "function"
      ? window.relationshipPickerCodesFromMatrixCodes(codes)
      : codes;
  const currentCode =
    typeof window.resolvedRelationshipCodeForHop === "function"
      ? String(
          window.resolvedRelationshipCodeForHop(curr, ix, from, state.edgeConstraints) ||
            pickerCodes[0] ||
            ""
        ).toUpperCase()
      : String(pickerCodes[0] || "").toUpperCase();
  return {
    hopIndex: ix,
    from,
    to,
    step: curr,
    relationshipCodes: pickerCodes.map((c) => String(c || "").toUpperCase()).filter(Boolean),
    currentCode,
  };
}

function buildEdgeFromFeedbackHopMeta(meta) {
  if (!meta) return null;
  const source = String(meta.from || "").trim();
  const target = String(meta.to || "").trim();
  if (!source || !target) return null;
  const relCode = String(meta.currentCode || "").trim().toUpperCase();
  const relName =
    typeof RELATIONSHIPS !== "undefined" && RELATIONSHIPS?.[relCode]?.name
      ? RELATIONSHIPS[relCode].name
      : relCode || "Unknown relationship";
  return {
    source: { type: source, name: source },
    target: { type: target, name: target },
    type: relName,
    code: relCode,
    hopIndex: Number(meta.hopIndex),
  };
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
    const effective =
      typeof window.appendixMatrixCodesForPathHopIndex === "function"
        ? window.appendixMatrixCodesForPathHopIndex(flat, i, state.edgeConstraints)
        : step?.codes || [];
    const validPicker =
      effective.length > 1 && typeof window.relationshipPickerCodesFromMatrixCodes === "function"
        ? window.relationshipPickerCodesFromMatrixCodes(effective)
        : effective;
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

const MOBILE_BLOCK_MQ = "(max-width: 767px)";

function isMobileForceDesktopSession() {
  try {
    return sessionStorage.getItem(MOBILE_FORCE_DESKTOP_SESSION_KEY) === "1";
  } catch (_) {
    return false;
  }
}

function syncMobileForceDesktopClass() {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("architrek-force-desktop-shell", isMobileForceDesktopSession());
}

function isMobileBlockedViewport() {
  if (isMobileForceDesktopSession()) return false;
  try {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia(MOBILE_BLOCK_MQ).matches;
    }
  } catch (_) {}
  return typeof window !== "undefined" && window.innerWidth < 768;
}

let __desktopAppStarted = false;

function syncMobileBlockShell() {
  const shell = document.getElementById("app-shell");
  const blocker = document.getElementById("mobile-blocker");
  if (!shell || !blocker) return;
  syncMobileForceDesktopClass();
  const blocked = isMobileBlockedViewport();
  shell.setAttribute("aria-hidden", blocked ? "true" : "false");
  blocker.setAttribute("aria-hidden", blocked ? "false" : "true");
  document.documentElement.classList.toggle("architrek-mobile-gate-active", blocked);
  if ("inert" in shell) shell.inert = blocked;
  if ("inert" in blocker) blocker.inert = !blocked;
  if (blocked) {
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  } else {
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
  }
}

function startDesktopAppFlow() {
  if (__desktopAppStarted) return;
  __desktopAppStarted = true;
  refreshViewpointSelectFromCatalog();
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
}

(function startUi() {
  try {
    syncMobileForceDesktopClass();
    syncMobileBlockShell();

    try {
      const mq = window.matchMedia(MOBILE_BLOCK_MQ);
      const onViewportChange = () => {
        syncMobileBlockShell();
        if (!mq.matches) startDesktopAppFlow();
      };
      if (typeof mq.addEventListener === "function") mq.addEventListener("change", onViewportChange);
      else if (typeof mq.addListener === "function") mq.addListener(onViewportChange);
    } catch (_) {
      window.addEventListener("resize", () => {
        syncMobileBlockShell();
        if (!isMobileBlockedViewport()) startDesktopAppFlow();
      });
    }

    if (isMobileBlockedViewport()) {
      return;
    }
    startDesktopAppFlow();
  } catch (err) {
    console.error("[ArchiTrek] startUi / desktop boot failed:", err);
  }
})();

document.getElementById("feedback-form")?.addEventListener("submit", (e) => {
  e.preventDefault();
  submitFeedbackReport();
});
document.getElementById("header-feedback-btn")?.addEventListener("click", (e) => {
  e.preventDefault();
  openFeedbackModal();
});
document.getElementById("feedback-copy-btn")?.addEventListener("click", () => {
  copyFeedbackReport();
});
document.getElementById("feedback-relationship-submit")?.addEventListener("click", () => {
  submitRelationshipFeedback();
});
document.querySelectorAll('input[name="feedback-rel-category"]').forEach((input) => {
  input.addEventListener("change", () => {
    setRelationshipCategoryWarningVisible(false);
    syncRelationshipFeedbackReplyEmailRow();
  });
});
document.querySelectorAll('input[name="feedback-toolbar-kind"]').forEach((input) => {
  input.addEventListener("change", onToolbarFeedbackKindChange);
});
document.getElementById("feedback-toolbar-hop-select")?.addEventListener("change", () => {
  if (!relationshipFeedbackState.isToolbarEntry) return;
  const sel = document.getElementById("feedback-toolbar-hop-select");
  const ix = Number(sel?.value);
  if (!Number.isFinite(ix) || ix < 1) {
    relationshipFeedbackState.edge = null;
  } else {
    relationshipFeedbackState.edge = buildEdgeFromFeedbackHopMeta(getHopMetaForFeedback(ix));
  }
  updateToolbarRelationshipSummaryText();
});

document.getElementById("mobile-reminder-btn")?.addEventListener("click", () => {
  sendMobileReminder();
});
document.getElementById("mobile-try-anyway-btn")?.addEventListener("click", () => {
  try {
    sessionStorage.setItem(MOBILE_FORCE_DESKTOP_SESSION_KEY, "1");
  } catch (_) {}
  syncMobileForceDesktopClass();
  syncMobileBlockShell();
  startDesktopAppFlow();
});

// Modal close wiring (backdrop / close button / ESC)
document.addEventListener('click', (e) => {
  let el = e.target;
  if (el && el.nodeType === Node.TEXT_NODE) el = el.parentElement;
  if (!(el instanceof Element)) return;
  if (el.closest('[data-feedback-close="1"]')) window.closeFeedbackModal?.();
  if (el.closest('[data-el-close="1"]')) closeElementInfoModal();
  if (el.closest('[data-mm-close="1"]')) closeMetamodelModal();
  if (el.closest('[data-theme-splash-close="1"]')) closeThemeSplashModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (window.closeDiagramDownloadMenu?.()) {
    e.preventDefault();
    return;
  }
  const ts = document.getElementById('theme-splash-modal');
  if (ts && ts.style.display === 'flex') {
    closeThemeSplashModal();
    e.preventDefault();
    return;
  }
  const hm = document.getElementById('help-modal');
  if (hm && hm.getAttribute('aria-hidden') === 'false') {
    hideHelp();
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
    window.closeFeedbackModal?.();
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

function getPathExportDescriptor() {
  return {
    segments: state.segments,
    pathIndex: state.activePathIdx ?? 0,
    relationships: typeof RELATIONSHIPS !== "undefined" ? RELATIONSHIPS : {},
    resolveRelationshipCode:
      typeof window.resolvedRelationshipCodeForHop === "function"
        ? (step, hopIndex) => window.resolvedRelationshipCodeForHop(step, hopIndex)
        : undefined,
  };
}

if (typeof window.initExportController === "function") {
  window.initExportController({
    getState: () => state,
    trackEvent,
    getPathExportDescriptor,
    getShareableUrl: getShareableDiagramUrl,
  });
}

function initDiagramToolbarOptions() {
  const wrap = document.querySelector(".diagram-options-wrap");
  const btn = document.getElementById("btn-diagram-options");
  const pop = document.getElementById("diagram-options-popover");
  if (!wrap || !btn || !pop) return;

  function closeDiagramOptionsMenu() {
    if (pop.hidden) return;
    pop.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    pop.style.top = "";
    pop.style.left = "";
    pop.style.position = "";
    pop.style.zIndex = "";
  }

  function syncOptionsPopoverPosition() {
    if (typeof window.syncFixedPopoverNearAnchor === "function") {
      window.syncFixedPopoverNearAnchor(btn, pop);
    }
  }

  window.__syncDiagramOptionsPopoverPosition = function () {
    if (!pop.hidden) syncOptionsPopoverPosition();
  };

  window.closeDiagramOptionsMenu = closeDiagramOptionsMenu;

  window.toggleDiagramOptions = function (event) {
    if (event?.preventDefault) event.preventDefault();
    if (event?.stopPropagation) event.stopPropagation();
    if (pop.hidden) {
      if (typeof window.closeDiagramDownloadMenu === "function") window.closeDiagramDownloadMenu();
      syncDiagramOptionsFormFromState();
      pop.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      syncOptionsPopoverPosition();
      const firstFocus = pop.querySelector("input");
      if (firstFocus instanceof HTMLElement) firstFocus.focus();
    } else {
      closeDiagramOptionsMenu();
    }
  };

  pop.addEventListener("change", (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLInputElement)) return;

    if (t.name === "diagram-path-flow" && t.type === "radio" && t.checked) {
      const v = t.value;
      if (!PATH_FLOW_ORDER.includes(v)) return;
      state.pathFlow = v;
      try {
        localStorage.setItem(getPathFlowStorageKey(), v);
      } catch (_) {}
      if (state.segments) window.dispatch({ type: "RENDER_RESULTS" });
      schedulePersistSession();
      return;
    }

    if (t.id === "opt-hop-numbers" || t.id === "opt-flip-controls" || t.id === "opt-rel-names") {
      const hopEl = document.getElementById("opt-hop-numbers");
      const flipEl = document.getElementById("opt-flip-controls");
      const relEl = document.getElementById("opt-rel-names");
      if (!hopEl || !flipEl || !relEl) return;

      const next = overlayModeFromChecks(hopEl.checked, flipEl.checked, relEl.checked);
      if (clampDiagramOverlayMode(state.diagramOverlayMode) === next) return;
      state.diagramOverlayMode = next;
      if (state.segments) {
        state._diagramNeedsCameraReset = true;
        window.dispatch({ type: "RENDER_RESULTS" });
      }
      schedulePersistSession();
      return;
    }

    if (t.id === "opt-lock-controls") {
      state.showDiagramLockControls = !!t.checked;
      if (state.segments) {
        state._diagramNeedsCameraReset = true;
        window.dispatch({ type: "RENDER_RESULTS" });
      }
      schedulePersistSession();
    }
  });

  document.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof Node)) return;
    if (wrap.contains(target)) return;
    closeDiagramOptionsMenu();
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    if (pop.hidden) return;
    closeDiagramOptionsMenu();
    btn.focus();
  });
}

initDiagramToolbarOptions();

function initEdgeContextMenu() {
  const host = document.body;
  if (!host) return;

  const menu = document.createElement("div");
  menu.className = "edge-context-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-hidden", "true");
  menu.hidden = true;

  const relWrap = document.createElement("div");
  relWrap.className = "edge-context-menu-submenu-wrap";
  const relTrigger = document.createElement("button");
  relTrigger.type = "button";
  relTrigger.className = "edge-context-menu-item edge-context-menu-item--has-submenu";
  relTrigger.setAttribute("role", "menuitem");
  relTrigger.setAttribute("aria-haspopup", "true");
  relTrigger.setAttribute("aria-expanded", "false");
  relTrigger.innerHTML = `<span class="edge-context-menu-label">Relationship type</span><span class="edge-context-menu-caret" aria-hidden="true">▸</span>`;
  const relPanel = document.createElement("div");
  relPanel.className = "edge-context-submenu";
  relPanel.setAttribute("role", "menu");
  relPanel.hidden = true;
  relWrap.append(relTrigger, relPanel);

  const flipWrap = document.createElement("div");
  flipWrap.className = "edge-context-menu-submenu-wrap";
  const flipBtn = document.createElement("button");
  flipBtn.type = "button";
  flipBtn.className = "edge-context-menu-item edge-context-menu-item--has-submenu";
  flipBtn.setAttribute("role", "menuitem");
  flipBtn.setAttribute("aria-haspopup", "true");
  flipBtn.setAttribute("aria-expanded", "false");
  flipBtn.innerHTML = `<span class="edge-context-menu-label">Flip direction</span><span class="edge-context-menu-caret" aria-hidden="true">▸</span>`;
  const flipPanel = document.createElement("div");
  flipPanel.className = "edge-context-submenu edge-context-submenu--under";
  flipPanel.setAttribute("role", "menu");
  flipPanel.hidden = true;
  flipWrap.append(flipBtn, flipPanel);

  const reportBtn = document.createElement("button");
  reportBtn.type = "button";
  reportBtn.className = "edge-context-menu-item";
  reportBtn.setAttribute("role", "menuitem");
  reportBtn.innerHTML = `<span class="edge-context-menu-label">⚑ Report feedback</span>`;

  const pinBtn = document.createElement("button");
  pinBtn.type = "button";
  pinBtn.className = "edge-context-menu-item";
  pinBtn.setAttribute("role", "menuitem");
  pinBtn.textContent = "Pin current direction";

  const unpinBtn = document.createElement("button");
  unpinBtn.type = "button";
  unpinBtn.className = "edge-context-menu-item";
  unpinBtn.setAttribute("role", "menuitem");
  unpinBtn.textContent = "Unpin forced direction";

  menu.append(relWrap, flipWrap, reportBtn, pinBtn, unpinBtn);
  host.appendChild(menu);

  const stateRef = {
    open: false,
    hopIndex: null,
    from: "",
    to: "",
    relationshipCodes: [],
    reverseRelationshipCodes: [],
    currentCode: "",
    step: null,
  };

  function setItemDisabled(btn, disabled) {
    btn.classList.toggle("is-disabled", !!disabled);
    btn.setAttribute("aria-disabled", disabled ? "true" : "false");
    if (disabled) btn.setAttribute("tabindex", "-1");
    else btn.removeAttribute("tabindex");
  }

  function closeSubmenu() {
    relPanel.hidden = true;
    relTrigger.setAttribute("aria-expanded", "false");
    flipPanel.hidden = true;
    flipBtn.setAttribute("aria-expanded", "false");
  }

  function openRelationshipSubmenu() {
    if (relWrap.hidden) return;
    relPanel.hidden = false;
    relTrigger.setAttribute("aria-expanded", "true");
    flipPanel.hidden = true;
    flipBtn.setAttribute("aria-expanded", "false");
  }

  function openFlipSubmenu() {
    if (flipBtn.getAttribute("aria-disabled") === "true") return;
    flipPanel.hidden = false;
    flipBtn.setAttribute("aria-expanded", "true");
    relPanel.hidden = true;
    relTrigger.setAttribute("aria-expanded", "false");
  }

  function closeMenu() {
    if (!stateRef.open) return;
    stateRef.open = false;
    stateRef.hopIndex = null;
    stateRef.from = "";
    stateRef.to = "";
    stateRef.relationshipCodes = [];
    stateRef.reverseRelationshipCodes = [];
    stateRef.currentCode = "";
    stateRef.step = null;
    menu.hidden = true;
    menu.setAttribute("aria-hidden", "true");
    closeSubmenu();
  }

  function buildRelationshipFeedbackEdgeContext(meta) {
    if (!meta) return null;
    const source = String(meta.from || "").trim();
    const target = String(meta.to || "").trim();
    if (!source || !target) return null;
    const relCode = String(meta.currentCode || "").trim().toUpperCase();
    const relName = relCode ? (RELATIONSHIPS?.[relCode]?.name || relCode) : "Unknown relationship";
    return {
      source: {
        type: source,
        name: source,
      },
      target: {
        type: target,
        name: target,
      },
      type: relName,
      code: relCode,
      hopIndex: Number(meta.hopIndex),
    };
  }

  function getFlatSteps() {
    if (!Array.isArray(state.segments) || state.segments.length === 0) return [];
    return flattenSegments(state.segments, state.activePathIdx ?? 0);
  }

  function getHopMeta(hopIndex) {
    const ix = Number(hopIndex);
    if (!Number.isInteger(ix) || ix < 1) return null;
    const flat = getFlatSteps();
    if (!flat.length || ix >= flat.length) return null;
    const prev = flat[ix - 1];
    const curr = flat[ix];
    const from = String(prev?.element || "").trim();
    const to = String(curr?.element || "").trim();
    if (!from || !to || from === to) return null;
    const codes =
      typeof window.appendixMatrixCodesForPathHopIndex === "function"
        ? window.appendixMatrixCodesForPathHopIndex(flat, ix, state.edgeConstraints)
        : Array.isArray(curr?.codes)
          ? curr.codes.map((c) => String(c || "").toUpperCase()).filter(Boolean)
          : [];
    const pickerCodes =
      codes.length > 1 && typeof window.relationshipPickerCodesFromMatrixCodes === "function"
        ? window.relationshipPickerCodesFromMatrixCodes(codes)
        : codes;
    const currentCode = typeof window.resolvedRelationshipCodeForHop === "function"
      ? String(
          window.resolvedRelationshipCodeForHop(curr, ix, from, state.edgeConstraints) ||
            pickerCodes[0] ||
            ""
        ).toUpperCase()
      : String(pickerCodes[0] || "").toUpperCase();
    return {
      hopIndex: ix,
      from,
      to,
      step: curr,
      relationshipCodes: pickerCodes.map((c) => String(c || "").toUpperCase()).filter(Boolean),
      currentCode,
    };
  }

  function directedConstraintState(from, to) {
    const list = normalizedEdgeConstraintsFromState();
    const hasForward = list.some((c) => c.type === "FORCED_DIRECTION" && c.sourceId === from && c.targetId === to);
    const hasReverse = list.some((c) => c.type === "FORCED_DIRECTION" && c.sourceId === to && c.targetId === from);
    return { hasForward, hasReverse, hasAny: hasForward || hasReverse };
  }

  function relationshipPreviewSvg(code, direction = "forward") {
    const c = String(code || "").toUpperCase();
    const isAssoc = c === "O";
    const isRealization = c === "R";
    const isAggregation = c === "G";
    const isComposition = c === "C";
    const isServing = c === "V";
    const isTriggering = c === "T";
    const isFlow = c === "F";
    const left = direction === "reverse";
    const x1 = left ? 18 : 2;
    const x2 = left ? 2 : 18;
    const dash = isAssoc ? "4 2" : (isServing || isFlow ? "none" : (isRealization ? "3 2" : "none"));
    const head = left
      ? "2,5 6,2 6,8"
      : "18,5 14,2 14,8";
    const diamond = isComposition
      ? (left ? '<polygon points="18,5 15,3 12,5 15,7" fill="#0f172a"/>' : '<polygon points="2,5 5,3 8,5 5,7" fill="#0f172a"/>')
      : isAggregation
        ? (left ? '<polygon points="18,5 15,3 12,5 15,7" fill="white" stroke="#0f172a" stroke-width="1"/>' : '<polygon points="2,5 5,3 8,5 5,7" fill="white" stroke="#0f172a" stroke-width="1"/>')
        : "";
    const arrowHead = isAssoc
      ? ""
      : isTriggering
        ? `<polygon points="${head}" fill="#0f172a"/>`
        : `<polyline points="${head}" fill="none" stroke="#0f172a" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`;
    return `<svg class="edge-context-arrow-preview" viewBox="0 0 20 10" aria-hidden="true"><line x1="${x1}" y1="5" x2="${x2}" y2="5" stroke="#0f172a" stroke-width="1.35" ${dash !== "none" ? `stroke-dasharray="${dash}"` : ""}/>${diamond}${arrowHead}</svg>`;
  }

  function reverseRelationshipCodesForPair(from, to) {
    if (typeof window.reverseRelationshipCodesForDirectedPair === "function") {
      return window.reverseRelationshipCodesForDirectedPair(from, to);
    }
    const mergeFn =
      typeof window.mergeMatrixRowForPair === "function"
        ? window.mergeMatrixRowForPair
        : (typeof mergeMatrixRowForPair === "function" ? mergeMatrixRowForPair : null);
    if (!mergeFn) return [];
    const row = mergeFn(to, from, true);
    const merged = Array.isArray(row?.merged) ? row.merged : [];
    if (!merged.length) return [];
    const upper = merged.map((c) => String(c || "").toUpperCase()).filter(Boolean);
    const picker =
      upper.length > 1 && typeof window.relationshipPickerCodesFromMatrixCodes === "function"
        ? window.relationshipPickerCodesFromMatrixCodes(upper)
        : upper;
    return picker.map((c) => String(c || "").toUpperCase()).filter(Boolean);
  }

  function buildRelationshipSubmenu(codes, hopIndex, currentCode) {
    relPanel.innerHTML = "";
    for (const code of codes) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "edge-context-submenu-item";
      row.setAttribute("role", "menuitemradio");
      const isCurrent = String(code).toUpperCase() === String(currentCode).toUpperCase();
      row.setAttribute("aria-checked", isCurrent ? "true" : "false");
      row.classList.toggle("is-current", isCurrent);
      const relName = RELATIONSHIPS?.[code]?.name || code;
      row.innerHTML = `${relationshipPreviewSvg(code, "forward")}<span>${relName}</span>`;
      row.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof window.setEdgeChoice === "function") {
          window.setEdgeChoice(hopIndex, code);
        }
        closeMenu();
      });
      relPanel.appendChild(row);
    }
  }

  function buildFlipSubmenu(codes, hopIndex, from, to) {
    flipPanel.innerHTML = "";
    for (const code of codes) {
      const relName = RELATIONSHIPS?.[code]?.name || code;
      const row = document.createElement("button");
      row.type = "button";
      row.className = "edge-context-submenu-item";
      row.setAttribute("role", "menuitem");
      row.innerHTML = `${relationshipPreviewSvg(code, "forward")}<span>${relName}</span>`;
      row.title = "Apply reverse direction and commit this relationship.";
      row.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof window.applyEdgeConstraintFlip === "function") {
          window.applyEdgeConstraintFlip(from, to, { relationshipCode: code, hopIndex });
        }
        closeMenu();
      });
      flipPanel.appendChild(row);
    }
  }

  function openMenuAt(clientX, clientY, meta) {
    stateRef.open = true;
    stateRef.hopIndex = meta.hopIndex;
    stateRef.from = meta.from;
    stateRef.to = meta.to;
    stateRef.relationshipCodes = meta.relationshipCodes;
    stateRef.reverseRelationshipCodes = reverseRelationshipCodesForPair(meta.from, meta.to);
    stateRef.currentCode = meta.currentCode;
    stateRef.step = meta.step || null;

    const relCodes = stateRef.relationshipCodes;
    const relEnabled = relCodes.length > 1;
    const relationshipCommitted =
      typeof window.edgeChoiceCommittedForHop === "function"
        ? !!window.edgeChoiceCommittedForHop(stateRef.hopIndex, relCodes, state.edgeConstraints)
        : true;
    relWrap.hidden = !relEnabled;
    setItemDisabled(relTrigger, !relEnabled);
    if (relEnabled) {
      buildRelationshipSubmenu(relCodes, stateRef.hopIndex, stateRef.currentCode);
    } else {
      closeSubmenu();
    }

    const constraintState = directedConstraintState(stateRef.from, stateRef.to);
    const isAssociationSelection = !!meta.step?.isAssociation || stateRef.currentCode === "O";
    let filteredFlipCodes = [];
    if (!isAssociationSelection && stateRef.reverseRelationshipCodes.length > 0) {
      const flat = getFlatSteps();
      const nextConstraints = normalizedEdgeConstraintsFromState()
        .filter((c) => !sameUndirectedEdgePair(c.sourceId, c.targetId, stateRef.from, stateRef.to));
      nextConstraints.push({ sourceId: stateRef.to, targetId: stateRef.from, type: "FORCED_DIRECTION" });
      const validAfterFlip = new Set(
        pickerCodesForHopWithConstraints(flat, stateRef.hopIndex, nextConstraints)
      );
      filteredFlipCodes = stateRef.reverseRelationshipCodes.filter((code) =>
        validAfterFlip.has(String(code || "").toUpperCase())
      );
    }
    const requiresRelationshipChoiceFirst = relEnabled && !relationshipCommitted;
    const canFlip = !requiresRelationshipChoiceFirst && filteredFlipCodes.length > 0;
    const showFlipSection = isAssociationSelection || requiresRelationshipChoiceFirst || canFlip;
    const hasPinnedDirection = constraintState.hasAny;
    const directionalActionsAllowed = !isAssociationSelection;
    const directionChoiceCommitted = !relEnabled || relationshipCommitted;
    const canPinCurrent = directionalActionsAllowed && directionChoiceCommitted && !hasPinnedDirection;
    const showUnpin = directionalActionsAllowed && directionChoiceCommitted && hasPinnedDirection;

    flipWrap.hidden = !showFlipSection;
    if (isAssociationSelection) {
      setItemDisabled(flipBtn, true);
      flipBtn.title = "Association is undirected, so flip is not applicable.";
      flipPanel.innerHTML = "";
      flipPanel.hidden = true;
      flipBtn.setAttribute("aria-expanded", "false");
    } else if (requiresRelationshipChoiceFirst) {
      setItemDisabled(flipBtn, true);
      flipBtn.title = "Choose a relationship type first.";
      flipPanel.innerHTML = "";
      flipPanel.hidden = true;
      flipBtn.setAttribute("aria-expanded", "false");
    } else if (canFlip) {
      setItemDisabled(flipBtn, false);
      flipBtn.title = "";
      buildFlipSubmenu(
        filteredFlipCodes,
        stateRef.hopIndex,
        stateRef.from,
        stateRef.to
      );
    } else {
      setItemDisabled(flipBtn, true);
      flipBtn.title = "";
      flipPanel.innerHTML = "";
      flipPanel.hidden = true;
      flipBtn.setAttribute("aria-expanded", "false");
    }
    pinBtn.hidden = !canPinCurrent;
    setItemDisabled(pinBtn, !canPinCurrent);
    unpinBtn.hidden = !showUnpin;
    setItemDisabled(unpinBtn, !showUnpin);

    menu.hidden = false;
    menu.setAttribute("aria-hidden", "false");
    menu.style.left = "0px";
    menu.style.top = "0px";
    const rect = menu.getBoundingClientRect();
    const pad = 8;
    const x = Math.max(pad, Math.min(clientX, window.innerWidth - rect.width - pad));
    const y = Math.max(pad, Math.min(clientY, window.innerHeight - rect.height - pad));
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
  }

  relWrap.addEventListener("mouseenter", () => {
    openRelationshipSubmenu();
  });
  flipWrap.addEventListener("mouseenter", () => {
    openFlipSubmenu();
  });

  relTrigger.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (relWrap.hidden) return;
    if (relPanel.hidden) {
      openRelationshipSubmenu();
    } else {
      relPanel.hidden = true;
      relTrigger.setAttribute("aria-expanded", "false");
    }
  });

  flipBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (flipBtn.getAttribute("aria-disabled") === "true") return;
    if (flipPanel.hidden) {
      openFlipSubmenu();
    } else {
      flipPanel.hidden = true;
      flipBtn.setAttribute("aria-expanded", "false");
    }
  });

  reportBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const edge = buildRelationshipFeedbackEdgeContext({
      hopIndex: stateRef.hopIndex,
      from: stateRef.from,
      to: stateRef.to,
      currentCode: stateRef.currentCode,
      step: stateRef.step,
    });
    closeMenu();
    if (!edge) return;
    if (typeof window.openFeedbackModal === "function") {
      window.openFeedbackModal({ relationshipEdge: edge });
    }
  });

  pinBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (pinBtn.getAttribute("aria-disabled") === "true") return;
    if (typeof window.applyEdgeConstraintPinCurrent === "function") {
      window.applyEdgeConstraintPinCurrent(stateRef.from, stateRef.to);
    }
    closeMenu();
  });

  unpinBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (unpinBtn.getAttribute("aria-disabled") === "true") return;
    if (typeof window.removeEdgeConstraintPair === "function") {
      window.removeEdgeConstraintPair(stateRef.from, stateRef.to, { reason: "edge-unpin-context-menu" });
    }
    closeMenu();
  });

  document.addEventListener("contextmenu", (ev) => {
    if (!(ev.target instanceof Element)) return;
    if (ev instanceof MouseEvent) {
      const isSecondary = ev.button === 2 || !!ev.ctrlKey;
      if (!isSecondary) return;
    }
    const labelHit = ev.target.closest(".rel-label-hit");
    if (!labelHit) return;
    const hopHost = labelHit.closest(".clickable-arrow[data-hop]");
    if (!hopHost) return;
    const hopIndex = Number(hopHost.getAttribute("data-hop"));
    const meta = getHopMeta(hopIndex);
    if (!meta) return;
    ev.preventDefault();
    ev.stopPropagation();
    openMenuAt(ev.clientX, ev.clientY, meta);
  });

  document.addEventListener("pointerdown", (ev) => {
    if (!stateRef.open) return;
    const target = ev.target;
    if (target instanceof Node && menu.contains(target)) return;
    closeMenu();
  }, true);

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && stateRef.open) {
      ev.preventDefault();
      closeMenu();
    }
  });
  window.addEventListener("blur", closeMenu);
  window.addEventListener("resize", closeMenu);
  window.addEventListener("scroll", closeMenu, true);
}

initEdgeContextMenu();

function diagramOverlayExportLabel(mode, legacyShowBadges) {
  const m =
    mode != null && Number.isFinite(mode)
      ? clampDiagramOverlayMode(mode)
      : legacyShowBadges === false
        ? 0
        : 3;
  if (m === 7) return "hop numbers + flip + relationship names";
  if (m === 6) return "flip + relationship names";
  if (m === 5) return "hop numbers + relationship names";
  if (m === 3) return "both (hop numbers + flip)";
  if (m === 2) return "hop numbers only";
  if (m === 1) return "flip direction only";
  if (m === 4) return "relationship names only";
  return "off";
}

function syncDiagramOverlayButton() {
  syncDiagramOptionsFormFromState();
}

/** Toolbar overlay control cycles: both → hop → flip → names-only → off → … */
const DIAGRAM_OVERLAY_CYCLE = [3, 2, 1, 4, 0];

window.toggleBadges = function() {
  const cur = clampDiagramOverlayMode(state.diagramOverlayMode);
  let ix = DIAGRAM_OVERLAY_CYCLE.indexOf(cur);
  if (ix < 0) ix = DIAGRAM_OVERLAY_CYCLE.length - 1;
  state.diagramOverlayMode = DIAGRAM_OVERLAY_CYCLE[(ix + 1) % DIAGRAM_OVERLAY_CYCLE.length];
  syncDiagramOverlayButton();
  if (state.segments) {
    state._diagramNeedsCameraReset = true;
    window.dispatch({ type: "RENDER_RESULTS" });
  }
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
  const hop = Number(hopIndex);
  if (!Number.isFinite(hop)) return;
  console.log(`[DECISION] Hop ${hop} set to ${code}`);
  if (window.store) {
    window.store.dispatch("SET_USER_CHOICE", { hopIndex: hop, code });
  } else {
    window.state.userChoices[hop] = code;
  }
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
  const matrixCodes =
    typeof window.appendixMatrixCodesForPathHopIndex === "function"
      ? window.appendixMatrixCodesForPathHopIndex(flatSteps, hopIndex, state.edgeConstraints)
      : step?.codes;
  if (!step || !matrixCodes || matrixCodes.length <= 1) return;
  const list =
    typeof window.relationshipPickerCodesFromMatrixCodes === "function"
      ? window.relationshipPickerCodesFromMatrixCodes(matrixCodes)
      : matrixCodes.slice();
  if (!list.length) return;

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
        : (state.userChoices[hopIndex] ?? list[0]);
    currentIndex = list.findIndex(
      (c) => String(c).toUpperCase() === String(currentChoice).toUpperCase()
    );
  }
  const nextIndex = (currentIndex + 1) % list.length;

  window.setEdgeChoice(hopIndex, list[nextIndex]);
};

function refreshCoachOverlayOnly() {
  if (!state.segments) return;
  const tabsEl = document.getElementById("path-tabs");
  if (!tabsEl) return;
  const clustered = renderPerspectiveAccordion(tabsEl, state.segments, state.activePathIdx ?? 0);
  state.pathClusters = clustered;
  const help = document.getElementById("path-tabs-help");
  if (help) help.hidden = tabsEl.style.display === "none";
}

if (window.store) {
  if (typeof window.initWaypointEditor === "function") {
    window.initWaypointEditor({
      store: window.store,
      deps: {
        renderWaypointChain,
        checkReady,
        updateQuickExamplesVisibility,
      },
    });
  }
  if (typeof window.initCoachOverlay === "function") {
    window.initCoachOverlay({
      store: window.store,
      deps: {
        refreshCoachOverlay: () => {
          refreshCoachOverlayOnly();
        },
      },
    });
  }
  if (typeof window.initPerspectiveAccordion === "function") {
    window.initPerspectiveAccordion({
      store: window.store,
      deps: {
        renderPerspectiveAccordion: () => {
          if (state.segments) window.dispatch({ type: "RENDER_RESULTS" });
        },
      },
    });
  }

  (function scheduleHistoryControlsAndShortcuts() {
    function runWhenDomReady(fn) {
      if (typeof document === "undefined") return;
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", fn, { once: true });
      } else {
        fn();
      }
    }

    runWhenDomReady(function initHistoryControlsAndShortcuts() {
      const store = window.store;
      const undoBtn = document.getElementById("undo-btn");
      const redoBtn = document.getElementById("redo-btn");
      if (!store || typeof store.undo !== "function" || typeof store.redo !== "function") return;

      function syncHistoryButtons() {
        const { canUndo, canRedo } =
          typeof store.getHistoryAvailability === "function" ? store.getHistoryAvailability() : { canUndo: false, canRedo: false };
        if (undoBtn) {
          undoBtn.disabled = false;
          undoBtn.classList.toggle("history-arrow--inactive", !canUndo);
          undoBtn.setAttribute("aria-disabled", canUndo ? "false" : "true");
        }
        if (redoBtn) {
          redoBtn.disabled = false;
          redoBtn.classList.toggle("history-arrow--inactive", !canRedo);
          redoBtn.setAttribute("aria-disabled", canRedo ? "false" : "true");
        }
      }

      /** Waypoints, mode toggles, viewpoint selects, and diagram are not fully store-driven — resync after jump. */
      function refreshUiAfterHistoryJump() {
        try {
          renderWaypointChain();
        } catch (_) {}
        try {
          checkReady();
        } catch (_) {}
        try {
          updateQuickExamplesVisibility();
        } catch (_) {}
        const m = state.selectionMode === "ordered" ? "ordered" : "set";
        document.getElementById("btn-ordered")?.classList.toggle("active", m === "ordered");
        document.getElementById("btn-set")?.classList.toggle("active", m === "set");
        try {
          updatePathModeHint();
        } catch (_) {}
        try {
          updateConnectSetExploratoryWarning();
        } catch (_) {}
        try {
          updatePathOptionsTriggerSummary();
        } catch (_) {}

        const vp = state.viewpoint;
        const v = vp == null || vp === "" ? "" : String(vp);
        for (const id of ["viewpoint-select", "header-viewpoint-select"]) {
          const sel = document.getElementById(id);
          if (!sel) continue;
          if (v && [...sel.options].some((o) => o.value === v)) sel.value = v;
          else sel.value = "";
        }
        try {
          updateViewpointHelpUi();
        } catch (_) {}
        try {
          syncUrlFromState({ push: false });
        } catch (_) {}
        if (state.segments) {
          try {
            window.dispatch({ type: "RENDER_RESULTS" });
          } catch (_) {}
        }
      }

      if (typeof store.subscribeHistory === "function") {
        store.subscribeHistory(() => {
          syncHistoryButtons();
        });
      } else {
        syncHistoryButtons();
      }

      undoBtn?.addEventListener("click", () => {
        const av = typeof store.getHistoryAvailability === "function" ? store.getHistoryAvailability() : {};
        if (!av.canUndo) return;
        if (!store.undo()) return;
        syncHistoryButtons();
        refreshUiAfterHistoryJump();
      });
      redoBtn?.addEventListener("click", () => {
        const av = typeof store.getHistoryAvailability === "function" ? store.getHistoryAvailability() : {};
        if (!av.canRedo) return;
        if (!store.redo()) return;
        syncHistoryButtons();
        refreshUiAfterHistoryJump();
      });

      document.addEventListener(
        "keydown",
        (e) => {
          const key = typeof e.key === "string" ? e.key.toLowerCase() : "";
          if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
          if (key !== "z" && key !== "y") return;

          const el = e.target;
          if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;

          if (key === "z" && e.shiftKey) {
            e.preventDefault();
            if (!store.redo()) return;
            syncHistoryButtons();
            refreshUiAfterHistoryJump();
            return;
          }
          if (key === "z" && !e.shiftKey) {
            e.preventDefault();
            if (!store.undo()) return;
            syncHistoryButtons();
            refreshUiAfterHistoryJump();
            return;
          }
          if (key === "y") {
            e.preventDefault();
            if (!store.redo()) return;
            syncHistoryButtons();
            refreshUiAfterHistoryJump();
          }
        },
        true
      );
    });
  })();
}