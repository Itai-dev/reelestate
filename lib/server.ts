import { createFalClient } from "@fal-ai/client";
import { EDITS, MODELS, NEGATIVE_PROMPT, RENDERS, TOUR_IMAGES, type EditKey, type ModelKey, type RenderKey, type TourKey } from "./presets";

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

export function isEditKey(v: unknown): v is EditKey {
  return typeof v === "string" && v in EDITS;
}

export const isRenderKey = (v: unknown): v is RenderKey => typeof v === "string" && v in RENDERS;
export const isTourKey = (v: unknown): v is TourKey => typeof v === "string" && v in TOUR_IMAGES;
export type JobKey = ModelKey | EditKey | RenderKey | TourKey;
export const isJobKey = (v: unknown): v is JobKey => isModelKey(v) || isEditKey(v) || isRenderKey(v) || isTourKey(v);
export const jobEndpoint = (k: JobKey) =>
  isEditKey(k) ? EDITS[k].endpoint : isRenderKey(k) ? RENDERS[k].endpoint : isTourKey(k) ? TOUR_IMAGES[k].endpoint : MODELS[k].endpoint;

// Edits only take clips that already live on fal's storage, so the key can't be used
// to process arbitrary videos from the web.
export function isFalMediaUrl(v: unknown): v is string {
  if (typeof v !== "string") return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && (u.hostname === "fal.media" || u.hostname.endsWith(".fal.media"));
  } catch {
    return false;
  }
}

// Each model names its inputs a little differently. Both get a frame that is
// already cropped to the output format, so the aspect ratio follows the image.
// With an end image the clip travels from the first frame to that one (the
// tour's camera approach).
export function modelInput(key: ModelKey, imageUrl: string, prompt: string, endImageUrl?: string) {
  const m = MODELS[key];
  const end = endImageUrl ? { end_image_url: endImageUrl } : {};
  if (m.family === "seedance") {
    return {
      prompt,
      image_url: imageUrl,
      ...end,
      duration: "5",
      resolution: m.resolution,
      aspect_ratio: "auto",
      generate_audio: false,
    };
  }
  return {
    prompt: `${prompt} Avoid: ${NEGATIVE_PROMPT}.`,
    start_image_url: imageUrl,
    ...end,
    duration: 5,
    resolution: m.resolution,
    aspect_ratio: "adaptive",
    audio: false,
    enable_prompt_expansion: false,
  };
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
