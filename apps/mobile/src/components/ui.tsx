import { ApiError, SYNC_LABELS, darkColors, minTouchTarget, radius, space, statusTone, syncStateFor, type SyncState } from "@aurel/shared";
import { router } from "expo-router";
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, Text as RNText, TextInput, View,
  type PressableProps, type TextInputProps, type TextProps, type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { serifFamily, usePalette, type Palette } from "@/lib/theme";

type Variant = "display" | "title" | "heading" | "body" | "small" | "label" | "muted";
const sizes: Record<Variant, { fontSize: number; lineHeight: number; fontWeight?: "400" | "500" | "600" }> = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: "500" },
  title: { fontSize: 24, lineHeight: 30, fontWeight: "500" },
  heading: { fontSize: 17, lineHeight: 23, fontWeight: "600" },
  body: { fontSize: 16, lineHeight: 23 },
  small: { fontSize: 14, lineHeight: 20 },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
  muted: { fontSize: 14, lineHeight: 20 },
};

export function Text({ variant = "body", color, style, ...rest }: TextProps & { variant?: Variant; color?: keyof Palette }) {
  const p = usePalette();
  const serif = variant === "display" || variant === "title";
  return (
    <RNText {...rest} maxFontSizeMultiplier={1.8}
      style={[sizes[variant], { color: p[color ?? (variant === "muted" ? "inkMuted" : "ink")], fontFamily: serif ? serifFamily : undefined }, style]} />
  );
}

/** Scrollable screen with pull-to-refresh and safe-area padding. */
export function Screen({ children, refreshing, onRefresh, edges = [] }:
  { children: React.ReactNode; refreshing?: boolean; onRefresh?: () => void; edges?: ("top" | "bottom")[] }) {
  const p = usePalette();
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: p.canvas }}>
      <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: space[12], gap: space[4] }}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={p.primary} /> : undefined}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const p = usePalette();
  return <View style={[{ backgroundColor: p.surface, borderColor: p.border, borderWidth: 1, borderRadius: radius.lg, padding: space[4], gap: space[3] }, style]}>{children}</View>;
}

export function CardTitle({ title, action, sub }: { title: string; action?: React.ReactNode; sub?: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
      <View style={{ flex: 1 }}>
        <Text variant="heading" accessibilityRole="header">{title}</Text>
        {sub ? <Text variant="muted">{sub}</Text> : null}
      </View>
      {action}
    </View>
  );
}

type BtnProps = PressableProps & { title: string; variant?: "primary" | "secondary" | "ghost" | "danger"; loading?: boolean; small?: boolean };

export function Button({ title, variant = "primary", loading, small, disabled, style, ...rest }: BtnProps) {
  const p = usePalette();
  const bg = { primary: p.primary, secondary: p.surface, ghost: "transparent", danger: p.surface }[variant];
  const fg = { primary: p.canvas === darkColors.canvas ? p.canvas : "#FFFFFF", secondary: p.ink, ghost: p.primary, danger: p.danger }[variant];
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      disabled={disabled || loading} {...rest}
      style={({ pressed }) => [{
        minHeight: small ? 40 : minTouchTarget + 4, paddingHorizontal: small ? 14 : 20, borderRadius: radius.md,
        backgroundColor: bg, borderWidth: variant === "secondary" || variant === "danger" ? 1 : 0, borderColor: p.borderStrong,
        alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8,
        opacity: disabled ? 0.55 : pressed ? 0.85 : 1,
      }, style as ViewStyle]}>
      {loading && <ActivityIndicator color={fg} size="small" />}
      <RNText style={{ color: fg, fontSize: small ? 14 : 16, fontWeight: "600" }} maxFontSizeMultiplier={1.5}>{title}</RNText>
    </Pressable>
  );
}

export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "primary" | "accent";
function toneColors(p: Palette, tone: Tone) {
  return {
    success: [p.successSoft, p.success], warning: [p.warningSoft, p.warning], danger: [p.dangerSoft, p.danger],
    info: [p.infoSoft, p.info], neutral: [p.surfaceMuted, p.inkMuted], primary: [p.primarySoft, p.primary],
    accent: [p.accentSoft, p.accent],
  }[tone];
}

export function Badge({ tone = "neutral", label }: { tone?: Tone; label: string }) {
  const p = usePalette();
  const [bg, fg] = toneColors(p, tone);
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 2, alignSelf: "flex-start" }}>
      <RNText style={{ color: fg, fontSize: 12, fontWeight: "600" }}>{label}</RNText>
    </View>
  );
}
export const rangeTone = (s: string): Tone => statusTone[s as keyof typeof statusTone] ?? "neutral";

export function Notice({ tone = "info", title, children, action }: { tone?: Tone; title?: string; children?: React.ReactNode; action?: React.ReactNode }) {
  const p = usePalette();
  const [bg, fg] = toneColors(p, tone);
  return (
    <View accessibilityRole={tone === "danger" ? "alert" : "summary"} style={{ backgroundColor: bg, borderRadius: radius.md, padding: space[3], gap: 6 }}>
      {title ? <RNText style={{ color: fg, fontWeight: "600", fontSize: 15 }}>{title}</RNText> : null}
      {typeof children === "string" ? <RNText style={{ color: fg, fontSize: 14, lineHeight: 20 }}>{children}</RNText> : children}
      {action}
    </View>
  );
}

export function SyncStatus({ state, syncedAt, onRetry }: { state: SyncState; syncedAt?: Date | null; onRetry?: () => void }) {
  const p = usePalette();
  const label = state === "idle" ? (syncedAt ? `Up to date · ${syncedAt.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}` : "") : SYNC_LABELS[state];
  if (!label) return null;
  const color = state === "failed" || state === "session_expired" ? p.danger : state === "offline" || state === "conflict" ? p.warning : state === "saved" ? p.success : p.inkSubtle;
  return (
    <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {(state === "saving" || state === "syncing") && <ActivityIndicator size="small" color={color} />}
      <RNText style={{ color, fontSize: 13 }}>{label}</RNText>
      {onRetry && (state === "failed" || state === "offline") && (
        <Pressable onPress={onRetry} hitSlop={12} accessibilityRole="button"><RNText style={{ color, fontSize: 13, fontWeight: "700", textDecorationLine: "underline" }}>Retry</RNText></Pressable>
      )}
    </View>
  );
}

export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const state = syncStateFor(error);
  if (state === "session_expired") {
    return <Notice tone="warning" title="Your session has ended" action={<Button small title="Sign in" onPress={() => router.replace("/login")} />}>Sign in again to continue.</Notice>;
  }
  return (
    <Notice tone={state === "offline" ? "warning" : "danger"} title={state === "offline" ? "You're offline" : "We couldn't load this"}
      action={<Button small variant="secondary" title="Try again" onPress={onRetry} />}>
      {error instanceof ApiError ? error.message : "Something went wrong."}
    </Notice>
  );
}

export function Loading() {
  const p = usePalette();
  return <View style={{ flex: 1, padding: 48, alignItems: "center", backgroundColor: p.canvas }} accessibilityLabel="Loading"><ActivityIndicator color={p.primary} /></View>;
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  const p = usePalette();
  return (
    <View style={{ borderWidth: 1, borderStyle: "dashed", borderColor: p.borderStrong, borderRadius: radius.lg, padding: space[6], alignItems: "center", gap: 6 }}>
      <Text variant="heading">{title}</Text>
      {body ? <Text variant="muted" style={{ textAlign: "center" }}>{body}</Text> : null}
      {action}
    </View>
  );
}

export function Field({ label, error, hint, style, ...rest }: TextInputProps & { label: string; error?: string; hint?: string }) {
  const p = usePalette();
  return (
    <View style={{ gap: 6 }}>
      <Text variant="label">{label}</Text>
      <TextInput accessibilityLabel={label} accessibilityHint={error ?? hint} placeholderTextColor={p.inkSubtle} {...rest}
        style={[{ minHeight: minTouchTarget + 4, borderWidth: 1, borderColor: error ? p.danger : p.borderStrong, borderRadius: radius.md,
          paddingHorizontal: 14, fontSize: 16, color: p.ink, backgroundColor: p.surface }, style]} />
      {error ? <RNText style={{ color: p.danger, fontSize: 13, fontWeight: "600" }}>{error}</RNText>
        : hint ? <Text variant="muted" style={{ fontSize: 13 }}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const p = usePalette();
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: selected }}
      style={{ minHeight: minTouchTarget, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, justifyContent: "center",
        borderColor: selected ? p.primary : p.borderStrong, backgroundColor: selected ? p.primarySoft : p.surface }}>
      <RNText style={{ color: selected ? p.primary : p.ink, fontWeight: selected ? "600" : "400", fontSize: 15 }}>{label}</RNText>
    </Pressable>
  );
}

export function ChipGroup({ label, options, value, onChange, max, single, error }:
  { label: string; options: Record<string, string>; value: string[]; onChange: (v: string[]) => void; max?: number; single?: boolean; error?: string }) {
  const p = usePalette();
  return (
    <View style={{ gap: 8 }} accessibilityRole={single ? "radiogroup" : undefined} accessibilityLabel={label}>
      <Text variant="label">{label}{max ? ` (up to ${max})` : ""}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {Object.entries(options).map(([k, l]) => {
          const on = value.includes(k);
          return <Chip key={k} label={l} selected={on} onPress={() => onChange(single ? [k] : on ? value.filter((x) => x !== k) : max && value.length >= max ? value : [...value, k])} />;
        })}
      </View>
      {error ? <RNText style={{ color: p.danger, fontSize: 13, fontWeight: "600" }}>{error}</RNText> : null}
    </View>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const p = usePalette();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: value }}
      style={{ height: 8, borderRadius: 4, backgroundColor: p.surfaceMuted, overflow: "hidden" }}>
      <View style={{ width: `${value}%`, height: 8, borderRadius: 4, backgroundColor: p.primary }} />
    </View>
  );
}

/** A tappable row that navigates (used for list items). */
export function Row({ onPress, children, label }: { onPress: () => void; children: React.ReactNode; label: string }) {
  const p = usePalette();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={label}
      style={({ pressed }) => ({ paddingVertical: 12, minHeight: minTouchTarget, borderBottomWidth: 1, borderBottomColor: p.border, opacity: pressed ? 0.6 : 1 })}>
      {children}
    </Pressable>
  );
}

export function fieldErrors(e: unknown): Record<string, string> {
  if (!(e instanceof ApiError) || !e.body.fields) return {};
  return Object.fromEntries(e.body.fields.map((f) => [f.field.split(".").pop() || f.field, f.message.replace(/^Value error, /, "")]));
}
