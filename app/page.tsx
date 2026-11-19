import type { Metadata } from "next";
import Link from "next/link";
import LoopVideo from "@/components/LoopVideo";
import PhoneDemo from "@/components/PhoneDemo";

export const metadata: Metadata = {
  title: "Reel Estate — מתמונה של הנכס ל-Reel ממותג",
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
        <h1>
          מתמונה של הנכס ל-Reel שמוכר
          <span className="h1-line">בשפה של המותג שלכם</span>
        </h1>
        <p>
          לסוכנים, למשרדי תיווך וליזמים. בלי צלם וידאו ובלי עורך: התמונות שכבר צילמתם מספיקות.
        </p>
        <div className="land-cta">
          <Link className="btn btn-primary" href="/projects">
            מתחילים בחינם
          </Link>
        </div>
      </section>

      <section className="land-video" aria-label="מתמונה לסרטון">
        <PhoneDemo photo="/media/demo-photo.jpg" video="/clips/1e4754a1-3d46-4230-bf0c-5e5036db99b7.mp4" />
        <p className="fine">
          תמונה אחת, סרטון אחד, תוך כמה דקות.{" "}
          <a className="land-alt-link" href="/media/how-it-works.mp4">
            לסרטון ההדרכה המלא
          </a>
        </p>
      </section>

      <section className="land-show" aria-labelledby="show-title">
        <h2 id="show-title">ככה זה נראה</h2>
        <div className="land-reels">
          {SHOWCASE.map((src) => (
            <LoopVideo key={src} src={src} className="land-reel" />
          ))}
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
        <Link className="btn btn-primary" href="/projects">
          מתחילים בחינם
        </Link>
        <p className="fine">התצוגה המקדימה בסטודיו חינמית, גם בלי מנוי.</p>
      </section>
    </main>
  );
}
