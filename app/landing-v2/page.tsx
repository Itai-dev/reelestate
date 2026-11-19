import type { Metadata } from "next";
import Link from "next/link";
import LoopVideo from "@/components/LoopVideo";

export const metadata: Metadata = {
  robots: { index: false },
  title: "Reel Estate — Reel לנכס, גם לפני שהבניין קיים",
  description: "מתוכנית, הדמיה או תמונות של הנכס ל-Reel ממותג. מדביקים לינק לאתר, ומשנים כל דבר במשפט אחד.",
};

const clip = (ts: string, id: string) => `/showcase/hf_${ts}_${id}.mp4`;

// renders and models: the pre-sale story
const HERO = [
  clip("20261118_212948", "5ffe1c82-7d18-41c9-978f-200e0fe6c4c5"),
  clip("20261118_195406", "42b33b3a-74fc-4592-94ec-e77978c79e7f"),
  clip("20261118_214750", "618860f1-3ab7-464e-abe1-31ea7e2a3fc4"),
];
const MORE_RENDERS = [
  clip("20261118_142012", "bc31b50b-0fe4-4277-8b10-bb78e572d6c2"),
  clip("20261118_184546", "1b19ac0d-116e-4e31-b2b8-c7ab0eccc074"),
  clip("20261118_143201", "1b4e7d61-b9fc-4f06-8958-b4dab714b264"),
];
// existing homes: the agent story
const HOMES = [
  clip("20261118_211435", "1c76d183-e39d-4000-80e8-ce7d26a5baa7"),
  clip("20261118_152916", "2fe97cfa-03e2-4a64-9303-aa9272b35ff1"),
  clip("20261118_140402", "daa9986e-37b9-490d-b12b-3093a4b7f5e4"),
  clip("20261118_192217", "1ebd669c-e45b-46e3-8a56-c5e0c36353a6"),
];
const KITCHEN = clip("20261118_191047", "c5efb854-490c-4a0f-9ff0-3b3046adc4f2");

export default function Landing() {
  return (
    <main className="lp">
      {/* hero: the result first */}
      <section className="lp-hero">
        <div className="lp-hero-text">
          <h1>Reel לנכס, גם לפני שהבניין קיים</h1>
          <p>מתוכנית, מהדמיה או מתמונות של הנכס, לסרטון ממותג לסושיאל. בלי צלם, בלי עורך, באותו יום.</p>
          <div className="lp-cta">
            <Link className="btn btn-primary btn-lg" href="/studio">
              מתחילים בחינם
            </Link>
            <span className="lp-note">תצוגה מקדימה בלי כרטיס אשראי</span>
          </div>
        </div>
        <div className="lp-hero-reels">
          {HERO.map((src, i) => (
            <div key={src} className={`lp-phone lp-phone-${i}`}>
              <LoopVideo src={src} className="lp-video" />
            </div>
          ))}
        </div>
      </section>

      <section className="lp-strip" aria-label="עוד הדמיות">
        {MORE_RENDERS.map((src) => (
          <LoopVideo key={src} src={src} className="lp-strip-video" />
        ))}
      </section>

      {/* how it works, as the product itself */}
      <section className="lp-how" aria-labelledby="how-title">
        <h2 id="how-title">שלושה צעדים, עשר דקות</h2>

        <div className="lp-step">
          <div className="lp-step-text">
            <span className="lp-num">1</span>
            <h3>מעלים מה שיש</h3>
            <p>תמונות של הנכס, או תוכנית ורפרנסים אם עוד אין. כל תמונה הופכת לחלל בסיור.</p>
          </div>
          <div className="lp-mock lp-mock-cards" aria-hidden>
            <div className="m-card">
              <LoopVideo src={HOMES[1]} className="m-thumb" />
              <b>סלון</b>
              <small>דולי פנימה, יום</small>
            </div>
            <div className="m-card">
              <LoopVideo src={KITCHEN} className="m-thumb" />
              <b>מבואה</b>
              <small>הליכה פנימה, יום</small>
            </div>
            <div className="m-card m-plan">
              <div className="m-thumb m-plan-art">
                <i />
                <i />
                <i />
                <i />
              </div>
              <span className="m-tag">הדמיה</span>
              <b>מתוכנית</b>
              <small>6 חללים מוצעים</small>
            </div>
          </div>
        </div>

        <div className="lp-step">
          <div className="lp-step-text">
            <span className="lp-num">2</span>
            <h3>מדביקים לינק לאתר</h3>
            <p>הלוגו, הצבעים, הפונטים ושפת הצילום של המותג נכנסים לסרטון לבד. גם הטקסטים נכתבים בטון שלכם.</p>
          </div>
          <div className="lp-mock lp-mock-brand" aria-hidden>
            <div className="m-input">
              <span dir="ltr">yourcompany.co.il</span>
              <b>הבאת המיתוג</b>
            </div>
            <div className="m-kit">
              <div className="m-logo">
                <span className="m-logo-mark" />
                <b dir="ltr">Sela Living</b>
              </div>
              <div className="m-swatches">
                <i style={{ background: "#2f4a3a" }} />
                <i style={{ background: "#c8a46a" }} />
                <i style={{ background: "#e9e2d4" }} />
                <i style={{ background: "#1d1c19" }} />
              </div>
              <div className="m-vibe">
                <span>יוקרתי</span>
                <span>חם</span>
                <span>ים-תיכוני</span>
              </div>
            </div>
          </div>
        </div>

        <div className="lp-step">
          <div className="lp-step-text">
            <span className="lp-num">3</span>
            <h3>מקבלים Reel, ומשנים במשפט</h3>
            <p>טקסט שעוצר גלילה, תנועת מצלמה לכל חלל וכרטיס סיום עם קריאה לפעולה. רוצים שינוי? כותבים או אומרים אותו.</p>
          </div>
          <div className="lp-mock lp-mock-reel" aria-hidden>
            <div className="m-phone">
              <LoopVideo src={HOMES[0]} className="m-phone-video" />
              <span className="m-hook">4 חדרים מול הים</span>
              <span className="m-line">סלון פתוח לשקיעה</span>
            </div>
            <div className="m-change">
              <b>מה לשנות?</b>
              <div className="m-bar">
                <span>שקיעה במטבח, והמחיר 4.8 מיליון</span>
                <i className="m-mic" />
              </div>
              <p>
                <span className="m-ok" /> מטבח בשקיעה, מחיר עודכן
              </p>
            </div>
          </div>
        </div>

        <div className="lp-cta lp-cta-center">
          <Link className="btn btn-primary btn-lg" href="/studio">
            מנסים על נכס שלכם
          </Link>
        </div>
      </section>

      {/* who it is for */}
      <section className="lp-who">
        <article className="lp-who-card lp-who-dev">
          <h3>ליזמים</h3>
          <p>שיווק במכירה מוקדמת, לפני שיש מה לצלם. מתוכנית ורפרנסים לסרטון לכל דירה, מסומן &quot;הדמיה להמחשה בלבד&quot;.</p>
          <Link className="btn btn-light" href="/studio">
            יוצרים הדמיות מתוכנית
          </Link>
        </article>
        <article className="lp-who-card">
          <h3>לסוכנים ולמשרדים</h3>
          <p>כל נכס שנכנס לבלעדיות יוצא לאוויר עם Reel באותו יום, בשפה של המשרד.</p>
          <div className="lp-who-reels">
            {HOMES.slice(2).map((src) => (
              <LoopVideo key={src} src={src} className="lp-who-video" />
            ))}
          </div>
        </article>
      </section>

      <section className="lp-end">
        <h2>הנכס הבא שלכם יכול לצאת לאוויר היום</h2>
        <Link className="btn btn-primary btn-lg" href="/studio">
          מתחילים בחינם
        </Link>
        <Link className="link" href="/pricing">
          או רואים מחירים
        </Link>
      </section>

      <div className="lp-sticky">
        <Link className="btn btn-primary" href="/studio">
          מתחילים בחינם
        </Link>
      </div>
    </main>
  );
}
