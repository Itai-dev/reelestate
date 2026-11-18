"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { refreshMe } from "@/components/SiteNav";

type Payment = { status: "pending" | "paid" | "failed"; kind: string; credits: number };

function Waiting() {
  const p = useSearchParams().get("p") ?? "";
  const [pay, setPay] = useState<Payment | null>(null);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (pay?.status === "paid" || pay?.status === "failed" || tries > 40) return;
    const id = setTimeout(async () => {
      const r = await fetch(`/api/billing/payment?p=${encodeURIComponent(p)}`, { cache: "no-store" }).catch(() => null);
      if (r?.ok) {
        const d = (await r.json()) as Payment;
        setPay(d);
        if (d.status === "paid") refreshMe();
      }
      setTries((n) => n + 1);
    }, tries === 0 ? 300 : 2500);
    return () => clearTimeout(id);
  }, [p, pay, tries]);

  if (pay?.status === "paid")
    return (
      <>
        <h1>התשלום התקבל</h1>
        <p>{pay.credits} קרדיטים נוספו לחשבון. קבלה תישלח אליכם במייל מ-Grow.</p>
        <Link className="btn btn-primary" href="/">
          לסטודיו
        </Link>
      </>
    );
  if (pay?.status === "failed")
    return (
      <>
        <h1>התשלום לא עבר</h1>
        <p>לא חויבתם. אפשר לנסות שוב עם כרטיס אחר.</p>
        <Link className="btn btn-primary" href="/pricing">
          חזרה למחירים
        </Link>
      </>
    );
  return (
    <>
      <h1>מאשרים את התשלום…</h1>
      <p>{tries > 40 ? "זה לוקח יותר מהרגיל. הקרדיטים יופיעו בחשבון ברגע שהאישור יגיע." : "זה לוקח כמה שניות."}</p>
      {tries > 40 && (
        <Link className="btn btn-outline" href="/account">
          לחשבון
        </Link>
      )}
    </>
  );
}

export default function SuccessPage() {
  return (
    <main className="page narrow center">
      <Suspense>
        <Waiting />
      </Suspense>
    </main>
  );
}
