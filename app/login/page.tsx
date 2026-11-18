import type { Metadata } from "next";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "התחברות — Reel Estate" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/";
  return (
    <main className="page narrow">
      <header className="page-head">
        <h1>התחברות</h1>
        <p>נשלח לכם קישור למייל. אין סיסמה לזכור, וההרשמה קורית בהתחברות הראשונה.</p>
      </header>
      {sp.error && <p className="error-inline">הקישור לא עבד או שפג תוקפו. שלחו קישור חדש.</p>}
      <LoginForm next={next} />
    </main>
  );
}
