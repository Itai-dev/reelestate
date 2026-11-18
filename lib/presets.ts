// Everything the app knows about real-estate shots: rooms, camera moves,
// light, output formats and AI models. Prompts are built from these.

export type Aspect = "9:16" | "4:5" | "1:1" | "16:9";

export const ASPECTS: Record<Aspect, { w: number; h: number; label: string; hint: string }> = {
  "9:16": { w: 1080, h: 1920, label: "9:16", hint: "רילס וסטורי" },
  "4:5": { w: 1080, h: 1350, label: "4:5", hint: "פיד" },
  "1:1": { w: 1080, h: 1080, label: "1:1", hint: "ריבוע" },
  "16:9": { w: 1920, h: 1080, label: "16:9", hint: "אתר ויוטיוב" },
};

export type MotionId =
  | "push_in"
  | "pull_out"
  | "slide"
  | "orbit"
  | "drone_rise"
  | "tilt_up"
  | "walkthrough";

// Ken Burns parameters are used for the free preview (before AI video exists).
// s = scale, x/y = offset as a fraction of the frame.
export type KB = { s0: number; s1: number; x0: number; x1: number; y0: number; y1: number };

export const MOTIONS: Record<MotionId, { he: string; en: string; kb: KB }> = {
  push_in: {
    he: "דולי פנימה",
    en: "The camera performs a slow, smooth dolly-in, moving steadily forward into the space.",
    kb: { s0: 1.0, s1: 1.16, x0: 0, x1: 0, y0: 0, y1: 0 },
  },
  pull_out: {
    he: "דולי החוצה",
    en: "The camera performs a slow, smooth dolly-out, moving backward to gradually reveal more of the space.",
    kb: { s0: 1.18, s1: 1.0, x0: 0, x1: 0, y0: 0, y1: 0 },
  },
  slide: {
    he: "החלקה לצד",
    en: "The camera glides in a slow lateral tracking move from right to left, with natural parallax between foreground and background.",
    kb: { s0: 1.14, s1: 1.14, x0: 0.05, x1: -0.05, y0: 0, y1: 0 },
  },
  orbit: {
    he: "קשת סביב החלל",
    en: "The camera moves in a slow, gentle arc around the center of the space, revealing depth and parallax.",
    kb: { s0: 1.12, s1: 1.2, x0: -0.04, x1: 0.04, y0: 0, y1: 0 },
  },
  drone_rise: {
    he: "רחפן עולה",
    en: "Aerial drone shot, slowly rising upward while gently pushing toward the building.",
    kb: { s0: 1.12, s1: 1.22, x0: 0, x1: 0, y0: 0.04, y1: -0.04 },
  },
  tilt_up: {
    he: "טילט למעלה",
    en: "The camera slowly tilts up to reveal the ceiling height and the windows.",
    kb: { s0: 1.14, s1: 1.14, x0: 0, x1: 0, y0: 0.05, y1: -0.05 },
  },
  walkthrough: {
    he: "הליכה פנימה",
    en: "Steady first-person gimbal walkthrough, moving forward through the space as if a buyer is walking in.",
    kb: { s0: 1.0, s1: 1.28, x0: 0, x1: 0, y0: 0, y1: 0 },
  },
};

export type RoomId =
  | "exterior"
  | "lobby"
  | "amenities"
  | "living"
  | "kitchen"
  | "dining"
  | "bedroom"
  | "bathroom"
  | "balcony"
  | "view"
  | "other";

// Order here = order of a typical tour (used by "sort by tour").
export const ROOMS: { id: RoomId; he: string; en: string; motion: MotionId }[] = [
  { id: "exterior", he: "חזית", en: "the exterior facade of a residential building", motion: "drone_rise" },
  { id: "lobby", he: "לובי", en: "an elegant residential building lobby", motion: "walkthrough" },
  { id: "amenities", he: "בריכה ומתקנים", en: "the building's amenities and pool area", motion: "orbit" },
  { id: "living", he: "סלון", en: "a living room", motion: "push_in" },
  { id: "kitchen", he: "מטבח", en: "a kitchen", motion: "slide" },
  { id: "dining", he: "פינת אוכל", en: "a dining area", motion: "orbit" },
  { id: "bedroom", he: "חדר שינה", en: "a bedroom", motion: "push_in" },
  { id: "bathroom", he: "חדר רחצה", en: "a bathroom", motion: "slide" },
  { id: "balcony", he: "מרפסת", en: "a balcony terrace", motion: "push_in" },
  { id: "view", he: "נוף", en: "the view from the apartment", motion: "slide" },
  { id: "other", he: "לא צוין", en: "an interior space", motion: "push_in" },
];

export const roomById = (id: RoomId) => ROOMS.find((r) => r.id === id) ?? ROOMS[ROOMS.length - 1];

export type LightId = "day" | "golden" | "dusk";

export const LIGHTS: Record<LightId, { he: string; en: string; sky: [string, string] }> = {
  day: {
    he: "יום",
    en: "Bright natural daylight, true to the original photo.",
    sky: ["#D7E8F4", "#8DB8DE"],
  },
  golden: {
    he: "שעת זהב",
    en: "Warm golden-hour sunlight gradually pours in, casting soft long shadows that slowly drift across the surfaces.",
    sky: ["#F6D08A", "#E07B3F"],
  },
  dusk: {
    he: "דמדומים",
    en: "The light gradually shifts to blue-hour dusk, and warm interior lights softly turn on and glow.",
    sky: ["#7D86C2", "#232B57"],
  },
};

export const LIFE_EN =
  "Subtle signs of life: sheer curtains move gently in a breeze, plants sway slightly.";

export const NEGATIVE_PROMPT =
  "people, person, text, watermark, logo, warped walls, bent straight lines, morphing furniture, new objects, extra rooms, fisheye, shaky camera, blur, flicker, low quality";

export type ShotPromptInput = {
  room: RoomId;
  motion: MotionId;
  light: LightId;
  life: boolean;
};

export function buildPrompt(s: ShotPromptInput): string {
  const room = roomById(s.room);
  return [
    `Photorealistic luxury real-estate video of ${room.en}.`,
    MOTIONS[s.motion].en,
    LIGHTS[s.light].en,
    s.life ? LIFE_EN : "",
    "Cinematic stabilized gimbal movement, slow and smooth, architectural videography, sharp detail, straight vertical lines.",
    "Keep the exact architecture, layout, furniture, materials and colors of the photo. No people, no text, no new objects.",
  ]
    .filter(Boolean)
    .join(" ");
}

export type Family = "seedance" | "wan";
export type Resolution = "720p" | "1080p";
export type ModelKey = "seedance720" | "seedance1080" | "wan720" | "wan1080";

export const FAMILIES: Record<Family, { name: string; note: string }> = {
  seedance: { name: "Seedance 2.5", note: "הכי מציאותי. יקר, ולוקח כמה דקות לקליפ." },
  wan: { name: "Wan 3.0", note: "זול פי 4–5 ומהיר יותר. טוב לטיוטות ולהשוואה." },
};

// Prices are fal.ai list prices for one 5-second clip without audio (Nov 2026).
export const MODELS: Record<
  ModelKey,
  { family: Family; resolution: Resolution; endpoint: string; he: string; name: string; note: string; pricePerClip: number }
> = {
  seedance720: {
    family: "seedance",
    resolution: "720p",
    endpoint: "bytedance/seedance-2.5/image-to-video",
    he: "Seedance 720p",
    name: "Seedance 2.5",
    note: "ברירת המחדל. מספיק לרשתות",
    pricePerClip: 2.37,
  },
  seedance1080: {
    family: "seedance",
    resolution: "1080p",
    endpoint: "bytedance/seedance-2.5/image-to-video",
    he: "Seedance 1080p",
    name: "Seedance 2.5",
    note: "הכי חד, לאתר ולמסכים גדולים",
    pricePerClip: 5.82,
  },
  wan720: {
    family: "wan",
    resolution: "720p",
    endpoint: "alibaba/wan-3.0/image-to-video",
    he: "Wan 720p",
    name: "Wan 3.0",
    note: "זול ומהיר, לטיוטות",
    pricePerClip: 0.5,
  },
  wan1080: {
    family: "wan",
    resolution: "1080p",
    endpoint: "alibaba/wan-3.0/image-to-video",
    he: "Wan 1080p",
    name: "Wan 3.0",
    note: "זול, חד",
    pricePerClip: 1.0,
  },
};

export const modelKeyOf = (family: Family, resolution: Resolution) =>
  `${family}${resolution === "720p" ? "720" : "1080"}` as ModelKey;

export const DEFAULT_MODEL: ModelKey = "wan720";

// What customers choose: a level of quality, never a model name.
export type Quality = "standard" | "hd" | "premium";
export const QUALITIES: Record<Quality, { he: string; note: string; model: ModelKey }> = {
  standard: { he: "רגיל", note: "720p. לרילס, לסטורי ולמודעות. הכי מהיר.", model: "wan720" },
  hd: { he: "HD", note: "1080p. לאתר, ליוטיוב ולמסכים גדולים.", model: "wan1080" },
  premium: { he: "פרימיום", note: "הריאליזם הכי גבוה, לנכסי יוקרה ולשוט הפתיחה. לוקח כמה דקות.", model: "seedance720" },
};
export const qualityOf = (m: ModelKey): Quality =>
  (Object.keys(QUALITIES) as Quality[]).find((q) => QUALITIES[q].model === m) ?? (m.startsWith("seedance") ? "premium" : m.endsWith("1080") ? "hd" : "standard");

// Chat edits of a finished clip (video-to-video). The clip keeps its motion; only what the
// sentence asks for changes.
export type EditKey = "edit720" | "edit1080";
export const EDITS: Record<EditKey, { endpoint: string; resolution: Resolution; name: string; pricePerClip: number }> = {
  edit720: { endpoint: "google/gemini-omni-flash/v1.2/edit", resolution: "720p", name: "Gemini Omni Flash", pricePerClip: 0.45 },
  edit1080: { endpoint: "google/gemini-omni-flash/v1.2/edit", resolution: "1080p", name: "Gemini Omni Flash", pricePerClip: 0.65 },
};

// Added to every edit so the property itself is never misrepresented.
export const EDIT_GUARD =
  "Keep the architecture, walls, floors, windows, the view outside, the room size and the camera motion exactly as they are.";

export const CLIP_SECONDS = 5;

export type Pace = "calm" | "brisk";
export const PACES: Record<Pace, { he: string; seconds: number }> = {
  calm: { he: "רגוע", seconds: 4.6 },
  brisk: { he: "דינמי", seconds: 3 },
};

// Interior renders for projects that have no photos yet (from a plan and references).
export type RenderKey = "render" | "renderText";
export const RENDERS: Record<RenderKey, { endpoint: string; pricePerImage: number }> = {
  render: { endpoint: "fal-ai/nano-banana-pro/edit", pricePerImage: 0.15 },
  renderText: { endpoint: "fal-ai/nano-banana-pro", pricePerImage: 0.15 },
};
