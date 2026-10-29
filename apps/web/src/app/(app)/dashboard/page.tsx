"use client";

import { APPOINTMENT_STATUS_LABELS, RANGE_LABELS, STEP_TITLES, formatDate, greeting } from "@aurel/shared";
import Link from "next/link";

import { HealthRing } from "@/components/health-ring";
import { GoalJourney } from "@/components/motion/goal-journey";
import { CountUp, Enter } from "@/components/motion/primitives";
import { TaskItem } from "@/components/task-item";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, LoadError, PageSkeleton, SyncStatus } from "@/components/ui";
import { api } from "@/lib/session";
import { useResource } from "@/lib/use-resource";

const ICON = {
  calendar: "M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  pulse: "M3 12h4l3-7 4 14 3-7h4",
  map: "M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1",
  chat: "M12 21a9 9 0 1 0-9-9c0 1.6.4 3 1.1 4.3L3 21l4.7-1.1A9 9 0 0 0 12 21z",
  bell: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  doc: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6",
};
const Icon = ({ d, className = "" }: { d: string; className?: string }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}><path d={d} /></svg>
);

const daysUntil = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export default function Dashboard() {
  const { data: d, error, state, syncedAt, reload } = useResource(() => api.dashboard());
  const markers = useResource(() => api.biomarkers());
  if (!d) return error ? <LoadError error={error} onRetry={reload} /> : <PageSkeleton />;
  const h = d.health_overview;
  const next = d.next_appointments[0];
  const flagged = (markers.data ?? []).filter((b) => b.status === "above" || b.status === "below");
  const thisWeek = d.next_appointments.filter((a) => daysUntil(a.starts_at) <= 7).length;
  const toReview = d.tasks.filter((t) => t.kind === "report_review").length;
  const today = new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });

  return (
    <Enter className="space-y-6">
      {/* Hero: the day at a glance, with the journey towards the plan's goal. */}
      <section className="relative overflow-hidden rounded-lg border border-line bg-surface">
        <div aria-hidden className="pointer-events-none absolute -left-16 -top-20 h-72 w-72 rounded-full bg-primary-soft blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 right-10 h-64 w-64 rounded-full bg-accent-soft opacity-70 blur-3xl" />
        <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_1.15fr] lg:items-center">
          <div>
            <p className="text-sm font-medium text-ink-subtle">{today}</p>
            <h1 className="mt-2 font-serif text-[36px] leading-tight sm:text-[42px]">{greeting()},<br />{d.greeting_name}</h1>
            <p className="mt-3 max-w-md text-ink-muted">
              You have <strong className="text-ink">{plural(d.open_task_count, "open task")}</strong>
              {thisWeek > 0 && <>, <strong className="text-ink">{plural(thisWeek, "appointment")}</strong> this week</>}
              {toReview > 0 && <> and <strong className="text-ink">{plural(toReview, "report")}</strong> to review</>}.
            </p>
            <div className="mt-4"><SyncStatus state={state} syncedAt={syncedAt} onRetry={reload} /></div>
          </div>
          {d.care_plan && (
            <Link href="/care-plan" className="group block rounded-lg transition-transform duration-300 hover:-translate-y-0.5">
              <GoalJourney done={d.care_plan.done} total={d.care_plan.total} compact />
              <p className="mt-1 flex justify-between text-sm text-ink-muted">
                <span><strong className="text-ink"><CountUp value={d.care_plan.percent} suffix="%" /></strong> of your plan</span>
                <span className="text-primary group-hover:underline">My Plan →</span>
              </p>
            </Link>
          )}
        </div>
      </section>
      {error && <LoadError error={error} onRetry={reload} />}

      {d.onboarding.status !== "completed" && (
        <Card className="border-primary/30 bg-primary-soft">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-primary">Finish setting up your profile</p>
              <p className="mt-0.5 text-sm text-ink-muted">
                You&apos;re at <strong>{STEP_TITLES[d.onboarding.current_step]}</strong>. Your progress is saved - continue here or in the app.
              </p>
            </div>
            <ButtonLink href="/onboarding">Continue</ButtonLink>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Health overview" sub={h.last_panel_at ? `Latest panel ${formatDate(h.last_panel_at)}` : undefined}
            action={<Link href="/health" className="text-sm font-medium text-primary hover:underline">View all</Link>} />
          {h.tracked === 0 ? <EmptyState title="No results yet">Results will appear after your first assessment.</EmptyState> : (
            <>
              <HealthRing within={h.within_range} outside={h.outside_range} other={h.other} />
              <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-success" />In range</span>
                <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-warning" />Outside range</span>
                {h.other > 0 && <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-line-strong" />Other</span>}
              </div>
              {flagged.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {flagged.map((b) => (
                    <li key={b.code}>
                      <Link href={`/health/biomarkers/${b.code}`} className="flex items-center justify-between gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm hover:opacity-90">
                        <span className="font-medium text-ink">{b.name}</span>
                        <span className="text-warning">{b.latest_value} {b.latest_unit} · {RANGE_LABELS[b.status].replace(" reference range", "")}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 text-xs text-ink-subtle">Synthetic data, compared with illustrative ranges. Not a diagnosis.</p>
            </>
          )}
        </Card>

        <Card>
          <CardHeader title="Next appointment" action={<Link href="/appointments" className="text-sm font-medium text-primary hover:underline">Manage</Link>} />
          {next ? (
            <Link href={`/appointments/${next.id}`} className="group block">
              <div className="flex items-center gap-4">
                <div className="flex w-20 shrink-0 flex-col items-center rounded-lg border border-line bg-canvas py-2.5 text-center">
                  <span className="text-xs font-semibold uppercase tracking-wider text-accent">{new Date(next.starts_at).toLocaleDateString("en-AU", { month: "short" })}</span>
                  <span className="font-serif text-4xl leading-none">{new Date(next.starts_at).getDate()}</span>
                  <span className="mt-0.5 text-xs text-ink-muted">{new Date(next.starts_at).toLocaleDateString("en-AU", { weekday: "short" })}</span>
                </div>
                <div className="min-w-0">
                  <p className="font-medium group-hover:underline">{next.title}</p>
                  <p className="text-sm text-ink-muted">{new Date(next.starts_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })} · {next.duration_min} min</p>
                  <p className="mt-1 text-sm text-ink-muted">{next.practitioner}</p>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between rounded-md bg-surface-muted px-3 py-2.5 text-sm">
                <span className="text-ink-muted">{daysUntil(next.starts_at) <= 0 ? "Today" : <>In <strong className="text-ink"><CountUp value={daysUntil(next.starts_at)} /></strong> {daysUntil(next.starts_at) === 1 ? "day" : "days"}</>}</span>
                <Badge tone="info">{APPOINTMENT_STATUS_LABELS[next.status]}</Badge>
              </div>
            </Link>
          ) : <EmptyState title="Nothing booked" action={<ButtonLink size="sm" variant="secondary" href="/appointments">Request an appointment</ButtonLink>} />}
        </Card>

        <Card>
          <CardHeader title="Quick actions" />
          <div className="grid grid-cols-2 gap-3">
            {[
              ["/appointments", "Book", ICON.calendar],
              ["/health", "Health map", ICON.map],
              ["/reports", "Reports", ICON.doc],
              ["/support", "Ask", ICON.chat],
            ].map(([href, label, icon]) => (
              <Link key={href} href={href} className="group flex flex-col items-start gap-3 rounded-lg border border-line bg-canvas p-4 transition-colors hover:border-primary/40 hover:bg-primary-soft">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-surface text-primary shadow-sm transition-transform duration-300 group-hover:scale-110"><Icon d={icon} /></span>
                <span className="text-sm font-medium">{label}</span>
              </Link>
            ))}
          </div>
          <Link href="/notifications" className="mt-3 flex items-center justify-between rounded-lg border border-line px-4 py-3 text-sm hover:bg-surface-muted">
            <span className="inline-flex items-center gap-2"><Icon d={ICON.bell} className="text-ink-muted" />Notifications</span>
            {d.unread_notifications > 0 ? <Badge tone="accent">{d.unread_notifications} new</Badge> : <span className="text-ink-subtle">All read</span>}
          </Link>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Outstanding tasks" sub={`${d.open_task_count} open`}
            action={<Link href="/care-plan" className="text-sm font-medium text-primary hover:underline">All tasks</Link>} />
          {d.tasks.length ? (
            <ul className="-my-3 divide-y divide-line">
              {d.tasks.map((t) => <TaskItem key={t.id} task={t} onChange={() => reload()} />)}
            </ul>
          ) : <EmptyState title="You're all caught up" />}
        </Card>

        <Card>
          <CardHeader title="Recent reports" action={<Link href="/reports" className="text-sm font-medium text-primary hover:underline">All</Link>} />
          {d.recent_reports.length ? (
            <ol className="relative space-y-5 border-l border-line pl-5">
              {d.recent_reports.map((r, i) => (
                <li key={r.id} className="relative">
                  <span aria-hidden className={`absolute -left-[26px] top-1.5 h-3 w-3 rounded-full border-2 border-surface ${i === 0 ? "bg-primary" : "bg-line-strong"}`} />
                  <Link href={`/health/reports/${r.id}`} className="font-medium hover:underline">{r.title}</Link>
                  <p className="text-sm text-ink-muted">{formatDate(r.released_at)}{r.is_synthetic ? " · synthetic" : ""}</p>
                </li>
              ))}
            </ol>
          ) : <EmptyState title="No reports yet" />}
        </Card>
      </div>
    </Enter>
  );
}
