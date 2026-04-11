// === ui/components/perspectiveAccordion.js ===
(function perspectiveAccordionBootstrap() {
  "use strict";

  function perspectiveSignature(state) {
    return JSON.stringify({
      activePathIdx: state?.activePathIdx ?? 0,
      segmentsHash: Array.isArray(state?.segments) ? state.segments.length : 0,
      perspectiveClassMode: state?.perspectiveClassMode ?? "exclusive",
      perspectiveDominantSharePct: state?.perspectiveDominantSharePct ?? 50,
      suggestFull: !!state?._perspectiveSuggestFullMetamodel,
      viewpoint: state?.viewpoint ?? null,
    });
  }

  function initPerspectiveAccordion({ store, deps = {} } = {}) {
    if (!store || typeof store.subscribe !== "function") return;
    let lastSig = perspectiveSignature(store.getState());
    store.subscribe(
      (s) => perspectiveSignature(s),
      (sig) => {
        if (sig === lastSig) return;
        lastSig = sig;
        try {
          deps.renderPerspectiveAccordion?.();
        } catch (_) {
          // perspective refresh is best-effort
        }
      }
    );
  }

  window.initPerspectiveAccordion = initPerspectiveAccordion;
})();
