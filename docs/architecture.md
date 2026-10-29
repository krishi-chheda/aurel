# Architecture

## Shape

```
 ┌──────────────┐  same-origin /api/*  ┌──────────────────┐
 │ Next.js web  │ ───── rewrite ─────▶ │                  │
 │ (browser)    │  httpOnly refresh    │                  │      ┌────────────┐
 └──────────────┘  cookie + Bearer     │  FastAPI  (one   │ ───▶ │ PostgreSQL │
                                       │  REST contract)  │      │ / SQLite   │
 ┌──────────────┐  HTTPS + Bearer      │                  │      └────────────┘
 │ Expo app     │ ───────────────────▶ │                  │
 │ iOS/Android  │  refresh token in    └──────────────────┘
 └──────────────┘  SecureStore
        ▲                    ▲
        └── packages/shared ─┘  API client · contracts · tokens · deep-link table · copy
```

- **One backend, one contract.** Both clients call the same endpoints through the same client
  (`packages/shared/src/api.ts`). The only per-platform difference is the injected `TokenStore`.
- **Server is the source of truth.** Clients keep no durable copy of health data. Local state is limited to the access
  token in memory, the refresh token (httpOnly cookie on web, SecureStore on mobile), and unsaved form drafts.
- **Business rules live once, in the API** (`services/api/app/rules.py`): onboarding step order, "never move
  backwards", reference-range status, when a trend can be computed, journey stage, escalation flags.
- **The shared package has zero runtime dependencies**, so Next.js (Turbopack root = monorepo) and Metro
  (`watchFolders` + `extraNodeModules`) compile it directly from source without npm-workspace hoisting, which would
  otherwise risk two React versions colliding between Next and React Native.

## Backend modules (`services/api/app`)

| File | Responsibility |
|---|---|
| `config.py` | settings from env / `.env` |
| `db.py` | engine, session, `UTCDateTime` (always tz-aware UTC on both SQLite and PostgreSQL) |
| `models.py` | all tables, constraints and indexes |
| `schemas.py` | Pydantic request/response models (DB models are never returned directly) |
| `security.py` | bcrypt hashing, JWT access tokens, `current_user`, `require_role`, audit helper, rate limiter |
| `rules.py` | deterministic domain rules (see above) |
| `demo.py` | synthetic data generator + `notify()` notification boundary |
| `assistant.py` | AI-assistant integration boundary (rule-based in the prototype) |
| `routers/*` | one router per domain |
| `seed.py` | demo accounts |

## Data model

| Table | Key points |
|---|---|
| `users` | uuid PK, unique email, `role` CHECK (customer/coordinator/admin), soft deactivation |
| `profiles` | 1:1 with user. **Single source of truth for onboarding answers too** (no duplicated "responses" table). `version` for optimistic concurrency, `updated_from` platform |
| `onboarding_sessions` | 1:1 with user: `current_step`, `completed_steps`, `status` CHECK, `version`, `last_platform` |
| `refresh_sessions` | hashed refresh tokens, per platform; `revoked_at`, `replaced_by` (rotation + reuse detection) |
| `password_resets` | hashed single-use tokens with expiry |
| `health_reports`, `measurements` | synthetic, `is_synthetic` flag, `source` label; index `(user_id, biomarker_code, measured_at)`; `value` nullable = unavailable result |
| `care_plans` | fictional clinician approval, predefined goals |
| `tasks` | the reusable cross-device task: kind CHECK, status CHECK, optional link to plan/appointment, `completed_from` |
| `appointments` | `is_demo`, status CHECK, `UNIQUE(user_id, client_request_id)` for idempotent booking |
| `notifications` | in-app body + separate generic `push_text` for lock screens |
| `audit_events` | actor, action, target, platform, metadata — never health values |

Every user-owned table has `user_id` with `ON DELETE CASCADE`, and every query filters by the authenticated user's id
inside the query itself (not after fetching), so another user's id behaves exactly like a missing record (404).

## Cross-device continuity

**Identity.** Same account on every client. Web: access token in memory + refresh token in an httpOnly,
`SameSite=Strict` cookie scoped to `/api/auth`. Mobile: refresh token in iOS Keychain / Android Keystore via
`expo-secure-store` (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`). Refresh tokens rotate on every use; replaying a rotated token
outside a short grace window revokes every session for that user.

**Freshness (honest description).** There is **no real-time push**. Each client refetches when a screen gains focus,
when the tab/app returns to the foreground, when the network comes back, on pull-to-refresh (mobile) and once a minute
while a web tab is visible. The UI shows "Up to date · time" so users can see how fresh data is.

**Writes and conflicts.**

| Resource | Strategy |
|---|---|
| Profile | `PATCH` carries `version`. Stale version → `409 version_conflict` with the current server copy; UI shows both and offers "Use latest" / "Keep my changes". A retry whose values already match the server is treated as success. |
| Onboarding | Same versioning per save. Saving an earlier step never moves progress backwards. A stale device is told which device moved ahead and keeps its unsaved answers. |
| Tasks | Setting a task to the status it already has is a no-op, so double taps and retries are safe. Last write wins between "open" and "done", which is acceptable for a checkbox. |
| Appointments | Booking carries a client-generated `client_request_id`; a retry after a lost response returns the original booking. Reschedule uses `version`. |

**Sync states** (`SyncState` in the shared package): `saving`, `saved`, `syncing`, `offline`, `failed`,
`session_expired`, `conflict`. Each has a visible label and a recovery action (retry, sign in, choose a version).
Failed saves never clear user input: optimistic toggles revert with an explanation; onboarding drafts survive a
failed save, an expired session and (web) a page reload via `sessionStorage`.

## Smart links / deep linking

One route table in `packages/shared/src/links.ts`, used by both clients:

`/dashboard` `/health` `/health/reports/:id` `/health/biomarkers/:code` `/reports` `/care-plan` `/appointments`
`/appointments/:id` `/profile` `/notifications` `/onboarding` `/support`

- **Web:** the paths *are* the web routes. Signed-out visitors go to `/login?next=<path>`; `safeNext()` only accepts
  known in-app routes, so `next=https://evil.example` falls back to `/dashboard`. On phone browsers an
  "Open this screen in the Aurel app" banner links to `aurel://<path>`.
- **Mobile:** Expo Router files mirror the same paths. Every incoming URL (`aurel://…`, `https://aurel.example/…`)
  passes through `src/app/+native-intent.tsx`, which accepts only routes in the shared table (ids must be UUIDs) and
  remembers the target so a signed-out user lands there after signing in.
- **Universal / App Links** are configured (`associatedDomains`, Android `intentFilters` with `autoVerify`, and
  `apple-app-site-association` / `assetlinks.json` templates in `apps/web/public/.well-known/`) but need a real domain,
  Apple Team ID and Android signing fingerprint. **Not verified on devices** — see `docs/status.md`.

## Design system

Tokens live in `packages/shared/src/tokens.ts` and are consumed directly:

- **Web:** `app/layout.tsx` turns `colors` / `darkColors` into `--c-*` CSS variables; Tailwind's `@theme` maps them to
  utilities (`bg-surface`, `text-ink-muted`, …). Typography: Fraunces (headings) + Inter (body) via `next/font`.
- **Mobile:** `usePalette()` returns the same palette for the current colour scheme; system serif stands in for
  Fraunces so the app ships no font files.

| Token group | Values |
|---|---|
| Colour | "Clinical Clear": cool white canvas `#F5F7F9`, slate ink `#1F272B`, cerulean primary `#0B6A99`, deep-teal accent `#0E7480` used sparingly (chosen 28 Oct 2026 over the earlier warm paper/evergreen/clay set, which was close to Function Health's); semantic success/warning/danger/info each with a soft background; full dark-mode set |
| Contrast (computed) | ink/canvas 14.6:1 · muted/canvas 6.0:1 · subtle/canvas 4.9:1 · white/primary 8.0:1 · white/accent 5.2:1 · each status colour on its soft background 5.2–6.7:1 · dark mode: ink 15.6:1, subtle 6.2:1. All text pairs ≥ 4.5:1 (AA). |
| Spacing | 4-pt scale (4…80) |
| Radius | 6 / 10 / 14 — deliberately modest |
| Type | display 44, h1 32, h2 24, h3 19, body 16 (never below 15 on mobile), small 14, label 13 |
| Motion | 120/200/320 ms, one easing curve; a single fade-in on page entry; `prefers-reduced-motion` disables it |
| Touch | 44 pt minimum targets on both platforms |

### Motion (web, GSAP 3.15 + @gsap/react)

Personality: **Premium** — calm, no overshoot on content, one signature ease (`power3.out`), durations 0.2 / 0.6 / 1.1 s
(`src/lib/motion.ts`). Every animation lives in `useGSAP` (client-only, auto-cleanup) inside `gsap.matchMedia()`, so
`prefers-reduced-motion: reduce` gets the finished state with no movement.

| Piece | File | What it does |
|---|---|---|
| **Continuity Thread** (hero) | `components/motion/hero-continuity.tsx` | A ~9 s loop that acts out the product: onboarding fills on a laptop and saves → a pulse travels a drawn thread (DrawSVG + MotionPath) → the phone picks up at the same step and finishes → "all set" returns to the laptop. Ambient aura drift and pointer counter-parallax; pauses when off-screen. Decorative (`aria-hidden`). |
| Headline reveal | `HeroIntro` | Masked lines rise, the accent underline draws, copy and CTAs follow. Pre-paint hiding is gated by a tiny inline script with a 3 s fail-safe so content never stays hidden if JS fails. |
| Scroll-scrubbed journey | `ScrollSteps` | A thread runs across each How-it-works card in turn and the step lights up as you scroll. |
| Section reveals | `RevealGroup` | `ScrollTrigger.batch` rise-ins, once. |
| Magnetic CTAs | `Magnetic` | Fine pointers only; springs home on leave. |
| Count-ups | `CountUp` | Dashboard, care-plan and admin numbers; count on from the previous value; the real value is in the DOM from SSR. |
| Page entrance | `Enter` | Every app page: blocks cascade in when data arrives, grid cards stagger, below-the-fold blocks wait for scroll. |
| Nav glide | `useGlide` | Sidebar highlight and phone tab-bar underline glide to the active page. |
| Feedback | `shake`, `pop` | Error notices shake once (confirmations don't); task checks pop and the row flashes the success tint; failed saves shake the row; unread badge pops. |
| Progress & charts | `ProgressBar`, `LineChart`, admin `Bars` | Bars grow from zero then glide between values; the biomarker chart's band settles, line traces, points land in order (replays on date-range change). |
| Flows | `StepSlide`, `DrawnCheck`, `Appear` | Onboarding steps slide with direction (forward from the right, back from the left); completion draws a check; booking panel and chat bubbles arrive from their side. |
| Health map | `components/knowledge-graph.tsx` | Records as a 3D sphere on a 2D canvas (ported from ClinicalBrief): expands from "you", idles in slow rotation, drag/zoom/hover/select, guided tour. Data from `GET /health/graph`. |
| Goal journey | `GoalJourney` | A figure walks a path to "Healthy" as plan actions complete: posture straightens, colour shifts grey→green, a glow appears and the sun rises; walks from its previous position on each change; celebrates at 100%. |
| Marketing & auth | `Section`, `PageIntro`, `DetailsReveal`, `AuthStage` | Section headings and cards rise on scroll; page intros use the masked headline; FAQ answers ease open; the sign-in logo draws itself. |

Scroll reveals animate `opacity`, not `visibility`, so content that hasn't been revealed yet stays in the accessibility
tree and find-in-page. Colour tweens resolve token values first (`token()`), since GSAP can't interpolate `var()` strings.

Navigation: desktop sidebar (Home, My Health, My Plan, Appointments, Reports, Support, Profile); phone web and native
use a 5-item bottom tab bar (Home, Health, Plan, Appointments, Profile) with notifications and support in the header.

## Accessibility (WCAG 2.2 AA target)

Semantic landmarks and headings, skip link, visible focus rings, labelled form controls with `aria-invalid` and
described-by error text, live regions for sync status, progress bars with values, chart `aria-label` summaries plus a
data table, reduced-motion support, scalable text (web `rem`/`px` base 16; mobile `maxFontSizeMultiplier` 1.8).
No automated accessibility audit (axe, VoiceOver/TalkBack pass) has been run yet.
