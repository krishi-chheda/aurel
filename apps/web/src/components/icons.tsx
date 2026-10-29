import { cx } from "./ui-cx";

// Server-safe (no "use client"): marketing pages are server components and must be able to import these values.
/** Line-icon paths shared by the app's pages (24x24, stroke). */
export const ICONS = {
  pulse: "M3 12h4l3-7 4 14 3-7h4",
  doc: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5",
  calendar: "M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  bell: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  chat: "M12 21a9 9 0 1 0-9-9c0 1.6.4 3 1.1 4.3L3 21l4.7-1.1A9 9 0 0 0 12 21z",
  plan: "M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9",
  flask: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3",
  pin: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  check: "M5 12.5 10 17l9-10",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
  shield: "M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  devices: "M3 5h13v9H3zM1 17h17M19 8h3v12h-3z",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
} as const;

export function Icon({ d, size = 20, className }: { d: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}><path d={d} /></svg>
  );
}

/** Round tinted icon badge. */
export function IconBadge({ d, tone = "primary", size = "md" }: { d: string; tone?: "primary" | "accent" | "info" | "warning" | "success" | "neutral"; size?: "sm" | "md" }) {
  const tones = { primary: "bg-primary-soft text-primary", accent: "bg-accent-soft text-accent", info: "bg-info-soft text-info",
    warning: "bg-warning-soft text-warning", success: "bg-success-soft text-success", neutral: "bg-surface-muted text-ink-muted" };
  return (
    <span aria-hidden className={cx("grid shrink-0 place-items-center rounded-full", tones[tone], size === "sm" ? "h-9 w-9" : "h-11 w-11")}>
      <Icon d={d} size={size === "sm" ? 17 : 20} />
    </span>
  );
}

/** Calendar-style date tile. */
export function DateTile({ iso, muted }: { iso: string; muted?: boolean }) {
  const d = new Date(iso);
  return (
    <div className={cx("flex w-16 shrink-0 flex-col items-center rounded-lg border py-2 text-center", muted ? "border-line bg-surface-muted/60" : "border-line bg-canvas")}>
      <span className={cx("text-[11px] font-semibold uppercase tracking-wider", muted ? "text-ink-subtle" : "text-accent")}>{d.toLocaleDateString("en-AU", { month: "short" })}</span>
      <span className={cx("font-serif text-3xl leading-none", muted && "text-ink-muted")}>{d.getDate()}</span>
      <span className="mt-0.5 text-[11px] text-ink-muted">{d.toLocaleDateString("en-AU", { weekday: "short" })}</span>
    </div>
  );
}

