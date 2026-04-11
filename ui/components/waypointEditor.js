// === ui/components/waypointEditor.js ===
(function waypointEditorBootstrap() {
  "use strict";

  function shallowWaypointSnapshot(state) {
    return JSON.stringify({
      selectionMode: state?.selectionMode,
      waypoints: (state?.waypoints || []).map((w) => ({ layer: w?.layer ?? null, element: w?.element ?? null })),
    });
  }

  function initWaypointEditor({ store, deps = {} } = {}) {
    if (!store || typeof store.subscribe !== "function") return;
    let lastSnapshot = shallowWaypointSnapshot(store.getState());
    store.subscribe(
      (s) => shallowWaypointSnapshot(s),
      (nextSnapshot) => {
        if (nextSnapshot === lastSnapshot) return;
        lastSnapshot = nextSnapshot;
        try {
          deps.renderWaypointChain?.();
          deps.checkReady?.();
          deps.updateQuickExamplesVisibility?.();
        } catch (_) {
          // component refresh is best-effort
        }
      }
    );
  }

  window.initWaypointEditor = initWaypointEditor;
})();
