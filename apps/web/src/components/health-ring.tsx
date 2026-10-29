"use client";

import { useRef } from "react";

import { CountUp } from "@/components/motion/primitives";
import { FULL, gsap, useGSAP } from "@/lib/motion";

/**
 * Donut of the latest results by reference-range status. Segments sweep in one after another.
 * A count of results versus illustrative ranges - not a score and not a diagnosis.
 */
export function HealthRing({ within, outside, other }: { within: number; outside: number; other: number }) {
  const root = useRef<SVGSVGElement>(null);
  const total = within + outside + other || 1;
  const R = 54, C = 2 * Math.PI * R, gap = total > 1 ? 4 : 0;
  const segs = [
    { n: within, color: "var(--c-success)" },
    { n: outside, color: "var(--c-warning)" },
    { n: other, color: "var(--c-border-strong)" },
  ].filter((s) => s.n > 0);
  let offset = 0;

  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add(FULL, () => {
      // Segments carry their arc in stroke-dasharray, so grow that (DrawSVG would overwrite it).
      gsap.from(gsap.utils.toArray("[data-seg]", root.current), { attr: { "stroke-dasharray": `0.1 ${C}` }, duration: 0.9, stagger: 0.35, ease: "power2.inOut", delay: 0.2 });
    });
    return () => mm.revert();
  }, { scope: root, dependencies: [within, outside, other], revertOnUpdate: true });

  return (
    <div className="relative mx-auto aspect-square w-40">
      <svg ref={root} viewBox="0 0 140 140" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--c-surface-muted)" strokeWidth="12" />
        {segs.map((s, i) => {
          const len = (s.n / total) * C - gap;
          const el = <circle key={i} data-seg cx="70" cy="70" r={R} fill="none" stroke={s.color} strokeWidth="12" strokeLinecap="round"
            strokeDasharray={`${Math.max(0.1, len)} ${C}`} strokeDashoffset={-offset} />;
          offset += (s.n / total) * C;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-serif text-4xl leading-none"><CountUp value={within} /><span className="text-xl text-ink-subtle">/{within + outside + other}</span></span>
        <span className="mt-1 text-xs text-ink-muted">in range</span>
      </div>
    </div>
  );
}
