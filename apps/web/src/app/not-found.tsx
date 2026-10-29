import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="font-serif text-5xl text-primary">404</p>
      <h1 className="mt-4 text-xl font-semibold">We couldn&apos;t find that page</h1>
      <p className="mt-2 text-ink-muted">The link may be out of date, or the page may have moved.</p>
      <Link href="/dashboard" className="mt-6 text-primary underline">Go to your dashboard</Link>
    </main>
  );
}
