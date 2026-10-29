"use client";

import { formatDate } from "@aurel/shared";
import Link from "next/link";

import { Enter } from "@/components/motion/primitives";
import { Badge, EmptyState, LoadError, PageHeader, PageSkeleton } from "@/components/ui";
import { DateTile, ICONS, Icon } from "@/components/visuals";
import { api } from "@/lib/session";
import { useResource } from "@/lib/use-resource";

export default function Reports() {
  const { data, error, reload } = useResource(() => api.reports());
  if (!data) return error ? <LoadError error={error} onRetry={reload} /> : <PageSkeleton />;
  return (
    <Enter>
      <PageHeader eyebrow="Results" icon={ICONS.doc} title="Reports" sub="Assessment reports released to you, newest first." />
      {data.length === 0 ? <EmptyState title="No reports yet">Your first report appears after your assessment.</EmptyState> : (
        <ol data-stagger className="space-y-4">
          {data.map((r, i) => (
            <li key={r.id}>
              <Link href={`/health/reports/${r.id}`}
                className="group flex items-center gap-5 rounded-lg border border-line bg-surface p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_18px_40px_-28px_rgba(31,39,43,.4)] sm:p-5">
                <DateTile iso={r.released_at} muted={i > 0} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[17px] font-semibold group-hover:text-primary">{r.title}</span>
                    {i === 0 && <Badge tone="primary">Latest</Badge>}
                    {r.is_synthetic && <Badge>Synthetic</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">Released {formatDate(r.released_at)} · Reviewed by {r.reviewed_by}</p>
                </div>
                <Icon d="M9 6l6 6-6 6" className="shrink-0 text-ink-subtle transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Enter>
  );
}
