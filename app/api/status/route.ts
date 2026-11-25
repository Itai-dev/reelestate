import { errorMessage, fal, isJobKey, isRenderKey, isTourKey, jobEndpoint, mode } from "@/lib/server";
import type { JobKey } from "@/lib/server";
import { access } from "@/lib/access";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Out =
  | { status: "queued"; position?: number }
  | { status: "rendering" }
  | { status: "done"; videoUrl: string }
  | { status: "error"; error: string; refunded?: boolean };

type Gen = { id: string; status: string; video_url: string | null; error: string | null };

export async function GET(req: Request) {
  const gate = await access(req);
  if (gate instanceof Response) return gate;
  const url = new URL(req.url);
  const model = url.searchParams.get("model");
  const id = url.searchParams.get("id");
  if (!isJobKey(model) || !id) return Response.json({ error: "בקשה חסרה" }, { status: 400 });

  // With accounts on, a user can only follow their own jobs.
  let gen: Gen | null = null;
  if (gate.user) {
    const { data } = await supabaseAdmin()
      .from("re_generations")
      .select("id,status,video_url,error")
      .eq("request_id", id)
      .eq("user_id", gate.user.id)
      .maybeSingle();
    gen = data as Gen | null;
    if (!gen) return Response.json({ error: "לא נמצא" }, { status: 404 });
    if (gen.status === "done" && gen.video_url) return Response.json({ status: "done", videoUrl: gen.video_url } satisfies Out);
    if (gen.status === "refunded") return Response.json({ status: "error", error: gen.error ?? "היצירה נכשלה", refunded: true } satisfies Out);
  }

  const out = mode() === "mock" ? mockStatus(id, model) : await falStatus(model, id);

  if (gen) {
    const db = supabaseAdmin();
    if (out.status === "done") {
      await db.from("re_generations").update({ status: "done", video_url: out.videoUrl, updated_at: new Date().toISOString() } as never).eq("id", gen.id);
    } else if (out.status === "error") {
      await db.rpc("re_refund_generation" as never, { p_gen: gen.id, p_error: out.error } as never);
      return Response.json({ ...out, refunded: true } satisfies Out);
    }
  }
  return Response.json(out);
}

async function falStatus(model: JobKey, id: string): Promise<Out> {
  const endpoint = jobEndpoint(model);
  try {
    const st = await fal().queue.status(endpoint, { requestId: id, logs: false });
    if (st.status === "IN_QUEUE") return { status: "queued", position: st.queue_position };
    if (st.status === "IN_PROGRESS") return { status: "rendering" };
  } catch (e) {
    // A hiccup while asking is not a failed clip; only an unknown request is.
    if ((e as { status?: number }).status === 404) return { status: "error", error: "הבקשה לא נמצאה אצל fal" };
    return { status: "rendering" };
  }
  try {
    const res = await fal().queue.result(endpoint, { requestId: id });
    const d = res.data as { video?: { url?: string }; images?: { url?: string }[] };
    const videoUrl = d?.video?.url ?? d?.images?.[0]?.url;
    if (!videoUrl) return { status: "error", error: "המודל לא החזיר וידאו" };
    return { status: "done", videoUrl };
  } catch (e) {
    return { status: "error", error: errorMessage(e) };
  }
}

// Simulates the queue: ~4s waiting, ~6s rendering, then a local sample clip
// (or a drawn test image for the tour's panoramas).
function mockStatus(id: string, model: JobKey): Out {
  const [, t, n, tag] = id.split("-");
  const age = Date.now() - Number(t);
  if (age < 4000) return { status: "queued", position: 1 };
  if (age < 10000) return { status: "rendering" };
  if (isTourKey(model)) return { status: "done", videoUrl: `/api/tour/mock?kind=${model}&n=${Number(n) % 6}&light=${tag ?? "day"}` };
  if (isRenderKey(model)) return { status: "done", videoUrl: `/api/tour/mock?kind=closeup&n=${Number(n) % 6}` };
  return { status: "done", videoUrl: `/mock/clip-${Number(n) % 3}.mp4` };
}
