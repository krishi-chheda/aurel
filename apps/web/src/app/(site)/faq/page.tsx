import Link from "next/link";

import { DetailsReveal, RevealGroup } from "@/components/motion/primitives";
import { ICONS, IconBadge } from "@/components/icons";

import { PageIntro } from "../content";

export const metadata = { title: "FAQ" };

const FAQ = [
  ["Is this a real health service?", "No. Aurel is a fictional demonstration product. Clinicians, providers, appointments and health data are all synthetic."],
  ["Can I start on my laptop and finish on my phone?", "Yes. Onboarding progress is saved on the server after every step. Sign in to the app with the same account and you'll resume where you left off."],
  ["What happens if I edit something on two devices?", "Each save is checked against the latest version. If the other device changed it first, you'll be shown the latest version and can choose to apply your change again."],
  ["How quickly do changes appear on my other device?", "When you open or return to the app or browser tab, and about once a minute while it's open. Updates aren't instant push."],
  ["Does the assistant give medical advice?", "No. It helps you find your way around the app and gives a few pre-written general explanations. It never diagnoses or suggests treatment changes."],
  ["Will notifications show my results on my lock screen?", "No. Push text is always generic, for example \"You have a new update in Aurel.\""],
  ["How do I delete my account?", "Go to Profile, then Deactivate account. This ends all your sessions immediately."],
];

export default function Faq() {
  return (
    <>
      <PageIntro eyebrow="FAQ" title="Frequently asked questions" />
      <RevealGroup className="mx-auto mt-10 grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_320px] lg:items-start">
        <DetailsReveal className="space-y-3">
          {FAQ.map(([q, a]) => (
            <details key={q} data-reveal className="group rounded-lg border border-line bg-surface px-5 py-4 transition-colors open:border-primary/40">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-medium">
                {q}
                <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-muted text-ink-muted transition-transform duration-300 group-open:rotate-45 group-open:bg-primary-soft group-open:text-primary">+</span>
              </summary>
              <p className="mt-3 text-ink-muted">{a}</p>
            </details>
          ))}
        </DetailsReveal>
        <aside data-reveal className="relative overflow-hidden rounded-lg border border-line bg-surface p-6 lg:sticky lg:top-24">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary-soft blur-3xl" />
          <div className="relative">
            <IconBadge d={ICONS.chat} tone="accent" />
            <p className="mt-4 font-serif text-2xl">Still have a question?</p>
            <p className="mt-2 text-ink-muted">Get in touch about Aurel, how it was built, or anything else.</p>
            <Link href="/contact" className="mt-5 inline-flex min-h-11 items-center rounded-md bg-primary px-5 font-medium text-white hover:bg-primary-hover dark:text-canvas">Contact</Link>
          </div>
        </aside>
      </RevealGroup>
    </>
  );
}
