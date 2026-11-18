// What we sell. Change prices and credit amounts here; the pricing page,
// checkout and billing all read from this file.
import type { ModelKey } from "./presets";

export type PlanId = "starter" | "pro" | "studio";
export type PackId = "pack30" | "pack100";

// Prices in ILS. Itai is an עוסק פטור, so there is no VAT on top.
export const PLANS: Record<
  PlanId,
  { name: string; price: number; credits: number; who: string; perks: string[]; featured?: boolean }
> = {
  starter: {
    name: "סוכן",
    price: 149,
    credits: 60,
    who: "לסוכן שמשווק כמה נכסים בחודש",
    perks: ["60 קרדיטים בחודש", "כל הפורמטים: רילס, פיד, אתר", "לוגו, מחיר וטלפון על הסרטון"],
  },
  pro: {
    name: "משרד",
    price: 349,
    credits: 160,
    who: "למשרד תיווך עם כמה סוכנים",
    perks: ["160 קרדיטים בחודש", "כל מה שבמסלול סוכן", "מודל פרימיום לנכסי יוקרה"],
    featured: true,
  },
  studio: {
    name: "יזם",
    price: 790,
    credits: 400,
    who: "ליזמים ולמשווקי פרויקטים",
    perks: ["400 קרדיטים בחודש", "כל מה שבמסלול משרד", "עדיפות בתמיכה"],
  },
};

export const PACKS: Record<PackId, { name: string; price: number; credits: number }> = {
  pack30: { name: "30 קרדיטים", price: 99, credits: 30 },
  pack100: { name: "100 קרדיטים", price: 290, credits: 100 },
};

// Credits charged for one 5-second clip, by model. One credit ≈ $0.28–0.35 of AI cost.
export const CREDITS_PER_CLIP: Record<ModelKey, number> = {
  fast: 1,
  quality: 2,
  premium: 5,
};

// A typical reel: about 6 spaces in the quality model.
export const CREDITS_PER_REEL = 6 * CREDITS_PER_CLIP.quality;

export const PERIOD_DAYS = 31;

export const isPlanId = (v: unknown): v is PlanId => typeof v === "string" && v in PLANS;
export const isPackId = (v: unknown): v is PackId => typeof v === "string" && v in PACKS;

export function product(id: string) {
  if (isPlanId(id)) return { kind: "subscription" as const, id, name: `מסלול ${PLANS[id].name}`, price: PLANS[id].price, credits: PLANS[id].credits };
  if (isPackId(id)) return { kind: "topup" as const, id, name: PACKS[id].name, price: PACKS[id].price, credits: PACKS[id].credits };
  return null;
}

export const ils = (n: number) => `₪${n.toLocaleString("he-IL")}`;
