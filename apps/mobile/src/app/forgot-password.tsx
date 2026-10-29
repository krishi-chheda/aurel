import { ApiError } from "@aurel/shared";
import { useState } from "react";

import { Button, Field, Notice, Screen, Text } from "@/components/ui";
import { api } from "@/lib/session";

export default function Forgot() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      setSent((await api.auth.forgot(email.trim())).message);
    } catch (e) {
      setError(e instanceof ApiError ? (e.code === "validation_error" ? "Enter a valid email address." : e.message) : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={["bottom"]}>
      {sent ? (
        <>
          <Notice tone="success">{sent}</Notice>
          <Text variant="muted">The link opens the reset page on the web. Demo note: no email is sent - locally, the link is printed in the API console.</Text>
        </>
      ) : (
        <>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" error={error ?? undefined} />
          <Button title="Send reset link" onPress={submit} loading={busy} />
        </>
      )}
    </Screen>
  );
}
