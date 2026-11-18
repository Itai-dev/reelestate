"use client";

import { useRef, useState } from "react";
import { ASPECTS, LIGHTS, MOTIONS, ROOMS, type Aspect, type LightId, type MotionId } from "@/lib/presets";
import { coverRect } from "@/lib/image";
import Sheet from "./Sheet";
import { statusLine } from "./ShotCard";
import { IconArrow, IconTrash } from "./Icons";
import { promptOf, type Shot } from "./types";

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
  onClose: () => void;
};

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
