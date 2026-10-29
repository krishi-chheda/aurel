from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import AwareDatetime
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Appointment, CarePlan, HealthReport, Measurement, Task, User
from ..rules import BIOMARKERS, range_status, trend
from ..schemas import APPT_TYPES
from ..schemas import BiomarkerSummary, PointOut, ReportDetail, ReportOut, SeriesOut
from ..security import current_user

router = APIRouter(tags=["health"])

DISCLAIMER = ("Synthetic demonstration data. Reference ranges are illustrative. This view does not diagnose, "
              "interpret or give medical advice - discuss results with a qualified clinician.")
NOT_FOUND = HTTPException(404, {"code": "not_found", "message": "Not found."})


def _point(m: Measurement) -> PointOut:
    b = BIOMARKERS.get(m.biomarker_code)
    status = range_status(m.biomarker_code, m.value) if (b and m.unit == b.unit) else (
        "unavailable" if m.value is None else "not_comparable")
    return PointOut(id=m.id, biomarker_code=m.biomarker_code, value=m.value, unit=m.unit, measured_at=m.measured_at, source=m.source,
                    is_synthetic=m.is_synthetic, status=status, report_id=m.report_id)


@router.get("/health/biomarkers", response_model=list[BiomarkerSummary])
def biomarkers(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Measurement).where(Measurement.user_id == user.id).order_by(Measurement.measured_at)).all()
    by_code: dict[str, list[Measurement]] = {}
    for m in rows:
        by_code.setdefault(m.biomarker_code, []).append(m)
    out = []
    for code, b in BIOMARKERS.items():
        ms = by_code.get(code, [])
        last = ms[-1] if ms else None
        out.append(BiomarkerSummary(code=code, name=b.name, category=b.category, unit=b.unit, ref_low=b.ref_low,
                                    ref_high=b.ref_high, count=len(ms),
                                    latest_value=last.value if last else None, latest_unit=last.unit if last else None,
                                    latest_at=last.measured_at if last else None,
                                    status=_point(last).status if last else "no_data"))
    return out


@router.get("/health/biomarkers/{code}", response_model=SeriesOut)
def series(code: str, start: AwareDatetime | None = Query(None, alias="from"), end: AwareDatetime | None = Query(None, alias="to"),
           user: User = Depends(current_user), db: Session = Depends(get_db)):
    b = BIOMARKERS.get(code)
    if not b:
        raise NOT_FOUND
    if start and end and start > end:
        raise HTTPException(422, {"code": "invalid_range", "message": "The start date must be before the end date."})
    q = select(Measurement).where(Measurement.user_id == user.id, Measurement.biomarker_code == code)
    if start:
        q = q.where(Measurement.measured_at >= start)
    if end:
        q = q.where(Measurement.measured_at <= end)
    ms = db.scalars(q.order_by(Measurement.measured_at)).all()
    return SeriesOut(code=code, name=b.name, category=b.category, unit=b.unit, about=b.about, ref_low=b.ref_low,
                     ref_high=b.ref_high, points=[_point(m) for m in ms],
                     trend=trend(code, [(m.measured_at, m.value, m.unit) for m in ms]), disclaimer=DISCLAIMER)


@router.get("/reports", response_model=list[ReportOut], tags=["reports"])
def reports(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(select(HealthReport).where(HealthReport.user_id == user.id)
                      .order_by(HealthReport.released_at.desc())).all()


@router.get("/reports/{report_id}", response_model=ReportDetail, tags=["reports"])
def report(report_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    # Ownership is part of the query: another user's id is indistinguishable from a missing one.
    r = db.scalar(select(HealthReport).where(HealthReport.id == report_id, HealthReport.user_id == user.id))
    if not r:
        raise NOT_FOUND
    ms = db.scalars(select(Measurement).where(Measurement.report_id == r.id, Measurement.user_id == user.id)
                    .order_by(Measurement.biomarker_code)).all()
    return ReportDetail(**ReportOut.model_validate(r).model_dump(), measurements=[_point(m) for m in ms],
                        biomarker_names={c: b.name for c, b in BIOMARKERS.items()})


GRAPH_TYPES = [("Patient", "You"), ("Category", "Body systems"), ("Biomarker", "Biomarkers"), ("Report", "Reports"),
               ("Plan", "Care plan"), ("Goal", "Goals"), ("Action", "Actions"), ("Appointment", "Appointments")]
RANGE_TEXT = {"within": "within reference range", "above": "above reference range", "below": "below reference range",
              "unavailable": "result unavailable", "not_comparable": "different unit", "no_range": "no reference range"}


@router.get("/health/graph", tags=["health"])
def graph(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """The user's records as a graph. Edges only express how records are organised (which report a result came
    from, which plan an action belongs to) - never a clinical association between items."""
    nodes, edges = [], []
    me = "patient"
    p = user.profile
    nodes.append({"id": me, "type": "Patient", "label": p.preferred_name or p.first_name, "details": "Your health profile"})

    latest: dict[str, Measurement] = {}
    for m in db.scalars(select(Measurement).where(Measurement.user_id == user.id).order_by(Measurement.measured_at)):
        latest[m.biomarker_code] = m
    reports = db.scalars(select(HealthReport).where(HealthReport.user_id == user.id).order_by(HealthReport.released_at)).all()
    for r in reports:
        nodes.append({"id": f"report:{r.id}", "type": "Report", "label": r.title, "link": f"/health/reports/{r.id}",
                      "details": f"Released {r.released_at:%d %b %Y} · synthetic" if r.is_synthetic else f"Released {r.released_at:%d %b %Y}"})
        edges.append({"source": me, "target": f"report:{r.id}", "label": "released to you"})

    for cat in sorted({b.category for b in BIOMARKERS.values() if b.code in latest}):
        nodes.append({"id": f"cat:{cat}", "type": "Category", "label": cat, "details": "Body system grouping"})
        edges.append({"source": me, "target": f"cat:{cat}", "label": "tracked"})
    for code, m in latest.items():
        b = BIOMARKERS.get(code)
        if not b:
            continue
        status = range_status(code, m.value) if m.unit == b.unit else ("unavailable" if m.value is None else "not_comparable")
        value = "no result" if m.value is None else f"{m.value:g} {m.unit}"
        nodes.append({"id": f"bio:{code}", "type": "Biomarker", "label": f"{b.name} · {value}", "status": status,
                      "link": f"/health/biomarkers/{code}", "details": f"Latest {m.measured_at:%d %b %Y} · {RANGE_TEXT.get(status, status)}"})
        edges.append({"source": f"cat:{b.category}", "target": f"bio:{code}", "label": "in system"})
        if m.report_id:
            edges.append({"source": f"report:{m.report_id}", "target": f"bio:{code}", "label": "measured in"})

    plan = db.scalar(select(CarePlan).where(CarePlan.user_id == user.id).order_by(CarePlan.approved_at.desc()))
    if plan:
        nodes.append({"id": "plan", "type": "Plan", "label": plan.title, "link": "/care-plan",
                      "details": f"Approved {plan.approved_at:%d %b %Y} by {plan.approved_by}"})
        edges.append({"source": me, "target": "plan", "label": "your plan"})
        for i, g in enumerate(plan.goals):
            nodes.append({"id": f"goal:{i}", "type": "Goal", "label": g["title"], "details": g.get("detail"), "link": "/care-plan"})
            edges.append({"source": "plan", "target": f"goal:{i}", "label": "goal of"})
    tasks = db.scalars(select(Task).where(Task.user_id == user.id)).all()
    for t in tasks:
        nodes.append({"id": f"task:{t.id}", "type": "Action", "label": t.title, "status": t.status, "link": t.link or "/care-plan",
                      "details": "Done" if t.status == "done" else ("Due " + f"{t.due_at:%d %b}" if t.due_at else "Open")})
        if plan and t.care_plan_id == plan.id:
            edges.append({"source": "plan", "target": f"task:{t.id}", "label": "part of your plan"})
        else:
            edges.append({"source": me, "target": f"task:{t.id}", "label": "to do"})
        if t.kind == "report_review" and t.link and t.link.startswith("/health/reports/"):
            edges.append({"source": f"task:{t.id}", "target": f"report:{t.link.rsplit('/', 1)[1]}", "label": "reviews"})
    for a in db.scalars(select(Appointment).where(Appointment.user_id == user.id, Appointment.status != "cancelled")):
        nodes.append({"id": f"appt:{a.id}", "type": "Appointment", "label": a.title, "link": f"/appointments/{a.id}",
                      "details": f"{a.starts_at:%d %b %Y} · {a.status} (demo)"})
        edges.append({"source": me, "target": f"appt:{a.id}", "label": "booked"})
        for t in tasks:
            if t.appointment_id == a.id:
                edges.append({"source": f"task:{t.id}", "target": f"appt:{a.id}", "label": "prepares for"})

    ids = {n["id"] for n in nodes}
    edges = [e for e in edges if e["source"] in ids and e["target"] in ids]
    return {"nodes": nodes, "edges": edges, "types": [{"type": t, "plural": pl} for t, pl in GRAPH_TYPES],
            "note": "Links show how your records are organised, not clinical relationships. Synthetic data."}
