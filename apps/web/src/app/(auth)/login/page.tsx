"use client";

import { ApiError, safeNext } from "@aurel/shared";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button, Field, Notice } from "@/components/ui";
import { api, useSession } from "@/lib/session";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { status, user, setAuthed } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "authed" && user) router.replace(user.role === "customer" ? next : "/admin");
  }, [status, user, next, router]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const t = await api.auth.login({ email: String(f.get("email")), password: String(f.get("password")) });
      setAuthed(t.user); // the effect above routes by role
    } catch (err) {
      setError(err instanceof ApiError ? (err.code === "validation_error" ? "Enter your email and password." : err.message) : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="font-serif text-[28px]">Welcome back</h1>
      <p className="mt-1 text-ink-muted">Sign in to continue where you left off.</p>
      {params.get("expired") && <div className="mt-5"><Notice tone="warning">Your session expired. Sign in again to continue.</Notice></div>}
      <form onSubmit={submit} className="mt-6 grid gap-4" noValidate>
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" loading={busy}>Sign in</Button>
      </form>
      <div className="mt-6 flex justify-between text-sm">
        <Link href="/forgot-password" className="text-primary underline-offset-2 hover:underline">Forgot password?</Link>
        <Link href={`/register${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-primary underline-offset-2 hover:underline">Create an account</Link>
      </div>
    </>
  );
}
