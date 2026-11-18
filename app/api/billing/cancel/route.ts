import { currentUser, ensureProfile, supabaseAdmin } from "@/lib/supabase";
import { cancelDirectDebit } from "@/lib/grow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stops the monthly charge. Credits stay usable until the end of the paid period.
export async function POST() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "צריך להתחבר" }, { status: 401 });
  const p = await ensureProfile(user);
  if (p.sub_status !== "active" && p.sub_status !== "past_due") return Response.json({ error: "אין מנוי פעיל" }, { status: 400 });
  if (!p.grow_transaction_id || !p.grow_transaction_token || !p.grow_asmachta) {
    return Response.json({ error: "חסרים פרטי המנוי. פנו אלינו ונבטל ידנית." }, { status: 409 });
  }
  try {
    await cancelDirectDebit({ transactionId: p.grow_transaction_id, transactionToken: p.grow_transaction_token, asmachta: p.grow_asmachta });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "הביטול נכשל" }, { status: 502 });
  }
  await supabaseAdmin().from("re_profiles").update({ sub_status: "canceled", updated_at: new Date().toISOString() } as never).eq("id", user.id);
  return Response.json({ ok: true, until: p.current_period_end });
}
