import { NextResponse, type NextRequest } from "next/server";

// The /api rewrite forwards request headers to the API as-is, including a browser-supplied X-Forwarded-For, which the
// API would otherwise use as the client address for rate limiting (AUD-09). Strip client-controlled forwarding
// headers here. Only when an edge proxy in front of this server OVERWRITES X-Forwarded-For with the real client
// address (set TRUST_EDGE_XFF=true) is the header passed through - and the API must list this server in
// TRUSTED_PROXIES to believe it.
const FORWARDING = ["x-forwarded-for", "x-real-ip", "forwarded", "true-client-ip", "cf-connecting-ip"];

export function proxy(request: NextRequest) {
  if (process.env.TRUST_EDGE_XFF === "true") return NextResponse.next();
  const headers = new Headers(request.headers);
  for (const h of FORWARDING) headers.delete(h);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: "/api/:path*" };
