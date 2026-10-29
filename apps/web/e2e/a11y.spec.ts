import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { registerViaUi, uniqueEmail } from "./helpers";

// Automated WCAG 2.1 A/AA scan (axe-core). Catches a subset of issues only; no substitute for a screen-reader pass.
async function scan(page: Page, path: string) {
  await page.goto(path, { waitUntil: "load" });
  await page.waitForTimeout(2500); // let entrance animations settle so contrast is measured on final colours
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return violations.filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${path} · ${v.id} · ${v.nodes.slice(0, 3).map((n) => n.target.join(" ") + " :: " + (n.any[0]?.message ?? "").slice(0, 140)).join(" | ")}`);
}

test("public pages have no serious or critical axe violations", async ({ page }) => {
  const found: string[] = [];
  for (const p of ["/", "/how-it-works", "/services", "/features", "/faq", "/contact", "/login", "/register"]) found.push(...(await scan(page, p)));
  expect(found).toEqual([]);
});

test("signed-in pages have no serious or critical axe violations", async ({ page }) => {
  test.setTimeout(120_000);
  await registerViaUi(page, uniqueEmail("a11y"));
  const found: string[] = [];
  for (const p of ["/onboarding", "/dashboard", "/health", "/reports", "/care-plan", "/appointments", "/notifications", "/profile", "/support"]) {
    found.push(...(await scan(page, p)));
  }
  expect(found).toEqual([]);
});
