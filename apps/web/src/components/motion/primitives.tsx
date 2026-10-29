"use client";

import { useRef } from "react";

import { DUR, EASE, FULL, REDUCED, ScrollTrigger, gsap, token, useGSAP } from "@/lib/motion";

/**
 * Tells the pre-paint fail-safe (motionGate in app/layout.tsx) that the entrance actually finished. Set on
 * completion, not on start: in a background tab the animation can start and then stall (AUD-15).
 */
const motionDone = () => { document.documentElement.dataset.motion = "done"; };

/**
 * Hero copy entrance. Lines rise out of masks (hero first), the accent underline draws itself,
 * then supporting copy and CTAs follow - one direction of travel, total stagger under 0.5s.
 * Children mark parts with data-line (masked line), data-underline (svg path), data-rise.
 */
export function HeroIntro({ children, className }: { children: React.ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const q = gsap.utils.selector(root);
    const mm = gsap.matchMedia();
    mm.add(FULL, () => {
      gsap.timeline({ defaults: { ease: EASE.enter }, onComplete: motionDone })
        .fromTo(q("[data-line]"), { yPercent: 110, autoAlpha: 1 }, { yPercent: 0, duration: 1.05, stagger: 0.12, ease: "power4.out" })
        .fromTo(q("[data-underline]"), { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.8, ease: EASE.move }, "-=0.45")
        .fromTo(q("[data-rise]"), { y: 18, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: DUR.standard, stagger: 0.08 }, "-=0.7");
    });
    mm.add(REDUCED, () => { gsap.set(q("[data-line], [data-rise]"), { autoAlpha: 1 }); motionDone(); });
    return () => mm.revert();
  }, { scope: root });
  return <div ref={root} className={className}>{children}</div>;
}

/** Elements marked data-reveal rise in as they enter the viewport, batched so neighbours stagger together. */
export function RevealGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const items = gsap.utils.toArray<HTMLElement>("[data-reveal]", root.current);
    const mm = gsap.matchMedia();
    mm.add(FULL, () => {
      // opacity (not autoAlpha): content waiting to be revealed stays reachable by screen readers and find-in-page.
      gsap.set(items, { y: 28, opacity: 0 });
      ScrollTrigger.batch(items, {
        start: "top 88%",
        once: true,
        onEnter: (batch) => gsap.to(batch, { y: 0, opacity: 1, duration: 0.8, stagger: 0.09, overwrite: true }),
      });
    });
    return () => mm.revert();
  }, { scope: root });
  return <div ref={root} className={className}>{children}</div>;
}

/**
 * How-it-works steps, scrubbed to scroll: a thread runs across the top of each card in turn and the step
 * "lights up" as the thread reaches it - the journey literally progresses as you read down the page.
 */
export function ScrollSteps({ items }: { items: [string, string][] }) {
  const root = useRef<HTMLOListElement>(null);
  useGSAP(() => {
    const q = gsap.utils.selector(root);
    const mm = gsap.matchMedia();
    mm.add(FULL, () => {
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: { trigger: root.current, start: "top 78%", end: "bottom 45%", scrub: 0.6 },
      });
      q("[data-step]").forEach((step, i) => {
        const at = i * 1;
        tl.fromTo(step.querySelector("[data-thread]"), { scaleX: 0 }, { scaleX: 1, duration: 1 }, at)
          .fromTo(step.querySelector("[data-num]"), { color: token("ink-subtle") }, { color: token("primary"), duration: 0.25 }, at + 0.75)
          .fromTo(step.querySelector("[data-body]"), { y: 14, opacity: 0.9 }, { y: 0, opacity: 1, duration: 0.4 }, at + 0.6);
      });
    });
    return () => mm.revert();
  }, { scope: root });

  return (
    <ol ref={root} className="grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
      {items.map(([t, d], i) => (
        <li key={t} data-step className="relative bg-surface p-6">
          <span data-thread className="absolute inset-x-0 top-0 h-[3px] origin-left bg-accent" />
          <span data-num className="font-serif text-3xl text-primary">{String(i + 1).padStart(2, "0")}</span>
          <div data-body>
            <h3 className="mt-4 text-[17px] font-semibold">{t}</h3>
            <p className="mt-2 text-[15px] text-ink-muted">{d}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Pointer-following pull for primary CTAs (fine pointers only). Springs home on leave. */
export function Magnetic({ children, strength = 0.28 }: { children: React.ReactNode; strength?: number }) {
  const root = useRef<HTMLSpanElement>(null);
  useGSAP(() => {
    const el = root.current!;
    const mm = gsap.matchMedia();
    mm.add(`${FULL} and (pointer: fine)`, () => {
      const x = gsap.quickTo(el, "x", { duration: 0.35, ease: EASE.enter });
      const y = gsap.quickTo(el, "y", { duration: 0.35, ease: EASE.enter });
      const move = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        x((e.clientX - (r.left + r.width / 2)) * strength);
        y((e.clientY - (r.top + r.height / 2)) * strength);
      };
      const leave = () => { gsap.to(el, { x: 0, y: 0, duration: 0.6, ease: "elastic.out(1, 0.5)" }); };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerleave", leave);
      return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); };
    });
    return () => mm.revert();
  }, { scope: root });
  return <span ref={root} className="inline-block">{children}</span>;
}

/** Counts up to a value once it is on screen. The final number is in the DOM from the start for SSR/screen readers. */
export function CountUp({ value, suffix = "", className }: { value: number; suffix?: string; className?: string }) {
  const el = useRef<HTMLSpanElement>(null);
  const last = useRef(0); // later updates count on from the previous value instead of restarting at 0
  useGSAP(() => {
    const render = (v: number) => { if (el.current) el.current.textContent = `${Math.round(v)}${suffix}`; };
    const from = last.current;
    last.current = value;
    if (matchMedia(REDUCED).matches) return render(value);
    const obj = { v: from };
    gsap.to(obj, { v: value, duration: Math.min(1.4, 0.5 + Math.abs(value - from) / 60), ease: "power2.out", onUpdate: () => render(obj.v) });
  }, { dependencies: [value] });
  return <span ref={el} className={`tabular-nums ${className ?? ""}`}>{value}{suffix}</span>;
}

/**
 * Page/section entrance for app screens. Direct children cascade in, and children of direct-child grids
 * stagger as a set. Blocks below the fold wait until scrolled to. Mount it when data is ready, not on the
 * skeleton, so the motion coincides with real content arriving.
 */
export function Enter({ children, className, as: As = "div" }: { children: React.ReactNode; className?: string; as?: "div" | "main" | "section" }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const el = root.current!;
    const items = [...el.children].flatMap((c) =>
      (c.classList.contains("grid") || c.hasAttribute("data-stagger")) && c.children.length > 1 ? [...c.children] : [c]) as HTMLElement[];
    const mm = gsap.matchMedia();
    mm.add(FULL, () => {
      gsap.set(items, { y: 18, opacity: 0 }); // opacity keeps unrevealed content in the accessibility tree
      ScrollTrigger.batch(items, {
        start: "top 96%",
        once: true,
        onEnter: (batch) => gsap.to(batch, { y: 0, opacity: 1, duration: 0.55, stagger: { amount: Math.min(0.4, batch.length * 0.06) }, overwrite: true }),
      });
    });
    return () => mm.revert();
  }, { scope: root });
  return <As ref={root as React.RefObject<HTMLDivElement>} className={className}>{children}</As>;
}

/** Firm, short horizontal shake for errors (no overshoot; 2-3 oscillations, ~0.4s). */
export function shake(el: Element | null) {
  if (!el || matchMedia(REDUCED).matches) return;
  gsap.to(el, { keyframes: { x: [0, -8, 7, -5, 3, 0] }, duration: 0.4, ease: "power1.inOut", overwrite: true, clearProps: "transform" });
}

/** Light success "pop" for small controls (badges, checkboxes): a little overshoot suits light elements. */
export function pop(el: Element | null, scale = 1.25) {
  if (!el || matchMedia(REDUCED).matches) return;
  gsap.fromTo(el, { scale }, { scale: 1, duration: 0.45, ease: "back.out(2.2)", clearProps: "transform" });
}

/**
 * Gliding active-item highlight for navs. Place an element with data-glide inside the container; it glides to the
 * item with aria-current="page" whenever `activeKey` changes, and snaps into place when the nav itself resizes.
 */
function placeGlide(c: HTMLElement | null, axis: "x" | "y", animate: boolean) {
  const pill = c?.querySelector<HTMLElement>("[data-glide]");
  if (!c || !pill) return;
  const active = c.querySelector<HTMLElement>('[aria-current="page"]');
  if (!active) return void gsap.to(pill, { autoAlpha: 0, duration: 0.2 });
  const vars = axis === "y"
    ? { y: active.offsetTop, height: active.offsetHeight, x: 0, width: active.offsetWidth }
    : { x: active.offsetLeft, width: active.offsetWidth, y: 0 };
  const glide = animate && pill.dataset.placed === "1" && !matchMedia(REDUCED).matches;
  gsap.to(pill, { ...vars, autoAlpha: 1, duration: glide ? 0.45 : 0, ease: EASE.move, overwrite: true });
  pill.dataset.placed = "1";
}

export function useGlide(container: React.RefObject<HTMLElement | null>, activeKey: string, axis: "y" | "x") {
  useGSAP(() => placeGlide(container.current, axis, true), { dependencies: [activeKey] });
  useGSAP(() => {
    if (!container.current) return;
    let first = true; // ResizeObserver reports once on observe; the effect above already placed it
    const ro = new ResizeObserver(() => { if (!first) placeGlide(container.current, axis, false); first = false; });
    ro.observe(container.current);
    return () => ro.disconnect();
  }, { dependencies: [activeKey], revertOnUpdate: true });
}

/** Reveals answers inside native <details> as they open. */
export function DetailsReveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP((_, contextSafe) => {
    const onToggle = contextSafe!((e: Event) => {
      const d = e.target as HTMLDetailsElement;
      if (d.open && !matchMedia(REDUCED).matches) {
        gsap.fromTo(d.querySelectorAll(":scope > :not(summary)"), { y: -6, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.4 });
      }
    });
    const el = root.current!;
    el.addEventListener("toggle", onToggle, true); // toggle doesn't bubble; capture it
    return () => el.removeEventListener("toggle", onToggle, true);
  }, { scope: root });
  return <div ref={root} className={className}>{children}</div>;
}

/** Fades/rises its child in on mount - for panels that appear on demand (booking panel, confirmations). */
export function Appear({ children, className, from = "below" }: { children: React.ReactNode; className?: string; from?: "below" | "left" | "right" }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add(FULL, () => {
      gsap.from(root.current, { autoAlpha: 0, x: from === "left" ? -16 : from === "right" ? 16 : 0, y: from === "below" ? 14 : 6, duration: 0.45 });
    });
    return () => mm.revert();
  }, { scope: root });
  return <div ref={root} className={className}>{children}</div>;
}

/** Direction-aware step change: forward steps arrive from the right, going back arrives from the left. */
export function StepSlide({ index, children }: { index: number; children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const prev = useRef(index);
  useGSAP(() => {
    const dir = Math.sign(index - prev.current);
    prev.current = index;
    if (!dir || matchMedia(REDUCED).matches) return;
    gsap.fromTo(root.current, { x: 32 * dir, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.5, clearProps: "transform" });
  }, { dependencies: [index] });
  return <div ref={root}>{children}</div>;
}

/** A circle and check that draw themselves - the "done" moment for completed flows. */
export function DrawnCheck({ size = 72 }: { size?: number }) {
  const root = useRef<SVGSVGElement>(null);
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add(FULL, () => {
      const q = gsap.utils.selector(root);
      gsap.timeline()
        .fromTo(q("circle"), { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.7, ease: EASE.move })
        .fromTo(q("path"), { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.35, ease: EASE.enter }, "-=0.15")
        .from(root.current, { scale: 0.85, duration: 0.5, ease: "back.out(2)", transformOrigin: "50% 50%" }, "-=0.2");
    });
    return () => mm.revert();
  }, { scope: root });
  return (
    <svg ref={root} aria-hidden width={size} height={size} viewBox="0 0 72 72" className="mx-auto text-primary">
      <circle cx="36" cy="36" r="32" fill="none" stroke="currentColor" strokeWidth="3" transform="rotate(-90 36 36)" />
      <path d="M23 37.5 32 46l17-19" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Sign-in pages: the logo's ring and wave draw themselves, then the form card rises. */
export function AuthStage({ children, className }: { children: React.ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const q = gsap.utils.selector(root);
    const mm = gsap.matchMedia();
    mm.add(FULL, () => {
      gsap.timeline({ defaults: { ease: EASE.enter }, onComplete: motionDone })
        .fromTo(q("[data-logo] circle"), { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.9, ease: EASE.move })
        .fromTo(q("[data-logo] path"), { drawSVG: "50% 50%" }, { drawSVG: "0% 100%", duration: 0.6, ease: EASE.move }, "-=0.45")
        .fromTo(q("[data-rise]"), { y: 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.7, stagger: 0.08 }, "-=0.55");
    });
    mm.add(REDUCED, () => { gsap.set(q("[data-rise]"), { autoAlpha: 1 }); motionDone(); });
    return () => mm.revert();
  }, { scope: root });
  return <div ref={root} className={className}>{children}</div>;
}
