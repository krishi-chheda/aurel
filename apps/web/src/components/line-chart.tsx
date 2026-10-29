"use client";

import { formatDate, type Series } from "@aurel/shared";
import { useRef } from "react";

import { FULL, gsap, useGSAP } from "@/lib/motion";

/**
 * Plain SVG line chart: points, reference band, labelled axes. Only results in the catalogue unit are plotted;
 * anything else is listed in the table below the chart instead of being silently converted.
 */
export function LineChart({ series, height = 240 }: { series: Series; height?: number }) {
  const svg = useRef<SVGSVGElement>(null);
  // Draws itself when it scrolls into view (and again when the date range changes):
  // reference band settles in, the line traces left to right, then each result lands in order.
  useGSAP(() => {
    if (!svg.current) return;
    const q = gsap.utils.selector(svg);
    const mm = gsap.matchMedia();
    mm.add(FULL, () => {
      gsap.timeline({ scrollTrigger: { trigger: svg.current, start: "top 85%", once: true } })
        .from(q("[data-band]"), { scaleY: 0, transformOrigin: "50% 50%", autoAlpha: 0, duration: 0.6 })
        .from(q("[data-grid]"), { autoAlpha: 0, stagger: 0.05, duration: 0.4 }, "<")
        .fromTo(q("[data-line]"), { drawSVG: "0%" }, { drawSVG: "100%", duration: 1.1, ease: "power2.inOut" }, "-=0.3")
        .from(q("[data-point]"), { scale: 0, transformOrigin: "50% 50%", duration: 0.4, ease: "back.out(2)", stagger: 1.1 / Math.max(1, series.points.length) }, "<0.1");
    });
    return () => mm.revert();
  }, { dependencies: [series], revertOnUpdate: true, scope: svg });
  const pts = series.points.filter((p) => p.value !== null && p.unit === series.unit) as (Series["points"][number] & { value: number })[];
  if (pts.length === 0) return null;
  const W = 640, H = height, L = 48, R = 16, T = 16, B = 32;
  const values = pts.map((p) => p.value);
  const band = [series.ref_low, series.ref_high].filter((v): v is number => v !== null);
  let lo = Math.min(...values, ...band), hi = Math.max(...values, ...band);
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.15;
  lo -= pad; hi += pad;
  const times = pts.map((p) => new Date(p.measured_at).getTime());
  const t0 = Math.min(...times), t1 = Math.max(...times);
  const x = (t: number) => (t1 === t0 ? (L + W - R) / 2 : L + ((t - t0) / (t1 - t0)) * (W - L - R));
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const ticks = Array.from({ length: 4 }, (_, i) => lo + ((hi - lo) * i) / 3);
  const bandTop = y(series.ref_high ?? hi), bandBottom = y(series.ref_low ?? lo);
  const summary = `${series.name} in ${series.unit}: ` + pts.map((p) => `${formatDate(p.measured_at)} ${p.value}`).join(", ");

  return (
    <figure>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={summary}>
        {band.length > 0 && (
          <rect data-band x={L} width={W - L - R} y={bandTop} height={Math.max(0, bandBottom - bandTop)} fill="var(--c-success-soft)" />
        )}
        {ticks.map((v) => (
          <g key={v} data-grid>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--c-border)" strokeDasharray="2 4" />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--c-ink-subtle)">{+v.toFixed(2)}</text>
          </g>
        ))}
        {/* Points are only joined when a trend could be calculated; otherwise a line would imply one (AUD-16). */}
        {series.trend.comparable && (
          <polyline data-line fill="none" stroke="var(--c-primary)" strokeWidth="2" points={pts.map((p, i) => `${x(times[i])},${y(p.value)}`).join(" ")} />
        )}
        {pts.map((p, i) => (
          <g key={p.id}>
            <circle data-point cx={x(times[i])} cy={y(p.value)} r="4.5" fill="var(--c-surface)" stroke={p.status === "within" ? "var(--c-primary)" : "var(--c-warning)"} strokeWidth="2" />
            <text x={x(times[i])} y={H - 10} textAnchor="middle" fontSize="11" fill="var(--c-ink-subtle)">
              {formatDate(p.measured_at, { month: "short", year: "2-digit" })}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-4 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-success-soft ring-1 ring-line" />Reference range (illustrative)</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-warning" />Outside reference range</span>
        <span>Unit: {series.unit}</span>
        {!series.trend.comparable && pts.length > 1 && <span>Points are not joined because no trend was calculated.</span>}
      </figcaption>
    </figure>
  );
}
