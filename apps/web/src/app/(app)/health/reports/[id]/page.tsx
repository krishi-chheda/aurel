"use client";

import { RANGE_LABELS, formatDate, statusTone, type Point } from "@aurel/shared";
import Link from "next/link";
import { useParams } from "next/navigation";

import { HealthRing } from "@/components/health-ring";
import { Enter } from "@/components/motion/primitives";
import { TaskItem } from "@/components/task-item";
import { Badge, Card, CardHeader, EmptyState, LoadError, Notice, PageHeader, PageSkeleton } from "@/components/ui";
import { ICONS, RangeBar } from "@/components/visuals";
import { api } from "@/lib/session";
import { useResource } from "@/lib/use-resource";

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const { data: r, error, reload } = useResource(() => api.report(id), [id]);
  const { data: tasks } = useResource(() => api.tasks("all"), [id]);
  // Catalogue (category + illustrative ranges) for grouping and range bars.
  const { data: catalogue } = useResource(() => api.biomarkers());
  const reviewTask = tasks?.find((t) => t.kind === "report_review" && t.link === `/health/reports/${id}`);
  if (!r) {
    if (error && "status" in error && error.status === 404) {
      return <EmptyState title="Report not found" action={<Link className="text-primary hover:underline" href="/reports">All reports</Link>}>It may have been removed, or the link is incorrect.</EmptyState>;
    }
    return error ? <LoadError error={error} onRetry={reload} /> : <PageSkeleton />;
  }

  const meta = new Map((catalogue ?? []).map((b) => [b.code, b]));
  const groups = r.measurements.reduce<Record<string, Point[]>>((acc, m) => {
    ((acc[meta.get(m.biomarker_code)?.category ?? "Results"] ??= [])).push(m);
    return acc;
  }, {});
  const count = (s: string[]) => r.measurements.filter((m) => s.includes(m.status)).length;
  const within = count(["within"]), outside = count(["above", "below"]), other = r.measurements.length - within - outside;

  return (
    <Enter>
      <Link href="/reports" className="text-sm text-primary hover:underline">← Reports</Link>
      <PageHeader eyebrow="Report" icon={ICONS.doc} title={r.title} sub={`Released ${formatDate(r.released_at)} · Reviewed by ${r.reviewed_by}`} />
      <div className="mb-6 grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader title="At a glance" sub={`${r.measurements.length} results`} />
          <HealthRing within={within} outside={outside} other={other} />
          <p className="mt-4 text-center text-xs text-ink-subtle">Compared with illustrative ranges. Not a diagnosis.</p>
        </Card>
        <div className="space-y-4">
          {r.is_synthetic && <Notice tone="warning" title="Synthetic report">{r.summary}</Notice>}
          {reviewTask && <Card><ul className="-my-3"><TaskItem task={reviewTask} /></ul></Card>}
          <Card as="div">
            <p className="text-sm text-ink-muted">Reviewed by</p>
            <p className="font-medium">{r.reviewed_by}</p>
            <p className="mt-3 text-sm text-ink-muted">Source</p>
            <p className="font-medium">{r.source}</p>
          </Card>
        </div>
      </div>

      <div data-stagger className="space-y-6">
        {Object.entries(groups).map(([cat, items]) => (
          <section key={cat} aria-label={cat}>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-ink-muted">
              <span aria-hidden className="h-2 w-2 rounded-full bg-primary" />{cat}
            </h2>
            <Card as="div" className="p-0 sm:p-0">
              <ul className="divide-y divide-line">
                {items.map((m) => {
                  const b = meta.get(m.biomarker_code);
                  return (
                    <li key={m.id}>
                      <Link href={`/health/biomarkers/${m.biomarker_code}`} className="group flex items-center gap-6 px-5 py-4 transition-colors hover:bg-surface-muted">
                        <span className="min-w-0 flex-1 font-medium group-hover:text-primary">{r.biomarker_names[m.biomarker_code] ?? m.biomarker_code}</span>
                        <span className="hidden w-40 shrink-0 md:block">
                          {b && m.unit === b.unit && <RangeBar value={m.value} low={b.ref_low} high={b.ref_high} status={m.status} compact />}
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1 text-right">
                          <span className="font-serif text-lg tabular-nums">{m.value ?? "-"} <span className="font-sans text-sm text-ink-muted">{m.unit}</span></span>
                          <Badge tone={statusTone[m.status]}>{RANGE_LABELS[m.status]}</Badge>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>
        ))}
      </div>
      <p className="mt-4 text-xs text-ink-subtle">Source: {r.source}. This report is not medical advice.</p>
    </Enter>
  );
}
