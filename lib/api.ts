import type { EditKey, ModelKey } from "./presets";

const PW_KEY = "reel-estate:pw";

export function getPassword() {
  try {
    return localStorage.getItem(PW_KEY) ?? "";
  } catch {
    return "";
  }
}
export function setPassword(v: string) {
  try {
    localStorage.setItem(PW_KEY, v);
  } catch {}
}

function headers(): Record<string, string> {
  const pw = getPassword();
  return pw ? { "x-app-password": pw } : {};
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function json<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!res.ok) throw new ApiError(data.error || `שגיאת שרת (${res.status})`, data.code);
  return data as T;
}

export type Config = { mode: "live" | "demo" | "mock"; accounts: boolean; protected: boolean };
export const getConfig = () => fetch("/api/config").then((r) => json<Config>(r));

export async function uploadImage(blob: Blob): Promise<string> {
  const fd = new FormData();
  fd.append("file", blob, "shot.jpg");
  const r = await fetch("/api/upload", { method: "POST", body: fd, headers: headers() });
  return (await json<{ url: string }>(r)).url;
}

export async function startGeneration(model: ModelKey, imageUrl: string, prompt: string): Promise<string> {
  const r = await fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers() },
    body: JSON.stringify({ model, imageUrl, prompt }),
  });
  return (await json<{ requestId: string }>(r)).requestId;
}

export type GenStatus =
  | { status: "queued"; position?: number }
  | { status: "rendering" }
  | { status: "done"; videoUrl: string }
  | { status: "error"; error: string; refunded?: boolean };

export async function checkGeneration(model: ModelKey | EditKey, id: string): Promise<GenStatus> {
  const q = new URLSearchParams({ model, id });
  const r = await fetch(`/api/status?${q}`, { headers: headers() });
  return json<GenStatus>(r);
}

// Downloads a finished clip as a Blob (direct first, then through our proxy).
export async function fetchVideo(url: string): Promise<Blob> {
  if (url.startsWith("/")) {
    const r = await fetch(url);
    if (!r.ok) throw new Error("clip download failed");
    return r.blob();
  }
  const attempts: (() => Promise<Response>)[] = [() => fetch(url, { mode: "cors" })];
  const u = new URL(url);
  const m = /^(?:(v2|v3|v3b|v3c)\.)?fal\.media$/.exec(u.hostname);
  if (m) attempts.push(() => fetch(`/fal-media/${m[1] ?? "root"}${u.pathname}`));
  attempts.push(() => fetch(`/api/media?url=${encodeURIComponent(url)}`, { headers: headers() }));
  for (const go of attempts) {
    try {
      const r = await go();
      if (r.ok) return await r.blob();
    } catch {
      /* try the next route */
    }
  }
  throw new Error("clip download failed");
}

export async function readBrand(url: string): Promise<{ brand: import("./brand").Brand; logo: string | null }> {
  const r = await fetch("/api/brand", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers() },
    body: JSON.stringify({ url }),
  });
  return json(r);
}

export async function startEdit(videoUrl: string, prompt: string): Promise<string> {
  const r = await fetch("/api/edit", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers() },
    body: JSON.stringify({ model: "edit720", videoUrl, prompt }),
  });
  return (await json<{ requestId: string }>(r)).requestId;
}
