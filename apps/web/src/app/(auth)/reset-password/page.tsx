"use client";

import { ApiError } from "@aurel/shared";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button, Field, Notice, fieldErrors } from "@/components/ui";
import { api } from "@/lib/session";

export default function ResetPage() {
  const token = useSearchParams().get("token") ?? "";
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    if (f.password !== f.confirm) return setErrors({ confirm: "Passwords don't match." });
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      await api.auth.reset(token, f.password);
      setDone(true);
    } catch (err) {
      setErrors(fieldErrors(err));
      if (err instanceof ApiError && err.code !== "validation_error") setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!token) return <Notice tone="danger" title="Missing reset link">Open the link from your email, or request a new one.</Notice>;
  if (done) {
    return (
      <div className="grid gap-4">
        <Notice tone="success" title="Password updated">You&apos;ve been signed out on all devices. Sign in with your new password.</Notice>
        <Link href="/login" className="text-center text-primary hover:underline">Go to sign in</Link>
      </div>
    );
  }
  return (
    <>
      <h1 className="font-serif text-[28px]">Choose a new password</h1>
      <form onSubmit={submit} className="mt-6 grid gap-4" noValidate>
        <Field label="New password" name="password" type="password" autoComplete="new-password" error={errors.password}
          hint="At least 10 characters, including a letter and a number." />
        <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" error={errors.confirm} />
        {formError && <Notice tone="danger">{formError} <Link className="underline" href="/forgot-password">Request a new link</Link></Notice>}
        <Button type="submit" loading={busy}>Update password</Button>
      </form>
    </>
  );
}
