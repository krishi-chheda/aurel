import uuid

from sqlalchemy import JSON, Boolean, CheckConstraint, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base, UTCDateTime, utcnow


def new_id() -> str:
    return str(uuid.uuid4())


ROLES = ("customer", "coordinator", "admin")
PLATFORMS = ("web", "ios", "android", "unknown")


class Timestamped:
    created_at = mapped_column(UTCDateTime, default=utcnow, nullable=False)
    updated_at = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow, nullable=False)


class User(Timestamped, Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint(f"role IN {ROLES}", name="ck_users_role"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(20), default="customer")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    deactivated_at = mapped_column(UTCDateTime, nullable=True)

    profile: Mapped["Profile"] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")
    onboarding: Mapped["OnboardingSession"] = relationship(uselist=False, cascade="all, delete-orphan")


class Profile(Timestamped, Base):
    """Single source of truth for profile + onboarding answers. Onboarding steps write here."""

    __tablename__ = "profiles"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    first_name: Mapped[str] = mapped_column(String(80))
    last_name: Mapped[str] = mapped_column(String(80))
    preferred_name: Mapped[str | None] = mapped_column(String(80))
    date_of_birth: Mapped[str | None] = mapped_column(String(10))  # ISO date
    phone: Mapped[str | None] = mapped_column(String(32))
    postcode: Mapped[str | None] = mapped_column(String(10))
    health_goals: Mapped[list] = mapped_column(JSON, default=list)
    lifestyle: Mapped[dict] = mapped_column(JSON, default=dict)
    history: Mapped[dict] = mapped_column(JSON, default=dict)
    notification_prefs: Mapped[dict] = mapped_column(JSON, default=dict)
    version: Mapped[int] = mapped_column(Integer, default=1)
    # The ORM adds "WHERE version = :loaded" to every UPDATE and bumps it, so a concurrent write is detected
    # atomically (StaleDataError -> 409) instead of last-write-wins. (AUD-10)
    __mapper_args__ = {"version_id_col": version}
    updated_from: Mapped[str] = mapped_column(String(10), default="unknown")

    user: Mapped[User] = relationship(back_populates="profile")


class RefreshSession(Base):
    __tablename__ = "refresh_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    platform: Mapped[str] = mapped_column(String(10), default="unknown")
    created_at = mapped_column(UTCDateTime, default=utcnow, nullable=False)
    last_used_at = mapped_column(UTCDateTime, default=utcnow, nullable=False)
    expires_at = mapped_column(UTCDateTime, nullable=False)
    revoked_at = mapped_column(UTCDateTime, nullable=True)
    # Set when this token was rotated; reuse of a rotated token revokes the whole family.
    replaced_by: Mapped[str | None] = mapped_column(String(36))


class PasswordReset(Base):
    __tablename__ = "password_resets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at = mapped_column(UTCDateTime, nullable=False)
    used_at = mapped_column(UTCDateTime, nullable=True)
    created_at = mapped_column(UTCDateTime, default=utcnow, nullable=False)


class OnboardingSession(Base):
    __tablename__ = "onboarding_sessions"
    __table_args__ = (CheckConstraint("status IN ('in_progress','completed')", name="ck_onboarding_status"),)

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    current_step: Mapped[str] = mapped_column(String(30), default="welcome")
    completed_steps: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), default="in_progress")
    version: Mapped[int] = mapped_column(Integer, default=1)
    # The ORM adds "WHERE version = :loaded" to every UPDATE and bumps it, so a concurrent write is detected
    # atomically (StaleDataError -> 409) instead of last-write-wins. (AUD-10)
    __mapper_args__ = {"version_id_col": version}
    last_platform: Mapped[str] = mapped_column(String(10), default="unknown")
    started_at = mapped_column(UTCDateTime, default=utcnow, nullable=False)
    updated_at = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow, nullable=False)
    completed_at = mapped_column(UTCDateTime, nullable=True)


class HealthReport(Base):
    __tablename__ = "health_reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    summary: Mapped[str] = mapped_column(Text)
    reviewed_by: Mapped[str] = mapped_column(String(120))
    source: Mapped[str] = mapped_column(String(120))
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=True)
    released_at = mapped_column(UTCDateTime, nullable=False)


class Measurement(Base):
    __tablename__ = "measurements"
    __table_args__ = (Index("ix_measurements_user_code_time", "user_id", "biomarker_code", "measured_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    report_id: Mapped[str | None] = mapped_column(ForeignKey("health_reports.id", ondelete="SET NULL"))
    biomarker_code: Mapped[str] = mapped_column(String(40))
    value: Mapped[float | None] = mapped_column(Float)  # None = result unavailable / invalid sample
    unit: Mapped[str] = mapped_column(String(20))
    source: Mapped[str] = mapped_column(String(120))
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=True)
    measured_at = mapped_column(UTCDateTime, nullable=False)


class CarePlan(Base):
    __tablename__ = "care_plans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    approved_by: Mapped[str] = mapped_column(String(120))
    approved_at = mapped_column(UTCDateTime, nullable=False)
    review_at = mapped_column(UTCDateTime, nullable=True)
    goals: Mapped[list] = mapped_column(JSON, default=list)  # [{title, detail}] predefined, clinician-approved (fictional)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=True)


TASK_KINDS = ("profile", "report_review", "appointment_prep", "check_in", "milestone", "care_action")


class Task(Timestamped, Base):
    """Reusable cross-device task. Either platform can complete it; server is the source of truth."""

    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint("status IN ('open','done')", name="ck_tasks_status"),
        CheckConstraint(f"kind IN {TASK_KINDS}", name="ck_tasks_kind"),
        Index("ix_tasks_user_status", "user_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    care_plan_id: Mapped[str | None] = mapped_column(ForeignKey("care_plans.id", ondelete="CASCADE"))
    appointment_id: Mapped[str | None] = mapped_column(ForeignKey("appointments.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(160))
    detail: Mapped[str | None] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(String(200))  # in-app route, e.g. /health/reports/<id>
    status: Mapped[str] = mapped_column(String(10), default="open")
    due_at = mapped_column(UTCDateTime, nullable=True)
    completed_at = mapped_column(UTCDateTime, nullable=True)
    completed_from: Mapped[str | None] = mapped_column(String(10))
    version: Mapped[int] = mapped_column(Integer, default=1)


APPOINTMENT_STATUSES = ("requested", "scheduled", "cancelled", "completed")
ACTIVE_APPOINTMENT = "status IN ('requested', 'scheduled')"


class Appointment(Timestamped, Base):
    __tablename__ = "appointments"
    __table_args__ = (
        CheckConstraint(f"status IN {APPOINTMENT_STATUSES}", name="ck_appointments_status"),
        UniqueConstraint("user_id", "client_request_id", name="uq_appointments_client_request"),
        Index("ix_appointments_user_start", "user_id", "starts_at"),
        # One active booking per user per time; the app-level check alone races under concurrency (AUD-19).
        Index("uq_appointments_active_slot", "user_id", "starts_at", unique=True,
              sqlite_where=text(ACTIVE_APPOINTMENT), postgresql_where=text(ACTIVE_APPOINTMENT)),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(160))
    practitioner: Mapped[str] = mapped_column(String(120))
    location: Mapped[str] = mapped_column(String(160))
    starts_at = mapped_column(UTCDateTime, nullable=False)
    duration_min: Mapped[int] = mapped_column(Integer, default=30)
    status: Mapped[str] = mapped_column(String(12), default="requested")
    # Every appointment in this prototype is a simulation; no real provider is contacted.
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)
    prep_notes: Mapped[list] = mapped_column(JSON, default=list)
    client_request_id: Mapped[str | None] = mapped_column(String(64))  # idempotency key for retries
    version: Mapped[int] = mapped_column(Integer, default=1)
    # The ORM adds "WHERE version = :loaded" to every UPDATE and bumps it, so a concurrent write is detected
    # atomically (StaleDataError -> 409) instead of last-write-wins. (AUD-10)
    __mapper_args__ = {"version_id_col": version}


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_user_created", "user_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(30))
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(String(400))
    # Generic text safe for a lock screen; never contains results or diagnoses.
    push_text: Mapped[str] = mapped_column(String(120))
    link: Mapped[str | None] = mapped_column(String(200))
    read_at = mapped_column(UTCDateTime, nullable=True)
    created_at = mapped_column(UTCDateTime, default=utcnow, nullable=False)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (Index("ix_audit_created", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    actor_id: Mapped[str | None] = mapped_column(String(36), index=True)
    action: Mapped[str] = mapped_column(String(60))
    target_type: Mapped[str | None] = mapped_column(String(40))
    target_id: Mapped[str | None] = mapped_column(String(36))
    platform: Mapped[str] = mapped_column(String(10), default="unknown")
    meta: Mapped[dict] = mapped_column(JSON, default=dict)  # never health values
    created_at = mapped_column(UTCDateTime, default=utcnow, nullable=False)
