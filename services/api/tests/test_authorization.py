"""Test 5: one user can never read or change another user's records by swapping an identifier."""

import pytest


@pytest.fixture
def two_users(device):
    alice, bob = device("web"), device("ios")
    alice.register("alice@example.com", "Alice")
    bob.register("bob@example.com", "Bob")
    return alice, bob


def test_cross_user_reads_and_writes_are_rejected(two_users):
    alice, bob = two_users
    report_id = bob.get("/reports").json()[0]["id"]
    appt_id = bob.get("/appointments").json()["upcoming"][0]["id"]
    task_id = bob.get("/tasks").json()[0]["id"]
    notif_id = bob.get("/notifications").json()["items"][0]["id"]

    attempts = [
        alice.get(f"/reports/{report_id}"),
        alice.get(f"/appointments/{appt_id}"),
        alice.post(f"/appointments/{appt_id}/cancel"),
        alice.post(f"/appointments/{appt_id}/reschedule", {"starts_at": "2030-01-01T09:00:00Z", "version": 1}),
        alice.patch(f"/tasks/{task_id}", {"status": "done"}),
        alice.post(f"/notifications/{notif_id}/read"),
    ]
    for r in attempts:
        assert r.status_code == 404, r.request.url  # indistinguishable from "does not exist"

    # Bob's data is untouched.
    assert bob.get(f"/appointments/{appt_id}").json()["status"] == "scheduled"
    assert next(t for t in bob.get("/tasks?status=all").json() if t["id"] == task_id)["status"] == "open"
    assert bob.get("/notifications").json()["items"][0]["read_at"] is None


def test_lists_are_scoped_to_owner(two_users):
    alice, bob = two_users
    a_ids = {r["id"] for r in alice.get("/reports").json()}
    b_ids = {r["id"] for r in bob.get("/reports").json()}
    assert a_ids and b_ids and not a_ids & b_ids
    assert not {t["id"] for t in alice.get("/tasks?status=all").json()} & {t["id"] for t in bob.get("/tasks?status=all").json()}
    assert alice.get("/me").json()["user"]["email"] == "alice@example.com"


def test_customers_cannot_reach_admin(two_users):
    alice, _ = two_users
    for path in ("/admin/overview", "/admin/customers", "/admin/audit"):
        r = alice.get(path)
        assert r.status_code == 403 and r.json()["error"]["code"] == "forbidden"


def test_role_scoped_admin_views(two_users, make_staff):
    coord = make_staff("coordinator", "coord@example.com")
    admin = make_staff("admin", "admin@example.com")
    c_rows = coord.get("/admin/customers").json()["items"]
    a_rows = admin.get("/admin/customers").json()["items"]
    assert len(c_rows) == len(a_rows) == 2
    assert all("email" not in r for r in c_rows)
    assert all("email" in r for r in a_rows)
    # Operational view never carries clinical values.
    assert "measurement" not in str(a_rows).lower() and "ldl" not in str(a_rows).lower()
    assert coord.get("/admin/audit").status_code == 403
    assert admin.get("/admin/audit").status_code == 200
