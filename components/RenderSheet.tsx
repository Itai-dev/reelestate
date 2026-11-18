"use client";

import { useState } from "react";
import Sheet from "./Sheet";
import Thinking from "./Thinking";
import { normalize } from "@/lib/image";
import { checkGeneration, fetchVideo, readPlan, startRender, uploadImage, type PlanSpace } from "@/lib/api";
import type { RoomId } from "@/lib/presets";

type Props = {
  open: boolean;
  onClose: () => void;
  aspect: string;
  costLine: string;
  onAdd: (blob: Blob, room: RoomId) => Promise<void>;
};

type Space = PlanSpace & { on: boolean; state?: "wait" | "work" | "done" | "error"; preview?: string };

const toRenderAspect: Record<string, string> = { "9:16": "9:16", "4:5": "3:4", "1:1": "1:1", "16:9": "16:9" };

// "I don't have photos yet": plan + references + a sentence become a set of renders.
export default function RenderSheet(p: Props) {
  const [plan, setPlan] = useState<File | null>(null);
  const [refs, setRefs] = useState<File[]>([]);
  const [brief, setBrief] = useState("");
  const [phase, setPhase] = useState<"input" | "reading" | "choose" | "rendering">("input");
  const [style, setStyle] = useState("");
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [urls, setUrls] = useState<{ plan?: string; refs: string[] }>({ refs: [] });
  const [error, setError] = useState("");

  const upload = async (f: File) => uploadImage((await normalize(f, 2000)).blob);

  const read = async () => {
    setError("");
    setPhase("reading");
    try {
      const planUrl = plan ? await upload(plan) : undefined;
      const refUrls = await Promise.all(refs.slice(0, 5).map(upload));
      setUrls({ plan: planUrl, refs: refUrls });
      const r = await readPlan({ plan: planUrl, refs: refUrls, brief });
      setStyle(r.style);
      setSpaces(r.spaces.map((s) => ({ ...s, on: true })));
      setPhase("choose");
    } catch (e) {
      setError(e instanceof Error ? e.message : "משהו נכשל");
      setPhase("input");
    }
  };

  const render = async () => {
    const chosen = spaces.map((s, i) => ({ s, i })).filter((x) => x.s.on);
    if (!chosen.length) return;
    setPhase("rendering");
    const refList = [...urls.refs, ...(urls.plan ? [urls.plan] : [])];
    const patch = (i: number, v: Partial<Space>) => setSpaces((xs) => xs.map((x, k) => (k === i ? { ...x, ...v } : x)));
    await Promise.all(
      chosen.map(async ({ s, i }) => {
        patch(i, { state: "work" });
        const prompt = [
          "Photorealistic professional real-estate photograph, as shot by an architectural photographer.",
          s.scene,
          style ? `Shared style of the whole project: ${style}` : "",
          urls.refs.length ? "Match the materials, colour palette and mood of the reference photos." : "",
          urls.plan ? "The last image is a floor plan, for layout only: follow its window positions, openings and proportions. Do not draw the plan itself; create a new photograph." : "",
          "Natural light, straight vertical lines, 24mm lens at eye level, tidy and staged, no people, no text, no watermark, no logos.",
          brief ? `Developer's notes: ${brief}` : "",
        ]
          .filter(Boolean)
          .join(" ");
        try {
          const { requestId, model } = await startRender(prompt, refList, toRenderAspect[p.aspect] ?? "9:16");
          for (let n = 0; n < 90; n++) {
            await new Promise((r) => setTimeout(r, 3000));
            const st = await checkGeneration(model, requestId).catch(() => null);
            if (!st || st.status === "queued" || st.status === "rendering") continue;
            if (st.status === "error") throw new Error(st.error);
            const blob = await fetchVideo(st.videoUrl);
            patch(i, { state: "done", preview: URL.createObjectURL(blob) });
            await p.onAdd(new File([blob], `${s.room}.jpg`, { type: blob.type || "image/jpeg" }), s.room as RoomId);
            return;
          }
          throw new Error("לקח יותר מדי זמן");
        } catch {
          patch(i, { state: "error" });
        }
      }),
    );
  };

  const working = spaces.filter((s) => s.state === "work").length;
  const doneCount = spaces.filter((s) => s.state === "done").length;
  const total = spaces.filter((s) => s.on).length;

  return (
    <Sheet open={p.open} onClose={p.onClose} title="יצירת הדמיות">
      {phase === "input" && (
        <div className="rs">
          <p className="fine">אין עדיין תמונות? מעלים תוכנית ורפרנסים, ונוצרות הדמיות לכל חלל באותו סגנון.</p>
          <div className="field">
            <span>תוכנית הדירה או הקומה</span>
            <label className="file">
              <input type="file" accept="image/*" hidden onChange={(e) => setPlan(e.target.files?.[0] ?? null)} />
              {plan ? plan.name : "העלאת תוכנית (תמונה או צילום מסך)"}
            </label>
          </div>
          <div className="field">
            <span>רפרנסים: סגנון, חומרים, הדמיות קיימות</span>
            <label className="file">
              <input type="file" accept="image/*" multiple hidden onChange={(e) => setRefs(Array.from(e.target.files ?? []).slice(0, 5))} />
              {refs.length ? `${refs.length} תמונות` : "העלאת עד 5 תמונות"}
            </label>
          </div>
          <label className="field">
            <span>כמה מילים על הנכס</span>
            <textarea rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="למשל: דירת 4 חדרים בקומה 12, סגנון ים-תיכוני, פרקט אלון, מטבח עם אי, נוף לים" />
          </label>
          {error && <p className="error-inline">{error}</p>}
          <button type="button" className="btn btn-primary" onClick={read} disabled={!plan && !refs.length && !brief.trim()}>
            המשך: הצעת חללים
          </button>
        </div>
      )}

      {phase === "reading" && <Thinking lines={["מעלה את הקבצים", "קורא את התוכנית", "מזהה חללים, חלונות ופתחים", "מסכם את הסגנון מהרפרנסים"]} />}

      {phase === "choose" && (
        <div className="rs">
          {style && <p className="fine" dir="ltr">{style}</p>}
          <ul className="rs-list">
            {spaces.map((s, i) => (
              <li key={i}>
                <label className="toggle">
                  <span>
                    <b>{s.title}</b>
                    <small dir="ltr">{s.scene}</small>
                  </span>
                  <input type="checkbox" role="switch" checked={s.on} onChange={(e) => setSpaces((xs) => xs.map((x, k) => (k === i ? { ...x, on: e.target.checked } : x)))} />
                </label>
              </li>
            ))}
          </ul>
          <p className="fine">{p.costLine.replace("{n}", String(total))}. ההדמיות מסומנות בסרטון "הדמיה להמחשה בלבד".</p>
          <button type="button" className="btn btn-primary" onClick={render} disabled={!total}>
            יצירת {total} הדמיות
          </button>
        </div>
      )}

      {phase === "rendering" && (
        <div className="rs">
          {working > 0 ? (
            <Thinking lines={["יוצר הדמיות", "שומר על אותו סגנון בכל החדרים", "מסדר אור וחומרים"]} progress={(doneCount + 0.2) / Math.max(1, total)} />
          ) : (
            <p>
              <b>{doneCount} הדמיות נוספו לפרויקט.</b>
            </p>
          )}
          <div className="rs-grid">
            {spaces
              .filter((s) => s.on)
              .map((s, i) => (
                <figure key={i} className={`rs-item is-${s.state}`}>
                  {s.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.preview} alt="" />
                  ) : (
                    <span className="rs-wait">{s.state === "error" ? "נכשל" : <span className="spinner" />}</span>
                  )}
                  <figcaption>{s.title}</figcaption>
                </figure>
              ))}
          </div>
          {working === 0 && (
            <button type="button" className="btn btn-primary" onClick={p.onClose}>
              להמשך עם ההדמיות
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}
