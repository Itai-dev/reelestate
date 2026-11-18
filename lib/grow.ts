// Grow (formerly Meshulam) Light API: payment pages, server callbacks,
// recurring billing. Docs: https://developers.grow.business/
// All calls must come from the server; Grow blocks browser requests.

const BASE = process.env.GROW_ENV === "production" ? "https://secure.meshulam.co.il" : "https://sandbox.meshulam.co.il";
const API = `${BASE}/api/light/server/1.0`;

export function growConfigured() {
  return Boolean(process.env.GROW_USER_ID && process.env.GROW_PAGE_CODE_RECURRING && process.env.GROW_PAGE_CODE_ONETIME);
}

type GrowResponse = { status: number | string; err?: { id?: number; message?: string } | string; data?: Record<string, unknown> | string };

async function call(method: string, fields: Record<string, string | undefined>): Promise<GrowResponse> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== "") fd.append(k, v);
  const res = await fetch(`${API}/${method}`, { method: "POST", body: fd, cache: "no-store" });
  const json = (await res.json().catch(() => null)) as GrowResponse | null;
  if (!json) throw new Error(`Grow ${method}: no JSON (${res.status})`);
  return json;
}

function errText(r: GrowResponse) {
  if (typeof r.err === "string") return r.err;
  return r.err?.message || "שגיאה מצד חברת הסליקה";
}

// Grow rejects "special characters" in some fields, so ids travel without dashes.
export const compactId = (uuid: string) => uuid.replace(/-/g, "");
export const expandId = (hex: string) =>
  /^[0-9a-f]{32}$/i.test(hex) ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` : null;

export async function createPaymentProcess(o: {
  recurring: boolean;
  sum: number;
  description: string;
  fullName: string;
  phone: string;
  email?: string;
  paymentId: string;
  successUrl: string;
  cancelUrl: string;
  notifyUrl: string;
}) {
  const r = await call("createPaymentProcess", {
    pageCode: o.recurring ? process.env.GROW_PAGE_CODE_RECURRING : process.env.GROW_PAGE_CODE_ONETIME,
    userId: process.env.GROW_USER_ID,
    apiKey: process.env.GROW_API_KEY,
    sum: o.sum.toFixed(2),
    // For an open-ended monthly plan Grow may want a number of charges (2–48). Set GROW_RECURRING_CHARGES if they ask for one.
    paymentNum: o.recurring ? process.env.GROW_RECURRING_CHARGES : undefined,
    successUrl: o.successUrl,
    cancelUrl: o.cancelUrl,
    description: o.description,
    "pageField[fullName]": o.fullName,
    "pageField[phone]": o.phone,
    "pageField[email]": o.email,
    cField1: compactId(o.paymentId),
    notifyUrl: o.notifyUrl,
  });
  if (String(r.status) !== "1" || typeof r.data !== "object" || !r.data) throw new Error(errText(r));
  return {
    url: String(r.data.url),
    processId: String(r.data.processId),
    processToken: String(r.data.processToken),
  };
}

// Fields Grow expects back in approveTransaction (all taken from its notification).
const APPROVE_FIELDS = [
  "transactionId",
  "transactionToken",
  "transactionTypeId",
  "paymentType",
  "sum",
  "firstPaymentSum",
  "periodicalPaymentSum",
  "paymentsNum",
  "allPaymentsNum",
  "paymentDate",
  "asmachta",
  "description",
  "fullName",
  "payerPhone",
  "payerEmail",
  "cardSuffix",
  "cardType",
  "cardTypeCode",
  "cardBrand",
  "cardBrandCode",
  "cardExp",
  "processId",
  "processToken",
];

export async function approveTransaction(recurring: boolean, d: Record<string, unknown>) {
  const fields: Record<string, string | undefined> = {
    pageCode: recurring ? process.env.GROW_PAGE_CODE_RECURRING : process.env.GROW_PAGE_CODE_ONETIME,
  };
  for (const k of APPROVE_FIELDS) if (d[k] !== undefined && d[k] !== null) fields[k] = String(d[k]);
  return call("approveTransaction", fields);
}

// Stops a monthly charge (changeStatus 2 = canceled).
export async function cancelDirectDebit(t: { transactionId: string; transactionToken: string; asmachta: string }) {
  const r = await call("updateDirectDebit", {
    userId: process.env.GROW_USER_ID,
    apiKey: process.env.GROW_API_KEY,
    transactionId: t.transactionId,
    transactionToken: t.transactionToken,
    asmachta: t.asmachta,
    changeStatus: "2",
  });
  if (String(r.status) !== "1") throw new Error(errText(r));
}

// Grow posts form fields like data[transactionId] or data[customFields][cField1].
// This turns either form data or JSON into a plain nested object.
export async function readCallback(req: Request): Promise<Record<string, unknown>> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) return ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return out;
  }
  for (const [key, value] of form.entries()) {
    const path = key.replace(/\]/g, "").split("[");
    let node = out;
    path.forEach((part, i) => {
      if (i === path.length - 1) node[part] = String(value);
      else node = (node[part] = (node[part] as Record<string, unknown>) ?? {}) as Record<string, unknown>;
    });
  }
  return out;
}
