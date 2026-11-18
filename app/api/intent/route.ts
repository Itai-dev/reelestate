import { access } from "@/lib/access";
import { askJson } from "@/lib/llm";
import { errorMessage, mode } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Turns one free sentence ("make the kitchen sunset and change the price to 4.8M")
// into concrete actions the studio can run.
const SYSTEM = `You control a Hebrew real-estate reel editor. The user writes or dictates one request (usually Hebrew).
Return ONLY JSON: {"actions": [...], "reply": "short Hebrew confirmation of what will be done"}
Action types:
- {"type":"text","field":"hook"|"name"|"location"|"price"|"cta"|"phone"|"website","value":"..."}  set an on-screen text field
- {"type":"caption","shot":<1-based index>,"value":"..."}  set the on-screen line of one space
- {"type":"style","value":"bold"|"calm"}  text style: bold = punchy performance, calm = quiet luxury
- {"type":"labels","value":true|false}  show or hide the space lines
- {"type":"pace","value":"calm"|"brisk"}  slower or faster cuts
- {"type":"clip","shot":<1-based index>,"prompt":"English instruction for a video-to-video editor","label":"2-3 Hebrew words"}  change what is seen in a clip (light, sky, time of day, objects, furniture, clutter, plants, weather). If the user names a room, pick the matching shot; if no room is named and the change is visual, add one clip action per shot.
Rules: never invent prices or facts; keep Hebrew texts short (hook max 6 words, captions max 4 words). Clip prompts must end with "Keep everything else the same." If the request is unclear or impossible, return no actions and ask in "reply".`;

export async function POST(req: Request) {
  const gate = await access(req);
  if (gate instanceof Response) return gate;
  if (mode() === "demo") return Response.json({ error: "חסר FAL_KEY" }, { status: 400 });
  const b = (await req.json().catch(() => null)) as { text?: string; state?: unknown } | null;
  if (!b?.text || b.text.length > 600) return Response.json({ error: "בקשה חסרה" }, { status: 400 });
  try {
    const r = await askJson<{ actions?: unknown[]; reply?: string }>(SYSTEM, `Current reel:\n${JSON.stringify(b.state).slice(0, 4000)}\n\nRequest: ${b.text}`);
    return Response.json({ actions: Array.isArray(r.actions) ? r.actions.slice(0, 20) : [], reply: String(r.reply ?? "").slice(0, 300) });
  } catch (e) {
    console.error("intent", e);
    return Response.json({ error: "לא הצלחתי להבין את הבקשה. נסו לנסח אחרת.", detail: errorMessage(e) }, { status: 502 });
  }
}
