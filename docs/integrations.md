# External integrations

Nothing in this prototype calls a real external service. Each dependency below has a single place in the code where
an integration would plug in. No public Everlab API is assumed or used.

| Capability | Prototype behaviour | Integration point | What a real integration needs |
|---|---|---|---|
| Email (password reset, notices) | Link printed to the API log and kept in `DEV_OUTBOX` (dev/test only) | `routers/auth.py::forgot` | Transactional email provider (e.g. SES, Postmark), verified sending domain, templates |
| Push notifications | Notifications stored in-app only; `push_text` holds the generic lock-screen string | `demo.py::notify` | `expo-notifications`, an EAS project, APNs key + FCM credentials, a device-token table, per-preference filtering (`profiles.notification_prefs` already exists) |
| Booking / practice management | Deterministic demo slots; every appointment `is_demo=true` and labelled as a simulation | `routers/appointments.py` (`_slots`, `request_appointment`, `cancel`, `reschedule`) | Provider API (e.g. a practice-management or booking platform), webhook for confirmations, mapping provider status → `scheduled` |
| Pathology / lab results | Synthetic panels generated per user | `demo.py::create_demo_data` → replace with an ingestion job writing `health_reports` + `measurements` | HL7 FHIR / HL7v2 feed from a lab, LOINC → biomarker mapping, unit normalisation rules, clinician release workflow before results become visible |
| Clinical record system | None | new ingestion service; `care_plans` already models clinician approval | EMR integration, clinician identity, consent records |
| AI health assistant | Rule-based navigation + a few pre-written educational snippets; safety filter for emergencies and medication/diagnosis questions | `assistant.py::answer` (same input/output shape) | Approved provider, BAA/DPA, privacy impact assessment, explicit user consent, prompt-injection and output-safety review, logging policy. **Do not send records without all of these.** |
| Universal / App Links | Configured but unverified | `apps/mobile/app.json`, `apps/web/public/.well-known/*` | Real domain on HTTPS, Apple Team ID in `apple-app-site-association`, release signing SHA-256 in `assetlinks.json` |
| Analytics | None by design | — | A privacy-reviewed, health-data-free event schema if ever added |
| Identity provider (optional) | Built-in auth | `security.py`, `routers/auth.py` | OIDC provider with MFA |
