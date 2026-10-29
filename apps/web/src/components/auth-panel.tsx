"use client";

import { BRAND, colors } from "@aurel/shared";
import { usePathname } from "next/navigation";

import { HeroContinuity } from "@/components/motion/hero-continuity";

const COPY: Record<string, [string, string]> = {
  "/login": ["Pick up right where you left off.", "Your plan, results and appointments - waiting on every device you use."],
  "/register": ["One account. Every device.", "Start on the web, finish on your phone. Nothing you enter is ever lost between them."],
  "/forgot-password": ["Locked out? It happens.", "We'll send a link to reset your password. Your data stays exactly as you left it."],
  "/reset-password": ["Choose a new password.", "For your security, you'll be signed out on every device once it's changed."],
};
const POINTS = ["Saves after every step", "Same account on the web and the app", "Demonstration only - all health data is synthetic"];

/** Brand side of the sign-in screens: always deep evergreen (both themes), with the continuity scene. */
export function AuthPanel() {
  const path = usePathname();
  const [title, sub] = COPY[path] ?? COPY["/login"];
  return (
    <aside className="relative hidden overflow-hidden px-12 py-12 text-white lg:flex lg:flex-col" style={{ background: colors.primary }}>
      <div aria-hidden className="pointer-events-none absolute -left-24 top-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-20 right-0 h-72 w-72 rounded-full blur-3xl" style={{ background: "rgba(63,182,224,0.35)" }} />
      <p className="relative font-serif text-[22px]">{BRAND.name}</p>
      <div data-rise className="hero-pre relative mt-14 max-w-md">
        <h2 className="font-serif text-[38px] leading-[1.1]">{title}</h2>
        <p className="mt-4 text-[17px] text-white/80">{sub}</p>
      </div>
      <div className="relative mt-10 -mx-4 max-w-[520px]">
        <HeroContinuity />
      </div>
      <ul className="relative mt-auto space-y-3 pt-10 text-sm text-white/85">
        {POINTS.map((p) => (
          <li key={p} data-rise className="hero-pre flex items-center gap-3">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-white/15">
              <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden><path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </span>
            {p}
          </li>
        ))}
      </ul>
    </aside>
  );
}
