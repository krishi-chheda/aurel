import { APPOINTMENT_STATUS_LABELS, ApiError, formatDateTime } from "@aurel/shared";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";

import { Badge, Button, Card, CardTitle, EmptyState, LoadError, Loading, Notice, Screen, Text } from "@/components/ui";
import { api } from "@/lib/session";
import { useResource } from "@/lib/use-resource";

export default function AppointmentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: a, error, reload, setData, refreshing, onRefresh } = useResource(() => api.appointment(id), [id]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!a) {
    if (error instanceof ApiError && error.status === 404) return <Screen><EmptyState title="Appointment not found" /></Screen>;
    return error ? <Screen><LoadError error={error} onRetry={reload} /></Screen> : <Loading />;
  }
  const changeable = (a.status === "requested" || a.status === "scheduled") && new Date(a.starts_at) > new Date();

  function confirmCancel() {
    Alert.alert("Cancel this appointment?", "This also removes its preparation task.", [
      { text: "Keep it", style: "cancel" },
      { text: "Cancel appointment", style: "destructive", onPress: async () => {
        setBusy(true);
        setMsg(null);
        try { setData(await api.cancelAppointment(a!.id)); } catch (e) { setMsg(e instanceof ApiError ? e.message : "Couldn't cancel."); }
        setBusy(false);
      } },
    ]);
  }

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} edges={["bottom"]}>
      <Stack.Screen options={{ title: a.title }} />
      <View style={{ gap: 6 }}>
        <Text variant="title">{formatDateTime(a.starts_at)}</Text>
        <Badge tone="info" label={APPOINTMENT_STATUS_LABELS[a.status]} />
      </View>
      {a.is_demo && <Notice tone="warning">Demonstration appointment. No real clinic or practitioner is involved.</Notice>}
      <Card>
        <CardTitle title="Details" />
        <Text>With: {a.practitioner}</Text>
        <Text>Where: {a.location}</Text>
        <Text>Duration: {a.duration_min} minutes</Text>
      </Card>
      <Card>
        <CardTitle title="How to prepare" />
        {a.prep_notes.length ? a.prep_notes.map((n) => <Text key={n}>• {n}</Text>) : <Text variant="muted">No preparation needed.</Text>}
      </Card>
      {msg && <Notice tone="danger">{msg}</Notice>}
      {changeable && (
        <View style={{ gap: 10 }}>
          <Button variant="secondary" title="Reschedule"
            onPress={() => router.push({ pathname: "/appointments/new", params: { reschedule: a.id, version: String(a.version), type: a.type } })} />
          <Button variant="danger" title="Cancel appointment" loading={busy} onPress={confirmCancel} />
        </View>
      )}
    </Screen>
  );
}
