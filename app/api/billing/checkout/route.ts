import { currentUser, ensureProfile, supabaseAdmin } from "@/lib/supabase";
import { createPaymentProcess, compactId, growConfigured } from "@/lib/grow";
import { product } from "@/lib/plans";
import { siteOrigin } from "@/lib/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Starts a Grow payment page for a plan or a credit pack and returns its URL.
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "צריך להתחבר" }, { status: 401 });
  if (!growConfigured()) return Response.json({ error: "הסליקה עוד לא מחוברת. נסו שוב בקרוב." }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { product?: string; fullName?: string; phone?: string } | null;
  const item = product(body?.product ?? "");
  if (!item) return Response.json({ error: "מוצר לא קיים" }, { status: 400 });

  const fullName = (body?.fullName ?? "").trim().replace(/\s+/g, " ");
  const phone = (body?.phone ?? "").replace(/\D/g, "");
  if (fullName.split(" ").length < 2) return Response.json({ error: "צריך שם פרטי ושם משפחה" }, { status: 400 });
  if (!/^05\d{8}$/.test(phone)) return Response.json({ error: "צריך מספר נייד ישראלי, למשל 0501234567" }, { status: 400 });

  const profile = await ensureProfile(user);
  if (item.kind === "subscription" && profile.plan === item.id && profile.sub_status === "active") {
    return Response.json({ error: "זה כבר המסלול שלך" }, { status: 409 });
  }

  const db = supabaseAdmin();
  await db.from("re_profiles").update({ full_name: fullName, phone, updated_at: new Date().toISOString() } as never).eq("id", user.id);

  const { data: payment, error } = await db
    .from("re_payments")
    .insert({ user_id: user.id, kind: item.kind, product: item.id, amount: item.price, credits: item.credits } as never)
    .select("id")
    .single();
  if (error || !payment) return Response.json({ error: "לא הצלחנו לפתוח הזמנה" }, { status: 500 });
  const paymentId = (payment as { id: string }).id;

  const origin = siteOrigin(req);
  const secret = process.env.GROW_NOTIFY_SECRET ?? "";
  try {
    const page = await createPaymentProcess({
      recurring: item.kind === "subscription",
      sum: item.price,
      description: `Reel Estate ${item.name}`,
      fullName,
      phone,
      email: user.email ?? undefined,
      paymentId,
      successUrl: `${origin}/billing/success?p=${compactId(paymentId)}`,
      cancelUrl: `${origin}/pricing`,
      notifyUrl: `${origin}/api/billing/notify?k=${secret}`,
    });
    await db.from("re_payments").update({ process_id: page.processId, process_token: page.processToken } as never).eq("id", paymentId);
    return Response.json({ url: page.url });
  } catch (e) {
    await db.from("re_payments").update({ status: "failed", raw: { error: String(e) } } as never).eq("id", paymentId);
    return Response.json({ error: e instanceof Error ? e.message : "שגיאה בחברת הסליקה" }, { status: 502 });
  }
}
