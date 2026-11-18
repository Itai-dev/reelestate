import { access } from "@/lib/access";
import { askJson } from "@/lib/llm";
import { errorMessage, mode } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Body = {
  info: { name?: string; location?: string; price?: string; cta?: string };
  brand?: { name?: string; tone?: string; vibe?: string[] } | null;
  rooms: string[];
  style: "bold" | "calm";
};

const SYSTEM = `You write on-screen copy for short Hebrew real-estate reels (Instagram/TikTok ads).
Rules: Hebrew only (Latin only for names already given in Latin). Short, concrete, benefit-first. No emojis, no hashtags, no exclamation marks, no invented facts (no sizes, prices or features that were not given; describe only what the room type implies, e.g. light, space, view if the room is a view/balcony).
Return ONLY JSON: {"hook": "...", "captions": ["...", ...], "cta": "..."}
- hook: the first thing seen, max 6 words, makes a buyer stop scrolling, uses location or project if given.
- captions: exactly one per room, in order, max 4 words each, a benefit of that space (not just the room name).
- cta: max 4 words, an action (e.g. "לתיאום סיור בנכס").`;

export async function POST(req: Request) {
  const gate = await access(req);
  if (gate instanceof Response) return gate;
  if (mode() === "demo") return Response.json({ error: "חסר FAL_KEY" }, { status: 400 });
  const b = (await req.json().catch(() => null)) as Body | null;
  if (!b || !Array.isArray(b.rooms) || b.rooms.length > 30) return Response.json({ error: "בקשה חסרה" }, { status: 400 });
  const prompt = [
    `Project: ${b.info.name || "-"}`,
    `Location: ${b.info.location || "-"}`,
    `Price line: ${b.info.price || "-"}`,
    `Brand: ${b.brand?.name || "-"}; tone: ${b.brand?.tone || "-"}; vibe: ${(b.brand?.vibe ?? []).join(", ") || "-"}`,
    `Style: ${b.style === "calm" ? "quiet luxury, understated" : "performance ad, punchy"}`,
    `Rooms in order: ${b.rooms.map((r, i) => `${i + 1}. ${r}`).join("; ")}`,
  ].join("\n");
  try {
    const r = await askJson<{ hook?: string; captions?: string[]; cta?: string }>(SYSTEM, prompt);
    const caps = Array.isArray(r.captions) ? r.captions.map((c) => String(c).slice(0, 60)) : [];
    return Response.json({
      hook: String(r.hook ?? "").slice(0, 80),
      captions: b.rooms.map((_, i) => caps[i] ?? ""),
      cta: String(r.cta ?? "").slice(0, 60),
    });
  } catch (e) {
    console.error("script", e);
    return Response.json({ error: "לא הצלחנו לכתוב טקסטים. נסו שוב.", detail: errorMessage(e) }, { status: 502 });
  }
}
