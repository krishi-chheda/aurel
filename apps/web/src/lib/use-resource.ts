"use client";

import { ApiError, syncStateFor, type SyncState } from "@aurel/shared";
import { useCallback, useEffect, useRef, useState } from "react";

const POLL_MS = 60_000;

/**
 * Server is the source of truth. Data refetches when the tab regains focus, when the network comes back,
 * and once a minute while visible. This is periodic refresh, not real-time push.
 */
export function useResource<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [state, setState] = useState<SyncState>("syncing");
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });

  const reload = useCallback(async () => {
    setState("syncing");
    try {
      const d = await loadRef.current();
      setData(d);
      setError(null);
      setState("idle");
      setSyncedAt(new Date());
    } catch (e) {
      setError(e as Error);
      setState(syncStateFor(e)); // stale data stays on screen; the banner explains and offers retry
    }
  }, []);

  useEffect(() => {
    // Fetching on mount and on deps change is this hook's purpose; the "syncing" state it sets first is intended.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
    const onFocus = () => document.visibilityState === "visible" && reload();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", reload);
    document.addEventListener("visibilitychange", onFocus);
    const t = setInterval(() => document.visibilityState === "visible" && reload(), POLL_MS);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", reload);
      document.removeEventListener("visibilitychange", onFocus);
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, state, syncedAt, reload, setData, loading: data === undefined && !error };
}
