import { RANGE_LABELS, formatDate, type BiomarkerSummary } from "@aurel/shared";
import { router } from "expo-router";
import { View } from "react-native";

import { Badge, Button, Card, LoadError, Loading, Notice, Row, Screen, SyncStatus, Text, rangeTone } from "@/components/ui";
import { api } from "@/lib/session";
import { useResource } from "@/lib/use-resource";

export default function Health() {
  const { data, error, state, syncedAt, reload, refreshing, onRefresh } = useResource(() => api.biomarkers());
  if (!data) return error ? <Screen><LoadError error={error} onRetry={reload} /></Screen> : <Loading />;
  const byCat = data.reduce<Record<string, BiomarkerSummary[]>>((a, b) => ((a[b.category] ??= []).push(b), a), {});

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <SyncStatus state={state} syncedAt={syncedAt} onRetry={reload} />
      <Notice tone="info">Synthetic data from a fictional laboratory. Reference ranges are illustrative.</Notice>
      <Button small variant="secondary" title="View reports" onPress={() => router.push("/reports")} />
      {Object.entries(byCat).map(([cat, items]) => (
        <Card key={cat}>
          <Text variant="label" color="inkMuted" accessibilityRole="header">{cat.toUpperCase()}</Text>
          {items.map((b) => (
            <Row key={b.code} label={`${b.name}, ${b.latest_value ?? "no result"} ${b.latest_unit ?? ""}, ${RANGE_LABELS[b.status]}`}
              onPress={() => router.push(`/health/biomarkers/${b.code}`)}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "500" }}>{b.name}</Text>
                  <Text variant="muted" style={{ fontSize: 13 }}>{b.count ? `${b.count} results · ${formatDate(b.latest_at)}` : "No results"}</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Text variant="heading">{b.latest_value ?? "-"} <Text variant="muted" style={{ fontSize: 13 }}>{b.latest_unit ?? b.unit}</Text></Text>
                  <Badge tone={rangeTone(b.status)} label={RANGE_LABELS[b.status]} />
                </View>
              </View>
            </Row>
          ))}
        </Card>
      ))}
    </Screen>
  );
}
