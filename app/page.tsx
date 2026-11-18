import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Reel Estate — מתמונות של נכס לרילס ממותג",
  description: "מעלים תמונות או תוכנית, מדביקים לינק לאתר, ומקבלים רילס לנכס בשפה של המותג. שינויים בשורה אחת, גם בקול.",
};

const STEPS = [
  { t: "מעלים תמונות", d: "4 עד 10 תמונות של הנכס. אין עדיין? מעלים תוכנית ורפרנסים ונוצרות הדמיות." },
  { t: "מדביקים לינק לאתר", d: "הלוגו, הצבעים, הפונטים ושפת הצילום של המותג נכנסים לסרטון לבד." },
  { t: "מקבלים רילס", d: "תנועת מצלמה לכל חלל, טקסטים שנכתבים לבד, וכרטיס סיום עם קריאה לפעולה." },
];

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
        <LogoMark size={120} />
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
