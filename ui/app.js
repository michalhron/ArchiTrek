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
  lastAutoReversed: false,
  lastAutoOrdered: false,
  lastAutoOrderInput: null,
  lastAutoOrderResult: null,
  loading: true,
  showBadges: true,
  alignVertical: false,
  userChoices: {},
  /** When true, quick examples stay visible even with ≥2 elements chosen. */
  forceShowQuickExamples: false,
  /** Last metamodel hop (for modal + role table sync). */
  mmLast: null,
};

// Create a shortcut so the rest of this file's code doesn't break
const state = window.state;

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
  trigger.title = `Current: ${rel} · ${mode} · ${vpShort}`;
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
  applyAlignVerticalFromStorage();
  if (state.segments) renderResults();
}

/** Vertical vs side-by-side within layers: defaults differ for beside-diagram vs stacked layout. */
function readAlignVerticalForCurrentUi() {
  const sideActive = isResultsSideLayoutActive();
  const key = sideActive ? ALIGN_VERTICAL_SIDE_LS : ALIGN_VERTICAL_STACK_LS;
  const defaultVal = sideActive;
  const raw = localStorage.getItem(key);
  if (raw === null || raw === "") return defaultVal;
  return raw === "1";
}

function updateVerticalToggleButton() {
  const btn = document.getElementById("btn-toggle-vertical");
  if (!btn) return;
  btn.textContent = state.alignVertical ? "Side-by-side" : "Vertical";
  btn.title = state.alignVertical
    ? "Place layers horizontally (unstack)"
    : "Stack vertically within layers";
}

function applyAlignVerticalFromStorage() {
  state.alignVertical = readAlignVerticalForCurrentUi();
  updateVerticalToggleButton();
}

/** True when details are actually beside the diagram (row flex), not forced stacked by CSS. */
function isResultsSideLayoutActive() {
  const panel = document.getElementById("results-panel");
  if (!panel?.classList.contains("results-layout--side")) return false;
  return getComputedStyle(panel).flexDirection === "row";
}

const FEEDBACK_MAIL_TO = "hron@hey.com";
const FEEDBACK_MAIL_SUBJECT = "Bug report — ArchiMate Path Navigator";

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
  lines.push(`- Path mode: ${state.selectionMode === "set" ? "Connect set" : "Ordered"}`);
  lines.push(`- Viewpoint filter: ${viewpointLabel}`);

  lines.push("");
  lines.push("Diagram view:");
  lines.push(`- Mode: ${state.mode === "swimlane" ? "Swimlanes" : "Compact"}`);
  lines.push(`- Vertical within layers: ${state.alignVertical ? "on" : "off"}`);
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
    }
    if (state.lastAutoReversed) {
      lines.push("- Note: direction was auto-flipped (2-point ordered search).");
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
  if (status) status.textContent = "";
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

window.copyFeedbackReport = async function copyFeedbackReport() {
  const msg = document.getElementById("feedback-message-field")?.value?.trim() ?? "";
  const reply = document.getElementById("feedback-reply-email")?.value?.trim() ?? "";
  const text = buildFullFeedbackReport(msg, reply);
  const status = document.getElementById("feedback-status");
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
  if (status) {
    status.textContent =
      "Copied to clipboard. Paste into your email or webmail to send.";
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
      const before = state.alignVertical;
      applyAlignVerticalFromStorage();
      if (state.segments && before !== state.alignVertical) renderResults();
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
        <strong>Association</strong> (O) is always permitted between any two elements (§5.2.4) but is not listed in Appendix B’s matrix; this tool also excludes O from pathfinding.
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
  const modeKey = `${state.mode}|${state.alignVertical}|${state.showBadges}`;
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
    const _t = findPaths(state.graph, ["Business Interface", "Business Service"], {maxDepth:6, maxPaths:1});
    const _ok = _t?.[0]?.paths?.length > 0;
    console.log("[NAV] Graph nodes:", state.graph?.size, "| BFS self-test:", _ok ? "PASS ✓" : "FAIL ✗");
    if (!_ok) console.error("[NAV] BFS failed. MATRIX entries:", MATRIX?.length, "| BI edges:", state.graph?.get("Business Interface")?.length);
    // Show visible warning if self-test fails
    if (!_ok) {
      const warn = document.createElement('div');
      warn.style.cssText = 'background:#fff3cd;border:1px solid #ffc107;padding:8px 12px;font-size:12px;border-radius:4px;';
      warn.textContent = '⚠ Pathfinder self-test failed. Check console. Graph: ' + (state.graph?.size||0) + ' nodes, MATRIX: ' + (MATRIX?.length||0) + ' entries.';
      document.getElementById('waypoint-chain').before(warn);
    }
  } catch(e) { console.error("[NAV] Self-test error:", e); }

  addWaypointSlot(0, 'Start');
  addWaypointSlot(1, 'End');
  renderWaypointChain();
  setSelectionMode(state.selectionMode);

  initLayoutChrome();
  initPathOptionsOverlay();
  initResultsSplit();
  initDiagramPanZoom();

  updateQuickExamplesVisibility();

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
    const isMid   = !isFirst && !isLast;

    const isSetMode = state.selectionMode === 'set';
    const badgeClass = isSetMode ? 'mid' : (isFirst ? '' : isLast ? 'end' : 'mid');
    const letter = isSetMode ? String(i + 1) : (isFirst ? 'A' : isLast ? String.fromCharCode(65 + state.waypoints.length - 1) : String.fromCharCode(65 + i));
    const roleLabel = isSetMode ? `Point ${i + 1}` : (isFirst ? 'Start' : isLast ? 'End' : `Via ${i}`);

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

    // Card header row
    const header = document.createElement('div');
    header.className = 'waypoint-card-header';
    header.style.cssText = isTopLayout
      ? 'display:flex;align-items:center;gap:6px;padding:4px 8px;background:var(--surface-2);border-bottom:1px solid var(--border-light);flex-wrap:wrap'
      : 'display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--surface-2);border-bottom:1px solid var(--border-light)';

    // Drag handle (drag-and-drop reordering)
    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.title = 'Drag to reorder';
    handle.textContent = '⋮⋮';
    header.appendChild(handle);

    const badge = document.createElement('div');
    badge.className = `waypoint-badge ${badgeClass}`;
    badge.textContent = letter;
    header.appendChild(badge);

    const roleSpan = document.createElement('span');
    roleSpan.style.cssText = 'font-size:11px;font-weight:600;color:var(--text-3);flex:1';
    roleSpan.textContent = roleLabel;
    header.appendChild(roleSpan);

    // Selected element display in header
    if (wp.element) {
      const elBadge = document.createElement('span');
      const layerColor = LAYER_COLORS[wp.layer] || '#eee';
      elBadge.style.cssText = `font-size:10px;font-weight:500;padding:2px 6px;border-radius:4px;background:${layerColor};color:#333;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap`;
      elBadge.textContent = wp.element;
      elBadge.title = wp.element;
      header.appendChild(elBadge);
    }

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

    // Selectors body
    const body = document.createElement('div');
    body.className = 'waypoint-card-body';
    body.style.cssText = isTopLayout
      ? 'padding:6px 8px;display:flex;flex-direction:row;flex-wrap:wrap;gap:6px;align-items:center'
      : 'padding:8px 10px;display:flex;flex-direction:column;gap:6px';

    // Layer select
    const layerSel = document.createElement('select');
    layerSel.className = 'viewpoint-select';
    layerSel.style.cssText = isTopLayout
      ? 'font-size:11px;padding:4px 24px 4px 6px;min-width:120px;max-width:200px;flex:1 1 140px'
      : 'font-size:12px;padding:5px 28px 5px 8px';
    const blankOpt = document.createElement('option');
    blankOpt.value = '';
    blankOpt.textContent = '— Select layer —';
    layerSel.appendChild(blankOpt);

    LAYERS.forEach(layer => {
      // When a viewpoint filter is active, only show layers that contain at least
      // one allowed element in that viewpoint's palette.
      if (effAllowed && !layersWithAllowed.has(layer.id)) return;
      const opt = document.createElement('option');
      opt.value = layer.id;
      opt.textContent = layer.label;
      if (wp.layer === layer.id) opt.selected = true;
      layerSel.appendChild(opt);
    });

    layerSel.onchange = () => selectLayer(i, layerSel.value || null);

    // Apply layer color as background hint
    if (wp.layer) {
      layerSel.style.background = LAYER_COLORS[wp.layer] || 'var(--surface-2)';
    }

    body.appendChild(layerSel);

    // Element select (only when layer chosen)
    if (wp.layer) {
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
      name.textContent = wp.element || 'Select element…';
      left.appendChild(name);
      trigger.appendChild(left);

      const chev = document.createElement('span');
      chev.className = 'chev';
      chev.textContent = '▾';
      trigger.appendChild(chev);

      trigger.onclick = () => openElementOverlay(trigger, i, wp.layer);
      body.appendChild(trigger);
    }

    card.appendChild(body);
    chain.appendChild(card);
  });

  checkReady();
  updateQuickExamplesVisibility();
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
  if (!shouldAutoHide) state.forceShowQuickExamples = false;
  const blockVisible = !shouldAutoHide || state.forceShowQuickExamples;
  block.hidden = !blockVisible;
  if (showRow) showRow.hidden = !shouldAutoHide || blockVisible;
  if (hideBtn) hideBtn.hidden = !shouldAutoHide || !blockVisible;
}

window.showQuickExamplesPanel = function () {
  state.forceShowQuickExamples = true;
  updateQuickExamplesVisibility();
};

window.hideQuickExamplesPanel = function () {
  state.forceShowQuickExamples = false;
  updateQuickExamplesVisibility();
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
  document.getElementById('btn-compact').classList.toggle('active',  mode === 'compact');
  document.getElementById('btn-swimlane').classList.toggle('active', mode === 'swimlane');
  if (state.segments) renderResults();
};

window.toggleVertical = function() {
  state.alignVertical = !state.alignVertical;
  const key = isResultsSideLayoutActive() ? ALIGN_VERTICAL_SIDE_LS : ALIGN_VERTICAL_STACK_LS;
  try {
    localStorage.setItem(key, state.alignVertical ? "1" : "0");
  } catch (_) {}
  updateVerticalToggleButton();
  if (state.segments) renderResults();
};


window.setDerived = function(include) {
  state.includeDerived = include;
  document.getElementById('btn-direct').classList.toggle('active',  !include);
  document.getElementById('btn-derived').classList.toggle('active',  include);
  rebuildGraph();
  if (state.segments) findPath();
  updatePathOptionsTriggerSummary();
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
};

// ── Quick Examples ─────────────────────────────────────────────────────────────

window.loadExample = function(waypoints) {
  // waypoints = [{layer, element}, ...]
  state.waypoints = waypoints.map(wp => ({ layer: wp.layer, element: wp.element }));
  renderWaypointChain();
  // Auto-find path
  const waypointNames = state.waypoints.map(wp => wp.element);
  try {
    state.segments = findPaths(state.graph, waypointNames, { maxDepth: 6, maxPaths: 5 });
    state.activePathIdx = 0;
    state.lastAutoOrdered = false;
    state.lastAutoOrderInput = null;
    state.lastAutoOrderResult = null;
    renderResults();
  } catch(e) { console.error(e); }
};

// ── Find Path ───────────────────────────────────────────────────────────────

window.findPath = function() {
  const picked = state.waypoints.map(wp => wp.element).filter(Boolean);
  state.lastAutoReversed = false;
  state.lastAutoOrdered = false;
  
  window.state.userChoices = {}; // Reset decisions for the new path
  
  // ... rest of function

  try {
    setLoading(true, "Finding…");
    state.userChoices = {}; // Clear previous decisions
    // Allow browser to paint loading state before doing BFS work.
    setTimeout(() => {
    let segs = [];
    let chainForExplain = null;

    state.userChoices = {}; // Clear previous decisions
    if (state.selectionMode === 'set') {
      const res = findBestChainForSet(state.graph, picked, { maxDepth: 6, maxPaths: 5 });
      segs = res?.segments ?? [];
      chainForExplain = res?.orderedPoints ?? null;
      state.lastAutoOrdered = true;
      state.lastAutoOrderInput = picked.slice();
      state.lastAutoOrderResult = chainForExplain ? chainForExplain.slice() : null;
    } else {
      const waypointNames = state.waypoints.map(wp => wp.element);
      chainForExplain = waypointNames;
      segs = findPaths(state.graph, waypointNames, { maxDepth: 6, maxPaths: 5 });
    }

    const hasNoPath = !segs || segs.length === 0 || segs.some(s => !s.paths || s.paths.length === 0);

    // If no path in the chosen direction, try the reverse for a simple 2-point query
    if (hasNoPath && state.selectionMode === 'ordered') {
      const waypointNames = state.waypoints.map(wp => wp.element);
      if (waypointNames.length === 2) {
        const reversed = [waypointNames[1], waypointNames[0]];
        const segsRev = findPaths(state.graph, reversed, { maxDepth: 6, maxPaths: 5 });
      const hasRev = !segsRev.some(s => !s.paths || s.paths.length === 0);
      if (hasRev) {
        state.segments = segsRev;
        state.lastAutoReversed = true;
      } else {
        state.segments = segs;
      }
      } else {
        state.segments = segs;
      }
    } else {
      state.segments = segs;
    }

    state.activePathIdx = 0;
    renderResults();
    setLoading(false);
    }, 0);
  } catch (e) {
    console.error('findPath error:', e);
    showError(e.message);
    setLoading(false);
  }
};

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
    explainEl.innerHTML = explainNoPath(fromEl, toEl, 'unknown');

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

  // Build path tabs from the first segment's paths
  // (all segments are traversed; tabs cycle through alternative 0–4)
  const maxAlts = Math.max(...segments.map(s => s.paths.length));
  emptyEl.style.display = 'none';

  // Render tabs
  if (maxAlts > 1) {
    tabsEl.style.display = 'flex';
    tabsEl.innerHTML = '';
    tabsEl.title =
      maxAlts > 2
        ? "Several path options — scroll or swipe sideways to see them all"
        : "";
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
      alignVertical: state.alignVertical,
    });
    if (diagramPanShouldReset(segments)) resetDiagramView();
  } catch (e) {
    console.error('[NAV] renderPath failed', e);
    diagramEl.innerHTML = `<p style="color:var(--invalid);font-size:13px;padding:12px">Diagram could not be drawn. ${String(e.message || e)}</p>`;
    resetDiagramPanContext();
    resetDiagramView();
  }
  // Render explanation
  const reversedNote = state.lastAutoReversed
    ? `<div class="explain-waypoint-note" style="margin-bottom:12px">
        No path was found in the selected direction. Showing the <strong>reverse direction</strong> instead (End → Start).
      </div>`
    : "";
  const autoOrderedNote = (state.selectionMode === 'set' && state.lastAutoOrdered && state.lastAutoOrderResult?.length)
    ? `<div class="explain-waypoint-note" style="margin-bottom:12px">
        <strong>Connect set:</strong> order was chosen automatically to minimise total path cost.
        Showing: <strong>${state.lastAutoOrderResult.join(" → ")}</strong>
      </div>`
    : "";
  try {
    explainEl.innerHTML = reversedNote + autoOrderedNote + explainPath(segments, pathIdx, { constrained: state.selectionMode === 'ordered' });
  } catch (e) {
    console.error('[NAV] explainPath failed', e);
    explainEl.innerHTML = reversedNote + autoOrderedNote + `
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

  const codes = flat[hopIdx]?.codes ?? [];
  const codeList = codes.map(c => String(c).toUpperCase());
  const primaryCode = codeList[0] ?? null;
  const relName = primaryCode ? (RELATIONSHIPS?.[primaryCode]?.name ?? primaryCode) : "Relationship";
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
    ${primaryCode ? `<div style="margin-top:6px;color:var(--text-2)">
      <strong>Relationship:</strong> ${relName} <span style="color:var(--text-3)">[${codeList.join(", ")}]</span>
      ${dirRule?.rule ? `· <span style="color:var(--text-3)">${dirRule.rule} <cite>${dirRule.section}</cite></span>` : ""}
    </div>` : ""}
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
    block.onclick = () => { clearHopHighlights(); highlightHop(hopIdx); };
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
  renderResults();
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

function showError(msg) {
  document.getElementById('explanation-content').innerHTML =
    `<div style="color:var(--invalid);padding:12px;font-size:13px">Error: ${msg}</div>`;
}

// ── Boot ────────────────────────────────────────────────────────────────────

init();

document.getElementById("feedback-form")?.addEventListener("submit", (e) => {
  e.preventDefault();
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
  const filename = waypoints ? `ArchiMate_${waypoints}.svg` : "ArchiMate_Path.svg";

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
};


window.setEdgeChoice = function(hopIndex, code) {
  console.log(`[DECISION] Hop ${hopIndex} set to ${code}`);
  window.state.userChoices[hopIndex] = code;
  
  // CRITICAL: We must re-run the render logic to update the SVG and Explanation
  if (window.state.segments) {
    renderResults(); 
  }
};

window.cycleEdgeChoice = function(hopIndex) {
  if (!state.segments) return;
  
  // Find the exact step data for this hop
  const flatSteps = flattenSegments(state.segments, state.activePathIdx ?? 0);
  const step = flatSteps[hopIndex];
  if (!step || !step.codes || step.codes.length <= 1) return;

  // Find the currently active choice and cycle to the next one
  const currentChoice = state.userChoices[hopIndex] ?? step.codes[0];
  const currentIndex = step.codes.indexOf(currentChoice);
  const nextIndex = (currentIndex + 1) % step.codes.length;

  window.setEdgeChoice(hopIndex, step.codes[nextIndex]);
};