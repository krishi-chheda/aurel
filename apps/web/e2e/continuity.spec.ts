// Cross-platform integration tests: the real web UI on one side, the mobile client's API calls on the other.
import { expect, test } from "@playwright/test";

import { mobileClient, registerViaUi, uniqueEmail } from "./helpers";

test("1. onboarding: start on web, finish on mobile, see completion on web", async ({ page }) => {
  const email = uniqueEmail("onb");
  await registerViaUi(page, email, "Tess");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByLabel("Date of birth").fill("1988-02-03");
  await page.getByLabel("Postcode").fill("3000");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("heading", { name: "Your goals" })).toBeVisible();

  // Browser closed; phone picks up.
  await page.goto("about:blank");
  const phone = await mobileClient(email, "ios");
  let st = await phone.get("/onboarding");
  expect(st.current_step).toBe("health_goals");
  for (const [step, data] of [
    ["health_goals", { health_goals: ["sleep"] }],
    ["lifestyle", { activity_days_per_week: 2, sleep_hours: 7, diet: "vegan", alcohol_drinks_per_week: 0, smoker: false }],
    ["history", { family_history: ["none"], conditions_note: null, takes_medication: false }],
  ] as const) {
    const r = await phone.put(`/onboarding/steps/${step}`, { version: st.version, data });
    expect(r.ok()).toBeTruthy();
    st = await r.json();
  }
  expect((await phone.post("/onboarding/complete", { version: st.version })).ok()).toBeTruthy();

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Tess" })).toBeVisible();
  await expect(page.getByText("Finish setting up your profile")).toHaveCount(0);
  await page.goto("/onboarding");
  await expect(page.getByText(/last saved .* on iPhone/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "All set" })).toBeVisible();
});

test("2. profile changes sync both ways, with a visible conflict on concurrent edits", async ({ page }) => {
  const email = uniqueEmail("prof");
  await registerViaUi(page, email);
  const phone = await mobileClient(email, "android");

  await page.goto("/profile");
  await page.getByLabel("Preferred name").fill("Robbie");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  let me = await phone.get("/me");
  expect(me.profile.preferred_name).toBe("Robbie");

  expect((await phone.patch("/me/profile", { version: me.profile.version, phone: "+61 400 123 456" })).ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByLabel("Mobile")).toHaveValue("+61 400 123 456");
  await expect(page.getByText(/on Android/)).toBeVisible();

  // Phone edits while the web form is open with an older version.
  me = await phone.get("/me");
  await phone.patch("/me/profile", { version: me.profile.version, postcode: "2000" });
  await page.getByLabel("Postcode").fill("4000");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/Your profile was changed on Android/)).toBeVisible();
  await expect(page.getByLabel("Postcode")).toHaveValue("4000"); // user input is not discarded
  await page.getByRole("button", { name: "Keep my changes" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  expect((await phone.get("/me")).profile.postcode).toBe("4000");
});

test("3. tasks completed on mobile show on web, and the reverse", async ({ page }) => {
  const email = uniqueEmail("task");
  await registerViaUi(page, email);
  const phone = await mobileClient(email, "ios");
  const task = (await phone.get("/tasks")).find((t: { kind: string }) => t.kind === "check_in");

  expect((await phone.patch(`/tasks/${task.id}`, { status: "done" })).ok()).toBeTruthy();
  await page.goto("/care-plan");
  const row = page.getByRole("listitem").filter({ hasText: "Weekly check-in" });
  await expect(row.getByRole("checkbox")).toBeChecked();
  await expect(row.getByText(/Completed on iPhone/)).toBeVisible();

  await row.getByRole("checkbox").uncheck();
  // After saving, the plan refreshes and the task moves back to "Scheduled actions".
  await expect(page.getByRole("checkbox", { name: "Mark done: Weekly check-in" })).not.toBeChecked();
  await expect.poll(async () => (await phone.get("/tasks?status=all")).find((t: { id: string }) => t.id === task.id).status).toBe("open");
  const after = (await phone.get("/tasks?status=all")).find((t: { id: string }) => t.id === task.id);
  expect(after.status).toBe("open");
});

test("4. failed save is explained, kept, and retried without duplicates", async ({ page }) => {
  const email = uniqueEmail("net");
  await registerViaUi(page, email);
  await page.goto("/care-plan");
  const row = page.getByRole("listitem").filter({ hasText: "Weekly check-in" });

  await page.route("**/api/tasks/**", (r) => r.abort("internetdisconnected"));
  await row.getByRole("checkbox").click(); // not check(): the optimistic tick reverts as soon as the save fails
  await expect(row.getByText(/Offline - changes kept/)).toBeVisible();
  await expect(row.getByRole("checkbox")).not.toBeChecked(); // reverted, not silently lost
  await page.unroute("**/api/tasks/**");
  await row.getByRole("button", { name: "Retry" }).click();
  await expect(row.getByRole("checkbox")).toBeChecked();

  // Booking: the response is lost after the server saved it; the retry reuses the idempotency key.
  await page.goto("/appointments");
  await page.getByRole("button", { name: "Request appointment" }).click();
  await page.getByRole("radio").nth(3).check({ force: true }); // first time slot (inputs are visually hidden behind labels)
  let first = true;
  await page.route("**/api/appointments", async (r) => {
    if (r.request().method() === "POST" && first) {
      first = false;
      await r.fetch(); // reaches the server...
      return r.abort("connectionreset"); // ...but the browser never sees the answer
    }
    return r.continue();
  });
  await page.getByRole("button", { name: "Send demo request" }).click();
  await expect(page.getByText(/offline/i).first()).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("button", { name: "Send demo request" })).toHaveCount(0);
  const phone = await mobileClient(email);
  const requested = (await phone.get("/appointments")).upcoming.filter((a: { status: string }) => a.status === "requested");
  expect(requested).toHaveLength(1);
});

test("load failure shows a recoverable error state", async ({ page }) => {
  await registerViaUi(page, uniqueEmail("err"));
  await page.route("**/api/dashboard", (r) => r.fulfill({ status: 500, body: JSON.stringify({ error: { code: "server_error", message: "Something went wrong on our side. Please try again." } }) }));
  await page.goto("/dashboard");
  await expect(page.getByText("We couldn't load this")).toBeVisible();
  await page.unroute("**/api/dashboard");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Health overview")).toBeVisible();
});

test("6. deep links: signed-out user lands on the linked appointment after sign-in; foreign next is ignored", async ({ page }) => {
  const email = uniqueEmail("link");
  await registerViaUi(page, email);
  const phone = await mobileClient(email);
  const appt = (await phone.get("/appointments")).upcoming[0];
  await page.getByRole("button", { name: "Sign out" }).click();

  await page.goto(`/appointments/${appt.id}`);
  await expect(page).toHaveURL(new RegExp(`/login\\?next=%2Fappointments%2F${appt.id}`));
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("E2eTestPass2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`/appointments/${appt.id}$`));
  await expect(page.getByText("Demonstration appointment.")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto("/login?next=https://evil.example/steal");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("E2eTestPass2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // Another user's appointment id behaves like a missing one.
  await page.goto("/appointments/00000000-0000-4000-8000-000000000000");
  await expect(page.getByText("Appointment not found")).toBeVisible();
});

test("audit AUD-08: a failed 'sign out on all devices' is reported and nothing is signed out", async ({ page }) => {
  const email = uniqueEmail("logoutall");
  await registerViaUi(page, email);
  const phone = await mobileClient(email);
  await page.goto("/profile");
  await page.route("**/api/auth/logout-all", (r) => r.abort("internetdisconnected"));
  await page.getByRole("button", { name: "Sign out on all devices" }).click();
  await expect(page.getByText("Nothing was changed")).toBeVisible();
  await expect(page).toHaveURL(/\/profile/); // not silently signed out locally
  await page.unroute("**/api/auth/logout-all");
  await page.getByRole("button", { name: "Sign out on all devices" }).click();
  await expect(page).toHaveURL(/\/login/);
  expect((await phone.post("/auth/logout")).status()).toBe(401); // the phone's session really ended
});
