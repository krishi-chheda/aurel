"use client";

import { APPOINTMENT_STATUS_LABELS, ApiError, formatDateTime } from "@aurel/shared";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { BookingPanel } from "@/components/booking-panel";
import { Badge, Button, Card, CardHeader, EmptyState, LoadError, Notice, PageHeader, PageSkeleton } from "@/components/ui";
import { Enter } from "@/components/motion/primitives";
import { DateTile, ICONS, Icon, IconBadge } from "@/components/visuals";
import { api } from "@/lib/session";
import { useResource } from "@/lib/use-resource";

// Outside the component: reads the clock, which the React Compiler does not allow during render.
function daysUntil(iso: string) {
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  return d <= 0 ? "Today" : d === 1 ? "Tomorrow" : `In ${d} days`;
}

export default function AppointmentDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: a, error, reload, setData } = useResource(() => api.appointment(id), [id]);
  const [mode, setMode] = useState<"view" | "reschedule" | "confirm-cancel">("view");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!a) {
    if (error instanceof ApiError && error.status === 404) {
      return <EmptyState title="Appointment not found" action={<Link className="text-primary hover:underline" href="/appointments">All appointments</Link>} />;
    }
    return error ? <LoadError error={error} onRetry={reload} /> : <PageSkeleton />;
  }
  const active = a.status === "requested" || a.status === "scheduled";
  const future = new Date(a.starts_at) > new Date();

  async function cancel() {
    setBusy(true);
    setMsg(null);
    try {
      setData(await api.cancelAppointment(a!.id));
      setMode("view");
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Couldn't cancel. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Enter className="space-y-6">
      <Link href="/appointments" className="text-sm text-primary hover:underline">← Appointments</Link>
      <PageHeader eyebrow="Appointment" icon={ICONS.calendar} title={a.title} sub={formatDateTime(a.starts_at)} action={<Badge tone="info">{APPOINTMENT_STATUS_LABELS[a.status]}</Badge>} />
      {a.is_demo && <Notice tone="warning">Demonstration appointment. No real clinic or practitioner is involved.</Notice>}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <div className="flex items-center gap-5">
            <DateTile iso={a.starts_at} muted={!active} />
            <div>
              <p className="font-serif text-2xl leading-tight">{new Date(a.starts_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}</p>
              <p className="text-sm text-ink-muted">{a.duration_min} minutes</p>
              {active && future && (
                <p className="mt-1 text-sm font-medium text-primary">
                  {daysUntil(a.starts_at)}
                </p>
              )}
            </div>
          </div>
          <ul className="mt-6 space-y-4 text-[15px]">
            <li className="flex items-center gap-3"><IconBadge d={ICONS.user} size="sm" /><span><span className="block text-xs text-ink-subtle">With</span>{a.practitioner}</span></li>
            <li className="flex items-center gap-3"><IconBadge d={ICONS.pin} size="sm" /><span><span className="block text-xs text-ink-subtle">Where</span>{a.location}</span></li>
            <li className="flex items-center gap-3"><IconBadge d={ICONS.clock} size="sm" /><span><span className="block text-xs text-ink-subtle">Status</span>{APPOINTMENT_STATUS_LABELS[a.status]}</span></li>
          </ul>
        </Card>
        <Card>
          <CardHeader title="How to prepare" />
          {a.prep_notes.length ? (
            <ul className="space-y-3 text-[15px]">
              {a.prep_notes.map((n) => (
                <li key={n} className="flex items-start gap-3 rounded-md bg-surface-muted/60 px-3 py-2.5">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"><Icon d={ICONS.check} size={13} /></span>{n}
                </li>
              ))}
            </ul>
          ) : <p className="text-ink-muted">No preparation needed.</p>}
        </Card>
      </div>

      {msg && <Notice tone="danger">{msg}</Notice>}
      {active && future && mode === "view" && (
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setMode("reschedule")}>Reschedule</Button>
          <Button variant="danger" onClick={() => setMode("confirm-cancel")}>Cancel appointment</Button>
        </div>
      )}
      {mode === "confirm-cancel" && (
        <Notice tone="danger" alert={false} title="Cancel this appointment?" action={
          <div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => setMode("view")}>Keep it</Button>
            <Button size="sm" variant="danger" loading={busy} onClick={cancel}>Yes, cancel</Button></div>}>
          This also removes its preparation task.
        </Notice>
      )}
      {mode === "reschedule" && (
        <BookingPanel reschedule={{ id: a.id, type: a.type, version: a.version }} onCancel={() => setMode("view")}
          onDone={() => { setMode("view"); reload(); }} />
      )}
    </Enter>
  );
}
