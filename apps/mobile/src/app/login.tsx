import { ApiError, BRAND, DEMO_BANNER } from "@aurel/shared";
import { Link, router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";

import { Button, Field, Notice, Screen, Text } from "@/components/ui";
import { api, takePendingLink, useSession } from "@/lib/session";
import { usePalette } from "@/lib/theme";

export default function Login() {
  const p = usePalette();
  const { setAuthed, expired } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const t = await api.auth.login({ email: email.trim(), password });
      setAuthed(t.user);
      router.replace((takePendingLink() ?? "/dashboard") as never);
    } catch (e) {
      setError(e instanceof ApiError ? (e.code === "validation_error" ? "Enter your email and password." : e.message) : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen edges={["top", "bottom"]}>
        <View style={{ marginTop: 32, gap: 6 }}>
          <Text variant="label" color="accent">{BRAND.name.toUpperCase()}</Text>
          <Text variant="display">Welcome back</Text>
          <Text variant="muted">Sign in with the same account you use on the web.</Text>
        </View>
        {expired && <Notice tone="warning">Your session expired. Sign in again to continue.</Notice>}
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="username" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={submit} />
        {error && <Notice tone="danger">{error}</Notice>}
        <Button title="Sign in" onPress={submit} loading={busy} />
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
          <Link href="/forgot-password" style={{ color: p.primary, fontSize: 15, paddingVertical: 10 }}>Forgot password?</Link>
          <Link href="/register" style={{ color: p.primary, fontSize: 15, paddingVertical: 10 }}>Create an account</Link>
        </View>
        <Text variant="muted" style={{ marginTop: 24, fontSize: 12, textAlign: "center" }}>{DEMO_BANNER}</Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}
