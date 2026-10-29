import { expect, test } from "@playwright/test";

import { PASSWORD, registerViaUi, uniqueEmail } from "./helpers";

test("public site renders and links to sign-up", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("One health profile");
  await expect(page.getByText(/All health data shown is synthetic/).first()).toBeVisible();
  for (const [link, heading] of [["How it works", "Preventive care"], ["Services", "What's included"], ["FAQ", "Frequently asked"]]) {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: link }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
  }
});

test("protected routes send signed-out visitors to sign-in and back", async ({ page }) => {
  await page.goto("/care-plan");
  await expect(page).toHaveURL(/\/login\?next=%2Fcare-plan/);
});

test("registration validates on the client and the server", async ({ page }) => {
  await page.goto("/register");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Enter your first name.")).toBeVisible();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();

  await page.getByLabel("First name").fill("Sam");
  await page.getByLabel("Last name").fill("Weak");
  await page.getByLabel("Email").fill(uniqueEmail("weak"));
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByLabel("Confirm password").fill("different");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Use at least 10 characters including a letter and a number.")).toBeVisible();
  await expect(page.getByText("Passwords don't match.")).toBeVisible();
});

test("register, sign out, sign in, wrong password", async ({ page }) => {
  const email = uniqueEmail("auth");
  await registerViaUi(page, email);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fonboarding/); // returns to where they were
  await page.goto("/login");

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("NotThePassword1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();

  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Robin" })).toBeVisible();

  // Session survives a full reload (refresh cookie), without the page ever seeing the refresh token.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Robin" })).toBeVisible();
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === "aurel_refresh")?.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain("aurel_refresh");
});

test("customers cannot open the operations dashboard", async ({ page }) => {
  await registerViaUi(page, uniqueEmail("noadmin"));
  await page.goto("/admin");
  await expect(page.getByText("Staff only")).toBeVisible();
});

test("audit AUD-15: sign-in content becomes visible even if animation frames never run", async ({ page }) => {
  // A background tab pauses requestAnimationFrame; simulate the worst case where it never fires.
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("audit AUD-12: starting offline with a valid session shows 'offline', not the sign-in page", async ({ page }) => {
  await registerViaUi(page, uniqueEmail("offline"));
  await page.route("**/api/auth/refresh", (r) => r.abort("internetdisconnected"));
  await page.goto("/dashboard");
  await expect(page.getByText("You're offline")).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/); // not bounced to /login
  await page.unroute("**/api/auth/refresh");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Health overview")).toBeVisible();
});
