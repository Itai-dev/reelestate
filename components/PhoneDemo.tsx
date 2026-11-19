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

  // desktop: the phone leans toward the pointer
  const tilt = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = tilt.current;
    if (!el) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
      if (!raf) raf = requestAnimationFrame(step);
    };
    const step = () => {
      x += (tx - x) * 0.08;
      y += (ty - y) * 0.08;
      el.style.setProperty("--ry", `${(x * 16).toFixed(2)}deg`);
      el.style.setProperty("--rx", `${(-y * 12).toFixed(2)}deg`);
      el.style.setProperty("--gx", `${(50 + x * 40).toFixed(1)}%`);
      el.style.setProperty("--gy", `${(30 + y * 30).toFixed(1)}%`);
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.002 ? requestAnimationFrame(step) : 0;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="pd-stage">
    <div className="pd-3d" ref={tilt}>
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
        <span className="pd-glare" aria-hidden />
      </div>
    </div>
    </div>
    <span className="pd-floor" aria-hidden />
    </div>
  );
}
