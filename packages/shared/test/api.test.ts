import assert from "node:assert/strict";
import { test } from "node:test";

import { ApiError, createApi, syncStateFor, type TokenStore } from "../src/api.ts";

function memoryStore(access: string | null, refresh: string | null): TokenStore & { saved: unknown[] } {
  const s = {
    access, refresh, saved: [] as unknown[],
    getAccess: () => s.access,
    getRefresh: async () => s.refresh,
    save: async (t: { access_token: string; refresh_token: string | null } | null) => {
      s.saved.push(t);
      s.access = t?.access_token ?? null;
      s.refresh = t?.refresh_token ?? null;
    },
  };
  return s as never;
}

const json = (status: number, body: unknown) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("refreshes once on 401, retries the request, and sends platform header", async () => {
  const calls: { url: string; auth?: string; platform?: string }[] = [];
  const store = memoryStore("old", "rt-1");
  const api = createApi({
    baseUrl: "http://api", platform: "ios", store,
    fetchImpl: (async (url: string, init: RequestInit) => {
      const h = init.headers as Record<string, string>;
      calls.push({ url, auth: h.Authorization, platform: h["X-Client-Platform"] });
      if (url.endsWith("/auth/refresh")) return json(200, { access_token: "new", refresh_token: "rt-2", expires_in: 900, user: {} });
      return h.Authorization === "Bearer new" ? json(200, { ok: 1 }) : json(401, { error: { code: "session_expired", message: "x" } });
    }) as typeof fetch,
  });
  // Two concurrent requests must share a single refresh (rotation would otherwise kill the session).
  const [a, b] = await Promise.all([api.request("GET", "/me"), api.request("GET", "/dashboard")]);
  assert.deepEqual(a, { ok: 1 });
  assert.deepEqual(b, { ok: 1 });
  assert.equal(calls.filter((c) => c.url.endsWith("/auth/refresh")).length, 1);
  assert.ok(calls.every((c) => c.platform === "ios"));
  assert.equal(store.refresh, "rt-2");
});

test("unrecoverable session clears tokens and notifies once", async () => {
  let expired = 0;
  const store = memoryStore("old", "rt-1");
  const api = createApi({
    baseUrl: "", platform: "android", store, onSessionExpired: () => expired++,
    fetchImpl: (async () => json(401, { error: { code: "session_expired", message: "Your session has expired." } })) as typeof fetch,
  });
  await assert.rejects(api.me(), (e: ApiError) => e.status === 401 && syncStateFor(e) === "session_expired");
  assert.equal(store.access, null);
  assert.equal(expired, 1);
});

test("network failure maps to offline and keeps tokens", async () => {
  const store = memoryStore("tok", "rt");
  const api = createApi({ baseUrl: "", platform: "web", store,
    fetchImpl: (async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch });
  await assert.rejects(api.dashboard(), (e: ApiError) => e.code === "network" && syncStateFor(e) === "offline");
  assert.equal(store.access, "tok");
});

test("error envelope is surfaced with code, fields and conflict payload", async () => {
  const api = createApi({ baseUrl: "", platform: "web", store: memoryStore("t", null),
    fetchImpl: (async () => json(409, { error: { code: "version_conflict", message: "Changed elsewhere", current: { version: 3 } } })) as typeof fetch });
  await assert.rejects(api.updateProfile({ version: 1, phone: "1" }), (e: ApiError) =>
    e.code === "version_conflict" && syncStateFor(e) === "conflict" && (e.body.current as { version: number }).version === 3);
});

test("AUD-12: refresh distinguishes offline from signed out", async () => {
  let expired = 0;
  const store = memoryStore("old", "rt");
  const offline = createApi({ baseUrl: "", platform: "ios", store, onSessionExpired: () => expired++,
    fetchImpl: (async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch });
  assert.equal(await offline.refresh(), "unavailable");
  assert.equal(store.refresh, "rt"); // tokens kept

  const down = createApi({ baseUrl: "", platform: "web", store: memoryStore(null, null),
    fetchImpl: (async () => json(503, { error: { code: "server_error", message: "x" } })) as typeof fetch });
  assert.equal(await down.refresh(), "unavailable");

  const revoked = memoryStore("old", "rt");
  const signedOut = createApi({ baseUrl: "", platform: "android", store: revoked,
    fetchImpl: (async () => json(401, { error: { code: "session_expired", message: "x" } })) as typeof fetch });
  assert.equal(await signedOut.refresh(), "signed_out");
  assert.equal(revoked.refresh, null);
  assert.equal(expired, 0);
});

test("AUD-12: a 401 whose refresh can't reach the server is reported as offline, not session expired", async () => {
  let expired = 0, n = 0;
  const store = memoryStore("stale", "rt");
  const api = createApi({ baseUrl: "", platform: "ios", store, onSessionExpired: () => expired++,
    fetchImpl: (async () => { if (n++ === 0) return json(401, { error: { code: "session_expired", message: "x" } }); throw new TypeError("offline"); }) as typeof fetch });
  await assert.rejects(api.me(), (e: ApiError) => e.code === "network" && syncStateFor(e) === "offline");
  assert.equal(expired, 0);
  assert.equal(store.refresh, "rt");
});
