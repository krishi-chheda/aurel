"""Synthetic demonstration data. Everything created here is fictional and flagged is_synthetic / is_demo."""

from datetime import timedelta

from sqlalchemy.orm import Session

from .db import utcnow
from .models import Appointment, CarePlan, HealthReport, Measurement, Notification, Task, User
from .schemas import APPT_TYPES

SOURCE = "Synthetic demo panel (not a real laboratory)"
REVIEWER = "Dr. Alex Morgan (fictional clinician)"

# code -> values for three panels (oldest first). None = unavailable result. Units default to the catalogue unit.
SERIES = {
    "ldl": [3.6, 3.4, 3.2],
    "hdl": [1.2, 1.3, 1.3],
    "apob": [1.1, 1.05, 0.95],
    "hba1c": [5.6, 5.7, 5.5],
    "glucose": [5.4, None, 5.2],
    "crp": [2.1, 1.4, 1.2],
    "ferritin": [85, 92, 88],
    "tsh": [1.8, 2.0, 1.9],
    "egfr": [96, 94, 95],
}
# Vitamin D deliberately mixes units across labs to exercise the "not comparable" path.
VITD = [(42, "nmol/L"), (24, "ng/mL"), (68, "nmol/L")]


def notify(db: Session, user_id: str, kind: str, title: str, body: str, link: str | None = None,
           push_text: str = "You have a new update in Aurel.") -> Notification:
    """Notification boundary: stores the in-app notification and hands a generic, non-sensitive
    lock-screen string to the push channel. Push delivery is not wired up in the prototype (see docs/integrations.md)."""
    n = Notification(user_id=user_id, kind=kind, title=title, body=body, link=link, push_text=push_text)
    db.add(n)
    return n


def create_demo_data(db: Session, user: User, *, onboarding_done: bool = False) -> None:
    from .rules import BIOMARKERS

    now = utcnow()
    panel_dates = [now - timedelta(days=d) for d in (360, 180, 14)]
    reports = []
    for i, when in enumerate(panel_dates):
        r = HealthReport(user_id=user.id, released_at=when + timedelta(days=3), reviewed_by=REVIEWER, source=SOURCE,
                         title=["Baseline health assessment", "Six-month follow-up", "Annual review panel"][i],
                         summary="Synthetic demonstration report. Values are fictional and generated for this prototype. "
                                 "They are not medical results and must not be used for any health decision.")
        db.add(r)
        db.flush()
        reports.append(r)
        for code, vals in SERIES.items():
            db.add(Measurement(user_id=user.id, report_id=r.id, biomarker_code=code, value=vals[i],
                               unit=BIOMARKERS[code].unit, source=SOURCE, measured_at=when))
        v, unit = VITD[i]
        db.add(Measurement(user_id=user.id, report_id=r.id, biomarker_code="vitd", value=v, unit=unit,
                           source=SOURCE, measured_at=when))

    plan = CarePlan(user_id=user.id, title="Preventive care plan (demo)", approved_by=REVIEWER,
                    approved_at=now - timedelta(days=10), review_at=now + timedelta(days=80), goals=[
                        {"title": "Move more, consistently", "detail": "Three sessions of moderate activity each week."},
                        {"title": "Support heart health through diet", "detail": "Follow the predefined nutrition guide in this plan."},
                        {"title": "Recheck results in three months", "detail": "Book a follow-up blood collection."},
                    ])
    db.add(plan)
    db.flush()

    latest = reports[-1]
    tasks = [
        Task(user_id=user.id, kind="report_review", title="Review your annual review panel",
             detail="Read through your latest (synthetic) report and mark it reviewed.",
             link=f"/health/reports/{latest.id}", due_at=now + timedelta(days=3)),
        Task(user_id=user.id, care_plan_id=plan.id, kind="care_action", title="Log three activity sessions this week",
             detail="Any moderate activity counts: brisk walking, cycling, swimming.", due_at=now + timedelta(days=5)),
        Task(user_id=user.id, care_plan_id=plan.id, kind="care_action", title="Read the nutrition guide",
             detail="A short predefined guide attached to your plan.", link="/care-plan", due_at=now - timedelta(days=2)),
        Task(user_id=user.id, care_plan_id=plan.id, kind="check_in", title="Weekly check-in",
             detail="How have energy and sleep been this week?", due_at=now + timedelta(days=1)),
        Task(user_id=user.id, care_plan_id=plan.id, kind="milestone", title="Milestone: 30 days on your plan",
             detail="Acknowledge your first month.", due_at=now + timedelta(days=20)),
        Task(user_id=user.id, care_plan_id=plan.id, kind="care_action", title="Set up your activity tracker",
             status="done", completed_at=now - timedelta(days=8), completed_from="web"),
    ]
    if not onboarding_done:
        tasks.append(Task(user_id=user.id, kind="profile", title="Finish setting up your profile",
                          detail="Complete onboarding so your care team has what they need.", link="/onboarding"))
    db.add_all(tasks)

    title, practitioner, duration, location = APPT_TYPES["gp_review"]
    upcoming = Appointment(user_id=user.id, type="gp_review", title=title, practitioner=practitioner, location=location,
                           duration_min=duration, status="scheduled",
                           starts_at=(now + timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(hours=23),
                           prep_notes=["Have your latest report open.", "Write down any questions beforehand."])
    t2, p2, d2, l2 = APPT_TYPES["blood_test"]
    past = Appointment(user_id=user.id, type="blood_test", title=t2, practitioner=p2, location=l2, duration_min=d2,
                       status="completed", starts_at=panel_dates[-1], prep_notes=["Fast for 10 hours beforehand."])
    db.add_all([upcoming, past])
    db.flush()
    db.add(Task(user_id=user.id, appointment_id=upcoming.id, kind="appointment_prep",
                title="Prepare for your results review", detail="Note any questions for the (demo) doctor.",
                link=f"/appointments/{upcoming.id}", due_at=upcoming.starts_at))

    notify(db, user.id, "report", "A new report is available", "Your annual review panel (synthetic) is ready to view.",
           f"/health/reports/{latest.id}", "A new report is ready in Aurel.")
    notify(db, user.id, "appointment", "Upcoming appointment", "Results review with a doctor in 6 days (demo booking).",
           f"/appointments/{upcoming.id}", "You have an upcoming appointment.")
    if not onboarding_done:
        notify(db, user.id, "onboarding", "Finish your onboarding", "Pick up where you left off on any device.",
               "/onboarding", "Finish setting up your Aurel profile.")
