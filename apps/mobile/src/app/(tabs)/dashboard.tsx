import { APPOINTMENT_STATUS_LABELS, STEP_TITLES, formatDate, formatDateTime, greeting } from "@aurel/shared";
import { router } from "expo-router";
import { View } from "react-native";

import { TaskRow } from "@/components/task-row";
import { Badge, Button, Card, CardTitle, EmptyState, LoadError, Loading, ProgressBar, Row, Screen, SyncStatus, Text } from "@/components/ui";
import { api } from "@/lib/session";
import { usePalette } from "@/lib/theme";
import { useResource } from "@/lib/use-resource";

export default function Dashboard() {
  const p = usePalette();
  const { data: d, error, state, syncedAt, reload, refreshing, onRefresh } = useResource(() => api.dashboard());
  if (!d) return error ? <Screen><LoadError error={error} onRetry={reload} /></Screen> : <Loading />;
  const h = d.health_overview;

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <View>
        <Text variant="muted">{greeting()},</Text>
        <Text variant="display">{d.greeting_name}</Text>
        <SyncStatus state={state} syncedAt={syncedAt} onRetry={reload} />
      </View>
      {error && <LoadError error={error} onRetry={reload} />}

      {d.onboarding.status !== "completed" && (
        <Card style={{ backgroundColor: p.primarySoft, borderColor: p.primarySoft }}>
          <Text variant="heading" color="primary">Finish setting up your profile</Text>
          <Text variant="muted">You&apos;re at {STEP_TITLES[d.onboarding.current_step]}. Progress is saved - pick up here or on the web.</Text>
          <Button title="Continue onboarding" onPress={() => router.push("/onboarding")} />
        </Card>
      )}

      <Card>
        <CardTitle title="Health overview" sub={h.last_panel_at ? `Latest panel ${formatDate(h.last_panel_at)}` : undefined} />
        <View style={{ flexDirection: "row", gap: 12 }}>
          {[["Tracked", h.tracked, "ink"], ["In range", h.within_range, "ink"], ["Outside", h.outside_range, h.outside_range ? "warning" : "ink"]].map(([l, v, c]) => (
            <View key={l as string} style={{ flex: 1 }}>
              <Text variant="title" color={c as "ink"}>{String(v)}</Text>
              <Text variant="muted" style={{ fontSize: 13 }}>{l as string}</Text>
            </View>
          ))}
        </View>
        <Text variant="muted" style={{ fontSize: 12 }}>Synthetic data. Compared with illustrative ranges - not a diagnosis.</Text>
        <Button small variant="secondary" title="View biomarkers" onPress={() => router.push("/health")} />
      </Card>

      {d.care_plan && (
        <Card>
          <CardTitle title="Care plan" sub={d.care_plan.title} />
          <Text variant="title">{d.care_plan.percent}%</Text>
          <ProgressBar value={d.care_plan.percent} label="Care plan progress" />
          <Text variant="muted">{d.care_plan.done} of {d.care_plan.total} actions complete</Text>
        </Card>
      )}

      <Card>
        <CardTitle title="Outstanding tasks" sub={`${d.open_task_count} open`} />
        {d.tasks.length ? <View>{d.tasks.map((t) => <TaskRow key={t.id} task={t} onChange={() => reload()} />)}</View> : <EmptyState title="You're all caught up" />}
      </Card>

      <Card>
        <CardTitle title="Upcoming appointments" />
        {d.next_appointments.length ? d.next_appointments.map((a) => (
          <Row key={a.id} label={`${a.title}, ${formatDateTime(a.starts_at)}`} onPress={() => router.push(`/appointments/${a.id}`)}>
            <Text variant="heading" style={{ fontSize: 16 }}>{a.title}</Text>
            <Text variant="muted">{formatDateTime(a.starts_at)}</Text>
            <Badge tone="info" label={APPOINTMENT_STATUS_LABELS[a.status]} />
          </Row>
        )) : <EmptyState title="Nothing booked" action={<Button small variant="secondary" title="Request appointment" onPress={() => router.push("/appointments/new")} />} />}
      </Card>

      <Card>
        <CardTitle title="Recent reports" />
        {d.recent_reports.map((r) => (
          <Row key={r.id} label={r.title} onPress={() => router.push(`/health/reports/${r.id}`)}>
            <Text style={{ fontWeight: "500" }}>{r.title}</Text>
            <Text variant="muted">{formatDate(r.released_at)}{r.is_synthetic ? " · Synthetic" : ""}</Text>
          </Row>
        ))}
        {d.recent_reports.length === 0 && <EmptyState title="No reports yet" />}
      </Card>

      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Button small variant="secondary" title={`Notifications${d.unread_notifications ? ` (${d.unread_notifications})` : ""}`} onPress={() => router.push("/notifications")} />
        <Button small variant="secondary" title="Reports" onPress={() => router.push("/reports")} />
        <Button small variant="secondary" title="Support" onPress={() => router.push("/support")} />
      </View>
    </Screen>
  );
}
