// One API client for web and mobile. Platform differences (where tokens live) are injected via TokenStore.
import type {
  AdminCustomer, AdminOverview, ApiErrorBody, Appointment, Appointments, AppointmentType, AssistantAnswer, CarePlan,
  Dashboard, HealthGraph, Me, Notification, Notifications, OnboardingState, OnboardingStep, Platform, Profile, Report, ReportDetail,
  Series, BiomarkerSummary, Slot, Task, TokenResponse,
} from "./types";

export class ApiError extends Error {
  status: number;
  code: string;
  body: ApiErrorBody;
  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.status = status;
    this.code = body.code;
    this.body = body;
  }
}

export interface TokenStore {
  getAccess(): string | null;
  /** Mobile returns the stored refresh token; web returns null and relies on the httpOnly cookie. */
  getRefresh(): Promise<string | null>;
  save(tokens: TokenResponse | null): Promise<void>;
}

export interface ApiOptions {
  baseUrl: string;
  platform: Platform;
  store: TokenStore;
  /** Called once when the session can't be recovered, so the UI can route to sign-in without losing the screen's input. */
  onSessionExpired?: () => void;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Outcome of trying to restore/extend a session. "unavailable" (offline, timeout or server error) is not the same
 * as being signed out: tokens are kept and the UI should offer a retry, not the sign-in screen. (AUD-12)
 */
export type RefreshResult = "ok" | "signed_out" | "unavailable";

export type SyncState = "idle" | "saving" | "saved" | "syncing" | "offline" | "failed" | "session_expired" | "conflict";

/** Maps any thrown error to the sync state the UI should show. Every state has a recovery path in the UI. */
export function syncStateFor(err: unknown): SyncState {
  if (!(err instanceof ApiError)) return "failed";
  if (err.code === "network" || err.code === "timeout") return "offline";
  if (err.status === 401) return "session_expired";
  if (err.status === 409) return "conflict";
  return "failed";
}

export function newRequestId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function createApi(opts: ApiOptions) {
  const doFetch = opts.fetchImpl ?? fetch;
  let refreshing: Promise<RefreshResult> | null = null;

  async function raw(method: string, path: string, body?: unknown, auth = true): Promise<Response> {
    const headers: Record<string, string> = { "X-Client-Platform": opts.platform };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const token = auth ? opts.store.getAccess() : null;
    if (token) headers.Authorization = `Bearer ${token}`;
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : undefined;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15000) : undefined;
    try {
      return await doFetch(opts.baseUrl + path, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "same-origin", signal: ctrl?.signal,
      });
    } catch (e) {
      const aborted = (e as { name?: string })?.name === "AbortError";
      throw new ApiError(0, aborted
        ? { code: "timeout", message: "The server took too long to respond. Your changes are kept - try again." }
        : { code: "network", message: "You appear to be offline. Your changes are kept - try again when you're connected." });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function parse<T>(res: Response): Promise<T> {
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const err: ApiErrorBody = data?.error ?? { code: "http_error", message: "Something went wrong. Please try again." };
      throw new ApiError(res.status, err);
    }
    return data as T;
  }

  /** Single-flight refresh: concurrent 401s share one refresh call (rotation would otherwise revoke the session). */
  function refresh(): Promise<RefreshResult> {
    refreshing ??= (async (): Promise<RefreshResult> => {
      try {
        const rt = await opts.store.getRefresh();
        if (opts.platform !== "web" && !rt) return "signed_out";
        const res = await raw("POST", "/auth/refresh", rt ? { refresh_token: rt } : {}, false);
        if (res.status === 401) {
          await opts.store.save(null);
          return "signed_out";
        }
        if (!res.ok) return "unavailable"; // server trouble: the session may well be fine, keep the tokens
        await opts.store.save(await res.json());
        return "ok";
      } catch {
        return "unavailable"; // offline or timed out: keep tokens, let the caller show the offline state
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res = await raw(method, path, body);
    if (res.status === 401) {
      const r = await refresh();
      if (r === "ok") res = await raw(method, path, body);
      else if (r === "unavailable") {
        throw new ApiError(0, { code: "network", message: "We couldn't reach Aurel to renew your session. Your changes are kept - try again when you're connected." });
      } else if (!opts.store.getAccess()) opts.onSessionExpired?.();
    }
    return parse<T>(res);
  }

  async function authCall(path: string, body: unknown): Promise<TokenResponse> {
    const t = await parse<TokenResponse>(await raw("POST", path, body, false));
    await opts.store.save(t);
    return t;
  }

  const get = <T>(p: string) => request<T>("GET", p);
  const q = (params: Record<string, string | undefined>) => {
    const s = Object.entries(params).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join("&");
    return s ? `?${s}` : "";
  };

  return {
    request,
    refresh,
    auth: {
      register: (b: { email: string; password: string; first_name: string; last_name: string }) => authCall("/auth/register", b),
      login: (b: { email: string; password: string }) => authCall("/auth/login", b),
      async logout() {
        try { await request<void>("POST", "/auth/logout"); } finally { await opts.store.save(null); }
      },
      forgot: (email: string) =>
        raw("POST", "/auth/forgot-password", { email }, false).then((r) => parse<{ message: string }>(r)),
      reset: (token: string, password: string) => raw("POST", "/auth/reset-password", { token, password }, false).then((r) => parse<void>(r)),
    },
    me: () => get<Me>("/me"),
    updateProfile: (b: Partial<Profile> & { version: number }) => request<Me>("PATCH", "/me/profile", b),
    deactivate: () => request<void>("DELETE", "/me"),
    dashboard: () => get<Dashboard>("/dashboard"),
    onboarding: () => get<OnboardingState>("/onboarding"),
    saveStep: (step: OnboardingStep, version: number, data: Record<string, unknown> = {}) =>
      request<OnboardingState>("PUT", `/onboarding/steps/${step}`, { version, data }),
    completeOnboarding: (version: number) => request<OnboardingState>("POST", "/onboarding/complete", { version }),
    biomarkers: () => get<BiomarkerSummary[]>("/health/biomarkers"),
    series: (code: string, from?: string, to?: string) =>
      get<Series>(`/health/biomarkers/${encodeURIComponent(code)}${q({ from, to })}`),
    healthGraph: () => get<HealthGraph>("/health/graph"),
    reports: () => get<Report[]>("/reports"),
    report: (id: string) => get<ReportDetail>(`/reports/${encodeURIComponent(id)}`),
    carePlan: () => get<CarePlan | null>("/care-plan"),
    tasks: (status: "open" | "done" | "all" = "open") => get<Task[]>(`/tasks?status=${status}`),
    setTask: (id: string, status: "open" | "done") => request<Task>("PATCH", `/tasks/${encodeURIComponent(id)}`, { status }),
    appointments: () => get<Appointments>("/appointments"),
    appointment: (id: string) => get<Appointment>(`/appointments/${encodeURIComponent(id)}`),
    slots: (type: AppointmentType) => get<Slot[]>(`/appointments/slots?type=${type}`),
    requestAppointment: (b: { type: AppointmentType; starts_at: string; client_request_id: string }) =>
      request<Appointment>("POST", "/appointments", b),
    cancelAppointment: (id: string) => request<Appointment>("POST", `/appointments/${encodeURIComponent(id)}/cancel`),
    rescheduleAppointment: (id: string, starts_at: string, version: number) =>
      request<Appointment>("POST", `/appointments/${encodeURIComponent(id)}/reschedule`, { starts_at, version }),
    notifications: (limit = 30, offset = 0) => get<Notifications>(`/notifications?limit=${limit}&offset=${offset}`),
    readNotification: (id: string) => request<Notification>("POST", `/notifications/${encodeURIComponent(id)}/read`),
    readAllNotifications: () => request<void>("POST", "/notifications/read-all"),
    ask: (message: string) => request<AssistantAnswer>("POST", "/assistant/ask", { message }),
    admin: {
      overview: () => get<AdminOverview>("/admin/overview"),
      customers: (p: { stage?: string; flagged?: boolean } = {}) =>
        get<{ items: AdminCustomer[]; total: number; is_synthetic: boolean }>(
          `/admin/customers${q({ stage: p.stage, flagged: p.flagged ? "true" : undefined })}`),
    },
  };
}

export type Api = ReturnType<typeof createApi>;
