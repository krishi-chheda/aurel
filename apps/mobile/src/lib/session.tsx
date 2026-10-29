import { createApi, resolveLink, type Platform as ApiPlatform, type TokenResponse, type User } from "@aurel/shared";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";

// Dev default: the API on the same machine as the Expo dev server. Override with EXPO_PUBLIC_API_URL
// (it's a public URL, not a secret). The API must listen on 0.0.0.0 for a physical device to reach it.
function apiUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  if (host) return `http://${host}:8000`;
  return Platform.OS === "android" ? "http://10.0.2.2:8000" : "http://localhost:8000";
}

// Refresh token: device keychain/keystore via SecureStore, readable only while the device is unlocked
// and never backed up to another device. Access token: memory only.
const REFRESH_KEY = "aurel.refresh";
const secureOpts = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
// Expo web (dev smoke-testing only): SecureStore is unavailable, so the refresh token stays in memory.
const isWeb = Platform.OS === "web";
let webRefresh: string | null = null;
let access: string | null = null;
let currentUser: User | null = null;
let onExpired: () => void = () => {};

export const API_URL = apiUrl();
export const api = createApi({
  baseUrl: API_URL,
  platform: (Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web") as ApiPlatform,
  store: {
    getAccess: () => access,
    getRefresh: async () => (isWeb ? webRefresh : SecureStore.getItemAsync(REFRESH_KEY, secureOpts)),
    async save(t: TokenResponse | null) {
      access = t?.access_token ?? null;
      currentUser = t?.user ?? null;
      if (isWeb) {
        webRefresh = t?.refresh_token ?? null;
        return;
      }
      if (t?.refresh_token) await SecureStore.setItemAsync(REFRESH_KEY, t.refresh_token, secureOpts);
      else if (!t) await SecureStore.deleteItemAsync(REFRESH_KEY, secureOpts);
    },
  },
  onSessionExpired: () => onExpired(),
});

// A deep link that arrived while signed out; opened after sign-in.
let pendingLink: string | null = null;
export function setPendingLink(path: string) {
  pendingLink = resolveLink(path)?.path ?? null;
}
export function takePendingLink(): string | null {
  const p = pendingLink;
  pendingLink = null;
  return p;
}

// "offline": the session couldn't be checked (no network / server down) - not the same as signed out. (AUD-12)
type Status = "loading" | "authed" | "anon" | "offline";
interface SessionValue {
  status: Status;
  user: User | null;
  expired: boolean;
  retry: () => void;
  setAuthed: (u: User) => void;
  logout: () => Promise<void>;
}
const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [expired, setExpired] = useState(false);
  const statusRef = useRef(status);
  useEffect(() => { statusRef.current = status; });

  const restore = useCallback(() => {
    api.refresh().then((r) => {
      if (r === "unavailable") return setStatus((s) => (s === "authed" || s === "anon" ? s : "offline"));
      setUser(r === "ok" ? currentUser : null);
      setStatus((s) => (r === "ok" ? "authed" : s === "authed" || s === "loading" || s === "offline" ? "anon" : s));
    });
  }, []);

  useEffect(() => {
    onExpired = () => {
      setUser(null);
      setExpired(true);
      setStatus("anon");
    };
    restore();
    // Coming back to the app after an offline start: try again.
    const sub = AppState.addEventListener("change", (s) => s === "active" && statusRef.current === "offline" && restore());
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setAuthed = useCallback((u: User) => {
    setUser(u);
    setExpired(false);
    setStatus("authed");
  }, []);
  const logout = useCallback(async () => {
    try { await api.auth.logout(); } catch { /* tokens are cleared regardless */ }
    pendingLink = null;
    setUser(null);
    setStatus("anon");
  }, []);

  const value = useMemo(() => ({ status, user, expired, retry: restore, setAuthed, logout }), [status, user, expired, restore, setAuthed, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
}
