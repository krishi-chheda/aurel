# Aurel — unified preventive-health platform (prototype)

A responsive website, an iOS/Android app and one FastAPI backend, built around a single principle:
**one account, one health profile, one continuous experience.** Start onboarding on the web, finish it on
your phone, tick off a care-plan task on either and see it on the other.

> **Aurel is fictional.** Every clinician, provider, appointment, report and measurement is synthetic.
> It is not a medical service, not clinically validated, not production-ready and makes no claim of
> regulatory compliance. Inspired by the preventive-health category (e.g. Everlab) but shares no code,
> branding, assets or proprietary functionality with any real company.

## Repository layout

```
apps/
  web/          Next.js 16 (App Router, React 19, Tailwind 4) — public site, customer app, operations dashboard
  mobile/       Expo SDK 58 + Expo Router (React Native 0.88) — iOS and Android app
services/
  api/          FastAPI + SQLAlchemy 2 + Alembic — the only source of truth for both clients
packages/
  shared/       Zero-dependency TypeScript used by BOTH clients: API client, contracts, design tokens,
                deep-link table, UI copy
docs/           architecture, security, integrations, feature status
```

Business rules (onboarding order, conflict detection, trend calculation, workflow escalation) live in the API.
The clients render what the API returns; the shared package only holds things that are genuinely client-side
(how to call the API, how to store tokens, which routes exist, colours and copy).

## Prerequisites

| Tool | Version used | Notes |
|---|---|---|
| Python | 3.12 | `py -3.12` on Windows (the default `python` here is 3.8, too old) |
| Node.js / npm | 24 / 11 | |
| PostgreSQL | optional | SQLite is the default for local dev; see [PostgreSQL](#postgresql) |
| Expo Go or a dev build | — | to run the mobile app on a device/simulator |

## Setup

```bash
# 1. API
cd services/api
py -3.12 -m venv .venv
.venv/Scripts/pip install -r requirements.txt      # macOS/Linux: .venv/bin/pip
cp .env.example .env                               # optional; every value has a dev default
.venv/Scripts/alembic upgrade head                 # create the schema
.venv/Scripts/python -m app.seed                   # synthetic demo accounts (refuses to run when ENV=production)
.venv/Scripts/python -m uvicorn app.main:app --no-proxy-headers --port 8000 --reload   # client IP trust comes from TRUSTED_PROXIES
#   OpenAPI docs: http://localhost:8000/docs  (disabled when ENV=production)

# 2. Web (new terminal)
cd apps/web
npm install
npm run dev                                        # http://localhost:3000

# 3. Mobile (new terminal)
cd apps/mobile
npm install
npx expo start                                     # press i (iOS simulator, macOS only) or a (Android emulator), or scan with Expo Go
```

For a physical phone, start the API with `--host 0.0.0.0` and set `EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:8000`
(see `apps/mobile/.env.example`). Without it the app uses the Expo dev server's host on port 8000.

### Demo accounts (synthetic, local only)

Created by `python -m app.seed`; all use the password defined as `DEMO_PASSWORD` in `services/api/app/seed.py`.

| Email | Role | State |
|---|---|---|
| `demo@aurel.example` | customer | onboarding not started — try finishing it across devices |
| `demo2@aurel.example` | customer | onboarding complete |
| `coordinator@aurel.example` | coordinator | operations dashboard, no contact details |
| `admin@aurel.example` | admin | operations dashboard + audit log |

Plus 10 fictional customers in different journey states for the operations dashboard. New sign-ups get their own
synthetic reports, care plan, tasks and appointments (`DEMO_DATA_ON_SIGNUP=true`).

Password reset emails are not sent: in development the reset link is printed in the API console (`DEV EMAIL OUTBOX`).

## Environment variables

| Where | Variable | Default | Purpose |
|---|---|---|---|
| API | `ENV` | `development` | `production` refuses the default JWT secret, hides `/docs`, blocks seeding, sets `Secure` cookies |
| API | `DATABASE_URL` | `sqlite:///services/api/aurel.db` | e.g. `postgresql+psycopg://user:pass@host:5432/aurel` |
| API | `JWT_SECRET` | dev placeholder | **must** be set in production |
| API | `ACCESS_TOKEN_MINUTES` / `REFRESH_TOKEN_DAYS` | 15 / 30 | token lifetimes |
| API | `REFRESH_REUSE_GRACE_SECONDS` | 20 | concurrent refreshes (two tabs) inside this window aren't treated as token theft |
| API | `RESET_TOKEN_MINUTES` | 30 | password-reset link lifetime |
| API | `REFRESH_COOKIE_PATH` | `/api/auth` | browser path of the web proxy's auth routes |
| API | `CORS_ORIGINS` | `http://localhost:3000,http://localhost:8081` | the web app uses a same-origin proxy; CORS matters only for Expo web |
| API | `WEB_BASE_URL` | `http://localhost:3000` | used in reset links |
| API | `DEMO_DATA_ON_SIGNUP` | `true` | seed synthetic data for new accounts |
| API | `RATE_LIMIT_ENABLED` | `true` | in-process limits on login/register/reset/assistant |
| API | `TRUSTED_PROXIES` | *(empty)* | comma-separated IPs/CIDRs allowed to report the client IP via `X-Forwarded-For`; empty = trust no one. Run uvicorn with `--no-proxy-headers` |
| Web | `TRUST_EDGE_XFF` | `false` | `true` only behind an edge proxy that overwrites `X-Forwarded-For`; otherwise `src/proxy.ts` strips it |
| Web | `API_URL` | `http://127.0.0.1:8000` | **server-only**; read by `next.config.ts` rewrites at build time |
| Mobile | `EXPO_PUBLIC_API_URL` | Expo host:8000 | public by design (a URL, not a secret) |

No secret is ever shipped to a browser or app bundle.

## Database & migrations

```bash
cd services/api
.venv/Scripts/alembic upgrade head                              # apply
.venv/Scripts/alembic revision --autogenerate -m "describe change"  # after editing app/models.py
.venv/Scripts/alembic downgrade -1                              # roll back one
```

Migrations are dialect-neutral (custom types render as plain `sa.DateTime(timezone=True)`; SQLite uses batch mode).

### PostgreSQL

Set `DATABASE_URL=postgresql+psycopg://…` and run `alembic upgrade head`. The driver (`psycopg[binary]`) is installed
and `alembic upgrade head --sql` against a PostgreSQL URL renders valid DDL, **but no live PostgreSQL server was
available while building this, so the app has only been run and tested on SQLite.**

## Tests

```bash
cd services/api && .venv/Scripts/python -m pytest -q      # 75 tests: auth, authorisation/IDOR, validation, sync, workflow rules, migrations
cd packages/shared && npm test                             # 11 tests: API client (refresh, offline, conflict), deep-link validation
cd apps/web && npx playwright test                         # e2e: real UI + a second "mobile" client against an isolated API, plus an axe accessibility scan
cd apps/web && npx tsc --noEmit && npm run build           # web type-check + production build
cd apps/web && npm run lint                                # ESLint (eslint-config-next)
cd apps/mobile && npm run lint                             # ESLint (eslint-config-expo)
cd apps/mobile && npx tsc --noEmit && npx expo export --platform android --platform ios   # mobile type-check + native bundles
```

The Playwright suite starts its **own** API (port 8011, `aurel-e2e.db`, rate limits off) and a production web build
(port 3011), so it never touches your dev data. It uses the installed Microsoft Edge (`PW_CHANNEL=chrome` for Chrome,
or `PW_CHANNEL=` plus `npx playwright install chromium` for the bundled browser).

## API

REST, grouped by domain, documented by OpenAPI at `/docs` and `/openapi.json`.
Every error uses one envelope: `{"error": {"code", "message", "fields?", "current?"}}`.

| Group | Endpoints |
|---|---|
| auth | `POST /auth/register` `/login` `/refresh` `/logout` `/logout-all` `/forgot-password` `/reset-password` |
| profile | `GET /me`, `PATCH /me/profile` (optimistic concurrency via `version`), `DELETE /me` (deactivate) |
| onboarding | `GET /onboarding`, `PUT /onboarding/steps/{step}`, `POST /onboarding/complete` |
| dashboard | `GET /dashboard` |
| health | `GET /health/biomarkers`, `GET /health/biomarkers/{code}?from&to`, `GET /health/graph` (records as a graph for the health map) |
| reports | `GET /reports`, `GET /reports/{id}` |
| care | `GET /care-plan`, `GET /tasks?status=`, `PATCH /tasks/{id}` |
| appointments | `GET /appointments`, `GET /appointments/slots?type=`, `GET /appointments/{id}`, `POST /appointments` (idempotent via `client_request_id`), `POST /appointments/{id}/cancel`, `POST /appointments/{id}/reschedule` |
| notifications | `GET /notifications?limit&offset`, `POST /notifications/{id}/read`, `POST /notifications/read-all` |
| assistant | `POST /assistant/ask` |
| admin | `GET /admin/overview`, `GET /admin/customers?stage&flagged`, `GET /admin/audit` (admin only) |

## More

- [docs/architecture.md](docs/architecture.md) — architecture, data model, sync model, deep linking, design system
- [docs/security.md](docs/security.md) — controls in place and what must happen before any production use
- [docs/integrations.md](docs/integrations.md) — external services and their integration boundaries
- [docs/status.md](docs/status.md) — honest status of every feature, known limitations
