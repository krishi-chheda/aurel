// User-facing labels shared by both clients so wording stays identical across devices.
import type { SyncState } from "./api";
import type { OnboardingStep } from "./types";

export const BRAND = { name: "Aurel", tagline: "Preventive health, continuously." } as const;

export const DEMO_BANNER = "Demonstration product. All health data shown is synthetic and is not medical advice.";

export const STEP_TITLES: Record<OnboardingStep, string> = {
  welcome: "Welcome",
  basic_profile: "About you",
  health_goals: "Your goals",
  lifestyle: "Lifestyle",
  history: "Health history",
  review: "Review",
  complete: "All set",
};

export const GOAL_LABELS: Record<string, string> = {
  heart_health: "Heart health",
  metabolic_health: "Metabolic health",
  energy: "More energy",
  sleep: "Better sleep",
  fitness: "Fitness",
  weight: "Healthy weight",
  longevity: "Healthy ageing",
  stress: "Manage stress",
  nutrition: "Nutrition",
};

export const DIET_LABELS: Record<string, string> = {
  omnivore: "Omnivore", vegetarian: "Vegetarian", vegan: "Vegan", pescatarian: "Pescatarian", other: "Other",
};

export const FAMILY_HISTORY_LABELS: Record<string, string> = {
  heart_disease: "Heart disease", diabetes: "Diabetes", cancer: "Cancer", stroke: "Stroke", none: "None that I know of",
  unsure: "Not sure",
};

export const SYNC_LABELS: Record<SyncState, string> = {
  idle: "",
  saving: "Saving…",
  saved: "Saved",
  syncing: "Syncing…",
  offline: "Offline - changes kept on this device until you retry",
  failed: "Couldn't save - your changes are kept",
  session_expired: "Session expired - sign in to continue",
  conflict: "Updated on another device",
};

export const RANGE_LABELS: Record<string, string> = {
  within: "Within reference range",
  above: "Above reference range",
  below: "Below reference range",
  unavailable: "Result unavailable",
  not_comparable: "Different unit - not compared",
  no_range: "No reference range",
  no_data: "No results yet",
};

export const TASK_KIND_LABELS: Record<string, string> = {
  profile: "Profile", report_review: "Report", appointment_prep: "Appointment", check_in: "Check-in",
  milestone: "Milestone", care_action: "Care plan",
};

export const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  requested: "Requested (demo)", scheduled: "Scheduled (demo)", cancelled: "Cancelled", completed: "Completed",
};

export const APPOINTMENT_TYPE_LABELS: Record<string, string> = {
  gp_review: "Results review with a doctor", blood_test: "Blood collection", health_coach: "Health coaching",
};

export const PLATFORM_LABELS: Record<string, string> = { web: "the web", ios: "iPhone", android: "Android", unknown: "another device" };

export function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-AU", opts);
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function relativeTime(iso: string, now = Date.now()): string {
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  const abs = Math.abs(s);
  const fmt = new Intl.RelativeTimeFormat("en-AU", { numeric: "auto" });
  if (abs < 60) return "just now";
  if (abs < 3600) return fmt.format(-Math.round(s / 60), "minute");
  if (abs < 86400) return fmt.format(-Math.round(s / 3600), "hour");
  return fmt.format(-Math.round(s / 86400), "day");
}
