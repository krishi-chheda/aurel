"use client";

import { createApi, type TokenResponse, type User } from "@aurel/shared";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

// Access token lives only in memory; the refresh token is an httpOnly cookie the page can't read.
let accessToken: string | null = null;
let onExpired: () => void = () => {};

export const api = createApi({
  baseUrl: "/api",
  platform: "web",
  store: {
    getAccess: () => accessToken,
    getRefresh: async () => null,
    async save(t: TokenResponse | null) {
      accessToken = t?.access_token ?? null;
      if (t) currentUser = t.user;
    },
  },
  onSessionExpired: () => onExpired(),
});
let currentUser: User | null = null;

// "offline": the session couldn't be checked (no network / server down) - not the same as signed out. (AUD-12)
type Status = "loading" | "authed" | "anon" | "expired" | "offline";
interface SessionValue {
  status: Status;
  user: User | null;
  retry: () => void;
  setAuthed: (u: User) => void;
  logout: () => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);
  const statusRef = useRef(status);
  useEffect(() => { statusRef.current = status; });

  // Restore the session from the refresh cookie (works after closing the tab or coming from another device).
  const restore = useCallback(() => {
    api.refresh().then((r) => {
      if (r === "unavailable") return setStatus((s) => (s === "authed" ? s : "offline"));
      setUser(r === "ok" ? currentUser : null);
      setStatus(r === "ok" ? "authed" : "anon");
    });
  }, []);

  useEffect(() => {
    onExpired = () => {
      setUser(null);
      setStatus("expired");
    };
    restore();
    // Back online after an "offline" start: try again automatically.
    const onOnline = () => statusRef.current === "offline" && restore();
    addEventListener("online", onOnline);
    return () => removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setAuthed = useCallback((u: User) => {
    setUser(u);
    setStatus("authed");
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      /* already signed out server-side or offline; local state is cleared either way */
    }
    currentUser = null;
    setUser(null);
    setStatus("anon");
  }, []);

  const value = useMemo(() => ({ status, user, retry: restore, setAuthed, logout }), [status, user, restore, setAuthed, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
}
