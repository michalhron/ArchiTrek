// === app ===

// ── App state ───────────────────────────────────────────────────────────────
// We use window.state to ensure the HTML dropdowns can see it
window.state = {
  mode:           'compact',
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
  /** 'bfs' = breadth-first (shortest hops first); 'dfs' = depth-first (deep branches first). — Path search uses weighted UCS; strategy is kept for diagnostics only. */
  searchStrategy: "bfs",
  /** Allow §5.2.4 Association bridges when no strict Appendix B chain exists (penalized unless target is Value/Meaning). */
  allowAssociationFallback: false,
  /** Set after last successful findPath when any segment used penalized Association. */
  lastPathIsFallback: false,
  /** When last search found no path: which relaxations would help (from probePathRelaxations / probeSetRelaxations). */
  pathFailureHints: null,
};

// Create a shortcut so the rest of this file's code doesn't break
const state = window.state;

const SEARCH_EFFORT_MAX_STATES = {
  fast: 8000,
  balanced: 25000,
  thorough: 100000,
};

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

function normalizeSearchStrategy(v) {
  return v === "dfs" ? "dfs" : "bfs";
}

/** Options passed to findPaths / findBestChainForSet (pathfinder.js). */
function getSearchPathOptions() {
  const effort = normalizeSearchEffort(state.searchEffort);
  const maxStates = SEARCH_EFFORT_MAX_STATES[effort] ?? SEARCH_EFFORT_MAX_STATES.balanced;
  return {
    maxDepth: clampSearchDepth(state.searchMaxDepth),
    maxPaths: clampSearchMaxPaths(state.searchMaxPaths),
    maxStates,
    strategy: normalizeSearchStrategy(state.searchStrategy),
    /** Must match buildGraph({ includeDerived }) — controls which matrix letters appear on each hop. */
    includeDerived: !!state.includeDerived,
    allowAssociationFallback: !!state.allowAssociationFallback,
  };
}

function applySearchOptionsToUI() {
  const d = document.getElementById("search-max-depth");
  const p = document.getElementById("search-max-paths");
  const e = document.getElementById("search-effort");
  const s = document.getElementById("search-strategy");
  const af = document.getElementById("allow-association-fallback");
  if (d) d.value = String(clampSearchDepth(state.searchMaxDepth));
  if (p) p.value = String(clampSearchMaxPaths(state.searchMaxPaths));
  if (e) e.value = normalizeSearchEffort(state.searchEffort);
  if (s) s.value = normalizeSearchStrategy(state.searchStrategy);
  if (af) af.checked = !!state.allowAssociationFallback;
}

window.onSearchOptionsChange = function onSearchOptionsChange() {
  const d = document.getElementById("search-max-depth");
  const p = document.getElementById("search-max-paths");
  const e = document.getElementById("search-effort");
  const s = document.getElementById("search-strategy");
  if (d) state.searchMaxDepth = clampSearchDepth(d.value);
  if (p) state.searchMaxPaths = clampSearchMaxPaths(p.value);
  if (e) state.searchEffort = normalizeSearchEffort(e.value);
  if (s) state.searchStrategy = normalizeSearchStrategy(s.value);
  updatePathOptionsTriggerSummary();
  schedulePersistSession();
  if (state.segments) findPath();
};

window.onAssociationFallbackChange = function onAssociationFallbackChange() {
  const af = document.getElementById("allow-association-fallback");
  state.allowAssociationFallback = !!(af && af.checked);
  updatePathOptionsTriggerSummary();
  schedulePersistSession();
  if (state.segments) findPath();
};

/** Enable + Derived and re-run path search (from “widen search” panel). */
window.tryRelaxPathDerived = function tryRelaxPathDerived() {
  setDerived(true);
  findPath();
};

/** Turn on Association fallback and re-run path search. */
window.tryRelaxPathAssociation = function tryRelaxPathAssociation() {
  state.allowAssociationFallback = true;
  const el = document.getElementById("allow-association-fallback");
  if (el) el.checked = true;
  updatePathOptionsTriggerSummary();
  schedulePersistSession();
  findPath();
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

/** Snapshot of path search settings for no-path diagnostics (matches connect-set tech box style). */
function buildPathSearchReportPayload() {
  const so = getSearchPathOptions();
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
    searchEffort: normalizeSearchEffort(state.searchEffort),
    viewpointKey,
    viewpointShortLabel: viewpointShort,
    waypointChainDescription,
    waypointCount: names.length,
    connectSetDistinctCount: distinct.length,
  };
}

function isLayoutTop() {
  return document.getElementById("app-layout")?.classList.contains("layout-top");
}

/** Top bar: full Appendix B palette (no viewpoint filter). Sidebar: respects viewpoint. */
function effectiveAllowedElements() {
  return isLayoutTop() ? null : state.allowedElements;
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
const SESSION_SNAPSHOT_LS = "archimate-session-v1";
const SESSION_SNAPSHOT_VERSION = 1;

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
    forceShowQuickExamples: !!state.forceShowQuickExamples,
    viewpoint: viewpoint || null,
    waypoints: wps,
    hadPath,
    activePathIdx: state.activePathIdx ?? 0,
    userChoices: state.userChoices && typeof state.userChoices === "object" ? { ...state.userChoices } : {},
    searchMaxDepth: clampSearchDepth(state.searchMaxDepth),
    searchMaxPaths: clampSearchMaxPaths(state.searchMaxPaths),
    searchEffort: normalizeSearchEffort(state.searchEffort),
    searchStrategy: normalizeSearchStrategy(state.searchStrategy),
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
    if (data.searchStrategy === "bfs" || data.searchStrategy === "dfs") {
      state.searchStrategy = data.searchStrategy;
    }
    if (typeof data.allowAssociationFallback === "boolean") {
      state.allowAssociationFallback = data.allowAssociationFallback;
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
      findPath();
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
  const strat = so.strategy === "dfs" ? "DFS" : "BFS";
  const eff =
    normalizeSearchEffort(state.searchEffort) === "fast"
      ? "fast search"
      : normalizeSearchEffort(state.searchEffort) === "thorough"
        ? "thorough search"
        : "balanced search";
  const af = state.allowAssociationFallback ? "Assoc fallback on" : "Assoc fallback off";
  trigger.title = `Current: ${rel} · ${mode} · ${vpShort} · Up to ${so.maxDepth} hops · ${so.maxPaths} alts · ${eff} · ${strat} · ${af}`;
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

function openPathOptionsOverlay(anchorEl) {
  if (!anchorEl) return;
  teardownPickerOverlay();
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
  function setOpen(open) {
    root.classList.toggle("is-expanded", open);
    panel.hidden = !open;
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
  }
  setOpen(false);
  trigger.addEventListener("click", () => setOpen(!!panel.hidden));
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
      headerShowBtn.title =
        mode === "top" ? "Show path options and waypoints (top bar)" : "Show path options and waypoints (sidebar)";
      headerShowBtn.setAttribute(
        "aria-label",
        mode === "top" ? "Show control bar" : "Show control panel"
      );
    } else {
      headerShowBtn.title =
        mode === "top" ? "Hide path options and waypoints (top bar)" : "Hide path options and waypoints (sidebar)";
      headerShowBtn.setAttribute(
        "aria-label",
        mode === "top" ? "Hide control bar" : "Hide control panel"
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
  if (state.segments) renderResults();
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

  const layout = readLayoutPrefs();
  const chromeLabel = layout.mode === "top" ? "Top bar" : "Sidebar";
  const resultsMode = readResultsLayoutMode();
  const resultsLabel =
    resultsMode === "side"
      ? isResultsSideLayoutActive()
        ? "Beside diagram (split)"
        : "Beside requested (narrow viewport — stacked)"
      : "Stacked below diagram";

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
  lines.push("Options:");
  lines.push(`- Relationships: ${state.includeDerived ? "+ Derived" : "Direct only"}`);
  lines.push(`- Association fallback: ${state.allowAssociationFallback ? "on" : "off"}`);
  lines.push(`- Path mode: ${state.selectionMode === "set" ? "Connect set" : "Ordered"}`);
  lines.push(`- Viewpoint filter: ${viewpointLabel}`);
  const so = getSearchPathOptions();
  lines.push(
    `- Path search: weighted UCS, max ${so.maxDepth} hops/segment, ${so.maxPaths} alternatives, effort ${normalizeSearchEffort(state.searchEffort)}, association fallback ${state.allowAssociationFallback ? "on" : "off"}`
  );

  lines.push("");
  lines.push("Diagram view:");
  lines.push(`- Mode: ${state.mode === "swimlane" ? "Swimlanes" : "Compact"}`);
  lines.push(`- Path layout: ${state.pathFlow}`);
  lines.push(`- Step numbers on arrows: ${state.showBadges ? "on" : "off"}`);
  lines.push(`- Quick examples pinned: ${state.forceShowQuickExamples ? "yes" : "no"}`);

  lines.push("");
  lines.push("Waypoints (what you were connecting):");
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

  lines.push("");
  lines.push("Path finder / results:");
  const gSize = state.graph && typeof state.graph.size === "number" ? state.graph.size : null;
  lines.push(`- Graph size (nodes): ${gSize != null ? gSize : "—"}`);
  const segs = state.segments;
  if (!segs || !segs.length) {
    lines.push("- No search results in memory (clear or not run yet).");
  } else {
    const hasAnyPath = !segs.some((s) => !s.paths || s.paths.length === 0);
    lines.push(`- Segments: ${segs.length}`);
    lines.push(`- Any complete route: ${hasAnyPath ? "yes" : "no"}`);
    lines.push(`- Active alternative tab: ${(state.activePathIdx ?? 0) + 1}`);
    if (state.selectionMode === "set" && state.lastAutoOrderResult?.length) {
      lines.push(`- Auto-ordered chain: ${state.lastAutoOrderResult.join(" → ")}`);
      const m = state.lastAutoOrderMetrics;
      if (m && Number.isFinite(m.totalScore)) {
        const so = getSearchPathOptions();
        lines.push(
          `- Connect-set metrics: weighted cost ${m.totalScore} · ${m.pointCount} points · ${m.orderingExact ? "exact" : "heuristic"} ordering · max ${so.maxDepth} hops/segment`
        );
      }
    }
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
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    setFeedbackStatus(m, true);
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
      if (state.segments && before !== state.pathFlow) renderResults();
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
  document.getElementById('help-modal').style.display = 'block';
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
        <strong>Association</strong> (O) is always permitted between any two elements (§5.2.4) but is not listed in Appendix B’s matrix. ArchiTrek encodes that as optional bridges: with <strong>Allow Association Fallback</strong> off, search uses only Appendix B (and derived) arcs; when on, §5.2.4 links may appear as a last resort and are flagged in results.
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
/** When mode / badges / vertical / or segment result ref changes, reset pan-zoom; not when only switching path tab. */
let _diagramPanCtx = { modeKey: null, segmentsRef: null };

function diagramPanShouldReset(segments) {
  const modeKey = `${state.mode}|${state.pathFlow}|${state.showBadges}`;
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

  addWaypointSlot(0, 'Start');
  addWaypointSlot(1, 'End');
  renderWaypointChain();
  setSelectionMode(state.selectionMode);

  initLayoutChrome();
  initPathOptionsOverlay();
  initPathChromeCollapsible();
  initResultsSplit();
  initDiagramPanZoom();

  updateQuickExamplesVisibility();

  applySearchOptionsToUI();

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



window.addWaypoint = function() {
  if (state.selectionMode === 'set') {
    // Connect Set mode: just add to the end of the list
    state.waypoints.push({ layer: null, element: null, label: 'Point' });
  } else {
    // Ordered mode: insert before the "End" point
    const insertAt = Math.max(1, state.waypoints.length - 1);
    state.waypoints.splice(insertAt, 0, { layer: null, element: null, label: 'Via' });
  }
  renderWaypointChain();
};

window.clearAllElements = function() {
  // Clear data
  state.waypoints = [];
  addWaypointSlot(0, 'Start');
  addWaypointSlot(1, 'End');
  state.segments = null;
  state.pathFailureHints = null;
  state.lastPathIsFallback = false;
  renderWaypointChain();
  
  // Clear the UI visually
  const diagramEl = document.getElementById('path-diagram');
  const emptyEl = document.getElementById('diagram-empty');
  const tabsEl = document.getElementById('path-tabs');
  const explainEl = document.getElementById('explanation-content');
  const toolsEl = document.getElementById('diagram-tools');
  
  if (diagramEl) diagramEl.innerHTML = '';
  resetDiagramPanContext();
  resetDiagramView();
  if (emptyEl) emptyEl.style.display = 'flex';
  if (tabsEl) tabsEl.style.display = 'none';
  if (explainEl) explainEl.innerHTML = 'Path explanation will appear here after finding a path.';
  if (toolsEl) toolsEl.hidden = true;
  state.mmLast = null;
  updateMmConnectionStrip(null);

  checkReady();
  updateQuickExamplesVisibility();
  schedulePersistSession();
};

function removeWaypoint(index) {
  // Always keep at least 2 points.
  if (state.waypoints.length <= 2) return;
  state.waypoints.splice(index, 1);
  renderWaypointChain();
  checkReady();
}

function moveWaypoint(index, dir) {
  const j = index + dir;
  if (j < 0 || j >= state.waypoints.length) return;
  // Only allow moving within the list; keep semantics (start/end) by swapping slots
  const tmp = state.waypoints[index];
  state.waypoints[index] = state.waypoints[j];
  state.waypoints[j] = tmp;
  renderWaypointChain();
  if (state.segments) findPath();
}

function moveWaypointTo(fromIndex, toIndex) {
  if (fromIndex === toIndex) return;
  if (fromIndex < 0 || fromIndex >= state.waypoints.length) return;
  if (toIndex < 0 || toIndex >= state.waypoints.length) return;
  const [item] = state.waypoints.splice(fromIndex, 1);
  state.waypoints.splice(toIndex, 0, item);
  renderWaypointChain();
  if (state.segments) findPath();
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
    header.innerHTML = `<div class="picker-title">Pick an element (${layerId})</div>`;
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
    search.placeholder = 'Search element…';
    body.appendChild(search);

    const grid = document.createElement('div');
    grid.className = 'element-grid popover-grid';
    body.appendChild(grid);

    const elementsForLayer = Object.entries(ELEMENTS)
      .filter(([, meta]) => meta.layer === layerId)
      .map(([name]) => name)
      .sort();

    const renderGrid = () => {
      const q = (search.value || '').trim().toLowerCase();
      grid.innerHTML = '';

      const ASPECT_ORDER = [
        'Active Structure',
        'Behavior',
        'Passive Structure',
        'Composite',
        'Motivation',
      ];

      const groups = new Map();
      for (const a of ASPECT_ORDER) groups.set(a, []);
      groups.set('Other', []);

      for (const name of elementsForLayer) {
        if (q && !name.toLowerCase().includes(q)) continue;
        const aspect = ELEMENTS?.[name]?.aspect || 'Other';
        (groups.get(aspect) || groups.get('Other')).push(name);
      }

      const addCard = (name) => {
        const allowed = !effAllowed || effAllowed.has(name);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'element-card' +
          (state.waypoints[waypointIdx].element === name ? ' selected' : '') +
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
      for (const [aspect, names] of groups.entries()) {
        if (!names.length) continue;
        renderedAny = true;

        const title = document.createElement('div');
        title.className = 'element-group-title';
        title.textContent = aspect;
        grid.appendChild(title);

        for (const name of names) addCard(name);
      }

      if (!renderedAny) {
        const empty = document.createElement('div');
        empty.className = 'element-grid-empty';
        empty.textContent = q ? 'No matching elements.' : 'No elements available.';
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

    if (isTwoOnly && (isFirst || isLast)) {
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

    // Body: element picker only (layer lives in header)
    if (wp.layer) {
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
        name.textContent = wp.element || 'Select element…';
      }
      left.appendChild(name);
      trigger.appendChild(left);

      const chev = document.createElement('span');
      chev.className = 'chev';
      chev.textContent = '▾';
      trigger.appendChild(chev);

      trigger.onclick = () => openElementOverlay(trigger, i, wp.layer);
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
      ? "Order does not matter: pick any points; the tool builds one chain that minimises total path cost."
      : top
        ? "The route follows your waypoint order left to right (Start → … → End). Use + Add element for extra stops."
        : "The route follows your list from top to bottom (Start → … → End). Use + Add element for extra stops.";
  const pop = document.getElementById("path-mode-popover");
  const btn = document.getElementById("path-mode-info-btn");
  if (pop) pop.textContent = text;
  if (btn) btn.title = text;
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
  renderWaypointChain();
}

function checkReady() {
  const picked = state.waypoints.filter(wp => wp?.element).length;
  const minOk = state.selectionMode === 'set' ? picked >= 2 : state.waypoints.every(wp => wp.element);
  document.getElementById('find-path-btn').disabled = !minOk;
}

// ── Mode & Derived toggles ──────────────────────────────────────────────────


window.setMode = function(mode) {
  state.mode = mode;
  const swimBtn = document.getElementById('btn-toggle-swimlanes');
  if (swimBtn) swimBtn.classList.toggle('active', mode === 'swimlane');
  if (state.segments) renderResults();
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
  if (state.segments) renderResults();
  schedulePersistSession();
};

/** @deprecated use cyclePathFlow */
window.toggleVertical = window.cyclePathFlow;


window.setDerived = function(include) {
  state.includeDerived = include;
  document.getElementById('btn-direct').classList.toggle('active',  !include);
  document.getElementById('btn-derived').classList.toggle('active',  include);
  rebuildGraph();
  if (state.segments) findPath();
  updatePathOptionsTriggerSummary();
  schedulePersistSession();
};

window.setSelectionMode = function(mode) {
  state.selectionMode = (mode === 'set') ? 'set' : 'ordered';
  document.getElementById('btn-ordered')?.classList.toggle('active', state.selectionMode === 'ordered');
  document.getElementById('btn-set')?.classList.toggle('active', state.selectionMode === 'set');

  updatePathModeHint();
  updatePathOptionsTriggerSummary();

  // In set mode, there is no Start/End semantics; allow removing any point.
  // Keep existing selections as-is.
  renderWaypointChain();

  // Re-run if we already have results.
  if (state.segments) findPath();
  schedulePersistSession();
};

// ── Quick Examples ─────────────────────────────────────────────────────────────

window.loadExample = function(waypoints) {
  // waypoints = [{layer, element}, ...]
  state.waypoints = waypoints.map(wp => ({ layer: wp.layer, element: wp.element }));
  renderWaypointChain();
  findPath();
  schedulePersistSession();
};

// ── Find Path ───────────────────────────────────────────────────────────────

window.findPath = function() {
  const picked = state.waypoints.map(wp => wp.element).filter(Boolean);
  state.lastAutoOrdered = false;
  
  window.state.userChoices = {}; // Reset decisions for the new path
  
  // ... rest of function

  try {
    setLoading(true, "Finding…");
    state.userChoices = {}; // Clear previous decisions
    // Allow browser to paint loading state before doing BFS work.
    setTimeout(() => {
    let segs = [];
    let pathIsFallback = false;
    let chainForExplain = null;

    state.userChoices = {}; // Clear previous decisions
    state.lastAutoOrderMetrics = null;
    if (state.selectionMode === 'set') {
      const res = findBestChainForSet(state.graph, picked, getSearchPathOptions());
      segs = res?.segments ?? [];
      pathIsFallback = !!res?.isFallback;
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
      const fp = findPaths(state.graph, waypointNames, getSearchPathOptions());
      segs = fp.segments;
      pathIsFallback = !!fp.isFallback;
    }

    let hasNoPath = !segs || segs.length === 0 || segs.some(s => !s.paths || s.paths.length === 0);

    state.segments = segs;
    state.lastPathIsFallback = !hasNoPath && pathIsFallback;
    state.activePathIdx = 0;
    computeAndSetPathFailureHints(
      hasNoPath,
      picked,
      state.waypoints.map((wp) => wp.element)
    );
    renderResults();
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
      renderResults();
    }
    setLoading(false);
    schedulePersistSession();
    }, 0);
  } catch (e) {
    console.error('findPath error:', e);
    showError(e.message);
    setLoading(false);
  }
};

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

/** Single grey box: connect-set order + cost / hops / search cap (no separate banner above). */
function buildConnectSetTechHtml(metrics, segments, pathIdx, orderedChain) {
  if (!metrics) return "";
  const hops = totalHopsInSegments(segments, pathIdx);
  const scoreStr = Number.isFinite(metrics.totalScore) ? String(metrics.totalScore) : "—";
  const orderShort = metrics.orderingExact ? "exact ordering" : "heuristic ordering";
  const so = getSearchPathOptions();
  const chainStr =
    orderedChain?.length ? orderedChain.map((n) => String(n).trim()).filter(Boolean).join(" → ") : "";
  return `<div class="connect-set-note-tech" role="note">
    ${
      chainStr
        ? `<div class="connect-set-note-tech-chain"><strong>Connect set</strong> · ${chainStr}</div>`
        : ""
    }
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
    <span class="connect-set-note-tech-hint">Cost = sum of hop weights (Appendix B / derived = 1 per hop; penalized Association = 100 unless target is Value or Meaning). Lower is better.</span>
  </div>`;
}

// ── Render Results ───────────────────────────────────────────────────────────

function renderResults() {
  const segments    = state.segments;
  const pathIdx     = state.activePathIdx;
  const diagramEl   = document.getElementById('path-diagram');
  const emptyEl     = document.getElementById('diagram-empty');
  const tabsEl      = document.getElementById('path-tabs');
  const explainEl   = document.getElementById('explanation-content');
  const toolsEl     = document.getElementById('diagram-tools');

  // Check if any segment has no paths
  const hasNoPath = segments.some(s => !s.paths || s.paths.length === 0);

  // Show/Hide path tools (compact/swimlanes always visible)
  if (toolsEl) {
    toolsEl.hidden = hasNoPath;
  }

  if (hasNoPath) {
    state.lastPathIsFallback = false;
    state.mmLast = null;
    updateMmConnectionStrip(null);
    // No-path case
    clearDiagram(diagramEl);
    emptyEl.style.display = 'none';
    tabsEl.style.display  = 'none';
    diagramEl.innerHTML   = '<p style="color:var(--text-3);font-size:13px;padding:8px">No valid path found within the current settings.</p>';
    resetDiagramPanContext();
    resetDiagramView();

    const fromEl = state.waypoints[0].element;
    const toEl   = state.waypoints[state.waypoints.length - 1].element;
    const diagnostics =
      typeof renderPathSearchDiagnostics === "function"
        ? renderPathSearchDiagnostics(buildPathSearchReportPayload(), state.pathFailureHints)
        : typeof renderPathFailureSuggestions === "function"
          ? renderPathFailureSuggestions(state.pathFailureHints)
          : "";
    explainEl.innerHTML = explainNoPath(fromEl, toEl, "unknown") + diagnostics;

    openMetamodelModal();

    const fromRole = ELEMENTS[fromEl]?.metamodelRole;
    const toRole   = ELEMENTS[toEl]?.metamodelRole;
    const fromKey  = getMetamodelBoxKey(fromRole);
    const toKey    = getMetamodelBoxKey(toRole);
    if (fromKey || toKey) {
      highlightMetamodel(fromKey, toKey, false);
    }

    const ruleKey = getAspectRuleKey(fromEl, toEl);
    const aspectRule = ASPECT_RULES[ruleKey];
    const layerRuleKey = getLayerRuleKey(fromEl, toEl);
    const layerRule = LAYER_RULES[layerRuleKey];
    const aspectOk = !aspectRule || aspectRule.valid !== false;
    const layerOk = !layerRule || layerRule.valid !== false;
    const ok = aspectOk && layerOk;

    setMetamodelStatus(`
      <div><strong>No valid path:</strong> ${fromEl} → ${toEl}</div>
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
    renderMetamodelRoleContents(fk, tk, fromEl, toEl);
    return;
  }

  sanitizeUserChoicesForActivePath();

  // Build path tabs from the first segment's paths
  // (all segments are traversed; tabs cycle through alternative 0–4)
  const maxAlts = Math.max(...segments.map(s => s.paths.length));
  emptyEl.style.display = 'none';

  // Render tabs
  if (maxAlts > 1) {
    tabsEl.style.display = 'flex';
    tabsEl.innerHTML = '';
    tabsEl.title =
      maxAlts > 2 ? "Several path options — pick a tab to compare routes" : "";
    for (let i = 0; i < maxAlts; i++) {
      const hops = countHops(segments, i);
      const tab  = document.createElement('button');
      tab.type = "button";
      tab.className = 'path-tab' + (i === pathIdx ? ' active' : '');
      tab.innerHTML = `Path ${i + 1} <span class="hop-badge">${hops} hop${hops !== 1 ? 's' : ''}</span>`;
      tab.onclick = () => selectPath(i);
      tabsEl.appendChild(tab);
    }
    const activeTab = tabsEl.querySelector(".path-tab.active");
    requestAnimationFrame(() => {
      activeTab?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  } else {
    tabsEl.style.display = 'none';
    tabsEl.title = "";
  }

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
  // Render explanation
  const autoOrderedNote =
    state.selectionMode === "set" &&
    state.lastAutoOrdered &&
    state.lastAutoOrderResult?.length &&
    state.lastAutoOrderMetrics
      ? `<div class="explain-waypoint-note connect-set-note" style="margin-bottom:12px">${buildConnectSetTechHtml(
          state.lastAutoOrderMetrics,
          segments,
          pathIdx,
          state.lastAutoOrderResult
        )}</div>`
      : "";
  const fallbackBanner = state.lastPathIsFallback
    ? `<div class="path-fallback-banner" role="status">⚠️ Fallback Path Used — at least one hop uses penalized Association (§5.2.4), not a specific Appendix B relationship.</div>`
    : "";
  try {
    explainEl.innerHTML = autoOrderedNote + fallbackBanner + explainPath(segments, pathIdx, { constrained: state.selectionMode === 'ordered' });
  } catch (e) {
    console.error('[NAV] explainPath failed', e);
    explainEl.innerHTML = autoOrderedNote + `
      <div style="color:var(--invalid);padding:12px;font-size:13px">
        Error rendering explanation. Check console for details.
      </div>`;
  }

  // Highlight metamodel
  updateMetamodelHighlight(segments, pathIdx);
  setMetamodelStatus('Hover a hop (diagram arrow or Step N) to see what it means here.');

  // Wire explanation hover to highlight the corresponding hop everywhere.
  wireHopInteractions();
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

window.expandHopDetails = function expandHopDetails(hopIdx, opts = {}) {
  if (hopIdx == null || hopIdx === '') return;
  const container = document.getElementById('explanation-content');
  if (!container) return;
  const hopEl = container.querySelector(`[data-hop="${hopIdx}"]`);
  if (!hopEl) return;
  const details = hopEl.querySelector('details.explain-details');
  if (details) details.open = true;
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
      const fromRaw = btn.getAttribute('data-mm-from');
      const toRaw   = btn.getAttribute('data-mm-to');
      const relRaw  = btn.getAttribute('data-mm-rel');
      const fromEl = fromRaw ? decodeURIComponent(fromRaw) : null;
      const toEl   = toRaw ? decodeURIComponent(toRaw) : null;
      if (fromEl && toEl && window.focusMetamodel) window.focusMetamodel(fromEl, toEl);
      const rel = relRaw ? decodeURIComponent(relRaw) : null;
      if (rel) {
        const status = document.getElementById('metamodel-status');
        if (status) {
          // append badge if not already present
          const topLine = status.querySelector('div');
          if (topLine && !topLine.querySelector('.mm-rel-badge')) {
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
    block.onmouseenter = () => { clearHopHighlights(); highlightHop(hopIdx); };
    block.onmouseleave = () => { clearHopHighlights(); updateMetamodelHighlight(state.segments, state.activePathIdx ?? 0); };
    block.onclick = (e) => {
      clearHopHighlights();
      highlightHop(hopIdx);
      // Clicks on the per-hop <summary> toggle <details> natively; do not force-open afterward
      // or requestAnimationFrame(expandHopDetails) would immediately re-open and block collapse.
      const clickEl = e.target instanceof Element ? e.target : e.target?.parentElement;
      if (clickEl?.closest?.(".el-info-trigger")) return;
      if (clickEl?.closest?.("details.explain-details > summary")) return;
      requestAnimationFrame(() => {
        if (typeof window.expandHopDetails === 'function') window.expandHopDetails(hopIdx, { scroll: true });
      });
    };
  });
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
  renderResults();
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

  for (let i = 1; i < flatSteps.length; i++) {
    const prev = flatSteps[i - 1].element;
    const curr = flatSteps[i].element;
    const pr = ELEMENTS[prev]?.metamodelRole;
    const cr = ELEMENTS[curr]?.metamodelRole;
    const pk = getMetamodelBoxKey(pr);
    const ck = getMetamodelBoxKey(cr);
    if (pk && ck) {
      fromRole = pk;
      toRole = ck;
      fromEl = prev;
      toEl = curr;
      hopIdx = i;
      const codes = flatSteps[i]?.codes ?? [];
      const code0 = codes[0] ? String(codes[0]).toUpperCase() : null;
      appendixRel = code0 ? (RELATIONSHIPS?.[code0]?.name ?? code0) : "";
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
    if (!step?.codes?.some((c) => String(c).toUpperCase() === String(raw).toUpperCase())) {
      delete next[k];
      changed = true;
    }
  }
  if (changed) state.userChoices = next;
}

function showError(msg) {
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
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
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

// Global delegated handler for “Show on metamodel” buttons.
// (More reliable than relying on per-render wiring.)
document.addEventListener('click', (e) => {
  const el = e.target;
  if (!(el instanceof Element)) return;
  const btn = el.closest('.mm-jump');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();

  const fromRaw = btn.getAttribute('data-mm-from');
  const toRaw   = btn.getAttribute('data-mm-to');
  const relRaw  = btn.getAttribute('data-mm-rel');
  const fromEl = fromRaw ? decodeURIComponent(fromRaw) : null;
  const toEl   = toRaw ? decodeURIComponent(toRaw) : null;
  const rel    = relRaw ? decodeURIComponent(relRaw) : null;

  if (fromEl && toEl && window.focusMetamodel) window.focusMetamodel(fromEl, toEl);
  if (rel) {
    const status = document.getElementById('metamodel-status');
    const topLine = status?.querySelector?.('div');
    if (topLine && !topLine.querySelector('.mm-rel-badge')) {
      const span = document.createElement('span');
      span.className = 'mm-rel-badge';
      span.textContent = rel;
      topLine.appendChild(span);
    }
  }
}, true);

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
    diagramArea.requestFullscreen().catch(err => {
      console.error(`Error attempting to enable fullscreen: ${err.message}`);
    });
    // Add a temporary white background so it doesn't go transparent black in fullscreen
    diagramArea.style.backgroundColor = "var(--surface)"; 
  } else {
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
  if (state.segments) renderResults();
  schedulePersistSession();
};


window.setEdgeChoice = function(hopIndex, code) {
  console.log(`[DECISION] Hop ${hopIndex} set to ${code}`);
  window.state.userChoices[hopIndex] = code;
  
  // CRITICAL: We must re-run the render logic to update the SVG and Explanation
  if (window.state.segments) {
    renderResults(); 
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