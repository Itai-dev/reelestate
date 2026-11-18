import { supabaseAdmin, type Profile } from "@/lib/supabase";
import { readCallback } from "@/lib/grow";
import { PERIOD_DAYS, PLANS, isPlanId } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));

// Grow webhooks for monthly charges (from the 2nd month on) and failed charges.
// Grow support enables these and gives the webhook key (GROW_WEBHOOK_KEY).
export async function POST(req: Request) {
  const body = await readCallback(req);
  const key = s(body.webhookKey ?? body.webhook_key);
  const expected = process.env.GROW_WEBHOOK_KEY;
  if (!expected || key !== expected) return new Response("forbidden", { status: 403 });

  const db = supabaseAdmin();
  const findProfile = async (debitId: string, email: string) => {
    if (debitId) {
      const { data } = await db.from("re_profiles").select("*").eq("grow_direct_debit_id", debitId).maybeSingle();
      if (data) return data as Profile;
    }
    if (email) {
      const { data } = await db.from("re_profiles").select("*").ilike("email", email).not("plan", "is", null).limit(1).maybeSingle();
      if (data) return data as Profile;
    }
    return null;
  };

  // failed monthly charge
  if (body.regular_payment_id !== undefined || body.error_message !== undefined) {
    const p = await findProfile(s(body.regular_payment_id), s(body.email));
    if (p) await db.from("re_profiles").update({ sub_status: "past_due", updated_at: new Date().toISOString() } as never).eq("id", p.id);
    return new Response("ok");
  }

  // successful monthly charge
  const debitId = s(body.directDebitId);
  const tx = s(body.transactionCode || body.asmachta);
  if (!debitId && !tx) return new Response("ignored");
  const p = await findProfile(debitId, s(body.payerEmail));
  if (!p || !isPlanId(p.plan)) {
    console.error("renewal for unknown subscriber", body);
    return new Response("ok");
  }
  const { error } = await db.rpc("re_renew" as never, {
    p_user: p.id,
    p_plan: p.plan,
    p_credits: PLANS[p.plan].credits,
    p_amount: Number(body.paymentSum ?? PLANS[p.plan].price),
    p_transaction: tx || `${debitId}-${s(body.paymentDate)}`,
    p_raw: body,
    p_period_days: PERIOD_DAYS,
  } as never);
  if (error) return new Response("error", { status: 500 });
  return new Response("ok");
}
