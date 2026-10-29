"use client";

import { APP_SCHEME, DEMO_BANNER } from "@aurel/shared";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { pop, useGlide } from "@/components/motion/primitives";
import { Logo } from "@/components/site-chrome";
import { PageSkeleton, SessionOffline, cx } from "@/components/ui";
import { api, useSession } from "@/lib/session";
import { useGSAP } from "@/lib/motion";

const NAV = [
  { href: "/dashboard", label: "Home", icon: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { href: "/health", label: "My Health", icon: "M3 12h4l3-7 4 14 3-7h4" },
  { href: "/care-plan", label: "My Plan", icon: "M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" },
  { href: "/appointments", label: "Appointments", icon: "M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" },
  { href: "/reports", label: "Reports", icon: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5" },
  { href: "/support", label: "Support", icon: "M12 21a9 9 0 1 0-9-9c0 1.6.4 3 1.1 4.3L3 21l4.7-1.1A9 9 0 0 0 12 21z" },
  { href: "/profile", label: "Profile", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" },
];
// Phones get the five most-used destinations in a bottom bar; the rest live in the header menu.
const TABS = ["/dashboard", "/health", "/care-plan", "/appointments", "/profile"];

function Icon({ d }: { d: string }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}

const noSubscribe = () => () => {};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status, user, logout, retry } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  // Server render and hydration assume desktop; the client snapshot then reads the user agent.
  const isPhone = useSyncExternalStore(noSubscribe, () => /iPhone|iPad|Android/i.test(navigator.userAgent), () => false);

  useEffect(() => {
    if (status === "anon" || status === "expired") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}${status === "expired" ? "&expired=1" : ""}`);
    }
  }, [status, pathname, router]);

  // Customer pages are for customers; staff work from the operations dashboard (the API enforces this too).
  useEffect(() => {
    if (status === "authed" && user && user.role !== "customer") router.replace("/admin");
  }, [status, user, router]);

  useEffect(() => {
    if (status !== "authed") return;
    api.notifications(1).then((n) => setUnread(n.unread)).catch(() => {});
  }, [status, pathname]);

  // The active-page highlight glides between items instead of jumping.
  const sideNav = useRef<HTMLElement>(null);
  const tabNav = useRef<HTMLElement>(null);
  const glideKey = `${pathname}|${status}`;
  useGlide(sideNav, glideKey, "y");
  useGlide(tabNav, glideKey, "x");
  const badge = useRef<HTMLSpanElement>(null);
  useGSAP(() => { if (unread > 0) pop(badge.current, 1.4); }, { dependencies: [unread] });

  if (status === "offline") return <SessionOffline onRetry={retry} />;
  if (status !== "authed" || !user || user.role !== "customer") return <main id="main" className="mx-auto w-full max-w-5xl p-6"><PageSkeleton /></main>;

  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="hidden w-64 shrink-0 border-r border-line bg-surface lg:flex lg:flex-col">
        <div className="px-6 py-6"><Link href="/dashboard" aria-label="Aurel home"><Logo /></Link></div>
        <nav ref={sideNav} aria-label="Primary" className="relative mx-3 flex-1">
          <span data-glide aria-hidden className="invisible absolute left-0 top-0 rounded-md bg-primary-soft" />
          <ul className="relative space-y-0.5">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} aria-current={active(n.href) ? "page" : undefined}
                  className={cx("flex items-center gap-3 rounded-md px-3 py-2.5 text-[15px] transition-colors",
                    active(n.href) ? "font-medium text-primary" : "text-ink-muted hover:bg-surface-muted/60 hover:text-ink")}>
                  <Icon d={n.icon} />{n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="m-4 rounded-md bg-surface-muted p-3 text-xs text-ink-muted">{DEMO_BANNER}</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line bg-canvas/90 px-4 backdrop-blur sm:px-6 lg:px-10">
          <Link href="/dashboard" className="lg:hidden" aria-label="Aurel home"><Logo /></Link>
          <span className="hidden text-sm text-ink-subtle lg:block">Synthetic demo data</span>
          <div className="flex items-center gap-1">
            <Link href="/notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
              className="relative grid h-11 w-11 place-items-center rounded-md text-ink-muted hover:bg-surface-muted">
              <Icon d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
              {unread > 0 && <span ref={badge} className="absolute right-1.5 top-1.5 min-w-5 rounded-full bg-accent px-1 text-center text-[11px] font-semibold leading-5 text-white">{unread}</span>}
            </Link>
            <Link href="/support" className="grid h-11 w-11 place-items-center rounded-md text-ink-muted hover:bg-surface-muted lg:hidden" aria-label="Support">
              <Icon d={NAV[5].icon} />
            </Link>
            <button onClick={logout} className="rounded-md px-3 py-2 text-sm text-ink-muted hover:bg-surface-muted min-h-11">Sign out</button>
          </div>
        </header>

        {isPhone && (
          // Smart-link fallback: on a phone browser, offer the same screen in the app via the custom scheme.
          <a href={`${APP_SCHEME}://${pathname.replace(/^\//, "")}`} className="flex items-center justify-between gap-3 border-b border-line bg-primary-soft px-4 py-2.5 text-sm text-primary">
            <span>Open this screen in the Aurel app</span><span aria-hidden>→</span>
          </a>
        )}

        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-8 sm:px-6 lg:px-10 lg:pb-16">{children}</main>

        <nav ref={tabNav} aria-label="Primary" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
          <span data-glide aria-hidden className="invisible absolute -top-px left-0 h-[2px] rounded-full bg-primary" />
          <ul className="grid grid-cols-5">
            {NAV.filter((n) => TABS.includes(n.href)).map((n) => (
              <li key={n.href}>
                <Link href={n.href} aria-current={active(n.href) ? "page" : undefined}
                  className={cx("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]", active(n.href) ? "text-primary font-semibold" : "text-ink-muted")}>
                  <Icon d={n.icon} />{n.label.replace("My ", "")}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
