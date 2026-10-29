import Link from "next/link";

import { GoalJourney } from "@/components/motion/goal-journey";
import { ICONS, IconBadge } from "@/components/icons";

import { PageIntro, Section } from "../content";

const SERVICE_ICONS = [ICONS.flask, ICONS.chat, ICONS.plan, ICONS.heart, ICONS.pulse, ICONS.spark];

export const metadata = { title: "Services" };

const SERVICES = [
  ["Health assessment", "A broad blood panel covering heart, metabolic, kidney, thyroid and nutrient markers (synthetic in this demo)."],
  ["Results review", "A consultation to talk through results with a doctor. Demo bookings never reach a real clinic."],
  ["Care plan", "Goals and actions approved by a clinician, broken into weekly steps you can track."],
  ["Health coaching", "Optional sessions to help build habits that support your plan."],
  ["Follow-up testing", "Repeat assessments so you can see changes over time."],
  ["Support", "A help assistant for finding your way around the app. It does not give medical advice."],
];

export default function Services() {
  return (
    <>
      <PageIntro eyebrow="Services" title="What's included">
        <p>The services below are illustrative. This prototype simulates them with fictional providers and synthetic data.</p>
      </PageIntro>
      <Section eyebrow="Overview" title="Six parts of one programme">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map(([t, d], i) => (
            <article key={t} data-reveal className="group rounded-lg border border-line bg-surface p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_18px_40px_-26px_rgba(31,39,43,.4)]">
              <div className="flex items-center justify-between">
                <IconBadge d={SERVICE_ICONS[i]} tone={i % 2 ? "accent" : "primary"} />
                <span className="font-serif text-2xl text-ink-subtle">{String(i + 1).padStart(2, "0")}</span>
              </div>
              <h3 className="mt-5 text-[17px] font-semibold">{t}</h3>
              <p className="mt-2 text-ink-muted">{d}</p>
            </article>
          ))}
        </div>
      </Section>
      <Section eyebrow="Your plan" title="Every completed action moves you forward">
        <div data-reveal className="grid items-center gap-8 rounded-lg border border-line bg-surface p-6 sm:p-8 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <p className="text-lg text-ink-muted">
              Your care plan turns goals into small weekly actions. Tick them off on any device and watch your progress walk
              towards the finish line.
            </p>
            <Link href="/register" className="mt-6 inline-flex min-h-11 items-center rounded-md bg-primary px-5 font-medium text-white hover:bg-primary-hover dark:text-canvas">Start your plan</Link>
          </div>
          <GoalJourney done={3} total={5} compact />
        </div>
      </Section>
    </>
  );
}
