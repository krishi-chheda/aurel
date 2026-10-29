from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db, utcnow
from ..demo import notify
from ..models import Appointment, Task, User
from ..schemas import APPT_TYPES, AppointmentIn, AppointmentOut, AppointmentsOut, RescheduleIn, SlotOut
from ..security import audit, current_user, platform_of
from .me import commit_or_conflict, conflict

router = APIRouter(prefix="/appointments", tags=["appointments"])

DEMO_NOTICE = ("Demonstration booking. No real healthcare provider is contacted and no appointment is confirmed "
               "with a real clinic.")
PREP = {
    "gp_review": ["Have your latest report open.", "Write down any questions beforehand."],
    "blood_test": ["Fast for 10 hours beforehand (water is fine).", "Bring photo ID."],
    "health_coach": ["Think about one habit you'd like to work on."],
}


def _get(db: Session, user: User, appt_id: str) -> Appointment:
    a = db.scalar(select(Appointment).where(Appointment.id == appt_id, Appointment.user_id == user.id))
    if not a:
        raise HTTPException(404, {"code": "not_found", "message": "Not found."})
    return a


def _slots(now):
    """Deterministic demo availability: weekdays over the next 14 days at 09:00, 11:30 and 15:00 UTC."""
    day0 = now.replace(hour=0, minute=0, second=0, microsecond=0)
    for d in range(1, 15):
        day = day0 + timedelta(days=d)
        if day.weekday() < 5:
            for h, m in ((9, 0), (11, 30), (15, 0)):
                yield day + timedelta(hours=h, minutes=m)


def _taken(db: Session, user: User) -> set:
    return set(db.scalars(select(Appointment.starts_at).where(Appointment.user_id == user.id,
                                                              Appointment.status.in_(["requested", "scheduled"]))))


def _slot_unavailable() -> HTTPException:
    return HTTPException(422, {"code": "slot_unavailable", "message": "That time is not available. Choose another slot."})


def _check_slot(starts_at, now, taken: set):
    if starts_at not in set(_slots(now)) or starts_at in taken:
        raise _slot_unavailable()


@router.get("", response_model=AppointmentsOut)
def list_appointments(user: User = Depends(current_user), db: Session = Depends(get_db)):
    now = utcnow()
    rows = db.scalars(select(Appointment).where(Appointment.user_id == user.id).order_by(Appointment.starts_at)).all()
    upcoming = [a for a in rows if a.starts_at >= now and a.status in ("requested", "scheduled")]
    past = [a for a in reversed(rows) if a not in upcoming]
    return AppointmentsOut(upcoming=upcoming, past=past, demo_notice=DEMO_NOTICE)


@router.get("/slots", response_model=list[SlotOut])
def slots(type: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if type not in APPT_TYPES:
        raise HTTPException(422, {"code": "invalid_type", "message": "Unknown appointment type."})
    taken = _taken(db, user)
    return [SlotOut(starts_at=s, type=type) for s in _slots(utcnow()) if s not in taken]


@router.get("/{appt_id}", response_model=AppointmentOut)
def get_appointment(appt_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _get(db, user, appt_id)


@router.post("", response_model=AppointmentOut, status_code=201)
def request_appointment(body: AppointmentIn, response: Response, user: User = Depends(current_user),
                        db: Session = Depends(get_db), platform: str = Depends(platform_of)):
    existing = db.scalar(select(Appointment).where(Appointment.user_id == user.id,
                                                   Appointment.client_request_id == body.client_request_id))
    if existing:  # retried request: return the original instead of booking twice
        response.status_code = 200
        return existing
    _check_slot(body.starts_at, utcnow(), _taken(db, user))
    title, practitioner, duration, location = APPT_TYPES[body.type]
    a = Appointment(user_id=user.id, type=body.type, title=title, practitioner=practitioner, location=location,
                    duration_min=duration, starts_at=body.starts_at, status="requested",
                    prep_notes=PREP[body.type], client_request_id=body.client_request_id)
    db.add(a)
    try:
        db.flush()
    except IntegrityError:
        # A simultaneous request with the same key won the race (AUD-11): the unique constraint stopped the
        # duplicate, so answer this retry with the original booking rather than a 500.
        db.rollback()
        existing = db.scalar(select(Appointment).where(Appointment.user_id == user.id,
                                                       Appointment.client_request_id == body.client_request_id))
        if not existing:  # different key, same slot: uq_appointments_active_slot stopped a double booking (AUD-19)
            raise _slot_unavailable()
        response.status_code = 200
        return existing
    db.add(Task(user_id=user.id, appointment_id=a.id, kind="appointment_prep", title=f"Prepare for: {title}",
                detail="Review the preparation notes for this demo appointment.", link=f"/appointments/{a.id}",
                due_at=a.starts_at))
    notify(db, user.id, "appointment", "Booking request received (demo)",
           f"{title} requested. This is a simulated booking.", f"/appointments/{a.id}",
           "Your appointment request was received.")
    audit(db, user.id, "appointment.request", "appointment", a.id, platform, type=body.type)
    db.commit()
    return a


@router.post("/{appt_id}/cancel", response_model=AppointmentOut)
def cancel(appt_id: str, user: User = Depends(current_user), db: Session = Depends(get_db),
           platform: str = Depends(platform_of)):
    a = _get(db, user, appt_id)
    if a.status == "cancelled":
        return a
    if a.status == "completed" or a.starts_at < utcnow():
        raise HTTPException(422, {"code": "not_cancellable", "message": "Past appointments can't be cancelled."})
    a.status = "cancelled"
    for t in db.scalars(select(Task).where(Task.appointment_id == a.id, Task.status == "open")):
        db.delete(t)
    notify(db, user.id, "appointment", "Appointment cancelled (demo)", f"{a.title} was cancelled.",
           f"/appointments/{a.id}", "An appointment was updated.")
    audit(db, user.id, "appointment.cancel", "appointment", a.id, platform)
    commit_or_conflict(db, lambda: AppointmentOut.model_validate(a).model_dump(mode="json"))
    return a


@router.post("/{appt_id}/reschedule", response_model=AppointmentOut)
def reschedule(appt_id: str, body: RescheduleIn, user: User = Depends(current_user), db: Session = Depends(get_db),
               platform: str = Depends(platform_of)):
    a = _get(db, user, appt_id)
    if a.version != body.version:
        if a.starts_at == body.starts_at:
            return a
        raise conflict(AppointmentOut.model_validate(a).model_dump(mode="json"))
    if a.status not in ("requested", "scheduled"):
        raise HTTPException(422, {"code": "not_reschedulable", "message": "This appointment can't be rescheduled."})
    _check_slot(body.starts_at, utcnow(), _taken(db, user) - {a.starts_at})
    a.starts_at, a.status = body.starts_at, "requested"
    for t in db.scalars(select(Task).where(Task.appointment_id == a.id)):
        t.due_at = a.starts_at
    notify(db, user.id, "appointment", "Reschedule requested (demo)", f"{a.title} moved to a new time.",
           f"/appointments/{a.id}", "An appointment was updated.")
    audit(db, user.id, "appointment.reschedule", "appointment", a.id, platform)
    try:
        commit_or_conflict(db, lambda: AppointmentOut.model_validate(a).model_dump(mode="json"))
    except IntegrityError:  # another booking took that time concurrently (AUD-19)
        db.rollback()
        raise _slot_unavailable()
    return a
