import type { StudioTheme, StudioThemeFont } from "./types";

export interface BuiltInThemeProfile {
  id: "studio" | "mint" | "bubblegum" | "minimal";
  name: string;
  theme: StudioTheme;
}

export const themeFontOptions: ReadonlyArray<{ id: StudioThemeFont; label: string; stack: string }> = [
  { id: "system", label: "System sans", stack: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { id: "serif", label: "Editorial serif", stack: 'Georgia, "Times New Roman", serif' },
  { id: "rounded", label: "Rounded sans", stack: '"Arial Rounded MT Bold", "Trebuchet MS", ui-rounded, system-ui, sans-serif' },
  { id: "mono", label: "Monospace", stack: '"Cascadia Code", "SFMono-Regular", Consolas, monospace' },
  { id: "comic", label: "Comic Sans", stack: '"Comic Sans MS", "Comic Sans", cursive' },
];

const fontKeys = new Set<StudioThemeFont>(themeFontOptions.map((option) => option.id));

export function themeFontStack(font: StudioThemeFont): string {
  return themeFontOptions.find((option) => option.id === font)?.stack ?? themeFontOptions[0].stack;
}

const vibecoderPurple: StudioTheme = {
  accent: "#c3a5ff",
  accentAlt: "#ffb5df",
  background: "#100d15",
  panel: "#1b1622",
  surfaceAlt: "#15111b",
  text: "#f4eef8",
  muted: "#aaa0b4",
  outline: "#e8dfff",
  success: "#8ee3bd",
  warning: "#e9c98f",
  danger: "#ff9bb4",
  dangerSurface: "#2a1119",
  titleFont: "serif",
  subtitleFont: "system",
  radius: 14,
  controlRadius: 10,
  borderStrength: 0.14,
  surfaceOpacity: 0.92,
};

export const builtInThemes: ReadonlyArray<BuiltInThemeProfile> = [
  {
    id: "studio",
    name: "Vibecoder Purple",
    theme: vibecoderPurple,
  },
  {
    id: "mint",
    name: "Shrek",
    theme: {
      accent: "#39ff14",
      accentAlt: "#b7ff00",
      background: "#020500",
      panel: "#071006",
      surfaceAlt: "#0e180b",
      text: "#dfffca",
      muted: "#8fab7d",
      outline: "#3cff1e",
      success: "#79ff52",
      warning: "#d7ff00",
      danger: "#ff4d6d",
      dangerSurface: "#2b070d",
      titleFont: "comic",
      subtitleFont: "comic",
      radius: 0,
      controlRadius: 0,
      borderStrength: 0.38,
      surfaceOpacity: 0.94,
    },
  },
  {
    id: "bubblegum",
    name: "Bubbly McBubbles",
    theme: {
      accent: "#e653ad",
      accentAlt: "#f3aaf0",
      background: "#fffefe",
      panel: "#f6e7f4",
      surfaceAlt: "#f2e5ef",
      text: "#76054e",
      muted: "#8b2767",
      outline: "#e0a0d5",
      success: "#3fae80",
      warning: "#b56d13",
      danger: "#c92f68",
      dangerSurface: "#fce6ee",
      titleFont: "serif",
      subtitleFont: "rounded",
      radius: 25,
      controlRadius: 18,
      borderStrength: 0.2,
      surfaceOpacity: 0.9,
    },
  },
  {
    id: "minimal",
    name: "Sticky White Substance",
    theme: {
      accent: "#25262a",
      accentAlt: "#8d8f96",
      background: "#fafafa",
      panel: "#ffffff",
      surfaceAlt: "#f0f0f2",
      text: "#171719",
      muted: "#6f7076",
      outline: "#3a3b40",
      success: "#2f855a",
      warning: "#946200",
      danger: "#b42318",
      dangerSurface: "#fff0ee",
      titleFont: "system",
      subtitleFont: "mono",
      radius: 2,
      controlRadius: 2,
      borderStrength: 0.12,
      surfaceOpacity: 0.98,
    },
  },
] as const;

export const defaultTheme: StudioTheme = structuredClone(vibecoderPurple);

function finiteNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function themeString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function themeFont(value: unknown, fallback: StudioThemeFont): StudioThemeFont {
  return fontKeys.has(value as StudioThemeFont) ? value as StudioThemeFont : fallback;
}

export function normalizeStudioTheme(value: Partial<StudioTheme> | null | undefined): StudioTheme {
  const source = value ?? {};
  return {
    accent: themeString(source.accent, defaultTheme.accent),
    accentAlt: themeString(source.accentAlt, defaultTheme.accentAlt),
    background: themeString(source.background, defaultTheme.background),
    panel: themeString(source.panel, defaultTheme.panel),
    surfaceAlt: themeString(source.surfaceAlt, defaultTheme.surfaceAlt),
    text: themeString(source.text, defaultTheme.text),
    muted: themeString(source.muted, defaultTheme.muted),
    outline: themeString(source.outline, defaultTheme.outline),
    success: themeString(source.success, defaultTheme.success),
    warning: themeString(source.warning, defaultTheme.warning),
    danger: themeString(source.danger, defaultTheme.danger),
    dangerSurface: themeString(source.dangerSurface, defaultTheme.dangerSurface),
    titleFont: themeFont(source.titleFont, defaultTheme.titleFont),
    subtitleFont: themeFont(source.subtitleFont, defaultTheme.subtitleFont),
    radius: clamp(finiteNumber(source.radius, defaultTheme.radius), 0, 32),
    controlRadius: clamp(finiteNumber(source.controlRadius, defaultTheme.controlRadius), 0, 24),
    borderStrength: clamp(finiteNumber(source.borderStrength, defaultTheme.borderStrength), 0, 0.5),
    surfaceOpacity: clamp(finiteNumber(source.surfaceOpacity, defaultTheme.surfaceOpacity), 0.45, 1),
  };
}

function hexChannel(value: string): number | null {
  const parsed = Number.parseInt(value, 16);
  return Number.isFinite(parsed) ? parsed / 255 : null;
}

function linearChannel(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function themeRelativeLuminance(color: string): number | null {
  const raw = color.trim().replace(/^#/, "");
  const hex = raw.length === 3 ? raw.split("").map((char) => `${char}${char}`).join("") : raw;
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  const r = hexChannel(hex.slice(0, 2));
  const g = hexChannel(hex.slice(2, 4));
  const b = hexChannel(hex.slice(4, 6));
  if (r === null || g === null || b === null) return null;
  return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b);
}

export function isLightTheme(background: string): boolean {
  const luminance = themeRelativeLuminance(background);
  return luminance !== null && luminance >= 0.58;
}
