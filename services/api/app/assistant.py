"""AI assistant integration boundary.

The prototype ships a deterministic, rule-based responder: product navigation plus a small set of
pre-written educational snippets. It does not read the user's records and never diagnoses or advises.

To plug in an authorised external AI service later, replace `answer()` with a call to that service,
keeping the same input/output shape (see docs/integrations.md for the privacy preconditions).
"""

import re

PROVIDER = "builtin-rules-v1"
DISCLAIMER = ("General information about using this demo app. Not medical advice. "
              "For health concerns, speak with a qualified clinician. In an emergency call 000.")

# Stems ("suicid", "diagnos") must match whole-word prefixes, so there is no trailing \b.
# ponytail: keyword list, not a classifier; needs clinical-safety review before any real use.
SAFETY = re.compile(r"\b(chest pain|suicid|overdos|can[’']?t breathe|cannot breathe|stroke|emergency|self[- ]harm"
                    r"|kill(ing)? myself|end my life|want to die)", re.I)
CLINICAL = re.compile(r"\b(diagnos|should i take|dose|dosage|prescri|medication|treat|cure|is my .* normal|do i have)", re.I)

# (pattern, answer, links, kind). Order matters; first match wins.
INTENTS = [
    (r"onboard|set ?up|get started|resume", "You can continue onboarding on any device - progress is saved after each "
     "step. Open Onboarding to pick up where you left off.", [("Continue onboarding", "/onboarding")], "navigation"),
    (r"appointment|book|resched|cancel", "Appointments shows upcoming and past visits. Bookings in this prototype are "
     "demonstrations only - no real clinic is contacted.", [("Appointments", "/appointments")], "navigation"),
    (r"report|result", "Your reports are under My Health > Reports. Every report in this demo is synthetic.",
     [("Reports", "/health")], "navigation"),
    (r"care ?plan|plan|goal|task", "My Plan shows your approved goals, scheduled actions and progress. You can tick off "
     "actions on the web or the app.", [("My Plan", "/care-plan")], "navigation"),
    (r"profile|name|phone|email|password", "Update your details in Profile. Changes sync to your other devices.",
     [("Profile", "/profile")], "navigation"),
    (r"notification|alert|remind", "The notification centre lists appointment, report and task updates.",
     [("Notifications", "/notifications")], "navigation"),
    (r"ldl|cholesterol|apob", "LDL cholesterol is one of the blood fats measured in a lipid panel. Its meaning for an "
     "individual depends on their overall situation, which a clinician assesses.", [("My Health", "/health")], "education"),
    (r"hba1c|glucose|sugar", "HbA1c reflects average blood glucose over about three months. A clinician interprets it "
     "alongside other information.", [("My Health", "/health")], "education"),
    (r"trend|chart|unit", "Charts show a trend only when results share the same unit and there are at least two valid "
     "values. Otherwise the chart explains why no trend is shown.", [("My Health", "/health")], "education"),
]


def answer(message: str) -> dict:
    if SAFETY.search(message):
        return {"answer": "If this is an emergency, call 000 now or go to your nearest emergency department. "
                          "This assistant can't help with urgent health concerns.",
                "kind": "safety", "links": [], "disclaimer": DISCLAIMER, "provider": PROVIDER}
    if CLINICAL.search(message):
        return {"answer": "I can't give diagnoses or advice about medications or treatment. Please raise this with "
                          "your clinician - you can request a demo appointment from Appointments.",
                "kind": "safety", "links": [{"label": "Appointments", "href": "/appointments"}],
                "disclaimer": DISCLAIMER, "provider": PROVIDER}
    for pattern, text, links, kind in INTENTS:
        if re.search(pattern, message, re.I):
            return {"answer": text, "kind": kind, "links": [{"label": l, "href": h} for l, h in links],
                    "disclaimer": DISCLAIMER, "provider": PROVIDER}
    return {"answer": "I can help you find your way around: try asking about onboarding, reports, your care plan, "
                      "appointments or notifications.", "kind": "fallback", "links": [],
            "disclaimer": DISCLAIMER, "provider": PROVIDER}
