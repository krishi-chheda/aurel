"use client";

import { relativeTime, resolveLink } from "@aurel/shared";
import { useRouter } from "next/navigation";

import { Button, Card, EmptyState, LoadError, PageHeader, PageSkeleton, SyncStatus, cx } from "@/components/ui";
import { Enter } from "@/components/motion/primitives";
import { ICONS, IconBadge } from "@/components/visuals";
import { api } from "@/lib/session";
import { REDUCED, gsap } from "@/lib/motion";
import { useResource } from "@/lib/use-resource";

export default function NotificationsPage() {
  const router = useRouter();
  const { data, error, state, syncedAt, reload, setData } = useResource(() => api.notifications(50));
  if (!data) return error ? <LoadError error={error} onRetry={reload} /> : <PageSkeleton />;

  async function open(id: string, link: string | null) {
    const n = await api.readNotification(id).catch(() => null);
    if (n) setData({ ...data!, unread: Math.max(0, data!.unread - (data!.items.find((i) => i.id === id)?.read_at ? 0 : 1)),
      items: data!.items.map((i) => (i.id === id ? n : i)) });
    const target = resolveLink(link); // only ever navigate to a known in-app route
    if (target) router.push(target.path);
  }

  return (
    <Enter>
      <PageHeader eyebrow="Updates" icon={ICONS.bell} title="Notifications" sub={data.unread ? `${data.unread} unread` : "You're all caught up"}
        action={<div className="flex items-center gap-4"><SyncStatus state={state} syncedAt={syncedAt} onRetry={reload} />
          {data.unread > 0 && <Button variant="secondary" size="sm" onClick={async () => {
            await api.readAllNotifications();
            const dots = document.querySelectorAll("[data-unread-dot].bg-accent");
            if (dots.length && !matchMedia(REDUCED).matches) await gsap.to(dots, { scale: 0, autoAlpha: 0, duration: 0.3, stagger: 0.06, ease: "power2.in" });
            await reload();
            gsap.set(dots, { clearProps: "all" });
          }}>Mark all read</Button>}</div>} />
      {data.items.length === 0 ? <EmptyState title="No notifications" /> : (
        <div data-stagger className="space-y-6">
          {groupByDay(data.items).map(([label, items]) => (
            <section key={label} aria-label={label}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-muted">{label}</h2>
              <Card className="p-0 sm:p-0">
                <ul className="divide-y divide-line">
                  {items.map((n) => {
                    const [icon, tone] = KIND[n.kind] ?? [ICONS.bell, "neutral" as const];
                    return (
                      <li key={n.id}>
                        <button onClick={() => open(n.id, n.link)}
                          className={cx("group flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-muted", !n.read_at && "bg-primary-soft/40")}>
                          <span className="relative">
                            <IconBadge d={icon} tone={n.read_at ? "neutral" : tone} size="sm" />
                            <span data-unread-dot aria-hidden className={cx("absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface", n.read_at ? "hidden" : "bg-accent")} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={cx("block", !n.read_at && "font-semibold")}>{n.title}{!n.read_at && <span className="sr-only"> (unread)</span>}</span>
                            <span className="block text-sm text-ink-muted">{n.body}</span>
                          </span>
                          <span className="shrink-0 text-xs text-ink-subtle">{relativeTime(n.created_at)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}
    </Enter>
  );
}

const KIND: Record<string, [string, "primary" | "accent" | "info" | "success"]> = {
  report: [ICONS.doc, "info"], appointment: [ICONS.calendar, "primary"], onboarding: [ICONS.user, "accent"], account: [ICONS.shield, "success"],
};

/** Today / This week / Earlier, keeping the server's newest-first order. */
function groupByDay<T extends { created_at: string }>(items: T[]): [string, T[]][] {
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const weekAgo = startOfToday.getTime() - 6 * 86_400_000;
  const label = (iso: string) => { const t = new Date(iso).getTime(); return t >= startOfToday.getTime() ? "Today" : t >= weekAgo ? "This week" : "Earlier"; };
  const out: [string, T[]][] = [];
  for (const n of items) {
    const l = label(n.created_at);
    if (out.at(-1)?.[0] === l) out.at(-1)![1].push(n); else out.push([l, [n]]);
  }
  return out;
}
