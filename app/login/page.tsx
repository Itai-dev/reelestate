import type { Metadata } from "next";
import Link from "next/link";
import LoginForm from "./LoginForm";
import { GoogleButton } from "@/components/Studio";
import AuthReel from "@/components/AuthReel";
import Logo from "@/components/Logo";

export const metadata: Metadata = { title: "התחברות — Reel Estate" };

const clip = (ts: string, id: string) => `/showcase/hf_${ts}_${id}.mp4`;
const CLIPS = [
  clip("20261118_211435", "1c76d183-e39d-4000-80e8-ce7d26a5baa7"),
  clip("20261118_195406", "42b33b3a-74fc-4592-94ec-e77978c79e7f"),
  clip("20261118_212948", "5ffe1c82-7d18-41c9-978f-200e0fe6c4c5"),
  clip("20261118_184546", "1b19ac0d-116e-4e31-b2b8-c7ab0eccc074"),
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/projects";
  return (
    <main className="auth">
      <section className="auth-form">
        <Link href="/" className="auth-logo" aria-label="Reel Estate, לעמוד הבית">
          <Logo size={30} />
        </Link>
        <div className="auth-body">
          <h1>התחברות</h1>
          <p>ההרשמה קורית בהתחברות הראשונה. הפרויקטים נשמרים בחשבון ונפתחים מכל מכשיר.</p>
          {sp.error && <p className="error-inline">הקישור לא עבד או שפג תוקפו. שלחו קישור חדש.</p>}
          <GoogleButton next={next} />
          <p className="or">או עם קישור למייל</p>
          <LoginForm next={next} />
          <p className="auth-fine">
            בהתחברות אתם מסכימים ל<Link href="/terms">תנאי השימוש</Link> ול<Link href="/privacy">מדיניות הפרטיות</Link>.
          </p>
        </div>
      </section>
      <section className="auth-media" aria-hidden>
        <AuthReel clips={CLIPS} />
      </section>
    </main>
  );
}
