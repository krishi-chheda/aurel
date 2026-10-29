import { APPOINTMENT_STATUS_LABELS, formatDateTime, type Appointment } from "@aurel/shared";
import { router } from "expo-router";

import { Badge, Button, Card, CardTitle, EmptyState, LoadError, Loading, Notice, Row, Screen, SyncStatus, Text } from "@/components/ui";
import { api } from "@/lib/session";
import { useResource } from "@/lib/use-resource";

export default function Appointments() {
  const { data, error, state, syncedAt, reload, refreshing, onRefresh } = useResource(() => api.appointments());
  if (!data) return error ? <Screen><LoadError error={error} onRetry={reload} /></Screen> : <Loading />;
  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <SyncStatus state={state} syncedAt={syncedAt} onRetry={reload} />
      <Notice tone="warning" title="Demonstration bookings">{data.demo_notice}</Notice>
      <Button title="Request appointment" onPress={() => router.push("/appointments/new")} />
      <Card>
        <CardTitle title="Upcoming" />
        {data.upcoming.length ? <List items={data.upcoming} /> : <EmptyState title="No upcoming appointments" />}
      </Card>
      <Card>
        <CardTitle title="Past and cancelled" />
        {data.past.length ? <List items={data.past} /> : <EmptyState title="No past appointments" />}
      </Card>
    </Screen>
  );
}

function List({ items }: { items: Appointment[] }) {
  return items.map((a) => (
    <Row key={a.id} label={`${a.title}, ${formatDateTime(a.starts_at)}, ${APPOINTMENT_STATUS_LABELS[a.status]}`} onPress={() => router.push(`/appointments/${a.id}`)}>
      <Text style={{ fontWeight: "500" }}>{a.title}</Text>
      <Text variant="muted">{formatDateTime(a.starts_at)} · {a.duration_min} min</Text>
      <Badge tone={a.status === "cancelled" ? "neutral" : a.status === "completed" ? "success" : "info"} label={APPOINTMENT_STATUS_LABELS[a.status]} />
    </Row>
  ));
}
