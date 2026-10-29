import { colors, darkColors } from "@aurel/shared";
import { Platform, useColorScheme } from "react-native";

export type Palette = Record<keyof typeof colors, string>;

export function usePalette(): Palette {
  return useColorScheme() === "dark" ? darkColors : colors;
}

// System serif stands in for the web's Fraunces so the app ships no font files.
export const serifFamily = Platform.select({ ios: "Georgia", android: "serif", default: undefined });
