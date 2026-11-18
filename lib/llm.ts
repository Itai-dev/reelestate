// Small text tasks (copywriting, understanding a change request) on fal's LLM router.
import { fal } from "./server";

const MODEL = process.env.TEXT_MODEL || "google/gemini-2.5-flash";

export async function askJson<T>(system: string, prompt: string): Promise<T> {
  const res = await fal().subscribe("openrouter/router", {
    input: { model: MODEL, system_prompt: system, prompt, temperature: 0.5, max_tokens: 1200 } as never,
  });
  const out = String((res.data as { output?: string })?.output ?? "");
  const json = out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1);
  return JSON.parse(json) as T;
}
