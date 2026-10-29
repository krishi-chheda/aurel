"use client";

import { RANGE_LABELS, formatDate, statusTone, type BiomarkerSummary, type GraphNode } from "@aurel/shared";
import Link from "next/link";
import { useState } from "react";

import { Badge, Card, EmptyState, LoadError, Notice, PageHeader, PageSkeleton, SyncStatus } from "@/components/ui";
import { KnowledgeGraph } from "@/components/knowledge-graph";
import { Appear, Enter } from "@/components/motion/primitives";
import { ICONS, RangeBar } from "@/components/visuals";
import { api } from "@/lib/session";
import { useResource } from "@/lib/use-resource";

// Three focused maps over the same graph instead of one map with everything: each keeps "you" plus a few types.
const LENSES = [
  { id: "body", title: "Body systems", types: ["Category", "Biomarker"],
    intro: "Your latest results grouped by body system. Amber points are outside their illustrative range." },
  { id: "reports", title: "Reports", types: ["Report", "Biomarker"],
    intro: "Each report and the results it measured. Select a report to light up what it covered." },
  { id: "care", title: "Plan & care", types: ["Plan", "Goal", "Action", "Appointment"],
    intro: "Your care plan, its goals, the actions that move them forward and your appointments." },
] as const;

export default function Health() {
  const { data, error, state, syncedAt, reload } = useResource(() => api.biomarkers());
  const graph = useResource(() => api.healthGraph());
  const [picked, setPicked] = useState<GraphNode | null>(null);
  // order[0] is the big map; the other two are the small cards above it. Tapping a small card swaps it with the big one.
  const [order, setOrder] = useState<(typeof LENSES)[number]["id"][]>(["body", "reports", "care"]);
  if (!data) return error ? <LoadError error={error} onRetry={reload} /> : <PageSkeleton />;
  const lensOf = (id: string) => LENSES.find((l) => l.id === id)!;
  const lens = lensOf(order[0]);
  const slice = (l: (typeof LENSES)[number]) => {
    const nodes = graph.data?.nodes.filter((n) => n.type === "Patient" || (l.types as readonly string[]).includes(n.type)) ?? [];
    const ids = new Set(nodes.map((n) => n.id));
    return { nodes, edges: graph.data?.edges.filter((e) => ids.has(e.source) && ids.has(e.target)) ?? [] };
  };
  const enlarge = (id: (typeof LENSES)[number]["id"]) => {
    setOrder((o) => o.map((x) => (x === id ? o[0] : x === o[0] ? id : x)));
    setPicked(null);
  };
  const byCat = data.reduce<Record<string, BiomarkerSummary[]>>((acc, b) => ((acc[b.category] ??= []).push(b), acc), {});

  return (
    <Enter>
      <PageHeader eyebrow="Results" icon={ICONS.pulse} title="My Health" sub="Your measurements over time. Select a marker to see its history."
        action={<SyncStatus state={state} syncedAt={syncedAt} onRetry={reload} />} />
      <div className="mb-6">
        <Notice tone="info">Synthetic demonstration data from a fictional laboratory. Reference ranges are illustrative, not clinical guidance.</Notice>
      </div>
      {graph.data && graph.data.nodes.length > 1 && (
        <section aria-labelledby="map-title" className="mb-10 grid gap-4 lg:grid-cols-[1fr_280px]">
          <h2 id="map-title" className="sr-only">Your health maps</h2>
          <div className="grid grid-cols-2 gap-4 lg:col-span-2">
            {order.slice(1).map((id) => {
              const l = lensOf(id), g = slice(l);
              return (
                <button key={id} onClick={() => enlarge(id)}
                  className="group relative block min-w-0 rounded-lg text-left transition-transform duration-300 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-primary">
                  <KnowledgeGraph key={`small-${id}`} preview title={l.title} nodes={g.nodes} edges={g.edges} types={graph.data!.types}
                    selectedId={null} onSelect={() => {}} height="h-48 sm:h-56" />
                  <span className="pointer-events-none absolute bottom-2 right-2 z-20 rounded-md border border-line bg-surface/90 px-2 py-1 text-[11px] font-medium text-ink-muted transition-colors group-hover:border-primary group-hover:text-primary">
                    {g.nodes.length - 1} · Expand <span aria-hidden>↗</span>
                  </span>
                </button>
              );
            })}
          </div>
          <KnowledgeGraph key={`big-${lens.id}`} title={lens.title} {...slice(lens)} types={graph.data.types}
            selectedId={picked?.id ?? null} onSelect={setPicked} />
          <Card as="div" className="flex flex-col">
            {picked ? (
              <Appear key={picked.id}>
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">{graph.data.types.find((t) => t.type === picked.type)?.plural ?? picked.type}</p>
                <p className="mt-1 font-serif text-xl leading-snug">{picked.label}</p>
                {picked.details && <p className="mt-2 text-sm text-ink-muted">{picked.details}</p>}
                {picked.status && picked.type === "Biomarker" && (
                  <div className="mt-3"><Badge tone={statusTone[picked.status as keyof typeof statusTone] ?? "neutral"}>{RANGE_LABELS[picked.status] ?? picked.status}</Badge></div>
                )}
                {picked.link && <Link href={picked.link} className="mt-4 inline-block text-sm font-medium text-primary hover:underline">Open →</Link>}
              </Appear>
            ) : (
              <>
                <p className="font-serif text-xl leading-snug">{lens.title}</p>
                <p className="mt-2 text-sm text-ink-muted">{lens.intro} Select any point to see what it is, or press Tour.</p>
              </>
            )}
            <p className="mt-auto pt-6 text-xs text-ink-subtle">{graph.data.note}</p>
          </Card>
        </section>
      )}
      {data.every((b) => b.count === 0) && <EmptyState title="No measurements yet">Results appear here after your first assessment.</EmptyState>}
      <div data-stagger className="space-y-8">
        {Object.entries(byCat).map(([cat, items]) => (
          <section key={cat} aria-labelledby={`cat-${cat}`}>
            <h2 id={`cat-${cat}`} className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-ink-muted">
              <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />{cat}
              <span className="font-normal normal-case tracking-normal text-ink-subtle">· {items.filter((b) => b.status === "within").length}/{items.filter((b) => b.count).length} in range</span>
            </h2>
            <Card as="div" className="p-0 sm:p-0">
              <ul className="divide-y divide-line">
                {items.map((b) => (
                  <li key={b.code}>
                    <Link href={`/health/biomarkers/${b.code}`} className="group flex items-center justify-between gap-6 px-5 py-4 transition-colors hover:bg-surface-muted">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{b.name}</p>
                        <p className="text-sm text-ink-muted">
                          {b.count ? `${b.count} result${b.count > 1 ? "s" : ""} · latest ${formatDate(b.latest_at)}` : "No results"}
                        </p>
                      </div>
                      <div className="hidden w-40 shrink-0 md:block">
                        {b.latest_unit === b.unit && <RangeBar value={b.latest_value} low={b.ref_low} high={b.ref_high} status={b.status} compact />}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                        <span className="font-serif text-xl tabular-nums">
                          {b.latest_value ?? "-"} <span className="font-sans text-sm text-ink-muted">{b.latest_unit ?? b.unit}</span>
                        </span>
                        <Badge tone={statusTone[b.status]}>{RANGE_LABELS[b.status]}</Badge>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ))}
      </div>
    </Enter>
  );
}
