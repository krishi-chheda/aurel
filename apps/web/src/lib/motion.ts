"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// Registered once, client only. GSAP never runs during SSR (all usage sits inside useGSAP).
if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP, ScrollTrigger, DrawSVGPlugin, MotionPathPlugin);
  // Brand motion identity ("Premium"): one signature curve, three durations, rise-in entrances, no overshoot.
  gsap.defaults({ ease: "power3.out", duration: 0.6 });
}

export const DUR = { quick: 0.2, standard: 0.6, slow: 1.1 } as const;
export const EASE = { enter: "power3.out", exit: "power2.in", move: "power2.inOut", ambient: "sine.inOut" } as const;

/** Users who ask for less motion get the final state instantly. */
export const REDUCED = "(prefers-reduced-motion: reduce)";
export const FULL = "(prefers-reduced-motion: no-preference)";

/** Resolved value of a design-token colour (GSAP interpolates real colours, not var() strings). */
export const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(`--c-${name}`).trim();

export { gsap, MotionPathPlugin, ScrollTrigger, useGSAP };
