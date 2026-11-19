"use client";

import { useEffect, useRef, useState } from "react";
import { IconFacade, IconInterior, IconOutdoor, IconSpark } from "./Icons";

// The hero phone: a photo from the camera roll drops into the studio,
// the studio works on it, and it comes back as a video. Loops while on screen.
type Phase = "drop" | "photo" | "work" | "video";

const TIMES: Record<Exclude<Phase, "video">, number> = { drop: 1400, photo: 1700, work: 2600 };
const NEXT: Record<Exclude<Phase, "video">, Phase> = { drop: "photo", photo: "work", work: "video" };
const WORK_LINES = ["לומד את עומק החלל", "בוחר תנועת מצלמה", "מוסיף אור טבעי"];

export default function PhoneDemo({ photo, video }: { photo: string; video: string }) {
  const [phase, setPhase] = useState<Phase>("drop");
  const [visible, setVisible] = useState(false);
  const [line, setLine] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPhase("video");
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const v = vid.current;
    if (!visible) {
      v?.pause();
      return;
    }
    if (phase === "video") {
      if (v) {
        v.currentTime = 0;
        v.play().catch(() => {});
      }
      return;
    }
    // warm the clip up while the photo is on screen
    if (phase === "photo" && v && v.preload !== "auto") {
      v.preload = "auto";
      v.load();
    }
    const t = setTimeout(() => setPhase(NEXT[phase]), TIMES[phase]);
    return () => clearTimeout(t);
  }, [phase, visible]);

  useEffect(() => {
    if (phase !== "work") return;
    setLine(0);
    const t = setInterval(() => setLine((l) => (l + 1) % WORK_LINES.length), 850);
    return () => clearInterval(t);
  }, [phase]);

  return (
    <div className="pd" ref={box} data-phase={phase}>
      <div className="pd-screen">
        <div className="pd-drop" aria-hidden>
          <span className="pd-icons">
            <IconFacade />
            <IconInterior />
            <IconOutdoor />
          </span>
          <b>גוררים לכאן תמונות של הנכס</b>
        </div>
        <img className="pd-photo" src={photo} alt="תמונת מטבח שצולמה בטלפון" />
        <video
          ref={vid}
          className="pd-video"
          src={video}
          muted
          playsInline
          preload="metadata"
          onEnded={() => setTimeout(() => setPhase("drop"), 1200)}
          aria-label="הסרטון שנוצר מהתמונה"
        />
        <div className="pd-work" aria-hidden>
          <span className="pd-sweep" />
          <span className="pd-status">
            <IconSpark />
            {WORK_LINES[line]}
          </span>
        </div>
        <span className="pd-chip" aria-hidden>
          {phase === "video" ? "הסרטון" : "התמונה"}
        </span>
      </div>
    </div>
  );
}
