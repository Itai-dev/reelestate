import { supabaseAdmin, type Profile } from "@/lib/supabase";
import { approveTransaction, cancelDirectDebit, expandId, readCallback } from "@/lib/grow";
import { PERIOD_DAYS } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Payment = {
  id: string;
  user_id: string;
  kind: "subscription" | "topup" | "renewal";
  status: string;
  process_id: string | null;
  process_token: string | null;
};

const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));

// Grow calls this when a payment page completes. We trust it only if it
// carries the process id + token we got (privately) when opening the page.
export async function POST(req: Request) {
  const secret = process.env.GROW_NOTIFY_SECRET;
  if (secret && new URL(req.url).searchParams.get("k") !== secret) return new Response("forbidden", { status: 403 });

  const body = await readCallback(req);
  const d = (typeof body.data === "object" && body.data ? body.data : body) as Record<string, unknown>;
  const custom = (d.customFields ?? body.customFields ?? {}) as Record<string, unknown>;
  const paymentId = expandId(s(custom.cField1 ?? d.cField1 ?? body.cField1));
  if (!paymentId) return new Response("ok");

  const db = supabaseAdmin();
  const { data } = await db.from("re_payments").select("id,user_id,kind,status,process_id,process_token").eq("id", paymentId).maybeSingle();
  const payment = data as Payment | null;
  if (!payment) return new Response("ok");
  if (s(d.processId) !== s(payment.process_id) || s(d.processToken) !== s(payment.process_token)) {
    return new Response("mismatch", { status: 403 });
  }

  const failed = (body.status !== undefined && s(body.status) !== "1") || (d.statusCode !== undefined && s(d.statusCode) !== "2");
  if (failed) {
    await db.from("re_payments").update({ status: "failed", raw: body } as never).eq("id", payment.id);
    return new Response("ok");
  }

  const recurring = payment.kind === "subscription";

  // Switching plans: stop the previous monthly charge before recording the new one.
  if (recurring && payment.status !== "paid") {
    const { data: prof } = await db.from("re_profiles").select("*").eq("id", payment.user_id).maybeSingle();
    const old = prof as Profile | null;
    if (old?.grow_transaction_id && old.grow_transaction_token && old.grow_asmachta && old.sub_status === "active" && s(d.transactionId) !== old.grow_transaction_id) {
      await cancelDirectDebit({
        transactionId: old.grow_transaction_id,
        transactionToken: old.grow_transaction_token,
        asmachta: old.grow_asmachta,
      }).catch((e) => console.error("cancel previous plan failed", e));
    }
  }

  const { error } = await db.rpc("re_apply_payment" as never, {
    p_payment: payment.id,
    p_transaction_id: s(d.transactionId),
    p_transaction_token: s(d.transactionToken),
    p_asmachta: s(d.asmachta),
    p_direct_debit_id: s(d.directDebitId ?? d.recurringDebitId) || null,
    p_raw: body,
    p_period_days: PERIOD_DAYS,
  } as never);
  if (error) {
    console.error("apply payment failed", error);
    return new Response("error", { status: 500 }); // Grow retries
  }

  await approveTransaction(recurring, d).catch((e) => console.error("approveTransaction failed", e));
  return new Response("ok");
}
