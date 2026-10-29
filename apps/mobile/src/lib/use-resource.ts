import { syncStateFor, type ApiError, type SyncState } from "@aurel/shared";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

/**
 * Server is the source of truth. Refetches when the screen gains focus, when the app returns to the foreground,
 * and on pull-to-refresh. Periodic refresh, not real-time push.
 */
export function useResource<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [state, setState] = useState<SyncState>("syncing");
  const [refreshing, setRefreshing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });

  const reload = useCallback(async () => {
    setState("syncing");
    try {
      setData(await loadRef.current());
      setError(null);
      setState("idle");
      setSyncedAt(new Date());
    } catch (e) {
      setError(e as Error);
      setState(syncStateFor(e)); // stale data stays visible with an explanation
    }
  }, []);

  // Refetch on focus, and again whenever the caller's deps change (compared by value).
  const depKey = JSON.stringify(deps);
  // depKey is a deliberate extra dependency: it re-creates the callback so the focus effect re-runs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { reload(); }, [reload, depKey]));

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => s === "active" && reload());
    return () => sub.remove();
  }, [reload]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  return { data, setData, error, state, syncedAt, reload, refreshing, onRefresh };
}
