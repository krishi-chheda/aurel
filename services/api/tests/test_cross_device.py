"""Cross-platform continuity tests (spec tests 1-4), driven as separate web and mobile clients against one backend."""

import uuid

from .conftest import ONBOARDING_ANSWERS


def save(dev, step, version, data=None):
    return dev.put(f"/onboarding/steps/{step}", {"version": version, "data": data or {}})


def test_1_onboarding_started_on_web_finished_on_mobile(device):
    web = device("web")
    web.register("journey@example.com", "Tess")
    st = web.get("/onboarding").json()
    assert st["current_step"] == "welcome" and st["status"] == "in_progress"
    st = save(web, "welcome", st["version"]).json()
    st = save(web, "basic_profile", st["version"], ONBOARDING_ANSWERS["basic_profile"]).json()
    assert st["current_step"] == "health_goals"

    # Browser closed. Same account on the phone.
    phone = device("ios")
    phone.login("journey@example.com")
    st = phone.get("/onboarding").json()
    assert st["current_step"] == "health_goals"
    assert st["answers"]["basic_profile"]["postcode"] == "3000"
    for step in ("health_goals", "lifestyle", "history"):
        r = save(phone, step, st["version"], ONBOARDING_ANSWERS[step])
        assert r.status_code == 200, r.text
        st = r.json()
    st = save(phone, "review", st["version"]).json()
    r = phone.post("/onboarding/complete", {"version": st["version"]})
    assert r.status_code == 200 and r.json()["status"] == "completed"
    assert r.json()["last_platform"] == "ios"

    # Back on the web.
    st = web.get("/onboarding").json()
    assert st["status"] == "completed" and st["current_step"] == "complete"
    dash = web.get("/dashboard").json()
    assert dash["onboarding"]["status"] == "completed" and dash["greeting_name"] == "Tess"
    assert not [t for t in web.get("/tasks").json() if t["kind"] == "profile"]


def test_onboarding_stale_device_gets_conflict_not_data_loss(device):
    web, phone = device("web"), device("android")
    web.register("stale@example.com")
    phone.login("stale@example.com")
    v = web.get("/onboarding").json()["version"]
    save(phone, "welcome", v)
    # Web still holds the old version and tries to save a different answer.
    r = save(web, "welcome", v)
    assert r.status_code == 409
    err = r.json()["error"]
    assert err["code"] == "version_conflict" and err["current"]["current_step"] == "basic_profile"


def test_onboarding_retry_after_lost_response_is_idempotent(device):
    d = device("ios")
    d.register("retry@example.com")
    v = d.get("/onboarding").json()["version"]
    first = save(d, "basic_profile", v, ONBOARDING_ANSWERS["basic_profile"])
    assert first.status_code == 200
    # The client never saw the response and retries with the same (now stale) version and data.
    again = save(d, "basic_profile", v, ONBOARDING_ANSWERS["basic_profile"])
    assert again.status_code == 200 and again.json()["version"] == first.json()["version"]


def test_onboarding_cannot_complete_with_missing_steps(device):
    d = device("web")
    d.register("missing@example.com")
    v = d.get("/onboarding").json()["version"]
    r = d.post("/onboarding/complete", {"version": v})
    assert r.status_code == 422 and r.json()["error"]["missing_steps"] == ["basic_profile", "health_goals", "lifestyle", "history"]
    assert save(d, "nonsense", v).status_code == 404
    assert save(d, "health_goals", v, {"health_goals": []}).status_code == 422
    assert save(d, "basic_profile", v, {**ONBOARDING_ANSWERS["basic_profile"], "date_of_birth": "2999-01-01"}).status_code == 422


def test_editing_earlier_step_does_not_move_progress_back(device):
    d = device("web")
    d.register("edit@example.com")
    st = d.get("/onboarding").json()
    for step in ("welcome", "basic_profile", "health_goals"):
        st = save(d, step, st["version"], ONBOARDING_ANSWERS.get(step)).json()
    assert st["current_step"] == "lifestyle"
    st = save(d, "basic_profile", st["version"], {**ONBOARDING_ANSWERS["basic_profile"], "postcode": "4000"}).json()
    assert st["current_step"] == "lifestyle" and st["answers"]["basic_profile"]["postcode"] == "4000"


def test_2_profile_sync_both_directions(device):
    web, phone = device("web"), device("android")
    web.register("sync@example.com", "Sam")
    phone.login("sync@example.com")

    v = web.get("/me").json()["profile"]["version"]
    r = web.patch("/me/profile", {"version": v, "preferred_name": "Sammy"})
    assert r.status_code == 200
    me = phone.get("/me").json()["profile"]  # mobile refresh
    assert me["preferred_name"] == "Sammy" and me["updated_from"] == "web"

    r = phone.patch("/me/profile", {"version": me["version"], "phone": "+61 411 222 333"})
    assert r.status_code == 200
    me = web.get("/me").json()["profile"]
    assert me["phone"] == "+61 411 222 333" and me["preferred_name"] == "Sammy" and me["updated_from"] == "android"


def test_profile_concurrent_edit_conflict(device):
    web, phone = device("web"), device("ios")
    web.register("conflict@example.com")
    phone.login("conflict@example.com")
    v = web.get("/me").json()["profile"]["version"]
    assert phone.patch("/me/profile", {"version": v, "postcode": "2000"}).status_code == 200
    r = web.patch("/me/profile", {"version": v, "postcode": "3000"})
    assert r.status_code == 409
    assert r.json()["error"]["current"]["postcode"] == "2000"  # client can show both values to the user
    # Resolving: resubmit against the current version.
    r = web.patch("/me/profile", {"version": r.json()["error"]["current"]["version"], "postcode": "3000"})
    assert r.status_code == 200 and r.json()["profile"]["postcode"] == "3000"


def test_3_task_sync_both_directions(device):
    web, phone = device("web"), device("ios")
    web.register("tasks@example.com")
    phone.login("tasks@example.com")
    task = next(t for t in web.get("/tasks").json() if t["kind"] == "check_in")

    r = phone.patch(f"/tasks/{task['id']}", {"status": "done"})
    assert r.status_code == 200 and r.json()["completed_from"] == "ios"
    seen = next(t for t in web.get("/tasks?status=all").json() if t["id"] == task["id"])
    assert seen["status"] == "done"
    assert task["id"] not in {t["id"] for t in web.get("/tasks").json()}

    r = web.patch(f"/tasks/{task['id']}", {"status": "open"})
    assert r.status_code == 200
    seen = next(t for t in phone.get("/tasks").json() if t["id"] == task["id"])
    assert seen["status"] == "open" and seen["completed_at"] is None
    # Care plan progress reflects it on both devices.
    assert web.get("/care-plan").json()["progress"] == phone.get("/care-plan").json()["progress"]


def test_task_double_submit_is_noop(device):
    d = device("android")
    d.register("double@example.com")
    t = d.get("/tasks").json()[0]
    a = d.patch(f"/tasks/{t['id']}", {"status": "done"}).json()
    b = d.patch(f"/tasks/{t['id']}", {"status": "done"}).json()
    assert a["version"] == b["version"] and a["completed_at"] == b["completed_at"]


def test_profile_task_only_completes_through_onboarding(device):
    d = device("web")
    d.register("ptask@example.com")
    t = next(t for t in d.get("/tasks").json() if t["kind"] == "profile")
    assert d.patch(f"/tasks/{t['id']}", {"status": "done"}).status_code == 422


def test_4_failed_request_retry_without_duplication(device):
    phone = device("ios")
    phone.register("net@example.com")
    slot = phone.get("/appointments/slots?type=blood_test").json()[0]["starts_at"]
    key = str(uuid.uuid4())
    body = {"type": "blood_test", "starts_at": slot, "client_request_id": key}

    # First attempt reaches the server but the response is lost (client sees a network error) ...
    first = phone.post("/appointments", body)
    assert first.status_code == 201
    # ... so the client retries with the same idempotency key once connectivity is back.
    retry = phone.post("/appointments", body)
    assert retry.status_code == 200 and retry.json()["id"] == first.json()["id"]
    upcoming = phone.get("/appointments").json()["upcoming"]
    assert sum(a["starts_at"] == first.json()["starts_at"] for a in upcoming) == 1
    assert sum(t["appointment_id"] == first.json()["id"] for t in phone.get("/tasks").json()) == 1
    assert first.json()["is_demo"] is True and first.json()["status"] == "requested"

    # Profile save retried after a lost response: same values => success, no conflict, single version bump.
    v = phone.get("/me").json()["profile"]["version"]
    a = phone.patch("/me/profile", {"version": v, "postcode": "5000"})
    b = phone.patch("/me/profile", {"version": v, "postcode": "5000"})
    assert a.status_code == b.status_code == 200 and b.json()["profile"]["version"] == v + 1
