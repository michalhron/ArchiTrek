// @ts-check
/**
 * Runtime check: top layout + collapsed drawer previously made #selector-panel-wrap
 * pointer-events: none — quick example clicks must still apply waypoints after auto-open.
 */
const { test, expect } = require("@playwright/test");

test.describe("Quick examples with top bar collapsed", () => {
  test("clicking first quick example fills waypoint labels after boot", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("archimate-welcome-seen", "1");
      localStorage.setItem("archimate-local-prefs-consent", "1");
      localStorage.setItem("archimate-layout-mode", "top");
      localStorage.setItem("archimate-panel-collapsed", "1");
    });
    await page.goto("/");
    await page.waitForFunction(() => typeof window.loadExample === "function");

    // Auto-open runs after init + deferred passes; wait until panel is interactive.
    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const wrap = document.getElementById("selector-panel-wrap");
          const root = document.getElementById("app-layout");
          if (!wrap || !root) return { ok: false, reason: "missing-dom" };
          const collapsed = root.classList.contains("panel-collapsed");
          const pe = getComputedStyle(wrap).pointerEvents;
          return { ok: !collapsed && pe !== "none", collapsed, pe };
        });
      })
      .toMatchObject({ ok: true });

    const firstExample = page.locator(".quick-examples-list .example-btn").first();
    await expect(firstExample).toBeVisible();
    await firstExample.click();
    await page.waitForTimeout(500);

    // Element names may live in SVG tiles (innerText on #waypoint-chain can be empty); assert cards + state.
    await expect(page.locator("#waypoint-chain .waypoint-card")).toHaveCount(2, { timeout: 8000 });
    const picked = await page.evaluate(() => {
      const w = window.store?.getState?.()?.waypoints;
      return Array.isArray(w) ? w.map((x) => x && x.element) : [];
    });
    expect(picked).toEqual(["Device", "Business Process"]);
    await expect(page.locator("#find-path-btn")).toBeEnabled();

    // loadExample dispatches FIND_PATH; pathfinding must produce segments (regression: stale runId / proxy picked).
    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const segs = window.store?.getState?.()?.segments;
          return Array.isArray(segs) ? segs.length : -1;
        });
      })
      .toBeGreaterThan(0);

    // Clear results then use the real button (onclick="findPath()") — must search again.
    await page.evaluate(() => {
      if (typeof window.state !== "undefined") window.state.segments = null;
    });
    await page.locator("#find-path-btn").click();
    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const segs = window.store?.getState?.()?.segments;
          return Array.isArray(segs) ? segs.length : -1;
        });
      })
      .toBeGreaterThan(0);
  });
});
