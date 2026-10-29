import {
  ApiError, DIET_LABELS, FAMILY_HISTORY_LABELS, GOAL_LABELS, PLATFORM_LABELS, STEP_TITLES, relativeTime, syncStateFor,
  type OnboardingState, type OnboardingStep, type SyncState,
} from "@aurel/shared";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";

import { Button, Card, ChipGroup, Field, LoadError, Loading, Notice, Screen, SyncStatus, Text, fieldErrors } from "@/components/ui";
import { api } from "@/lib/session";
import { usePalette } from "@/lib/theme";

type Draft = Record<string, unknown>;
const FORM_STEPS: OnboardingStep[] = ["basic_profile", "health_goals", "lifestyle", "history"];
const num = (v: string) => (v.trim() === "" ? null : Number(v));

export default function Onboarding() {
  const p = usePalette();
  const [st, setSt] = useState<OnboardingState | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [view, setView] = useState<OnboardingStep>("welcome");
  // Unsaved answers live in component state and are never dropped by a failed save or a background refresh.
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const dirty = useRef(new Set<string>());
  const [sync, setSync] = useState<SyncState>("idle");
  const [err, setErr] = useState<{ message?: string; fields: Record<string, string> }>({ fields: {} });
  const [conflictFrom, setConflictFrom] = useState<string | null>(null);

  const load = useCallback(() => api.onboarding().then((s) => {
      setSt(s);
      setView(s.current_step);
      setDrafts((d) => {
        const next = { ...s.answers };
        dirty.current.forEach((k) => (next[k] = d[k]));
        return next;
      });
      setLoadError(null);
  }, setLoadError), []);
  useEffect(() => { load(); }, [load]);

  const update = (step: string, patch: Draft) => {
    dirty.current.add(step);
    setDrafts((d) => ({ ...d, [step]: { ...d[step], ...patch } }));
  };

  async function save(step: OnboardingStep) {
    if (!st) return;
    setSync("saving");
    setErr({ fields: {} });
    try {
      const d = drafts[step] ?? {};
      const data = step === "basic_profile"
        ? { preferred_name: d.preferred_name || null, date_of_birth: d.date_of_birth, phone: d.phone || null, postcode: d.postcode }
        : step === "health_goals" ? { health_goals: d.health_goals ?? [] } : FORM_STEPS.includes(step) ? d : {};
      const s = await api.saveStep(step, st.version, data);
      dirty.current.delete(step);
      setSt(s);
      setConflictFrom(null);
      setSync("saved");
      setView(s.steps[s.steps.indexOf(step) + 1] ?? s.current_step);
    } catch (e) {
      const state = syncStateFor(e);
      setSync(state);
      if (e instanceof ApiError && state === "conflict") {
        const current = e.body.current as OnboardingState;
        setSt(current);
        setConflictFrom(PLATFORM_LABELS[current.last_platform] ?? "another device");
        if (current.status === "completed") setView("complete");
      } else {
        setErr({ message: e instanceof ApiError && e.code !== "validation_error" ? e.message : undefined, fields: fieldErrors(e) });
      }
    }
  }

  async function finish() {
    if (!st) return;
    setSync("saving");
    try {
      setSt(await api.completeOnboarding(st.version));
      setView("complete");
      setSync("saved");
    } catch (e) {
      setSync(syncStateFor(e));
      if (e instanceof ApiError && e.status === 409) setSt(e.body.current as OnboardingState);
      setErr({ message: e instanceof ApiError ? e.message : "Couldn't finish onboarding.", fields: {} });
    }
  }

  if (!st) return loadError ? <Screen><LoadError error={loadError} onRetry={load} /></Screen> : <Loading />;
  const idx = st.steps.indexOf(view);
  const visible = st.steps.filter((s) => s !== "complete");
  const d = drafts[view] ?? {};
  const str = (k: string) => (d[k] == null ? "" : String(d[k]));

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <Screen edges={["bottom"]}>
        <Text variant="muted" style={{ fontSize: 13 }}>
          {st.status === "completed" ? "Onboarding complete" : `Step ${Math.min(idx + 1, visible.length)} of ${visible.length}`}
          {st.completed_steps.length > 0 ? ` · last saved ${relativeTime(st.updated_at)} on ${PLATFORM_LABELS[st.last_platform] ?? "another device"}` : ""}
        </Text>
        <View style={{ flexDirection: "row", gap: 4 }} accessibilityLabel={`Step ${idx + 1} of ${visible.length}`}>
          {visible.map((s) => (
            <View key={s} style={{ flex: 1, height: 5, borderRadius: 3,
              backgroundColor: s === view ? p.primary : st.completed_steps.includes(s) ? p.primarySoft : p.surfaceMuted }} />
          ))}
        </View>
        <SyncStatus state={sync} onRetry={() => (view === "review" ? finish() : save(view))} />

        {conflictFrom && (
          <Notice tone="warning" title={`Progress was updated on ${conflictFrom}`}
            action={<Button small variant="secondary" title="Go to latest step" onPress={() => { setConflictFrom(null); setView(st.current_step); }} />}>
            Your answers on this screen haven&apos;t been saved. Save again to apply them, or continue from the latest step.
          </Notice>
        )}
        {sync === "session_expired" && (
          <Notice tone="warning" title="Your session expired" action={<Button small title="Sign in" onPress={() => router.replace("/login")} />}>
            Sign in again, then reopen onboarding - every step you saved is kept on the server.
          </Notice>
        )}
        {sync === "offline" && <Notice tone="warning" title="You're offline">Your answers are kept on screen. Tap Save again when you&apos;re connected.</Notice>}
        {err.message && <Notice tone="danger">{err.message}</Notice>}

        <Card>
          <Text variant="title" accessibilityRole="header">{STEP_TITLES[view]}</Text>
          {view === "welcome" && (
            <Text variant="muted">A few short questions for your (fictional) care team. Every step saves as you go, so you can finish on the web too. Please use made-up answers - this is a demo.</Text>
          )}
          {view === "basic_profile" && (
            <>
              <Field label="Preferred name (optional)" value={str("preferred_name")} onChangeText={(v) => update(view, { preferred_name: v })} error={err.fields.preferred_name} />
              <Field label="Date of birth" placeholder="YYYY-MM-DD" value={str("date_of_birth")} onChangeText={(v) => update(view, { date_of_birth: v })}
                keyboardType="numbers-and-punctuation" error={err.fields.date_of_birth} hint="Format: YYYY-MM-DD" />
              <Field label="Mobile (optional)" value={str("phone")} onChangeText={(v) => update(view, { phone: v })} keyboardType="phone-pad" error={err.fields.phone} />
              <Field label="Postcode" value={str("postcode")} onChangeText={(v) => update(view, { postcode: v })} keyboardType="number-pad" error={err.fields.postcode} />
            </>
          )}
          {view === "health_goals" && (
            <ChipGroup label="What would you like to focus on?" options={GOAL_LABELS} max={5} value={(d.health_goals as string[]) ?? []}
              onChange={(v) => update(view, { health_goals: v })} error={err.fields.health_goals} />
          )}
          {view === "lifestyle" && (
            <>
              <Field label="Active days per week" value={str("activity_days_per_week")} onChangeText={(v) => update(view, { activity_days_per_week: num(v) })} keyboardType="number-pad" error={err.fields.activity_days_per_week} />
              <Field label="Average sleep (hours)" value={str("sleep_hours")} onChangeText={(v) => update(view, { sleep_hours: num(v) })} keyboardType="decimal-pad" error={err.fields.sleep_hours} />
              <ChipGroup single label="Diet" options={DIET_LABELS} value={d.diet ? [d.diet as string] : []} onChange={(v) => update(view, { diet: v[0] })} error={err.fields.diet} />
              <Field label="Alcoholic drinks per week" value={str("alcohol_drinks_per_week")} onChangeText={(v) => update(view, { alcohol_drinks_per_week: num(v) })} keyboardType="number-pad" error={err.fields.alcohol_drinks_per_week} />
              <ChipGroup single label="Do you smoke?" options={{ yes: "Yes", no: "No" }} value={d.smoker === undefined ? [] : [d.smoker ? "yes" : "no"]}
                onChange={(v) => update(view, { smoker: v[0] === "yes" })} error={err.fields.smoker} />
            </>
          )}
          {view === "history" && (
            <>
              <ChipGroup label="Family history" options={FAMILY_HISTORY_LABELS} value={(d.family_history as string[]) ?? []} onChange={(v) => update(view, { family_history: v })} error={err.fields.family_history} />
              <ChipGroup single label="Do you take regular medication?" options={{ yes: "Yes", no: "No" }}
                value={d.takes_medication === undefined ? [] : [d.takes_medication ? "yes" : "no"]} onChange={(v) => update(view, { takes_medication: v[0] === "yes" })} error={err.fields.takes_medication} />
              <Field label="Anything else? (optional)" value={str("conditions_note")} onChangeText={(v) => update(view, { conditions_note: v || null })} multiline maxLength={500}
                style={{ minHeight: 90, paddingTop: 12, textAlignVertical: "top" }} hint="Demo only - don't enter real medical information." />
            </>
          )}
          {view === "review" && (
            <View>
              {[
                ["basic_profile", "Date of birth", String(drafts.basic_profile?.date_of_birth ?? "-")],
                ["basic_profile", "Postcode", String(drafts.basic_profile?.postcode ?? "-")],
                ["health_goals", "Goals", ((drafts.health_goals?.health_goals as string[]) ?? []).map((g) => GOAL_LABELS[g]).join(", ") || "-"],
                ["lifestyle", "Diet", DIET_LABELS[drafts.lifestyle?.diet as string] ?? "-"],
                ["history", "Family history", ((drafts.history?.family_history as string[]) ?? []).map((g) => FAMILY_HISTORY_LABELS[g]).join(", ") || "-"],
              ].map(([step, k, v]) => (
                <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: p.border }}>
                  <View style={{ flex: 1 }}><Text variant="muted" style={{ fontSize: 13 }}>{k}</Text><Text>{v}</Text></View>
                  <Pressable onPress={() => setView(step as OnboardingStep)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Edit ${k}`}>
                    <Text color="primary" style={{ fontWeight: "600" }}>Edit</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
          {view === "complete" && (
            <>
              <Text variant="muted">Thanks - your profile is set up and synced to the web.</Text>
              <Button title="Go to your dashboard" onPress={() => router.replace("/dashboard")} />
            </>
          )}
        </Card>

        {view !== "complete" && (
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
            {idx > 0 ? <Button variant="ghost" title="Back" onPress={() => setView(st.steps[idx - 1])} /> : <View />}
            <Button style={{ flex: 1 }} loading={sync === "saving"}
              title={view === "welcome" ? "Get started" : view === "review" ? "Finish" : "Save and continue"}
              onPress={() => (view === "review" ? finish() : save(view))} />
          </View>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
