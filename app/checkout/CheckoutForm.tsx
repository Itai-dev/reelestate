"use client";

import { useState } from "react";

export default function CheckoutForm(p: { productId: string; defaultName: string; defaultPhone: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ product: p.productId, fullName: fd.get("fullName"), phone: fd.get("phone") }),
      });
      const data = await r.json();
      if (!r.ok || !data.url) throw new Error(data.error || "משהו נכשל");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "משהו נכשל");
      setBusy(false);
    }
  };

  return (
    <form className="panel form" onSubmit={submit}>
      <label className="field">
        <span>שם מלא</span>
        <input name="fullName" required autoComplete="name" defaultValue={p.defaultName} />
      </label>
      <label className="field">
        <span>נייד</span>
        <input name="phone" required dir="ltr" inputMode="tel" autoComplete="tel" defaultValue={p.defaultPhone} placeholder="0501234567" />
      </label>
      <p className="fine">חברת הסליקה מבקשת שם ונייד כדי להפיק קבלה.</p>
      {error && <p className="error-inline">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "פותח את עמוד התשלום…" : "המשך לתשלום"}
      </button>
    </form>
  );
}
