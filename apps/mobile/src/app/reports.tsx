import { formatDate } from "@aurel/shared";
import { router } from "expo-router";

import { Card, EmptyState, LoadError, Loading, Row, Screen, Text } from "@/components/ui";
import { api } from "@/lib/session";
import { useResource } from "@/lib/use-resource";

export default function Reports() {
  const { data, error, reload, refreshing, onRefresh } = useResource(() => api.reports());
  if (!data) return error ? <Screen><LoadError error={error} onRetry={reload} /></Screen> : <Loading />;
  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} edges={["bottom"]}>
      {data.length === 0 ? <EmptyState title="No reports yet" /> : (
        <Card>
          {data.map((r) => (
            <Row key={r.id} label={r.title} onPress={() => router.push(`/health/reports/${r.id}`)}>
              <Text style={{ fontWeight: "500" }}>{r.title}</Text>
              <Text variant="muted">Released {formatDate(r.released_at)}{r.is_synthetic ? " · Synthetic" : ""}</Text>
            </Row>
          ))}
        </Card>
      )}
    </Screen>
  );
}
