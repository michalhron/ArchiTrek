// @ts-check
const { test, expect } = require("@playwright/test");

test.describe("Diagram pan", () => {
  test("pan surface translate changes after drag on viewport", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("archimate-welcome-seen", "1");
      localStorage.setItem("archimate-local-prefs-consent", "1");
      localStorage.setItem("archimate-layout-mode", "top");
      localStorage.setItem("archimate-panel-collapsed", "1");
      localStorage.removeItem("archimate-session-v2");
    });
    await page.goto("/");
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.dataset.diagramPanZoomWired === "1"), {
        timeout: 10_000,
      })
      .toBeTruthy();
    await page.evaluate(() => {
      window.loadExample([
        { layer: "Business", element: "Business Role" },
        { layer: "Business", element: "Business Service" },
      ]);
    });
    await expect(page.locator("#path-diagram > svg")).toBeVisible({ timeout: 60_000 });

    const surf = page.locator("#diagram-pan-surface");
    const before = await surf.evaluate((el) => el.style.transform || "");
    const vp = page.locator("#diagram-pan-viewport");
    const box = await vp.boundingBox();
    expect(box).toBeTruthy();

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 100, cy + 60);
    await expect
      .poll(async () => surf.evaluate((el) => el.style.transform || ""), { timeout: 5000 })
      .not.toBe(before);
    const mid = await surf.evaluate((el) => el.style.transform || "");
    await page.mouse.up();

    expect(mid).toMatch(/translate\(/);
  });
});
