"use client";

import { APPOINTMENT_TYPE_LABELS, ApiError, formatDateTime, newRequestId, syncStateFor, type AppointmentType, type Slot } from "@aurel/shared";
import { useEffect, useRef, useState } from "react";

import { Button, Card, CardHeader, Notice, Skeleton, cx } from "./ui";
import { Appear, pop } from "./motion/primitives";
import { api } from "@/lib/session";

/**
 * Request a new demo appointment, or (with `reschedule`) pick a new time for an existing one.
 * The idempotency key is created once per attempt so a retry after a network failure can't double-book.
 */
export function BookingPanel({ onDone, onCancel, reschedule }:
  { onDone: () => void; onCancel: () => void; reschedule?: { id: string; type: AppointmentType; version: number } }) {
  const [type, setType] = useState<AppointmentType>(reschedule?.type ?? "gp_review");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; retry: boolean } | null>(null);
  const requestId = useRef(newRequestId());

  const chooseType = (t: AppointmentType) => { setType(t); setSlots(null); setPick(null); };
  useEffect(() => {
    api.slots(type).then(setSlots).catch((e) => setError({ text: e.message, retry: false }));
  }, [type]);

  async function submit() {
    if (!pick) return;
    setBusy(true);
    setError(null);
    try {
      if (reschedule) await api.rescheduleAppointment(reschedule.id, pick, reschedule.version);
      else await api.requestAppointment({ type, starts_at: pick, client_request_id: requestId.current });
      onDone();
    } catch (e) {
      const s = syncStateFor(e);
      setError({ text: e instanceof ApiError ? e.message : "Something went wrong.", retry: s === "offline" || s === "failed" });
    } finally {
      setBusy(false);
    }
  }

  const days = Object.entries((slots ?? []).reduce<Record<string, Slot[]>>((acc, s) => {
    const k = new Date(s.starts_at).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
    (acc[k] ??= []).push(s);
    return acc;
  }, {})).slice(0, 6);

  return (
    <Appear>
    <Card className="border-primary/30">
      <CardHeader title={reschedule ? "Choose a new time" : "Request an appointment"} sub="Demo availability. Times are shown in your local time zone." />
      {!reschedule && (
        <fieldset className="mb-5">
          <legend className="mb-2 text-sm font-medium">Type</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(APPOINTMENT_TYPE_LABELS) as AppointmentType[]).map((t) => (
              <label key={t} className={cx("inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
                type === t ? "border-primary bg-primary-soft font-medium text-primary" : "border-line-strong bg-surface")}>
                <input type="radio" name="type" className="sr-only" checked={type === t} onChange={() => chooseType(t)} />
                {APPOINTMENT_TYPE_LABELS[t]}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {!slots ? <Skeleton className="h-28" /> : (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Time</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {days.map(([day, ss]) => (
              <div key={day} className="rounded-md border border-line p-3">
                <p className="mb-2 text-sm font-semibold">{day}</p>
                <div className="flex flex-wrap gap-2">
                  {ss.map((s) => (
                    <label key={s.starts_at} className={cx("inline-flex min-h-10 cursor-pointer items-center rounded-md border px-3 text-sm tabular-nums has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
                      pick === s.starts_at ? "border-primary bg-primary text-white dark:text-canvas" : "border-line-strong bg-surface")}>
                      <input type="radio" name="slot" className="sr-only" checked={pick === s.starts_at} onChange={(e) => { setPick(s.starts_at); pop(e.currentTarget.parentElement, 1.12); }}
                        aria-label={formatDateTime(s.starts_at)} />
                      {new Date(s.starts_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </fieldset>
      )}
      {error && <div className="mt-4"><Notice tone="danger" action={error.retry && <Button size="sm" variant="secondary" onClick={submit}>Retry</Button>}>{error.text}</Notice></div>}
      <div className="mt-5 flex justify-end gap-3">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={submit} disabled={!pick} loading={busy}>{reschedule ? "Request new time" : "Send demo request"}</Button>
      </div>
    </Card>
    </Appear>
  );
}
