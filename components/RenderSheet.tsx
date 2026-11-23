"use client";

import { useEffect, useState } from "react";
import Sheet from "./Sheet";
import Thinking from "./Thinking";
import { normalize } from "@/lib/image";
import { checkGeneration, fetchVideo, readPlan, startRender, uploadImage, type PlanSpace } from "@/lib/api";
import type { RoomId } from "@/lib/presets";
import { roomIdOf, stillFinishPrompt, type Layout } from "@/lib/layout";
import type { PanoUpload } from "./useTour";

type Props = {
  open: boolean;
  onClose: () => void;
  aspect: string;
  costLine: string;
  onAdd: (blob: Blob, room: RoomId) => Promise<string>; // the id the render got in the project
  // 360° images of the same rooms, rendered from the 3D model, for the tour
  onPanos?: (panos: PanoUpload[]) => void;
  initialBrief?: string;
};

// id: the room of the layout this space is, when the renders come from a 3D model
type Space = PlanSpace & { id?: string; on: boolean; state?: "wait" | "work" | "done" | "error"; preview?: string };
const uid = () => `u${Math.random().toString(36).slice(2, 10)}`;

// Follows one render to its end and returns the image, with its address at the model's storage.
async function finished(job: { requestId: string; model: Parameters<typeof checkGeneration>[0] }): Promise<{ blob: Blob; url: string }> {
  for (let n = 0; n < 90; n++) {
    await new Promise((r) => setTimeout(r, 3000));
    const st = await checkGeneration(job.model, job.requestId).catch(() => null);
    if (!st || st.status === "queued" || st.status === "rendering") continue;
    if (st.status === "error") throw new Error(st.error);
    return { blob: await fetchVideo(st.videoUrl), url: st.videoUrl };
  }
  throw new Error("לקח יותר מדי זמן");
}

const toRenderAspect: Record<string, string> = { "9:16": "9:16", "4:5": "3:4", "1:1": "1:1", "16:9": "16:9" };

// "I don't have photos yet": plan + references + a sentence become a set of renders.
export default function RenderSheet(p: Props) {
  const [plan, setPlan] = useState<File | null>(null);
  const [refs, setRefs] = useState<File[]>([]);
  const [brief, setBrief] = useState("");
  useEffect(() => {
    if (p.open && p.initialBrief && !brief) setBrief(p.initialBrief);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.open, p.initialBrief]);
  const [phase, setPhase] = useState<"input" | "reading" | "choose" | "building" | "rendering">("input");
  // With a layout, a 3D model of the apartment is built first and every render starts
  // from a picture of it, so all the rooms are one apartment. Without, as before.
  const [layout, setLayout] = useState<Layout | null>(null);
  const [panos, setPanos] = useState(true);
  const [panoCount, setPanoCount] = useState(0);
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
      setLayout(r.layout ?? null);
      if (r.layout) {
        const { shownRooms } = await import("@/lib/plan3d");
        setSpaces(shownRooms(r.layout).map((room) => ({ id: room.id, room: roomIdOf(room.type), title: room.title || room.id, scene: "", on: true })));
      } else setSpaces(r.spaces.map((s) => ({ ...s, on: true })));
      setPhase("choose");
    } catch (e) {
      setError(e instanceof Error ? e.message : "משהו נכשל");
      setPhase("input");
    }
  };

  // From the 3D model: a picture of every chosen room, each made into a photograph.
  // The first one sets the look, and the others are shown it, so materials match.
  const renderFrom3d = async (plan3d: Layout) => {
    const chosen = spaces.map((s, i) => ({ s, i })).filter((x) => x.s.on && x.s.id);
    if (!chosen.length) return;
    setError("");
    setPhase("building");
    const patch = (i: number, v: Partial<Space>) => setSpaces((xs) => xs.map((x, k) => (k === i ? { ...x, ...v } : x)));
    let shots: import("@/lib/plan3d").PlanShot[];
    try {
      const { renderPlan } = await import("@/lib/plan3d");
      const [aw, ah] = p.aspect.split(":").map(Number);
      shots = await renderPlan(plan3d, { rooms: chosen.map((x) => x.s.id!), aspect: [aw || 9, ah || 16], panos });
    } catch {
      setError("המודל התלת-ממדי לא נבנה בדפדפן הזה. נסו דפדפן אחר או מחשב.");
      setPhase("choose");
      return;
    }
    chosen.forEach(({ s, i }) => {
      const shot = shots.find((x) => x.id === s.id);
      patch(i, { state: "wait", preview: shot ? URL.createObjectURL(shot.still) : undefined });
    });
    setPhase("rendering");
    const made = new Map<string, string>(); // room of the layout -> its render in the project
    const one = async ({ s, i }: (typeof chosen)[number], guide?: string) => {
      const shot = shots.find((x) => x.id === s.id);
      if (!shot) return patch(i, { state: "error" });
      patch(i, { state: "work" });
      try {
        const base = await uploadImage(shot.still);
        const prompt = stillFinishPrompt({ style, guided: Boolean(guide), refs: urls.refs.length, notes: brief });
        const done = await finished(await startRender(prompt, [...(guide ? [guide] : []), ...urls.refs], p.aspect, base));
        patch(i, { state: "done", preview: URL.createObjectURL(done.blob) });
        made.set(s.id!, await p.onAdd(new File([done.blob], `${s.room}.jpg`, { type: done.blob.type || "image/jpeg" }), s.room as RoomId));
        return done.url;
      } catch {
        patch(i, { state: "error" });
      }
    };
    const first = chosen.find((x) => x.s.room === "living") ?? chosen[0];
    const guide = (await one(first)) || undefined;
    await Promise.all(chosen.filter((x) => x !== first).map((x) => one(x, guide)));
    const forTour: PanoUpload[] = [];
    for (const { s } of chosen) {
      const shot = shots.find((x) => x.id === s.id);
      if (shot?.pano) forTour.push({ id: uid(), title: s.title, blob: shot.pano, finish: true, of: made.get(s.id!), at: shot.at });
    }
    setPanoCount(forTour.length);
    if (forTour.length) p.onPanos?.(forTour);
  };

  const render = async () => {
    if (layout) return renderFrom3d(layout);
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
          const { blob } = await finished(await startRender(prompt, refList, toRenderAspect[p.aspect] ?? "9:16"));
          patch(i, { state: "done", preview: URL.createObjectURL(blob) });
          await p.onAdd(new File([blob], `${s.room}.jpg`, { type: blob.type || "image/jpeg" }), s.room as RoomId);
        } catch {
          patch(i, { state: "error" });
        }
      }),
    );
  };

  const working = spaces.filter((s) => s.on && (s.state === "work" || s.state === "wait")).length;
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
          {layout && <p className="fine">מהתוכנית נבנה מודל תלת-ממדי של הדירה, וכל הדמיה מצולמת מתוכו. כך כל החדרים הם אותה דירה, מכל זווית.</p>}
          {style && <p className="fine" dir="ltr">{style}</p>}
          <ul className="rs-list">
            {spaces.map((s, i) => (
              <li key={i}>
                <label className="toggle">
                  <span>
                    <b>{s.title}</b>
                    {s.scene && <small dir="ltr">{s.scene}</small>}
                  </span>
                  <input type="checkbox" role="switch" checked={s.on} onChange={(e) => setSpaces((xs) => xs.map((x, k) => (k === i ? { ...x, on: e.target.checked } : x)))} />
                </label>
              </li>
            ))}
          </ul>
          {layout && p.onPanos && (
            <label className="toggle">
              <span>
                <b>גם מבט 360° לכל חלל</b>
                <small>מאותו מודל, לסיור האינטראקטיבי. מחכה במסך הסיור, בלי עלות עד שיוצרים אותו.</small>
              </span>
              <input id="rs-panos" type="checkbox" role="switch" checked={panos} onChange={(e) => setPanos(e.target.checked)} />
            </label>
          )}
          {error && <p className="error-inline">{error}</p>}
          <p className="fine">{p.costLine.replace("{n}", String(total))}. ההדמיות מסומנות בסרטון "הדמיה להמחשה בלבד".</p>
          <button type="button" className="btn btn-primary" onClick={render} disabled={!total}>
            יצירת {total} הדמיות
          </button>
        </div>
      )}

      {phase === "building" && <Thinking lines={["בונה את הדירה בתלת-ממד", "מציב קירות, דלתות וחלונות", "מרהט כל חדר", "מצלם כל חלל מתוך המודל"]} />}

      {phase === "rendering" && (
        <div className="rs">
          {working > 0 ? (
            <Thinking lines={["יוצר הדמיות", "שומר על אותו סגנון בכל החדרים", "מסדר אור וחומרים"]} progress={(doneCount + 0.2) / Math.max(1, total)} />
          ) : (
            <p>
              <b>{doneCount} הדמיות נוספו לפרויקט.</b>
              {panoCount > 0 && ` ${panoCount} מבטי 360° מחכים במסך הסיור.`}
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
