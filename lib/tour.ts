// The interactive tour: a 360° view of each space, labels that lead from one
// space to the next, a lighting preview from morning to night, and an optional
// entry from the building's facade. Shared by the studio, the server and the
// public tour page.
import { roomById, type RoomId } from "./presets";

export type TourLight = "morning" | "day" | "sunset" | "night";

// Order of the lighting slider. "day" is the panorama made from the photo; the
// others are relit copies of it, so the room never changes between them.
export const TOUR_LIGHT_ORDER: TourLight[] = ["morning", "day", "sunset", "night"];

export const TOUR_LIGHTS: Record<TourLight, { he: string; en: string }> = {
  morning: {
    he: "בוקר",
    en: "early morning: soft, cool, low-angle sunlight, a pale clear sky, long gentle shadows, interior lights off",
  },
  day: { he: "יום", en: "bright, neutral midday daylight" },
  sunset: {
    he: "שקיעה",
    en: "sunset: warm low golden sun, an orange and pink sky, long warm shadows, a few interior lamps softly on",
  },
  night: {
    he: "לילה",
    en: "night: a dark blue sky, lights of the surroundings outside, warm interior lighting switched on, soft reflections in the glass",
  },
};

export const isTourLight = (v: unknown): v is TourLight => typeof v === "string" && v in TOUR_LIGHTS;

// waiting: will start by itself once what it depends on is ready.
export type TourAssetStatus = "waiting" | "preparing" | "queued" | "done" | "error";

export type TourAsset = {
  status: TourAssetStatus;
  requestId?: string;
  model?: string;
  v?: string; // changes whenever the file is made again
  error?: string;
};

// A label inside a panorama. yaw and pitch are in radians; yaw 0 is the centre
// of the image, which is the direction the original photo was taken in.
export type TourLink = { to: string; yaw: number; pitch: number };

export type TourSpace = {
  id: string; // the photo it was made from
  room: RoomId;
  title: string;
  yaw: number; // where a visitor looks first
  panos: Partial<Record<TourLight, TourAsset>>;
  links: TourLink[];
};

export type TourEntry = {
  shot: string; // the facade photo
  fx: number; // the photo's focus point when the 16:9 overview was cut from it
  fy: number;
  x: number; // the apartment on the overview, 0..1
  y: number;
  closeup?: TourAsset;
  video?: TourAsset;
};

export type Tour = {
  spaces: TourSpace[];
  entry?: TourEntry;
  published?: boolean;
};

// ---------- files ----------
// Every file of a tour has a key. The browser keeps it under `tour:<key>` and the
// account under `<user>/<project>/tour-<key>`.

export const panoKey = (space: string, light: TourLight) => `pano:${space}:${light}`;
export const OVERVIEW = "overview";
export const CLOSEUP = "closeup";
export const APPROACH = "video";

export const localKey = (key: string) => `tour:${key}`;
export const cloudName = (key: string) => `tour-${key.replace(/[^a-z0-9]+/gi, "-")}`;

export function assetOf(t: Tour, key: string): TourAsset | undefined {
  if (key === CLOSEUP) return t.entry?.closeup;
  if (key === APPROACH) return t.entry?.video;
  const [, space, light] = key.split(":");
  return t.spaces.find((s) => s.id === space)?.panos[light as TourLight];
}

export function withAsset(t: Tour, key: string, patch: Partial<TourAsset>): Tour {
  const cur = assetOf(t, key);
  if (!cur) return t;
  const next = { ...cur, ...patch };
  if (key === CLOSEUP) return { ...t, entry: { ...t.entry!, closeup: next } };
  if (key === APPROACH) return { ...t, entry: { ...t.entry!, video: next } };
  const [, space, light] = key.split(":");
  return { ...t, spaces: t.spaces.map((s) => (s.id === space ? { ...s, panos: { ...s.panos, [light]: next } } : s)) };
}

export function assets(t: Tour): { key: string; asset: TourAsset }[] {
  const out: { key: string; asset: TourAsset }[] = [];
  for (const s of t.spaces)
    for (const l of TOUR_LIGHT_ORDER) {
      const a = s.panos[l];
      if (a) out.push({ key: panoKey(s.id, l), asset: a });
    }
  if (t.entry?.closeup) out.push({ key: CLOSEUP, asset: t.entry.closeup });
  if (t.entry?.video) out.push({ key: APPROACH, asset: t.entry.video });
  return out;
}

// The finished files, each with its version (for saving to the account).
export function tourFiles(t: Tour): { key: string; v: string }[] {
  const out = assets(t)
    .filter((x) => x.asset.status === "done")
    .map((x) => ({ key: x.key, v: x.asset.v ?? "1" }));
  if (t.entry) out.push({ key: OVERVIEW, v: `${t.entry.shot}:${t.entry.fx}:${t.entry.fy}` });
  return out;
}

// Every key a tour may have used, for clearing the browser copy.
export function tourKeys(t: Tour): string[] {
  return [...t.spaces.flatMap((s) => TOUR_LIGHT_ORDER.map((l) => panoKey(s.id, l))), OVERVIEW, CLOSEUP, APPROACH];
}

// The same overview with the apartment marked in the same place: what was made
// for the entry (the close view and the camera approach) still fits.
export const sameEntry = (a: Pick<TourEntry, "shot" | "fx" | "fy" | "x" | "y">, b: Pick<TourEntry, "shot" | "fx" | "fy" | "x" | "y">) =>
  a.shot === b.shot && a.fx === b.fx && a.fy === b.fy && Math.abs(a.x - b.x) < 0.005 && Math.abs(a.y - b.y) < 0.005;

export const isBusy = (a?: TourAsset) => a?.status === "waiting" || a?.status === "preparing" || a?.status === "queued";

// ---------- labels ----------
// By default every space leads to the next one (a little to the right of where
// the visitor looks first) and back to the previous one (behind them). The
// positions can be dragged in the studio.
const NEXT = { yaw: 0.55, pitch: 0.02 };
const PREV = { yaw: 2.6, pitch: 0.02 };

export function chainLinks(spaces: TourSpace[]): TourSpace[] {
  return spaces.map((s, i) => {
    const want: TourLink[] = [];
    if (spaces[i + 1]) want.push({ to: spaces[i + 1].id, ...NEXT });
    if (spaces[i - 1]) want.push({ to: spaces[i - 1].id, ...PREV });
    return { ...s, links: want.map((w) => s.links.find((l) => l.to === w.to) ?? w) };
  });
}

// ---------- what the viewer needs ----------

export type ViewSpace = {
  id: string;
  title: string;
  yaw: number;
  links: TourLink[];
  panos: Partial<Record<TourLight, string>>; // image addresses
};

export type ViewEntry = { overview: string; x: number; y: number; video?: string };

// Only spaces whose daylight panorama exists are shown, and only labels that
// lead to such a space.
export function viewOf(t: Tour, url: (key: string) => string | undefined): { spaces: ViewSpace[]; entry?: ViewEntry } {
  const spaces: ViewSpace[] = [];
  for (const s of t.spaces) {
    const panos: ViewSpace["panos"] = {};
    for (const l of TOUR_LIGHT_ORDER) {
      const u = s.panos[l]?.status === "done" ? url(panoKey(s.id, l)) : undefined;
      if (u) panos[l] = u;
    }
    if (panos.day) spaces.push({ id: s.id, title: s.title, yaw: s.yaw, links: s.links, panos });
  }
  const ids = new Set(spaces.map((s) => s.id));
  for (const s of spaces) s.links = s.links.filter((l) => ids.has(l.to));
  let entry: ViewEntry | undefined;
  const overview = t.entry ? url(OVERVIEW) : undefined;
  if (t.entry && overview && spaces.length) {
    const video = t.entry.video?.status === "done" ? url(APPROACH) : undefined;
    entry = { overview, x: t.entry.x, y: t.entry.y, video };
  }
  return { spaces, entry };
}

// ---------- prompts ----------

export function panoPrompt(room: RoomId, style?: string) {
  return [
    `Create a seamless 360° equirectangular panorama of ${roomById(room).en}, 2:1 aspect ratio, suitable for rendering inside a panoramic viewer.`,
    "The supplied photograph is the view straight ahead and belongs at the centre of the panorama: preserve its architecture, materials, furniture, windows, openings and the outlook outside exactly as they are.",
    "Continue the same space plausibly to the left, to the right and behind the camera, in the same style, materials and lighting. The camera stands at eye level in the middle of the space; the horizon runs level through the middle of the image.",
    "Keep vertical structures straight and plausible. The left and right edges must join into one continuous image with no visible seam. No duplicate furniture, no repeated windows, no people, no text, no watermark, no interface elements.",
    "Photorealistic architectural photography, bright natural daylight.",
    style ? `Visual style: ${style}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function lightPrompt(light: TourLight) {
  return [
    `Use this 360° panorama as the reference and relight it for ${TOUR_LIGHTS[light].en}.`,
    "Preserve the exact camera position, the equirectangular projection, the room geometry, the furniture, the window divisions and the placement of every object.",
    "Change only the light, the sky, the reflections and the appropriate interior illumination. Keep the 2:1 panorama format and the seamless left and right edges. No people, no text.",
  ].join(" ");
}

export const CLOSEUP_PROMPT = [
  "Re-create this exact photograph as a sharp, high-resolution close architectural photograph of the building.",
  "Keep the framing, the camera angle and the composition identical. Preserve the building's geometry, balcony shapes, window divisions, facade materials, colours and surroundings exactly; add only fine realistic detail.",
  "Photorealistic, refined natural daylight. No added people, no text, no logos, no interface elements.",
].join(" ");

export const APPROACH_PROMPT = [
  "The first frame is an overview of a residential building and the last frame is a close view of one apartment in it.",
  "One continuous, smooth and steady aerial camera approach from the overview toward that apartment, ending exactly on the last frame.",
  "Preserve the building, its facade and its surroundings throughout. No cuts, no new architecture, no wobble, no sideways drift, no people, no text.",
].join(" ");

// How far the approach ends from where it starts: the close view shows 1/ZOOM of the overview.
export const CLOSEUP_ZOOM = 2.2;

export const OVERVIEW_SIZE = { w: 1920, h: 1080 };
