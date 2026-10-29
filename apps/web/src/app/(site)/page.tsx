import Link from "next/link";

import { HeroContinuity } from "@/components/motion/hero-continuity";
import { HeroIntro, Magnetic, RevealGroup, ScrollSteps } from "@/components/motion/primitives";

import { Section } from "./content";

export default function Home() {
  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-14 overflow-x-clip px-4 pt-14 pb-20 sm:px-6 md:grid-cols-[1.05fr_1fr] md:pt-24">
        <HeroIntro>
          <p data-rise className="hero-pre text-sm font-semibold uppercase tracking-[0.14em] text-accent">Preventive health, continuously</p>
          <h1 className="mt-4 font-serif text-[40px] leading-[1.08] text-ink sm:text-[56px]">
            <span className="block overflow-hidden pb-[0.08em]"><span data-line className="hero-pre block">One health profile.</span></span>
            <span className="block overflow-hidden pb-[0.14em]">
              <span data-line className="hero-pre block">
                <span className="relative inline-block">
                  Every device
                  <svg aria-hidden viewBox="0 0 300 16" preserveAspectRatio="none" className="absolute -bottom-[0.12em] left-0 h-[0.28em] w-full overflow-visible">
                    <path data-underline d="M3 11 C 70 3, 150 4, 297 9" fill="none" stroke="var(--c-accent)" strokeWidth="4" strokeLinecap="round" />
                  </svg>
                </span>{" "}
                you use.
              </span>
            </span>
          </h1>
          <p data-rise className="hero-pre mt-6 max-w-xl text-lg text-ink-muted">
            Aurel brings your assessments, results, care plan and appointments into one calm place. Start on your laptop,
            pick up on your phone, and never lose your place.
          </p>
          <div data-rise className="hero-pre mt-8 flex flex-wrap gap-3">
            <Magnetic>
              <Link href="/register" className="inline-flex min-h-12 items-center rounded-md bg-primary px-6 font-medium text-white hover:bg-primary-hover dark:text-canvas">
                Create your account
              </Link>
            </Magnetic>
            <Link href="/how-it-works" className="inline-flex min-h-12 items-center rounded-md border border-line-strong bg-surface px-6 font-medium text-ink hover:bg-surface-muted">
              See how it works
            </Link>
          </div>
          <p data-rise className="hero-pre mt-5 text-sm text-ink-subtle">Demonstration only. All health information inside is synthetic.</p>
        </HeroIntro>
        <HeroContinuity />
      </section>

      <Section eyebrow="How it works" title="A clear path from first sign-up to an ongoing plan">
        <ScrollSteps items={[
          ["Tell us about you", "A short onboarding that saves after every step, so you can finish it on any device."],
          ["Get assessed", "Book a (demo) blood collection and review with a doctor. Results appear in your profile."],
          ["Follow your plan", "Clinician-approved goals and actions you can tick off on the web or in the app."],
          ["Track over time", "See how measurements change between assessments, with honest notes when they can't be compared."],
        ]} />
      </Section>

      <Section eyebrow="Continuity" title="Built so you never start over">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["Resume anywhere", "Onboarding, check-ins and tasks sync through one account. Close the browser, open the app, carry on."],
            ["Links that land", "Reminders link straight to the right screen - in the app if you have it, on the web if you don't."],
            ["Clear sync states", "Saving, saved, offline, or changed on another device: you always know where your data stands."],
          ].map(([t, d]) => (
            <div key={t} data-reveal className="rounded-lg border border-line bg-surface p-6 transition-shadow duration-300 hover:shadow-[0_18px_40px_-24px_rgba(31,39,43,.35)]">
              <h3 className="text-[17px] font-semibold">{t}</h3>
              <p className="mt-2 text-ink-muted">{d}</p>
            </div>
          ))}
        </div>
      </Section>

      <RevealGroup className="mx-auto mt-24 max-w-6xl px-4 sm:px-6">
        <div data-reveal className="relative overflow-hidden rounded-lg bg-primary px-6 py-12 text-center text-white sm:px-12 dark:text-canvas">
          <h2 className="font-serif text-3xl">Explore the demo</h2>
          <p className="mx-auto mt-3 max-w-xl opacity-90">Create an account to explore a fully working prototype populated with synthetic data.</p>
          <div className="mt-6">
            <Magnetic>
              <Link href="/register" className="inline-flex min-h-12 items-center rounded-md bg-surface px-6 font-medium text-primary hover:bg-surface-muted">
                Get started
              </Link>
            </Magnetic>
          </div>
        </div>
      </RevealGroup>
    </>
  );
}
