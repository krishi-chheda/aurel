"use client";

import { formatDate } from "@aurel/shared";

import { GoalJourney } from "@/components/motion/goal-journey";
import { CountUp, Enter } from "@/components/motion/primitives";
import { TaskItem } from "@/components/task-item";
import { Card, CardHeader, EmptyState, LoadError, Notice, PageHeader, PageSkeleton, ProgressBar, SyncStatus } from "@/components/ui";
import { ICONS } from "@/components/visuals";
import { api } from "@/lib/session";
import { useResource } from "@/lib/use-resource";

export default function CarePlanPage() {
  const plan = useResource(() => api.carePlan());
  const other = useResource(() => api.tasks("all"));
  const p = plan.data;
  if (p === undefined) return plan.error ? <LoadError error={plan.error} onRetry={plan.reload} /> : <PageSkeleton />;
  if (p === null) return <EmptyState title="No care plan yet">Your plan is created by your clinician after your results review.</EmptyState>;

  const open = p.tasks.filter((t) => t.status === "open");
  const milestones = open.filter((t) => t.kind === "milestone");
  const actions = open.filter((t) => t.kind !== "milestone");
  const done = p.tasks.filter((t) => t.status === "done");
  const general = (other.data ?? []).filter((t) => !t.care_plan_id && t.status === "open");
  const refresh = () => { plan.reload(); other.reload(); };

  return (
    <Enter className="space-y-6">
      <PageHeader eyebrow="Your journey" icon={ICONS.plan} title="My Plan" sub={`${p.title} · approved ${formatDate(p.approved_at)} by ${p.approved_by}`}
        action={<SyncStatus state={plan.state} syncedAt={plan.syncedAt} onRetry={refresh} />} />
      <Notice tone="info">{p.disclaimer}</Notice>

      <section aria-label="Your journey">
        <GoalJourney done={p.progress.done} total={p.progress.total} />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Goals" />
          <ol className="space-y-4">
            {p.goals.map((g, i) => (
              <li key={g.title} className="flex gap-4">
                <span className="font-serif text-2xl text-primary">{i + 1}</span>
                <div><p className="font-medium">{g.title}</p><p className="text-sm text-ink-muted">{g.detail}</p></div>
              </li>
            ))}
          </ol>
        </Card>
        <Card>
          <CardHeader title="Progress" />
          <p className="font-serif text-5xl"><CountUp value={p.progress.percent} suffix="%" /></p>
          <div className="mt-4"><ProgressBar value={p.progress.percent} label="Plan progress" /></div>
          <p className="mt-2 text-sm text-ink-muted">{p.progress.done} of {p.progress.total} actions complete</p>
          {p.review_at && <p className="mt-4 text-sm text-ink-muted">Plan review due {formatDate(p.review_at)}</p>}
        </Card>
      </div>

      <Card>
        <CardHeader title="Scheduled actions" sub="Tick these off here or in the app - they sync between devices." />
        {actions.length ? <ul className="-my-3 divide-y divide-line">{actions.map((t) => <TaskItem key={t.id} task={t} onChange={refresh} />)}</ul>
          : <EmptyState title="Nothing outstanding" />}
      </Card>

      {milestones.length > 0 && (
        <Card>
          <CardHeader title="Upcoming milestones" />
          <ul className="-my-3 divide-y divide-line">{milestones.map((t) => <TaskItem key={t.id} task={t} onChange={refresh} />)}</ul>
        </Card>
      )}

      {general.length > 0 && (
        <Card>
          <CardHeader title="Other tasks" sub="Reports to review, appointment preparation and account tasks." />
          <ul className="-my-3 divide-y divide-line">{general.map((t) => <TaskItem key={t.id} task={t} onChange={refresh} />)}</ul>
        </Card>
      )}

      <Card>
        <CardHeader title="Completed" />
        {done.length ? <ul className="-my-3 divide-y divide-line">{done.map((t) => <TaskItem key={t.id} task={t} onChange={refresh} />)}</ul>
          : <EmptyState title="Nothing completed yet" />}
      </Card>

      <Card>
        <CardHeader title="Supporting information" />
        <div className="space-y-3 text-[15px] text-ink-muted">
          <p><strong className="text-ink">Nutrition guide (demo).</strong> Build meals around vegetables, legumes, whole grains and unsaturated fats. This is generic, predefined content, not personalised advice.</p>
          <p><strong className="text-ink">Activity.</strong> &ldquo;Moderate&rdquo; means you can talk but not sing. Check with your clinician before starting something new.</p>
          <p><strong className="text-ink">Reminders.</strong> Reminders appear in your notification centre. Push reminders on your phone are not enabled in this prototype.</p>
        </div>
      </Card>
    </Enter>
  );
}
