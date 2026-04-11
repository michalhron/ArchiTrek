// === ui/components/coachOverlay.js ===
(function coachOverlayBootstrap() {
  "use strict";

  function coachSignature(state) {
    return JSON.stringify({
      activePathIdx: state?.activePathIdx ?? 0,
      segmentsHash: Array.isArray(state?.segments) ? state.segments.length : 0,
      viewpoint: state?.viewpoint ?? null,
      searchMaxDepth: state?.searchMaxDepth ?? null,
      searchEffort: state?.searchEffort ?? null,
    });
  }

  function initCoachOverlay({ store, deps = {} } = {}) {
    if (!store || typeof store.subscribe !== "function") return;
    let lastSig = coachSignature(store.getState());
    store.subscribe(
      (s) => coachSignature(s),
      (sig) => {
        if (sig === lastSig) return;
        lastSig = sig;
        try {
          deps.refreshCoachOverlay?.();
        } catch (_) {
          // coach overlay refresh is best-effort
        }
      }
    );
  }

  window.initCoachOverlay = initCoachOverlay;
})();
