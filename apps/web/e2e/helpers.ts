import { expect, request, type Page } from "@playwright/test";

export const API = "http://127.0.0.1:8011"; // e2e API (see playwright.config.ts)
export const PASSWORD = "E2eTestPass2026"; // synthetic test accounts only

export const uniqueEmail = (tag: string) => `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@aurel.example`;

/** Registers through the real web UI and waits for onboarding. */
export async function registerViaUi(page: Page, email: string, first = "Robin") {
  await page.goto("/register");
  await page.getByLabel("First name").fill(first);
  await page.getByLabel("Last name").fill("Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
}

/** A second device: the mobile app's API usage, sending the same headers the Expo client sends. */
export async function mobileClient(email: string, platform: "ios" | "android" = "ios") {
  const ctx = await request.newContext({ baseURL: API, extraHTTPHeaders: { "X-Client-Platform": platform } });
  const login = await ctx.post("/auth/login", { data: { email, password: PASSWORD } });
  expect(login.ok()).toBeTruthy();
  const { access_token, refresh_token } = await login.json();
  expect(refresh_token).toBeTruthy(); // mobile receives the refresh token in the body (stored in SecureStore)
  const headers = { Authorization: `Bearer ${access_token}` };
  return {
    get: async (p: string) => (await ctx.get(p, { headers })).json(),
    put: (p: string, data: unknown) => ctx.put(p, { headers, data }),
    patch: (p: string, data: unknown) => ctx.patch(p, { headers, data }),
    post: (p: string, data?: unknown) => ctx.post(p, { headers, data }),
  };
}
