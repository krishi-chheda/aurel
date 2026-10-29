from datetime import datetime, timedelta, timezone

from sqlalchemy import inspect

from app.assistant import answer
from app.rules import advance, customer_flags, range_status, trend

T0 = datetime(2026, 1, 1, tzinfo=timezone.utc)


def pts(*vals, unit="mmol/L"):
    return [(T0 + timedelta(days=30 * i), v, unit) for i, v in enumerate(vals)]


def test_trend_rules():
    assert trend("ldl", pts(3.6, 3.2))["direction"] == "down"
    assert trend("ldl", pts(3.0, 3.05))["direction"] == "stable"
    assert trend("ldl", pts(3.0))["comparable"] is False
    t = trend("glucose", pts(5.4, None, 5.2))
    assert t["comparable"] and t["excluded_points"] == 1
    mixed = trend("vitd", [(T0, 42, "nmol/L"), (T0 + timedelta(days=9), 24, "ng/mL")])
    assert mixed["comparable"] is False and "units" in mixed["reason"]
    assert trend("vitd", pts(40, 60, unit="ng/mL"))["comparable"] is False  # unit differs from catalogue


def test_range_status():
    assert range_status("ldl", 3.2) == "above"
    assert range_status("hdl", 0.8) == "below"
    assert range_status("tsh", 2.0) == "within"
    assert range_status("tsh", None) == "unavailable"


def test_onboarding_advance_never_regresses():
    assert advance("welcome", "welcome") == "basic_profile"
    assert advance("lifestyle", "basic_profile") == "lifestyle"
    assert advance("review", "review") == "complete"


def test_workflow_flags():
    now = T0
    f = customer_flags(now=now, onboarding_status="in_progress", onboarding_updated=now - timedelta(days=5),
                       missing_fields=["phone"], overdue_tasks=3, pending_requests=[now - timedelta(hours=50)])
    assert {x["rule"] for x in f} == {"onboarding_stalled", "missing_information", "overdue_tasks", "appointment_request_sla"}
    assert next(x for x in f if x["rule"] == "overdue_tasks")["severity"] == "high"
    assert customer_flags(now=now, onboarding_status="completed", onboarding_updated=now - timedelta(days=99),
                          missing_fields=[], overdue_tasks=0, pending_requests=[now]) == []


def test_assistant_boundaries(device):
    assert answer("I have chest pain")["kind"] == "safety"
    assert answer("Should I take more medication?")["kind"] == "safety"
    assert answer("how do I reschedule my appointment")["links"][0]["href"] == "/appointments"
    assert answer("asdf")["kind"] == "fallback"
    d = device("ios")
    d.register("ai@example.com")
    r = d.post("/assistant/ask", {"message": "where is my report"})
    assert r.status_code == 200 and r.json()["provider"] == "builtin-rules-v1"


def test_biomarker_series_and_filters(device):
    d = device("web")
    d.register("bio@example.com")
    s = d.get("/health/biomarkers/vitd").json()
    assert len(s["points"]) == 3 and s["trend"]["comparable"] is False
    assert any(p["status"] == "not_comparable" for p in s["points"])
    s = d.get("/health/biomarkers/ldl").json()
    assert s["trend"]["direction"] == "down" and s["points"][-1]["status"] == "above"
    recent = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat().replace("+00:00", "Z")
    s = d.get("/health/biomarkers/ldl", params={"from": recent}).json()
    assert len(s["points"]) == 1 and s["trend"]["comparable"] is False
    assert d.get("/health/biomarkers/ldl", params={"from": "2026-05-01T00:00:00Z", "to": "2026-01-01T00:00:00Z"}).status_code == 422
    assert d.get("/health/biomarkers/unknown").status_code == 404
    rep = d.get("/reports").json()[0]
    detail = d.get(f"/reports/{rep['id']}").json()
    assert detail["is_synthetic"] and len(detail["measurements"]) == 10


def test_appointment_lifecycle(device):
    d = device("web")
    d.register("appt@example.com")
    slots = d.get("/appointments/slots?type=gp_review").json()
    a = d.post("/appointments", {"type": "gp_review", "starts_at": slots[0]["starts_at"], "client_request_id": "req-000001"}).json()
    assert d.post("/appointments", {"type": "gp_review", "starts_at": "2026-01-01T03:17:00Z",
                                    "client_request_id": "req-000002"}).status_code == 422
    assert slots[0]["starts_at"] not in {s["starts_at"] for s in d.get("/appointments/slots?type=gp_review").json()}
    r = d.post(f"/appointments/{a['id']}/reschedule", {"starts_at": slots[1]["starts_at"], "version": a["version"]})
    assert r.status_code == 200
    stale = d.post(f"/appointments/{a['id']}/reschedule", {"starts_at": slots[2]["starts_at"], "version": a["version"]})
    assert stale.status_code == 409
    assert d.post(f"/appointments/{a['id']}/cancel").json()["status"] == "cancelled"
    assert not [t for t in d.get("/tasks").json() if t["appointment_id"] == a["id"]]
    past = d.get("/appointments").json()["past"]
    assert a["id"] in {x["id"] for x in past}
    done = next(x for x in past if x["status"] == "completed")
    assert d.post(f"/appointments/{done['id']}/cancel").status_code == 422


def test_notifications_read_states(device):
    d = device("android")
    d.register("n@example.com")
    n = d.get("/notifications").json()
    assert n["unread"] == n["total"] == 3
    d.post(f"/notifications/{n['items'][0]['id']}/read")
    assert d.get("/notifications").json()["unread"] == 2
    d.post("/notifications/read-all")
    assert d.get("/notifications").json()["unread"] == 0
    assert d.get("/notifications?limit=1").json()["items"].__len__() == 1


def test_dashboard_shape(device):
    d = device("web")
    d.register("dash@example.com", "Dana")
    dash = d.get("/dashboard").json()
    assert dash["greeting_name"] == "Dana"
    assert dash["health_overview"]["tracked"] == 10 and dash["health_overview"]["outside_range"] == 1
    assert dash["health_overview"]["other"] == 0  # vitd latest is nmol/L, comparable
    assert dash["next_appointments"] and dash["recent_reports"] and dash["care_plan"]["total"] == 5


def test_migrations_build_the_schema(tmp_path, monkeypatch):
    """alembic upgrade head on an empty database yields every table the models define."""
    from alembic import command
    from alembic.config import Config

    from app import config as cfg
    from app.db import Base, make_engine

    url = f"sqlite:///{tmp_path / 'm.db'}"
    monkeypatch.setattr(cfg.get_settings(), "database_url", url)
    command.upgrade(Config("alembic.ini"), "head")
    tables = set(inspect(make_engine(url)).get_table_names())
    assert set(Base.metadata.tables) <= tables


def test_health_graph(device):
    a, b = device("web"), device("ios")
    a.register("graph-a@example.com", "Gina")
    b.register("graph-b@example.com", "Ben")
    g = a.get("/health/graph").json()
    ids = {n["id"] for n in g["nodes"]}
    types = {n["type"] for n in g["nodes"]}
    assert {"Patient", "Category", "Biomarker", "Report", "Plan", "Goal", "Action", "Appointment"} <= types
    assert all(e["source"] in ids and e["target"] in ids for e in g["edges"])
    ldl = next(n for n in g["nodes"] if n["id"] == "bio:ldl")
    assert ldl["status"] == "above" and ldl["link"] == "/health/biomarkers/ldl"
    assert next(n for n in g["nodes"] if n["type"] == "Patient")["label"] == "Gina"
    assert "not clinical" in g["note"]
    assert g == a.get("/health/graph").json()  # deterministic
    # Scoped to the caller: none of Ben's records appear.
    ben_reports = {f"report:{r['id']}" for r in b.get("/reports").json()}
    assert not ids & ben_reports
