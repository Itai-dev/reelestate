"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export default function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      setError("ההתחברות עוד לא מוגדרת בשרת.");
      setState("error");
      return;
    }
    setState("sending");
    const sb = createBrowserClient(url, key);
    const { error } = await sb.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setError(error.status === 429 ? "נשלחו יותר מדי קישורים. נסו שוב בעוד כמה דקות." : error.message);
      setState("error");
    } else setState("sent");
  };

  if (state === "sent")
    return (
      <div className="panel">
        <h2>בדקו את המייל</h2>
        <p>שלחנו קישור התחברות ל-<b dir="ltr">{email}</b>. אפשר לסגור את הלשונית הזו.</p>
        <button type="button" className="link" onClick={() => setState("idle")}>
          לא הגיע? שליחה מחדש
        </button>
      </div>
    );

  return (
    <form className="panel form" onSubmit={submit}>
      <label className="field">
        <span>מייל</span>
        <input type="email" dir="ltr" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {state === "error" && <p className="error-inline">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={state === "sending"}>
        {state === "sending" ? "שולח…" : "שליחת קישור התחברות"}
      </button>
    </form>
  );
}
