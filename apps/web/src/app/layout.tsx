import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";

import { BRAND, colors, darkColors } from "@aurel/shared";
import { SessionProvider } from "@/lib/session";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], axes: ["opsz"] });

export const metadata: Metadata = {
  title: { default: `${BRAND.name} - ${BRAND.tagline}`, template: `%s · ${BRAND.name}` },
  description: "A demonstration preventive-health platform. All health data shown is synthetic.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: colors.canvas },
    { media: "(prefers-color-scheme: dark)", color: darkColors.canvas },
  ],
};

const kebab = (k: string) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
const vars = (c: Record<string, string>) => Object.entries(c).map(([k, v]) => `--c-${kebab(k)}:${v}`).join(";");
const tokenCss = `:root{${vars(colors)}}@media (prefers-color-scheme: dark){:root{${vars(darkColors)}}}`;

// Fail-safe for the pre-paint hiding: if the entrance hasn't *completed* within 4s (JS failed, or a background tab
// paused animation frames), un-hide the hero/auth content outright, including GSAP's inline start state. (AUD-15)
const motionGate = `(function(d){d.classList.add("js");setTimeout(function(){if(d.dataset.motion==="done")return;d.classList.remove("js");d.querySelectorAll(".hero-pre").forEach(function(e){e.style.visibility="visible";e.style.opacity="1";e.style.transform="none"})},4000)})(document.documentElement)`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={`${inter.variable} ${fraunces.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: tokenCss }} />
        {/* Hero copy is hidden pre-paint only when JS runs, and shown anyway if motion hasn't started within 3s. */}
        <script dangerouslySetInnerHTML={{ __html: motionGate }} />
      </head>
      <body className="min-h-full flex flex-col font-sans text-[16px] leading-relaxed">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-surface focus:px-4 focus:py-2 focus:rounded-md focus:shadow">
          Skip to content
        </a>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
