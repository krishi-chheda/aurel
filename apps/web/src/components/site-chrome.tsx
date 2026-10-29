import { BRAND, DEMO_BANNER } from "@aurel/shared";
import Link from "next/link";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-serif text-[22px] tracking-tight text-ink ${className}`}>
      <svg data-logo width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary" />
        <path d="M5 14.5c2.5-.2 3.6-5 7-5s4.5 4.8 7 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="text-accent" />
      </svg>
      {BRAND.name}
    </span>
  );
}

export function DemoStrip() {
  return <p className="bg-ink px-4 py-2 text-center text-xs text-canvas">{DEMO_BANNER}</p>;
}

const NAV = [
  ["/how-it-works", "How it works"],
  ["/services", "Services"],
  ["/features", "Platform"],
  ["/faq", "FAQ"],
  ["/contact", "Contact"],
] as const;

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-canvas/90 backdrop-blur supports-[backdrop-filter]:bg-canvas/75 sticky top-0 z-30">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label={`${BRAND.name} home`}><Logo /></Link>
        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex gap-7 text-[15px] text-ink-muted">
            {NAV.map(([h, l]) => <li key={h}><Link className="hover:text-ink" href={h}>{l}</Link></li>)}
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="rounded-md px-3 py-2 text-[15px] font-medium text-ink hover:bg-surface-muted">Sign in</Link>
          <Link href="/register" className="hidden rounded-md bg-primary px-4 py-2 text-[15px] font-medium text-white hover:bg-primary-hover sm:inline-flex dark:text-canvas">Get started</Link>
        </div>
      </div>
      <nav aria-label="Main (mobile)" className="md:hidden border-t border-line overflow-x-auto">
        <ul className="flex gap-5 px-4 py-2.5 text-sm text-ink-muted whitespace-nowrap">
          {NAV.map(([h, l]) => <li key={h}><Link href={h}>{l}</Link></li>)}
        </ul>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[2fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-ink-muted">
            {BRAND.name} is a fictional product built to demonstrate a cross-platform preventive-health experience.
            It is not a medical service and provides no medical advice.
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold">Product</p>
          <ul className="mt-3 space-y-2 text-sm text-ink-muted">
            {NAV.slice(0, 3).map(([h, l]) => <li key={h}><Link href={h} className="hover:text-ink">{l}</Link></li>)}
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold">Help</p>
          <ul className="mt-3 space-y-2 text-sm text-ink-muted">
            {NAV.slice(3).map(([h, l]) => <li key={h}><Link href={h} className="hover:text-ink">{l}</Link></li>)}
          </ul>
        </div>
      </div>
      <p className="border-t border-line px-4 py-5 text-center text-xs text-ink-subtle">
        © {new Date().getFullYear()} {BRAND.name} (demonstration). In an emergency call 000.
      </p>
    </footer>
  );
}
