"use client";

import { useRef } from "react";

import { DUR, EASE, FULL, REDUCED, ScrollTrigger, gsap, useGSAP } from "@/lib/motion";

/**
 * "The Continuity Thread" - the hero acts out the product promise in a ~9s loop:
 *   1. web: onboarding fills in on the laptop and saves
 *   2. send: a pulse travels the thread to the phone
 *   3. phone: the phone picks up at the same step and finishes
 *   4. back: "all set" travels back; the laptop confirms
 * Layers: primary = device content, secondary = thread + pulse, ambient = aura + pointer parallax.
 * Decorative only (aria-hidden); the same story is told in text beside it.
 */
const THREAD = "M228 236 C 236 316, 312 330, 344 268";

const STEPS = ["About you", "Your goals", "Lifestyle", "Health history"];

export function HeroContinuity() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const mm = gsap.matchMedia();
    const q = gsap.utils.selector(root);

    mm.add(FULL, () => {
      const laptopRows = q("[data-laptop-row]");
      const phoneRows = q("[data-phone-row]");
      const thread = root.current!.querySelector<SVGPathElement>("[data-thread]")!;
      const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.4, defaults: { ease: EASE.enter } });

      // Reset frame: every tween is a fromTo so each loop starts clean.
      tl.addLabel("web")
        .fromTo(q("[data-laptop-bar]"), { scaleX: 0.05 }, { scaleX: 0.5, duration: 1.4, ease: "steps(2)" }, "web")
        .fromTo(laptopRows.slice(0, 2), { "--tick": 0 }, { "--tick": 1, duration: DUR.quick, stagger: 0.7 }, "web+=0.5")
        .fromTo(q("[data-saving]"), { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: DUR.quick }, "web+=0.4")
        .to(q("[data-saving]"), { autoAlpha: 0, y: -6, duration: DUR.quick, ease: EASE.exit }, "web+=1.5")
        .fromTo(q("[data-saved]"), { autoAlpha: 0, scale: 0.9 }, { autoAlpha: 1, scale: 1, duration: 0.35 }, "web+=1.6")

        .addLabel("send", "web+=2.1")
        .fromTo(q("[data-thread]"), { drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: 1.1, ease: EASE.move }, "send")
        .fromTo(q("[data-pulse]"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.15 }, "send")
        .to(q("[data-pulse]"), {
          duration: 1.1, ease: EASE.move,
          motionPath: { path: thread, align: thread, alignOrigin: [0.5, 0.5] },
        }, "send")
        .to(q("[data-pulse]"), { autoAlpha: 0, scale: 2.4, duration: 0.35, ease: EASE.exit }, "send+=1.05")
        .fromTo(q("[data-phone]"), { boxShadow: "0 0 0 0 rgba(11,106,153,0)" }, { boxShadow: "0 0 0 8px rgba(11,106,153,0.14)", duration: 0.3, yoyo: true, repeat: 1 }, "send+=1.05")

        .addLabel("phone", "send+=1.2")
        .fromTo(phoneRows.slice(0, 2), { "--tick": 0 }, { "--tick": 1, duration: DUR.quick }, "phone")
        .fromTo(q("[data-toast]"), { autoAlpha: 0, y: -14 }, { autoAlpha: 1, y: 0, duration: 0.45 }, "phone")
        .fromTo(q("[data-phone-bar]"), { scaleX: 0.5 }, { scaleX: 1, duration: 1.6, ease: "steps(2)" }, "phone+=0.5")
        .fromTo(phoneRows.slice(2), { "--tick": 0 }, { "--tick": 1, duration: DUR.quick, stagger: 0.7 }, "phone+=0.8")
        .fromTo(q("[data-phone-done]"), { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.45 }, "phone+=2.3")
        .fromTo(q("[data-phone-check]"), { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.4, ease: EASE.move }, "phone+=2.45")

        .addLabel("back", "phone+=3")
        .to(q("[data-pulse]"), { scale: 1, duration: 0 }, "back")
        .fromTo(q("[data-pulse]"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.15 }, "back")
        .to(q("[data-pulse]"), {
          duration: 1, ease: EASE.move,
          motionPath: { path: thread, align: thread, alignOrigin: [0.5, 0.5], start: 1, end: 0 },
        }, "back")
        .to(q("[data-pulse]"), { autoAlpha: 0, duration: 0.2, ease: EASE.exit }, "back+=0.95")
        .to(q("[data-thread]"), { drawSVG: "100% 100%", duration: 1, ease: EASE.move }, "back")
        .fromTo(laptopRows.slice(2), { "--tick": 0 }, { "--tick": 1, duration: DUR.quick, stagger: 0.08 }, "back+=0.95")
        .to(q("[data-laptop-bar]"), { scaleX: 1, duration: 0.5 }, "back+=0.95")
        .to(q("[data-saved]"), { autoAlpha: 0, duration: DUR.quick, ease: EASE.exit }, "back+=0.9")
        .fromTo(q("[data-laptop-done]"), { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.45 }, "back+=1.05")

        // Exit beat: everything settles back before the loop restarts.
        .to([q("[data-toast]"), q("[data-phone-done]"), q("[data-laptop-done]")], { autoAlpha: 0, duration: 0.4, ease: EASE.exit }, "+=2.2");

      // Don't spend frames on an off-screen hero.
      ScrollTrigger.create({ trigger: root.current, start: "top bottom", end: "bottom top", onToggle: (s) => (s.isActive ? tl.play() : tl.pause()) });

      // Entrance: devices rise in, laptop leads (hero), phone follows.
      gsap.from(q("[data-device]"), { y: 28, autoAlpha: 0, duration: DUR.slow, stagger: 0.18, delay: 0.35 });

      // Ambient: the aura drifts, never repeating in lockstep.
      q("[data-aura]").forEach((el, i) =>
        gsap.to(el, { x: i ? -36 : 30, y: i ? 22 : -26, scale: 1.08, duration: 9 + i * 3, ease: EASE.ambient, repeat: -1, yoyo: true }));
    });

    // Fine pointers only: devices drift a few px against the cursor for depth (counter-motion).
    mm.add(`${FULL} and (pointer: fine)`, () => {
      const laptop = q("[data-laptop]")[0], phone = q("[data-phone]")[0];
      const lx = gsap.quickTo(laptop, "x", { duration: 0.8 }), ly = gsap.quickTo(laptop, "y", { duration: 0.8 });
      const px = gsap.quickTo(phone, "x", { duration: 0.6 }), py = gsap.quickTo(phone, "y", { duration: 0.6 });
      const onMove = (e: PointerEvent) => {
        const r = root.current!.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
        lx(nx * -10); ly(ny * -8); px(nx * 16); py(ny * 12);
      };
      root.current!.addEventListener("pointermove", onMove);
      return () => root.current?.removeEventListener("pointermove", onMove);
    });

    // Reduced motion: a single, finished frame - the story without the movement.
    mm.add(REDUCED, () => {
      gsap.set(q("[data-laptop-bar], [data-phone-bar]"), { scaleX: 1 });
      gsap.set(q("[data-laptop-row], [data-phone-row]"), { "--tick": 1 });
      gsap.set(q("[data-thread]"), { drawSVG: "0% 100%" });
      gsap.set(q("[data-phone-done], [data-laptop-done], [data-toast]"), { autoAlpha: 1 });
    });

    return () => mm.revert();
  }, { scope: root });

  return (
    <div ref={root} aria-hidden className="relative mx-auto aspect-[4/3] w-full max-w-[560px] select-none">
      <div data-aura className="absolute -left-10 top-4 h-64 w-64 rounded-full bg-primary-soft blur-3xl" />
      <div data-aura className="absolute -right-6 bottom-0 h-56 w-56 rounded-full bg-accent-soft blur-3xl opacity-80" />

      {/* Laptop */}
      <div data-device data-laptop className="absolute left-0 top-[4%] w-[74%]">
        <div className="rounded-t-[14px] border border-line-strong bg-surface p-[3.5%] shadow-[0_24px_48px_-24px_rgba(31,39,43,.35)]">
          <div className="mb-3 flex items-center gap-1.5">
            {[0, 1, 2].map((i) => <span key={i} className="h-2 w-2 rounded-full bg-line-strong" />)}
            <span className="ml-auto text-[10px] font-medium uppercase tracking-wider text-ink-subtle">Web</span>
          </div>
          <p className="text-[11px] text-ink-muted">Onboarding</p>
          <p className="font-serif text-[18px] leading-tight text-ink">Set up your profile</p>
          <div className="mt-2.5 h-1.5 rounded-full bg-surface-muted">
            <div data-laptop-bar className="h-full origin-left rounded-full bg-primary" style={{ transform: "scaleX(0.05)" }} />
          </div>
          <ul className="mt-3 space-y-1.5">
            {STEPS.map((s) => <Row key={s} label={s} data="data-laptop-row" />)}
          </ul>
          <div className="relative mt-3 h-6 text-[11px]">
            <span data-saving className="invisible absolute left-0 top-0 inline-flex items-center gap-1.5 text-ink-subtle">
              <span className="h-2.5 w-2.5 animate-spin rounded-full border border-current border-r-transparent" />Saving…
            </span>
            <span data-saved className="invisible absolute left-0 top-0 rounded-full bg-success-soft px-2 py-0.5 font-semibold text-success">
              Saved · continue on any device
            </span>
            <span data-laptop-done className="invisible absolute left-0 top-0 rounded-full bg-primary px-2 py-0.5 font-semibold text-white dark:text-canvas">
              All set - completed on iPhone
            </span>
          </div>
        </div>
        <div className="mx-auto h-2.5 w-[112%] -translate-x-[5.4%] rounded-b-[10px] border border-t-0 border-line-strong bg-surface-muted" />
      </div>

      {/* Thread + pulse share the 480x360 coordinate space of the container */}
      <svg viewBox="0 0 480 360" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        <path d={THREAD} fill="none" stroke="var(--c-border-strong)" strokeWidth="1.5" strokeDasharray="2 6" strokeLinecap="round" />
        <path data-thread d={THREAD} fill="none" stroke="var(--c-accent)" strokeWidth="2.25" strokeLinecap="round" style={{ strokeDasharray: "0 1000" }} />
        <g data-pulse style={{ visibility: "hidden" }}>
          <circle r="11" fill="var(--c-accent)" opacity="0.18" />
          <circle r="4.5" fill="var(--c-accent)" />
        </g>
      </svg>

      {/* Phone */}
      <div data-device data-phone className="absolute bottom-0 right-[2%] w-[31%] rounded-[26px] border border-line-strong bg-surface p-[2.6%] shadow-[0_24px_48px_-20px_rgba(31,39,43,.4)]">
        <div className="mx-auto mb-2 h-1.5 w-1/3 rounded-full bg-line-strong" />
        <div className="relative px-1">
          <div data-toast className="invisible mb-2 rounded-lg bg-info-soft px-2 py-1 text-[9px] font-semibold leading-tight text-info">
            Picked up where you left off on the web
          </div>
          <p className="text-[9px] text-ink-muted">Step 3 of 6</p>
          <p className="font-serif text-[13px] leading-tight">Your goals</p>
          <div className="mt-1.5 h-1 rounded-full bg-surface-muted">
            <div data-phone-bar className="h-full origin-left rounded-full bg-primary" style={{ transform: "scaleX(0.5)" }} />
          </div>
          <ul className="mt-2 space-y-1">
            {STEPS.map((s) => <Row key={s} label={s} data="data-phone-row" small />)}
          </ul>
          <div data-phone-done className="invisible mt-2 flex items-center gap-1.5 rounded-lg bg-success-soft px-2 py-1.5 text-[10px] font-semibold text-success">
            <svg width="12" height="12" viewBox="0 0 12 12"><path data-phone-check d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            All set
          </div>
        </div>
      </div>
    </div>
  );
}

/** A step row whose check is driven by the CSS variable --tick (0 → 1), so GSAP animates one number per row. */
function Row({ label, data, small }: { label: string; data: string; small?: boolean }) {
  return (
    <li {...{ [data]: "" }} className={`flex items-center gap-2 ${small ? "text-[9px]" : "text-[11px]"} text-ink-muted`} style={{ "--tick": 0 } as React.CSSProperties}>
      <span className={`relative grid shrink-0 place-items-center rounded-full border border-line-strong ${small ? "h-2.5 w-2.5" : "h-3.5 w-3.5"}`}>
        <span className="absolute inset-[-1px] rounded-full bg-primary" style={{ transform: "scale(var(--tick))", opacity: "var(--tick)" }} />
      </span>
      <span style={{ color: "color-mix(in srgb, var(--c-ink) calc(var(--tick) * 100%), var(--c-ink-muted))" }}>{label}</span>
    </li>
  );
}
