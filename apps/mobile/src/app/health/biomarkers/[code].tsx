import { RANGE_LABELS, formatDate } from "@aurel/shared";
import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { LineChart } from "@/components/line-chart";
import { Badge, Card, CardTitle, Chip, EmptyState, LoadError, Loading, Notice, Screen, Text, rangeTone } from "@/components/ui";
import { api } from "@/lib/session";
import { usePalette } from "@/lib/theme";
import { useResource } from "@/lib/use-resource";

const PRESETS = { all: "All", "365": "12 mo", "180": "6 mo", "90": "3 mo" };

export default function Biomarker() {
  const p = usePalette();
  const { code } = useLocalSearchParams<{ code: string }>();
  const [preset, setPreset] = useState("all");
  const { data: s, error, reload, refreshing, onRefresh } = useResource(
    () => api.series(code, preset === "all" ? undefined : new Date(Date.now() - Number(preset) * 86400_000).toISOString()),
    [code, preset]);
  if (!s) return error ? <Screen><LoadError error={error} onRetry={reload} /></Screen> : <Loading />;
  const t = s.trend;

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} edges={["bottom"]}>
      <Stack.Screen options={{ title: s.name }} />
      <Text variant="muted">{s.about}</Text>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }} accessibilityLabel="Date range">
        {Object.entries(PRESETS).map(([k, l]) => <Chip key={k} label={l} selected={preset === k} onPress={() => setPreset(k)} />)}
      </View>
      <Card>
        <CardTitle title="History" sub={`Unit: ${s.unit}${s.ref_low != null || s.ref_high != null ? ` · Range ${s.ref_low ?? "–"} to ${s.ref_high ?? "–"}` : ""}`} />
        {s.points.length ? <LineChart series={s} /> : <EmptyState title="No results in this period" body="Try a longer range." />}
      </Card>
      <Card>
        <CardTitle title="Change over time" />
        {t.comparable ? (
          <>
            <Text variant="title">{t.direction === "stable" ? "Stable" : t.direction === "up" ? "Higher" : "Lower"}</Text>
            <Text variant="muted">{t.change! > 0 ? "+" : ""}{t.change} {s.unit}{t.change_pct != null ? ` (${t.change_pct > 0 ? "+" : ""}${t.change_pct}%)` : ""} from first to latest result.</Text>
          </>
        ) : <Notice tone="info" title="Trend not shown">{t.reason ?? ""}</Notice>}
        {t.excluded_points > 0 && <Text variant="muted">{t.excluded_points} unavailable result(s) excluded.</Text>}
      </Card>
      <Card>
        <CardTitle title="All results" />
        {[...s.points].reverse().map((pt) => (
          <View key={pt.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: p.border, gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text>{formatDate(pt.measured_at)}</Text>
              <Text style={{ fontWeight: "600" }}>{pt.value ?? "-"} {pt.unit}</Text>
            </View>
            <Badge tone={rangeTone(pt.status)} label={RANGE_LABELS[pt.status]} />
            <Text variant="muted" style={{ fontSize: 12 }}>{pt.source}</Text>
          </View>
        ))}
        <Text variant="muted" style={{ fontSize: 12 }}>{s.disclaimer}</Text>
      </Card>
    </Screen>
  );
}
