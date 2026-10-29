import { HealthRing } from "@/components/health-ring";
import { GoalJourney } from "@/components/motion/goal-journey";
import { ICONS, IconBadge } from "@/components/icons";
import { RangeBar } from "@/components/visuals";

import { PageIntro, Section } from "../content";

const ROWS = [
  { title: "See where every result sits", body: "Each measurement shows its unit, source and where it falls against an illustrative reference range. Trends are only drawn when results are genuinely comparable.", visual: "range" },
  { title: "Progress you can feel", body: "Your care plan becomes a journey: tick off an action on your phone or laptop and your progress moves forward on both.", visual: "journey" },
  { title: "A calm overview", body: "One ring for how your latest results compare, the next appointment, and what is left to do - nothing more.", visual: "ring" },
] as const;

const EXAMPLES: [string, number, number | null, number | null, string, string][] = [
  ["LDL cholesterol", 3.2, null, 3.0, "above", "mmol/L"], ["HbA1c", 5.5, 4.0, 5.9, "within", "%"], ["Vitamin D", 68, 50, 150, "within", "nmol/L"],
];

function Visual({ kind }: { kind: (typeof ROWS)[number]["visual"] }) {
  if (kind === "journey") return <GoalJourney done={2} total={5} compact />;
  if (kind === "ring") return <div className="py-4"><HealthRing within={9} outside={1} other={0} /></div>;
  return (
    <div className="space-y-5 p-2">
      {EXAMPLES.map(([n, v, lo, hi, st, u]) => (
        <div key={n}>
          <div className="mb-1.5 flex justify-between text-sm"><span className="font-medium">{n}</span><span className="tabular-nums text-ink-muted">{v} {u}</span></div>
          <RangeBar value={v} low={lo} high={hi} status={st} />
        </div>
      ))}
      <p className="text-xs text-ink-subtle">Example values (synthetic).</p>
    </div>
  );
}

const FEATURE_ICONS = [ICONS.pulse, ICONS.doc, ICONS.plan, ICONS.calendar, ICONS.bell, ICONS.link];

export const metadata = { title: "Platform" };

export default function Features() {
  return (
    <>
      <PageIntro eyebrow="Platform" title="One backend, three ways in">
        <p>A responsive website and native iOS and Android apps share one API, one data model and one account.</p>
      </PageIntro>
      <Section eyebrow="In practice" title="Built for clarity, not noise">
        <div className="space-y-8">
          {ROWS.map((r, i) => (
            <div key={r.title} data-reveal className="grid items-center gap-8 rounded-lg border border-line bg-surface p-6 sm:p-8 md:grid-cols-2">
              <div className={i % 2 ? "md:order-2" : ""}>
                <h3 className="font-serif text-2xl">{r.title}</h3>
                <p className="mt-3 text-ink-muted">{r.body}</p>
              </div>
              <div className="rounded-lg bg-canvas p-4"><Visual kind={r.visual} /></div>
            </div>
          ))}
        </div>
      </Section>
      <Section eyebrow="Features" title="What you can do">
        <ul className="grid gap-x-10 gap-y-8 md:grid-cols-2">
          {[
            ["Dashboard", "Upcoming appointments, outstanding tasks, recent reports and plan progress at a glance."],
            ["Biomarker history", "Charts of each measurement over time with units, reference ranges and data sources. Trends are only shown when results are comparable."],
            ["Care plan", "Approved goals, scheduled actions, milestones and progress."],
            ["Appointments", "Request, reschedule or cancel demo bookings, with preparation notes."],
            ["Notifications", "Read and unread states. Lock-screen text never includes health details."],
            ["Smart links", "Links open the matching screen in the app when it's installed, or on the web when it isn't."],
          ].map(([t, d], i) => (
            <li key={t} data-reveal className="flex gap-4 border-t border-line pt-5">
              <IconBadge d={FEATURE_ICONS[i]} size="sm" />
              <div>
                <h3 className="font-semibold">{t}</h3>
                <p className="mt-1.5 text-ink-muted">{d}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>
      <Section eyebrow="Privacy" title="Designed around sensitive data">
        <div data-reveal className="flex max-w-3xl gap-4">
        <IconBadge d={ICONS.shield} tone="success" />
        <p className="text-ink-muted">
          Server-side authorisation on every record, short-lived access tokens, refresh tokens kept out of reach of page
          scripts, audit logging of sensitive actions, and no third-party analytics. This prototype has not been through
          the review a production healthcare service needs, and it doesn&apos;t claim to be compliant with any regulation.
        </p>
        </div>
      </Section>
    </>
  );
}
