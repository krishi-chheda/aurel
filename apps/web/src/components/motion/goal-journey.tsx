"use client";

import { useRef } from "react";

import { EASE, MotionPathPlugin, REDUCED, gsap, token, useGSAP } from "@/lib/motion";

/**
 * The goal journey: a figure walks a winding path towards "Healthy" as care-plan actions are completed.
 * Progress drives three things at once - position on the path, posture (slouched and grey at the start,
 * upright and in brand green near the goal) and the scene (the sun rises). Milestones along the path light up
 * as actions are done; at 100% the figure raises its arms and the flag waves.
 * When progress changes (an action is ticked here or synced from the phone) the figure walks from where it was.
 */
const PATH = "M40 222 C 140 222, 150 168, 250 170 S 360 214, 450 184 S 560 116, 640 120 S 720 96, 748 86";

export function GoalJourney({ done, total, compact = false, label = "Healthy" }:
  { done: number; total: number; compact?: boolean; label?: string }) {
  const root = useRef<SVGSVGElement>(null);
  const last = useRef(0);
  const pct = total ? done / total : 0;

  useGSAP(() => {
    const svg = root.current!;
    const q = gsap.utils.selector(svg);
    const path = svg.querySelector<SVGPathElement>("[data-route]")!;
    const fig = q("[data-figure]")[0];
    const from = last.current, to = pct;
    last.current = to;
    const reduce = matchMedia(REDUCED).matches;
    const grey = token("ink-subtle"), green = token("primary");
    const health = (h: number) => ({
      torso: 14 * (1 - h), head: 10 * (1 - h), arms: -30 + 40 * h, glow: Math.max(0, h * 1.1 - 0.15),
      sun: 214 - 184 * h, color: gsap.utils.interpolate(grey, green, h),
    });
    const apply = (h: number) => {
      const v = health(h);
      gsap.set(q("[data-torso]"), { rotation: v.torso, svgOrigin: "0 -16" });
      gsap.set(q("[data-head]"), { rotation: v.head, svgOrigin: "0 -36" });
      gsap.set(q("[data-arm-l]"), { rotation: v.arms, svgOrigin: "0 -33" });
      gsap.set(q("[data-arm-r]"), { rotation: -v.arms, svgOrigin: "0 -33" });
      gsap.set(q("[data-glow]"), { opacity: v.glow });
      gsap.set(q("[data-sun], [data-sun-disc]"), { attr: { cy: v.sun } });
      gsap.set(fig, { color: v.color });
    };
    // Milestones: one per action, lit once reached.
    q("[data-stone]").forEach((el, i) => gsap.set(el, { attr: { fill: (i + 1) / total <= to + 1e-6 ? green : "transparent" } }));
    gsap.set(q("[data-trail]"), { drawSVG: `0% ${to * 100}%` });

    if (reduce || from === to) {
      gsap.set(fig, { motionPath: { path, align: path, alignOrigin: [0.5, 1], start: to, end: to } });
      apply(to);
      gsap.set(q("[data-cheer]"), { autoAlpha: to >= 1 ? 1 : 0 });
      return;
    }
    const state = { p: from };
    const dur = 0.9 + Math.abs(to - from) * 2.2;
    const tl = gsap.timeline({ defaults: { ease: EASE.move } });
    // Walk cycle while moving: legs scissor, a slight bob.
    const walk = gsap.timeline({ repeat: -1, yoyo: true, defaults: { duration: 0.28, ease: "sine.inOut" } })
      .fromTo(q("[data-leg-l]"), { rotation: -22, svgOrigin: "0 -16" }, { rotation: 22, svgOrigin: "0 -16" }, 0)
      .fromTo(q("[data-leg-r]"), { rotation: 22, svgOrigin: "0 -16" }, { rotation: -22, svgOrigin: "0 -16" }, 0)
      .fromTo(q("[data-body]"), { y: 0 }, { y: -2 }, 0);
    tl.to(state, {
      p: to, duration: dur,
      onUpdate: () => {
        gsap.set(fig, { motionPath: { path, align: path, alignOrigin: [0.5, 1], start: state.p, end: state.p } });
        apply(state.p);
      },
      onComplete: () => {
        walk.kill();
        gsap.to(q("[data-leg-l], [data-leg-r]"), { rotation: 0, svgOrigin: "0 -16", duration: 0.25 });
        gsap.to(q("[data-body]"), { y: 0, duration: 0.25 });
      },
    })
      .fromTo(q("[data-trail]"), { drawSVG: `0% ${from * 100}%` }, { drawSVG: `0% ${to * 100}%`, duration: dur }, 0);
    if (to >= 1) {
      tl.to(q("[data-arm-l]"), { rotation: 150, svgOrigin: "0 -33", duration: 0.5, ease: "back.out(2)" })
        .to(q("[data-arm-r]"), { rotation: -150, svgOrigin: "0 -33", duration: 0.5, ease: "back.out(2)" }, "<")
        .fromTo(q("[data-cheer]"), { autoAlpha: 0, scale: 0.4, transformOrigin: "50% 50%" }, { autoAlpha: 1, scale: 1, duration: 0.6, stagger: 0.06 }, "<")
        .to(q("[data-flag]"), { skewY: -8, duration: 0.5, repeat: 3, yoyo: true, ease: "sine.inOut", transformOrigin: "0% 50%" }, "<");
    } else {
      gsap.set(q("[data-cheer]"), { autoAlpha: 0 });
    }
  }, { dependencies: [pct], scope: root });

  const stones = Array.from({ length: total }, (_, i) => (i + 1) / total);
  return (
    <figure className={compact ? "" : "rounded-lg border border-line bg-surface p-4 sm:p-6"}>
      <svg ref={root} viewBox="0 0 800 260" className="h-auto w-full overflow-visible" role="img"
        aria-label={`Progress towards your goal: ${done} of ${total} plan actions complete (${Math.round(pct * 100)}%).`}>
        <defs>
          <radialGradient id="gj-sun"><stop offset="0%" stopColor="var(--c-accent)" stopOpacity="0.55" /><stop offset="100%" stopColor="var(--c-accent)" stopOpacity="0" /></radialGradient>
          <radialGradient id="gj-glow"><stop offset="0%" stopColor="var(--c-primary)" stopOpacity="0.35" /><stop offset="100%" stopColor="var(--c-primary)" stopOpacity="0" /></radialGradient>
        </defs>
        {/* Scene: the sun rises with progress; two calm hills. */}
        <g data-sun-g>
          <circle data-sun cx="170" cy="214" r="62" fill="url(#gj-sun)" />
        </g>
        <circle data-sun-disc cx="170" cy="214" r="22" fill="var(--c-accent)" opacity="0.9" />
        <path d="M0 210 C 160 150, 300 196, 430 170 S 680 110, 800 128 V 260 H 0 Z" fill="var(--c-primary-soft)" />
        <path d="M0 236 C 180 206, 340 240, 520 216 S 720 200, 800 210 V 260 H 0 Z" fill="var(--c-surface-muted)" />

        {/* Route: dashed path ahead, solid trail behind. */}
        <path d={PATH} fill="none" stroke="var(--c-border-strong)" strokeWidth="3" strokeDasharray="2 9" strokeLinecap="round" />
        <path data-route d={PATH} fill="none" stroke="none" />
        <path data-trail d={PATH} fill="none" stroke="var(--c-primary)" strokeWidth="3.5" strokeLinecap="round" />
        {stones.map((f, i) => <Stone key={i} f={f} />)}

        {/* Goal flag. */}
        <g transform="translate(748 86)">
          <line x1="0" y1="0" x2="0" y2="-54" stroke="var(--c-ink)" strokeWidth="2.5" strokeLinecap="round" />
          <path data-flag d="M1 -54 L 40 -44 L 1 -33 Z" fill="var(--c-accent)" />
          <text x="-8" y="-62" textAnchor="end" fontSize="17" fontWeight="600" fill="var(--c-ink)" fontFamily="var(--font-fraunces), Georgia, serif">{label}</text>
          {[[-18, -70], [14, -78], [34, -64], [-30, -52]].map(([x, y], i) => (
            <path key={i} data-cheer d={`M${x} ${y - 5} L ${x + 1.6} ${y - 1.6} L ${x + 5} ${y} L ${x + 1.6} ${y + 1.6} L ${x} ${y + 5} L ${x - 1.6} ${y + 1.6} L ${x - 5} ${y} L ${x - 1.6} ${y - 1.6} Z`}
              fill="var(--c-accent)" style={{ visibility: "hidden" }} />
          ))}
        </g>
        <text x="40" y="252" fontSize="13" fill="var(--c-ink-subtle)">Start</text>

        {/* The figure: feet at (0,0); parts rotate around hips/neck/shoulders. Colour comes from currentColor. */}
        <g data-figure style={{ color: "var(--c-ink-subtle)" }}>
          <g transform="scale(1.75)">
            <ellipse cx="0" cy="0.5" rx="11" ry="2.4" fill="var(--c-ink)" opacity="0.12" />
            <circle data-glow cx="0" cy="-26" r="30" fill="url(#gj-glow)" opacity="0" />
            <g data-body stroke="currentColor" strokeLinecap="round" fill="none">
              <line data-leg-l x1="0" y1="-16" x2="-5" y2="0" strokeWidth="4.2" />
              <line data-leg-r x1="0" y1="-16" x2="5" y2="0" strokeWidth="4.2" />
              <g data-torso>
                <rect x="-5.5" y="-37" width="11" height="23" rx="5.5" fill="currentColor" stroke="none" />
                <line data-arm-l x1="-2" y1="-33" x2="-10" y2="-21" strokeWidth="3.6" />
                <line data-arm-r x1="2" y1="-33" x2="10" y2="-21" strokeWidth="3.6" />
                <g data-head><circle cx="0" cy="-45" r="6.5" fill="currentColor" stroke="none" /></g>
              </g>
            </g>
          </g>
        </g>
      </svg>
      {!compact && (
        <figcaption className="mt-3 flex flex-wrap items-baseline justify-between gap-2 text-sm text-ink-muted">
          <span><strong className="text-ink">{done} of {total}</strong> plan actions complete</span>
          <span>{done >= total ? "Goal reached - keep it going" : `${total - done} to go`}</span>
        </figcaption>
      )}
    </figure>
  );
}

/** A milestone marker placed at fraction f along the route (filled by the parent's tween when reached). */
function Stone({ f }: { f: number }) {
  const ref = useRef<SVGCircleElement>(null);
  useGSAP(() => {
    const route = ref.current?.ownerSVGElement?.querySelector<SVGPathElement>("[data-route]");
    if (!route) return;
    const pt = MotionPathPlugin.getPositionOnPath(MotionPathPlugin.getRawPath(route), f, false);
    gsap.set(ref.current, { attr: { cx: pt.x, cy: pt.y } });
  }, { dependencies: [f] });
  return <circle ref={ref} data-stone r="6" cx="-20" cy="-20" fill="transparent" stroke="var(--c-primary)" strokeWidth="2.5" />;
}
