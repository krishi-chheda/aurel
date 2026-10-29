from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db, utcnow
from ..models import CarePlan, Task, User
from ..schemas import CarePlanOut, TaskOut, TaskPatch
from ..security import audit, current_user, platform_of
from .me import _progress, _task_out

router = APIRouter(tags=["care"])

PLAN_DISCLAIMER = ("This plan contains fictional, predefined recommendations approved by a fictional clinician. "
                   "The app never creates or changes clinical recommendations.")


@router.get("/care-plan", response_model=CarePlanOut | None)
def care_plan(user: User = Depends(current_user), db: Session = Depends(get_db)):
    plan = db.scalar(select(CarePlan).where(CarePlan.user_id == user.id).order_by(CarePlan.approved_at.desc()))
    if not plan:
        return None
    now = utcnow()
    tasks = db.scalars(select(Task).where(Task.care_plan_id == plan.id, Task.user_id == user.id)
                       .order_by(Task.status, Task.due_at.is_(None), Task.due_at)).all()
    return CarePlanOut(id=plan.id, title=plan.title, approved_by=plan.approved_by, approved_at=plan.approved_at,
                       review_at=plan.review_at, goals=plan.goals, is_synthetic=plan.is_synthetic,
                       tasks=[_task_out(t, now) for t in tasks], progress=_progress(tasks), disclaimer=PLAN_DISCLAIMER)


@router.get("/tasks", response_model=list[TaskOut])
def tasks(status: Literal["open", "done", "all"] = "open", user: User = Depends(current_user),
          db: Session = Depends(get_db)):
    q = select(Task).where(Task.user_id == user.id)
    if status != "all":
        q = q.where(Task.status == status)
    now = utcnow()
    return [_task_out(t, now) for t in db.scalars(q.order_by(Task.due_at.is_(None), Task.due_at))]


@router.patch("/tasks/{task_id}", response_model=TaskOut)
def update_task(task_id: str, body: TaskPatch, user: User = Depends(current_user), db: Session = Depends(get_db),
                platform: str = Depends(platform_of)):
    t = db.scalar(select(Task).where(Task.id == task_id, Task.user_id == user.id))
    if not t:
        raise HTTPException(404, {"code": "not_found", "message": "Not found."})
    if t.kind == "profile" and body.status == "done" and user.onboarding.status != "completed":
        raise HTTPException(422, {"code": "task_requires_onboarding",
                                  "message": "This task completes automatically when onboarding is finished."})
    # Setting the status the task already has is a no-op, so retries and double taps are safe.
    if t.status != body.status:
        t.status = body.status
        t.completed_at = utcnow() if body.status == "done" else None
        t.completed_from = platform if body.status == "done" else None
        t.version += 1
        audit(db, user.id, f"task.{body.status}", "task", t.id, platform, kind=t.kind)
        db.commit()
    return _task_out(t, utcnow())
