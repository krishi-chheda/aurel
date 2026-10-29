from datetime import timedelta

import jwt

from app import security
from app.config import get_settings
from app.db import utcnow
from app.routers.auth import COOKIE, DEV_OUTBOX

from .conftest import PASSWORD


def test_register_mobile_gets_refresh_token_web_gets_cookie(device):
    phone = device("ios")
    r = phone.register("a@example.com")
    assert r.status_code == 201
    assert r.json()["refresh_token"] and r.json()["user"]["role"] == "customer"

    web = device("web")
    r = web.register("b@example.com")
    assert r.status_code == 201
    assert r.json()["refresh_token"] is None
    assert web.http.cookies.get(COOKIE)
    assert "httponly" in r.headers["set-cookie"].lower() and "samesite=strict" in r.headers["set-cookie"].lower()


def test_register_validation_and_duplicates(device):
    d = device("web")
    r = d.register("x@example.com", password="short")
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"
    assert "short" not in r.text  # submitted values are never echoed
    assert d.register("x@example.com", first="<script>").status_code == 422
    assert d.register("not-an-email").status_code == 422
    assert d.register("x@example.com").status_code == 201
    r = device("ios").register("X@Example.com")
    assert r.status_code == 409 and r.json()["error"]["code"] == "email_taken"


def test_login_errors_are_generic(device):
    device("web").register("u@example.com")
    d = device("android")
    wrong = d.login("u@example.com", "WrongPass123")
    unknown = d.login("nobody@example.com", "WrongPass123")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()
    assert d.login("U@EXAMPLE.COM").status_code == 200


def test_protected_routes_require_auth(device):
    from app.main import app
    anon = device("web")
    public = {"/auth/register", "/auth/login", "/auth/refresh", "/auth/forgot-password", "/auth/reset-password",
              "/healthz"}
    checked = 0
    for path, ops in app.openapi()["paths"].items():
        if path in public:
            continue
        for method in ops:
            r = anon.http.request(method.upper(), path.replace("{", "x").replace("}", ""), json={})
            assert r.status_code == 401, (method, path, r.status_code)
            checked += 1
    assert checked >= 25


def test_concurrent_refresh_within_grace_is_not_theft(device):
    d = device("web")
    d.register("tabs@example.com")
    cookie = d.http.cookies.get(COOKIE)
    tab2 = device("web")
    tab2.http.cookies.set(COOKIE, cookie)
    assert d.refresh().status_code == 200
    assert tab2.refresh().status_code == 200  # same old cookie, moments later
    assert d.get("/me").status_code == 200 and tab2.get("/me").status_code == 200


def test_refresh_rotates_and_detects_reuse(device, monkeypatch):
    monkeypatch.setattr(get_settings(), "refresh_reuse_grace_seconds", 0)
    d = device("ios")
    d.register("r@example.com")
    old = d.refresh_token
    assert d.refresh().status_code == 200
    assert d.refresh_token != old
    assert d.get("/me").status_code == 200
    # Replaying the rotated token ends every session (theft response).
    thief = device("ios")
    thief.refresh_token = old
    r = thief.refresh()
    assert r.status_code == 401
    assert d.get("/me").status_code == 401
    assert d.refresh().status_code == 401


def test_web_refresh_uses_cookie(device):
    web = device("web")
    web.register("w@example.com")
    web.access = None
    assert web.refresh().status_code == 200
    assert web.get("/me").status_code == 200


def test_logout_invalidates_access_token_immediately(device):
    d = device("android")
    d.register("l@example.com")
    assert d.post("/auth/logout").status_code == 204
    r = d.get("/me")
    assert r.status_code == 401 and r.json()["error"]["code"] == "session_expired"
    assert d.refresh().status_code == 401


def test_logout_all_ends_other_devices(device):
    web, phone = device("web"), device("ios")
    web.register("m@example.com")
    phone.login("m@example.com")
    assert phone.post("/auth/logout-all").status_code == 204
    assert web.get("/me").status_code == 401


def test_expired_access_token_reports_session_expired(device):
    d = device("ios")
    d.register("e@example.com")
    claims = jwt.decode(d.access, get_settings().jwt_secret, algorithms=["HS256"])
    claims["exp"] = utcnow() - timedelta(seconds=1)
    d.access = jwt.encode(claims, get_settings().jwt_secret, algorithm="HS256")
    r = d.get("/me")
    assert r.status_code == 401 and r.json()["error"]["code"] == "session_expired"
    assert d.refresh().status_code == 200  # recovery path
    assert d.get("/me").status_code == 200


def test_forged_token_rejected(device):
    d = device("ios")
    d.register("f@example.com")
    claims = jwt.decode(d.access, get_settings().jwt_secret, algorithms=["HS256"])
    claims["role"] = "admin"
    d.access = jwt.encode(claims, "not-the-secret-not-the-secret-123", algorithm="HS256")
    assert d.get("/me").status_code == 401


def test_password_reset_flow(device):
    phone = device("ios")
    phone.register("p@example.com")
    anon = device("web")
    assert anon.post("/auth/forgot-password", {"email": "nobody@example.com"}).status_code == 202
    assert DEV_OUTBOX == []
    assert anon.post("/auth/forgot-password", {"email": "p@example.com"}).status_code == 202
    token = DEV_OUTBOX[-1]["token"]
    assert anon.post("/auth/reset-password", {"token": token, "password": "weak"}).status_code == 422
    assert anon.post("/auth/reset-password", {"token": token, "password": "BrandNewPass99"}).status_code == 204
    assert anon.post("/auth/reset-password", {"token": token, "password": "BrandNewPass99"}).status_code == 400  # single use
    assert phone.get("/me").status_code == 401  # existing sessions ended
    assert anon.login("p@example.com", PASSWORD).status_code == 401
    assert anon.login("p@example.com", "BrandNewPass99").status_code == 200


def test_rate_limit_on_login(device, monkeypatch):
    monkeypatch.setattr(get_settings(), "rate_limit_enabled", True)
    d = device("web")
    codes = [d.login("rl@example.com", "WrongPass123").status_code for _ in range(9)]
    assert codes[:8] == [401] * 8 and codes[8] == 429
    security._hits.clear()


def test_deactivation(device):
    d = device("ios")
    d.register("d@example.com")
    assert d.delete("/me").status_code == 204
    assert d.get("/me").status_code == 401
    assert device("web").login("d@example.com").status_code == 401
