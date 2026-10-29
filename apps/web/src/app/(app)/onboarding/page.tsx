"use client";

import {
  ApiError, DIET_LABELS, FAMILY_HISTORY_LABELS, GOAL_LABELS, PLATFORM_LABELS, STEP_TITLES, relativeTime, syncStateFor,
  type OnboardingState, type OnboardingStep, type SyncState,
} from "@aurel/shared";
import { useEffect, useState } from "react";

import { Button, ButtonLink, Card, ChipGroup, Field, LoadError, Notice, PageSkeleton, Select, SyncStatus, cx, fieldErrors } from "@/components/ui";
import { DrawnCheck, Enter, StepSlide } from "@/components/motion/primitives";
import { api, useSession } from "@/lib/session";

type Draft = Record<string, unknown>;
const FORM_STEPS: OnboardingStep[] = ["basic_profile", "health_goals", "lifestyle", "history"];

export default function Onboarding() {
  const { user } = useSession();
  const draftKey = `aurel.onboarding.draft.${user?.id}`;
  const [st, setSt] = useState<OnboardingState | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [view, setView] = useState<OnboardingStep>("welcome");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [sync, setSync] = useState<SyncState>("idle");
  const [err, setErr] = useState<{ message?: string; fields: Record<string, string> }>({ fields: {} });
  const [conflictFrom, setConflictFrom] = useState<string | null>(null);

  function apply(s: OnboardingState) {
      setSt(s);
      setView(s.current_step);
      // Unsaved answers survive a failed save, an expired session or a page reload (this browser only).
      let saved: Record<string, Draft> = {};
      try { saved = JSON.parse(sessionStorage.getItem(draftKey) ?? "{}"); } catch { /* ignore */ }
      setDrafts({ ...s.answers, ...saved });
      setLoadError(null);
  }
  const load = () => api.onboarding().then(apply, setLoadError);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  function update(step: string, patch: Draft) {
    setDrafts((d) => {
      const next = { ...d, [step]: { ...d[step], ...patch } };
      const dirty = JSON.parse(sessionStorage.getItem(draftKey) ?? "{}");
      sessionStorage.setItem(draftKey, JSON.stringify({ ...dirty, [step]: next[step] }));
      return next;
    });
  }

  function clearDraft(step: string) {
    try {
      const dirty = JSON.parse(sessionStorage.getItem(draftKey) ?? "{}");
      delete dirty[step];
      sessionStorage.setItem(draftKey, JSON.stringify(dirty));
    } catch { /* ignore */ }
  }

  async function save(step: OnboardingStep) {
    if (!st) return;
    setSync("saving");
    setErr({ fields: {} });
    try {
      const s = await api.saveStep(step, st.version, FORM_STEPS.includes(step) ? clean(step, drafts[step] ?? {}) : {});
      clearDraft(step);
      setSt(s);
      setConflictFrom(null);
      setSync("saved");
      setView(s.steps[s.steps.indexOf(step) + 1] ?? s.current_step);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      const state = syncStateFor(e);
      setSync(state);
      if (e instanceof ApiError && state === "conflict") {
        const current = e.body.current as OnboardingState;
        setSt(current); // adopt the newer version; this step's unsaved answers stay on screen
        setConflictFrom(PLATFORM_LABELS[current.last_platform] ?? "another device");
        if (current.status === "completed") setView("complete");
      } else {
        setErr({ message: e instanceof ApiError && e.code !== "validation_error" ? e.message : undefined, fields: fieldErrors(e) });
      }
    }
  }

  async function finish() {
    if (!st) return;
    setSync("saving");
    try {
      const s = await api.completeOnboarding(st.version);
      setSt(s);
      setView("complete");
      setSync("saved");
      sessionStorage.removeItem(draftKey);
    } catch (e) {
      setSync(syncStateFor(e));
      if (e instanceof ApiError && e.status === 409) setSt(e.body.current as OnboardingState);
      setErr({ message: e instanceof ApiError ? e.message : "Couldn't finish onboarding.", fields: {} });
    }
  }

  if (!st) return loadError ? <LoadError error={loadError} onRetry={load} /> : <PageSkeleton />;

  const idx = st.steps.indexOf(view);
  const visible = st.steps.filter((s) => s !== "complete");
  const reachable = (s: OnboardingStep) => st.completed_steps.includes(s) || s === st.current_step;
  const d = drafts[view] ?? {};

  return (
    <Enter className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[230px_1fr]">
      {/* Desktop stepper: where you are, what's saved, what's next. */}
      <aside className="hidden lg:block">
        <div className="sticky top-24 rounded-lg border border-line bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Set up your profile</p>
          <ol className="relative mt-4 space-y-1 before:absolute before:bottom-4 before:left-[13px] before:top-4 before:w-px before:bg-line">
            {visible.map((s, i) => {
              const done = st.completed_steps.includes(s), here = s === view;
              return (
                <li key={s} className="relative">
                  <button disabled={!reachable(s) || st.status === "completed"} onClick={() => setView(s)}
                    className={cx("flex w-full items-center gap-3 rounded-md px-1 py-2 text-left text-sm transition-colors disabled:cursor-default",
                      here ? "font-semibold text-ink" : done ? "text-ink-muted hover:text-ink" : "text-ink-subtle")}>
                    <span className={cx("relative grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs transition-colors",
                      done ? "border-primary bg-primary text-white dark:text-canvas" : here ? "border-primary bg-surface text-primary" : "border-line-strong bg-surface")}>
                      {done ? <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> : i + 1}
                    </span>
                    {STEP_TITLES[s]}
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="mt-4 border-t border-line pt-4 text-xs text-ink-muted">Every step saves as you go. Finish here or in the Aurel app.</p>
        </div>
      </aside>
      <div className="mx-auto w-full max-w-2xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {st.status === "completed" ? "Onboarding complete" : `Step ${Math.min(idx + 1, visible.length)} of ${visible.length}`}
          {st.completed_steps.length > 0 && ` · last saved ${relativeTime(st.updated_at)} on ${PLATFORM_LABELS[st.last_platform] ?? "another device"}`}
        </p>
        <SyncStatus state={sync} onRetry={() => (view === "review" ? finish() : save(view))} />
      </div>

      <nav aria-label="Onboarding steps" className="mb-8">
        <ol className="flex gap-1.5">
          {visible.map((s) => (
            <li key={s} className="flex-1">
              <button disabled={!reachable(s) || st.status === "completed"} onClick={() => setView(s)}
                aria-current={s === view ? "step" : undefined} aria-label={`${STEP_TITLES[s]}${st.completed_steps.includes(s) ? " (saved)" : ""}`}
                className={cx("h-1.5 w-full rounded-full transition-colors",
                  s === view ? "bg-primary" : st.completed_steps.includes(s) ? "bg-primary/40" : "bg-surface-muted")} />
            </li>
          ))}
        </ol>
      </nav>

      {conflictFrom && (
        <div className="mb-6">
          <Notice tone="warning" title={`Progress was updated on ${conflictFrom}`}
            action={<Button size="sm" variant="secondary" onClick={() => { setConflictFrom(null); setView(st.current_step); }}>Go to latest step</Button>}>
            Your answers on this screen haven&apos;t been saved yet. Save again to apply them, or continue from where the other device left off.
          </Notice>
        </div>
      )}
      {sync === "session_expired" && (
        <div className="mb-6"><Notice tone="warning" title="Your session expired" action={<ButtonLink size="sm" href="/login?next=/onboarding">Sign in</ButtonLink>}>
          Your answers are kept in this browser. Sign in and you&apos;ll return here.</Notice></div>
      )}
      {err.message && <div className="mb-6"><Notice tone="danger">{err.message}</Notice></div>}
      {sync === "offline" && <div className="mb-6"><Notice tone="warning" title="You're offline">Your answers are kept. Press Save again when you&apos;re connected.</Notice></div>}

      <Card>
        <StepSlide index={idx}>
        <h1 className="font-serif text-[28px]">{STEP_TITLES[view]}</h1>
        <form className="mt-6 grid gap-5" noValidate onSubmit={(e) => { e.preventDefault(); if (view === "review") finish(); else save(view); }}>
          {view === "welcome" && (
            <p className="text-ink-muted">
              A few short questions so your (fictional) care team has what they need. Every step saves as you go - start
              here and finish on your phone if you like. Please use made-up answers: this is a demo.
            </p>
          )}
          {view === "basic_profile" && (
            <>
              <Field label="Preferred name (optional)" value={(d.preferred_name as string) ?? ""} onChange={(e) => update(view, { preferred_name: e.target.value || null })} error={err.fields.preferred_name} />
              <Field label="Date of birth" type="date" value={(d.date_of_birth as string) ?? ""} onChange={(e) => update(view, { date_of_birth: e.target.value })} error={err.fields.date_of_birth} required />
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Mobile (optional)" type="tel" autoComplete="tel" value={(d.phone as string) ?? ""} onChange={(e) => update(view, { phone: e.target.value || null })} error={err.fields.phone} />
                <Field label="Postcode" inputMode="numeric" autoComplete="postal-code" value={(d.postcode as string) ?? ""} onChange={(e) => update(view, { postcode: e.target.value })} error={err.fields.postcode} required />
              </div>
            </>
          )}
          {view === "health_goals" && (
            <ChipGroup legend="What would you like to focus on?" options={GOAL_LABELS} max={5}
              value={(d.health_goals as string[]) ?? []} onChange={(v) => update(view, { health_goals: v })} error={err.fields.health_goals} />
          )}
          {view === "lifestyle" && (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Active days per week" type="number" min={0} max={7} value={(d.activity_days_per_week as number) ?? ""} onChange={(e) => update(view, { activity_days_per_week: num(e.target.value) })} error={err.fields.activity_days_per_week} />
              <Field label="Average sleep (hours)" type="number" min={0} max={16} step={0.5} value={(d.sleep_hours as number) ?? ""} onChange={(e) => update(view, { sleep_hours: num(e.target.value) })} error={err.fields.sleep_hours} />
              <Select label="Diet" options={DIET_LABELS} value={(d.diet as string) ?? ""} onChange={(e) => update(view, { diet: e.target.value })} error={err.fields.diet} />
              <Field label="Alcoholic drinks per week" type="number" min={0} max={100} value={(d.alcohol_drinks_per_week as number) ?? ""} onChange={(e) => update(view, { alcohol_drinks_per_week: num(e.target.value) })} error={err.fields.alcohol_drinks_per_week} />
              <YesNo label="Do you smoke?" value={d.smoker as boolean | undefined} onChange={(v) => update(view, { smoker: v })} error={err.fields.smoker} />
            </div>
          )}
          {view === "history" && (
            <>
              <ChipGroup legend="Family history" options={FAMILY_HISTORY_LABELS} value={(d.family_history as string[]) ?? []} onChange={(v) => update(view, { family_history: v })} error={err.fields.family_history} />
              <YesNo label="Do you take any regular medication?" value={d.takes_medication as boolean | undefined} onChange={(v) => update(view, { takes_medication: v })} error={err.fields.takes_medication} />
              <div>
                <label htmlFor="note" className="mb-1.5 block text-sm font-medium">Anything else? (optional)</label>
                <textarea id="note" rows={3} maxLength={500} value={(d.conditions_note as string) ?? ""} onChange={(e) => update(view, { conditions_note: e.target.value || null })}
                  className="block w-full rounded-md border border-line-strong bg-surface px-3.5 py-2.5 text-[16px]" />
                <p className="mt-1 text-xs text-ink-muted">Demo only - don&apos;t enter real medical information.</p>
              </div>
            </>
          )}
          {view === "review" && <Review answers={drafts} onEdit={setView} />}
          {view === "complete" && (
            <div className="text-center">
              <DrawnCheck />
              <p className="mt-4 text-ink-muted">Thanks - your profile is set up and synced to every device.</p>
              <ButtonLink href="/dashboard" className="mt-6">Go to your dashboard</ButtonLink>
            </div>
          )}

          {view !== "complete" && (
            <div className="mt-2 flex items-center justify-between gap-3">
              {idx > 0 ? <Button type="button" variant="ghost" onClick={() => setView(st.steps[idx - 1])}>Back</Button> : <span />}
              <Button type="submit" loading={sync === "saving"}>
                {view === "welcome" ? "Get started" : view === "review" ? "Finish" : "Save and continue"}
              </Button>
            </div>
          )}
        </form>
        </StepSlide>
      </Card>
      </div>
    </Enter>
  );
}

const num = (v: string) => (v === "" ? null : Number(v));

function clean(step: string, d: Draft): Draft {
  if (step === "basic_profile") return { preferred_name: d.preferred_name ?? null, date_of_birth: d.date_of_birth, phone: d.phone || null, postcode: d.postcode };
  if (step === "health_goals") return { health_goals: d.health_goals ?? [] };
  return d;
}

function YesNo({ label, value, onChange, error }: { label: string; value?: boolean; onChange: (v: boolean) => void; error?: string }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div className="flex gap-2">
        {[true, false].map((v) => (
          <label key={String(v)} className={cx("inline-flex min-h-11 cursor-pointer items-center rounded-md border px-5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
            value === v ? "border-primary bg-primary-soft text-primary font-medium" : "border-line-strong bg-surface")}>
            <input type="radio" className="sr-only" checked={value === v} onChange={() => onChange(v)} />{v ? "Yes" : "No"}
          </label>
        ))}
      </div>
      {error && <p className="mt-1 text-xs font-medium text-danger">{error}</p>}
    </fieldset>
  );
}

function Review({ answers, onEdit }: { answers: Record<string, Draft>; onEdit: (s: OnboardingStep) => void }) {
  const b = answers.basic_profile ?? {}, g = answers.health_goals ?? {}, l = answers.lifestyle ?? {}, h = answers.history ?? {};
  const rows: [OnboardingStep, string, string][] = [
    ["basic_profile", "Date of birth", String(b.date_of_birth ?? "-")],
    ["basic_profile", "Postcode", String(b.postcode ?? "-")],
    ["health_goals", "Goals", ((g.health_goals as string[]) ?? []).map((x) => GOAL_LABELS[x]).join(", ") || "-"],
    ["lifestyle", "Activity", l.activity_days_per_week != null ? `${l.activity_days_per_week} days/week` : "-"],
    ["lifestyle", "Sleep", l.sleep_hours != null ? `${l.sleep_hours} h` : "-"],
    ["lifestyle", "Diet", DIET_LABELS[l.diet as string] ?? "-"],
    ["history", "Family history", ((h.family_history as string[]) ?? []).map((x) => FAMILY_HISTORY_LABELS[x]).join(", ") || "-"],
  ];
  return (
    <dl className="divide-y divide-line rounded-md border border-line">
      {rows.map(([step, k, v]) => (
        <div key={k} className="flex items-center justify-between gap-4 px-4 py-3">
          <div><dt className="text-sm text-ink-muted">{k}</dt><dd className="font-medium">{v}</dd></div>
          <button type="button" onClick={() => onEdit(step)} className="text-sm font-medium text-primary hover:underline min-h-11">Edit</button>
        </div>
      ))}
    </dl>
  );
}
