// @ts-check
const { test, expect } = require("@playwright/test");

test.describe("ArchiTrek", () => {
  test("homepage loads with expected title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/ArchiTrek/);
  });

  test("root document is HTML", async ({ request }) => {
    const res = await request.get("/");
    expect(res.ok()).toBeTruthy();
    expect(res.headers()["content-type"]).toMatch(/text\/html/);
  });

  test("Find Path enables after loadExample", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("archimate-welcome-seen", "1");
      localStorage.setItem("archimate-local-prefs-consent", "1");
    });
    await page.goto("/");
    await page.waitForFunction(() => typeof window.loadExample === "function");
    await page.evaluate(() =>
      window.loadExample([
        { layer: "Technology", element: "Device" },
        { layer: "Business", element: "Business Process" },
      ])
    );
    await page.waitForTimeout(2500);
    const btn = page.locator("#find-path-btn");
    await expect(btn).toBeEnabled();
  });

  test("feedback modal closes via X button", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("archimate-welcome-seen", "1");
      localStorage.setItem("archimate-local-prefs-consent", "1");
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Feedback" }).click();
    const modal = page.locator("#feedback-modal");
    await expect(modal).toBeVisible();
    await page.locator("#feedback-modal .feedback-modal-close").click();
    await expect(modal).not.toBeVisible();
  });
});
