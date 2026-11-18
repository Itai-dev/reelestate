"use client";

import { useEffect, useRef, useState } from "react";
import { ASPECTS, PACES, roomById } from "@/lib/presets";
import { cropToFrame, decode } from "@/lib/image";
import { FONT_DISPLAY, FONT_UI, Reel, ReelPlayer, canRecord, type ReelClip } from "@/lib/reel";
import type { Info, Media, Settings, Shot } from "./types";
import { fontStack, loadBrandFonts, luminance, type Brand } from "@/lib/brand";

type Props = {
  shots: Shot[];
  media: Media;
  imageBlob: (id: string) => Blob | undefined;
  info: Info;
  settings: Settings;
  logo?: Blob;
  brand?: Brand | null;
  musicUrl?: string;
  onClose: () => void;
};

type Phase = "loading" | "ready" | "recording" | "done" | "error";

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

function waitForVideo(v: HTMLVideoElement, ms = 10000) {
  return new Promise<void>((res) => {
    if (v.readyState >= 2) return res();
    const done = () => {
      v.removeEventListener("loadeddata", done);
      v.removeEventListener("error", done);
      res();
    };
    v.addEventListener("loadeddata", done);
    v.addEventListener("error", done);
    setTimeout(done, ms);
  });
}

export default function PlayerSheet(p: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<ReelPlayer | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [t, setT] = useState(0);
  const [total, setTotal] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [file, setFile] = useState<{ url: string; name: string; blob: Blob; ext: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let player: ReelPlayer | null = null;
    (async () => {
      try {
        const { w, h } = ASPECTS[p.settings.aspect];
        await Promise.all([
          document.fonts.load(`400 80px ${FONT_DISPLAY}`, "שלום Aa"),
          document.fonts.load(`500 40px ${FONT_UI}`, "שלום Aa"),
          document.fonts.load(`600 40px ${FONT_UI}`, "054"),
        ]).catch(() => {});
        const b = p.brand;
        if (b) await Promise.race([loadBrandFonts(b), new Promise((r) => setTimeout(r, 2500))]);
        const look = b
          ? {
              heading: fontStack(b.fonts.heading, b.fonts.headingKind),
              body: fontStack(b.fonts.body, "sans"),
              accent: luminance(b.colors.primary) > 0.2 ? b.colors.primary : luminance(b.colors.accent) > 0.2 ? b.colors.accent : "#ffffff",
              grade: b.applyGrade ? b.grade : undefined,
            }
          : undefined;
        const clips: ReelClip[] = [];
        for (const s of p.shots) {
          const blob = p.imageBlob(s.id);
          if (!blob) continue;
          const { canvas } = await cropToFrame(blob, w, h, s.fx, s.fy);
          let video: HTMLVideoElement | undefined;
          const src = p.media[s.id]?.vid;
          if (src) {
            video = document.createElement("video");
            video.muted = true;
            video.setAttribute("muted", "");
            video.setAttribute("playsinline", "");
            video.playsInline = true;
            video.preload = "auto";
            video.src = src;
            await waitForVideo(video);
            if (video.readyState < 2) video = undefined;
          }
          clips.push({ photo: canvas, video, motion: s.motion, label: s.room === "other" ? "" : roomById(s.room).he });
        }
        const logo = p.logo ? await decode(p.logo).catch(() => undefined) : undefined;
        if (cancelled || !canvasRef.current) return;
        const reel = new Reel(canvasRef.current, {
          width: w,
          height: h,
          clips,
          info: p.info,
          logo,
          layout: p.settings.layout,
          labels: p.settings.labels,
          clipSeconds: PACES[p.settings.pace].seconds,
          look,
        });
        player = new ReelPlayer(reel, p.musicUrl);
        player.onTime = (x) => setT(x);
        player.onState = (x) => setPlaying(x);
        playerRef.current = player;
        setTotal(reel.total);
        setPhase("ready");
        player.seek(0.9);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
      player?.destroy();
      playerRef.current = null;
    };
    // built once per opening
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase !== "recording") p.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, p]);

  useEffect(() => () => {
    if (file) URL.revokeObjectURL(file.url);
  }, [file]);

  const toggle = () => {
    const pl = playerRef.current;
    if (!pl) return;
    if (pl.playing) pl.pause();
    else pl.play();
  };

  const exportVideo = async () => {
    const pl = playerRef.current;
    if (!pl) return;
    setPhase("recording");
    try {
      const { blob, ext } = await pl.record();
      const base = (p.info.name || "reel").trim().replace(/[\\/:*?"<>|\s]+/g, "-");
      setFile({ url: URL.createObjectURL(blob), name: `${base}.${ext}`, blob, ext });
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  const share = async () => {
    if (!file) return;
    const f = new File([file.blob], file.name, { type: file.blob.type });
    try {
      await navigator.share({ files: [f], title: p.info.name || "Reel" });
    } catch {
      /* dismissed */
    }
  };
  const canShare =
    typeof navigator !== "undefined" &&
    file &&
    "canShare" in navigator &&
    navigator.canShare?.({ files: [new File([file.blob], file.name, { type: file.blob.type })] });

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="הרילס">
      <header className="sheet-head">
        <h2>הרילס</h2>
        <button type="button" className="btn btn-onDark" onClick={p.onClose} disabled={phase === "recording"}>
          סגירה
        </button>
      </header>

      <div className="sheet-stage">
        <canvas
          ref={canvasRef}
          className="stage-canvas"
          onClick={phase === "ready" || phase === "done" ? toggle : undefined}
        />
        {phase === "loading" && <p className="stage-note">מכין את הרילס…</p>}
      </div>

      <div className="sheet-controls">
        {phase === "error" ? (
          <p className="error-text">משהו נכשל בהכנת הסרטון: {error}</p>
        ) : phase === "recording" ? (
          <div className="recording">
            <div className="progress" aria-label="התקדמות הייצוא">
              <span style={{ width: `${total ? (t / total) * 100 : 0}%` }} />
            </div>
            <p>
              מקליט את הרילס בזמן אמת ({fmt(t)} מתוך {fmt(total)}). השאירו את המסך פתוח עד הסוף.
            </p>
          </div>
        ) : (
          <>
            <div className="transport" dir="ltr">
              <button type="button" className="play" onClick={toggle} disabled={phase === "loading"} aria-label={playing ? "השהיה" : "ניגון"}>
                {playing ? (
                  <svg viewBox="0 0 20 20" aria-hidden><rect x="5" y="4" width="3.5" height="12" /><rect x="11.5" y="4" width="3.5" height="12" /></svg>
                ) : (
                  <svg viewBox="0 0 20 20" aria-hidden><path d="M15 10L6 4.5v11z" /></svg>
                )}
              </button>
              <input
                type="range"
                min={0}
                max={total || 1}
                step={0.01}
                value={t}
                disabled={phase === "loading"}
                onChange={(e) => playerRef.current?.seek(Number(e.target.value))}
                aria-label="מיקום ברילס"
              />
              <span className="time" dir="ltr">
                {fmt(t)} / {fmt(total)}
              </span>
            </div>

            {phase === "done" && file ? (
              <div className="exported">
                <p>הסרטון מוכן ({file.ext.toUpperCase()}, {(file.blob.size / 1e6).toFixed(1)}MB).</p>
                <div className="exported-actions">
                  <a className="btn btn-primary" href={file.url} download={file.name}>
                    הורדה
                  </a>
                  {canShare && (
                    <button type="button" className="btn btn-onDark" onClick={share}>
                      שיתוף או שמירה לגלריה
                    </button>
                  )}
                  <button type="button" className="btn btn-onDark" onClick={exportVideo}>
                    ייצוא מחדש
                  </button>
                </div>
                {file.ext === "webm" && (
                  <p className="fine">הדפדפן הזה מייצא WebM. לקובץ MP4 לאינסטגרם, ייצאו מכרום או מספארי בגרסה עדכנית.</p>
                )}
              </div>
            ) : (
              <div className="exported-actions">
                <button type="button" className="btn btn-primary" onClick={exportVideo} disabled={phase !== "ready" || !canRecord()}>
                  ייצוא סרטון
                </button>
                {!canRecord() && <p className="fine">הדפדפן הזה לא תומך בייצוא. נסו כרום או ספארי.</p>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
