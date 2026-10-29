// Aurel design tokens - the single source for colour, type, spacing and motion on web and mobile.
// Documented in docs/architecture.md (Design system). Contrast pairs are checked there against WCAG 2.2 AA.

export const colors = {
  canvas: "#F5F7F9", // cool clinical white ("Clinical Clear")
  surface: "#FFFFFF",
  surfaceMuted: "#EBF0F3",
  ink: "#1F272B", // slate primary text (14.6:1 on canvas)
  inkMuted: "#4A565C", // secondary text (7.0:1 on canvas)
  inkSubtle: "#5B676D", // tertiary text (5.4:1 on canvas, 5.0:1 on surfaceMuted)
  border: "#DDE4E8",
  borderStrong: "#B9C6CD",
  primary: "#0B6A99", // cerulean (5.9:1 with white)
  primaryHover: "#08567D",
  primarySoft: "#E0F0F8",
  accent: "#0E7480", // deep teal, used sparingly for emphasis (5.3:1 with white, ≥4.6:1 on the light tints)
  accentSoft: "#DDF2F4",
  success: "#2F6B3F",
  successSoft: "#E4F0E6",
  warning: "#8A5A00",
  warningSoft: "#FBF0D9",
  danger: "#A3312A",
  dangerSoft: "#F8E3E1",
  info: "#2B5A86",
  infoSoft: "#E3EDF6",
  focus: "#0B6A99",
} as const;

export const darkColors: Record<keyof typeof colors, string> = {
  canvas: "#0F1417",
  surface: "#161D21",
  surfaceMuted: "#1D262B",
  ink: "#ECF1F4",
  inkMuted: "#B2BEC5",
  inkSubtle: "#95A3AB",
  border: "#263137",
  borderStrong: "#36444C",
  primary: "#6CC4EC",
  primaryHover: "#8DD3F2",
  primarySoft: "#15303D",
  accent: "#7FD6DE",
  accentSoft: "#143238",
  success: "#8BCB98",
  successSoft: "#1F3324",
  warning: "#E7BC62",
  warningSoft: "#3A3020",
  danger: "#F09A92",
  dangerSoft: "#3D2321",
  info: "#94BEE6",
  infoSoft: "#1E2C3A",
  focus: "#6CC4EC",
};

// 4pt base scale
export const space = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64, 20: 80 } as const;

export const radius = { sm: 6, md: 10, lg: 14, pill: 999 } as const;

// Sizes in px; line heights as multipliers. Body never goes below 15px on mobile / 16px on web.
export const type = {
  display: { size: 44, line: 1.1, weight: "500" },
  h1: { size: 32, line: 1.2, weight: "500" },
  h2: { size: 24, line: 1.25, weight: "500" },
  h3: { size: 19, line: 1.3, weight: "600" },
  body: { size: 16, line: 1.55, weight: "400" },
  small: { size: 14, line: 1.45, weight: "400" },
  label: { size: 13, line: 1.3, weight: "600" },
} as const;

export const fonts = {
  // Web loads these via next/font; mobile falls back to platform system fonts.
  serif: "Fraunces",
  sans: "Inter",
} as const;

export const motion = { fast: 120, base: 200, slow: 320, easing: "cubic-bezier(0.2, 0, 0, 1)" } as const;

export const minTouchTarget = 44;

// Status chips for biomarker reference ranges and sync state, shared so both clients speak the same visual language.
export const statusTone = {
  within: "success",
  above: "warning",
  below: "warning",
  unavailable: "neutral",
  not_comparable: "info",
  no_range: "neutral",
  no_data: "neutral",
} as const;
