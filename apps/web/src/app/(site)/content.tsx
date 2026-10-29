import { HeroIntro, RevealGroup } from "@/components/motion/primitives";

/** Marketing section. Its heading and any descendant marked data-reveal rise in as they scroll into view. */
export function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <RevealGroup className="mx-auto mt-20 max-w-6xl px-4 sm:px-6">
      <section>
        <p data-reveal className="text-sm font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</p>
        <h2 data-reveal className="mt-3 max-w-2xl font-serif text-3xl leading-tight sm:text-[38px]">{title}</h2>
        <div className="mt-10">{children}</div>
      </section>
    </RevealGroup>
  );
}

/** Page header for marketing pages - same masked-line entrance as the homepage hero. */
export function PageIntro({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <HeroIntro className="mx-auto max-w-6xl px-4 pt-16 sm:px-6">
      <p data-rise className="hero-pre text-sm font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</p>
      <h1 className="mt-3 max-w-3xl font-serif text-[38px] leading-tight sm:text-[46px]">
        <span className="block overflow-hidden pb-[0.1em]"><span data-line className="hero-pre block">{title}</span></span>
      </h1>
      {children && <div data-rise className="hero-pre mt-5 max-w-2xl text-lg text-ink-muted">{children}</div>}
    </HeroIntro>
  );
}
