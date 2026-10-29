import { Link, Tabs } from "expo-router";
import { Pressable } from "react-native";
import Svg, { Path } from "react-native-svg";

import { usePalette } from "@/lib/theme";

const ICONS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  health: "M3 12h4l3-7 4 14 3-7h4",
  plan: "M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9",
  appts: "M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  bell: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
};

export function Icon({ d, color, size = 24 }: { d: string; color: string; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><Path d={d} /></Svg>;
}

export default function TabsLayout() {
  const p = usePalette();
  const bell = () => (
    <Link href="/notifications" asChild>
      <Pressable accessibilityLabel="Notifications" hitSlop={8} style={{ paddingHorizontal: 16, minHeight: 44, justifyContent: "center" }}>
        <Icon d={ICONS.bell} color={p.inkMuted} />
      </Pressable>
    </Link>
  );
  const tab = (title: string, d: string) => ({
    title,
    tabBarIcon: ({ color }: { color: unknown }) => <Icon d={d} color={String(color)} />,
    headerRight: bell,
  });
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: p.primary, tabBarInactiveTintColor: p.inkMuted,
      tabBarStyle: { backgroundColor: p.surface, borderTopColor: p.border },
      headerStyle: { backgroundColor: p.canvas }, headerTitleStyle: { color: p.ink }, headerShadowVisible: false,
      tabBarLabelStyle: { fontSize: 11 },
    }}>
      <Tabs.Screen name="dashboard" options={tab("Home", ICONS.home)} />
      <Tabs.Screen name="health" options={tab("My Health", ICONS.health)} />
      <Tabs.Screen name="care-plan" options={tab("My Plan", ICONS.plan)} />
      <Tabs.Screen name="appointments" options={tab("Appointments", ICONS.appts)} />
      <Tabs.Screen name="profile" options={tab("Profile", ICONS.profile)} />
    </Tabs>
  );
}
