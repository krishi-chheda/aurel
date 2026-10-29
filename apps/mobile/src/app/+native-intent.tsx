import { resolveLink } from "@aurel/shared";

import { setPendingLink } from "@/lib/session";

/**
 * Every incoming link (aurel://..., https://aurel.example/..., notification taps) passes through here.
 * Only routes in the shared route table are allowed; anything else lands on the dashboard.
 * The target is remembered so a signed-out user reaches it right after signing in.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const target = resolveLink(path) ?? resolveLink(`/${path.replace(/^\/+/, "")}`);
    if (!target) return "/";
    setPendingLink(target.path);
    return target.path;
  } catch {
    return "/";
  }
}
