"use client";

import { useRef, useState } from "react";

import { DrawnCheck, pop, shake } from "@/components/motion/primitives";
import { Button, Field, cx } from "@/components/ui";
import { OWNER } from "@/lib/owner";

const ICONS = {
  mail: "M4 6h16v12H4zM4 7l8 6 8-6",
  linkedin: "M6 9v9M6 6v.01M10 18v-5a3 3 0 0 1 6 0v5M10 10v8M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z",
  github: "M9 19c-4 1.5-4-2-6-2.5M15 21v-3.5a3 3 0 0 0-.9-2.3c3-.3 6-1.4 6-6.4a5 5 0 0 0-1.4-3.5 4.6 4.6 0 0 0-.1-3.5s-1.1-.3-3.6 1.4a12.4 12.4 0 0 0-6.4 0C6.1 1.5 5 1.8 5 1.8a4.6 4.6 0 0 0-.1 3.5A5 5 0 0 0 3.5 8.8c0 5 3 6.1 6 6.4a3 3 0 0 0-.9 2.3V21",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
};
const Icon = ({ d }: { d: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);

const TOPICS = ["Feedback on Aurel", "An opportunity", "Something else"] as const;

/** The builder's card: who made this and how to reach them. */
export function OwnerCard() {
  const [copied, setCopied] = useState(false);
  const copyBtn = useRef<HTMLButtonElement>(null);
  const rows: [string, string, string, string][] = [
    ["Email", OWNER.email, `mailto:${OWNER.email}`, ICONS.mail],
    ["LinkedIn", OWNER.linkedin.replace("https://", ""), OWNER.linkedin, ICONS.linkedin],
    ["GitHub", OWNER.github.replace("https://", ""), OWNER.github, ICONS.github],
    ["Portfolio", OWNER.portfolio.replace("https://", ""), OWNER.portfolio, ICONS.globe],
  ];
  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-surface p-6 sm:p-8">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary-soft blur-3xl" />
      <div className="relative flex items-center gap-4">
        <div className="relative grid h-16 w-16 shrink-0 place-items-center rounded-full bg-primary font-serif text-2xl text-white dark:text-canvas">
          KC
          <span aria-hidden className="absolute -inset-1 rounded-full border border-primary/30" />
        </div>
        <div>
          <p className="font-serif text-2xl leading-tight">{OWNER.name}</p>
          <p className="text-sm text-ink-muted">Designed and built Aurel</p>
        </div>
      </div>
      <p className="relative mt-5 inline-flex items-center gap-2 rounded-full bg-success-soft px-3 py-1 text-xs font-semibold text-success">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
        </span>
        Open to opportunities
      </p>
      <p className="relative mt-3 text-[15px] text-ink-muted">
        Interested in AI engineering, machine learning, software engineering and technology consulting. Happy to talk about how
        Aurel was built - the cross-device sync, the motion system, or anything else.
      </p>

      <ul className="relative mt-6 space-y-2">
        {rows.map(([label, value, href, icon]) => (
          <li key={label} className="group flex items-center gap-3 rounded-lg border border-line bg-canvas p-3 transition-colors hover:border-primary/40 hover:bg-primary-soft">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface text-primary shadow-sm transition-transform duration-300 group-hover:scale-110"><Icon d={icon} /></span>
            <a href={href} target={label === "Email" ? undefined : "_blank"} rel="noopener noreferrer" className="min-w-0 flex-1">
              <span className="block text-xs text-ink-subtle">{label}</span>
              <span className="block truncate font-medium text-ink group-hover:text-primary">{value}</span>
            </a>
            {label === "Email" ? (
              <button ref={copyBtn} type="button" aria-label="Copy email address"
                onClick={async () => { await navigator.clipboard?.writeText(OWNER.email).catch(() => {}); setCopied(true); pop(copyBtn.current, 1.25); setTimeout(() => setCopied(false), 1800); }}
                className="shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium text-ink-muted hover:bg-surface hover:text-ink">
                {copied ? "Copied" : <Icon d={ICONS.copy} />}
              </button>
            ) : <span aria-hidden className="shrink-0 pr-1 text-ink-subtle transition-transform duration-300 group-hover:translate-x-1">↗</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** No backend for messages: the form opens a pre-filled draft in the visitor's own email app. */
export function ContactForm() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [topic, setTopic] = useState<(typeof TOPICS)[number]>(TOPICS[0]);
  const [opened, setOpened] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const next: Record<string, string> = {};
    if (!f.name?.trim()) next.name = "Enter your name.";
    if (!/^\S+@\S+\.\S+$/.test(f.email ?? "")) next.email = "Enter a valid email address.";
    if ((f.message ?? "").trim().length < 10) next.message = "Tell me a little more (at least 10 characters).";
    setErrors(next);
    if (Object.keys(next).length) return shake(formRef.current);
    const subject = `[Aurel] ${topic} from ${f.name.trim()}`;
    const body = `${f.message.trim()}\n\n- ${f.name.trim()} (${f.email.trim()})`;
    window.location.href = `mailto:${OWNER.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setOpened(true);
  }

  if (opened) {
    return (
      <div className="rounded-lg border border-line bg-surface p-8 text-center">
        <DrawnCheck size={64} />
        <p className="mt-4 font-serif text-2xl">Draft opened</p>
        <p className="mx-auto mt-2 max-w-sm text-ink-muted">
          Press send in your email app to deliver it. Nothing opened? Write to <a className="text-primary underline" href={`mailto:${OWNER.email}`}>{OWNER.email}</a>.
        </p>
        <Button variant="ghost" className="mt-4" onClick={() => setOpened(false)}>Write another message</Button>
      </div>
    );
  }
  return (
    <form ref={formRef} noValidate onSubmit={submit} className="grid gap-5 rounded-lg border border-line bg-surface p-6 sm:p-8">
      <div>
        <p className="font-serif text-2xl">Send a message</p>
        <p className="mt-1 text-sm text-ink-muted">Opens a pre-filled draft in your own email app - nothing is sent from this site.</p>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">What&apos;s it about?</legend>
        <div className="flex flex-wrap gap-2">
          {TOPICS.map((t) => (
            <label key={t} className={cx("inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
              topic === t ? "border-primary bg-primary-soft font-medium text-primary" : "border-line-strong bg-surface hover:bg-surface-muted")}>
              <input type="radio" name="topic" className="sr-only" checked={topic === t} onChange={() => setTopic(t)} />{t}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name" name="name" autoComplete="name" error={errors.name} />
        <Field label="Email" name="email" type="email" autoComplete="email" error={errors.email} />
      </div>
      <div>
        <label htmlFor="message" className="mb-1.5 block text-sm font-medium">Message</label>
        <textarea id="message" name="message" rows={6} aria-invalid={!!errors.message || undefined}
          placeholder="Hi Krishi, I was looking at Aurel and…"
          className={cx("block w-full rounded-md border bg-surface px-3.5 py-2.5 text-[16px] placeholder:text-ink-subtle", errors.message ? "border-danger" : "border-line-strong")} />
        {errors.message && <p className="mt-1 text-xs font-medium text-danger">{errors.message}</p>}
        <p className="mt-1 text-xs text-ink-muted">Please don&apos;t include health information. In an emergency call 000.</p>
      </div>
      <Button type="submit" className="justify-self-start">Open email draft</Button>
    </form>
  );
}
