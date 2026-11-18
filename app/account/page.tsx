import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authConfigured, currentUser, ensureProfile, supabaseAdmin, usableCredits } from "@/lib/supabase";
import { PLANS, ils, isPlanId } from "@/lib/plans";
import CancelButton from "./CancelButton";

export const metadata: Metadata = { title: "החשבון — Reel Estate" };
export const dynamic = "force-dynamic";

type Row = { id: string; kind: string; product: string; amount: number; credits: number; status: string; created_at: string };

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" }) : "");
const KIND: Record<string, string> = { subscription: "מנוי", renewal: "חידוש חודשי", topup: "קרדיטים" };
const STATUS: Record<string, string> = { paid: "שולם", pending: "ממתין", failed: "נכשל" };

export default async function AccountPage() {
  if (!authConfigured()) redirect("/");
  const user = await currentUser();
  if (!user) redirect("/login?next=/account");
  const p = await ensureProfile(user);
  const credits = usableCredits(p);
  const { data } = await supabaseAdmin()
    .from("re_payments")
    .select("id,kind,product,amount,credits,status,created_at")
    .eq("user_id", user.id)
    .neq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(12);
  const payments = (data ?? []) as Row[];
  const plan = isPlanId(p.plan) ? PLANS[p.plan] : null;

  return (
    <main className="page narrow">
      <header className="page-head">
        <h1>החשבון</h1>
        <p dir="ltr" className="account-email">
          {user.email}
        </p>
      </header>

      <section className="panel account-credits" aria-labelledby="credits-h">
        <h2 id="credits-h">קרדיטים</h2>
        <p className="big-number">{credits.total}</p>
        <p className="fine">
          {credits.plan} מהמסלול{p.current_period_end && credits.plan ? ` (עד ${date(p.current_period_end)})` : ""}, {credits.extra} נוספים שלא פגים
        </p>
        <Link className="btn btn-outline btn-small" href="/pricing#packs">
          קניית קרדיטים
        </Link>
      </section>

      <section className="panel" aria-labelledby="plan-h">
        <h2 id="plan-h">מנוי</h2>
        {plan && p.sub_status === "active" && (
          <>
            <p>
              מסלול {plan.name}, {ils(plan.price)} לחודש. החיוב הבא בסביבות {date(p.current_period_end)}.
            </p>
            <div className="row-actions">
              <Link className="btn btn-outline btn-small" href="/pricing">
                החלפת מסלול
              </Link>
              <CancelButton until={date(p.current_period_end)} />
            </div>
          </>
        )}
        {plan && p.sub_status === "canceled" && (
          <p>
            מסלול {plan.name} בוטל. הקרדיטים זמינים עד {date(p.current_period_end)}. <Link href="/pricing">חידוש מנוי</Link>
          </p>
        )}
        {plan && p.sub_status === "past_due" && (
          <p className="error-inline">
            החיוב החודשי האחרון נכשל, ולכן קרדיטי המסלול מושהים. עדכנו אמצעי תשלום דרך <Link href="/pricing">בחירת מסלול מחדש</Link>.
          </p>
        )}
        {(!plan || p.sub_status === "none") && (
          <p>
            אין מנוי. <Link href="/pricing">לבחירת מסלול</Link>
          </p>
        )}
      </section>

      {payments.length > 0 && (
        <section className="panel" aria-labelledby="pay-h">
          <h2 id="pay-h">תשלומים</h2>
          <table className="payments">
            <tbody>
              {payments.map((r) => (
                <tr key={r.id}>
                  <td>{date(r.created_at)}</td>
                  <td>{KIND[r.kind] ?? r.kind}</td>
                  <td>{ils(Number(r.amount))}</td>
                  <td>{r.credits} קרדיטים</td>
                  <td>{STATUS[r.status] ?? r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="fine">הקבלות נשלחות במייל מחברת הסליקה Grow.</p>
        </section>
      )}

      <form action="/auth/signout" method="post">
        <button className="link" type="submit">
          התנתקות
        </button>
      </form>
    </main>
  );
}
