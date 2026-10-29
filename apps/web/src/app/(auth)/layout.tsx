import Link from "next/link";
import { Suspense } from "react";

import { AuthPanel } from "@/components/auth-panel";
import { AuthStage } from "@/components/motion/primitives";
import { DemoStrip, Logo } from "@/components/site-chrome";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DemoStrip />
      <AuthStage className="grid flex-1 lg:grid-cols-[1.05fr_1fr]">
        <AuthPanel />
        <main id="main" className="relative flex flex-col items-center justify-center overflow-hidden px-4 py-12 sm:py-16">
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary-soft blur-3xl" />
          <Link href="/" className="relative mb-10 lg:hidden" aria-label="Aurel home"><Logo /></Link>
          <div data-rise className="hero-pre relative w-full max-w-md rounded-lg border border-line bg-surface p-6 shadow-[0_24px_48px_-32px_rgba(31,39,43,.35)] sm:p-8">
            <Suspense fallback={null}>{children}</Suspense>
          </div>
          <p data-rise className="hero-pre relative mt-6 text-center text-xs text-ink-subtle">
            Protected with short-lived sessions. <Link href="/features" className="underline underline-offset-2 hover:text-ink">How we handle data</Link>
          </p>
        </main>
      </AuthStage>
    </>
  );
}
