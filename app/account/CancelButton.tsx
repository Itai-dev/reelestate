"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CancelButton({ until }: { until: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "confirm" | "busy">("idle");
  const [error, setError] = useState("");

  const cancel = async () => {
    setStep("busy");
    const r = await fetch("/api/billing/cancel", { method: "POST" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(d.error || "הביטול נכשל");
      setStep("confirm");
      return;
    }
    router.refresh();
  };

  if (step === "idle")
    return (
      <button type="button" className="link" onClick={() => setStep("confirm")}>
        ביטול המנוי
      </button>
    );
  return (
    <div className="confirm" role="alertdialog" aria-label="אישור ביטול">
      <p>החיוב החודשי ייעצר. הקרדיטים שנשארו זמינים עד {until}.</p>
      {error && <p className="error-inline">{error}</p>}
      <div className="row-actions">
        <button type="button" className="btn btn-outline btn-small" onClick={cancel} disabled={step === "busy"}>
          {step === "busy" ? "מבטל…" : "כן, לבטל"}
        </button>
        <button type="button" className="link" onClick={() => setStep("idle")}>
          השארת המנוי
        </button>
      </div>
    </div>
  );
}
