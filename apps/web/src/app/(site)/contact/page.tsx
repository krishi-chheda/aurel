import { RevealGroup } from "@/components/motion/primitives";

import { PageIntro } from "../content";
import { ContactForm, OwnerCard } from "./form";

export const metadata = { title: "Contact" };

export default function Contact() {
  return (
    <>
      <PageIntro eyebrow="Contact" title="Let's talk">
        <p>Questions about Aurel, feedback on how it was built, or an opportunity - I&apos;d love to hear from you.</p>
      </PageIntro>
      <RevealGroup className="mx-auto mt-12 grid max-w-6xl gap-6 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
        <div data-reveal><OwnerCard /></div>
        <div data-reveal><ContactForm /></div>
        <p data-reveal className="text-sm text-ink-subtle lg:col-span-2">
          Aurel is a demonstration product, not a health service. For medical questions, speak with your GP; in an emergency call 000.
        </p>
      </RevealGroup>
    </>
  );
}
