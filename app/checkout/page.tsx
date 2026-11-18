import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authConfigured, currentUser, ensureProfile } from "@/lib/supabase";
import { CREDITS_PER_REEL, ils, product } from "@/lib/plans";
import CheckoutForm from "./CheckoutForm";

export const metadata: Metadata = { title: "תשלום — Reel Estate" };
export const dynamic = "force-dynamic";

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const sp = await searchParams;
  const item = product(sp.product ?? "");
  if (!item) redirect("/pricing");
  if (!authConfigured()) {
    return (
      <main className="page narrow">
        <h1>התשלום עוד לא פתוח</h1>
        <p>החשבונות עוד לא מחוברים בשרת.</p>
      </main>
    );
  }
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/checkout?product=${item.id}`)}`);
  const profile = await ensureProfile(user);

  return (
    <main className="page narrow">
      <header className="page-head">
        <h1>{item.name}</h1>
        <p>
          {item.kind === "subscription"
            ? `${ils(item.price)} לחודש, ${item.credits} קרדיטים בכל חודש (כ-${Math.floor(item.credits / CREDITS_PER_REEL)} רילסים). מבטלים מתי שרוצים.`
            : `${ils(item.price)} בתשלום אחד, ${item.credits} קרדיטים שלא פגים.`}
        </p>
      </header>
      <CheckoutForm productId={item.id} defaultName={profile.full_name ?? ""} defaultPhone={profile.phone ?? ""} />
      <p className="fine">
        בלחיצה עוברים לעמוד התשלום המאובטח של Grow. ההזמנה כפופה ל<Link href="/terms">תנאי השימוש</Link>.
      </p>
    </main>
  );
}
