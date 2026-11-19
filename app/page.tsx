import type { Metadata } from "next";
import Link from "next/link";
import LoopVideo from "@/components/LoopVideo";
import HeroPrompt from "@/components/HeroPrompt";

export const metadata: Metadata = {
  title: "Reel Estate — סרטונים שמוכרים, מתמונה, הדמיה או תוכנית",
  description: "מעלים תמונות או תוכנית, מדביקים לינק לאתר, ומקבלים Reel לנכס בשפה של המותג. שינויים בשורה אחת, גם בקול.",
};

const STEPS = [
  { t: "מעלים 4 עד 10 תמונות", d: "גם כאלה שצולמו בטלפון. עוד אין תמונות? מעלים תוכנית ורפרנסים, ונוצרות הדמיות." },
  { t: "מדביקים לינק לאתר שלכם", d: "הלוגו, הצבעים והפונטים נכנסים לסרטון לבד. בלי להעלות קבצים." },
  { t: "מקבלים Reel מוכן לפרסום", d: "תנועת מצלמה לכל חלל, טקסטים כתובים, וכרטיס סיום עם הטלפון שלכם." },
];

const clip = (ts: string, id: string) => `/showcase/hf_${ts}_${id}.mp4`;

const SHOWCASE = [
  clip("20261118_212948", "5ffe1c82-7d18-41c9-978f-200e0fe6c4c5"),
  clip("20261118_211435", "1c76d183-e39d-4000-80e8-ce7d26a5baa7"),
  clip("20261118_195406", "42b33b3a-74fc-4592-94ec-e77978c79e7f"),
  clip("20261118_192217", "1ebd669c-e45b-46e3-8a56-c5e0c36353a6"),
  clip("20261118_152916", "2fe97cfa-03e2-4a64-9303-aa9272b35ff1"),
  clip("20261118_140402", "daa9986e-37b9-490d-b12b-3093a4b7f5e4"),
  clip("20261118_184546", "1b19ac0d-116e-4e31-b2b8-c7ab0eccc074"),
  clip("20261118_214028", "87424936-b72f-41d4-ba21-4e14e9903ba0"),
];

const PLAN_CLIP = clip("20261118_214750", "618860f1-3ab7-464e-abe1-31ea7e2a3fc4");

const FEATURES = [
  { t: "שינויים בשורה אחת", d: "\"שקיעה במטבח, והמחיר 4.8 מיליון\". בכתב או בקול, וכל שינוי ניתן לביטול." },
  { t: "טקסט שעובד בסושיאל", d: "משפט פתיחה שעוצר גלילה, שורה לכל חלל, ושום דבר מתחת לכפתורים של אינסטגרם." },
  { t: "כל הפורמטים", d: "Reel וסטורי, פיד, ריבוע ואתר. מאותו פרויקט, בלחיצה." },
];

export default function Landing() {
  return (
    <main className="land">
      <section className="land-hero">
        <h1 className="reveal">
          <span className="h1-hand h1-pulse">סרטונים שמוכרים.</span>
        </h1>
        <p className="rise land-sub" style={{ animationDelay: "0.65s" }}>
          מתמונה, הדמיה או תוכנית לסרטון ממותג של הנכס, תוך דקות.
        </p>
        <div className="rise hp-wrap" style={{ animationDelay: "0.8s" }}>
          <HeroPrompt />
        </div>
      </section>


      <section className="land-show" aria-label="סרטונים שנוצרו">
        <div className="marquee">
          <div className="marquee-track">
            {[...SHOWCASE, ...SHOWCASE].map((src, i) => (
              <LoopVideo key={i} src={src} className="land-reel" />
            ))}
          </div>
        </div>
      </section>

      <section className="land-steps" aria-labelledby="steps-title">
        <h2 id="steps-title">איך זה עובד</h2>
        <ol>
          {STEPS.map((s, i) => (
            <li key={s.t}>
              <span className="land-num">{i + 1}</span>
              <b>{s.t}</b>
              <p>{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="land-renders">
        <div>
          <h2>עוד אין תמונות?</h2>
          <p>
            מעלים תוכנית דירה, כמה תמונות השראה ומשפט על הנכס. אנחנו מציעים חללים ויוצרים הדמיה לכל אחד, באותו סגנון. על הסרטון
            יופיע &quot;הדמיה להמחשה בלבד&quot;, כמו שצריך.
          </p>
          <Link className="btn btn-light" href="/projects">
            מעלים תוכנית
          </Link>
        </div>
        <LoopVideo src={PLAN_CLIP} className="land-plan" />
      </section>

      <section className="land-features">
        {FEATURES.map((f) => (
          <div key={f.t}>
            <b>{f.t}</b>
            <p>{f.d}</p>
          </div>
        ))}
      </section>

      <section className="land-end">
        <h2>הנכס הבא שלכם יכול לעלות לאוויר כבר היום</h2>
        <a className="btn btn-primary btn-breathe" href="#start">
          התחילו בחינם
        </a>
        <p className="fine">התצוגה המקדימה בסטודיו חינמית, גם בלי מנוי.</p>
      </section>
    </main>
  );
}
