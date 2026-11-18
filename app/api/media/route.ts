import { access } from "@/lib/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Streams a generated clip through this origin so the browser can draw it on
// a canvas and export it (cross-origin video would block the export).
function allowed(u: URL) {
  if (u.protocol !== "https:") return false;
  const h = u.hostname;
  return h === "fal.media" || h.endsWith(".fal.media") || (h === "storage.googleapis.com" && u.pathname.startsWith("/falserverless/"));
}

export async function GET(req: Request) {
  const gate = await access(req);
  if (gate instanceof Response) return gate;
  const raw = new URL(req.url).searchParams.get("url");
  let target: URL;
  try {
    target = new URL(raw ?? "");
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (!allowed(target)) return new Response("host not allowed", { status: 403 });

  const upstream = await fetch(target, { cache: "no-store" });
  if (!upstream.ok || !upstream.body) return new Response("upstream error", { status: 502 });
  return new Response(upstream.body, {
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "video/mp4",
      "cache-control": "private, max-age=86400",
    },
  });
}
