import { defineConfig, devices } from "@playwright/test";

// E2E runs against its own API (port 8011, separate SQLite file, rate limits off so tests can register
// many users) and a production build of the web app (port 3011). Your dev servers on 3000/8000 are untouched.
const API_PORT = 8011;
const WEB_PORT = 3011;
const channel = process.env.PW_CHANNEL === undefined ? "msedge" : process.env.PW_CHANNEL || undefined;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: "retain-on-failure" },
  projects: [
    // Uses the installed Microsoft Edge (Chromium) so no browser download is needed. Set PW_CHANNEL= to use bundled Chromium.
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel } },
    { name: "phone", use: { ...devices["Pixel 7"], channel }, testMatch: /responsive\.spec/ },
  ],
  webServer: [
    {
      cwd: "../../services/api",
      command: `.venv\\Scripts\\python -m alembic upgrade head && .venv\\Scripts\\python -m uvicorn app.main:app --no-proxy-headers --port ${API_PORT}`,
      env: { DATABASE_URL: "sqlite:///./aurel-e2e.db", RATE_LIMIT_ENABLED: "false", CORS_ORIGINS: `http://localhost:${WEB_PORT}` },
      url: `http://127.0.0.1:${API_PORT}/healthz`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // API_URL is read by next.config rewrites at build time.
      command: `npx next build && npx next start -p ${WEB_PORT}`,
      env: { API_URL: `http://127.0.0.1:${API_PORT}` },
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 240_000,
    },
  ],
});
