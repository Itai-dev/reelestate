import { errorMessage, fal, isFalMediaUrl, isModelKey, mode, modelInput } from "@/lib/server";
import { MODELS } from "@/lib/presets";
import { CREDITS_PER_CLIP } from "@/lib/plans";
import { access } from "@/lib/access";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Charges credits, then queues one image-to-video job. Credits come back if queuing fails.
// With endImageUrl the clip ends on that frame (the tour's camera approach).
export async function POST(req: Request) {
  const gate = await access(req);
  if (gate instanceof Response) return gate;
  const m = mode();
  if (m === "demo") return Response.json({ error: "חסר FAL_KEY" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as { model?: unknown; imageUrl?: unknown; endImageUrl?: unknown; prompt?: unknown } | null;
  const model = body?.model;
  const imageUrl = body?.imageUrl;
  const prompt = typeof body?.prompt === "string" ? body.prompt.slice(0, 2000) : "";
  if (!isModelKey(model) || typeof imageUrl !== "string" || !prompt) {
    return Response.json({ error: "בקשה חסרה" }, { status: 400 });
  }
  let endImageUrl: string | undefined;
  if (body?.endImageUrl != null) {
    if (m !== "mock" && !isFalMediaUrl(body.endImageUrl)) return Response.json({ error: "בקשה חסרה" }, { status: 400 });
    endImageUrl = String(body.endImageUrl);
  }

  let genId: string | null = null;
  if (gate.user) {
    const { data, error } = await supabaseAdmin().rpc("re_spend_credits" as never, {
      p_user: gate.user.id,
      p_amount: CREDITS_PER_CLIP[model],
      p_model: model,
    } as never);
    if (error) {
      if (error.message.includes("insufficient_credits"))
        return Response.json({ error: "נגמרו הקרדיטים", code: "no_credits" }, { status: 402 });
      return Response.json({ error: "לא הצלחנו לחייב קרדיטים" }, { status: 500 });
    }
    genId = data as unknown as string;
  }

  const refund = async (why: string) => {
    if (genId) await supabaseAdmin().rpc("re_refund_generation" as never, { p_gen: genId, p_error: why } as never);
  };

  let requestId: string;
  try {
    if (m === "mock") {
      requestId = `mock-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    } else {
      const res = await fal().queue.submit(MODELS[model].endpoint, { input: modelInput(model, imageUrl, prompt, endImageUrl) as never });
      requestId = res.request_id;
    }
  } catch (e) {
    const msg = errorMessage(e);
    await refund(msg);
    return Response.json({ error: msg }, { status: 502 });
  }

  if (genId) {
    await supabaseAdmin()
      .from("re_generations")
      .update({ request_id: requestId, status: "queued", updated_at: new Date().toISOString() } as never)
      .eq("id", genId);
  }
  return Response.json({ requestId, credits: CREDITS_PER_CLIP[model] });
}
