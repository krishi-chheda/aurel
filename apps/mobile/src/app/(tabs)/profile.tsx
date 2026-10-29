import { ApiError, GOAL_LABELS, PLATFORM_LABELS, relativeTime, syncStateFor, type Profile, type SyncState } from "@aurel/shared";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Switch, View } from "react-native";

import { Button, Card, CardTitle, ChipGroup, Field, LoadError, Loading, Notice, Screen, SyncStatus, Text, fieldErrors } from "@/components/ui";
import { api, useSession } from "@/lib/session";
import { usePalette } from "@/lib/theme";
import { useResource } from "@/lib/use-resource";

type Editable = Pick<Profile, "first_name" | "last_name" | "preferred_name" | "phone" | "postcode" | "health_goals" | "notification_prefs">;
const pick = (p: Profile): Editable => ({ first_name: p.first_name, last_name: p.last_name, preferred_name: p.preferred_name,
  phone: p.phone, postcode: p.postcode, health_goals: p.health_goals, notification_prefs: p.notification_prefs });
const PREFS = { appointments: "Appointment reminders", tasks: "Task reminders", reports: "New reports" };

export default function ProfileScreen() {
  const pal = usePalette();
  const { user, logout } = useSession();
  const { data, error, reload, setData, refreshing, onRefresh } = useResource(() => api.me());
  const [form, setForm] = useState<Editable | null>(null);
  const [dirty, setDirty] = useState(false);
  const [sync, setSync] = useState<SyncState>("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<Profile | null>(null);

  // A refresh never overwrites what the user is typing.
  // Adjusting state while rendering (React's pattern for deriving state from changed data).
  const [seen, setSeen] = useState<typeof data>(undefined);
  if (data && !dirty && data !== seen) { setSeen(data); setForm(pick(data.profile)); }
  if (!data || !form) return error ? <Screen><LoadError error={error} onRetry={reload} /></Screen> : <Loading />;
  const p = data.profile;
  const set = (patch: Partial<Editable>) => { setForm({ ...form, ...patch }); setDirty(true); setSync("idle"); };

  async function save(version = p.version) {
    const changes = Object.fromEntries(Object.entries(form!).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify((p as never)[k])));
    if (!Object.keys(changes).length) return setDirty(false);
    setSync("saving");
    setErrors({});
    try {
      if ("phone" in changes) changes.phone = changes.phone || null;
      if ("preferred_name" in changes) changes.preferred_name = changes.preferred_name || null;
      setData(await api.updateProfile({ version, ...changes }));
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
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Text variant="muted">Last updated {relativeTime(p.updated_at)} on {PLATFORM_LABELS[p.updated_from] ?? "another device"}</Text>
      {conflict && (
        <Notice tone="warning" title={`Changed on ${PLATFORM_LABELS[conflict.updated_from] ?? "another device"}`}
          action={<View style={{ flexDirection: "row", gap: 8 }}>
            <Button small variant="secondary" title="Use latest" onPress={() => { setData({ ...data, profile: conflict }); setForm(pick(conflict)); setDirty(false); setConflict(null); setSync("idle"); }} />
            <Button small title="Keep mine" onPress={() => { setData({ ...data, profile: conflict }); save(conflict.version); }} />
          </View>}>
          {`Latest: ${conflict.preferred_name || conflict.first_name}, ${conflict.phone || "no phone"}, postcode ${conflict.postcode || "-"}.`}
        </Notice>
      )}
      <Card>
        <CardTitle title="Basic information" action={<SyncStatus state={sync} onRetry={() => save()} />} />
        <Field label="First name" value={form.first_name} onChangeText={(v) => set({ first_name: v })} error={errors.first_name} />
        <Field label="Last name" value={form.last_name} onChangeText={(v) => set({ last_name: v })} error={errors.last_name} />
        <Field label="Preferred name" value={form.preferred_name ?? ""} onChangeText={(v) => set({ preferred_name: v })} error={errors.preferred_name} />
        <Field label="Mobile" value={form.phone ?? ""} onChangeText={(v) => set({ phone: v })} keyboardType="phone-pad" error={errors.phone} />
        <Field label="Postcode" value={form.postcode ?? ""} onChangeText={(v) => set({ postcode: v || null })} keyboardType="number-pad" error={errors.postcode} />
        <Text variant="muted">Email: {user?.email}</Text>
      </Card>
      <Card>
        <ChipGroup label="Health goals" options={GOAL_LABELS} max={5} value={form.health_goals} onChange={(v) => set({ health_goals: v })} error={errors.health_goals} />
      </Card>
      <Card>
        <CardTitle title="Notifications" sub="Lock-screen text never includes health details." />
        {Object.entries(PREFS).map(([k, l]) => (
          <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 44 }}>
            <Text>{l}</Text>
            <Switch accessibilityLabel={l} value={form.notification_prefs[k] ?? true} trackColor={{ true: pal.primary }}
              onValueChange={(v) => set({ notification_prefs: { ...form.notification_prefs, [k]: v } })} />
          </View>
        ))}
        <Text variant="muted" style={{ fontSize: 12 }}>Push delivery isn&apos;t enabled in this prototype; preferences are saved for when it is.</Text>
      </Card>
      {dirty && (
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button variant="ghost" title="Discard" onPress={() => { setForm(pick(p)); setDirty(false); setErrors({}); }} />
          <Button style={{ flex: 1 }} title="Save changes" loading={sync === "saving"} onPress={() => save()} />
        </View>
      )}
      <Card>
        <CardTitle title="More" />
        <Button variant="secondary" title="Onboarding answers" onPress={() => router.push("/onboarding")} />
        <Button variant="secondary" title="Support" onPress={() => router.push("/support")} />
        <Button variant="secondary" title="Sign out" onPress={logout} />
        <Button variant="danger" title="Deactivate account" onPress={() => Alert.alert("Deactivate your account?", "You'll be signed out everywhere and can't sign in again.", [
          { text: "Cancel", style: "cancel" },
          { text: "Deactivate", style: "destructive", onPress: async () => {
            // Only sign out once the server confirmed; otherwise the account would silently stay active.
            try { await api.deactivate(); } catch (e) {
              return Alert.alert("Account not deactivated", (e as Error).message || "Please try again.");
            }
            logout();
          } },
        ])} />
      </Card>
    </Screen>
  );
}
