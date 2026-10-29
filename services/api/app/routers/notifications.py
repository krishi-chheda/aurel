from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from ..db import get_db, utcnow
from ..models import Notification, User
from ..schemas import NotificationOut, NotificationsOut
from ..security import current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationsOut)
def list_notifications(limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0),
                       user: User = Depends(current_user), db: Session = Depends(get_db)):
    base = select(Notification).where(Notification.user_id == user.id)
    items = db.scalars(base.order_by(Notification.created_at.desc()).limit(limit).offset(offset)).all()
    count = lambda q: db.scalar(select(func.count()).select_from(q.subquery()))  # noqa: E731
    return NotificationsOut(items=items, total=count(base), unread=count(base.where(Notification.read_at.is_(None))))


@router.post("/{notification_id}/read", response_model=NotificationOut)
def mark_read(notification_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    n = db.scalar(select(Notification).where(Notification.id == notification_id, Notification.user_id == user.id))
    if not n:
        raise HTTPException(404, {"code": "not_found", "message": "Not found."})
    if not n.read_at:
        n.read_at = utcnow()
        db.commit()
    return n


@router.post("/read-all", status_code=204)
def mark_all_read(user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.execute(update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
               .values(read_at=utcnow()))
    db.commit()
