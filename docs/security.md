# Security and privacy

This is a prototype holding synthetic data. The controls below are real and tested, but **they are not a
substitute for the review a healthcare service requires.** Nothing here claims compliance with the Privacy Act
1988 / APPs, My Health Records Act, HIPAA, GDPR, ISO 27001 or any other framework.

## Controls in place

| Area | Control | Tested by |
|---|---|---|
| Passwords | bcrypt; min 10 chars with a letter and a number (client and server) | `test_register_validation_and_duplicates` |
| Login | generic error for wrong password vs unknown email; dummy hash keeps timing similar; per-IP and per-email rate limit | `test_login_errors_are_generic`, `test_rate_limit_on_login` |
| Access tokens | HS256 JWT, 15 min, carries session id; every request re-checks the session row and user status, so logout/reset/deactivation apply immediately | `test_logout_invalidates_access_token_immediately`, `test_forged_token_rejected` |
| Refresh tokens | opaque random, stored hashed; rotated on every use; replay of a rotated token (after a 20 s concurrency grace) revokes all sessions | `test_refresh_rotates_and_detects_reuse`, `test_concurrent_refresh_within_grace_is_not_theft` |
| Web token storage | refresh token only in an httpOnly, `SameSite=Strict`, path-scoped cookie (`Secure` in production); access token in memory | e2e `register, sign out, sign in…` |
| Mobile token storage | `expo-secure-store` with `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (Keychain / Keystore) | code review only — no device test |
| Password reset | single-use hashed token, 30 min expiry, same response whether or not the account exists, all sessions revoked after reset | `test_password_reset_flow` |
| Authorisation | `current_user` on every non-auth route; role checks server-side (`require_role`); hiding UI is never the control | `test_protected_routes_require_auth` (sweeps every OpenAPI path), `test_customers_cannot_reach_admin` |
| IDOR | ownership is part of every query; foreign ids return 404 | `test_cross_user_reads_and_writes_are_rejected`, `test_lists_are_scoped_to_owner` |
| Least privilege | coordinators see workflow state but not contact details; only admins see the audit log; no role sees measurements or report contents in the operations view | `test_role_scoped_admin_views` |
| Input validation | Pydantic on every body; enums for goals/diet/etc.; names reject `<>{}`; dates validated; length limits | validation tests |
| Error hygiene | one error envelope; validation errors list field names but never echo submitted values; unhandled errors are logged server-side with a generic message to the client | `test_register_validation_and_duplicates` |
| XSS | React escaping everywhere; no `dangerouslySetInnerHTML` except the static token CSS; links from data pass through `resolveLink` before navigation | e2e deep-link test |
| Open redirect | `safeNext()` accepts only known in-app routes | `links.test.ts`, e2e |
| Headers | API: `Cache-Control: no-store`, `nosniff`. Web: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` | — |
| Secrets | none in client bundles; web API origin is server-only; `ENV=production` refuses the default JWT secret | — |
| Audit | login, failed login, refresh-reuse, logout, profile update (field names only), onboarding steps, task changes, appointment changes, password reset, deactivation, admin views | covered indirectly |
| Notifications | lock-screen text is generic and stored separately from the in-app body | — |
| Analytics / AI | none. The assistant never sees records; nothing is sent to third parties | — |
| Deactivation | `DELETE /me` deactivates and revokes every session | `test_deactivation` |

## Must be addressed before any production use

1. **Independent security review and penetration test**, plus a privacy impact assessment.
2. **Hosting & data residency**: managed PostgreSQL with encryption at rest, backups, PITR, TLS everywhere, HSTS; health
   data residency requirements (e.g. Australian hosting).
3. **Identity**: consider a managed identity provider; add MFA, email verification, account lockout policy, breached-password
   checks, session/device management UI.
4. **Rate limiting** is in-process (per instance) — move the counters to a shared store (e.g. Redis) or the gateway
   before running more than one API instance. The client address used for per-IP limits is now trusted-proxy aware
   (audit AUD-09, fixed): the Next.js proxy strips browser-supplied `X-Forwarded-For`; the API believes the header only
   from addresses in `TRUSTED_PROXIES` (default: none) and takes the right-most untrusted hop; uvicorn runs with
   `--no-proxy-headers` so it doesn't apply its own 127.0.0.1 trust. **Production topology:** an edge proxy/load balancer
   that *overwrites* `X-Forwarded-For` with the real client address → Next.js with `TRUST_EDGE_XFF=true` → API with
   `TRUSTED_PROXIES` listing the Next.js server and the edge. Without an edge, all web traffic shares the Next.js
   server's address for per-IP limits (coarse but unspoofable); per-email login limits are unaffected.
5. **CSRF**: the only cookie-authenticated endpoints are `/auth/refresh` and `/auth/logout`, protected by `SameSite=Strict`.
   Add an explicit CSRF token or Origin check if cookie auth is extended.
6. **Content Security Policy** for the web app (nonce-based, since Next.js injects inline scripts).
7. **Data retention & deletion**: deactivation does not yet purge data. Define retention periods, a deletion job,
   export (access requests) and audit-log retention/immutability (append-only store).
8. **Field-level encryption** for especially sensitive fields (history notes, DOB) and key management.
9. **Clinical governance**: any real clinical content, reference ranges or care plans need clinician authorship and review.
10. **Mobile hardening**: certificate pinning decision, jailbreak/root policy, screenshot protection on sensitive screens,
    biometric re-auth option (`requireAuthentication` in SecureStore).
11. **Registration email enumeration**: `/auth/register` currently reveals that an email exists (409). Switch to a
    "check your email" flow.
12. **Dependency & supply-chain scanning** (pip-audit, npm audit, Dependabot), secret scanning in CI.
13. **Logging**: centralised, access-controlled logs with PHI scrubbing verified; alerting on refresh-reuse and admin access.
