import { access } from "@/lib/access";
import { BrandError, extractBrand } from "@/lib/brand-extract";
import { mode } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Reads a company's website and returns its brand kit (and the logo as a data URL).
export async function POST(req: Request) {
  const gate = await access(req);
  if (gate instanceof Response) return gate;
  if (mode() === "demo") return Response.json({ error: "חסר FAL_KEY" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { url?: unknown } | null;
  if (typeof body?.url !== "string" || body.url.length > 500) return Response.json({ error: "חסרה כתובת" }, { status: 400 });
  try {
    return Response.json(await extractBrand(body.url));
  } catch (e) {
    const msg = e instanceof BrandError ? e.message : "לא הצלחנו לקרוא את האתר. נסו את כתובת דף הבית.";
    if (!(e instanceof BrandError)) console.error("brand", e);
    return Response.json({ error: msg }, { status: 422 });
  }
}
