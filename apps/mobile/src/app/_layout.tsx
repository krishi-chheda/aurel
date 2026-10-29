import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { useColorScheme } from "react-native";

import { Button, Screen, Text } from "@/components/ui";
import { SessionProvider, useSession } from "@/lib/session";
import { usePalette } from "@/lib/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootStack() {
  const { status, retry } = useSession();
  const p = usePalette();
  const scheme = useColorScheme();
  useEffect(() => {
    if (status !== "loading") SplashScreen.hideAsync().catch(() => {});
  }, [status]);
  if (status === "loading") return null;
  if (status === "offline") return <OfflineScreen onRetry={retry} />;

  const authed = status === "authed";
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider value={{ ...base, colors: { ...base.colors, background: p.canvas, card: p.surface, primary: p.primary, text: p.ink, border: p.border } }}>
      <Stack screenOptions={{ headerTintColor: p.primary, headerTitleStyle: { color: p.ink }, headerStyle: { backgroundColor: p.canvas }, headerShadowVisible: false, contentStyle: { backgroundColor: p.canvas } }}>
        {/* Signed-out screens. Server-side auth is the real gate; this just keeps navigation sensible. */}
        <Stack.Protected guard={!authed}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="register" options={{ title: "Create account" }} />
          <Stack.Screen name="forgot-password" options={{ title: "Reset password" }} />
        </Stack.Protected>
        <Stack.Protected guard={authed} redirectTo="/login">
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ title: "Set up your profile" }} />
          <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
          <Stack.Screen name="support" options={{ title: "Support" }} />
          <Stack.Screen name="reports" options={{ title: "Reports" }} />
          <Stack.Screen name="health/reports/[id]" options={{ title: "Report" }} />
          <Stack.Screen name="health/biomarkers/[code]" options={{ title: "Biomarker" }} />
          <Stack.Screen name="appointments/[id]" options={{ title: "Appointment" }} />
          <Stack.Screen name="appointments/new" options={{ title: "Request appointment", presentation: "modal" }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <RootStack />
    </SessionProvider>
  );
}

/** The session couldn't be checked because Aurel is unreachable. The user is still signed in (tokens kept). (AUD-12) */
function OfflineScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <Screen edges={["top", "bottom"]}>
      <Text variant="display" style={{ marginTop: 80 }}>You&apos;re offline</Text>
      <Text variant="muted">We couldn&apos;t reach Aurel to restore your session. You&apos;re still signed in - this screen
        retries when you come back to the app.</Text>
      <Button title="Try again" onPress={onRetry} />
    </Screen>
  );
}
