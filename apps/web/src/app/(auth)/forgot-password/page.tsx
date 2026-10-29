"use client";

import { ApiError } from "@aurel/shared";
import Link from "next/link";
import { useState } from "react";

import { Button, Field, Notice } from "@/components/ui";
import { api } from "@/lib/session";

export default function ForgotPage() {
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email"));
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Enter a valid email address.");
    setBusy(true);
    setError(null);
    try {
      setSent((await api.auth.forgot(email)).message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="font-serif text-[28px]">Reset your password</h1>
      {sent ? (
        <div className="mt-6 grid gap-4">
          <Notice tone="success">{sent}</Notice>
          <p className="text-sm text-ink-muted">
            Demo note: no email is sent. When running locally, the reset link is printed in the API server&apos;s console.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 grid gap-4" noValidate>
          <Field label="Email" name="email" type="email" autoComplete="email" error={error ?? undefined} />
          <Button type="submit" loading={busy}>Send reset link</Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm"><Link href="/login" className="text-primary hover:underline">Back to sign in</Link></p>
    </>
  );
}
