import type { PageTheme, ThemeCSSVars } from "./types.js";

/**
 * Style presets — control structural CSS properties (border radius, shadow depth, spacing).
 * These are fixed per-style and do NOT come from the theme colors.
 */
export const STYLE_PRESETS: Record<string, {
  borderRadius: string;
  borderRadiusLg: string;
  shadowDepth: string;
  sectionSpacing: string;
  fontScale: string;
}> = {
  modern: {
    borderRadius: "0.5rem",
    borderRadiusLg: "0.75rem",
    shadowDepth: "0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)",
    sectionSpacing: "5rem",
    fontScale: "1",
  },
  playful: {
    borderRadius: "1rem",
    borderRadiusLg: "1.5rem",
    shadowDepth: "0 4px 6px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06)",
    sectionSpacing: "4rem",
    fontScale: "1.05",
  },
  minimal: {
    borderRadius: "0.25rem",
    borderRadiusLg: "0.5rem",
    shadowDepth: "none",
    sectionSpacing: "6rem",
    fontScale: "1",
  },
  techy: {
    borderRadius: "0.125rem",
    borderRadiusLg: "0.25rem",
    shadowDepth: "0 0 0 1px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.08)",
    sectionSpacing: "5rem",
    fontScale: "0.95",
  },
  elegant: {
    borderRadius: "0.375rem",
    borderRadiusLg: "0.625rem",
    shadowDepth: "0 10px 25px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)",
    sectionSpacing: "5.5rem",
    fontScale: "1.02",
  },
};

/**
 * Validate a hex color string.
 * Accepts #RGB and #RRGGBB formats.
 */
export function isValidHex(color: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color);
}

/** Darken a hex color by a percentage (0-100). */
export function darken(hex: string, percent: number): string {
  if (!isValidHex(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const factor = 1 - percent / 100;
  return `#${Math.round(r * factor).toString(16).padStart(2, "0")}${Math.round(g * factor).toString(16).padStart(2, "0")}${Math.round(b * factor).toString(16).padStart(2, "0")}`;
}

/** Lighten a hex color by a percentage (0-100). */
export function lighten(hex: string, percent: number): string {
  if (!isValidHex(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const factor = percent / 100;
  return `#${Math.round(r + (255 - r) * factor).toString(16).padStart(2, "0")}${Math.round(g + (255 - g) * factor).toString(16).padStart(2, "0")}${Math.round(b + (255 - b) * factor).toString(16).padStart(2, "0")}`;
}

/**
 * Convert a hex color to an rgba string with given alpha.
 */
export function withAlpha(hex: string, alpha: number): string {
  if (!isValidHex(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Compile a PageTheme into CSS custom properties.
 *
 * Output is a record of CSS variable name → value.
 * Includes both light and dark mode variables.
 *
 * Usage: renderer will wrap these in `:root { ... }` and
 * `[data-theme="dark"] { ... }` blocks.
 */
export function compileTheme(theme: PageTheme): {
  light: ThemeCSSVars;
  dark: ThemeCSSVars;
} {
  const preset = STYLE_PRESETS[theme.style] ?? STYLE_PRESETS.modern;

  // Light mode (default)
  const light: ThemeCSSVars = {
    "--color-primary": theme.primary,
    "--color-primary-hover": darken(theme.primary, 10),
    "--color-primary-light": withAlpha(theme.primary, 0.1),
    "--color-secondary": theme.secondary,
    "--color-secondary-hover": darken(theme.secondary, 10),
    "--color-accent": theme.accent,
    "--color-accent-hover": darken(theme.accent, 10),
    "--color-background": theme.background,
    "--color-surface": lighten(theme.background, 3),
    "--color-text": "#1F2937",
    "--color-text-muted": "#6B7280",
    "--color-border": "#E5E7EB",
    "--radius": preset.borderRadius,
    "--radius-lg": preset.borderRadiusLg,
    "--shadow": preset.shadowDepth,
    "--section-spacing": preset.sectionSpacing,
    "--font-scale": preset.fontScale,
  };

  if (theme.fontFamily) {
    light["--font-family"] = theme.fontFamily;
  } else {
    light["--font-family"] = "'Inter', system-ui, -apple-system, sans-serif";
  }

  // Dark mode
  const dark: ThemeCSSVars = {
    ...light,
    "--color-background": "#0F172A",
    "--color-surface": "#1E293B",
    "--color-text": "#F1F5F9",
    "--color-text-muted": "#94A3B8",
    "--color-border": "#334155",
  };

  return { light, dark };
}

/**
 * Convert CSS variables to a CSS string block.
 *
 * @example
 * formatCSSVars(":root", { "--color-primary": "#3B82F6" })
 * // → ":root {\n  --color-primary: #3B82F6;\n}"
 */
export function formatCSSVars(selector: string, vars: ThemeCSSVars): string {
  const entries = Object.entries(vars)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join("\n");
  return `${selector} {\n${entries}\n}`;
}
