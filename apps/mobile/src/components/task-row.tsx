import { ApiError, PLATFORM_LABELS, TASK_KIND_LABELS, formatDate, resolveLink, syncStateFor, type SyncState, type Task } from "@aurel/shared";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text as RNText, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Badge, SyncStatus, Text } from "./ui";
import { api } from "@/lib/session";
import { usePalette } from "@/lib/theme";

/** Same behaviour as the web TaskItem: optimistic toggle, reverted with an explanation if the save fails. */
export function TaskRow({ task, onChange }: { task: Task; onChange?: (t: Task) => void }) {
  const p = usePalette();
  const [t, setT] = useState(task);
  const [state, setState] = useState<SyncState>("idle");
  const [msg, setMsg] = useState<string | null>(null);
  if (task.version > t.version) setT(task);

  const done = t.status === "done";
  const locked = t.kind === "profile" && !done;

  async function toggle() {
    const target = done ? "open" : "done";
    const before = t;
    setT({ ...t, status: target });
    setState("saving");
    setMsg(null);
    try {
      const saved = await api.setTask(t.id, target);
      setT(saved);
      setState("saved");
      onChange?.(saved);
    } catch (e) {
      setT(before);
      setState(syncStateFor(e));
      setMsg(e instanceof ApiError ? e.message : null);
    }
  }

  const link = resolveLink(t.link);
  return (
    <View style={{ flexDirection: "row", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: p.border }}>
      <Pressable onPress={toggle} disabled={locked || state === "saving"} hitSlop={10}
        accessibilityRole="checkbox" accessibilityState={{ checked: done, disabled: locked }} accessibilityLabel={t.title}
        style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginTop: 1,
          borderColor: done ? p.primary : p.borderStrong, backgroundColor: done ? p.primary : "transparent", opacity: locked ? 0.5 : 1 }}>
        {done && <Svg width={14} height={14} viewBox="0 0 12 12"><Path d="M2.5 6.2 5 8.5l4.5-5" stroke={p.surface} strokeWidth={1.8} fill="none" /></Svg>}
      </Pressable>
      <View style={{ flex: 1, gap: 4 }}>
        <Pressable disabled={!link} onPress={() => link && router.push(link.path as never)} accessibilityRole={link ? "link" : undefined}>
          <RNText style={{ fontSize: 16, fontWeight: "500", color: done ? p.inkMuted : p.ink, textDecorationLine: done ? "line-through" : "none" }}>{t.title}</RNText>
        </Pressable>
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          <Badge tone={t.kind === "milestone" ? "accent" : "neutral"} label={TASK_KIND_LABELS[t.kind]} />
          {t.overdue && !done && <Badge tone="warning" label="Overdue" />}
        </View>
        {t.detail ? <Text variant="muted">{t.detail}</Text> : null}
        <Text variant="muted" style={{ fontSize: 12, color: p.inkSubtle }}>
          {done && t.completed_from ? `Completed on ${PLATFORM_LABELS[t.completed_from] ?? t.completed_from} · ${formatDate(t.completed_at)}`
            : t.due_at ? `Due ${formatDate(t.due_at)}` : locked ? "Completes when onboarding is finished" : ""}
        </Text>
        {state !== "idle" && <SyncStatus state={state} onRetry={toggle} />}
        {msg && state !== "saved" ? <RNText style={{ color: p.danger, fontSize: 13 }}>{msg}</RNText> : null}
      </View>
    </View>
  );
}
