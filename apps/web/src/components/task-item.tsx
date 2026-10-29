"use client";

import { ApiError, PLATFORM_LABELS, TASK_KIND_LABELS, formatDate, syncStateFor, type SyncState, type Task } from "@aurel/shared";
import Link from "next/link";
import { useRef, useState } from "react";

import { Badge, SyncStatus, cx } from "./ui";
import { pop, shake } from "./motion/primitives";
import { api } from "@/lib/session";
import { REDUCED, gsap, token } from "@/lib/motion";

/** Toggle a task. Optimistic, but reverts and explains if the server rejects or can't be reached. */
export function TaskItem({ task, onChange }: { task: Task; onChange?: (t: Task) => void }) {
  const [t, setT] = useState(task);
  const [state, setState] = useState<SyncState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const row = useRef<HTMLLIElement>(null);
  const box = useRef<HTMLInputElement>(null);
  if (task.version > t.version) setT(task); // newer server copy arrived via refresh

  async function toggle(target: "open" | "done") {
    const before = t;
    setT({ ...t, status: target });
    setState("saving");
    setMessage(null);
    try {
      const saved = await api.setTask(t.id, target);
      setT(saved);
      setState("saved");
      if (target === "done") {
        // Success: the check pops and the row briefly warms with the success tint.
        pop(box.current, 1.35);
        if (!matchMedia(REDUCED).matches) {
          gsap.fromTo(row.current, { backgroundColor: token("success-soft") }, { backgroundColor: "rgba(0,0,0,0)", duration: 1.2, ease: "power2.out", clearProps: "backgroundColor" });
        }
      }
      onChange?.(saved);
    } catch (e) {
      setT(before);
      shake(row.current);
      setState(syncStateFor(e));
      setMessage(e instanceof ApiError ? e.message : null);
    }
  }

  const done = t.status === "done";
  const locked = t.kind === "profile" && !done;
  return (
    <li ref={row} className="-mx-2 flex gap-3 px-2 py-3.5">
      <input ref={box} type="checkbox" checked={done} disabled={state === "saving" || locked}
        onChange={(e) => toggle(e.target.checked ? "done" : "open")}
        aria-label={`${done ? "Mark not done" : "Mark done"}: ${t.title}`}
        className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[var(--c-primary)] disabled:cursor-not-allowed" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {t.link ? (
            <Link href={t.link} className={cx("font-medium hover:underline", done && "text-ink-muted line-through")}>{t.title}</Link>
          ) : (
            <span className={cx("font-medium", done && "text-ink-muted line-through")}>{t.title}</span>
          )}
          <Badge tone={t.kind === "milestone" ? "accent" : "neutral"}>{TASK_KIND_LABELS[t.kind]}</Badge>
          {t.overdue && !done && <Badge tone="warning">Overdue</Badge>}
        </div>
        {t.detail && <p className="mt-0.5 text-sm text-ink-muted">{t.detail}</p>}
        <p className="mt-1 text-xs text-ink-subtle">
          {done && t.completed_from ? `Completed on ${PLATFORM_LABELS[t.completed_from] ?? t.completed_from} · ${formatDate(t.completed_at)}`
            : t.due_at ? `Due ${formatDate(t.due_at)}` : locked ? "Completes automatically when onboarding is finished" : ""}
        </p>
        {state !== "idle" && (
          <div className="mt-1"><SyncStatus state={state} onRetry={() => toggle(done ? "open" : "done")} /></div>
        )}
        {message && state !== "saved" && <p className="text-xs text-danger">{message}</p>}
      </div>
    </li>
  );
}
