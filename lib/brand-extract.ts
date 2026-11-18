// Server side: reads a company's website and builds a brand kit from it.
// Only public pages on the open internet are fetched (no private or local addresses).
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { parse, type HTMLElement } from "node-html-parser";
import { HEX, NO_GRADE, contrast, hsl, rgbToHex, type Brand, type FontKind, type Grade } from "./brand";
import { fal } from "./server";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 ReelEstateBrandReader/1.0";

export class BrandError extends Error {}

// ---------- safe fetching ----------

function privateV4(ip: string) {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function privateIp(ip: string) {
  if (isIP(ip) === 4) return privateV4(ip);
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return privateV4(mapped[1]);
  return v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb");
}

async function assertPublic(u: URL) {
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new BrandError("רק כתובות http או https");
  if (u.port && u.port !== "80" && u.port !== "443") throw new BrandError("הכתובת לא נתמכת");
  if (u.username || u.password) throw new BrandError("הכתובת לא נתמכת");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new BrandError("הכתובת לא נתמכת");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new BrandError("לא מצאנו את האתר. בדקו שהכתובת נכונה.");
  if (addrs.some((a) => privateIp(a.address))) throw new BrandError("הכתובת לא נתמכת");
}

type Got = { url: URL; type: string; body: Uint8Array };

async function safeFetch(start: string | URL, maxBytes: number, timeoutMs = 9000): Promise<Got> {
  let url = new URL(start);
  for (let hop = 0; hop < 5; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": UA, accept: "text/html,text/css,image/*,*/*;q=0.8", "accept-language": "he,en;q=0.8" },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (!res.ok || !res.body) throw new BrandError(`האתר החזיר שגיאה (${res.status})`);
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    reader.cancel().catch(() => {});
    const body = new Uint8Array(Math.min(size, maxBytes));
    let o = 0;
    for (const c of chunks) {
      const part = c.subarray(0, Math.max(0, body.length - o));
      body.set(part, o);
      o += part.length;
      if (o >= body.length) break;
    }
    return { url, type: res.headers.get("content-type") ?? "", body };
  }
  throw new BrandError("יותר מדי הפניות");
}

const text = (b: Uint8Array) => new TextDecoder("utf-8", { fatal: false }).decode(b);

// ---------- colours ----------

const NAMED: Record<string, string> = { white: "#ffffff", black: "#000000" };

function normColor(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (NAMED[v]) return NAMED[v];
  let m = /^#([0-9a-f]{3,8})$/.exec(v);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split("").map((c) => c + c).join("");
    if (h.length === 8) {
      if (parseInt(h.slice(6), 16) < 200) return null; // mostly transparent overlays
      h = h.slice(0, 6);
    }
    return h.length === 6 ? `#${h}` : null;
  }
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(v);
  if (m) {
    if (m[4]) {
      const a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      if (a < 0.8) return null;
    }
    return rgbToHex(+m[1], +m[2], +m[3]);
  }
  return null;
}

const COLOR_RE = /#[0-9a-f]{3,8}\b|rgba?\([^)]{5,40}\)/gi;

function distance(a: string, b: string) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const d = [16, 8, 0].map((s) => ((pa >> s) & 255) - ((pb >> s) & 255));
  return Math.sqrt(d[0] ** 2 * 0.3 + d[1] ** 2 * 0.59 + d[2] ** 2 * 0.11);
}

function rankColors(css: string, html: string, theme: string | null) {
  const score = new Map<string, number>();
  const add = (c: string | null, w: number) => c && score.set(c, (score.get(c) ?? 0) + w);
  for (const m of css.matchAll(COLOR_RE)) add(normColor(m[0]), 1);
  for (const m of html.matchAll(/style="[^"]*"/gi)) for (const c of m[0].matchAll(COLOR_RE)) add(normColor(c[0]), 2);
  // custom properties named like brand colours count a lot
  for (const m of css.matchAll(/--[\w-]*(primary|brand|accent|main|theme|secondary|highlight)[\w-]*\s*:\s*([^;}{]+)/gi)) {
    add(normColor(m[2]), m[1].toLowerCase() === "secondary" ? 12 : 25);
  }
  for (const m of css.matchAll(/(?:\.btn|button|\.button|\.cta|a)[^{}]{0,60}\{[^}]*background(?:-color)?\s*:\s*([^;}]+)/gi)) {
    const c = normColor(m[1].split(/\s/)[0]);
    add(c, 4);
  }
  if (theme) add(theme, 40);

  const all = [...score.entries()].sort((a, b) => b[1] - a[1]);
  const chroma = all.filter(([c]) => {
    const { s, l } = hsl(c);
    return s > 0.18 && l > 0.12 && l < 0.9;
  });
  const palette: string[] = [];
  for (const [c] of chroma) {
    if (palette.every((p) => distance(p, c) > 38)) palette.push(c);
    if (palette.length >= 6) break;
  }
  const lights = all.filter(([c]) => hsl(c).l > 0.9).map(([c]) => c);
  const darks = all.filter(([c]) => hsl(c).l < 0.22).map(([c]) => c);
  return { palette, background: lights[0] ?? "#ffffff", ink: darks[0] ?? "#1b1b1f", all: all.slice(0, 24).map(([c]) => c) };
}

// ---------- fonts ----------

const GENERIC = new Set(
  [
    "serif", "sans-serif", "monospace", "cursive", "fantasy", "inherit", "initial", "unset", "system-ui", "-apple-system",
    "blinkmacsystemfont", "segoe ui", "arial", "helvetica", "helvetica neue", "ui-sans-serif", "ui-serif", "var",
    "apple color emoji", "segoe ui emoji", "segoe ui symbol", "noto color emoji", "times new roman", "times", "georgia",
    "verdana", "tahoma", "courier new", "sans", "emoji", "math",
  ],
);
const ICON_FONT = /awesome|icon|icomoon|dashicons|swiper|material|eicons|etmodules|glyph|slick|fontello|elementskit|revicons|wix-?madefor-?display-?v2-?icons/i;

const firstFamily = (decl: string) => {
  for (const part of decl.split(",")) {
    const f = part.trim().replace(/^['"]|['"]$/g, "").replace(/\s*!important$/, "").trim();
    if (!f || f.startsWith("var(") || GENERIC.has(f.toLowerCase()) || ICON_FONT.test(f)) continue;
    return f;
  }
  return null;
};

function googleFamilies(hrefs: string[]) {
  const out: string[] = [];
  for (const h of hrefs) {
    try {
      const u = new URL(h);
      if (!u.hostname.includes("fonts.googleapis.com")) continue;
      for (const fam of u.searchParams.getAll("family")) {
        for (const one of fam.split("|")) {
          const name = one.split(":")[0].replace(/\+/g, " ").trim();
          if (name) out.push(name);
        }
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

function rankFonts(css: string, google: string[]) {
  const count = new Map<string, number>();
  const add = (f: string | null, w: number) => f && count.set(f, (count.get(f) ?? 0) + w);
  let heading: string | null = null;
  let body: string | null = null;
  for (const m of css.matchAll(/([^{}]{1,200})\{([^}]*font-family\s*:\s*([^;}]+)[^}]*)\}/gi)) {
    const sel = m[1].toLowerCase();
    const fam = firstFamily(m[3]);
    if (!fam) continue;
    add(fam, 1);
    if (!heading && /(^|[\s,>])h[12]\b|heading|title|display/.test(sel)) heading = fam;
    if (!body && /(^|[\s,])(body|html|p)\s*($|,|\{)/.test(sel)) body = fam;
  }
  for (const m of css.matchAll(/--[\w-]*(font|family)[\w-]*\s*:\s*([^;}{]+)/gi)) add(firstFamily(m[2]), 2);
  for (const g of google) add(g, 6);
  const ranked = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f);
  heading = heading ?? google[0] ?? ranked[0] ?? null;
  body = body ?? ranked.find((f) => f !== heading) ?? heading;
  return { heading, body, ranked: ranked.slice(0, 8) };
}

const SERIF_HINT = /serif|garamond|playfair|bodoni|didot|baskerville|frank ruhl|david|lora|merriweather|cormorant|caslon|times|libre|noto serif|tiempos|canela|freight|ivy|gt sectra|domaine|recoleta|fraunces/i;
const kindOf = (f: string | null): FontKind => (!f ? "sans" : /sans/i.test(f) ? "sans" : SERIF_HINT.test(f) ? "serif" : "sans");

// ---------- logo and images ----------

const abs = (v: string | undefined | null, base: URL) => {
  if (!v) return null;
  try {
    const u = new URL(v.trim(), base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
};

const largestFromSrcset = (srcset: string | undefined) => {
  if (!srcset) return null;
  let best: { url: string; w: number } | null = null;
  for (const part of srcset.split(",")) {
    const [url, size] = part.trim().split(/\s+/);
    const w = parseFloat(size ?? "1") || 1;
    if (url && (!best || w > best.w)) best = { url, w };
  }
  return best?.url ?? null;
};

const isLogoish = (el: HTMLElement) =>
  /logo|brand/i.test([el.getAttribute("class"), el.getAttribute("id"), el.getAttribute("alt"), el.getAttribute("src"), el.getAttribute("aria-label")].join(" "));

function svgData(svg: HTMLElement) {
  let s = svg.toString();
  if (!/xmlns=/.test(s)) s = s.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  return s.length < 200_000 ? { svg: s } : null;
}

function findLogo(root: HTMLElement, base: URL, ldLogo: string | null) {
  const imgUrl = (i: HTMLElement | undefined) => {
    const u = i ? abs(i.getAttribute("src") ?? i.getAttribute("data-src"), base) : null;
    return u && !/\.gif($|\?)/i.test(u) ? { url: u } : null;
  };
  // 1. an image or inline svg marked as the logo, preferably in the header
  const marked = (sel: string) =>
    root.querySelectorAll(sel).find((el) => isLogoish(el) || isLogoish(el.parentNode as HTMLElement) || isLogoish(el.closest("a") as HTMLElement));
  const headImg = marked("header img, nav img, [class*=header] img");
  if (imgUrl(headImg)) return imgUrl(headImg);
  const headSvg = marked("header svg, nav svg, [class*=header] svg, [class*=logo] svg");
  if (headSvg && svgData(headSvg)) return svgData(headSvg);
  // 2. whatever sits inside the header's link to the home page
  const home = root
    .querySelectorAll("header a, nav a, [class*=header] a")
    .find((a) => {
      const h = (a.getAttribute("href") ?? "").trim();
      return h === "/" || h === "./" || h === base.origin || h === `${base.origin}/` || h === base.href;
    });
  if (home) {
    const i = home.querySelector("img");
    if (imgUrl(i ?? undefined)) return imgUrl(i ?? undefined);
    const svg = home.querySelector("svg");
    if (svg && svgData(svg)) return svgData(svg);
  }
  const anyImg = root.querySelectorAll("img").find((i) => isLogoish(i));
  if (imgUrl(anyImg)) return imgUrl(anyImg);
  if (ldLogo) return { url: ldLogo };
  const og = abs(root.querySelector('meta[property="og:logo"]')?.getAttribute("content"), base);
  if (og) return { url: og };
  const icons = root
    .querySelectorAll('link[rel~="apple-touch-icon"], link[rel~="icon"]')
    .map((l) => ({ url: abs(l.getAttribute("href"), base), size: parseInt((l.getAttribute("sizes") ?? "0").split("x")[0]) || 0 }))
    .filter((i) => i.url && !/\.ico($|\?)/i.test(i.url))
    .sort((a, b) => b.size - a.size);
  if (icons[0]?.url) return { url: icons[0].url };
  return null;
}

function findImages(root: HTMLElement, base: URL) {
  const out: string[] = [];
  const push = (u: string | null) => {
    if (!u || out.includes(u)) return;
    if (/\.(svg|gif|ico)($|\?)/i.test(u) || /logo|icon|sprite|avatar|pixel|tracking|placeholder|blank|spinner|loader|flag/i.test(u)) return;
    if (u.startsWith("data:")) return;
    out.push(u);
  };
  for (const sel of ['meta[property="og:image"]', 'meta[name="twitter:image"]', 'meta[property="og:image:url"]'])
    push(abs(root.querySelector(sel)?.getAttribute("content"), base));
  for (const img of root.querySelectorAll("img, source")) {
    const src =
      largestFromSrcset(img.getAttribute("srcset") ?? img.getAttribute("data-srcset")) ??
      img.getAttribute("data-src") ??
      img.getAttribute("data-lazy-src") ??
      img.getAttribute("src");
    const w = parseInt(img.getAttribute("width") ?? "0");
    if (w && w < 300) continue;
    push(abs(src, base));
    if (out.length >= 14) break;
  }
  for (const m of root.toString().matchAll(/background(?:-image)?\s*:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) {
    push(abs(m[1].replace(/&quot;/g, ""), base));
    if (out.length >= 18) break;
  }
  return out.slice(0, 10);
}

function jsonLd(root: HTMLElement, base: URL) {
  let name: string | null = null;
  let logo: string | null = null;
  for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(s.text);
      const items: unknown[] = Array.isArray(data) ? data : data["@graph"] ?? [data];
      for (const it of items as Record<string, unknown>[]) {
        const t = String(it["@type"] ?? "");
        if (!/Organization|RealEstateAgent|LocalBusiness|Corporation|WebSite/i.test(t)) continue;
        if (!name && typeof it.name === "string") name = it.name;
        const l = it.logo as string | { url?: string } | undefined;
        const lu = typeof l === "string" ? l : l?.url;
        if (!logo && lu) logo = abs(lu, base);
      }
    } catch {
      /* skip */
    }
  }
  return { name, logo };
}

function siteName(root: HTMLElement, ldName: string | null, host: string) {
  const og = root.querySelector('meta[property="og:site_name"]')?.getAttribute("content")?.trim();
  if (og) return og;
  if (ldName) return ldName;
  const app = root.querySelector('meta[name="application-name"]')?.getAttribute("content")?.trim();
  if (app) return app;
  const title = root.querySelector("title")?.text.trim() ?? "";
  const parts = title.split(/\s[|\-–—·:]\s/).map((s) => s.trim()).filter(Boolean);
  if (parts.length > 1) return parts.sort((a, b) => a.length - b.length)[0];
  return title || host;
}

// ---------- the vision pass ----------

type Vision = {
  vibe?: string[];
  tone?: string;
  photoStyle?: string;
  grade?: Partial<Grade>;
  primary?: string;
  accent?: string;
  background?: string;
  ink?: string;
  headingKind?: FontKind;
  name?: string;
};

const VISION_MODEL = process.env.BRAND_VISION_MODEL || "google/gemini-2.5-flash";

async function lookAt(images: string[], facts: string): Promise<Vision | null> {
  const prompt = `You are a brand designer preparing a property-video template for a real-estate company.
Look at the images from the company's website and at the facts below. Return ONLY a JSON object with:
{
 "name": brand name as written on the site,
 "vibe": 3 to 5 short Hebrew adjectives for the brand look (e.g. "יוקרתי", "חם", "מינימליסטי"),
 "tone": one Hebrew sentence (max 18 words) describing the brand's visual language and voice,
 "photoStyle": English, max 40 words, how this brand's photography looks so a video model can match it: light, colour grade, styling, mood, lens feel. No brand names, no text, no people,
 "grade": {"warmth": -1..1, "saturation": -1..1, "contrast": -1..1, "brightness": -1..1} (0 = neutral, keep values modest),
 "primary": main brand colour as #rrggbb (prefer one from the candidates),
 "accent": secondary brand colour as #rrggbb,
 "background": the site's main background colour,
 "ink": the site's main text colour,
 "headingKind": "serif" | "sans" | "display"
}

Facts:
${facts}`;
  const run = async (urls: string[]) => {
    const res = await fal().subscribe("openrouter/router/vision", {
      input: { prompt, image_urls: urls, model: VISION_MODEL, temperature: 0.3, max_tokens: 900 } as never,
    });
    const out = String((res.data as { output?: string })?.output ?? "");
    const json = out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1);
    return JSON.parse(json) as Vision;
  };
  try {
    return await run(images.slice(0, 4));
  } catch {
    // an image the model could not open fails the whole call; try with fewer
    try {
      return await run(images.slice(0, 1));
    } catch {
      return null;
    }
  }
}

const clamp1 = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);

// ---------- public ----------

export function normalizeUrl(input: string) {
  let v = input.trim();
  if (!v) throw new BrandError("חסרה כתובת");
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    return new URL(v);
  } catch {
    throw new BrandError("הכתובת לא תקינה");
  }
}

export async function extractBrand(input: string): Promise<{ brand: Brand; logo: string | null }> {
  const start = normalizeUrl(input);
  const page = await safeFetch(start, 1_800_000).catch((e) => {
    throw e instanceof BrandError ? e : new BrandError("לא הצלחנו לפתוח את האתר");
  });
  if (!/html/i.test(page.type) && !/<html/i.test(text(page.body.subarray(0, 400)))) throw new BrandError("הכתובת לא מובילה לעמוד אינטרנט");
  const html = text(page.body);
  const base = page.url;
  const root = parse(html, { comment: false, blockTextElements: { script: true, style: true, noscript: false, pre: false } });

  // stylesheets: inline plus up to four linked files
  let css = root.querySelectorAll("style").map((s) => s.text).join("\n");
  const sheetLinks = root
    .querySelectorAll('link[rel~="stylesheet"], link[as="style"]')
    .map((l) => abs(l.getAttribute("href"), base))
    .filter((u): u is string => Boolean(u));
  const google = googleFamilies(sheetLinks.concat(root.querySelectorAll('link[href*="fonts.googleapis.com"]').map((l) => l.getAttribute("href") ?? "")));
  const ownSheets = sheetLinks.filter((u) => !u.includes("fonts.googleapis.com")).slice(0, 5);
  const sheets = await Promise.all(ownSheets.map((u) => safeFetch(u, 700_000, 6000).then((r) => text(r.body)).catch(() => "")));
  css += "\n" + sheets.join("\n");
  for (const m of css.matchAll(/@import\s+url\(\s*['"]?([^'")]+)/gi)) google.push(...googleFamilies([m[1]]));

  const themeRaw = root.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? "";
  const theme = normColor(themeRaw);
  const colors = rankColors(css, html, theme && hsl(theme).s > 0.15 ? theme : null);
  const fonts = rankFonts(css, google);
  const ld = jsonLd(root, base);
  const host = base.hostname.replace(/^www\./, "");
  const name = siteName(root, ld.name, host);
  const description =
    root.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ||
    root.querySelector('meta[property="og:description"]')?.getAttribute("content")?.trim() ||
    undefined;
  const images = findImages(root, base);
  const logoRef = findLogo(root, base, ld.logo);

  const facts = [
    `Site: ${base.origin}`,
    `Name: ${name}`,
    description ? `Description: ${description.slice(0, 300)}` : "",
    `Colour candidates (most used first): ${[...colors.palette, ...colors.all].slice(0, 14).join(", ") || "none found"}`,
    `Fonts: ${fonts.ranked.join(", ") || "unknown"}`,
    `Headline text: ${root.querySelectorAll("h1, h2").slice(0, 4).map((h) => h.text.trim().replace(/\s+/g, " ").slice(0, 80)).join(" / ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  const [vision, logo] = await Promise.all([
    images.length ? lookAt(images, facts) : lookAt([], facts),
    logoRef ? fetchLogo(logoRef) : Promise.resolve(null),
  ]);

  const pick = (v: unknown, fallback: string) => (typeof v === "string" && HEX.test(v.trim()) ? v.trim().toLowerCase() : fallback);
  const primary = pick(vision?.primary, colors.palette[0] ?? colors.ink);
  const accent = pick(vision?.accent, colors.palette.find((c) => c !== primary) ?? primary);
  const background = pick(vision?.background, colors.background);
  const ink = pick(vision?.ink, contrast(colors.ink, background) > 4 ? colors.ink : "#1b1b1f");
  const grade: Grade = vision?.grade
    ? {
        warmth: clamp1(vision.grade.warmth),
        saturation: clamp1(vision.grade.saturation),
        contrast: clamp1(vision.grade.contrast),
        brightness: clamp1(vision.grade.brightness),
      }
    : NO_GRADE;
  const kind: FontKind =
    vision?.headingKind === "serif" || vision?.headingKind === "display" || vision?.headingKind === "sans" ? vision.headingKind : kindOf(fonts.heading);

  const palette = [primary, accent, ...colors.palette].filter((c, i, a) => a.indexOf(c) === i).slice(0, 6);
  const brand: Brand = {
    url: base.origin,
    host,
    name: (typeof vision?.name === "string" && vision.name.trim()) || name,
    description: description?.slice(0, 240),
    colors: { primary, accent, background, ink, palette },
    fonts: { heading: fonts.heading, body: fonts.body, headingKind: kind },
    vibe: Array.isArray(vision?.vibe) ? vision!.vibe.filter((v) => typeof v === "string").slice(0, 5) : [],
    tone: typeof vision?.tone === "string" ? vision.tone.slice(0, 200) : undefined,
    photoStyle: typeof vision?.photoStyle === "string" ? vision.photoStyle.replace(/\s+/g, " ").slice(0, 320) : undefined,
    grade,
    images: images.slice(0, 6),
    applyPrompt: true,
    applyGrade: true,
  };
  return { brand, logo };
}

async function fetchLogo(ref: { url?: string; svg?: string }): Promise<string | null> {
  if (ref.svg) return `data:image/svg+xml;base64,${Buffer.from(ref.svg).toString("base64")}`;
  if (!ref.url) return null;
  try {
    const got = await safeFetch(ref.url, 900_000, 6000);
    let type = got.type.split(";")[0].trim();
    if (!type.startsWith("image/")) {
      const head = text(got.body.subarray(0, 200));
      if (/<svg/i.test(head)) type = "image/svg+xml";
      else return null;
    }
    if (got.body.length >= 900_000) return null;
    return `data:${type};base64,${Buffer.from(got.body).toString("base64")}`;
  } catch {
    return null;
  }
}
