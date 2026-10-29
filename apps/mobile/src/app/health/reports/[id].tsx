import { ApiError, RANGE_LABELS, formatDate } from "@aurel/shared";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { TaskRow } from "@/components/task-row";
import { Badge, Card, EmptyState, LoadError, Loading, Notice, Row, Screen, Text, rangeTone } from "@/components/ui";
import { api } from "@/lib/session";
import { useResource } from "@/lib/use-resource";

export default function Report() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: r, error, reload, refreshing, onRefresh } = useResource(() => api.report(id), [id]);
  const { data: tasks } = useResource(() => api.tasks("all"), [id]);
  const review = tasks?.find((t) => t.kind === "report_review" && t.link === `/health/reports/${id}`);
  if (!r) {
    if (error instanceof ApiError && error.status === 404) return <Screen><EmptyState title="Report not found" body="The link may be out of date." /></Screen>;
    return error ? <Screen><LoadError error={error} onRetry={reload} /></Screen> : <Loading />;
  }
  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} edges={["bottom"]}>
      <Stack.Screen options={{ title: r.title }} />
      <Text variant="muted">Released {formatDate(r.released_at)} · Reviewed by {r.reviewed_by}</Text>
      {r.is_synthetic && <Notice tone="warning" title="Synthetic report">{r.summary}</Notice>}
      {review && <Card><TaskRow task={review} /></Card>}
      <Card>
        {r.measurements.map((m) => (
          <Row key={m.id} label={r.biomarker_names[m.biomarker_code] ?? m.biomarker_code} onPress={() => router.push(`/health/biomarkers/${m.biomarker_code}`)}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Text style={{ flex: 1, fontWeight: "500" }}>{r.biomarker_names[m.biomarker_code] ?? m.biomarker_code}</Text>
              <Text>{m.value ?? "-"} {m.unit}</Text>
            </View>
            <Badge tone={rangeTone(m.status)} label={RANGE_LABELS[m.status]} />
          </Row>
        ))}
      </Card>
      <Text variant="muted" style={{ fontSize: 12 }}>Source: {r.source}. Not medical advice.</Text>
    </Screen>
  );
}
