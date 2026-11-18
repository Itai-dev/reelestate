import { errorMessage, fal, mode } from "@/lib/server";
import { access } from "@/lib/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Receives one prepared (cropped, resized) photo and stores it on fal so the
// video model can read it.
export async function POST(req: Request) {
  const gate = await access(req);
  if (gate instanceof Response) return gate;
  const m = mode();
  if (m === "demo") return Response.json({ error: "חסר FAL_KEY" }, { status: 400 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) return Response.json({ error: "לא התקבלה תמונה" }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return Response.json({ error: "התמונה גדולה מדי" }, { status: 413 });

  if (m === "mock") return Response.json({ url: `mock://image/${Date.now()}` });

  try {
    const url = await fal().storage.upload(file);
    return Response.json({ url });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 502 });
  }
}
