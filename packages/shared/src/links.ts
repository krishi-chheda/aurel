// Smart links: one route table for web URLs, universal/app links and the custom scheme.
// Web and mobile use the same paths, so a link resolves to the same screen on either platform.

export const APP_SCHEME = "aurel";
/** Hosts whose https links we treat as ours. Add the production domain when it exists (docs/deep-linking.md). */
// Production hosts only (AUD-17): dev builds link with in-app paths, so localhost never needs to be trusted here.
export const LINK_HOSTS = ["aurel.example"];

const ID = "[0-9a-fA-F-]{36}";
const CODE = "[a-z0-9_]{1,40}";

export const ROUTES: { name: string; pattern: string; auth: boolean }[] = [
  { name: "dashboard", pattern: "/dashboard", auth: true },
  { name: "health", pattern: "/health", auth: true },
  { name: "reports", pattern: "/reports", auth: true },
  { name: "report", pattern: `/health/reports/:id(${ID})`, auth: true },
  { name: "biomarker", pattern: `/health/biomarkers/:code(${CODE})`, auth: true },
  { name: "care-plan", pattern: "/care-plan", auth: true },
  { name: "appointments", pattern: "/appointments", auth: true },
  { name: "appointment", pattern: `/appointments/:id(${ID})`, auth: true },
  { name: "profile", pattern: "/profile", auth: true },
  { name: "notifications", pattern: "/notifications", auth: true },
  { name: "onboarding", pattern: "/onboarding", auth: true },
  { name: "support", pattern: "/support", auth: true },
];

const compiled = ROUTES.map((r) => {
  const keys: string[] = [];
  const src = r.pattern.replace(/:(\w+)\(([^)]+)\)/g, (_, k: string, re: string) => {
    keys.push(k);
    return `(${re})`;
  });
  return { ...r, keys, re: new RegExp(`^${src}/?$`) };
});

export interface ResolvedLink { name: string; path: string; params: Record<string, string>; auth: boolean }

/**
 * Accepts "/appointments/<id>", "https://aurel.example/appointments/<id>" or "aurel://appointments/<id>".
 * Returns null for anything that is not one of our routes (foreign hosts, malformed ids, javascript: etc).
 */
export function resolveLink(input: string | null | undefined): ResolvedLink | null {
  if (!input || typeof input !== "string" || input.length > 512) return null;
  let path: string;
  if (input.startsWith("/")) {
    if (input.startsWith("//") || input.includes("\\")) return null;
    path = input;
  } else {
    let url: URL;
    try { url = new URL(input); } catch { return null; }
    if (url.protocol === `${APP_SCHEME}:`) {
      // aurel://appointments/x parses host="appointments"; aurel:///appointments/x has an empty host.
      path = `/${url.host}${url.pathname}`.replace(/^\/+/, "/");
    } else if (url.protocol === "https:" && LINK_HOSTS.includes(url.host)) {
      path = url.pathname;
    } else return null;
  }
  path = path.split(/[?#]/)[0];
  for (const r of compiled) {
    const m = r.re.exec(path);
    if (m) {
      const params = Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]]));
      return { name: r.name, path, params, auth: r.auth };
    }
  }
  return null;
}

/** Safe post-login redirect target: only known in-app routes, never an external URL. */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  return resolveLink(next)?.path ?? fallback;
}

/** Shareable https link with the web as the fallback when the app is not installed. */
export function webUrl(path: string, base = "https://aurel.example"): string {
  return base.replace(/\/$/, "") + (resolveLink(path)?.path ?? "/dashboard");
}
