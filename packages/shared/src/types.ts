// API contracts. Mirrors the Pydantic schemas in services/api/app/schemas.py (source of truth: GET /openapi.json).

export type Platform = "web" | "ios" | "android";
export type Role = "customer" | "coordinator" | "admin";

export interface User { id: string; email: string; role: Role }
export interface TokenResponse { access_token: string; refresh_token: string | null; expires_in: number; user: User }

export interface Profile {
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  date_of_birth: string | null;
  phone: string | null;
  postcode: string | null;
  health_goals: string[];
  lifestyle: Record<string, unknown>;
  history: Record<string, unknown>;
  notification_prefs: Record<string, boolean>;
  version: number;
  updated_at: string;
  updated_from: string;
}
export interface Me { user: User; profile: Profile }

export type OnboardingStep = "welcome" | "basic_profile" | "health_goals" | "lifestyle" | "history" | "review" | "complete";
export interface OnboardingState {
  steps: OnboardingStep[];
  current_step: OnboardingStep;
  completed_steps: OnboardingStep[];
  status: "in_progress" | "completed";
  version: number;
  last_platform: string;
  updated_at: string;
  answers: Record<string, Record<string, unknown>>;
}

export type RangeStatus = "within" | "above" | "below" | "unavailable" | "not_comparable" | "no_range" | "no_data";
export interface BiomarkerSummary {
  code: string; name: string; category: string; unit: string;
  ref_low: number | null; ref_high: number | null;
  latest_value: number | null; latest_unit: string | null; latest_at: string | null;
  status: RangeStatus; count: number;
}
export interface Point {
  id: string; biomarker_code: string; value: number | null; unit: string; measured_at: string; source: string;
  is_synthetic: boolean; status: RangeStatus; report_id: string | null;
}
export interface Trend {
  comparable: boolean; direction: "up" | "down" | "stable" | null; change: number | null;
  change_pct: number | null; excluded_points: number; reason: string | null;
}
export interface Series {
  code: string; name: string; category: string; unit: string; about: string;
  ref_low: number | null; ref_high: number | null; points: Point[]; trend: Trend; disclaimer: string;
}

export interface Report {
  id: string; title: string; summary: string; reviewed_by: string; source: string; is_synthetic: boolean; released_at: string;
}
export interface ReportDetail extends Report { measurements: Point[]; biomarker_names: Record<string, string> }

export type TaskKind = "profile" | "report_review" | "appointment_prep" | "check_in" | "milestone" | "care_action";
export interface Task {
  id: string; kind: TaskKind; title: string; detail: string | null; link: string | null;
  status: "open" | "done"; due_at: string | null; completed_at: string | null; completed_from: string | null;
  care_plan_id: string | null; appointment_id: string | null; version: number; updated_at: string; overdue: boolean;
}
export interface CarePlan {
  id: string; title: string; approved_by: string; approved_at: string; review_at: string | null;
  goals: { title: string; detail: string }[]; is_synthetic: boolean; tasks: Task[];
  progress: { done: number; total: number; percent: number }; disclaimer: string;
}

export type AppointmentType = "gp_review" | "blood_test" | "health_coach";
export interface Appointment {
  id: string; type: AppointmentType; title: string; practitioner: string; location: string; starts_at: string;
  duration_min: number; status: "requested" | "scheduled" | "cancelled" | "completed"; is_demo: boolean;
  prep_notes: string[]; version: number; updated_at: string;
}
export interface Appointments { upcoming: Appointment[]; past: Appointment[]; demo_notice: string }
export interface Slot { starts_at: string; type: AppointmentType }

export interface Notification {
  id: string; kind: string; title: string; body: string; link: string | null; read_at: string | null; created_at: string;
}
export interface Notifications { items: Notification[]; unread: number; total: number }

export interface Dashboard {
  greeting_name: string;
  onboarding: { status: OnboardingState["status"]; current_step: OnboardingStep };
  health_overview: { tracked: number; within_range: number; outside_range: number; other: number;
    last_panel_at: string | null; is_synthetic: boolean };
  next_appointments: Appointment[];
  tasks: Task[];
  open_task_count: number;
  recent_reports: Report[];
  care_plan: { id: string; title: string; done: number; total: number; percent: number } | null;
  unread_notifications: number;
  server_time: string;
}

export interface AssistantAnswer {
  answer: string; kind: "navigation" | "education" | "fallback" | "safety";
  links: { label: string; href: string }[]; disclaimer: string; provider: string;
}

export interface Flag { rule: string; severity: "low" | "medium" | "high"; message: string }
export interface AdminCustomer {
  id: string; name: string; email?: string; stage: string;
  onboarding: { status: string; current_step: string; last_platform: string; updated_at: string };
  open_tasks: number; overdue_tasks: number; missing_information: string[];
  appointment_status: Record<string, number>; flags: Flag[];
}
export interface AdminOverview {
  is_synthetic: boolean; note: string; customers: number; by_stage: Record<string, number>;
  onboarding_completion_rate: number; open_tasks: number; overdue_tasks: number;
  customers_missing_information: number; pending_appointment_requests: number;
  flags_by_rule: Record<string, number>; cross_device_onboarding: Record<string, number>;
}

export interface ApiErrorBody {
  code: string; message: string;
  fields?: { field: string; message: string }[];
  current?: unknown; missing_steps?: string[];
}

export interface GraphNode { id: string; type: string; label: string; details?: string | null; status?: string; link?: string }
export interface GraphEdge { source: string; target: string; label?: string }
export interface HealthGraph { nodes: GraphNode[]; edges: GraphEdge[]; types: { type: string; plural: string }[]; note: string }
