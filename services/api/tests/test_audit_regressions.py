"""Regression tests for defects found in the independent audit (docs/CODE_REVIEW_REPORT.md, AUD-xx ids)."""

import pytest

from app.assistant import answer
from app.config import get_settings
from app.seed import DEMO_PASSWORD, make_user


@pytest.mark.parametrize("msg", ["I feel suicidal", "I'm having suicidal thoughts", "I want to kill myself",
                                 "I can’t breathe", "I think I took an overdose"])
def test_aud01_safety_filter_catches_word_variants(msg):
    assert answer(msg)["kind"] == "safety"


@pytest.mark.parametrize("msg", ["can you give me a diagnosis", "I need a prescription", "what treatment should I get",
                                 "what dosage is right"])
def test_aud01_clinical_filter_catches_word_variants(msg):
    assert answer(msg)["kind"] == "safety"


def test_aud02_profile_patch_rejects_null_for_required_fields(device):
    d = device("web")
    d.register("null@example.com")
    for field in ("first_name", "last_name", "health_goals", "notification_prefs"):
        v = d.get("/me").json()["profile"]["version"]
        r = d.patch("/me/profile", {"version": v, field: None})
        assert r.status_code == 422, field
    assert d.get("/me").status_code == 200
    # Optional fields can still be cleared.
    v = d.get("/me").json()["profile"]["version"]
    assert d.patch("/me/profile", {"version": v, "preferred_name": None}).status_code == 200


def test_aud03_series_rejects_naive_dates_with_422(device):
    d = device("web")
    d.register("dates@example.com")
    assert d.get("/health/biomarkers/ldl", params={"from": "2024-01-01T00:00:00"}).status_code == 422
    assert d.get("/health/biomarkers/ldl", params={"from": "2024-01-01T00:00:00Z"}).status_code == 200


def test_aud04_same_slot_cannot_be_booked_twice(device):
    d = device("ios")
    d.register("slot@example.com")
    s = d.get("/appointments/slots?type=gp_review").json()
    first = d.post("/appointments", {"type": "gp_review", "starts_at": s[0]["starts_at"], "client_request_id": "req-a0000001"})
    assert first.status_code == 201
    dup = d.post("/appointments", {"type": "blood_test", "starts_at": s[0]["starts_at"], "client_request_id": "req-a0000002"})
    assert dup.status_code == 422
    # Retrying the original request is still idempotent.
    again = d.post("/appointments", {"type": "gp_review", "starts_at": s[0]["starts_at"], "client_request_id": "req-a0000001"})
    assert again.status_code == 200 and again.json()["id"] == first.json()["id"]
    other = d.post("/appointments", {"type": "blood_test", "starts_at": s[1]["starts_at"], "client_request_id": "req-a0000003"}).json()
    assert d.post(f"/appointments/{other['id']}/reschedule",
                  {"starts_at": s[0]["starts_at"], "version": other["version"]}).status_code == 422


@pytest.mark.parametrize("revoke", ["/auth/logout-all", "/auth/logout"])
def test_aud05_rotated_token_cannot_revive_session_after_logout(device, revoke):
    phone = device("ios")
    phone.register("revive@example.com")
    old = phone.refresh_token
    assert phone.refresh().status_code == 200  # rotation: `old` is now inside the reuse grace window
    assert phone.post(revoke).status_code == 204
    phone.refresh_token, phone.access = old, None
    assert phone.refresh().status_code == 401


def test_aud05_rotated_token_cannot_revive_session_after_password_reset(device):
    from app.routers.auth import DEV_OUTBOX
    phone = device("android")
    phone.register("reset-revive@example.com")
    old = phone.refresh_token
    assert phone.refresh().status_code == 200
    phone.http.post("/auth/forgot-password", json={"email": "reset-revive@example.com"})
    assert phone.http.post("/auth/reset-password", json={"token": DEV_OUTBOX[-1]["token"],
                                                         "password": "BrandNewPass99"}).status_code == 204
    phone.refresh_token, phone.access = old, None
    assert phone.refresh().status_code == 401


@pytest.mark.parametrize("secret", ["change-me-to-a-long-random-string", "short", "dev-only-change-me-dev-only-change-me"])
def test_aud06_production_rejects_placeholder_or_short_secrets(monkeypatch, secret):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("JWT_SECRET", secret)
    get_settings.cache_clear()
    try:
        with pytest.raises(RuntimeError):
            get_settings()
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()


def test_aud06_production_accepts_strong_secret(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("JWT_SECRET", "k" * 48)
    get_settings.cache_clear()
    try:
        assert get_settings().is_production
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()


def test_aud07_admin_pagination_rejects_negative_values(device):
    from app.db import SessionLocal
    db = SessionLocal()
    make_user(db, "pager@example.com", "Pa", "Ger", "admin")
    db.commit()
    db.close()
    d = device("web")
    d.login("pager@example.com", DEMO_PASSWORD)
    assert d.get("/admin/customers?limit=-1").status_code == 422
    assert d.get("/admin/customers?offset=-1").status_code == 422
    assert d.get("/admin/audit?offset=-5").status_code == 422
    assert d.get("/admin/audit?limit=0").status_code == 422


# ---- AUD-10 / AUD-11: races are simulated deterministically by letting a "second request" write through its own
# database connection in the gap between the endpoint's checks and its commit (the audit() call sits in that gap).

def _race(monkeypatch, module, sql, **params):
    from sqlalchemy import text

    from app.db import engine
    real = module.audit
    fired = []

    def audit_then_competing_write(*a, **kw):
        if not fired:
            fired.append(1)
            with engine.begin() as conn:
                conn.execute(text(sql), params)
        return real(*a, **kw)
    monkeypatch.setattr(module, "audit", audit_then_competing_write)
    return fired


def test_aud10_profile_concurrent_edit_is_detected_atomically(device, monkeypatch):
    from app.routers import me
    d = device("web")
    d.register("race-profile@example.com")
    uid = d.get("/me").json()["user"]["id"]
    v = d.get("/me").json()["profile"]["version"]
    fired = _race(monkeypatch, me, "UPDATE profiles SET postcode='2000', version=version+1 WHERE user_id=:u", u=uid)
    r = d.patch("/me/profile", {"version": v, "postcode": "3000"})
    assert fired and r.status_code == 409
    assert r.json()["error"]["code"] == "version_conflict"
    assert r.json()["error"]["current"]["postcode"] == "2000"   # the other device's write survives
    assert d.get("/me").json()["profile"]["postcode"] == "2000"


def test_aud10_onboarding_concurrent_step_is_detected_atomically(device, monkeypatch):
    from app.routers import me
    d = device("ios")
    d.register("race-onb@example.com")
    uid = d.get("/me").json()["user"]["id"]
    v = d.get("/onboarding").json()["version"]
    fired = _race(monkeypatch, me, "UPDATE onboarding_sessions SET current_step='basic_profile', version=version+1 WHERE user_id=:u", u=uid)
    r = d.put("/onboarding/steps/welcome", {"version": v, "data": {}})
    assert fired and r.status_code == 409
    assert r.json()["error"]["current"]["current_step"] == "basic_profile"


def test_aud10_reschedule_concurrent_change_is_detected_atomically(device, monkeypatch):
    from app.routers import appointments
    d = device("web")
    d.register("race-appt@example.com")
    slots = d.get("/appointments/slots?type=gp_review").json()
    a = d.post("/appointments", {"type": "gp_review", "starts_at": slots[0]["starts_at"], "client_request_id": "race-appt-0001"}).json()
    fired = _race(monkeypatch, appointments, "UPDATE appointments SET status='cancelled', version=version+1 WHERE id=:i", i=a["id"])
    r = d.post(f"/appointments/{a['id']}/reschedule", {"starts_at": slots[1]["starts_at"], "version": a["version"]})
    assert fired and r.status_code == 409
    assert r.json()["error"]["current"]["status"] == "cancelled"


def test_aud10_versions_still_advance_by_one(device):
    d = device("web")
    d.register("race-versions@example.com")
    v = d.get("/me").json()["profile"]["version"]
    r = d.patch("/me/profile", {"version": v, "postcode": "3000"})
    assert r.json()["profile"]["version"] == v + 1
    o = d.get("/onboarding").json()
    assert d.put("/onboarding/steps/welcome", {"version": o["version"], "data": {}}).json()["version"] == o["version"] + 1


def test_aud11_simultaneous_duplicate_booking_returns_original(device, monkeypatch):
    """The 'existing' lookup misses, then a concurrent request with the same key commits first."""
    from sqlalchemy import text

    from app.db import engine
    from app.routers import appointments
    d = device("ios")
    d.register("race-book@example.com")
    uid = d.get("/me").json()["user"]["id"]
    slots = d.get("/appointments/slots?type=blood_test").json()
    real = appointments._check_slot

    def check_then_concurrent_insert(*a, **kw):
        real(*a, **kw)
        with engine.begin() as conn:
            conn.execute(text(
                "INSERT INTO appointments (id, user_id, type, title, practitioner, location, starts_at, duration_min, status, "
                "is_demo, prep_notes, client_request_id, version, created_at, updated_at) VALUES ('11111111-1111-4111-8111-111111111111', "
                ":u, 'blood_test', 'Blood collection', 'x', 'x', :s, 15, 'requested', 1, '[]', 'same-key-0001', 1, :s, :s)"),
                {"u": uid, "s": slots[0]["starts_at"].replace("Z", "+00:00")})
    monkeypatch.setattr(appointments, "_check_slot", check_then_concurrent_insert)
    r = d.post("/appointments", {"type": "blood_test", "starts_at": slots[0]["starts_at"], "client_request_id": "same-key-0001"})
    assert r.status_code == 200, r.text
    assert r.json()["id"] == "11111111-1111-4111-8111-111111111111"
    assert sum(x["status"] == "requested" for x in d.get("/appointments").json()["upcoming"]) == 1


def test_aud18_passwords_over_72_bytes_are_refused_not_truncated(device):
    from app.security import hash_password, verify_password
    d = device("web")
    assert d.register("mb@example.com", password="Aa1" + "é" * 40).status_code == 422   # 43 chars, 83 bytes
    stored = "Aa1" + "é" * 34 + "x"                                                      # 38 chars, 72 bytes
    assert len(stored.encode()) == 72
    assert d.register("ok72@example.com", password=stored).status_code == 201
    # Within the 72-character schema limit but over 72 bytes, and its first 72 bytes equal the stored password:
    # bcrypt alone would truncate and accept it.
    longer = stored + "é"
    assert len(longer) <= 72 and len(longer.encode()) > 72
    other = device("ios")
    assert other.login("ok72@example.com", longer).status_code == 401
    assert other.login("ok72@example.com", stored).status_code == 200
    assert not verify_password(longer, hash_password(stored))


# ---- AUD-09: the rate-limit key can't be chosen by the client --------------------------------------------------

def _req(peer: str, xff: str | None = None):
    from starlette.requests import Request
    headers = [(b"x-forwarded-for", xff.encode())] if xff is not None else []
    return Request({"type": "http", "client": (peer, 5000), "headers": headers, "method": "GET", "path": "/"})


@pytest.mark.parametrize("trusted, peer, xff, expected", [
    ("", "127.0.0.1", "203.0.113.9", "127.0.0.1"),                      # default: nobody trusted, header ignored
    ("", "198.51.100.7", "203.0.113.9", "198.51.100.7"),                # direct client spoofing the header
    ("127.0.0.1", "198.51.100.7", "203.0.113.9", "198.51.100.7"),       # untrusted peer can't use the header
    ("127.0.0.1", "127.0.0.1", "203.0.113.9", "203.0.113.9"),           # trusted proxy reports the client
    ("127.0.0.1", "127.0.0.1", "1.2.3.4, 203.0.113.9", "203.0.113.9"),  # spoofed left part is ignored (rightmost untrusted)
    ("127.0.0.1,10.0.0.0/8", "127.0.0.1", "1.2.3.4, 198.51.100.7, 10.0.0.5", "198.51.100.7"),  # skip trusted hops
    ("127.0.0.1", "127.0.0.1", "not-an-ip", "127.0.0.1"),               # malformed chain is not believed
    ("127.0.0.1", "127.0.0.1", None, "127.0.0.1"),
])
def test_aud09_client_ip_only_trusts_configured_proxies(monkeypatch, trusted, peer, xff, expected):
    from app.security import client_ip
    monkeypatch.setattr(get_settings(), "trusted_proxies", trusted)
    assert client_ip(_req(peer, xff)) == expected


def test_aud09_rotating_x_forwarded_for_no_longer_bypasses_register_limit(device, monkeypatch):
    from app import security
    monkeypatch.setattr(get_settings(), "rate_limit_enabled", True)
    security._hits.clear()
    d = device("web")
    codes = [d.http.post("/auth/register", json={"email": f"xff{i}@example.com", "password": "CorrectHorse42",
                                                 "first_name": "X", "last_name": "F"},
                         headers={"X-Forwarded-For": f"203.0.113.{i}"}).status_code for i in range(11)]
    assert codes[:10] == [201] * 10 and codes[10] == 429
    security._hits.clear()


def test_aud19_same_slot_race_is_stopped_by_the_database(device, monkeypatch):
    """Two different requests for one slot that both pass the app-level check (simulated by disabling it) must not
    both land: the partial unique index on active (user_id, starts_at) decides, and the loser gets a clean 422."""
    from app.routers import appointments
    d = device("ios")
    d.register("slotrace@example.com")
    s = d.get("/appointments/slots?type=gp_review").json()
    monkeypatch.setattr(appointments, "_taken", lambda db, user: set())
    first = d.post("/appointments", {"type": "gp_review", "starts_at": s[0]["starts_at"], "client_request_id": "race-a-0001"})
    second = d.post("/appointments", {"type": "blood_test", "starts_at": s[0]["starts_at"], "client_request_id": "race-a-0002"})
    assert first.status_code == 201
    assert second.status_code == 422 and second.json()["error"]["code"] == "slot_unavailable"
    other = d.post("/appointments", {"type": "blood_test", "starts_at": s[1]["starts_at"], "client_request_id": "race-a-0003"}).json()
    r = d.post(f"/appointments/{other['id']}/reschedule", {"starts_at": s[0]["starts_at"], "version": other["version"]})
    assert r.status_code == 422 and r.json()["error"]["code"] == "slot_unavailable"
    # A cancelled appointment frees its slot (the index only covers active bookings).
    assert d.post(f"/appointments/{first.json()['id']}/cancel").status_code == 200
    again = d.post("/appointments", {"type": "gp_review", "starts_at": s[0]["starts_at"], "client_request_id": "race-a-0004"})
    assert again.status_code == 201
