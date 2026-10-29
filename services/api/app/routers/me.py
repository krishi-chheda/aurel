from fastapi import APIRouter, Depends, HTTPException
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from ..db import get_db, utcnow
from ..demo import notify
from ..models import Appointment, CarePlan, HealthReport, Measurement, Notification, RefreshSession, Task, User
from ..rules import BIOMARKERS, ONBOARDING_STEPS, REQUIRED_STEPS, advance, range_status
from ..schemas import (STEP_MODELS, CompleteIn, MeOut, OnboardingOut, ProfileOut, ProfilePatch, StepIn, TaskOut,
                       UserOut, ReportOut, AppointmentOut)
from ..security import audit, current_user, platform_of

router = APIRouter(tags=["profile"])


def conflict(current) -> HTTPException:
    return HTTPException(409, {"code": "version_conflict",
                               "message": "This was changed on another device. Review the latest version and try again.",
                               "current": current})


def commit_or_conflict(db: Session, current) -> None:
    """Commit; if a versioned row changed underneath us (another device won the race), report the newer copy."""
    try:
        db.commit()
    except StaleDataError:
        db.rollback()  # expires loaded objects, so `current()` reads what the other request wrote
        raise conflict(current())


def me_out(user: User) -> MeOut:
    return MeOut(user=UserOut.model_validate(user), profile=ProfileOut.model_validate(user.profile))


@router.get("/me", response_model=MeOut)
def get_me(user: User = Depends(current_user)):
    return me_out(user)


@router.patch("/me/profile", response_model=MeOut)
def patch_profile(body: ProfilePatch, user: User = Depends(current_user), db: Session = Depends(get_db),
                  platform: str = Depends(platform_of)):
    p = user.profile
    changes = body.model_dump(exclude_unset=True, exclude={"version"})
    if body.version != p.version:
        # Retried request whose first attempt already landed: same values => success, no conflict.
        if all(getattr(p, k) == v for k, v in changes.items()):
            return me_out(user)
        raise conflict(ProfileOut.model_validate(p).model_dump(mode="json"))
    for k, v in changes.items():
        setattr(p, k, v)
    p.updated_from = platform  # version is bumped by the ORM (version_id_col)
    audit(db, user.id, "profile.update", "profile", user.id, platform, fields=sorted(changes))
    commit_or_conflict(db, lambda: ProfileOut.model_validate(user.profile).model_dump(mode="json"))
    return me_out(user)


@router.delete("/me", status_code=204)
def deactivate(user: User = Depends(current_user), db: Session = Depends(get_db), platform: str = Depends(platform_of)):
    """Deactivates the account and ends every session. Data purge follows the retention policy (docs/security.md)."""
    now = utcnow()
    user.is_active = False
    user.deactivated_at = now
    db.execute(update(RefreshSession).where(RefreshSession.user_id == user.id).values(revoked_at=now))
    audit(db, user.id, "account.deactivate", "user", user.id, platform)
    db.commit()


# ---- Onboarding -------------------------------------------------------------

def onboarding_out(user: User) -> OnboardingOut:
    o, p = user.onboarding, user.profile
    return OnboardingOut(steps=ONBOARDING_STEPS, current_step=o.current_step, completed_steps=o.completed_steps,
                         status=o.status, version=o.version, last_platform=o.last_platform, updated_at=o.updated_at,
                         answers={"basic_profile": {"preferred_name": p.preferred_name, "date_of_birth": p.date_of_birth,
                                                    "phone": p.phone, "postcode": p.postcode},
                                  "health_goals": {"health_goals": p.health_goals},
                                  "lifestyle": p.lifestyle, "history": p.history})


@router.get("/onboarding", response_model=OnboardingOut)
def get_onboarding(user: User = Depends(current_user)):
    return onboarding_out(user)


def _apply_step(p, step: str, data: dict) -> None:
    if step == "basic_profile":
        for k, v in data.items():
            setattr(p, k, v)
    elif step == "health_goals":
        p.health_goals = data["health_goals"]
    else:
        setattr(p, step, data)


def _same(p, step: str, data: dict) -> bool:
    if step == "basic_profile":
        return all(getattr(p, k) == v for k, v in data.items())
    if step == "health_goals":
        return p.health_goals == data["health_goals"]
    return getattr(p, step) == data


@router.put("/onboarding/steps/{step}", response_model=OnboardingOut)
def save_step(step: str, body: StepIn, user: User = Depends(current_user), db: Session = Depends(get_db),
              platform: str = Depends(platform_of)):
    o = user.onboarding
    if step not in ONBOARDING_STEPS or step == "complete":
        raise HTTPException(404, {"code": "unknown_step", "message": "Unknown onboarding step."})
    if o.status == "completed":
        # Edits after completion go through the profile screen, not onboarding.
        raise conflict(onboarding_out(user).model_dump(mode="json"))
    try:
        data = STEP_MODELS[step](**body.data).model_dump() if step in STEP_MODELS else {}
    except ValidationError as e:
        raise RequestValidationError(e.errors(include_input=False))
    if body.version != o.version:
        if step in STEP_MODELS and step in o.completed_steps and _same(user.profile, step, data):
            return onboarding_out(user)  # idempotent retry
        raise conflict(onboarding_out(user).model_dump(mode="json"))
    if step in STEP_MODELS:
        _apply_step(user.profile, step, data)
        user.profile.updated_from = platform
    if step not in o.completed_steps:
        o.completed_steps = [*o.completed_steps, step]
    o.current_step = advance(o.current_step, step)
    o.last_platform = platform
    o.updated_at = utcnow()
    audit(db, user.id, "onboarding.step_saved", "onboarding", user.id, platform, step=step)
    commit_or_conflict(db, lambda: onboarding_out(user).model_dump(mode="json"))
    return onboarding_out(user)


@router.post("/onboarding/complete", response_model=OnboardingOut)
def complete(body: CompleteIn, user: User = Depends(current_user), db: Session = Depends(get_db),
             platform: str = Depends(platform_of)):
    o = user.onboarding
    if o.status == "completed":
        return onboarding_out(user)  # idempotent
    if body.version != o.version:
        raise conflict(onboarding_out(user).model_dump(mode="json"))
    missing = [s for s in REQUIRED_STEPS if s not in o.completed_steps]
    if missing:
        raise HTTPException(422, {"code": "onboarding_incomplete", "message": "Some steps still need answers.",
                                  "missing_steps": missing})
    now = utcnow()
    o.status, o.current_step, o.completed_at, o.last_platform = "completed", "complete", now, platform
    o.updated_at = now
    if "complete" not in o.completed_steps:
        o.completed_steps = [*o.completed_steps, "complete"]
    for t in db.scalars(select(Task).where(Task.user_id == user.id, Task.kind == "profile", Task.status == "open")):
        t.status, t.completed_at, t.completed_from = "done", now, platform
        t.version += 1
    db.execute(update(Notification).where(Notification.user_id == user.id, Notification.kind == "onboarding",
                                          Notification.read_at.is_(None)).values(read_at=now))
    notify(db, user.id, "account", "Onboarding complete", "Thanks, your profile is set up.", "/dashboard")
    audit(db, user.id, "onboarding.completed", "onboarding", user.id, platform)
    commit_or_conflict(db, lambda: onboarding_out(user).model_dump(mode="json"))
    return onboarding_out(user)


# ---- Dashboard ----------------------------------------------------------------

@router.get("/dashboard", tags=["dashboard"])
def dashboard(user: User = Depends(current_user), db: Session = Depends(get_db)):
    now = utcnow()
    uid = user.id
    open_tasks = db.scalars(select(Task).where(Task.user_id == uid, Task.status == "open")
                            .order_by(Task.due_at.is_(None), Task.due_at)).all()
    nxt = db.scalars(select(Appointment).where(Appointment.user_id == uid, Appointment.starts_at >= now,
                                               Appointment.status.in_(["requested", "scheduled"]))
                     .order_by(Appointment.starts_at).limit(2)).all()
    reports = db.scalars(select(HealthReport).where(HealthReport.user_id == uid)
                         .order_by(HealthReport.released_at.desc()).limit(3)).all()
    plan = db.scalar(select(CarePlan).where(CarePlan.user_id == uid).order_by(CarePlan.approved_at.desc()))
    plan_tasks = db.scalars(select(Task).where(Task.care_plan_id == plan.id)).all() if plan else []
    unread = db.scalar(select(func.count()).select_from(Notification)
                       .where(Notification.user_id == uid, Notification.read_at.is_(None)))
    # Health overview: latest value per biomarker vs its reference range. Counts only, no interpretation.
    latest = {}
    for m in db.scalars(select(Measurement).where(Measurement.user_id == uid).order_by(Measurement.measured_at)):
        latest[m.biomarker_code] = m
    statuses = [range_status(c, m.value) if m.unit == _unit(c) else "not_comparable" for c, m in latest.items()]
    p = user.profile
    return {
        "greeting_name": p.preferred_name or p.first_name,
        "onboarding": {"status": user.onboarding.status, "current_step": user.onboarding.current_step},
        "health_overview": {
            "tracked": len(statuses),
            "within_range": statuses.count("within"),
            "outside_range": statuses.count("above") + statuses.count("below"),
            "other": len(statuses) - statuses.count("within") - statuses.count("above") - statuses.count("below"),
            "last_panel_at": max((m.measured_at for m in latest.values()), default=None),
            "is_synthetic": True,
        },
        "next_appointments": [AppointmentOut.model_validate(a) for a in nxt],
        "tasks": [_task_out(t, now) for t in open_tasks[:5]],
        "open_task_count": len(open_tasks),
        "recent_reports": [ReportOut.model_validate(r) for r in reports],
        "care_plan": {"id": plan.id, "title": plan.title, **_progress(plan_tasks)} if plan else None,
        "unread_notifications": unread,
        "server_time": now,
    }


def _unit(code):
    return BIOMARKERS[code].unit if code in BIOMARKERS else None


def _task_out(t: Task, now) -> TaskOut:
    out = TaskOut.model_validate(t)
    out.overdue = t.status == "open" and t.due_at is not None and t.due_at < now
    return out


def _progress(tasks) -> dict:
    done = sum(t.status == "done" for t in tasks)
    return {"done": done, "total": len(tasks), "percent": round(done / len(tasks) * 100) if tasks else 0}
