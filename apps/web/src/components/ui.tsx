"use client";

import { ApiError, SYNC_LABELS, syncStateFor, type SyncState } from "@aurel/shared";
import Link from "next/link";
import { forwardRef, useId, useRef } from "react";

import { shake } from "./motion/primitives";
import { REDUCED, gsap, useGSAP } from "@/lib/motion";

export { cx } from "./ui-cx";
import { cx } from "./ui-cx";

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "sm";
  loading?: boolean;
};

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed min-h-11";
const btnVariants = {
  primary: "bg-primary text-white hover:bg-primary-hover dark:text-canvas",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-muted",
  ghost: "text-primary hover:bg-primary-soft",
  danger: "bg-surface text-danger border border-line-strong hover:bg-danger-soft",
};
const btnSizes = { md: "px-5 text-[15px]", sm: "px-3.5 text-sm min-h-10" };

export function Button({ variant = "primary", size = "md", loading, children, className, disabled, ...rest }: BtnProps) {
  return (
    <button {...rest} disabled={disabled || loading} aria-busy={loading || undefined}
      className={cx(btnBase, btnVariants[variant], btnSizes[size], className)}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function ButtonLink({ href, variant = "primary", size = "md", className, children }:
  { href: string; variant?: BtnProps["variant"]; size?: BtnProps["size"]; className?: string; children: React.ReactNode }) {
  return <Link href={href} className={cx(btnBase, btnVariants[variant], btnSizes[size], className)}>{children}</Link>;
}

export function Spinner() {
  return <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />;
}

export function Card({ className, children, as: As = "section", ...rest }:
  React.HTMLAttributes<HTMLElement> & { as?: "section" | "div" | "article" | "li" }) {
  return <As {...rest} className={cx("rounded-lg border border-line bg-surface p-5 sm:p-6", className)}>{children}</As>;
}

export function CardHeader({ title, action, sub }: { title: React.ReactNode; action?: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
        {sub && <p className="mt-0.5 text-sm text-ink-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/** Page header on a soft tinted band (same language as the dashboard hero). Optional eyebrow + icon. */
export function PageHeader({ title, sub, action, eyebrow, icon }:
  { title: string; sub?: React.ReactNode; action?: React.ReactNode; eyebrow?: string; icon?: string }) {
  return (
    <header className="relative mb-8 overflow-hidden rounded-lg border border-line bg-surface px-6 py-7 sm:px-8">
      <div aria-hidden className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-primary-soft blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-28 right-6 h-56 w-56 rounded-full bg-accent-soft opacity-60 blur-3xl" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-4">
          {icon && (
            <span aria-hidden className="mt-1 hidden h-12 w-12 shrink-0 place-items-center rounded-full bg-primary-soft text-primary sm:grid">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
            </span>
          )}
          <div>
            {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</p>}
            <h1 className={cx("font-serif text-[30px] leading-tight text-ink sm:text-[36px]", eyebrow && "mt-1")}>{title}</h1>
            {sub && <p className="mt-2 max-w-2xl text-ink-muted">{sub}</p>}
          </div>
        </div>
        {action && <div className="relative">{action}</div>}
      </div>
    </header>
  );
}

const tones = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  neutral: "bg-surface-muted text-ink-muted",
  primary: "bg-primary-soft text-primary",
  accent: "bg-accent-soft text-accent",
};
export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)}>{children}</span>;
}

/** Danger notices shake once when they appear or their message changes; pass alert={false} for confirmations. */
export function Notice({ tone = "info", title, children, action, alert = tone === "danger" }:
  { tone?: Tone; title?: string; children?: React.ReactNode; action?: React.ReactNode; alert?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => { if (alert) shake(ref.current); }, { dependencies: [alert, title, typeof children === "string" ? children : null] });
  return (
    <div ref={ref} role={tone === "danger" ? "alert" : "status"} className={cx("flex flex-col gap-3 rounded-md px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between", tones[tone])}>
      <div>
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function SyncStatus({ state, syncedAt, onRetry }: { state: SyncState; syncedAt?: Date | null; onRetry?: () => void }) {
  const label = state === "idle"
    ? syncedAt ? `Up to date · ${syncedAt.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}` : ""
    : SYNC_LABELS[state];
  const tone = state === "failed" || state === "session_expired" ? "text-danger"
    : state === "offline" || state === "conflict" ? "text-warning" : state === "saved" ? "text-success" : "text-ink-subtle";
  return (
    <span aria-live="polite" className={cx("inline-flex items-center gap-2 text-xs", tone)}>
      {(state === "saving" || state === "syncing") && <Spinner />}
      {label}
      {onRetry && (state === "failed" || state === "offline") && (
        <button onClick={onRetry} className="font-semibold underline underline-offset-2">Retry</button>
      )}
    </span>
  );
}

/** Banner for a failed load. Keeps any stale data on screen and offers a retry. */
export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const state = syncStateFor(error);
  if (state === "session_expired") {
    return <Notice tone="warning" title="Your session has ended" action={<ButtonLink size="sm" href="/login">Sign in</ButtonLink>}>Sign in again to continue.</Notice>;
  }
  return (
    <Notice tone={state === "offline" ? "warning" : "danger"} title={state === "offline" ? "You're offline" : "We couldn't load this"}
      action={<Button size="sm" variant="secondary" onClick={onRetry}>Try again</Button>}>
      {error instanceof ApiError ? error.message : "Something went wrong."}
    </Notice>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-md bg-surface-muted", className)} />;
}

export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-5 w-96 max-w-full" />
      <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="font-semibold text-ink">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string };

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, error, hint, className, ...rest }, ref) {
  const id = useId();
  const describedBy = [rest["aria-describedby"], hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">{label}</label>
      <input ref={ref} id={id} {...rest} aria-invalid={!!error || undefined} aria-describedby={describedBy}
        className={cx("block w-full rounded-md border bg-surface px-3.5 min-h-11 text-[16px] text-ink placeholder:text-ink-subtle",
          error ? "border-danger" : "border-line-strong focus:border-primary")} />
      {hint && !error && <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted">{hint}</p>}
      {error && <p id={`${id}-err`} className="mt-1 text-xs font-medium text-danger">{error}</p>}
    </div>
  );
});

export function Select({ label, error, options, className, ...rest }:
  React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; options: Record<string, string> }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">{label}</label>
      <select id={id} {...rest} aria-invalid={!!error || undefined}
        className="block w-full rounded-md border border-line-strong bg-surface px-3 min-h-11 text-[16px] text-ink">
        <option value="" disabled>Select…</option>
        {Object.entries(options).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {error && <p className="mt-1 text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

/** Multi-select as toggle chips (accessible as a group of checkboxes). */
export function ChipGroup({ legend, options, value, onChange, max, error }:
  { legend: string; options: Record<string, string>; value: string[]; onChange: (v: string[]) => void; max?: number; error?: string }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-ink">{legend}{max && <span className="font-normal text-ink-muted"> (up to {max})</span>}</legend>
      <div className="flex flex-wrap gap-2">
        {Object.entries(options).map(([k, l]) => {
          const on = value.includes(k);
          return (
            <label key={k} className={cx("cursor-pointer select-none rounded-full border px-4 min-h-11 inline-flex items-center text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
              on ? "border-primary bg-primary-soft text-primary font-medium" : "border-line-strong bg-surface text-ink hover:bg-surface-muted")}>
              <input type="checkbox" className="sr-only" checked={on}
                onChange={() => onChange(on ? value.filter((x) => x !== k) : max && value.length >= max ? value : [...value, k])} />
              {l}
            </label>
          );
        })}
      </div>
      {error && <p className="mt-1 text-xs font-medium text-danger">{error}</p>}
    </fieldset>
  );
}

/** Grows from empty on first show, then glides between values. */
export function ProgressBar({ value, label }: { value: number; label: string }) {
  const fill = useRef<HTMLDivElement>(null);
  const shown = useRef(false);
  useGSAP(() => {
    const target = value / 100;
    if (matchMedia(REDUCED).matches) gsap.set(fill.current, { scaleX: target });
    else if (shown.current) gsap.to(fill.current, { scaleX: target, duration: 0.5, overwrite: true });
    else gsap.fromTo(fill.current, { scaleX: 0 }, { scaleX: target, duration: 1, delay: 0.25 });
    shown.current = true;
  }, { dependencies: [value] });
  return (
    <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}
      className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
      <div ref={fill} className="h-full w-full origin-left rounded-full bg-primary" style={{ transform: `scaleX(${value / 100})` }} />
    </div>
  );
}

/** Field-level messages from the API's validation envelope. */
export function fieldErrors(e: unknown): Record<string, string> {
  if (!(e instanceof ApiError) || !e.body.fields) return {};
  return Object.fromEntries(e.body.fields.map((f) => [f.field.split(".").pop() || f.field, f.message.replace(/^Value error, /, "")]));
}

/** Shown when the session couldn't be checked because Aurel is unreachable - the user is NOT signed out. (AUD-12) */
export function SessionOffline({ onRetry }: { onRetry: () => void }) {
  return (
    <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center p-6 text-center">
      <p className="font-serif text-3xl">You&apos;re offline</p>
      <p className="mt-2 text-ink-muted">We couldn&apos;t reach Aurel to restore your session. You&apos;re still signed in - we&apos;ll reconnect
        automatically when your connection is back.</p>
      <Button className="mt-6" onClick={onRetry}>Try again</Button>
    </main>
  );
}
