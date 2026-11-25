// The layout of an apartment as the 3D builder needs it: rooms as rectangles in
// metres, which rooms connect, and where the windows are. Read from a floor plan
// or written from a description by the language model, then checked here, since
// a model's geometry cannot be trusted as it comes.
import type { RoomId } from "./presets";

export type LayoutRoomType = "living" | "kitchen" | "bedroom" | "kids" | "bathroom" | "hall" | "balcony";
export const LAYOUT_TYPES: LayoutRoomType[] = ["living", "kitchen", "bedroom", "kids", "bathroom", "hall", "balcony"];

// x: west edge, y: south edge, w: east-west size, d: north-south size. North is +y.
export type LayoutRoom = { id: string; type: LayoutRoomType; title: string; x: number; y: number; w: number; d: number };
export type Wall = "N" | "S" | "E" | "W";
export type Layout = {
  rooms: LayoutRoom[];
  connections: { a: string; b: string; open?: boolean }[];
  windows: { room: string; wall: Wall }[];
};

export const roomIdOf = (t: LayoutRoomType): RoomId => (t === "kids" ? "bedroom" : t === "hall" ? "other" : t);

const TOUCH = 0.06;

// Length of the wall two rooms share.
export function sharedWall(a: LayoutRoom, b: LayoutRoom): number {
  if (Math.abs(a.x + a.w - b.x) < TOUCH || Math.abs(b.x + b.w - a.x) < TOUCH) return Math.max(0, Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y));
  if (Math.abs(a.y + a.d - b.y) < TOUCH || Math.abs(b.y + b.d - a.y) < TOUCH) return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  return 0;
}

function reached(l: Layout): Set<string> {
  const seen = new Set(l.rooms.length ? [l.rooms[0].id] : []);
  for (let grew = true; grew; ) {
    grew = false;
    for (const c of l.connections) {
      if (seen.has(c.a) !== seen.has(c.b)) {
        seen.add(c.a).add(c.b);
        grew = true;
      }
    }
  }
  return seen;
}

// Reads whatever the model returned into a Layout: unknown fields dropped, numbers
// on a 10 cm grid. null when it is not a layout at all.
export function parseLayout(raw: unknown): Layout | null {
  const o = raw as { rooms?: unknown; connections?: unknown; windows?: unknown } | null;
  if (!o || !Array.isArray(o.rooms)) return null;
  const grid = (v: unknown) => Math.round(Number(v) * 10) / 10;
  const rooms: LayoutRoom[] = [];
  for (const r of o.rooms.slice(0, 12) as Record<string, unknown>[]) {
    const room = { id: String(r?.id ?? "").slice(0, 40), type: r?.type as LayoutRoomType, title: String(r?.title ?? "").slice(0, 40), x: grid(r?.x), y: grid(r?.y), w: grid(r?.w), d: grid(r?.d) };
    if (!room.id || rooms.some((x) => x.id === room.id) || !LAYOUT_TYPES.includes(room.type)) continue;
    if (![room.x, room.y, room.w, room.d].every(Number.isFinite)) continue;
    rooms.push(room);
  }
  const ids = new Set(rooms.map((r) => r.id));
  const connections = (Array.isArray(o.connections) ? (o.connections as Record<string, unknown>[]) : [])
    .map((c) => ({ a: String(c?.a), b: String(c?.b), ...(c?.open === true ? { open: true } : {}) }))
    .filter((c) => c.a !== c.b && ids.has(c.a) && ids.has(c.b));
  const windows = (Array.isArray(o.windows) ? (o.windows as Record<string, unknown>[]) : [])
    .map((w) => ({ room: String(w?.room), wall: String(w?.wall) as Wall }))
    .filter((w) => ids.has(w.room) && "NSEW".includes(w.wall) && w.wall.length === 1);
  return { rooms, connections, windows };
}

// What is wrong with a layout, in words the model can act on. Empty when it can be built.
export function layoutProblems(l: Layout): string[] {
  const errs: string[] = [];
  if (l.rooms.length < 2) errs.push("fewer than 2 rooms");
  for (const r of l.rooms) {
    if (r.w < 1.2 || r.d < 1.2) errs.push(`room ${r.id} is narrower than 1.2 m`);
    if (r.w > 15 || r.d > 15) errs.push(`room ${r.id} is larger than 15 m`);
  }
  l.rooms.forEach((a, i) => {
    for (const b of l.rooms.slice(i + 1)) {
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y);
      if (ox > 0.05 && oy > 0.05) errs.push(`rooms ${a.id} and ${b.id} overlap by ${ox.toFixed(1)} x ${oy.toFixed(1)} m`);
    }
  });
  const byId = new Map(l.rooms.map((r) => [r.id, r]));
  for (const c of l.connections) {
    if (sharedWall(byId.get(c.a)!, byId.get(c.b)!) < 1) errs.push(`rooms ${c.a} and ${c.b} are connected but share less than 1 m of wall`);
  }
  const seen = reached(l);
  for (const r of l.rooms) if (!seen.has(r.id)) errs.push(`room ${r.id} cannot be reached from ${l.rooms[0].id}`);
  return errs;
}

// Doors the model placed where two rooms barely touch are dropped, and a room left
// without a door gets one to a neighbour it really shares a wall with.
export function repairLayout(l: Layout): Layout {
  const byId = new Map(l.rooms.map((r) => [r.id, r]));
  const out: Layout = { ...l, connections: l.connections.filter((c) => sharedWall(byId.get(c.a)!, byId.get(c.b)!) >= 0.9) };
  const prefer: Partial<Record<LayoutRoomType, number>> = { hall: 3, living: 2, kitchen: 1 };
  for (;;) {
    const seen = reached(out);
    const lost = out.rooms.filter((r) => !seen.has(r.id));
    if (!lost.length) return out;
    let best: { score: number; a: string; b: string } | null = null;
    for (const r of lost)
      for (const s of out.rooms) {
        if (!seen.has(s.id)) continue;
        const len = sharedWall(r, s);
        if (len < 0.9) continue;
        const score = (prefer[s.type] ?? 0) * 100 + len;
        if (!best || score > best.score) best = { score, a: s.id, b: r.id };
      }
    if (!best) return out;
    out.connections = [...out.connections, { a: best.a, b: best.b }];
  }
}

// The layout if it can be built (after the repair), otherwise what to tell the model.
export function checkLayout(raw: unknown): { layout: Layout | null; problems: string[] } {
  const parsed = parseLayout(raw);
  if (!parsed) return { layout: null, problems: ["no layout was returned"] };
  const hard = layoutProblems(parsed).filter((e) => /overlap|narrower|larger|fewer/.test(e));
  const fixed = hard.length ? parsed : repairLayout(parsed);
  const problems = layoutProblems(fixed);
  return { layout: problems.length ? null : fixed, problems };
}

export const LAYOUT_RULES = `Layout rules:
- Every room is an axis-aligned rectangle in metres: x (west edge), y (south edge), w (east-west size), d (north-south size). North is +y. Put the main view and the balcony to the north.
- Rooms must not overlap. Rooms that connect must share a wall segment at least 1.2 m long. Neighbouring rooms touch exactly (same coordinate), with no gaps. Use a 0.1 m grid.
- An open kitchen is its own rectangle next to the living room, with "open": true on that connection.
- Room types allowed: ${LAYOUT_TYPES.join(", ")}. One "hall" may connect the bedrooms and the bathroom to the living room. A room with no door is not allowed.
- Windows only on walls that face outside. "wall" is N, S, E or W. A room that opens to the balcony connects to it (a glass door) and needs no window on that wall.
- "id" is a short unique English identifier; "title" is the room's short Hebrew name.`;

export const LAYOUT_SHAPE = `{"rooms": [{"id": "living", "type": "living", "title": "סלון", "x": 0, "y": 0, "w": 5.5, "d": 4.5}], "connections": [{"a": "living", "b": "kitchen", "open": true}], "windows": [{"room": "bedroom", "wall": "E"}]}`;

// For a photograph rendered from the 3D model: the model keeps the room exactly as
// rendered and only makes it look like a photograph. guided: a second image shows
// the same apartment already finished, and sets the look.
export function stillFinishPrompt(o: { style?: string; guided?: boolean; refs?: number; notes?: string }) {
  return [
    "The first image is a simple 3D render of a room in an apartment. Re-create it as a photorealistic interior photograph for a real-estate advertisement.",
    "Keep the framing, the camera angle and the composition identical. Preserve exactly the geometry of the room, every wall, window, door and opening, and the position, size, shape and colour of every piece of furniture and object.",
    "Upgrade only the look: realistic materials and textures true to what each surface already is, soft natural daylight with believable shadows and reflections, fine construction details, and a few tasteful styling accessories on the existing surfaces. Outside the windows, turn the simple placeholder shapes into the real buildings, landscape, sea and sky they stand for.",
    "Do not add, remove or move furniture, walls, windows or doors. Empty floor stays empty. No people, no text, no watermark.",
    o.guided ? "The second image shows another room of the same apartment, already finished: match its materials, colours, fabrics, wood tones and styling exactly wherever the same kinds of surfaces appear." : "",
    o.refs ? `The last ${o.refs === 1 ? "image is a style reference" : `${o.refs} images are style references`}: take materials, palette and mood from ${o.refs === 1 ? "it" : "them"}, never geometry or furniture.` : "",
    o.style ? `Visual style: ${o.style}` : "",
    o.notes ? `Developer's notes: ${o.notes}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
