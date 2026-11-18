import { createFalClient } from "@fal-ai/client";
import { MODELS, NEGATIVE_PROMPT, type ModelKey } from "./presets";

export type Mode = "live" | "demo" | "mock";

// live: FAL_KEY is set. demo: no key, previews only. mock: local testing of the
// generation flow without spending credits (FAL_MOCK=1).
export function mode(): Mode {
  if (process.env.FAL_MOCK === "1") return "mock";
  return process.env.FAL_KEY ? "live" : "demo";
}

let client: ReturnType<typeof createFalClient> | null = null;
export function fal() {
  if (!client) client = createFalClient({ credentials: process.env.FAL_KEY });
  return client;
}

// Optional shared password so a deployed app can't spend your credits for strangers.
export function guard(req: Request): Response | null {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return null;
  if (req.headers.get("x-app-password") === pw) return null;
  return Response.json({ error: "צריך סיסמת גישה נכונה" }, { status: 401 });
}

export function isModelKey(v: unknown): v is ModelKey {
  return typeof v === "string" && v in MODELS;
}

// Each model names its inputs a little differently.
export function modelInput(key: ModelKey, imageUrl: string, prompt: string) {
  const duration = "5";
  switch (key) {
    case "fast":
      return { prompt, image_url: imageUrl, duration, negative_prompt: NEGATIVE_PROMPT, cfg_scale: 0.5 };
    case "quality":
      return {
        prompt,
        start_image_url: imageUrl,
        duration,
        generate_audio: false,
        negative_prompt: NEGATIVE_PROMPT,
      };
    case "premium":
      return {
        prompt,
        image_url: imageUrl,
        duration,
        resolution: "720p",
        aspect_ratio: "auto",
        generate_audio: false,
      };
  }
}

export function errorMessage(e: unknown): string {
  const anyE = e as { body?: { detail?: unknown }; message?: string; status?: number };
  const detail = anyE?.body?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  if (anyE?.status === 401 || anyE?.status === 403) return "מפתח fal.ai לא תקין";
  if (anyE?.status === 402 || anyE?.status === 429) return "אין מספיק קרדיט בחשבון fal.ai או שהגעתם למגבלה";
  return anyE?.message || "שגיאה לא ידועה";
}
