"use client";

import { useRef, useState } from "react";
import { ASPECTS, LIGHTS, MOTIONS, ROOMS, type Aspect, type LightId, type MotionId, type RoomId } from "@/lib/presets";
import { coverRect } from "@/lib/image";
import { promptOf, sigOf, type Shot } from "./types";

type Props = {
  shot: Shot;
  index: number;
  count: number;
  aspect: Aspect;
  img: string;
  vid?: string;
  canGenerate: boolean;
  onChange: (patch: Partial<Shot>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onGenerate: () => void;
};

const pad = (n: number) => String(n).padStart(2, "0");

export default function ShotCard(p: Props) {
  const { shot, aspect } = p;
  const [view, setView] = useState<"video" | "frame">("video");
  const showVideo = Boolean(p.vid || shot.videoUrl) && view === "video";
  const stale = shot.status === "done" && shot.genSig !== sigOf(shot, aspect);
  const busy = shot.status === "preparing" || shot.status === "queued" || shot.status === "rendering";

  return (
    <article className="shot" aria-label={`צילום ${p.index + 1}`}>
      <div className="shot-index" aria-hidden>
        {pad(p.index + 1)}
      </div>

      <div className="shot-media">
        {showVideo ? (
          <video
            className="shot-video"
            style={{ aspectRatio: `${ASPECTS[aspect].w} / ${ASPECTS[aspect].h}` }}
            src={p.vid ?? shot.videoUrl}
            muted
            loop
            autoPlay
            playsInline
          />
        ) : (
          <Frame shot={shot} aspect={aspect} img={p.img} onFocus={(fx, fy) => p.onChange({ fx, fy })} />
        )}
        {(p.vid || shot.videoUrl) && (
          <div className="seg seg-small" role="tablist" aria-label="תצוגה">
            <button role="tab" aria-selected={view === "video"} onClick={() => setView("video")}>
              וידאו
            </button>
            <button role="tab" aria-selected={view === "frame"} onClick={() => setView("frame")}>
              מסגור
            </button>
          </div>
        )}
        {!showVideo && <p className="hint">גררו על התמונה כדי לבחור מה ייכנס לפריים</p>}
      </div>

      <div className="shot-controls">
        <div className="row-2">
          <label className="field">
            <span>חלל</span>
            <select
              value={shot.room}
              onChange={(e) => {
                const room = e.target.value as RoomId;
                const def = ROOMS.find((r) => r.id === room)!.motion;
                p.onChange({ room, motion: def });
              }}
            >
              {ROOMS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.he}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>תנועת מצלמה</span>
            <select value={shot.motion} onChange={(e) => p.onChange({ motion: e.target.value as MotionId })}>
              {(Object.keys(MOTIONS) as MotionId[]).map((m) => (
                <option key={m} value={m}>
                  {MOTIONS[m].he}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="light">
          <legend>אור</legend>
          <div className="light-options">
            {(Object.keys(LIGHTS) as LightId[]).map((l) => (
              <button
                key={l}
                type="button"
                className="light-option"
                aria-pressed={shot.light === l}
                onClick={() => p.onChange({ light: l })}
              >
                <span className="sky" style={{ background: `linear-gradient(180deg, ${LIGHTS[l].sky[0]}, ${LIGHTS[l].sky[1]})` }} />
                {LIGHTS[l].he}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="check">
          <input type="checkbox" checked={shot.life} onChange={(e) => p.onChange({ life: e.target.checked })} />
          וילונות וצמחים זזים ברוח
        </label>

        <details className="prompt">
          <summary>פרומפט {shot.customPrompt ? "(נערך ידנית)" : ""}</summary>
          <textarea
            dir="ltr"
            rows={5}
            value={promptOf(shot)}
            onChange={(e) => p.onChange({ customPrompt: e.target.value })}
          />
          <div className="prompt-foot">
            <span>באנגלית עובד הכי טוב.</span>
            {shot.customPrompt && (
              <button type="button" className="link" onClick={() => p.onChange({ customPrompt: undefined })}>
                חזרה לפרומפט האוטומטי
              </button>
            )}
          </div>
        </details>

        <Status shot={shot} stale={stale} busy={busy} canGenerate={p.canGenerate} onGenerate={p.onGenerate} />
      </div>

      <div className="shot-tools">
        <button type="button" className="icon" onClick={() => p.onMove(-1)} disabled={p.index === 0} aria-label="להזיז למעלה">
          <svg viewBox="0 0 20 20" aria-hidden><path d="M10 5l-5 6h10z" /></svg>
        </button>
        <button type="button" className="icon" onClick={() => p.onMove(1)} disabled={p.index === p.count - 1} aria-label="להזיז למטה">
          <svg viewBox="0 0 20 20" aria-hidden><path d="M10 15l5-6H5z" /></svg>
        </button>
        <button type="button" className="icon" onClick={p.onRemove} aria-label="למחוק את הצילום">
          <svg viewBox="0 0 20 20" aria-hidden><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" strokeWidth="1.6" stroke="currentColor" /></svg>
        </button>
      </div>
    </article>
  );
}

function Status(p: { shot: Shot; stale: boolean; busy: boolean; canGenerate: boolean; onGenerate: () => void }) {
  const { shot } = p;
  let text = "";
  if (shot.status === "preparing") text = "מעלה את התמונה…";
  else if (shot.status === "queued") text = shot.position ? `בתור ליצירה (מקום ${shot.position})` : "בתור ליצירה";
  else if (shot.status === "rendering") text = "יוצר וידאו. לוקח בערך דקה או שתיים.";
  else if (shot.status === "error") text = shot.error || "היצירה נכשלה";
  else if (shot.status === "done" && p.stale) text = "שיניתם הגדרות אחרי היצירה. הווידאו הוא מהגרסה הקודמת.";
  else if (shot.status === "done") text = "הווידאו מוכן";

  return (
    <div className={`status status-${shot.status}${p.stale ? " status-stale" : ""}`} aria-live="polite">
      {p.busy && <span className="spinner" aria-hidden />}
      <span>{text}</span>
      {p.canGenerate && !p.busy && (shot.status === "done" || shot.status === "error") && (
        <button type="button" className="link" onClick={p.onGenerate}>
          {shot.status === "error" ? "ניסיון נוסף" : "יצירה מחדש"}
        </button>
      )}
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
        width: `min(100%, ${((56 * shot.imgW) / shot.imgH).toFixed(1)}vh)`,
        // let the page scroll in the direction the frame can't move
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
      <div
        className="frame-window"
        style={{ left: pct(r.x, shot.imgW), top: pct(r.y, shot.imgH), width: pct(r.w, shot.imgW), height: pct(r.h, shot.imgH) }}
      />
    </div>
  );
}
