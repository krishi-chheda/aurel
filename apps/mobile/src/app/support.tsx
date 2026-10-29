import { ApiError, resolveLink, type AssistantAnswer } from "@aurel/shared";
import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";

import { Badge, Button, Field, Notice, Screen, Text } from "@/components/ui";
import { api } from "@/lib/session";
import { usePalette } from "@/lib/theme";

type Msg = { from: "you" | "assistant"; text: string; answer?: AssistantAnswer };
const SUGGESTIONS = ["How do I finish onboarding on the web?", "Where are my reports?", "How do I reschedule?"];

export default function Support() {
  const p = usePalette();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(text: string) {
    if (!text.trim()) return;
    setMsgs((m) => [...m, { from: "you", text }]);
    setBusy(true);
    setError(null);
    try {
      const a = await api.ask(text);
      setMsgs((m) => [...m, { from: "assistant", text: a.answer, answer: a }]);
      setQ("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't reach the assistant.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <Screen edges={["bottom"]}>
        <Notice tone="info">This help assistant answers questions about using the app. It can&apos;t see your records or give medical advice. In an emergency call 000.</Notice>
        {msgs.length === 0 && SUGGESTIONS.map((s) => <Button key={s} small variant="secondary" title={s} onPress={() => ask(s)} />)}
        <View accessibilityLiveRegion="polite" style={{ gap: 10 }}>
          {msgs.map((m, i) => (
            <View key={i} style={{ alignSelf: m.from === "you" ? "flex-end" : "flex-start", maxWidth: "88%", padding: 12, borderRadius: 12,
              backgroundColor: m.from === "you" ? p.primary : p.surfaceMuted, gap: 6 }}>
              {m.answer?.kind === "safety" && <Badge tone="warning" label="Safety notice" />}
              <Text style={{ color: m.from === "you" ? p.surface : p.ink }}>{m.text}</Text>
              {m.answer?.links.filter((l) => resolveLink(l.href)).map((l) => (
                <Button key={l.href} small variant="ghost" title={l.label} onPress={() => router.push(l.href as never)} />
              ))}
              {m.answer && <Text variant="muted" style={{ fontSize: 11 }}>{m.answer.disclaimer}</Text>}
            </View>
          ))}
        </View>
        {error && <Notice tone="danger">{error}</Notice>}
        <Field label="Your question" value={q} onChangeText={setQ} maxLength={500} onSubmitEditing={() => ask(q)} returnKeyType="send" />
        <Button title="Ask" loading={busy} onPress={() => ask(q)} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
