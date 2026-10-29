import type { CSSProperties } from "react";

export const DEFAULT_BRAND_COLOR = "#2563eb";

export const BRAND_COLOR_PRESETS = [
  DEFAULT_BRAND_COLOR,
  "#1d4ed8",
  "#0284c7",
  "#0ea5e9",
  "#4f46e5",
  "#0891b2",
  "#0f766e",
  "#f97316",
] as const;

export function normalizeBrandColor(value: unknown): string | null {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : null;
}

function readableForeground(hex: string) {
  const channels = hex.slice(1).match(/../g)?.map((part) => Number.parseInt(part, 16)) ?? [37, 99, 235];
  const [r, g, b] = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#10213b" : "#ffffff";
}

export function brandThemeStyle(input: unknown): CSSProperties {
  const color = normalizeBrandColor(input) ?? DEFAULT_BRAND_COLOR;
  const foreground = readableForeground(color);
  const mix = (amount: number, into: "white" | "black") => `color-mix(in srgb, ${color} ${amount}%, ${into})`;
  return {
    "--color-base-content": "#182b49",
    "--color-primary": color,
    "--color-primary-content": foreground,
    "--color-brand-50": mix(5, "white"),
    "--color-brand-100": mix(11, "white"),
    "--color-brand-200": mix(23, "white"),
    "--color-brand-300": mix(39, "white"),
    "--color-brand-400": mix(65, "white"),
    "--color-brand-500": color,
    "--color-brand-600": mix(88, "black"),
    "--color-brand-700": mix(75, "black"),
    "--color-brand-800": mix(62, "black"),
    "--color-brand-900": mix(50, "black"),
    "--rmdp-primary-green": color,
    "--rmdp-secondary-green": mix(23, "white"),
    "--rmdp-shadow-green": mix(39, "white"),
    "--rmdp-today-green": mix(11, "white"),
    "--rmdp-hover-green": mix(88, "black"),
    "--rmdp-deselect-green": mix(75, "black"),
  } as CSSProperties;
}

export function setRootBrandTheme(color: unknown) {
  if (typeof document === "undefined") return;
  const style = brandThemeStyle(color);
  for (const [key, value] of Object.entries(style)) {
    if (typeof value === "string") document.documentElement.style.setProperty(key, value);
  }
}
