import { access } from "@/lib/access";
import { errorMessage, fal, isFalMediaUrl, mode } from "@/lib/server";
import { ROOMS } from "@/lib/presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = process.env.BRAND_VISION_MODEL || "google/gemini-2.5-flash";

// Reads a floor plan and reference images and proposes the spaces to render.
export async function POST(req: Request) {
  const gate = await access(req);
  if (gate instanceof Response) return gate;
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
Propose 4 to 8 spaces in the order of a home tour (exterior first if relevant). Only spaces that exist in the plan or brief.`;

  try {
    const res = await fal().subscribe("openrouter/router/vision", {
      input: { prompt, image_urls: [plan, ...refs].filter(Boolean), model: MODEL, temperature: 0.4, max_tokens: 1500 } as never,
    });
    const out = String((res.data as { output?: string })?.output ?? "");
    const j = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)) as { style?: string; spaces?: { room?: string; title?: string; scene?: string }[] };
    const valid = new Set(ROOMS.map((r) => r.id));
    const spaces = (j.spaces ?? [])
      .filter((s) => s && typeof s.scene === "string")
      .slice(0, 10)
      .map((s) => ({ room: valid.has(s.room as never) ? s.room : "other", title: String(s.title ?? "").slice(0, 60), scene: String(s.scene).slice(0, 500) }));
    if (!spaces.length) return Response.json({ error: "לא הצלחנו לזהות חללים. הוסיפו תיאור קצר ונסו שוב." }, { status: 422 });
    return Response.json({ style: String(j.style ?? "").slice(0, 500), spaces });
  } catch (e) {
    return Response.json({ error: "לא הצלחנו לקרוא את התוכנית. נסו שוב.", detail: errorMessage(e) }, { status: 502 });
  }
}
