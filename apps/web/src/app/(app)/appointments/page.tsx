"use client";

import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_TYPE_LABELS, formatDateTime, type Appointment } from "@aurel/shared";
import Link from "next/link";
import { useState } from "react";

import { BookingPanel } from "@/components/booking-panel";
import { Badge, Button, Card, CardHeader, EmptyState, LoadError, Notice, PageHeader, PageSkeleton, SyncStatus } from "@/components/ui";
import { Enter } from "@/components/motion/primitives";
import { DateTile, ICONS, Icon, IconBadge } from "@/components/visuals";
import { api } from "@/lib/session";
import { useResource } from "@/lib/use-resource";

export default function AppointmentsPage() {
  const { data, error, state, syncedAt, reload } = useResource(() => api.appointments());
  const [booking, setBooking] = useState(false);
  if (!data) return error ? <LoadError error={error} onRetry={reload} /> : <PageSkeleton />;

  return (
    <Enter className="space-y-6">
      <PageHeader eyebrow="Care" icon={ICONS.calendar} title="Appointments" sub="Request, reschedule or cancel demo appointments."
        action={<div className="flex items-center gap-4"><SyncStatus state={state} syncedAt={syncedAt} onRetry={reload} />
          {!booking && <Button onClick={() => setBooking(true)}>Request appointment</Button>}</div>} />
      <Notice tone="warning" title="Demonstration bookings">{data.demo_notice}</Notice>

      {booking && <BookingPanel onDone={() => { setBooking(false); reload(); }} onCancel={() => setBooking(false)} />}

      <Card>
        <CardHeader title="Upcoming" />
        {data.upcoming.length ? <List items={data.upcoming} upcoming /> : <EmptyState title="No upcoming appointments" />}
      </Card>
      <Card>
        <CardHeader title="Past and cancelled" />
        {data.past.length ? <List items={data.past} /> : <EmptyState title="No past appointments" />}
      </Card>
    </Enter>
  );
}

const TYPE_ICON: Record<string, string> = { gp_review: ICONS.chat, blood_test: ICONS.flask, health_coach: ICONS.heart };
const daysUntil = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);

function List({ items, upcoming }: { items: Appointment[]; upcoming?: boolean }) {
  return (
    <ul className="space-y-3">
      {items.map((a) => {
        const days = daysUntil(a.starts_at);
        return (
          <li key={a.id}>
            <Link href={`/appointments/${a.id}`}
              className={`group flex items-center gap-4 rounded-lg border border-line p-3 transition-all duration-300 hover:border-primary/40 sm:p-4 ${upcoming ? "bg-canvas hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-28px_rgba(31,39,43,.4)]" : "hover:bg-surface-muted"}`}>
              <DateTile iso={a.starts_at} muted={!upcoming} />
              <div className="hidden sm:block"><IconBadge d={TYPE_ICON[a.type] ?? ICONS.calendar} tone={upcoming ? "primary" : "neutral"} size="sm" /></div>
              <div className="min-w-0 flex-1">
                <p className="font-medium group-hover:text-primary">{APPOINTMENT_TYPE_LABELS[a.type] ?? a.title}</p>
                <p className="text-sm text-ink-muted">{formatDateTime(a.starts_at)} · {a.duration_min} min · {a.practitioner}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Badge tone={a.status === "cancelled" ? "neutral" : a.status === "completed" ? "success" : "info"}>{APPOINTMENT_STATUS_LABELS[a.status]}</Badge>
                {upcoming && <span className="text-xs text-ink-subtle">{days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`}</span>}
              </div>
              <Icon d="M9 6l6 6-6 6" className="hidden shrink-0 text-ink-subtle transition-transform duration-300 group-hover:translate-x-1 sm:block" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
