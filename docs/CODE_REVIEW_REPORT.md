# Independent code review & QA audit — Aurel prototype

Audit date: 27 Oct 2026, re-audited 28 Oct 2026 (see [Re-audit](#re-audit-28-oct-2026)) · Scope: whole repository (`services/api`, `apps/web`, `apps/mobile`, `packages/shared`, `docs`)
Method: read the source, ran every available check, reproduced suspected defects against throwaway SQLite databases,
fixed verified issues with regression tests. All accounts used were synthetic. No real patient data was used.

## Executive summary

| | |
|---|---|
| Overall health | Good for a prototype. The architecture is coherent (one FastAPI backend, one shared TS client, server as source of truth), object-level authorisation held in every test, and the builder's documentation is mostly accurate about what is simulated. |
| Builds | **Yes.** API tests, web `tsc` + `next build`, mobile `tsc` + `expo export` (Android and iOS Hermes bundles) all succeed. |
| Confirmed issues | **P0: 0 · P1: 1 · P2: 5 · P3: 8 · P4: 6** (20 total; AUD-19 and AUD-20 found in the re-audit) |
| Fixed and verified | 18: AUD-01 to AUD-08 and AUD-19 (audit session) and AUD-09 to 13, 15 to 18 (builder session, follow-ups). Covers the only P1 and every P2. |
| Still open | 2. **AUD-20** (P3): with the default AUD-09 configuration, all web users share one rate-limit bucket. It needs the owner's hosting decision. AUD-14 (P4, tooling CVEs) is accepted risk. |
| Most significant risks | (1) The assistant's emergency/self-harm filter missed common phrasings such as "suicidal" and "diagnosis" (fixed). (2) A rotated refresh token could start a new session up to 20 s after logout, logout-all or a password reset (fixed). (3) Per-IP rate limits are keyed on a header the browser controls (open). (4) The mobile UI has never been run on a device or emulator. |
| Critical workflows verified? | **Web + API: yes**, by automated end-to-end tests in a real browser. **Mobile UI: no**. Its API usage is covered, its screens are not. |

## Environment and baseline

| Component | Found |
|---|---|
| API | Python 3.12 venv, FastAPI 0.162, SQLAlchemy 2.1, Alembic 1.20, Pydantic 2.14, PyJWT, bcrypt 5; SQLite (PostgreSQL configured but never run) |
| Web | Next.js 16.4.3 (Turbopack), React 19.3, Tailwind 4, GSAP 3.15, Playwright 1.64 |
| Mobile | Expo SDK 58, Expo Router, React Native 0.88, expo-secure-store |
| Shared | Zero-dependency TypeScript (API client, types, deep-link table, tokens), tests via `node --test` |
| CI | None (no `.github`, no CI config) |
| Git | Repository initialised, **no commits**. Everything is untracked, so there is no history to compare against. |

Baseline (before any change):

| Command | Result |
|---|---|
| `services/api: python -m pytest -q` | 40 passed |
| `packages/shared: npm test` | 8 passed |
| `apps/web: npx tsc --noEmit` | clean |
| `apps/web: npm run lint` | no lint script exists |
| `apps/mobile: npx tsc --noEmit` | clean |
| `apps/mobile: npm run lint` (`expo lint`) | auto-installed ESLint, then failed on a version check. The auditor reverted the install (config file and `package.json` entries removed). `npx eslint src` during that window: 6 errors, see AUD-13 |
| `apps/web: npx playwright test` (includes `next build`) | 13 passed (Edge, desktop + Pixel 7) |
| `npm audit` web / mobile | 0 / 5 high (AUD-14) |

Environment limits: no Android SDK or macOS, so no device or emulator runs. No PostgreSQL server. `pip-audit` is not installed and was not run. The desktop browser pane was hidden, so visual checks used headless Microsoft Edge through Playwright. Another session's `next dev` was already running on :3000, so the audit used its own stack (API :8021 and production web build :3021 on a scratch database) and left that server untouched.

## Findings

Severity follows the brief's P0–P4 scale. "Verified" means a test or a reproduction run, not code reading.

### AUD-01 · P1 · AI safety · Safety/clinical filter missed common phrasings — FIXED
- **Where:** `services/api/app/assistant.py:26-27`
- **Description:** Both regexes ended in `\b`, so stems like `suicid`, `diagnos`, `prescri` and `treat` only matched when the word ended right there. They never matched "suicidal", "diagnosis", "prescription" or "treatment". "Kill myself" and the curly apostrophe in "can’t breathe" (iOS smart punctuation) weren't covered either.
- **Reproduction:** `POST /assistant/ask {"message":"I feel suicidal"}`
- **Expected:** `kind: "safety"` with the emergency redirect.
- **Actual:** `kind: "fallback"` ("I can help you find your way around…"). "can you give me a diagnosis" and "I need a prescription" also fell through to the fallback.
- **Impact:** A person in crisis got a navigation hint instead of the emergency message. That is the exact case the filter exists for. Rated P1 because it is a safety control failing silently in a health product, even though the assistant is rule-based and makes no clinical claims.
- **Fix:** Removed the trailing `\b` from both patterns (stems now match words that start with them) and added `overdos`, `kill(ing) myself`, `end my life`, `want to die` and the curly-apostrophe form. Marked as a keyword list that needs clinical-safety review.
- **Verification:** `tests/test_audit_regressions.py::test_aud01_*` (9 cases). They failed before the fix and pass after.
- **Clinical review needed:** keyword matching is not a crisis classifier. The phrase list and the "000" emergency number (Australia only) need review by a qualified professional before any real use.

### AUD-02 · P2 · API validation / data integrity · `PATCH /me/profile` with explicit `null` crashed, and could leave the profile unreadable — FIXED
- **Where:** `services/api/app/schemas.py` (`ProfilePatch`)
- **Description:** Optional patch fields accepted `null` for required columns. `first_name: null` caused an IntegrityError and a 500. `health_goals: null` (and `notification_prefs: null`) was **committed** as JSON `null`. Every later `GET /me` then failed response validation and returned 500.
- **Reproduction:** `PATCH /me/profile {"version":v,"health_goals":null}` returns 500, and from then on `GET /me` returns 500 permanently.
- **Expected:** 422 validation error and no change.
- **Impact:** A crafted request (or a future client bug) breaks the profile screen on web and mobile for that user, with no way to recover in the app. It only affects the caller's own account, so P2 rather than P1.
- **Fix:** A field validator rejects explicit `null` for `first_name`, `last_name`, `health_goals` and `notification_prefs`. Omitting a field still means "unchanged", and optional fields like `preferred_name` can still be cleared.
- **Verification:** `test_aud02_profile_patch_rejects_null_for_required_fields`.
- **Note:** rows already corrupted before this fix are not repaired. None were found in the audit databases.

### AUD-03 · P3 · API · Date filters without a timezone caused a 500 — FIXED
- **Where:** `services/api/app/routers/health.py` (`series`)
- **Description:** `?from=2024-01-01T00:00:00` (no offset) reached the `UTCDateTime` bind, which raises on naive datetimes. The result was an unhandled 500.
- **Impact:** Limited. Both clients send `toISOString()` (UTC with `Z`), so only direct API callers hit it.
- **Fix:** The parameters are typed `AwareDatetime`, so a missing offset now returns 422 with a clear field error.
- **Verification:** `test_aud03_series_rejects_naive_dates_with_422`. The existing `test_biomarker_series_and_filters` still passes.

### AUD-04 · P3 · Appointments · The same slot could be booked twice — FIXED
- **Where:** `services/api/app/routers/appointments.py`
- **Description:** `GET /slots` hid taken slots, but `POST /appointments` and `reschedule` never checked them. Two requests with different idempotency keys booked the same time.
- **Reproduction:** Book slot S as `gp_review`, then book S again as `blood_test`. Both returned 201.
- **Fix:** One `_taken()` helper is now shared by `slots`, `request_appointment` and `reschedule` (rescheduling excludes the appointment's own current time). An idempotent retry of the original request still returns the original booking.
- **Verification:** `test_aud04_same_slot_cannot_be_booked_twice`, plus the existing `test_appointment_lifecycle` and the e2e booking-retry test.

### AUD-05 · P2 · Auth/session · A rotated refresh token could revive a session after logout, logout-all or password reset — FIXED
- **Where:** `services/api/app/routers/auth.py` (`refresh`)
- **Description:** The 20 s reuse grace window (meant for two tabs refreshing at once) accepted a rotated token as long as it had a successor. It did so **even when that successor had since been explicitly revoked**, and it issued a brand-new session.
- **Reproduction:** Refresh with T0 (T0 is now rotated), call `/auth/logout-all`, then refresh again with T0 within 20 s. Result: 200 and a new valid session.
- **Expected:** 401. "Sign out everywhere" and a password reset must end access.
- **Impact:** Anyone holding a just-rotated token (for example a stolen one) keeps access across the very actions a user takes to cut them off. The window is narrow (20 s), so P2.
- **Fix:** Grace applies only if the successor session has not been explicitly ended. A successor that was itself rotated is still allowed, so concurrent refreshes keep working.
- **Verification:** `test_aud05_*` (logout, logout-all, password reset). The existing `test_concurrent_refresh_within_grace_is_not_theft` and `test_refresh_rotates_and_detects_reuse` still pass.

### AUD-06 · P2 · Configuration · The production guard accepted the `.env.example` JWT secret — FIXED
- **Where:** `services/api/app/config.py`
- **Description:** With `ENV=production`, only secrets starting with `dev-only` were refused. The README tells people to `cp .env.example .env`, and that file's public placeholder `change-me-to-a-long-random-string` was accepted, as was a 1-character secret.
- **Impact:** A deployment that kept the placeholder would sign tokens with a published key, which allows forging any user's token (authentication bypass). It depends on a misconfiguration, so P2.
- **Fix:** In production the secret must be at least 32 characters and must not contain `change-me`.
- **Verification:** `test_aud06_*` (3 rejected, 1 strong secret accepted).

### AUD-07 · P3 · API validation · Admin pagination accepted negative `limit`/`offset` — FIXED
- **Where:** `services/api/app/routers/admin.py`
- **Description:** `?limit=-1` turned into a Python slice `[0:-1]`, which silently dropped the last row. `?offset=-5` was passed straight to SQL. Both returned 200.
- **Fix:** `ge=1` / `ge=0` on the query parameters.
- **Verification:** `test_aud07_admin_pagination_rejects_negative_values`.

### AUD-08 · P2 · Web & mobile · Account actions reported success when they had failed — FIXED
- **Where:** `apps/web/src/app/(app)/profile/page.tsx` (Account card), `apps/mobile/src/app/(tabs)/profile.tsx` (Deactivate)
- **Description:**
  - Web "Sign out on all devices": `.catch(() => {})` followed by a local logout. If the request failed, only this browser signed out, and the user believed every device had been.
  - Mobile "Deactivate": the same pattern. The account silently stayed active.
  - Web "Deactivate": rejected with no feedback.
- **Impact:** Users trying to revoke access or close their account are told it worked when it didn't. These are privacy-relevant actions in a health app.
- **Fix:** The server must confirm before the local sign-out. On failure, web shows "Nothing was changed" with the reason, and mobile shows an alert.
- **Verification:** New e2e test `audit AUD-08 …` in `apps/web/e2e/continuity.spec.ts`. It aborts the request, checks that the error appears and the user stays on Profile, then retries and checks that a separate mobile session really gets a 401. Mobile: `tsc` and `expo export` pass. **The mobile change has not been run on a device.**

### AUD-09 · P2 · Security · Per-IP rate limits can be bypassed through the web proxy — FIXED (header spoofing); shared counter store still required for multiple instances
- **Where:** `security.rate_limit` with `routers/auth.py::_client_ip`. Deployment: uvicorn defaults, plus the Next.js rewrite proxy.
- **Description:** Uvicorn trusts `X-Forwarded-For` from 127.0.0.1 by default, and the Next.js proxy forwards the browser's own header. The API therefore uses whatever IP the client claims.
- **Reproduction (verified):** 11 × `POST localhost:3021/api/auth/register` with `X-Forwarded-For: 203.0.113.$i` returned 201 eleven times. With a fixed header, the 11th returned 429. The API access log shows the spoofed addresses.
- **Impact:** Register, login-per-IP, forgot-password and reset-password limits can be bypassed, which allows sign-up spam and credential stuffing across many accounts. The per-email login limit (8 per 5 min) is not affected, so brute force against a single account stays limited. The original docs claimed the opposite (that every web user shared one IP); `docs/security.md` and `docs/status.md` are now corrected.
- **Recommended fix:** This is a deployment decision, so it was not changed in code. Put a trusted edge proxy or load balancer in front that **overwrites** `X-Forwarded-For`, run uvicorn with `--forwarded-allow-ips` set to that proxy only, and move counters to a shared store.
- **Decision (owner):** trusted-proxy setup.
- **Measured first:** a header-echo server behind the dev `/api` rewrite showed Next.js forwards the browser's `X-Forwarded-For` verbatim and adds no client address of its own (Next 16 also removed `request.ip`).
- **Fix:** (1) `apps/web/src/proxy.ts` strips client-supplied forwarding headers (`x-forwarded-for`, `x-real-ip`, `forwarded`, `true-client-ip`, `cf-connecting-ip`) on `/api/*`, unless `TRUST_EDGE_XFF=true` (only behind an edge that overwrites the header). (2) `security.client_ip()` believes `X-Forwarded-For` only when the socket peer is in `TRUSTED_PROXIES` (default empty = trust none), walks the chain right-to-left skipping trusted hops, and ignores malformed chains; every per-IP limit uses it. (3) uvicorn runs with `--no-proxy-headers` (launch config, Playwright, README) so its default 127.0.0.1 trust can't pre-empt this. Docs: README env table, both `.env.example` files, security.md item 4 (production topology), status.md.
- **Verification:** `test_aud09_client_ip_only_trusts_configured_proxies` (8 cases incl. spoofed chains, skipped trusted hops, malformed header) and `test_aud09_rotating_x_forwarded_for_no_longer_bypasses_register_limit` (11 registers with rotating XFF → 11th is 429). Live re-run of the audit's reproduction: 21 × `POST localhost:3000/api/auth/login` with rotating `X-Forwarded-For` and rotating emails → 20 × 401 then **429**; the same directly against the API on :8000 → 20 × 401 then **429** (previously never limited). Header echo confirms the proxy no longer forwards `X-Forwarded-For`/`X-Real-IP`.
- **Residual:** counters are still per process; a shared store (Redis or the gateway) is needed before running more than one API instance. Without an edge proxy, all web users share one per-IP bucket (unspoofable, but coarse).

### AUD-10 · P3 · Concurrency · Optimistic concurrency is check-then-write, not atomic — FIXED
- **Where:** `routers/me.py` (`patch_profile`, `save_step`), `appointments.py` (`reschedule`)
- **Description:** The version is compared in Python and then incremented. Two requests carrying the same version at the same moment can both pass and the last write wins. **Not reproduced** (SQLite serialises writes, which makes the window small).
- **Fix suggestion:** Use SQLAlchemy `version_id_col`, or `UPDATE … WHERE version = :v` and check the row count.
- **Fix:** `Profile`, `OnboardingSession` and `Appointment` now map `version` as `version_id_col`, so every ORM UPDATE carries `WHERE version = :loaded` and bumps it in the same statement (manual `+= 1` removed). A lost race raises `StaleDataError`, which `me.commit_or_conflict()` turns into the existing `409 version_conflict` carrying the *other* writer's current copy, so the web and mobile conflict UIs work unchanged. Applied to `patch_profile`, `save_step`, `complete`, `reschedule` and `cancel`. `Task` deliberately keeps last-write-wins (setting a status is idempotent). No schema change.
- **Verification:** `test_aud10_*` (4 tests). A competing write is injected through a second DB connection between the endpoint's version check and its commit; the request gets 409 and the competing write survives. All 4 fail with the fix reverted and pass with it.

### AUD-11 · P3 · Idempotency · Simultaneous duplicate bookings return 500 instead of the original — FIXED
- **Where:** `appointments.py::request_appointment`
- **Description:** If two requests with the same `client_request_id` arrive together, both miss the "existing" lookup and the second hits `uq_appointments_client_request`. The unique constraint correctly prevents a duplicate, but the client gets a 500 instead of the original booking. Not reproduced.
- **Fix suggestion:** Catch `IntegrityError` on flush, roll back, and return the existing row.
- **Fix:** `request_appointment` catches `IntegrityError` on flush, rolls back, re-reads the row by `(user_id, client_request_id)` and returns it with 200 (re-raises if there is no such row, so unrelated integrity errors still surface).
- **Verification:** `test_aud11_simultaneous_duplicate_booking_returns_original` inserts the competing booking after the "existing" lookup has missed; the response is 200 with the original id and only one booking exists. Fails (IntegrityError → 500) with the fix reverted.

### AUD-12 · P3 · Session restore · Starting the app offline looks like being signed out — FIXED (web verified; mobile not run on a device)
- **Where:** `apps/web/src/lib/session.tsx`, `apps/mobile/src/lib/session.tsx`, `packages/shared/src/api.ts::refresh`
- **Description:** `refresh()` returns `false` on network errors (tokens are kept), and both providers map `false` to `"anon"`. A user who opens the app offline lands on the sign-in screen even though their session is valid. Nothing is lost, but it is misleading. Not exercised on a device.
- **Fix suggestion:** Return a distinct offline result and show an offline state with a retry.
- **Fix:** `refresh()` now returns `"ok" | "signed_out" | "unavailable"`. Only a 401 (or no stored token on mobile) is `signed_out`; network errors, timeouts and 5xx are `unavailable` and keep the tokens. A request whose 401-triggered refresh is `unavailable` now throws a `network` error (UI: offline) instead of a misleading "session expired". Both session providers gained an `offline` status and `retry()`. Web shows a "You're offline" screen in the app shell and admin and retries on the browser `online` event; mobile shows an offline screen and retries when the app returns to the foreground (only while offline, so tokens aren't rotated needlessly).
- **Verification:** shared tests `AUD-12: refresh distinguishes offline from signed out` and `AUD-12: a 401 whose refresh can't reach the server is reported as offline`; e2e `audit AUD-12` (refresh aborted on load → offline screen, URL stays `/dashboard`, "Try again" recovers). The e2e test fails with the provider change reverted. Mobile: `tsc` + `expo export` only.

### AUD-13 · P4 · Tooling · No working lint setup — FIXED
- The web app has no `lint` script. The mobile `lint` script (`expo lint`) installs ESLint on first run and then fails a version check. A one-off `npx eslint src` (since reverted) reported 6 React-Compiler-rule errors: `set-state-in-effect` in profile, onboarding and appointments/new; ref writes during render in `use-resource.ts`; non-literal deps in `useCallback`; `Date.now()` during render. No user-visible bug was traced to them.
- **Fix (28 Oct 2026):** ESLint 9 flat configs added. Web: `eslint-config-next` 16.4.3 (`core-web-vitals` + `typescript`), `npm run lint`. Mobile: `eslint-config-expo` 58 (`eslint.config.js`), so `expo lint` no longer installs anything. The React-Compiler findings (15 web, 9 mobile) were fixed in code, not silenced: ref writes moved into effects; `restore` declared before use; derived form state uses the "adjust state while rendering" pattern; slot resets moved into the type-change handler; `Date.now()` moved out of render; onboarding loads via promise callbacks; the phone check uses `useSyncExternalStore` (no hydration mismatch). Two disables remain, each with a comment: fetch-on-mount in web `useResource` (`set-state-in-effect`, the hook's purpose) and the deliberate `depKey` dependency in mobile `useResource`.
- **Verification:** `npx eslint .` clean in `apps/web` and `apps/mobile`; `tsc` clean in both; API 75, shared 11, web e2e 18 all pass.

### AUD-14 · P4 · Dependencies · `npm audit` reports 5 high in mobile tooling — ACCEPTED RISK (tracked)
- `node-forge` and `zod` via `@expo/cli` / `@expo/code-signing-certificates`. These are build tooling and are not in the app bundle. The only automated fix offered (`expo@44`) is a breaking downgrade. Track an Expo SDK patch instead. Web: 0 vulnerabilities. Python dependencies were not scanned (`pip-audit` not available).
- **Decision:** `expo` is already on the latest 58.x patch (58.0.19). `node-forge` has no fixed release (every version affected), and forcing `zod` 4 under `@expo/cli` (which uses the v3 API) risks breaking the build tool. Both are build-time only and not in the shipped bundle. Re-check on the next Expo SDK patch.

### AUD-15 · P4 · Web UX/resilience · The pre-paint hiding fail-safe stands down before the animation finishes — FIXED
- `layout.tsx` hides hero and auth content (`.js .hero-pre {visibility:hidden}`) and un-hides it after 3 s **unless** `data-motion` is set. `data-motion` is set as soon as the GSAP hook *starts*. If the animation then never runs (observed in a hidden or background tab, where animation frames are paused), the login form stays invisible until the tab is visible. In a normal, visible browser it animates in, as confirmed by Playwright. Consider setting `data-motion` on animation complete.
- **Fix:** `HeroIntro`/`AuthStage` set `data-motion="done"` in the timeline's `onComplete` (or immediately under reduced motion). If it is not done after 4 s, the gate removes `.js` **and** clears GSAP's inline start state on `.hero-pre` elements (visibility, opacity, transform), so content shows even if a stalled tween had already hidden it.
- **Verification:** e2e `audit AUD-15` replaces `requestAnimationFrame` with a no-op before load; the sign-in heading and button become visible. Fails with the old gate.

### AUD-16 · P4 · Health data display · The chart draws a line where the panel says no trend was calculated — FIXED (conservative; clinical/UX review still advised)
- On Vitamin D (mixed units), the chart plots only the nmol/L points and joins them with a line across the excluded ng/mL result. Meanwhile the side panel says "Trend not shown". The data is correct, but a connecting line visually suggests a trend. **Needs a clinical/UX reviewer's decision.**
- **Fix (conservative interim):** web and mobile charts draw the connecting line only when `trend.comparable` is true; otherwise the results are plotted as unconnected points with the caption "Points are not joined because no trend was calculated", so the chart never implies more than the panel. A reviewer may still prefer an alternative (e.g. a gap only around the excluded result).

### AUD-17 · P4 · Deep links · `LINK_HOSTS` includes `localhost:3000` in every build — FIXED
- `packages/shared/src/links.ts`. Harmless in practice, but production builds should not treat localhost as their own host.
- **Fix:** `LINK_HOSTS = ["aurel.example"]`, and only `https:` URLs on it are trusted (dev builds use in-app paths). **Verification:** shared test `AUD-17` (http and localhost variants rejected); existing deep-link tests unchanged.

### AUD-18 · P4 · Auth · bcrypt 72-byte truncation — FIXED
- `max_length=72` counts characters, while `hash_password` truncates to 72 **bytes**. With multi-byte passwords, the characters beyond 72 bytes are silently ignored. Low impact.
- **Fix:** registration and reset reject passwords over 72 **bytes** with a clear message; `hash_password` refuses instead of truncating; `verify_password` still runs bcrypt (timing) but never accepts input over 72 bytes, so "stored password + extra characters" no longer matches.
- **Verification:** `test_aud18_passwords_over_72_bytes_are_refused_not_truncated` (a 72-byte stored password; a ≤72-character, >72-byte login whose first 72 bytes match is refused with 401).

### AUD-19 · P3 · Appointments · Same-slot double booking still possible under concurrency — FIXED (re-audit)
- **Where:** `services/api/app/routers/appointments.py`, `models.py`. This is a gap in the auditor's own AUD-04 fix.
- **Description:** AUD-04 checked occupied slots in Python before inserting. Parallel requests for the same slot with **different** idempotency keys all passed that check before any of them committed.
- **Reproduction (live API, 12 parallel threads, scratch DB):** `{201: 2, 422: 10}`, giving 2 active appointments at one time.
- **Fix:** A partial unique index `uq_appointments_active_slot` on `(user_id, starts_at) WHERE status IN ('requested','scheduled')` (new Alembic revision `b7d41c0e9f12`, additive). The booking path's `IntegrityError` handler now returns 422 `slot_unavailable` when the conflict isn't the same idempotency key. Reschedule does the same. Cancelled bookings free their slot.
- **Verification:** `test_aud19_same_slot_race_is_stopped_by_the_database` failed before the fix and passes after. The live race, repeated 3 times, gives `{201: 1, 422: 11}` each time with 0 unhandled errors. Migration upgrade → downgrade → upgrade is clean, `alembic check` reports no drift, and the PostgreSQL DDL renders. A read-only check of `aurel.db` and `aurel-e2e.db` found 0 duplicate active slots, so `alembic upgrade head` will apply cleanly. **Dev databases need `alembic upgrade head`.**

### AUD-20 · P3 · Availability · Default AUD-09 configuration puts all web users in one rate-limit bucket — OPEN (owner decision)
- **Where:** `security.client_ip`, `TRUSTED_PROXIES` (default empty), `apps/web/src/proxy.ts`.
- **Description:** Without an edge proxy, the API correctly ignores client-supplied forwarding headers. As a result, every web request appears to come from the Next.js server's address. The per-IP limits (login 20/min, register 10/hour, forgot-password 5/15 min, reset 10/15 min) are then shared by **all** web users. One client can exhaust them and block sign-in or sign-up for everyone through the website for the window. Mobile clients connect directly and are unaffected, and so is the per-email login limit. `docs/security.md` mentions the shared address but not the lockout consequence.
- **Status:** Confirmed by reading the code (`client_ip` returns the socket peer when it isn't trusted). It can't be demonstrated from separate clients on one machine. This is the trade-off of the spoofing fix and depends on the hosting topology. The owner asked to defer AUD-09 to the hosting decision; this finding records the residual risk until then.
- **Recommended fix:** Deploy the edge topology in security.md item 4. Alternatively, before then, key the anonymous-endpoint limits on the target email as well as the IP, so a shared IP bucket can be loosened.

## Test results

| Test / command | Purpose | Result | Notes / limitations |
|---|---|---|---|
| `pytest -q` (after fixes) | API unit + integration incl. IDOR, auth, sync | **75 passed** (40 original + 20 audit + 15 follow-up: AUD-09 ×9, AUD-10 ×4, AUD-11, AUD-18) | SQLite only |
| `packages/shared npm test` | API client, deep-link validation | **11 passed** (8 + AUD-12 ×2, AUD-17) | |
| `apps/web npx playwright test` (after fixes) | Real-browser e2e incl. cross-device (web UI + mobile API client) | **16 passed** (13 original + AUD-08, AUD-12, AUD-15) | Mobile side is API-level, not the RN UI |
| Fix-reversion checks (follow-up) | Prove the new tests detect the defects | AUD-10/11 tests: 5 fail without the fixes; AUD-12/15 e2e: 2 fail without the fixes; all pass with the fixes restored | |
| `apps/web npx tsc --noEmit` / `next build` | Types + production build | clean / success | |
| `apps/mobile npx tsc --noEmit` | Types | clean | |
| `apps/mobile npx expo export --platform android --platform ios` | Native JS bundles | both built (3.2 MB / 2.8 MB Hermes), re-run after the follow-up fixes | Output to a temp dir; no device run |
| Runtime probe script (two synthetic users) | Reproduce suspected defects | reproduced AUD-01…07; all 6 cross-user write/read attempts → 404 | throwaway DB |
| Proxy rate-limit test via `:3021/api` | Verify the rate-limit claim in the docs | reproduced AUD-09 | |
| AUD-09 re-run after fix (`:3000/api` and API `:8000` direct, 21 logins, rotating XFF) | Confirm the bypass is closed | 429 on the 21st request on both paths | in-process counters |
| Headless Edge sweep (11 customer pages × desktop 1280 + phone 390, plus admin) | Visual, console errors, overflow, labels | no page errors, no 5xx, no horizontal overflow, no unlabelled controls | Small-target heuristic flagged only inline text links / visually-hidden inputs behind larger labels. No screen-reader or axe audit. |
| `npm audit` | Dependency CVEs | web 0, mobile 5 high (tooling) | |
| Secret grep | Committed credentials | only synthetic test/demo passwords | |

## Cross-platform validation

"Mobile" below means a second client using the same API calls and headers as the Expo app. The React Native screens themselves were **not** run.

| Journey | Status | Evidence |
|---|---|---|
| Registration and login | PASS | e2e `register, sign out, sign in, wrong password`; pytest auth suite |
| Auth persistence and logout | PASS (web) / NOT TESTED (mobile UI) | e2e; pytest refresh/logout tests; AUD-05 fixed |
| Onboarding started on web, continued and finished on mobile, shown on web | PASS (web UI + mobile API) | e2e test 1; `test_1_onboarding_started_on_web_finished_on_mobile` |
| Profile updates across devices incl. conflict | PASS | e2e test 2; pytest |
| Health dashboard loading and error handling | PASS (web) | e2e "load failure shows a recoverable error state"; visual sweep |
| Care-plan workflows (tasks both directions) | PASS | e2e test 3 |
| Appointment workflows | PASS after fix (AUD-04) | pytest lifecycle + new test; e2e booking retry |
| Notifications (in-app) | PASS (API) | pytest; push is BLOCKED (no APNs/FCM) |
| Admin access restrictions | PASS | pytest role tests; e2e customer blocked |
| Isolation between two synthetic users | PASS | pytest IDOR suite + auditor probes (6 endpoints → 404) |
| Recovery from failed API requests | PASS (web) | e2e test 4 + AUD-08 test |
| Deep links (web, incl. open-redirect guard) | PASS | e2e test 6; `links.test.ts` |
| Deep links in the app / Universal & App Links | NOT TESTED / BLOCKED | needs device + real domain, Team ID, signing fingerprint |
| Database persistence after restart | NOT TESTED | no explicit restart test was performed |
| Mobile UI (any screen) | NOT TESTED | no Android SDK / macOS available |

## Security summary

- **Confirmed and fixed:** AUD-01 (safety filter), AUD-05 (session revival after revocation), AUD-06 (weak production secret accepted), AUD-08 (revocation and deactivation failing silently), AUD-02 (crafted request breaks the profile).
- **Fixed in follow-up (owner chose the trusted-proxy design):** AUD-09 (per-IP rate-limit bypass through a spoofable `X-Forwarded-For`). Residual: per-process counters.
- **Fixed in follow-up:** AUD-10 / AUD-11 (concurrency races), AUD-18 (bcrypt truncation), AUD-17 (trusted link hosts).
- **Potential, needs investigation:** registration still reveals whether an email exists (documented by the builder); no CSP; refresh cookie relies on `SameSite=Strict` only.
- **Verified controls:** object-level authorisation (foreign ids return 404 on every endpoint tried), role checks on the admin routes, the httpOnly/`SameSite=Strict` refresh cookie, immediate access-token invalidation on logout, generic login errors, the open-redirect guard, and no values echoed back in validation errors.
- **Not verifiable here:** SecureStore behaviour on a device, TLS/HSTS, PostgreSQL behaviour, log scrubbing in a real log pipeline, Python dependency CVEs.
- This audit does **not** establish that the system is secure or compliant (Privacy Act/APPs, My Health Records Act, HIPAA, etc.).

## Changes made

| File | Change | Reason | Verified by |
|---|---|---|---|
| `services/api/app/assistant.py` | Stem-matching safety/clinical regexes; more crisis phrases | AUD-01 | `test_aud01_*` |
| `services/api/app/schemas.py` | `ProfilePatch` rejects explicit null on required fields | AUD-02 | `test_aud02_*` |
| `services/api/app/routers/health.py` | `AwareDatetime` for `from`/`to` | AUD-03 | `test_aud03_*`, existing series test |
| `services/api/app/routers/appointments.py` | Shared `_taken()`; booking and reschedule reject occupied slots | AUD-04 | `test_aud04_*`, lifecycle test, e2e |
| `services/api/app/routers/auth.py` | Grace window ignored once the successor was explicitly revoked | AUD-05 | `test_aud05_*`, existing refresh tests |
| `services/api/app/config.py` | Production requires a ≥32-char, non-placeholder `JWT_SECRET` | AUD-06 | `test_aud06_*` |
| `services/api/app/routers/admin.py` | `ge` bounds on `limit`/`offset` | AUD-07 | `test_aud07_*` |
| `apps/web/src/app/(app)/profile/page.tsx` | Account actions sign out only after server success; show an error otherwise | AUD-08 | new e2e test, `tsc`, build |
| `apps/mobile/src/app/(tabs)/profile.tsx` | Deactivate signs out only after server success; alert otherwise | AUD-08 | `tsc`, `expo export` (no device run) |
| `services/api/tests/test_audit_regressions.py` | 20 regression tests | — | — |
| `apps/web/e2e/continuity.spec.ts` | AUD-08 e2e test | — | — |
| `docs/security.md`, `docs/status.md` | Corrected the rate-limit description | AUD-09 | — |
| `services/api/app/models.py`, `routers/me.py`, `routers/appointments.py` | `version_id_col` on Profile/OnboardingSession/Appointment; `commit_or_conflict()`; manual bumps removed | AUD-10 | `test_aud10_*` |
| `services/api/app/routers/appointments.py` | Catch `IntegrityError` on the booking flush and return the original | AUD-11 | `test_aud11_*` |
| `packages/shared/src/api.ts`, web + mobile `lib/session.tsx`, web `components/ui.tsx`, `(app)/layout.tsx`, `admin/page.tsx`, mobile `app/_layout.tsx` | Three-way refresh result; offline session status, screens and auto-retry | AUD-12 | shared tests, e2e `audit AUD-12`; mobile `tsc` + export |
| `apps/web/src/components/motion/primitives.tsx`, `apps/web/src/app/layout.tsx` | Motion flag set on completion; fail-safe clears the inline hidden state | AUD-15 | e2e `audit AUD-15` |
| web + mobile `components/line-chart.tsx` | Connecting line only when the trend is comparable | AUD-16 | `tsc`, visual |
| `packages/shared/src/links.ts` | Production https host only | AUD-17 | shared test |
| `services/api/app/security.py`, `schemas.py` | Byte-accurate 72-byte limit; no truncated matches | AUD-18 | `test_aud18_*` |
| `services/api/app/security.py` (`client_ip`), `config.py` (`TRUSTED_PROXIES`), `routers/auth.py`; `apps/web/src/proxy.ts`; `.claude/launch.json`, `playwright.config.ts` (`--no-proxy-headers`); README, `.env.example` ×2, security.md, status.md | Trusted-proxy client IP; proxy strips spoofable forwarding headers | AUD-09 | `test_aud09_*`, live re-run |
| `services/api/tests/test_audit_regressions.py`, `packages/shared/test/*.test.ts`, `apps/web/e2e/auth.spec.ts` | Follow-up regression tests | AUD-10/11/12/15/17/18 | — |
| `services/api/app/models.py`, `routers/appointments.py`, `alembic/versions/b7d41c0e9f12_active_slot_unique.py`, `tests/test_audit_regressions.py` | Partial unique index on active `(user_id, starts_at)`; integrity conflict → 422 `slot_unavailable` on booking and reschedule | AUD-19 (re-audit) | `test_aud19_*`, live 12-thread race ×3, migration up/down/check |

Side effects to know about: `apps/web/.next` now holds a production build whose `/api` rewrite points at `http://127.0.0.1:8021` (the audit API). Run `npm run build` before `npm start`, as the README already warns after e2e runs. Nothing was committed or pushed.

## Outstanding issues and required manual checks

0. Apply the AUD-19 migration to existing databases: `cd services/api && .venv/Scripts/alembic upgrade head`.
1. **AUD-20 / hosting decision:** deploy the edge proxy described in security.md item 4 (`TRUST_EDGE_XFF=true`, `TRUSTED_PROXIES`) so per-IP limits are per user again. Before multi-instance deployment, also move rate-limit counters to a shared store.
2. AUD-14 (re-check on the next Expo SDK patch). AUD-10 to 13 and AUD-15 to 18 are fixed.
3. Run the mobile app on an iOS simulator and an Android emulator or device: onboarding resume, task sync, deep links (`aurel://…`), SecureStore persistence across restarts, deactivate error path (AUD-08).
4. Universal / App Links with a real domain.
5. PostgreSQL: run migrations and the pytest suite against a live server.
6. Accessibility: automated axe (WCAG 2.1 A/AA) now runs in e2e over 17 web pages (light mode) with no serious or critical findings. Still manual: VoiceOver/TalkBack, dark-mode contrast scan, text scaling on mobile.
7. Clinical review of reference ranges, the assistant keyword lists, and the chart behaviour (AUD-16).
8. `pip-audit` for the Python dependencies. Add CI to run pytest, shared tests, `tsc` and e2e.

## Re-audit (28 Oct 2026)

The audit session independently re-checked the codebase after the builder's follow-up work. It did not rely on the builder's reports.

| Check | Result |
|---|---|
| Earlier audit regression tests (AUD-01 to 08) | Unchanged. The builder only appended tests |
| `pytest -q` | 75 passed before the AUD-19 fix, **76 passed** after |
| `packages/shared npm test` | 11 passed |
| `apps/web` / `apps/mobile` `tsc --noEmit` | clean / clean |
| `apps/web npm run lint` (new) / `apps/mobile npm run lint` (`expo lint`) | 0 problems / 0 problems; `expo lint` no longer edits `package.json` (AUD-13 confirmed fixed) |
| `apps/web npx playwright test` | **18 passed**, including the new axe WCAG 2.1 A/AA scans of public and signed-in pages; re-run after the AUD-19 fix (applies the new migration to the e2e DB): **18 passed** |
| `npm audit` | web 0; mobile unchanged (AUD-14, accepted) |
| Live concurrency, 12 parallel requests (scratch DB, :8031) | AUD-10 profile `{200:1, 409:11}`, onboarding `{200:1, 409:11}`, version +1 once; AUD-11 same key `{201:1, 200:11}`, 1 appointment; same slot with different keys exposed **AUD-19**, now fixed |
| Code review of follow-up changes | `version_id_col` + `commit_or_conflict` (correct, no schema change); booking `IntegrityError` handling; three-way `refresh()` (network/5xx keep tokens, only 401 signs out) in both session providers; `proxy.ts` + `client_ip` (right-most untrusted hop, malformed chain ignored) correct, with the residual risk recorded as **AUD-20** |

Pre-existing, low-risk race noted but not filed separately: a sign-in finishing while the startup session check is still in flight can be overwritten by that check's "signed out" result. This needs a slow network and is unchanged from the original code.

## Final assessment

**FUNCTIONALLY TESTED WITH KNOWN LIMITATIONS.**

Re-audit: 76 API tests, 11 shared tests, 18 browser e2e tests (including automated accessibility scans), both type checks and both linters pass. AUD-19 was found and fixed, and AUD-20 is open pending the hosting decision. The original assessment below still applies.

Every build and test command passes after the fixes (75 API, 11 shared, 16 browser e2e, both type checks, the web build, and both mobile bundles), including the follow-up fixes for AUD-09–12 and AUD-15–18. The headline cross-device journeys pass end-to-end in a real browser against the real API, and cross-user isolation held under direct probing. The only P1, every P2 and every P3 were fixed with regression tests. What keeps this below "ready for a controlled staging review": the fact that the mobile UI has never been executed, so mobile-side behaviour rests on shared code and API-level tests only. This is not a statement of production readiness or healthcare compliance. Those require independent security, privacy, clinical and operational reviews.
