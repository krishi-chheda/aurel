"""Seed synthetic demo accounts: `python -m app.seed`. Refuses to run in production."""

from datetime import timedelta

from sqlalchemy import select

from .config import get_settings
from .db import SessionLocal, utcnow
from .demo import create_demo_data
from .models import Appointment, OnboardingSession, Profile, Task, User
from .rules import ONBOARDING_STEPS
from .security import hash_password

DEMO_PASSWORD = "DemoPass2026!"  # synthetic accounts only; documented in README

ACCOUNTS = [
    ("demo@aurel.example", "Jordan", "Lee", "customer", "fresh"),
    ("demo2@aurel.example", "Priya", "Shah", "customer", "complete"),
    ("coordinator@aurel.example", "Casey", "Nguyen", "coordinator", None),
    ("admin@aurel.example", "Morgan", "Hale", "admin", None),
]
# Fictional customers in varied journey states for the operations dashboard.
CUSTOMERS = [("Avery", "Brooks", 2, 1), ("Riley", "Chen", 5, 9), ("Quinn", "Diaz", 6, 0), ("Harper", "Ellis", 3, 4),
             ("Rowan", "Fox", 6, 0), ("Sage", "Gupta", 1, 6), ("Emerson", "Hill", 6, 2), ("Dakota", "Ito", 4, 1),
             ("Skyler", "James", 6, 12), ("Parker", "Kim", 6, 3)]


def _complete_profile(p: Profile):
    p.date_of_birth, p.phone, p.postcode = "1986-04-12", "+61 400 000 000", "2000"
    p.health_goals = ["heart_health", "energy"]
    p.lifestyle = {"activity_days_per_week": 3, "sleep_hours": 7, "diet": "omnivore", "alcohol_drinks_per_week": 4,
                   "smoker": False}
    p.history = {"family_history": ["heart_disease"], "conditions_note": None, "takes_medication": False}


def make_user(db, email, first, last, role="customer", step_idx=0, idle_days=0):
    u = User(email=email, password_hash=hash_password(DEMO_PASSWORD), role=role)
    u.profile = Profile(first_name=first, last_name=last)
    done = step_idx >= len(ONBOARDING_STEPS) - 1
    u.onboarding = OnboardingSession(current_step=ONBOARDING_STEPS[step_idx], completed_steps=ONBOARDING_STEPS[:step_idx],
                                     status="completed" if done else "in_progress",
                                     last_platform=["web", "ios", "android"][len(first) % 3],
                                     completed_at=utcnow() if done else None)
    if step_idx >= 2:
        _complete_profile(u.profile)
    db.add(u)
    db.flush()
    u.onboarding.updated_at = utcnow() - timedelta(days=idle_days)
    if role == "customer":
        create_demo_data(db, u, onboarding_done=done)
    return u


def seed():
    s = get_settings()
    if s.is_production:
        raise SystemExit("Refusing to seed synthetic data in production.")
    db = SessionLocal()
    if db.scalar(select(User).where(User.email == ACCOUNTS[0][0])):
        print("Already seeded.")
        return
    for email, first, last, role, state in ACCOUNTS:
        make_user(db, email, first, last, role, 6 if state == "complete" else 0)
    for i, (first, last, step, idle) in enumerate(CUSTOMERS):
        u = make_user(db, f"{first.lower()}.{last.lower()}@customers.example", first, last, step_idx=step, idle_days=idle)
        if i % 3 == 0:  # an appointment request that has waited past the SLA
            a = Appointment(user_id=u.id, type="blood_test", title="Blood collection", practitioner="Collection centre (fictional)",
                            location="Demo", starts_at=utcnow() + timedelta(days=5), status="requested",
                            created_at=utcnow() - timedelta(days=3))
            db.add(a)
        if i % 4 == 1:
            db.add(Task(user_id=u.id, kind="check_in", title="Weekly check-in", due_at=utcnow() - timedelta(days=6)))
    db.commit()
    print(f"Seeded {len(ACCOUNTS) + len(CUSTOMERS)} synthetic users. Password for demo accounts: {DEMO_PASSWORD}")


if __name__ == "__main__":
    seed()
