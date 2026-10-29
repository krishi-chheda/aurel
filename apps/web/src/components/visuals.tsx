"use client";

import { useRef } from "react";

import { cx } from "./ui-cx";
import { FULL, gsap, useGSAP } from "@/lib/motion";

export { DateTile, ICONS, Icon, IconBadge } from "./icons";

/**
 * Where a value sits relative to its illustrative reference range. The in-range zone is shaded; the marker glides
 * into place. Purely positional - not a score.
 */
export function RangeBar({ value, low, high, status, compact }:
  { value: number | null; low: number | null; high: number | null; status: string; compact?: boolean }) {
  const marker = useRef<HTMLSpanElement>(null);
  // Scale: pad around whichever bounds exist so a single-sided range still has room either side.
  const lo = low ?? (high !== null ? high * 0.4 : 0), hi = high ?? (low !== null ? low * 2.2 : 1);
  const min = Math.min(lo - (hi - lo) * 0.35, value ?? lo), max = Math.max(hi + (hi - lo) * 0.35, value ?? hi);
  const pos = (v: number) => Math.min(100, Math.max(0, ((v - min) / (max - min || 1)) * 100));
  const zoneL = low !== null ? pos(low) : 0, zoneR = high !== null ? pos(high) : 100;
  const out = status === "above" || status === "below";

  useGSAP(() => {
    if (value === null) return;
    const mm = gsap.matchMedia();
    mm.add(FULL, () => { gsap.from(marker.current, { left: "0%", opacity: 0, duration: 0.9, ease: "power3.out", delay: 0.15 }); });
    return () => mm.revert();
  }, { dependencies: [value] });

  if (value === null || (low === null && high === null)) return null;
  return (
    <div aria-hidden className={cx("relative w-full", compact ? "h-1.5" : "h-2")}>
      <div className="absolute inset-0 rounded-full bg-surface-muted" />
      <div className="absolute inset-y-0 rounded-full bg-success-soft ring-1 ring-success/25" style={{ left: `${zoneL}%`, right: `${100 - zoneR}%` }} />
      <span ref={marker} className={cx("absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface shadow-sm",
        compact ? "h-3 w-3" : "h-3.5 w-3.5", out ? "bg-warning" : "bg-success")} style={{ left: `${pos(value)}%` }} />
    </div>
  );
}
