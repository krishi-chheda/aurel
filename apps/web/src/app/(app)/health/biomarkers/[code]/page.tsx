"use client";

import { RANGE_LABELS, formatDate, statusTone } from "@aurel/shared";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { LineChart } from "@/components/line-chart";
import { Badge, Card, CardHeader, EmptyState, LoadError, Notice, PageHeader, PageSkeleton, cx } from "@/components/ui";
import { Enter } from "@/components/motion/primitives";
import { ICONS, RangeBar } from "@/components/visuals";
import { api } from "@/lib/session";
import { useResource } from "@/lib/use-resource";

const PRESETS = [["all", "All time"], ["365", "12 months"], ["180", "6 months"], ["90", "3 months"]] as const;

export default function Biomarker() {
  const { code } = useParams<{ code: string }>();
  const [preset, setPreset] = useState<string>("all");
  const { data: s, error, reload } = useResource(
    () => api.series(code, preset === "all" ? undefined : new Date(Date.now() - Number(preset) * 86400_000).toISOString()),
    [code, preset]);

  if (!s) return error ? <LoadError error={error} onRetry={reload} /> : <PageSkeleton />;
  const range = [s.ref_low != null && `≥ ${s.ref_low}`, s.ref_high != null && `≤ ${s.ref_high}`].filter(Boolean).join(" and ");
  const t = s.trend;
  const last = [...s.points].reverse().find((p) => p.value !== null);

  return (
    <Enter>
      <Link href="/health" className="text-sm text-primary hover:underline">← My Health</Link>
      <PageHeader eyebrow={`Biomarker · ${s.category}`} icon={ICONS.pulse} title={s.name} sub={s.about} />

      <div role="group" aria-label="Date range" className="mb-6 flex flex-wrap gap-2">
        {PRESETS.map(([v, l]) => (
          <button key={v} onClick={() => setPreset(v)} aria-pressed={preset === v}
            className={cx("min-h-10 rounded-full border px-4 text-sm", preset === v ? "border-primary bg-primary-soft font-medium text-primary" : "border-line-strong bg-surface")}>
            {l}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="History" sub={`Unit: ${s.unit}${range ? ` · Reference range ${range}` : ""}`} />
          {s.points.length === 0 ? <EmptyState title="No results in this period">Try a longer date range.</EmptyState> : <LineChart series={s} />}
        </Card>
        <div className="space-y-6">
        {last && (
          <Card>
            <CardHeader title="Latest result" sub={formatDate(last.measured_at)} />
            <p className="font-serif text-5xl leading-none tabular-nums">{last.value ?? "-"} <span className="font-sans text-base text-ink-muted">{last.unit}</span></p>
            <div className="mt-3"><Badge tone={statusTone[last.status]}>{RANGE_LABELS[last.status]}</Badge></div>
            {last.unit === s.unit && (
              <div className="mt-5">
                <RangeBar value={last.value} low={s.ref_low} high={s.ref_high} status={last.status} />
                <div className="mt-1.5 flex justify-between text-[11px] text-ink-subtle">
                  <span>{s.ref_low != null ? `≥ ${s.ref_low}` : ""}</span><span>Reference range (illustrative)</span><span>{s.ref_high != null ? `≤ ${s.ref_high}` : ""}</span>
                </div>
              </div>
            )}
          </Card>
        )}
        <Card>
          <CardHeader title="Change over time" />
          {t.comparable ? (
            <>
              <p className="font-serif text-3xl">
                {t.direction === "stable" ? "Stable" : t.direction === "up" ? "Higher" : "Lower"}
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                {t.change! > 0 ? "+" : ""}{t.change} {s.unit}{t.change_pct != null && ` (${t.change_pct > 0 ? "+" : ""}${t.change_pct}%)`} between the first and latest result in this range.
              </p>
            </>
          ) : (
            <Notice tone="info" title="Trend not shown">{t.reason}</Notice>
          )}
          {t.excluded_points > 0 && <p className="mt-3 text-sm text-ink-muted">{t.excluded_points} result(s) were unavailable and are excluded.</p>}
          <p className="mt-4 text-xs text-ink-subtle">A change in a number isn&apos;t a diagnosis. Ask your clinician what it means for you.</p>
        </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader title="All results" />
        <div className="-mx-5 overflow-x-auto sm:mx-0">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-ink-muted">
              <tr className="border-b border-line"><th className="px-5 py-2 font-medium sm:px-0">Date</th><th className="py-2 font-medium">Result</th><th className="py-2 font-medium">Status</th><th className="py-2 pr-5 font-medium sm:pr-0">Source</th></tr>
            </thead>
            <tbody>
              {[...s.points].reverse().map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 sm:px-0">{formatDate(p.measured_at)}</td>
                  <td className="py-3 tabular-nums">{p.value ?? "-"} {p.unit}</td>
                  <td className="py-3"><Badge tone={statusTone[p.status]}>{RANGE_LABELS[p.status]}</Badge></td>
                  <td className="py-3 pr-5 text-ink-muted sm:pr-0">
                    {p.report_id ? <Link className="hover:underline" href={`/health/reports/${p.report_id}`}>{p.source}</Link> : p.source}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-ink-subtle">{s.disclaimer}</p>
      </Card>
    </Enter>
  );
}
