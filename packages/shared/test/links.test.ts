import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveLink, safeNext, webUrl } from "../src/links.ts";

const ID = "0b8c3c1e-5a1f-4c1e-9a43-4f2b1b1f9d10";

test("resolves every supported route from path, https and app-scheme forms", () => {
  for (const p of ["/dashboard", "/health", `/health/reports/${ID}`, "/health/biomarkers/ldl", "/care-plan",
    "/appointments", `/appointments/${ID}`, "/profile", "/notifications", "/onboarding", "/support", "/reports"]) {
    assert.equal(resolveLink(p)?.path, p, p);
    assert.equal(resolveLink(`https://aurel.example${p}`)?.path, p, `https ${p}`);
    assert.equal(resolveLink(`aurel://${p.slice(1)}`)?.path, p, `scheme ${p}`);
  }
  assert.deepEqual(resolveLink(`/appointments/${ID}?utm=x`)?.params, { id: ID });
  assert.equal(resolveLink(`aurel:///appointments/${ID}`)?.name, "appointment");
});

test("rejects foreign hosts, malformed ids and script urls", () => {
  for (const bad of ["https://evil.example/dashboard", "//evil.example/dashboard", "javascript:alert(1)",
    "/appointments/not-a-uuid", "/health/reports/../../admin", "/admin", "/health/biomarkers/LDL<script>",
    "\\\\evil", "", null, undefined, "x".repeat(600)]) {
    assert.equal(resolveLink(bad as string), null, String(bad));
  }
});

test("safeNext only ever returns an in-app path", () => {
  assert.equal(safeNext("/care-plan"), "/care-plan");
  assert.equal(safeNext("https://evil.example/care-plan"), "/dashboard");
  assert.equal(safeNext("//evil.example"), "/dashboard");
  assert.equal(safeNext(undefined, "/health"), "/health");
});

test("webUrl builds the https fallback for shared links", () => {
  assert.equal(webUrl(`/appointments/${ID}`), `https://aurel.example/appointments/${ID}`);
  assert.equal(webUrl("/nope"), "https://aurel.example/dashboard");
});

test("AUD-17: only https links on production hosts are trusted", () => {
  for (const bad of ["http://localhost:3000/dashboard", "https://localhost:3000/dashboard", "http://aurel.example/dashboard"]) {
    assert.equal(resolveLink(bad), null, bad);
  }
  assert.equal(resolveLink("https://aurel.example/dashboard")?.path, "/dashboard");
});
