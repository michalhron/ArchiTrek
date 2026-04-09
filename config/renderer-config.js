// === config/renderer-config.js ===
/**
 * Central place for renderer geometry constants.
 *
 * The renderer is loaded as global scripts (no bundler), so we expose configuration via a single global.
 * `data/rendererVisuals.js` reads from this object with safe fallbacks.
 */

window.RENDER_GEOMETRY = Object.freeze({
  // Space between element columns (compact + horizontal swimlanes “spread” layout).
  EL_GAP: 96,
  // When a hop’s default polyline pierces another path node, jog to a vertical bus outside all boxes (east or west).
  OUTER_ROUTE_MARGIN: 8,
});

