import { access } from "@/lib/access";
import { errorMessage, fal, isFalMediaUrl, mode } from "@/lib/server";
import { ROOMS } from "@/lib/presets";
import { LAYOUT_RULES, LAYOUT_SHAPE, checkLayout, type Layout } from "@/lib/layout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = process.env.BRAND_VISION_MODEL || "google/gemini-2.5-flash";

// Reads a floor plan and reference images and proposes the spaces to render.
export async function POST(req: Request) {
  const gate = await access(req);
  if (gate instanceof Response) return gate;
  if (mode() === "mock") return Response.json(MOCK);
  if (mode() === "demo") return Response.json({ error: "חסר FAL_KEY" }, { status: 400 });
  const b = (await req.json().catch(() => null)) as { plan?: unknown; refs?: unknown; brief?: unknown } | null;
  const plan = isFalMediaUrl(b?.plan) ? (b!.plan as string) : null;
  const refs = Array.isArray(b?.refs) ? b!.refs.filter(isFalMediaUrl).slice(0, 5) : [];
  const brief = typeof b?.brief === "string" ? b.brief.slice(0, 1200) : "";
  if (!plan && !refs.length && !brief) return Response.json({ error: "צריך תוכנית, רפרנס או תיאור" }, { status: 400 });

  const ids = ROOMS.map((r) => r.id).join(", ");
  const prompt = `You plan photoreal marketing renders for a residential real-estate project that has no photos yet.
${plan ? "The FIRST image is the floor plan." : "There is no floor plan."} ${refs.length ? `The ${plan ? "other" : ""} images are style references (mood, materials, existing renders).` : ""}
Brief from the developer (Hebrew or English): ${brief || "-"}

Return ONLY JSON:
{
 "style": "English, max 60 words: the shared interior/exterior style for all renders (materials, palette, light, furniture style), taken from the references and brief",
 "spaces": [ {"room": one of [${ids}], "title": "short Hebrew name, e.g. סלון עם יציאה למרפסת", "scene": "English, max 50 words: what this render shows, camera position and view direction, key features from the plan (windows, openings, balcony, island), realistic furniture"} ]
}
Propose 4 to 8 spaces in the order of a home tour (exterior first if relevant). Only spaces that exist in the plan or brief.

Add one more field to the JSON, "layout": the apartment as rectangles a 3D model can be built from, ${plan ? "measured from the floor plan (keep its proportions, room positions, doors and windows; estimate metres from typical door and bed sizes when no scale is drawn)" : "designed from the brief"}.
${LAYOUT_RULES}
"layout": ${LAYOUT_SHAPE}`;

  try {
    type Answer = { style?: string; spaces?: { room?: string; title?: string; scene?: string }[]; layout?: unknown };
    const ask = async (text: string) => {
      const res = await fal().subscribe("openrouter/router/vision", {
        input: { prompt: text, image_urls: [plan, ...refs].filter(Boolean), model: MODEL, temperature: 0.4, max_tokens: 3500 } as never,
      });
      const out = String((res.data as { output?: string })?.output ?? "");
      return JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)) as Answer;
    };
    const j = await ask(prompt);
    // The layout is checked, and the model gets one chance to fix what is wrong with
    // it. Without a layout that can be built, the renders are made without a 3D model.
    let { layout, problems } = checkLayout(j.layout);
    if (!layout && j.layout) {
      const again = await ask(`${prompt}\n\nYour previous layout was:\n${JSON.stringify(j.layout)}\n\nIt has these geometric problems. Fix all of them and return the full JSON again:\n- ${problems.join("\n- ")}`).catch(() => null);
      if (again) ({ layout, problems } = checkLayout(again.layout));
    }
    const valid = new Set(ROOMS.map((r) => r.id));
    const spaces = (j.spaces ?? [])
      .filter((s) => s && typeof s.scene === "string")
      .slice(0, 10)
      .map((s) => ({ room: valid.has(s.room as never) ? s.room : "other", title: String(s.title ?? "").slice(0, 60), scene: String(s.scene).slice(0, 500) }));
    if (!spaces.length && !layout) return Response.json({ error: "לא הצלחנו לזהות חללים. הוסיפו תיאור קצר ונסו שוב." }, { status: 422 });
    return Response.json({ style: String(j.style ?? "").slice(0, 500), spaces, layout });
  } catch (e) {
    return Response.json({ error: "לא הצלחנו לקרוא את התוכנית. נסו שוב.", detail: errorMessage(e) }, { status: 502 });
  }
}

// For testing the flow without a key: a small apartment by the sea.
const MOCK: { style: string; spaces: { room: string; title: string; scene: string }[]; layout: Layout } = {
  style: "Warm, clean Mediterranean: sand-toned plaster, natural oak floor and joinery, olive-green accents, a travertine island, linen, brass lights, greenery.",
  spaces: [],
  layout: {
    rooms: [
      { id: "living", type: "living", title: "סלון", x: 3.7, y: 4.5, w: 5.5, d: 4.5 },
      { id: "kitchen", type: "kitchen", title: "מטבח", x: 3.7, y: 0, w: 5.5, d: 4.5 },
      { id: "balcony", type: "balcony", title: "מרפסת", x: 3.7, y: 9, w: 5.5, d: 1.8 },
      { id: "master", type: "bedroom", title: "חדר שינה הורים", x: 0, y: 5.8, w: 3.7, d: 4 },
      { id: "kids", type: "kids", title: "חדר ילדים", x: 0, y: 2.8, w: 3.7, d: 3 },
      { id: "bath", type: "bathroom", title: "חדר רחצה", x: 0, y: 0, w: 3.7, d: 2.8 },
    ],
    connections: [{ a: "living", b: "kitchen", open: true }, { a: "living", b: "balcony" }, { a: "living", b: "master" }, { a: "living", b: "kids" }, { a: "kitchen", b: "bath" }],
    windows: [{ room: "master", wall: "W" }, { room: "kids", wall: "W" }, { room: "bath", wall: "W" }, { room: "kitchen", wall: "E" }, { room: "living", wall: "E" }],
  },
};
