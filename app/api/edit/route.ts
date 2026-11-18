import { errorMessage, fal, isEditKey, isFalMediaUrl, mode } from "@/lib/server";
import { EDITS, EDIT_GUARD } from "@/lib/presets";
import { CREDITS_PER_EDIT } from "@/lib/plans";
import { access } from "@/lib/access";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Edits a finished clip from one sentence ("make it sunset"). Charges credits first and
// refunds them if queuing fails. Follow the job with /api/status?model=<edit key>&id=<requestId>.
export async function POST(req: Request) {
  const gate = await access(req);
  if (gate instanceof Response) return gate;
  const m = mode();
  if (m === "demo") return Response.json({ error: "חסר FAL_KEY" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as { model?: unknown; videoUrl?: unknown; prompt?: unknown } | null;
  const model = body?.model ?? "edit720";
  const videoUrl = body?.videoUrl;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim().slice(0, 1000) : "";
  if (!isEditKey(model) || !prompt) return Response.json({ error: "בקשה חסרה" }, { status: 400 });
  if (!isFalMediaUrl(videoUrl)) return Response.json({ error: "אפשר לערוך רק קליפ שנוצר כאן" }, { status: 400 });

  let genId: string | null = null;
  if (gate.user) {
    const { data, error } = await supabaseAdmin().rpc("re_spend_credits" as never, {
      p_user: gate.user.id,
      p_amount: CREDITS_PER_EDIT[model],
      p_model: model,
    } as never);
    if (error) {
      if (error.message.includes("insufficient_credits"))
        return Response.json({ error: "נגמרו הקרדיטים", code: "no_credits" }, { status: 402 });
      return Response.json({ error: "לא הצלחנו לחייב קרדיטים" }, { status: 500 });
    }
    genId = data as unknown as string;
  }

  let requestId: string;
  try {
    if (m === "mock") {
      requestId = `mock-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    } else {
      const res = await fal().queue.submit(EDITS[model].endpoint, {
        input: { prompt: `${prompt} ${EDIT_GUARD}`, video_url: videoUrl, resolution: EDITS[model].resolution } as never,
      });
      requestId = res.request_id;
    }
  } catch (e) {
    const msg = errorMessage(e);
    if (genId) await supabaseAdmin().rpc("re_refund_generation" as never, { p_gen: genId, p_error: msg } as never);
    return Response.json({ error: msg }, { status: 502 });
  }

  if (genId) {
    await supabaseAdmin()
      .from("re_generations")
      .update({ request_id: requestId, status: "queued", updated_at: new Date().toISOString() } as never)
      .eq("id", genId);
  }
  return Response.json({ requestId, credits: CREDITS_PER_EDIT[model] });
}
