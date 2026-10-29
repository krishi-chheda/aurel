"""Operational dashboard over synthetic customers. Exposes workflow state only - never measurements or report contents."""

from collections import Counter

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db, utcnow
from ..models import Appointment, AuditEvent, CarePlan, HealthReport, Task, User
from ..rules import PROFILE_REQUIRED, customer_flags, journey_stage
from ..security import audit, platform_of, require_role

router = APIRouter(prefix="/admin", tags=["admin"])
staff = require_role("coordinator", "admin")


def _customers(db: Session, user: User):
    now = utcnow()
    users = db.scalars(select(User).where(User.role == "customer", User.is_active.is_(True))
                       .options(selectinload(User.profile), selectinload(User.onboarding))
                       .order_by(User.created_at)).all()
    ids = [u.id for u in users]
    tasks = db.scalars(select(Task).where(Task.user_id.in_(ids), Task.status == "open")).all()
    appts = db.scalars(select(Appointment).where(Appointment.user_id.in_(ids))).all()
    with_report = set(db.scalars(select(HealthReport.user_id).where(HealthReport.user_id.in_(ids))))
    with_plan = set(db.scalars(select(CarePlan.user_id).where(CarePlan.user_id.in_(ids))))
    rows = []
    for u in users:
        mine = [t for t in tasks if t.user_id == u.id]
        overdue = [t for t in mine if t.due_at and t.due_at < now]
        my_appts = [a for a in appts if a.user_id == u.id]
        pending = [a for a in my_appts if a.status == "requested" and a.starts_at >= now]
        upcoming = [a for a in my_appts if a.status in ("requested", "scheduled") and a.starts_at >= now]
        missing = [label for f, label in PROFILE_REQUIRED.items() if not getattr(u.profile, f)]
        o = u.onboarding
        row = {
            "id": u.id,
            "name": f"{u.profile.first_name} {u.profile.last_name}",
            "stage": journey_stage(o.status, u.id in with_report, bool(upcoming), u.id in with_plan),
            "onboarding": {"status": o.status, "current_step": o.current_step, "last_platform": o.last_platform,
                           "updated_at": o.updated_at},
            "open_tasks": len(mine),
            "overdue_tasks": len(overdue),
            "missing_information": missing,
            "appointment_status": Counter(a.status for a in my_appts),
            "flags": customer_flags(now=now, onboarding_status=o.status, onboarding_updated=o.updated_at,
                                    missing_fields=missing, overdue_tasks=len(overdue),
                                    pending_requests=[a.created_at for a in pending]),
        }
        if user.role == "admin":  # coordinators work from names and workflow state; contact details are admin-only
            row["email"] = u.email
        rows.append(row)
    return rows


@router.get("/customers")
def customers(stage: str | None = None, flagged: bool = False, limit: int = Query(50, ge=1, le=200),
              offset: int = Query(0, ge=0),
              user: User = Depends(staff), db: Session = Depends(get_db), platform: str = Depends(platform_of)):
    rows = _customers(db, user)
    if stage:
        rows = [r for r in rows if r["stage"] == stage]
    if flagged:
        rows = [r for r in rows if r["flags"]]
    audit(db, user.id, "admin.customers_viewed", platform=platform, count=len(rows))
    db.commit()
    return {"items": rows[offset:offset + limit], "total": len(rows), "is_synthetic": True}


@router.get("/overview")
def overview(user: User = Depends(staff), db: Session = Depends(get_db)):
    rows = _customers(db, user)
    flags = Counter(f["rule"] for r in rows for f in r["flags"])
    completed = [r for r in rows if r["onboarding"]["status"] == "completed"]
    return {
        "is_synthetic": True,
        "note": "Computed live from synthetic demo records. These are not real business results.",
        "customers": len(rows),
        "by_stage": Counter(r["stage"] for r in rows),
        "onboarding_completion_rate": round(len(completed) / len(rows) * 100) if rows else 0,
        "open_tasks": sum(r["open_tasks"] for r in rows),
        "overdue_tasks": sum(r["overdue_tasks"] for r in rows),
        "customers_missing_information": sum(bool(r["missing_information"]) for r in rows),
        "pending_appointment_requests": sum(r["appointment_status"].get("requested", 0) for r in rows),
        "flags_by_rule": flags,
        "cross_device_onboarding": Counter(r["onboarding"]["last_platform"] for r in rows),
    }


@router.get("/audit")
def audit_log(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), user: User = Depends(require_role("admin")),
              db: Session = Depends(get_db)):
    rows = db.scalars(select(AuditEvent).order_by(AuditEvent.created_at.desc()).limit(limit).offset(offset)).all()
    return [{"id": e.id, "actor_id": e.actor_id, "action": e.action, "target_type": e.target_type,
             "target_id": e.target_id, "platform": e.platform, "created_at": e.created_at} for e in rows]
