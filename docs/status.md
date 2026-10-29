# Feature status (as of 28 Oct 2026)

Legend: **Tested** = implemented and covered by automated tests that ran and passed · **Implemented** = working and
manually exercised, but no automated test · **Partial** · **Blocked** (external dependency) · **Not implemented**.

## Verification actually performed

| Check | Result |
|---|---|
| Backend `pytest` | 75 passed |
| Shared package `node --test` | 11 passed |
| Web e2e (Playwright, Microsoft Edge, desktop + Pixel 7 profiles) | 18 passed (includes the axe accessibility scan) |
| ESLint (web `eslint-config-next`, mobile `eslint-config-expo`) | clean |
| Accessibility: axe-core WCAG 2.1 A/AA over 17 web pages (light mode) | no serious or critical findings |
| Web `tsc --noEmit` + `next build` | clean, 23 routes |
| Mobile `tsc --noEmit` | clean |
| Mobile `expo export` for Android + iOS | both Hermes bundles built |
| Mobile UI on a device/emulator | **not run** (no Android SDK, iOS needs macOS) |
| Mobile UI via Expo web in a browser | manually exercised: sign-in, dashboard, resuming web-started onboarding, finishing it, ticking a task that then showed as done on the website |
| Alembic on SQLite | upgrade from empty verified (also in pytest) |
| Alembic on PostgreSQL | DDL rendered offline only; **no live PostgreSQL run** |

## Features

| Area | Feature | Status | Notes |
|---|---|---|---|
| Architecture | Monorepo, shared backend, shared contracts/tokens/links | Tested | |
| Auth | Register, login, logout, logout everywhere | Tested | |
| Auth | Session restore, refresh rotation, reuse detection, expiry handling | Tested | |
| Auth | Password recovery | Tested (API) / Implemented (UI) | Email delivery blocked: link printed to the API log |
| Auth | Role-based authorisation, IDOR protection | Tested | |
| Auth | Secure token storage on mobile (SecureStore) | Implemented | Not run on a device |
| Continuity | Cross-device onboarding (spec test 1) | Tested | API-level and e2e (web UI + mobile client) |
| Continuity | Profile sync + conflict handling (test 2) | Tested | |
| Continuity | Task sync both directions (test 3) | Tested | |
| Continuity | Failed request → clear feedback → retry without duplication (test 4) | Tested | Tasks, profile, onboarding, appointment booking |
| Continuity | Cross-user access rejected (test 5) | Tested | |
| Continuity | Deep links on web incl. auth redirect, foreign `next` rejected (test 6, web) | Tested | |
| Continuity | Deep links in the app (`aurel://`, native-intent validation, post-login target) | Implemented | Route validation unit-tested; on-device link opening not tested |
| Continuity | Universal Links / Android App Links | Blocked | Needs domain, Apple Team ID, signing fingerprint |
| Continuity | Real-time sync | Not implemented | Refresh on focus/foreground/reconnect, pull-to-refresh, 60 s polling on web |
| Web | Public site (home, how it works, services, platform, FAQ, contact) | Tested (render + nav) | Contact form validates but sends nothing (labelled) |
| Web/Mobile | Dashboard | Tested (web) / Implemented (mobile) | |
| Web/Mobile | Health profile (edit, goals, notification prefs, deactivate) | Tested (web) / Implemented (mobile) | |
| Web/Mobile | Biomarker history: filters, trend, units, reference ranges, sources, not-comparable explanation, unavailable results | Tested (API) / Implemented (UI) | |
| Web/Mobile | Reports list + detail + review task | Implemented | |
| Web | Health maps: three 3D knowledge graphs (body systems, reports, plan & care) — two small cards and one large map; tapping a card swaps it in | Tested (API) / Implemented (UI) | Ported from ClinicalBrief. Links show how records are organised, never clinical associations; web only |
| Web | Goal journey (figure walks towards "Healthy" as plan actions complete) | Implemented | Driven by care-plan progress; on My Plan and the dashboard; web only |
| Web | Contact page with builder details | Implemented | Form opens a pre-filled draft in the visitor's own email app; no messages are sent by the site |
| Web/Mobile | Care plan: goals, actions, milestones, progress, completed | Tested (task flows) | Reminders are in-app notifications only |
| Web/Mobile | Appointments: list, detail, request, reschedule, cancel, prep notes | Tested (API + booking retry e2e) | Every booking is a labelled simulation |
| Web/Mobile | Notification centre, read/unread, mark all | Tested (API) / Implemented (UI) | |
| Notifications | Push notifications | Blocked | Needs APNs/FCM + EAS; generic lock-screen text already modelled |
| Assistant | Rule-based help assistant with safety redirects | Tested | No external AI; integration boundary documented |
| Operations | Admin/coordinator dashboard, deterministic flags, role-scoped fields, audit log | Tested (API) / Implemented (UI) | Web only; synthetic records |
| Accessibility | Semantic markup, labels, focus, contrast, reduced motion, touch targets | Tested (web, automated axe) / Implemented (mobile) | axe in e2e (light mode). No VoiceOver/TalkBack or dark-mode scan yet |
| Data | PostgreSQL support | Partial | Code and migrations are dialect-neutral; not run against a live server |

## Known limitations

- Mobile has no automated UI tests (no Jest/Detox set-up); its logic shares the tested API client and link table.
- Expo web is used only for smoke-testing; there it keeps the refresh token in memory and reports itself as `web`.
- Rate limiting is per process (needs a shared store for multiple instances). Per-IP keys can no longer be spoofed
  (AUD-09 fixed); without an edge proxy that sets `X-Forwarded-For`, all web traffic shares one per-IP bucket
  (see security.md item 4).
- Data refresh is periodic, not pushed, and the UI says so.
- The seed password is shared by all demo accounts and documented — local use only.
- Staff accounts are meant for the web operations dashboard; the mobile app is customer-only (staff would see empty screens).
- Running `npx playwright test` rebuilds `apps/web/.next` with the e2e API URL baked into the rewrites; run `npm run build`
  again before `npm start` for a normal production build.

See [security.md](security.md) for the production-readiness gaps.
