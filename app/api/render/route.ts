import { errorMessage, fal, isFalMediaUrl, mode } from "@/lib/server";
import { FINISH_SIZES, RENDERS } from "@/lib/presets";
import { CREDITS_PER_RENDER } from "@/lib/plans";
import { access } from "@/lib/access";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ASPECTS = new Set(["9:16", "4:5", "1:1", "16:9", "3:4", "4:3"]);

// Queues one photoreal interior render. With references (plan, mood images,
// existing renders) it follows their style; without, it works from text only.
export async function POST(req: Request) {
  const gate = await access(req);
  if (gate instanceof Response) return gate;
  const m = mode();
  if (m === "demo") return Response.json({ error: "חסר FAL_KEY" }, { status: 400 });
  const b = (await req.json().catch(() => null)) as { prompt?: unknown; refs?: unknown; aspect?: unknown; base?: unknown } | null;
  const prompt = typeof b?.prompt === "string" ? b.prompt.slice(0, 2500) : "";
  const refs = Array.isArray(b?.refs) ? b!.refs.filter(isFalMediaUrl).slice(0, 8) : [];
  const aspect = typeof b?.aspect === "string" && ASPECTS.has(b.aspect) ? b.aspect : "9:16";
  if (!prompt) return Response.json({ error: "בקשה חסרה" }, { status: 400 });
  // base: a picture of the 3D model of this room. The render keeps what it shows.
  const base = isFalMediaUrl(b?.base) && aspect in FINISH_SIZES ? (b!.base as string) : null;
  const key = base ? "renderFinish" : refs.length ? "render" : "renderText";

  let genId: string | null = null;
  if (gate.user) {
    const { data, error } = await supabaseAdmin().rpc("re_spend_credits" as never, { p_user: gate.user.id, p_amount: CREDITS_PER_RENDER, p_model: key } as never);
    if (error) {
      if (error.message.includes("insufficient_credits")) return Response.json({ error: "נגמרו הקרדיטים", code: "no_credits" }, { status: 402 });
      return Response.json({ error: "לא הצלחנו לחייב קרדיטים" }, { status: 500 });
    }
    genId = data as unknown as string;
  }

  let requestId: string;
  try {
    if (m === "mock") requestId = `mock-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    else {
      const input: Record<string, unknown> = base
        ? { prompt, image_urls: [base, ...refs], image_size: FINISH_SIZES[aspect], output_format: "jpeg", num_images: 1 }
        : { prompt, aspect_ratio: aspect, resolution: "2K", output_format: "jpeg", num_images: 1 };
      if (!base && refs.length) input.image_urls = refs;
      const res = await fal().queue.submit(RENDERS[key].endpoint, { input: input as never });
      requestId = res.request_id;
    }
  } catch (e) {
    const msg = errorMessage(e);
    if (genId) await supabaseAdmin().rpc("re_refund_generation" as never, { p_gen: genId, p_error: msg } as never);
    return Response.json({ error: msg }, { status: 502 });
  }
  if (genId) {
    await supabaseAdmin().from("re_generations").update({ request_id: requestId, status: "queued", updated_at: new Date().toISOString() } as never).eq("id", genId);
  }
  return Response.json({ requestId, model: key });
}
