"use client";

import { useRef, useState } from "react";
import { ASPECTS, LIGHTS, MOTIONS, ROOMS, type Aspect, type LightId, type MotionId } from "@/lib/presets";
import { coverRect } from "@/lib/image";
import Sheet from "./Sheet";
import { statusLine } from "./ShotCard";
import { IconArrow, IconTrash } from "./Icons";
import { promptOf, type Shot } from "./types";
import Thinking from "./Thinking";

type Props = {
  open: boolean;
  shot: Shot;
  index: number;
  count: number;
  aspect: Aspect;
  img: string;
  vid?: string;
  stale: boolean;
  live: boolean;
  canGenerate: boolean;
  style?: string;
  onChange: (patch: Partial<Shot>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onGenerate: () => void;
  onEdit: (prompt: string, label: string) => void;
  onPickVersion: (url: string) => void;
  editCost: string;
  onClose: () => void;
};

const QUICK: { label: string; prompt: string }[] = [
  { label: "שעת זהב", prompt: "Relight the scene to golden-hour sunset: warm, low sunlight through the windows and a warm sky." },
  { label: "ערב, אורות דולקים", prompt: "Make it blue-hour evening: dusky sky outside and warm interior lights turned on." },
  { label: "שמיים כחולים", prompt: "Make the sky outside a clear bright blue with a few soft clouds." },
  { label: "בלי בלגן", prompt: "Remove clutter and small loose items from surfaces so the space looks clean and staged." },
  { label: "יותר צמחייה", prompt: "Add a few lush green potted plants that suit the space." },
];

export default function ShotSheet(p: Props) {
  const [view, setView] = useState<"video" | "frame">("video");
  return (
    <Sheet open={p.open} onClose={p.onClose} title={`צילום ${p.index + 1}`} wide>
      <Body {...p} view={view} setView={setView} />
    </Sheet>
  );
}

function Body(p: Props & { view: "video" | "frame"; setView: (v: "video" | "frame") => void }) {
  const { shot } = p;
  const src = p.vid ?? shot.videoUrl;
  const showVideo = Boolean(src) && shot.status === "done" && p.view === "video";
  const busy = shot.status === "preparing" || shot.status === "queued" || shot.status === "rendering";

  return (
    <div className="ed">
      <div className="ed-media">
        {showVideo ? (
          <video src={src} muted loop autoPlay playsInline className="ed-video" style={{ aspectRatio: `${ASPECTS[p.aspect].w} / ${ASPECTS[p.aspect].h}` }} />
        ) : (
          <Frame shot={shot} aspect={p.aspect} img={p.img} onFocus={(fx, fy) => p.onChange({ fx, fy })} />
        )}
        {src && shot.status === "done" ? (
          <div className="pills" role="tablist" aria-label="תצוגה">
            <button role="tab" aria-selected={p.view === "video"} onClick={() => p.setView("video")}>
              וידאו
            </button>
            <button role="tab" aria-selected={p.view === "frame"} onClick={() => p.setView("frame")}>
              מסגור
            </button>
          </div>
        ) : (
          <p className="hint">גררו על התמונה כדי לבחור מה ייכנס לפריים</p>
        )}
      </div>

      <div className="ed-controls">
        {(shot.versions?.length ?? 0) > 1 && (
          <div className="versions" aria-label="גרסאות של הקליפ">
            {shot.versions!.map((v, i) => (
              <button key={v.url} type="button" className="chip" aria-pressed={shot.videoUrl === v.url} onClick={() => p.onPickVersion(v.url)} disabled={busy}>
                {i === 0 ? "מקור" : v.label}
              </button>
            ))}
          </div>
        )}

        <section className="ed-group" aria-labelledby="ed-room">
          <h3 id="ed-room">איזה חלל זה</h3>
          <div className="chips">
            {ROOMS.map((r) => (
              <button
                key={r.id}
                type="button"
                className="chip"
                aria-pressed={shot.room === r.id}
                onClick={() => p.onChange({ room: r.id, motion: r.motion })}
              >
                {r.he}
              </button>
            ))}
          </div>
        </section>

        <section className="ed-group" aria-labelledby="ed-motion">
          <h3 id="ed-motion">תנועת מצלמה</h3>
          <div className="chips">
            {(Object.keys(MOTIONS) as MotionId[]).map((m) => (
              <button key={m} type="button" className="chip" aria-pressed={shot.motion === m} onClick={() => p.onChange({ motion: m })}>
                {MOTIONS[m].he}
              </button>
            ))}
          </div>
        </section>

        <section className="ed-group" aria-labelledby="ed-light">
          <h3 id="ed-light">אור</h3>
          <div className="lights">
            {(Object.keys(LIGHTS) as LightId[]).map((l) => (
              <button key={l} type="button" className="light" aria-pressed={shot.light === l} onClick={() => p.onChange({ light: l })}>
                <span className="sky" style={{ background: `linear-gradient(180deg, ${LIGHTS[l].sky[0]}, ${LIGHTS[l].sky[1]})` }} />
                {LIGHTS[l].he}
              </button>
            ))}
          </div>
        </section>

        <label className="toggle">
          <span>
            <b>תנועה עדינה בחלל</b>
            <small>וילונות וצמחים זזים ברוח</small>
          </span>
          <input type="checkbox" role="switch" checked={shot.life} onChange={(e) => p.onChange({ life: e.target.checked })} />
        </label>

        <details className="prompt">
          <summary>הפרומפט שנשלח למודל{shot.customPrompt ? " (נערך ידנית)" : ""}</summary>
          <textarea dir="ltr" rows={5} value={promptOf(shot, p.style)} onChange={(e) => p.onChange({ customPrompt: e.target.value })} />
          <div className="prompt-foot">
            <span>באנגלית עובד הכי טוב.</span>
            {shot.customPrompt && (
              <button type="button" className="link" onClick={() => p.onChange({ customPrompt: undefined })}>
                חזרה לפרומפט האוטומטי
              </button>
            )}
          </div>
        </details>

        <div className={`ed-status${shot.status === "error" ? " is-error" : ""}`} aria-live="polite">
          {busy && <span className="spinner" aria-hidden />}
          <span>
            <b>{statusLine(shot, p.stale, p.live)}</b>
            {shot.status === "rendering" && <small>לוקח בין דקה לחמש דקות, לפי המודל.</small>}
            {shot.status === "error" && shot.error && <small>{shot.error}</small>}
            {p.stale && <small>הווידאו נוצר לפני השינוי האחרון.</small>}
          </span>
          {p.canGenerate && !busy && (
            <button type="button" className="btn btn-dark btn-small" onClick={p.onGenerate}>
              {shot.status === "done" ? "יצירה מחדש" : shot.status === "error" ? "ניסיון נוסף" : "יצירת וידאו לחלל"}
            </button>
          )}
        </div>

        <div className="ed-tools">
          <button type="button" className="btn btn-quiet btn-small" onClick={() => p.onMove(-1)} disabled={p.index === 0}>
            <IconArrow className="flip" /> מוקדם יותר
          </button>
          <button type="button" className="btn btn-quiet btn-small" onClick={() => p.onMove(1)} disabled={p.index === p.count - 1}>
            <IconArrow /> מאוחר יותר
          </button>
          <button type="button" className="btn btn-quiet btn-small is-danger" onClick={p.onRemove}>
            <IconTrash /> מחיקה
          </button>
        </div>
      </div>
    </div>
  );
}

// The photo with the output frame drawn on it. Drag to move the frame.
function Frame(p: { shot: Shot; aspect: Aspect; img: string; onFocus: (fx: number, fy: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { shot } = p;
  const out = ASPECTS[p.aspect];
  const r = coverRect(shot.imgW, shot.imgH, out.w, out.h, shot.fx, shot.fy);
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;

  const fromEvent = (e: React.PointerEvent) => {
    const box = ref.current!.getBoundingClientRect();
    const fx = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    const fy = Math.min(1, Math.max(0, (e.clientY - box.top) / box.height));
    p.onFocus(Math.round(fx * 100) / 100, Math.round(fy * 100) / 100);
  };

  return (
    <div
      ref={ref}
      className="frame"
      style={{
        aspectRatio: `${shot.imgW} / ${shot.imgH}`,
        width: `min(100%, ${((46 * shot.imgW) / shot.imgH).toFixed(1)}vh)`,
        touchAction: r.h >= shot.imgH - 1 ? "pan-y" : r.w >= shot.imgW - 1 ? "pan-x" : "none",
      }}
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        fromEvent(e);
      }}
      onPointerMove={(e) => {
        if (e.buttons) fromEvent(e);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p.img} alt="" draggable={false} />
      <div className="frame-window" style={{ left: pct(r.x, shot.imgW), top: pct(r.y, shot.imgH), width: pct(r.w, shot.imgW), height: pct(r.h, shot.imgH) }} />
    </div>
  );
}

function EditBox(p: { shot: Shot; busy: boolean; cost: string; onEdit: (prompt: string, label: string) => void; onPick: (url: string) => void }) {
  const [text, setText] = useState("");
  const { shot } = p;
  const send = (prompt: string, label: string) => {
    if (!prompt.trim() || p.busy) return;
    p.onEdit(prompt.trim(), label);
    setText("");
  };
  return (
    <section className="editbox" aria-labelledby="ed-edit">
      <h3 id="ed-edit">שינוי בקליפ</h3>
      <p className="fine">כותבים מה לשנות, והקליפ נערך בלי לאבד את התנועה. {p.cost} לכל שינוי, וכל הגרסאות נשמרות.</p>
      {p.busy ? (
        <Thinking
          lines={[`מבצע: ${shot.editLabel ?? "שינוי"}`, "שומר על הקירות, הנוף ותנועת המצלמה", "בדרך כלל פחות מדקה"]}
        />
      ) : (
        <>
          <div className="chips">
            {QUICK.map((q) => (
              <button key={q.label} type="button" className="chip" onClick={() => send(q.prompt, q.label)}>
                {q.label}
              </button>
            ))}
          </div>
          <form
            className="editbox-form"
            onSubmit={(e) => {
              e.preventDefault();
              send(text, text.slice(0, 24));
            }}
          >
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="למשל: תחליף את הספה לספה ירוקה" aria-label="מה לשנות" />
            <button type="submit" className="btn btn-dark btn-small" disabled={!text.trim()}>
              שינוי
            </button>
          </form>
        </>
      )}
      {shot.editError && <p className="error-inline">{shot.editError}</p>}
      {(shot.versions?.length ?? 0) > 1 && (
        <div className="versions" aria-label="גרסאות">
          {shot.versions!.map((v, i) => (
            <button key={v.url} type="button" className="chip" aria-pressed={shot.videoUrl === v.url} onClick={() => p.onPick(v.url)} disabled={p.busy}>
              {i === 0 ? "מקור" : v.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
