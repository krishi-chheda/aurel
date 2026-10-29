import { APPOINTMENT_TYPE_LABELS, ApiError, newRequestId, syncStateFor, type AppointmentType, type Slot } from "@aurel/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { Button, Card, Chip, ChipGroup, Loading, Notice, Screen, Text } from "@/components/ui";
import { api } from "@/lib/session";

/** Request a demo appointment, or reschedule one when opened with ?reschedule=<id>&version=<n>&type=<t>. */
export default function NewAppointment() {
  const q = useLocalSearchParams<{ reschedule?: string; version?: string; type?: AppointmentType }>();
  const [type, setType] = useState<AppointmentType>(q.type ?? "gp_review");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; retry: boolean } | null>(null);
  const requestId = useRef(newRequestId()); // reused on retry so a lost response can't double-book

  const chooseType = (t: AppointmentType) => { setType(t); setSlots(null); setPick(null); };
  useEffect(() => {
    api.slots(type).then(setSlots).catch((e) => setError({ text: e.message, retry: false }));
  }, [type]);

  async function submit() {
    if (!pick) return;
    setBusy(true);
    setError(null);
    try {
      if (q.reschedule) await api.rescheduleAppointment(q.reschedule, pick, Number(q.version));
      else await api.requestAppointment({ type, starts_at: pick, client_request_id: requestId.current });
      router.back();
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
    <Screen edges={["bottom"]}>
      <Notice tone="warning">Demonstration booking - no real clinic is contacted.</Notice>
      {!q.reschedule && (
        <ChipGroup single label="Type" options={APPOINTMENT_TYPE_LABELS} value={[type]} onChange={(v) => chooseType(v[0] as AppointmentType)} />
      )}
      {!slots ? <Loading /> : days.map(([day, ss]) => (
        <Card key={day}>
          <Text variant="label">{day}</Text>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {ss.map((s) => (
              <Chip key={s.starts_at} selected={pick === s.starts_at} onPress={() => setPick(s.starts_at)}
                label={new Date(s.starts_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })} />
            ))}
          </View>
        </Card>
      ))}
      {error && <Notice tone="danger" action={error.retry ? <Button small variant="secondary" title="Retry" onPress={submit} /> : undefined}>{error.text}</Notice>}
      <Button title={q.reschedule ? "Request new time" : "Send demo request"} disabled={!pick} loading={busy} onPress={submit} />
    </Screen>
  );
}
