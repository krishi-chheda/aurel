import { relativeTime, resolveLink } from "@aurel/shared";
import { router } from "expo-router";
import { Pressable, View } from "react-native";

import { Button, Card, EmptyState, LoadError, Loading, Screen, Text } from "@/components/ui";
import { api } from "@/lib/session";
import { usePalette } from "@/lib/theme";
import { useResource } from "@/lib/use-resource";

export default function Notifications() {
  const p = usePalette();
  const { data, error, reload, setData, refreshing, onRefresh } = useResource(() => api.notifications(50));
  if (!data) return error ? <Screen><LoadError error={error} onRetry={reload} /></Screen> : <Loading />;

  async function open(id: string, link: string | null) {
    const n = await api.readNotification(id).catch(() => null);
    if (n) setData({ ...data!, unread: Math.max(0, data!.unread - (data!.items.find((i) => i.id === id)?.read_at ? 0 : 1)), items: data!.items.map((i) => (i.id === id ? n : i)) });
    const target = resolveLink(link);
    if (target) router.push(target.path as never);
  }

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} edges={["bottom"]}>
      <Text variant="muted">{data.unread ? `${data.unread} unread` : "You're all caught up"}</Text>
      {data.unread > 0 && <Button small variant="secondary" title="Mark all read" onPress={async () => { await api.readAllNotifications().catch(() => {}); reload(); }} />}
      {data.items.length === 0 ? <EmptyState title="No notifications" /> : (
        <Card style={{ paddingVertical: 4 }}>
          {data.items.map((n) => (
            <Pressable key={n.id} onPress={() => open(n.id, n.link)} accessibilityRole="button"
              accessibilityLabel={`${n.read_at ? "" : "Unread. "}${n.title}. ${n.body}`}
              style={({ pressed }) => ({ flexDirection: "row", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: p.border, opacity: pressed ? 0.6 : 1 })}>
              <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 7, backgroundColor: n.read_at ? "transparent" : p.accent }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: n.read_at ? "400" : "600" }}>{n.title}</Text>
                <Text variant="muted">{n.body}</Text>
                <Text variant="muted" style={{ fontSize: 12, color: p.inkSubtle }}>{relativeTime(n.created_at)}</Text>
              </View>
            </Pressable>
          ))}
        </Card>
      )}
    </Screen>
  );
}
