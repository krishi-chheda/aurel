"use client";

import { ApiError } from "@aurel/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { pop } from "@/components/motion/primitives";
import { Button, Field, Notice, cx, fieldErrors } from "@/components/ui";
import { api, useSession } from "@/lib/session";

// Mirrors the server rule for instant feedback; the server remains the authority.
const passwordProblem = (pw: string) =>
  pw.length < 10 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw) ? "Use at least 10 characters including a letter and a number." : "";

export default function RegisterPage() {
  const router = useRouter();
  const { setAuthed } = useSession();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<React.ReactNode>(null);
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const local: Record<string, string> = {};
    if (!f.first_name.trim()) local.first_name = "Enter your first name.";
    if (!f.last_name.trim()) local.last_name = "Enter your last name.";
    if (!/^\S+@\S+\.\S+$/.test(f.email)) local.email = "Enter a valid email address.";
    if (passwordProblem(f.password)) local.password = passwordProblem(f.password);
    if (f.password !== f.confirm) local.confirm = "Passwords don't match.";
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      const t = await api.auth.register({ email: f.email, password: f.password, first_name: f.first_name, last_name: f.last_name });
      setAuthed(t.user);
      router.replace("/onboarding");
    } catch (err) {
      setErrors(fieldErrors(err));
      if (err instanceof ApiError && err.code === "email_taken") {
        setFormError(<>{err.message} <Link href="/login" className="underline">Sign in</Link></>);
      } else if (!(err instanceof ApiError && err.code === "validation_error")) {
        setFormError(err instanceof ApiError ? err.message : "Something went wrong.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="font-serif text-[28px]">Create your account</h1>
      <p className="mt-1 text-ink-muted">One account for the web and the Aurel app.</p>
      <form onSubmit={submit} className="mt-6 grid gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" name="first_name" autoComplete="given-name" error={errors.first_name} />
          <Field label="Last name" name="last_name" autoComplete="family-name" error={errors.last_name} />
        </div>
        <Field label="Email" name="email" type="email" autoComplete="email" error={errors.email} />
        <div>
          <Field label="Password" name="password" type="password" autoComplete="new-password" error={errors.password}
            value={pw} onChange={(e) => setPw(e.target.value)} aria-describedby="pw-rules" />
          <PasswordRules pw={pw} />
        </div>
        <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" error={errors.confirm} />
        {formError && <Notice tone="danger">{formError}</Notice>}
        <p className="text-xs text-ink-muted">
          By continuing you acknowledge this is a demonstration product using synthetic health data. Don&apos;t enter real medical information.
        </p>
        <Button type="submit" loading={busy}>Create account</Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-muted">
        Already have an account? <Link href="/login" className="text-primary underline underline-offset-2">Sign in</Link>
      </p>
    </>
  );
}

/** Live checklist: each rule ticks (with a small pop) the moment it's met. Mirrors the server's rule. */
function PasswordRules({ pw }: { pw: string }) {
  const rules: [string, boolean][] = [["10+ characters", pw.length >= 10], ["A letter", /[A-Za-z]/.test(pw)], ["A number", /\d/.test(pw)]];
  const met = rules.filter(([, ok]) => ok).length;
  return (
    <div id="pw-rules" className="mt-2">
      <div className="flex gap-1.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className={cx("h-1 flex-1 rounded-full transition-colors duration-300", i < met ? (met === 3 ? "bg-success" : "bg-warning") : "bg-surface-muted")} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {rules.map(([label, ok]) => (
          <li key={label} className={cx("inline-flex items-center gap-1.5 transition-colors", ok ? "text-success" : "text-ink-subtle")}>
            <span ref={(el) => { if (el && ok && el.dataset.ok !== "1") pop(el, 1.6); if (el) el.dataset.ok = ok ? "1" : "0"; }}
              className={cx("grid h-3.5 w-3.5 place-items-center rounded-full border", ok ? "border-success bg-success text-surface" : "border-line-strong")}>
              {ok && <svg width="8" height="8" viewBox="0 0 12 12" aria-hidden><path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>}
            </span>
            {label}<span className="sr-only">{ok ? " - done" : " - needed"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
