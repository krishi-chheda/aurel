import os
import tempfile

_db = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ.update(DATABASE_URL=f"sqlite:///{_db}", ENV="test", REFRESH_COOKIE_PATH="/auth", RATE_LIMIT_ENABLED="false")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import security  # noqa: E402
from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.routers.auth import DEV_OUTBOX  # noqa: E402

PASSWORD = "CorrectHorse42"


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    security._hits.clear()
    DEV_OUTBOX.clear()
    yield


class Device:
    """A client on one platform. Web relies on the refresh cookie; mobile keeps the refresh token itself."""

    def __init__(self, platform: str):
        self.platform = platform
        self.http = TestClient(app)
        self.access = None
        self.refresh_token = None

    def _headers(self, extra=None):
        h = {"X-Client-Platform": self.platform}
        if self.access:
            h["Authorization"] = f"Bearer {self.access}"
        return {**h, **(extra or {})}

    def _store(self, r):
        if r.status_code in (200, 201):
            body = r.json()
            self.access = body["access_token"]
            self.refresh_token = body.get("refresh_token")
        return r

    def register(self, email, first="Test", last="User", password=PASSWORD):
        return self._store(self.http.post("/auth/register", json={"email": email, "password": password,
                                                                  "first_name": first, "last_name": last},
                                          headers=self._headers()))

    def login(self, email, password=PASSWORD):
        return self._store(self.http.post("/auth/login", json={"email": email, "password": password},
                                          headers=self._headers()))

    def refresh(self):
        body = {"refresh_token": self.refresh_token} if self.refresh_token else {}
        return self._store(self.http.post("/auth/refresh", json=body, headers=self._headers()))

    def get(self, path, **kw):
        return self.http.get(path, headers=self._headers(kw.pop("headers", None)), **kw)

    def post(self, path, json=None, **kw):
        return self.http.post(path, json=json, headers=self._headers(kw.pop("headers", None)), **kw)

    def put(self, path, json=None):
        return self.http.put(path, json=json, headers=self._headers())

    def patch(self, path, json=None):
        return self.http.patch(path, json=json, headers=self._headers())

    def delete(self, path):
        return self.http.delete(path, headers=self._headers())


@pytest.fixture
def device():
    return Device


@pytest.fixture
def make_staff():
    from app.db import SessionLocal
    from app.seed import make_user

    def _make(role, email):
        db = SessionLocal()
        make_user(db, email, "Staff", role.title(), role)
        db.commit()
        db.close()
        # seed users share the demo password
        from app.seed import DEMO_PASSWORD
        d = Device("web")
        assert d.login(email, DEMO_PASSWORD).status_code == 200
        return d
    return _make


ONBOARDING_ANSWERS = {
    "basic_profile": {"preferred_name": "Tess", "date_of_birth": "1988-02-03", "phone": "+61 400 111 222", "postcode": "3000"},
    "health_goals": {"health_goals": ["heart_health", "sleep"]},
    "lifestyle": {"activity_days_per_week": 3, "sleep_hours": 7.5, "diet": "vegetarian", "alcohol_drinks_per_week": 2,
                  "smoker": False},
    "history": {"family_history": ["diabetes"], "conditions_note": None, "takes_medication": False},
}
