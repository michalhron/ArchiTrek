// @ts-check
const { test, expect } = require("@playwright/test");

test.describe("Undo / redo", () => {
  test("undo button reverts explicit UPDATE_WAYPOINTS", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.clear();
      } catch (_) {}
      localStorage.setItem("archimate-welcome-seen", "1");
      localStorage.setItem("archimate-local-prefs-consent", "1");
    });
    await page.goto("/");
    // `window.store` exists as soon as app.js parses; wait until bootApp/init finishes (setLoading(false))
    // or addWaypointSlot / other init dispatches would race with the test and corrupt history depth.
    await page.waitForFunction(
      () =>
        window.store &&
        typeof window.store.getHistoryAvailability === "function" &&
        document.getElementById("undo-btn") &&
        window.store.getState().loading === false
    );

    const pack = await page.evaluate(() => {
      window.store.clearUndoHistory();
      const beforeEls = window.store.getState().waypoints.map((w) => w.element);
      window.store.dispatch("UPDATE_WAYPOINTS", [
        { layer: null, element: "Device", label: "Start" },
        { layer: null, element: "Node", label: "End" },
      ]);
      const pastBeforeUndo = window.store._historyPast.length;
      const canUndoBefore = window.store.getHistoryAvailability().canUndo;
      const undoOk = window.store.undo();
      return {
        beforeEls,
        afterWaypoints: window.store.getState().waypoints.map((w) => w.element),
        canUndoAfter: window.store.getHistoryAvailability().canUndo,
        canRedoAfter: window.store.getHistoryAvailability().canRedo,
        pastBeforeUndo,
        canUndoBefore,
        undoOk,
      };
    });

    expect(pack.canUndoBefore).toBe(true);
    expect(pack.pastBeforeUndo).toBe(1);
    expect(pack.undoOk).toBe(true);
    expect(pack.afterWaypoints).toEqual(pack.beforeEls);
    expect(pack.canUndoAfter).toBe(false);
    expect(pack.canRedoAfter).toBe(true);
  });

  test("store waypoints slots are plain data after boot (no proxy in _state)", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.clear();
      } catch (_) {}
      localStorage.setItem("archimate-welcome-seen", "1");
      localStorage.setItem("archimate-local-prefs-consent", "1");
    });
    await page.goto("/");
    await page.waitForFunction(
      () =>
        window.store &&
        window.store._state &&
        window.store._state.waypoints &&
        window.store.getState().loading === false
    );

    const json0 = await page.evaluate(() => {
      const w0 = window.store._state.waypoints[0];
      return JSON.stringify(w0);
    });
    expect(json0).toMatch(/layer/);
  });
});
