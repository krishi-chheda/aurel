"use client";

import { ApiError, DIET_LABELS, FAMILY_HISTORY_LABELS, GOAL_LABELS, PLATFORM_LABELS, relativeTime, syncStateFor, type Me, type Profile, type SyncState } from "@aurel/shared";
import { useState } from "react";

import { Button, Card, CardHeader, ChipGroup, Field, LoadError, Notice, PageHeader, PageSkeleton, ProgressBar, SyncStatus, fieldErrors } from "@/components/ui";
import { CountUp, Enter } from "@/components/motion/primitives";
import { ICONS, Icon } from "@/components/visuals";
import { api, useSession } from "@/lib/session";
import { useResource } from "@/lib/use-resource";

type Editable = Pick<Profile, "first_name" | "last_name" | "preferred_name" | "date_of_birth" | "phone" | "postcode" | "health_goals" | "notification_prefs">;
const pick = (p: Profile): Editable => ({
  first_name: p.first_name, last_name: p.last_name, preferred_name: p.preferred_name, date_of_birth: p.date_of_birth,
  phone: p.phone, postcode: p.postcode, health_goals: p.health_goals, notification_prefs: p.notification_prefs,
});
const PREFS = { appointments: "Appointment reminders", tasks: "Task and check-in reminders", reports: "New report available" };

export default function ProfilePage() {
  const { logout } = useSession();
  const { data, error, reload, setData } = useResource(() => api.me());
  const [form, setForm] = useState<Editable | null>(null);
  const [dirty, setDirty] = useState(false);
  const [sync, setSync] = useState<SyncState>("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<Profile | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  // Account actions only sign this device out once the server confirmed; a failure must not look like success.
  async function accountAction(call: () => Promise<unknown>) {
    setAccountError(null);
    try {
      await call();
    } catch (e) {
      return setAccountError((e as Error).message || "That didn't go through. Please try again.");
    }
    logout();
  }

  // Take the server copy unless the user is mid-edit (a background refresh must never wipe their typing).
  // Adjusting state while rendering (React's pattern for deriving state from changed props/data).
  const [seen, setSeen] = useState<typeof data>(undefined);
  if (data && !dirty && data !== seen) { setSeen(data); setForm(pick(data.profile)); }

  if (!data || !form) return error ? <LoadError error={error} onRetry={reload} /> : <PageSkeleton />;
  const p = data.profile;

  const set = (patch: Partial<Editable>) => { setForm({ ...form, ...patch }); setDirty(true); setSync("idle"); };

  async function save(version = p.version) {
    const changes = Object.fromEntries(Object.entries(form!).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify((p as never)[k])));
    if (!Object.keys(changes).length) return setDirty(false);
    setSync("saving");
    setErrors({});
    try {
      const me: Me = await api.updateProfile({ version, ...changes, phone: form!.phone || null, preferred_name: form!.preferred_name || null });
      setData(me);
      setDirty(false);
      setConflict(null);
      setSync("saved");
    } catch (e) {
      setSync(syncStateFor(e));
      if (e instanceof ApiError && e.status === 409) setConflict(e.body.current as Profile);
      else setErrors(fieldErrors(e));
    }
  }

  return (
    <Enter className="space-y-6">
      <PageHeader eyebrow="Account" icon={ICONS.user} title="Profile" sub={`Last updated ${relativeTime(p.updated_at)} on ${PLATFORM_LABELS[p.updated_from] ?? "another device"}`} />

      {conflict && (
        <Notice tone="warning" title={`Your profile was changed on ${PLATFORM_LABELS[conflict.updated_from] ?? "another device"}`}
          action={<div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => { setData({ ...data, profile: conflict }); setForm(pick(conflict)); setDirty(false); setConflict(null); setSync("idle"); }}>Use latest</Button>
            <Button size="sm" onClick={() => { setData({ ...data, profile: conflict }); save(conflict.version); }}>Keep my changes</Button>
          </div>}>
          Latest saved values: {conflict.preferred_name || conflict.first_name}, {conflict.phone || "no phone"}, postcode {conflict.postcode || "-"}.
        </Notice>
      )}

      {(() => {
        // Completeness: what a care team would need. Purely informational.
        const items: [string, boolean][] = [["Date of birth", !!p.date_of_birth], ["Mobile", !!p.phone], ["Postcode", !!p.postcode],
          ["Health goals", p.health_goals.length > 0], ["Lifestyle", Object.keys(p.lifestyle).length > 0], ["Health history", Object.keys(p.history).length > 0]];
        const pct = Math.round((items.filter(([, ok]) => ok).length / items.length) * 100);
        return (
          <Card>
            <div className="grid gap-6 md:grid-cols-[auto_1fr_1.2fr] md:items-center">
              <div className="grid h-20 w-20 place-items-center rounded-full bg-primary font-serif text-3xl text-white dark:text-canvas">
                {(p.first_name[0] ?? "") + (p.last_name[0] ?? "")}
              </div>
              <div className="min-w-0">
                <p className="font-serif text-2xl leading-tight">{p.preferred_name || p.first_name} {p.last_name}</p>
                <p className="truncate text-sm text-ink-muted">{data.user.email}</p>
                <p className="mt-1 text-xs text-ink-subtle">Synced across your devices</p>
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium">Profile completeness</span>
                  <span className="font-serif text-2xl"><CountUp value={pct} suffix="%" /></span>
                </div>
                <div className="mt-2"><ProgressBar value={pct} label="Profile completeness" /></div>
                <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {items.map(([label, ok]) => (
                    <li key={label} className={`inline-flex items-center gap-1 ${ok ? "text-success" : "text-ink-subtle"}`}>
                      <Icon d={ok ? ICONS.check : "M6 12h12"} size={13} />{label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        );
      })()}

      <form noValidate onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-6">
        <Card>
          <CardHeader title="Basic information" action={<SyncStatus state={sync} onRetry={() => save()} />} />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="First name" value={form.first_name} onChange={(e) => set({ first_name: e.target.value })} error={errors.first_name} />
            <Field label="Last name" value={form.last_name} onChange={(e) => set({ last_name: e.target.value })} error={errors.last_name} />
            <Field label="Preferred name" value={form.preferred_name ?? ""} onChange={(e) => set({ preferred_name: e.target.value })} error={errors.preferred_name} />
            <Field label="Date of birth" type="date" value={form.date_of_birth ?? ""} onChange={(e) => set({ date_of_birth: e.target.value || null })} error={errors.date_of_birth} />
            <Field label="Mobile" type="tel" value={form.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} error={errors.phone} />
            <Field label="Postcode" value={form.postcode ?? ""} onChange={(e) => set({ postcode: e.target.value || null })} error={errors.postcode} />
          </div>
          <p className="mt-4 text-sm text-ink-muted">Email: {data.user.email}</p>
        </Card>

        <Card>
          <CardHeader title="Health goals" />
          <ChipGroup legend="Focus areas" options={GOAL_LABELS} max={5} value={form.health_goals} onChange={(v) => set({ health_goals: v })} error={errors.health_goals} />
        </Card>

        <Card>
          <CardHeader title="Notification preferences" sub="Push notifications never include health details." />
          <div className="space-y-3">
            {Object.entries(PREFS).map(([k, l]) => (
              <label key={k} className="flex min-h-11 items-center justify-between gap-4">
                <span>{l}</span>
                <input type="checkbox" className="h-5 w-5 accent-[var(--c-primary)]" checked={form.notification_prefs[k] ?? true}
                  onChange={(e) => set({ notification_prefs: { ...form.notification_prefs, [k]: e.target.checked } })} />
              </label>
            ))}
          </div>
        </Card>

        {dirty && (
          <div className="sticky bottom-20 z-10 flex items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4 shadow-lg lg:bottom-4">
            <span className="text-sm text-ink-muted">You have unsaved changes</span>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => { setForm(pick(p)); setDirty(false); setErrors({}); }}>Discard</Button>
              <Button type="submit" loading={sync === "saving"}>Save changes</Button>
            </div>
          </div>
        )}
      </form>

      <Card>
        <CardHeader title="Lifestyle and history" sub="From your onboarding answers." />
        <dl className="grid gap-4 text-[15px] sm:grid-cols-2">
          <Row k="Active days per week" v={p.lifestyle.activity_days_per_week} />
          <Row k="Sleep" v={p.lifestyle.sleep_hours != null ? `${p.lifestyle.sleep_hours} h` : null} />
          <Row k="Diet" v={DIET_LABELS[p.lifestyle.diet as string]} />
          <Row k="Family history" v={((p.history.family_history as string[]) ?? []).map((x) => FAMILY_HISTORY_LABELS[x]).join(", ")} />
        </dl>
      </Card>

      <Card>
        <CardHeader title="Account" />
        {accountError && <div className="mb-3"><Notice tone="danger" title="Nothing was changed">{accountError}</Notice></div>}
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => accountAction(() => api.request("POST", "/auth/logout-all"))}>Sign out on all devices</Button>
          {!confirmDeactivate ? <Button variant="danger" onClick={() => setConfirmDeactivate(true)}>Deactivate account</Button> : (
            <Notice tone="danger" alert={false} title="Deactivate your account?" action={<div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setConfirmDeactivate(false)}>Cancel</Button>
              <Button size="sm" variant="danger" onClick={() => accountAction(api.deactivate)}>Deactivate</Button></div>}>
              You&apos;ll be signed out everywhere and won&apos;t be able to sign in again.
            </Notice>
          )}
        </div>
      </Card>
    </Enter>
  );
}

function Row({ k, v }: { k: string; v: unknown }) {
  return <div><dt className="text-sm text-ink-muted">{k}</dt><dd>{v === null || v === undefined || v === "" ? "-" : String(v)}</dd></div>;
}
