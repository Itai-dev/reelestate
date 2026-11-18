import type { Metadata } from "next";
import { BUSINESS } from "@/lib/business";

export const metadata: Metadata = { title: "פרטיות — Reel Estate" };

// Template policy. Have it reviewed by a lawyer before launch.
export default function PrivacyPage() {
  const b = BUSINESS;
  const contact = b.email || "כתובת המייל שבעמוד יצירת הקשר";
  return (
    <main className="page narrow legal">
      <h1>מדיניות פרטיות</h1>
      <p className="fine">עודכן ב-{b.updated}</p>

      <h2>מה אנחנו שומרים</h2>
      <ul>
        <li>מייל, שם ומספר נייד, כדי לנהל את החשבון ואת התשלומים.</li>
        <li>היסטוריית תשלומים, יתרת קרדיטים ורשימת הקליפים שנוצרו.</li>
        <li>עוגיות התחברות, כדי שתישארו מחוברים. אין עוגיות פרסום.</li>
      </ul>

      <h2>התמונות שלכם</h2>
      <p>
        תמונה שבחרתם ליצור ממנה וידאו נשלחת לספק המודלים fal.ai (ארה״ב), שמייצר את הקליפ. התמונות והקליפים נשמרים בדפדפן שלכם, ואנחנו לא
        שומרים עותק שלהם בשרתים שלנו.
      </p>

      <h2>עם מי אנחנו עובדים</h2>
      <ul>
        <li>Supabase: מסד הנתונים וההתחברות (שרתים באיחוד האירופי).</li>
        <li>Vercel: אירוח האתר.</li>
        <li>fal.ai: יצירת הווידאו.</li>
        <li>Grow (משולם): סליקה וקבלות. פרטי הכרטיס נמסרים ל-Grow בלבד.</li>
      </ul>

      <h2>הזכויות שלכם</h2>
      <p>
        אפשר לבקש לעיין במידע עליכם, לתקן אותו או למחוק את החשבון, בפנייה ל-{contact}. נענה תוך 30 יום. מידע שהחוק מחייב לשמור (למשל
        רשומות תשלום) יישמר לתקופה הנדרשת.
      </p>

      <h2>אחריות על המידע</h2>
      <p>
        {b.owner || "בעל העסק"}, {b.brand}. לפניות: {contact}.
      </p>
    </main>
  );
}
