import type { Metadata } from "next";
import LoginForm from "./LoginForm";
import { GoogleButton } from "@/components/Studio";

export const metadata: Metadata = { title: "התחברות — Reel Estate" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/";
  return (
    <main className="page narrow">
      <header className="page-head">
        <h1>התחברות</h1>
        <p>ההרשמה קורית בהתחברות הראשונה. הפרויקטים נשמרים בחשבון ונפתחים מכל מכשיר.</p>
      </header>
      {sp.error && <p className="error-inline">הקישור לא עבד או שפג תוקפו. שלחו קישור חדש.</p>}
      <GoogleButton next={next} />
      <p className="or">או עם קישור למייל</p>
      <LoginForm next={next} />
    </main>
  );
}
