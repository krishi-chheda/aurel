import { expect, test } from "@playwright/test";

import { registerViaUi, uniqueEmail } from "./helpers";

test("navigation adapts: bottom tabs on phones, sidebar on desktop", async ({ page }, info) => {
  await registerViaUi(page, uniqueEmail("resp"));
  await page.goto("/dashboard");
  const phone = info.project.name === "phone";
  const bottomBar = page.locator("nav.fixed");
  const sidebar = page.locator("aside");
  if (phone) {
    await expect(bottomBar).toBeVisible();
    await expect(sidebar).toBeHidden();
    await expect(page.getByRole("link", { name: /Open this screen in the Aurel app/ })).toHaveAttribute("href", "aurel://dashboard");
  } else {
    await expect(sidebar).toBeVisible();
    await expect(bottomBar).toBeHidden();
  }
  // No horizontal scrolling at any width.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
