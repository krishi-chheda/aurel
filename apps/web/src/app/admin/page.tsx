"use client";

import { PLATFORM_LABELS, STEP_TITLES, relativeTime, type AdminCustomer, type OnboardingStep } from "@aurel/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { CountUp, Enter } from "@/components/motion/primitives";
import { Logo } from "@/components/site-chrome";
import { Badge, Card, CardHeader, EmptyState, LoadError, Notice, PageHeader, PageSkeleton, SessionOffline, cx } from "@/components/ui";
import { api, useSession } from "@/lib/session";
import { useResource } from "@/lib/use-resource";
import { FULL, gsap, useGSAP } from "@/lib/motion";

const STAGES: Record<string, string> = {
  onboarding: "Onboarding", awaiting_results: "Awaiting results", awaiting_care_plan: "Awaiting care plan",
  active_care: "Active care", maintenance: "Maintenance",
};
const RULES: Record<string, string> = {
  onboarding_stalled: "Onboarding stalled", missing_information: "Missing information",
  overdue_tasks: "Overdue tasks", appointment_request_sla: "Appointment request past SLA",
};

export default function Admin() {
  const { status, user, logout, retry } = useSession();
  const router = useRouter();
  const [stage, setStage] = useState("");
  const [flagged, setFlagged] = useState(false);

  useEffect(() => {
    if (status === "anon" || status === "expired") router.replace("/login?next=/dashboard");
  }, [status, router]);

  const allowed = status === "authed" && user && user.role !== "customer";
  const overview = useResource(() => (allowed ? api.admin.overview() : Promise.resolve(null)), [allowed]);
  const list = useResource(() => (allowed ? api.admin.customers({ stage: stage || undefined, flagged }) : Promise.resolve(null)), [allowed, stage, flagged]);

  if (status === "loading") return <main className="p-8"><PageSkeleton /></main>;
  if (status === "offline") return <SessionOffline onRetry={retry} />;
  // UI gate only for convenience - the API enforces roles on every /admin request.
  if (!allowed) return <main className="p-8"><EmptyState title="Staff only" action={<Link className="text-primary hover:underline" href="/dashboard">Go to your dashboard</Link>}>Your account doesn&apos;t have access to the operations dashboard.</EmptyState></main>;

  const o = overview.data;
  return (
    <div className="min-h-screen">
      <header className="flex h-16 items-center justify-between border-b border-line bg-surface px-4 sm:px-8">
        <div className="flex items-center gap-3"><Logo /><Badge tone="accent">Operations</Badge></div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-ink-muted sm:inline">{user.email} · {user.role}</span>
          <button onClick={logout} className="min-h-11 rounded-md px-3 hover:bg-surface-muted">Sign out</button>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-8">
        <PageHeader title="Customer operations" sub="Workflow status across customers, computed live from deterministic rules." />
        <Notice tone="warning" title="Synthetic records">{o?.note ?? "All customers here are fictional. Figures are not real business results."}</Notice>

        {overview.error && <LoadError error={overview.error} onRetry={overview.reload} />}
        {o && (
          <Enter className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {([
              ["Customers", o.customers, ""],
              ["Onboarding completion", o.onboarding_completion_rate, "%"],
              ["Overdue tasks", o.overdue_tasks, ""],
              ["Missing information", o.customers_missing_information, ""],
              ["Pending appointment requests", o.pending_appointment_requests, ""],
            ] as [string, number, string][]).map(([l, v, suffix]) => (
              <Card key={l} as="div" className="p-4 sm:p-5">
                <p className="text-sm text-ink-muted">{l}</p>
                <p className="mt-1 font-serif text-3xl"><CountUp value={v} suffix={suffix} /></p>
              </Card>
            ))}
          </Enter>
        )}

        {o && (
          <Enter className="grid gap-6 lg:grid-cols-3">
            <Card><CardHeader title="Journey stage" />
              <Bars data={Object.fromEntries(Object.entries(o.by_stage).map(([k, v]) => [STAGES[k] ?? k, v]))} /></Card>
            <Card><CardHeader title="Escalation flags by rule" />
              <Bars data={Object.fromEntries(Object.entries(o.flags_by_rule).map(([k, v]) => [RULES[k] ?? k, v]))} /></Card>
            <Card><CardHeader title="Last onboarding device" />
              <Bars data={Object.fromEntries(Object.entries(o.cross_device_onboarding).map(([k, v]) => [PLATFORM_LABELS[k] ?? k, v]))} /></Card>
          </Enter>
        )}

        <Card>
          <CardHeader title="Customers" sub={list.data ? `${list.data.total} shown` : undefined} action={
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm">Stage{" "}
                <select value={stage} onChange={(e) => setStage(e.target.value)} className="ml-1 min-h-10 rounded-md border border-line-strong bg-surface px-2">
                  <option value="">All</option>
                  {Object.entries(STAGES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
              <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} className="h-4 w-4" />Flagged only</label>
            </div>} />
          {list.error && <LoadError error={list.error} onRetry={list.reload} />}
          {!list.data ? <PageSkeleton /> : list.data.items.length === 0 ? <EmptyState title="No customers match" /> : (
            <div className="-mx-5 overflow-x-auto sm:-mx-6">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="border-b border-line text-ink-muted">
                  <tr>
                    <th className="px-5 py-2 font-medium sm:px-6">Customer</th><th className="py-2 font-medium">Stage</th>
                    <th className="py-2 font-medium">Onboarding</th><th className="py-2 font-medium">Tasks</th>
                    <th className="py-2 font-medium">Appointments</th><th className="py-2 pr-6 font-medium">Flags</th>
                  </tr>
                </thead>
                <tbody>{list.data.items.map((c) => <Row key={c.id} c={c} />)}</tbody>
              </table>
            </div>
          )}
        </Card>
        <p className="text-xs text-ink-subtle">
          Rules: onboarding inactive &gt; 3 days; any required profile field missing; open tasks past due; appointment
          requests waiting &gt; 48h. Coordinators don&apos;t see contact details; admins do. Every view is audit-logged.
        </p>
      </main>
    </div>
  );
}

function Row({ c }: { c: AdminCustomer }) {
  return (
    <tr className="border-b border-line align-top last:border-0">
      <td className="px-5 py-3 sm:px-6"><p className="font-medium">{c.name}</p>{c.email && <p className="text-ink-muted">{c.email}</p>}</td>
      <td className="py-3"><Badge tone="primary">{STAGES[c.stage] ?? c.stage}</Badge></td>
      <td className="py-3">
        {c.onboarding.status === "completed" ? "Complete" : STEP_TITLES[c.onboarding.current_step as OnboardingStep]}
        <p className="text-xs text-ink-muted">{PLATFORM_LABELS[c.onboarding.last_platform] ?? "-"} · {relativeTime(c.onboarding.updated_at)}</p>
      </td>
      <td className="py-3 tabular-nums">{c.open_tasks} open{c.overdue_tasks > 0 && <span className="text-warning"> · {c.overdue_tasks} overdue</span>}</td>
      <td className="py-3">{Object.entries(c.appointment_status).map(([k, v]) => `${v} ${k}`).join(", ") || "-"}</td>
      <td className="py-3 pr-6">
        <div className="flex flex-wrap gap-1">
          {c.flags.length === 0 ? <span className="text-ink-subtle">None</span> : c.flags.map((f) => (
            <Badge key={f.rule} tone={f.severity === "high" ? "danger" : f.severity === "medium" ? "warning" : "neutral"}>
              <span title={f.message}>{RULES[f.rule] ?? f.rule}</span>
            </Badge>
          ))}
        </div>
      </td>
    </tr>
  );
}

function Bars({ data }: { data: Record<string, number> }) {
  // Bars grow from zero in sequence once the panel is on screen.
  const root = useRef<HTMLUListElement>(null);
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add(FULL, () => {
      gsap.from(gsap.utils.toArray("[data-bar]", root.current), {
        scaleX: 0, duration: 0.9, stagger: 0.08, delay: 0.2, ease: "power3.out",
        scrollTrigger: { trigger: root.current, start: "top 90%", once: true },
      });
    });
    return () => mm.revert();
  }, { scope: root, dependencies: [JSON.stringify(data)], revertOnUpdate: true });
  const max = Math.max(1, ...Object.values(data));
  const entries = Object.entries(data);
  if (!entries.length) return <p className="text-sm text-ink-muted">No data</p>;
  return (
    <ul ref={root} className="space-y-3">
      {entries.map(([k, v]) => (
        <li key={k}>
          <div className="flex justify-between text-sm"><span>{k}</span><span className="tabular-nums text-ink-muted">{v}</span></div>
          <div className="mt-1 h-2 rounded-full bg-surface-muted"><div data-bar className={cx("h-2 origin-left rounded-full bg-primary")} style={{ width: `${(v / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}
