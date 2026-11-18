"use client";

import { ASPECTS, LIGHTS, MOTIONS, roomById, type Aspect } from "@/lib/presets";
import { coverRect } from "@/lib/image";
import { IconAlert, IconCheck } from "./Icons";
import type { Shot } from "./types";

type Props = {
  shot: Shot;
  index: number;
  aspect: Aspect;
  img: string;
  vid?: string;
  stale: boolean;
  onOpen: () => void;
};

// Where the photo sits inside a box of the output's proportions, so the card
// shows exactly the frame the reel will use.
export function objectPosition(shot: Shot, aspect: Aspect) {
  const out = ASPECTS[aspect];
  const r = coverRect(shot.imgW, shot.imgH, out.w, out.h, shot.fx, shot.fy);
  const px = shot.imgW - r.w > 1 ? (r.x / (shot.imgW - r.w)) * 100 : 50;
  const py = shot.imgH - r.h > 1 ? (r.y / (shot.imgH - r.h)) * 100 : 50;
  return `${px.toFixed(1)}% ${py.toFixed(1)}%`;
}

export function statusLine(shot: Shot, stale: boolean, live: boolean) {
  switch (shot.status) {
    case "preparing":
      return "מעלה את התמונה";
    case "queued":
      return shot.position ? `בתור, מקום ${shot.position}` : "בתור ליצירה";
    case "rendering":
      return "יוצר וידאו";
    case "error":
      return "היצירה נכשלה";
    case "done":
      return stale ? "ההגדרות השתנו מאז" : "וידאו מוכן";
    default:
      return live ? "עוד אין וידאו" : "תצוגה מקדימה";
  }
}

export default function ShotCard({ shot, index, aspect, img, vid, stale, onOpen }: Props) {
  const busy = shot.status === "preparing" || shot.status === "queued" || shot.status === "rendering";
  const room = roomById(shot.room);
  const src = vid ?? shot.videoUrl;
  return (
    <button type="button" className="card" onClick={onOpen} aria-label={`צילום ${index + 1}: ${room.he}. לעריכה`}>
      <span className="card-media" style={{ aspectRatio: `${ASPECTS[aspect].w} / ${ASPECTS[aspect].h}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img} alt="" draggable={false} style={{ objectPosition: objectPosition(shot, aspect) }} />
        {src && shot.status === "done" && <video src={src} muted loop autoPlay playsInline className="card-video" />}
        <span className="card-num" aria-hidden>
          {index + 1}
        </span>
        {(busy || shot.status === "done" || shot.status === "error") && (
          <span className={`card-badge${shot.status === "error" ? " is-error" : ""}${stale ? " is-stale" : ""}`}>
            {busy ? <span className="spinner" aria-hidden /> : shot.status === "error" || stale ? <IconAlert /> : <IconCheck />}
            {busy ? (shot.status === "queued" ? "בתור" : "יוצר") : shot.status === "error" ? "נכשל" : stale ? "לא מעודכן" : "וידאו"}
          </span>
        )}
      </span>
      <span className="card-text">
        <b>{room.id === "other" ? "חלל" : room.he}</b>
        <span>
          {MOTIONS[shot.motion].he}, {LIGHTS[shot.light].he}
        </span>
      </span>
    </button>
  );
}
