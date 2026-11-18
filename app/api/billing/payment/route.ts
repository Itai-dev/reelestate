import { currentUser, supabaseAdmin } from "@/lib/supabase";
import { expandId } from "@/lib/grow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lets the success page wait until Grow's callback has been processed.
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "צריך להתחבר" }, { status: 401 });
  const id = expandId(new URL(req.url).searchParams.get("p") ?? "");
  if (!id) return Response.json({ error: "לא נמצא" }, { status: 404 });
  const { data } = await supabaseAdmin()
    .from("re_payments")
    .select("status,kind,product,credits,amount")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return Response.json({ error: "לא נמצא" }, { status: 404 });
  return Response.json(data);
}
