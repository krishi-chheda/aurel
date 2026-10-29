"""Deterministic business rules shared by every client. Clients render what these return; they don't re-implement them."""

from dataclasses import dataclass
from datetime import datetime, timedelta

# ---- Onboarding -------------------------------------------------------------

ONBOARDING_STEPS = ["welcome", "basic_profile", "health_goals", "lifestyle", "history", "review", "complete"]
# Steps that must be saved before onboarding can be completed.
REQUIRED_STEPS = ["basic_profile", "health_goals", "lifestyle", "history"]


def next_step(step: str) -> str:
    i = ONBOARDING_STEPS.index(step)
    return ONBOARDING_STEPS[min(i + 1, len(ONBOARDING_STEPS) - 1)]


def advance(current: str, saved: str) -> str:
    """Saving an earlier step (an edit) never moves the user backwards."""
    nxt = next_step(saved)
    return nxt if ONBOARDING_STEPS.index(nxt) > ONBOARDING_STEPS.index(current) else current


# ---- Biomarkers -------------------------------------------------------------
# Synthetic catalogue for the prototype. Reference ranges are illustrative only, not clinical guidance.

@dataclass(frozen=True)
class Biomarker:
    code: str
    name: str
    category: str
    unit: str
    ref_low: float | None
    ref_high: float | None
    about: str


BIOMARKERS = {b.code: b for b in [
    Biomarker("ldl", "LDL cholesterol", "Heart", "mmol/L", None, 3.0,
              "A type of cholesterol carried in the blood. Often reviewed as part of cardiovascular risk."),
    Biomarker("hdl", "HDL cholesterol", "Heart", "mmol/L", 1.0, None,
              "A type of cholesterol carried in the blood, reported alongside LDL."),
    Biomarker("apob", "Apolipoprotein B", "Heart", "g/L", None, 1.0,
              "A protein found on cholesterol-carrying particles."),
    Biomarker("hba1c", "HbA1c", "Metabolic", "%", 4.0, 5.9,
              "Reflects average blood glucose over roughly the previous three months."),
    Biomarker("glucose", "Fasting glucose", "Metabolic", "mmol/L", 3.6, 6.0,
              "Blood glucose measured after fasting."),
    Biomarker("crp", "hs-CRP", "Inflammation", "mg/L", None, 3.0,
              "A general marker of inflammation in the body."),
    Biomarker("vitd", "Vitamin D", "Nutrients", "nmol/L", 50, 150,
              "Vitamin D level. Can be reported in nmol/L or ng/mL depending on the laboratory."),
    Biomarker("ferritin", "Ferritin", "Nutrients", "µg/L", 30, 300,
              "A protein that stores iron."),
    Biomarker("tsh", "TSH", "Hormones", "mIU/L", 0.4, 4.0,
              "Thyroid-stimulating hormone."),
    Biomarker("egfr", "eGFR", "Kidney", "mL/min/1.73m²", 90, None,
              "An estimate of kidney filtration rate."),
]}


def range_status(code: str, value: float | None) -> str:
    """'unavailable' | 'below' | 'within' | 'above' | 'no_range'. Purely numeric comparison, not an interpretation."""
    b = BIOMARKERS.get(code)
    if value is None:
        return "unavailable"
    if not b or (b.ref_low is None and b.ref_high is None):
        return "no_range"
    if b.ref_low is not None and value < b.ref_low:
        return "below"
    if b.ref_high is not None and value > b.ref_high:
        return "above"
    return "within"


STABLE_PCT = 5.0


def trend(code: str, points: list[tuple[datetime, float | None, str]]) -> dict:
    """points: (measured_at, value, unit), ordered by time. Returns a trend only when it can be computed safely."""
    b = BIOMARKERS.get(code)
    valid = [p for p in points if p[1] is not None]
    excluded = len(points) - len(valid)
    base = {"comparable": False, "direction": None, "change": None, "change_pct": None,
            "excluded_points": excluded, "reason": None}
    if len(valid) < 2:
        return {**base, "reason": "At least two valid results are needed to show a trend."}
    units = {p[2] for p in valid}
    if len(units) > 1 or (b and b.unit not in units):
        return {**base, "reason": f"Results were reported in different units ({', '.join(sorted(units))}). "
                                  "They are not converted automatically, so a trend is not calculated."}
    first, last = valid[0][1], valid[-1][1]
    change = round(last - first, 3)
    pct = round(change / first * 100, 1) if first else None
    direction = "stable" if pct is not None and abs(pct) < STABLE_PCT else ("up" if change > 0 else "down" if change < 0 else "stable")
    return {**base, "comparable": True, "direction": direction, "change": change, "change_pct": pct}


# ---- Operational workflow rules (admin dashboard) --------------------------

ONBOARDING_STALL_DAYS = 3
APPOINTMENT_REQUEST_SLA_HOURS = 48


def journey_stage(onboarding_status: str, has_report: bool, has_upcoming: bool, has_plan: bool) -> str:
    if onboarding_status != "completed":
        return "onboarding"
    if not has_report:
        return "awaiting_results"
    if not has_plan:
        return "awaiting_care_plan"
    return "active_care" if has_upcoming else "maintenance"


def customer_flags(*, now: datetime, onboarding_status: str, onboarding_updated: datetime, missing_fields: list[str],
                   overdue_tasks: int, pending_requests: list[datetime]) -> list[dict]:
    """Deterministic escalation flags; each names the rule that raised it."""
    flags = []
    if onboarding_status != "completed" and now - onboarding_updated > timedelta(days=ONBOARDING_STALL_DAYS):
        flags.append({"rule": "onboarding_stalled", "severity": "medium",
                      "message": f"Onboarding inactive for more than {ONBOARDING_STALL_DAYS} days"})
    if missing_fields:
        flags.append({"rule": "missing_information", "severity": "low",
                      "message": "Missing: " + ", ".join(missing_fields)})
    if overdue_tasks:
        flags.append({"rule": "overdue_tasks", "severity": "medium" if overdue_tasks < 3 else "high",
                      "message": f"{overdue_tasks} overdue task(s)"})
    stale = [r for r in pending_requests if now - r > timedelta(hours=APPOINTMENT_REQUEST_SLA_HOURS)]
    if stale:
        flags.append({"rule": "appointment_request_sla", "severity": "high",
                      "message": f"{len(stale)} appointment request(s) waiting more than {APPOINTMENT_REQUEST_SLA_HOURS}h"})
    return flags


PROFILE_REQUIRED = {"date_of_birth": "date of birth", "phone": "phone", "postcode": "postcode"}
