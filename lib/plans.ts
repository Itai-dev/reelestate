// What we sell. Change prices and credit amounts here; the pricing page,
// checkout and billing all read from this file.
import type { EditKey, ModelKey } from "./presets";

export type PlanId = "starter" | "pro" | "studio";
export type PackId = "pack30" | "pack100";

// Prices in ILS. Itai is an עוסק פטור, so there is no VAT on top.
export const PLANS: Record<
  PlanId,
  { name: string; price: number; credits: number; who: string; perks: string[]; featured?: boolean }
> = {
  starter: {
    name: "סוכן",
    price: 349,
    credits: 90,
    who: "לסוכן שמשווק כמה נכסים בחודש",
    perks: ["90 קרדיטים בחודש", "כל הפורמטים: Reel, פיד, אתר", "מיתוג מלינק ושינויים בשורה אחת"],
  },
  pro: {
    name: "משרד",
    price: 790,
    credits: 210,
    who: "למשרד תיווך עם כמה סוכנים",
    perks: ["210 קרדיטים בחודש", "כל מה שבמסלול סוכן", "הדמיות מתוכנית לנכסים שעוד לא נבנו"],
    featured: true,
  },
  studio: {
    name: "יזם",
    price: 1690,
    credits: 480,
    who: "ליזמים ולמשווקי פרויקטים",
    perks: ["480 קרדיטים בחודש", "כל מה שבמסלול משרד", "עדיפות בתמיכה"],
  },
};

export const PACKS: Record<PackId, { name: string; price: number; credits: number }> = {
  pack30: { name: "30 קרדיטים", price: 129, credits: 30 },
  pack100: { name: "100 קרדיטים", price: 390, credits: 100 },
};

// Credits charged for one 5-second clip. One credit ≈ $0.47–0.50 of AI cost.
export const CREDITS_PER_CLIP: Record<ModelKey, number> = {
  seedance720: 5,
  seedance1080: 12,
  wan720: 1,
  wan1080: 2,
};

// Credits charged for one chat edit of a 5-second clip.
export const CREDITS_PER_EDIT: Record<EditKey, number> = { edit720: 1, edit1080: 2 };

// Credits charged for one interior render.
export const CREDITS_PER_RENDER = 1;

// A typical reel: about 6 spaces at standard quality.
export const CREDITS_PER_REEL = 6 * CREDITS_PER_CLIP.wan720;

export const PERIOD_DAYS = 31;

export const isPlanId = (v: unknown): v is PlanId => typeof v === "string" && v in PLANS;
export const isPackId = (v: unknown): v is PackId => typeof v === "string" && v in PACKS;

export function product(id: string) {
  if (isPlanId(id)) return { kind: "subscription" as const, id, name: `מסלול ${PLANS[id].name}`, price: PLANS[id].price, credits: PLANS[id].credits };
  if (isPackId(id)) return { kind: "topup" as const, id, name: PACKS[id].name, price: PACKS[id].price, credits: PACKS[id].credits };
  return null;
}

export const ils = (n: number) => `₪${n.toLocaleString("he-IL")}`;
