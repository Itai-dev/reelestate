import { errorMessage, fal, isFalMediaUrl, isTourKey, mode } from "@/lib/server";
import { ROOMS, TOUR_IMAGES, type RoomId } from "@/lib/presets";
import { CREDITS_PER_TOUR_IMAGE } from "@/lib/plans";
import { CLOSEUP_PROMPT, finishPrompt, isTourLight, lightPrompt, panoPrompt } from "@/lib/tour";
import { access } from "@/lib/access";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Queues one image of the interactive tour from a reference image:
//   pano       a 360° panorama of a space, from its photo
//   panoFinish an uploaded 360° render, re-created as a photograph of the same space
//   panoLight  a panorama under another light
//   closeup    the close view of the apartment that the camera approach ends on
// The prompt is written here, so the endpoint only ever makes tour images.
export async function POST(req: Request) {
  const gate = await access(req);
  if (gate instanceof Response) return gate;
  const m = mode();
  if (m === "demo") return Response.json({ error: "חסר FAL_KEY" }, { status: 400 });

  const b = (await req.json().catch(() => null)) as { kind?: unknown; imageUrl?: unknown; room?: unknown; light?: unknown; style?: unknown } | null;
  const kind = b?.kind;
  const imageUrl = b?.imageUrl;
  if (!isTourKey(kind) || typeof imageUrl !== "string" || (m !== "mock" && !isFalMediaUrl(imageUrl))) {
    return Response.json({ error: "בקשה חסרה" }, { status: 400 });
  }

  let prompt: string;
  const style = typeof b?.style === "string" ? b.style.slice(0, 400) : undefined;
  if (kind === "pano") {
    const room = (ROOMS.some((r) => r.id === b?.room) ? b!.room : "other") as RoomId;
    prompt = panoPrompt(room, style);
  } else if (kind === "panoFinish") {
    prompt = finishPrompt(style);
  } else if (kind === "panoLight") {
    if (!isTourLight(b?.light) || b.light === "day") return Response.json({ error: "בקשה חסרה" }, { status: 400 });
    prompt = lightPrompt(b.light);
  } else {
    prompt = CLOSEUP_PROMPT;
  }

  let genId: string | null = null;
  if (gate.user) {
    const { data, error } = await supabaseAdmin().rpc("re_spend_credits" as never, { p_user: gate.user.id, p_amount: CREDITS_PER_TOUR_IMAGE, p_model: kind } as never);
    if (error) {
      if (error.message.includes("insufficient_credits")) return Response.json({ error: "נגמרו הקרדיטים", code: "no_credits" }, { status: 402 });
      return Response.json({ error: "לא הצלחנו לחייב קרדיטים" }, { status: 500 });
    }
    genId = data as unknown as string;
  }

  let requestId: string;
  try {
    if (m === "mock") {
      requestId = `mock-${Date.now()}-${Math.floor(Math.random() * 1e6)}-${kind === "panoLight" ? b?.light : "day"}`;
    } else {
      const { endpoint, width, height } = TOUR_IMAGES[kind];
      const input = { prompt, image_urls: [imageUrl], image_size: { width, height }, output_format: "jpeg", num_images: 1 };
      const res = await fal().queue.submit(endpoint, { input: input as never });
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
  return Response.json({ requestId, model: kind, credits: CREDITS_PER_TOUR_IMAGE });
}
