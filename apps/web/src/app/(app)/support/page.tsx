"use client";

import { ApiError, resolveLink, type AssistantAnswer } from "@aurel/shared";
import Link from "next/link";
import { useRef, useState } from "react";

import { Badge, Button, Card, Notice, PageHeader } from "@/components/ui";
import { Appear, Enter } from "@/components/motion/primitives";
import { ICONS, Icon, IconBadge } from "@/components/visuals";
import { api } from "@/lib/session";

type Msg = { from: "you" | "assistant"; text: string; answer?: AssistantAnswer };
const SUGGESTIONS = ["How do I finish onboarding on my phone?", "Where are my reports?", "Why is there no trend on my chart?", "How do I reschedule?"];

export default function Support() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function ask(text: string) {
    if (!text.trim()) return;
    setMsgs((m) => [...m, { from: "you", text }]);
    setBusy(true);
    setError(null);
    try {
      const a = await api.ask(text);
      setMsgs((m) => [...m, { from: "assistant", text: a.answer, answer: a }]);
      if (input.current) input.current.value = "";
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't reach the assistant.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Enter className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow="Help" icon={ICONS.chat} title="Support" sub="A help assistant for finding your way around Aurel." />
      <Notice tone="info" title="What this assistant can do">
        It answers questions about using this demo and gives a few pre-written general explanations. It doesn&apos;t read your
        records, give medical advice, diagnose, or suggest treatment changes. In an emergency call 000.
      </Notice>
      <Card>
        <div aria-live="polite" className="space-y-4">
          {msgs.length === 0 && (
            <div className="py-4 text-center">
              <div className="mx-auto w-fit"><IconBadge d={ICONS.spark} tone="accent" /></div>
              <p className="mt-3 font-serif text-xl">How can I help?</p>
              <p className="mt-1 text-sm text-ink-muted">Try one of these, or type your own question.</p>
              <div className="mt-5 grid gap-2 text-left sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => ask(s)}
                    className="group flex items-center justify-between gap-3 rounded-lg border border-line bg-canvas px-4 py-3 text-sm transition-colors hover:border-primary/40 hover:bg-primary-soft">
                    {s}<Icon d="M9 6l6 6-6 6" size={16} className="shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5" />
                  </button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <Appear key={i} from={m.from === "you" ? "right" : "left"} className={m.from === "you" ? "flex justify-end" : "flex items-start gap-3"}>
            {m.from === "assistant" && <IconBadge d={ICONS.spark} tone="accent" size="sm" />}
            <div className={m.from === "you" ? "max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-white dark:text-canvas" : "max-w-[85%] rounded-2xl rounded-tl-md bg-surface-muted px-4 py-3"}>
              <p className="sr-only">{m.from === "you" ? "You said" : "Assistant replied"}:</p>
              {m.answer?.kind === "safety" && <Badge tone="warning" className="mb-2">Safety notice</Badge>}
              <p>{m.text}</p>
              {m.answer?.links.filter((l) => resolveLink(l.href)).map((l) => (
                <Link key={l.href} href={l.href} className="mt-2 mr-3 inline-block text-sm font-medium text-primary underline">{l.label}</Link>
              ))}
              {m.answer && <p className="mt-2 text-xs text-ink-subtle">{m.answer.disclaimer}</p>}
            </div>
            </Appear>
          ))}
        </div>
        {error && <div className="mt-4"><Notice tone="danger">{error}</Notice></div>}
        <form className="mt-5 flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(input.current?.value ?? ""); }}>
          <label htmlFor="q" className="sr-only">Your question</label>
          <input ref={input} id="q" maxLength={500} placeholder="Ask about using Aurel…" autoComplete="off"
            className="min-h-11 flex-1 rounded-md border border-line-strong bg-surface px-3.5 text-[16px]" />
          <Button type="submit" loading={busy}>Ask</Button>
        </form>
      </Card>
    </Enter>
  );
}
