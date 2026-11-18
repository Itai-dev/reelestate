// A brand kit pulled from a company's website: logo, colours, fonts and the
// "look" of its photography. Shared by the server (extraction) and the browser
// (reel overlays, colour grade, video prompts).

export type FontKind = "serif" | "sans" | "display";

export type Grade = {
  warmth: number; // -1 cool … 1 warm
  saturation: number; // -1 muted … 1 vivid
  contrast: number; // -1 soft … 1 punchy
  brightness: number; // -1 moody … 1 airy
};

export type Brand = {
  url: string;
  host: string;
  name: string;
  description?: string;
  colors: { primary: string; accent: string; background: string; ink: string; palette: string[] };
  fonts: { heading: string | null; body: string | null; headingKind: FontKind };
  vibe: string[]; // a few Hebrew words
  tone?: string; // one Hebrew sentence about the look and voice
  photoStyle?: string; // English, appended to video prompts
  grade: Grade;
  images: string[];
  applyPrompt: boolean;
  applyGrade: boolean;
};

export const NO_GRADE: Grade = { warmth: 0, saturation: 0, contrast: 0, brightness: 0 };

export const HEX = /^#[0-9a-f]{6}$/i;

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
}

export function hsl(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { s, l };
}

export function luminance(hex: string) {
  if (!HEX.test(hex)) return 0;
  const ch = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

// Text colour that reads on a background.
export const inkOn = (bg: string) => (luminance(bg) > 0.42 ? "#17181b" : "#ffffff");

// Canvas fallbacks that carry Hebrew, by the kind of the brand's own font.
export const HEBREW_FALLBACK: Record<FontKind, string> = {
  serif: '"Frank Ruhl Libre", "David", serif',
  sans: '"Rubik", "Arial Hebrew", sans-serif',
  display: '"Bellefair", "Frank Ruhl Libre", serif',
};

export const fontStack = (family: string | null, kind: FontKind) =>
  family ? `"${family.replace(/"/g, "")}", ${HEBREW_FALLBACK[kind]}` : HEBREW_FALLBACK[kind];

// Brand fonts are tried from Google Fonts by name. Self-hosted fonts that are not
// on Google Fonts fall back to a Hebrew font of the same kind.
export function loadBrandFonts(b: Brand): Promise<unknown> {
  const fams = [b.fonts.heading, b.fonts.body].filter((f): f is string => Boolean(f));
  if (typeof document === "undefined" || !fams.length) return Promise.resolve();
  const href = `https://fonts.googleapis.com/css2?${[...new Set(fams)]
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700`)
    .join("&")}&display=swap`;
  if (!document.querySelector(`link[data-brand-fonts="${href}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.brandFonts = href;
    document.head.appendChild(link);
  }
  return Promise.all(
    fams.map((f) => document.fonts.load(`600 48px "${f}"`, "Aa שלום").catch(() => [])),
  ).catch(() => {});
}

// Canvas filter for the brand's colour look (photos and clips only, never text).
export function gradeFilter(g: Grade) {
  const b = 1 + 0.07 * g.brightness;
  const c = 1 + 0.12 * g.contrast;
  const s = 1 + 0.28 * g.saturation;
  return `brightness(${b.toFixed(3)}) contrast(${c.toFixed(3)}) saturate(${s.toFixed(3)})`;
}

// Warm or cool wash laid over the media with soft-light.
export function gradeWash(g: Grade): string | null {
  if (Math.abs(g.warmth) < 0.05) return null;
  const a = Math.min(0.22, Math.abs(g.warmth) * 0.2);
  return g.warmth > 0 ? `rgba(255,164,82,${a.toFixed(3)})` : `rgba(74,128,214,${a.toFixed(3)})`;
}
