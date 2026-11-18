import type { Metadata } from "next";
import Link from "next/link";
import LoopVideo from "@/components/LoopVideo";

export const metadata: Metadata = {
  title: "Reel Estate — מתמונות של נכס לרילס ממותג",
  description: "מעלים תמונות או תוכנית, מדביקים לינק לאתר, ומקבלים רילס לנכס בשפה של המותג. שינויים בשורה אחת, גם בקול.",
};

const STEPS = [
  { t: "מעלים תמונות", d: "4 עד 10 תמונות של הנכס. אין עדיין? מעלים תוכנית ורפרנסים ונוצרות הדמיות." },
  { t: "מדביקים לינק לאתר", d: "הלוגו, הצבעים, הפונטים ושפת הצילום של המותג נכנסים לסרטון לבד." },
  { t: "מקבלים רילס", d: "תנועת מצלמה לכל חלל, טקסטים שנכתבים לבד, וכרטיס סיום עם קריאה לפעולה." },
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
  { t: "כל הפורמטים", d: "רילס וסטורי, פיד, ריבוע ואתר. מאותו פרויקט, בלחיצה." },
];

export default function Landing() {
  return (
    <main className="land">
      <section className="land-hero">
        <h1>מתמונות של נכס לרילס שמוכר, בשפה של המותג שלכם</h1>
        <p>
          לסוכנים, למשרדי תיווך וליזמים. בלי צלם וידאו, בלי עורך, ובלי לחכות שבוע.
        </p>
        <div className="land-cta">
          <Link className="btn btn-primary" href="/studio">
            מתחילים, בחינם
          </Link>
          <Link className="btn btn-outline" href="/pricing">
            מחירים
          </Link>
        </div>
      </section>

      <section className="land-video" aria-label="איך זה עובד">
        <div className="land-frame">
          <video src="/media/how-it-works.mp4" poster="/media/how-it-works.jpg" controls playsInline preload="metadata" />
        </div>
        <p className="fine">איך זה עובד, בחצי דקה</p>
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
        <h2 id="steps-title">שלושה צעדים</h2>
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
            מעלים תוכנית דירה, רפרנסים לסגנון ומשפט על הנכס. המערכת מציעה חללים ויוצרת הדמיה לכל אחד, באותו סגנון. הסרטון מסומן
            &quot;הדמיה להמחשה בלבד&quot;.
          </p>
          <Link className="btn btn-light" href="/studio">
            מנסים עם תוכנית
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
        <h2>הנכס הבא שלכם יכול לצאת לאוויר היום</h2>
        <Link className="btn btn-primary" href="/studio">
          פותחים פרויקט
        </Link>
      </section>
    </main>
  );
}
