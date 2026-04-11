// === logic/layoutEngine.js ===
/**
 * Transitional layout planner extracted from ui/renderer.js.
 * Returns JSON plans consumed by renderer drawing routines.
 */
(function layoutEngineBootstrap() {
  "use strict";

  function computeCompactPlan(flatSteps, {
    elementWidth,
    elementHeight,
    elementGap,
    hasCompositePattern,
  }) {
    const steps = Array.isArray(flatSteps) ? flatSteps : [];
    const hasPattern = steps.some((s) => hasCompositePattern?.(s?.element));
    const totalW = steps.length * elementWidth + (steps.length - 1) * elementGap + 100;
    const totalH = hasPattern ? 320 : 150;
    let x = 50;
    const y = totalH / 2 - elementHeight / 2;
    const positions = [];
    for (let i = 0; i < steps.length; i++) {
      positions.push({ x, y, cy: y + elementHeight / 2, cx: x + elementWidth / 2 });
      x += elementWidth + elementGap;
    }
    return { totalW, totalH, positions };
  }

  window.layoutEngine = {
    computeCompactPlan,
  };
})();
