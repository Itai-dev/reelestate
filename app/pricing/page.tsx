import Link from "next/link";
import type { Metadata } from "next";
import { CREDITS_PER_CLIP, CREDITS_PER_REEL, PACKS, PLANS, ils, type PackId, type PlanId } from "@/lib/plans";
import { QUALITIES, type Quality } from "@/lib/presets";
import { authConfigured, currentUser, ensureProfile } from "@/lib/supabase";

export const metadata: Metadata = { title: "מחירים — Reel Estate" };
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  let currentPlan: string | null = null;
  if (authConfigured()) {
    const user = await currentUser().catch(() => null);
    if (user) {
      const p = await ensureProfile(user).catch(() => null);
      if (p && (p.sub_status === "active" || p.sub_status === "past_due")) currentPlan = p.plan;
    }
  }

  return (
    <main className="page pricing">
      <header className="page-head">
        <h1>משלמים לפי כמה סרטונים מייצרים</h1>
        <p>
          כל מסלול כולל קרדיטים לחודש. Reel של 6 חללים לוקח בערך {CREDITS_PER_REEL} קרדיטים. התצוגה המקדימה בסטודיו חינמית, גם בלי מנוי.
        </p>
      </header>

      <section className="plans" aria-label="מסלולים">
        {(Object.keys(PLANS) as PlanId[]).map((id) => {
          const p = PLANS[id];
          const reels = Math.floor(p.credits / CREDITS_PER_REEL);
          const isCurrent = currentPlan === id;
          return (
            <article key={id} className={`plan${p.featured ? " plan-featured" : ""}`}>
              <h2>{p.name}</h2>
              <p className="plan-who">{p.who}</p>
              <p className="plan-price">
                <b>{ils(p.price)}</b> <span>לחודש</span>
              </p>
              <p className="plan-reel">
                כ-{reels} Reels בחודש, {ils(Math.round(p.price / reels))} ל-⁠Reel
              </p>
              <ul>
                {p.perks.map((perk) => (
                  <li key={perk}>{perk}</li>
                ))}
              </ul>
              {isCurrent ? (
                <span className="btn btn-current">המסלול שלך</span>
              ) : (
                <Link className={`btn ${p.featured ? "btn-primary" : "btn-outline"}`} href={`/checkout?product=${id}`}>
                  {currentPlan ? `מעבר למסלול ${p.name}` : `הצטרפות למסלול ${p.name}`}
                </Link>
              )}
            </article>
          );
        })}
      </section>

      <section className="packs" id="packs" aria-labelledby="packs-title">
        <div>
          <h2 id="packs-title">קרדיטים נוספים</h2>
          <p>לא פגים. נכנסים לשימוש אחרי שקרדיטי המסלול של החודש נגמרים.</p>
        </div>
        <div className="pack-list">
          {(Object.keys(PACKS) as PackId[]).map((id) => (
            <div key={id} className="pack">
              <b>{PACKS[id].name}</b>
              <span>{ils(PACKS[id].price)}</span>
              <Link className="btn btn-outline btn-small" href={`/checkout?product=${id}`}>
                קנייה
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="credit-table" aria-labelledby="credits-title">
        <h2 id="credits-title">מה עולה כמה</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">איכות</th>
              <th scope="col">מתי לבחור בה</th>
              <th scope="col">קרדיטים לחלל (5 שניות)</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(QUALITIES) as Quality[]).map((q) => (
              <tr key={q}>
                <td className="cell-start">
                  <b>{QUALITIES[q].he}</b>
                </td>
                <td>{QUALITIES[q].note}</td>
                <td>{CREDITS_PER_CLIP[QUALITIES[q].model]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="fine">קליפ שנכשל לא יורד מהיתרה: הקרדיטים חוזרים אוטומטית.</p>
      </section>

      <section className="faq" id="faq" aria-labelledby="faq-title">
        <h2 id="faq-title">שאלות</h2>
        <details>
          <summary>מה קורה לקרדיטים שלא השתמשתי בהם?</summary>
          <p>קרדיטי המסלול מתחדשים בכל חודש ולא מצטברים. קרדיטים שקניתם בנפרד נשארים עד שתשתמשו בהם.</p>
        </details>
        <details>
          <summary>איך מבטלים?</summary>
          <p>בעמוד החשבון, בלחיצה אחת. החיוב החודשי נעצר מיד, והקרדיטים נשארים זמינים עד סוף התקופה ששולמה.</p>
        </details>
        <details>
          <summary>איך משלמים?</summary>
          <p>בעמוד התשלום המאובטח של Grow (משולם). אנחנו לא רואים ולא שומרים את פרטי הכרטיס.</p>
        </details>
        <details>
          <summary>אפשר להחליף מסלול?</summary>
          <p>כן. בוחרים מסלול אחר כאן, והמנוי הקודם מתבטל ברגע שהחדש מתחיל.</p>
        </details>
        <details>
          <summary>הסרטונים שלי?</summary>
          <p>הסרטונים שלכם, לשימוש מסחרי ללא הגבלה. הקליפים נשמרים בדפדפן שבו יצרתם אותם, אז כדאי לייצא ולשמור את ה-⁠Reel.</p>
        </details>
      </section>
    </main>
  );
}
