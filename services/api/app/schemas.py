import re
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---- Auth -------------------------------------------------------------------

def _strong(pw: str) -> str:
    if len(pw.encode()) > 72:  # bcrypt's limit is bytes, not characters (AUD-18)
        raise ValueError("That password is too long. Use at most 72 characters (fewer with emoji or non-Latin letters).")
    if len(pw) < 10 or not re.search(r"[A-Za-z]", pw) or not re.search(r"\d", pw):
        raise ValueError("Use at least 10 characters including a letter and a number.")
    return pw


Name = Field(min_length=1, max_length=80, pattern=r"^[^<>{}]*$")


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=72)
    first_name: str = Name
    last_name: str = Name

    _pw = field_validator("password")(_strong)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=72)


class RefreshIn(BaseModel):
    refresh_token: str | None = None  # mobile sends it in the body; web uses the httpOnly cookie


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    password: str = Field(max_length=72)

    _pw = field_validator("password")(_strong)


class UserOut(Out):
    id: str
    email: str
    role: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str | None = None  # omitted for web (cookie)
    expires_in: int
    user: UserOut


# ---- Profile ----------------------------------------------------------------

GOALS = ["heart_health", "metabolic_health", "energy", "sleep", "fitness", "weight", "longevity", "stress", "nutrition"]

Lifestyle = dict[str, str | int | float | bool | None]


class ProfileOut(Out):
    first_name: str
    last_name: str
    preferred_name: str | None
    date_of_birth: str | None
    phone: str | None
    postcode: str | None
    health_goals: list[str]
    lifestyle: dict
    history: dict
    notification_prefs: dict
    version: int
    updated_at: datetime
    updated_from: str


class MeOut(BaseModel):
    user: UserOut
    profile: ProfileOut


Phone = Field(default=None, max_length=32, pattern=r"^\+?[0-9 ()-]{6,30}$")
Postcode = Field(default=None, max_length=10, pattern=r"^[A-Za-z0-9 -]{3,10}$")


def _dob(v: str | None) -> str | None:
    if v is None:
        return v
    d = date.fromisoformat(v)
    if d >= date.today() or d.year < 1900:
        raise ValueError("Enter a valid date of birth.")
    return v


class ProfilePatch(BaseModel):
    version: int
    first_name: str | None = Field(default=None, min_length=1, max_length=80, pattern=r"^[^<>{}]*$")
    last_name: str | None = Field(default=None, min_length=1, max_length=80, pattern=r"^[^<>{}]*$")
    preferred_name: str | None = Field(default=None, max_length=80, pattern=r"^[^<>{}]*$")
    date_of_birth: str | None = None
    phone: str | None = Phone
    postcode: str | None = Postcode
    health_goals: list[Literal[*GOALS]] | None = Field(default=None, min_length=1, max_length=5)
    notification_prefs: dict[Literal["appointments", "tasks", "reports"], bool] | None = None

    _dob = field_validator("date_of_birth")(_dob)

    # Omitting a field leaves it unchanged; an explicit null on a required column would 500 or corrupt the profile.
    @field_validator("first_name", "last_name", "health_goals", "notification_prefs")
    @classmethod
    def _not_null(cls, v):
        if v is None:
            raise ValueError("This field can't be empty.")
        return v


# ---- Onboarding -------------------------------------------------------------

class BasicProfileStep(BaseModel):
    preferred_name: str | None = Field(default=None, max_length=80, pattern=r"^[^<>{}]*$")
    date_of_birth: str
    phone: str | None = Phone
    postcode: str = Field(max_length=10, pattern=r"^[A-Za-z0-9 -]{3,10}$")

    _dob = field_validator("date_of_birth")(_dob)


class HealthGoalsStep(BaseModel):
    health_goals: list[Literal[*GOALS]] = Field(min_length=1, max_length=5)


class LifestyleStep(BaseModel):
    activity_days_per_week: int = Field(ge=0, le=7)
    sleep_hours: float = Field(ge=0, le=16)
    diet: Literal["omnivore", "vegetarian", "vegan", "pescatarian", "other"]
    alcohol_drinks_per_week: int = Field(ge=0, le=100)
    smoker: bool


class HistoryStep(BaseModel):
    family_history: list[Literal["heart_disease", "diabetes", "cancer", "stroke", "none", "unsure"]] = Field(max_length=6)
    conditions_note: str | None = Field(default=None, max_length=500)
    takes_medication: bool


STEP_MODELS = {"basic_profile": BasicProfileStep, "health_goals": HealthGoalsStep,
               "lifestyle": LifestyleStep, "history": HistoryStep}


class StepIn(BaseModel):
    version: int
    data: dict = Field(default_factory=dict)


class OnboardingOut(BaseModel):
    steps: list[str]
    current_step: str
    completed_steps: list[str]
    status: str
    version: int
    last_platform: str
    updated_at: datetime
    answers: dict  # read from the profile, the single source of truth


class CompleteIn(BaseModel):
    version: int


# ---- Health -----------------------------------------------------------------

class BiomarkerSummary(BaseModel):
    code: str
    name: str
    category: str
    unit: str
    ref_low: float | None
    ref_high: float | None
    latest_value: float | None
    latest_unit: str | None
    latest_at: datetime | None
    status: str
    count: int


class PointOut(BaseModel):
    id: str
    biomarker_code: str
    value: float | None
    unit: str
    measured_at: datetime
    source: str
    is_synthetic: bool
    status: str
    report_id: str | None


class SeriesOut(BaseModel):
    code: str
    name: str
    category: str
    unit: str
    about: str
    ref_low: float | None
    ref_high: float | None
    points: list[PointOut]
    trend: dict
    disclaimer: str


class ReportOut(Out):
    id: str
    title: str
    summary: str
    reviewed_by: str
    source: str
    is_synthetic: bool
    released_at: datetime


class ReportDetail(ReportOut):
    measurements: list[PointOut]
    biomarker_names: dict[str, str]


# ---- Tasks / care plan --------------------------------------------------------

class TaskOut(Out):
    id: str
    kind: str
    title: str
    detail: str | None
    link: str | None
    status: str
    due_at: datetime | None
    completed_at: datetime | None
    completed_from: str | None
    care_plan_id: str | None
    appointment_id: str | None
    version: int
    updated_at: datetime
    overdue: bool = False


class TaskPatch(BaseModel):
    status: Literal["open", "done"]


class CarePlanOut(BaseModel):
    id: str
    title: str
    approved_by: str
    approved_at: datetime
    review_at: datetime | None
    goals: list[dict]
    is_synthetic: bool
    tasks: list[TaskOut]
    progress: dict
    disclaimer: str


# ---- Appointments -------------------------------------------------------------

APPT_TYPES = {
    "gp_review": ("Results review with a doctor", "Dr. Alex Morgan (fictional)", 30, "Video call (demo)"),
    "blood_test": ("Blood collection", "Collection centre (fictional)", 15, "12 Example Street, Sampletown (demo)"),
    "health_coach": ("Health coaching session", "Sam Rivera, health coach (fictional)", 45, "Video call (demo)"),
}


class AppointmentOut(Out):
    id: str
    type: str
    title: str
    practitioner: str
    location: str
    starts_at: datetime
    duration_min: int
    status: str
    is_demo: bool
    prep_notes: list[str]
    version: int
    updated_at: datetime


class AppointmentsOut(BaseModel):
    upcoming: list[AppointmentOut]
    past: list[AppointmentOut]
    demo_notice: str


class AppointmentIn(BaseModel):
    type: Literal[*APPT_TYPES]
    starts_at: datetime
    client_request_id: str = Field(min_length=8, max_length=64)


class RescheduleIn(BaseModel):
    starts_at: datetime
    version: int


class SlotOut(BaseModel):
    starts_at: datetime
    type: str


# ---- Notifications ------------------------------------------------------------

class NotificationOut(Out):
    id: str
    kind: str
    title: str
    body: str
    link: str | None
    read_at: datetime | None
    created_at: datetime


class NotificationsOut(BaseModel):
    items: list[NotificationOut]
    unread: int
    total: int


# ---- Assistant ----------------------------------------------------------------

class AskIn(BaseModel):
    message: str = Field(min_length=1, max_length=500)


class AskOut(BaseModel):
    answer: str
    kind: Literal["navigation", "education", "fallback", "safety"]
    links: list[dict]
    disclaimer: str
    provider: str
