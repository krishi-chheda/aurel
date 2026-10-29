import { ApiError } from "@aurel/shared";
import { router } from "expo-router";
import { useState } from "react";

import { Button, Field, Notice, Screen, Text, fieldErrors } from "@/components/ui";
import { api, useSession } from "@/lib/session";

export default function Register() {
  const { setAuthed } = useSession();
  const [f, setF] = useState({ first_name: "", last_name: "", email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  async function submit() {
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      const t = await api.auth.register({ ...f, email: f.email.trim() });
      setAuthed(t.user);
      router.replace("/onboarding");
    } catch (e) {
      setErrors(fieldErrors(e));
      if (e instanceof ApiError && e.code !== "validation_error") setFormError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={["bottom"]}>
      <Text variant="muted">One account for the app and the web.</Text>
      <Field label="First name" value={f.first_name} onChangeText={set("first_name")} autoComplete="given-name" error={errors.first_name} />
      <Field label="Last name" value={f.last_name} onChangeText={set("last_name")} autoComplete="family-name" error={errors.last_name} />
      <Field label="Email" value={f.email} onChangeText={set("email")} autoCapitalize="none" keyboardType="email-address" autoComplete="email" error={errors.email} />
      <Field label="Password" value={f.password} onChangeText={set("password")} secureTextEntry autoComplete="new-password" textContentType="newPassword"
        error={errors.password} hint="At least 10 characters, including a letter and a number." />
      {formError && <Notice tone="danger">{formError}</Notice>}
      <Text variant="muted" style={{ fontSize: 12 }}>Demonstration product with synthetic health data. Don&apos;t enter real medical information.</Text>
      <Button title="Create account" onPress={submit} loading={busy} />
    </Screen>
  );
}
