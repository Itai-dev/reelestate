"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { PanoView, loadPano } from "@/lib/pano";
import { TOUR_LIGHT_ORDER, TOUR_LIGHTS, type TourLight, type TourLink, type ViewEntry, type ViewSpace } from "@/lib/tour";

type Props = {
  spaces: ViewSpace[];
  entry?: ViewEntry;
  title?: string;
  // In the studio: labels can be dragged to where the doorway is, and the
  // direction a visitor sees first can be set.
  editable?: boolean;
  onLinks?: (space: string, links: TourLink[]) => void;
  onStart?: (space: string, yaw: number) => void;
  wheel?: boolean; // scrolling over the view zooms (off inside scrolling panels)
  children?: React.ReactNode;
};

type Stage = "overview" | "flying" | "inside";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The interactive tour itself: the building with the apartment to pick, the
// camera approach, then a 360° view of each space with labels to the next one
// and a lighting preview. Used as the studio preview and as the public page.
export default function TourViewer({ spaces, entry, title, editable, onLinks, onStart, wheel = true, children }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<PanoView | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const labels = useRef(new Map<string, HTMLButtonElement>());
  const shown = useRef<{ space?: string; url?: string }>({});
  const dragging = useRef<{ to: string; x: number; y: number; moved: boolean } | null>(null);

  const [ready, setReady] = useState(false);
  const [stage, setStage] = useState<Stage>(entry ? "overview" : "inside");
  const [picked, setPicked] = useState<string | null>(null); // until the visitor chooses, the first space
  const [light, setLight] = useState<TourLight>("day");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [veil, setVeil] = useState(true);
  const [hint, setHint] = useState(true);
  const [full, setFull] = useState(false);
  const [canFull, setCanFull] = useState(false);
  const [draft, setDraft] = useState<TourLink[] | null>(null);
  const lightId = useId();

  const space = spaces.find((s) => s.id === picked) ?? spaces[0];
  const lights = space ? TOUR_LIGHT_ORDER.filter((l) => space.panos[l]) : [];
  const lit: TourLight = space?.panos[light] ? light : "day";
  const url = space?.panos[lit];
  const links = draft ?? space?.links ?? [];
  const linksRef = useRef(links);
  linksRef.current = links;

  // ---------- the 360° view ----------
  useEffect(() => {
    if (!canvas.current) return;
    let v: PanoView;
    try {
      v = new PanoView(canvas.current);
    } catch {
      setError("הדפדפן הזה לא מציג מבט 360°. נסו דפדפן עדכני.");
      return;
    }
    v.wheelZoom = wheel;
    v.onTouch = () => setHint(false);
    v.onFrame = () => place();
    view.current = v;
    setReady(true);
    return () => {
      v.destroy();
      view.current = null;
    };
    // built once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Each label stays on its direction while the view turns.
  const place = useCallback(() => {
    const v = view.current;
    if (!v) return;
    for (const l of linksRef.current) {
      const el = labels.current.get(l.to);
      if (!el) continue;
      const p = v.project(l.yaw, l.pitch);
      el.style.visibility = p.visible ? "visible" : "hidden";
      if (p.visible) el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%)`;
    }
  }, []);
  useLayoutEffect(place);

  // Show the current space in the current light. Another space fades through a
  // short veil and starts at its own opening direction; another light of the
  // same space cross-fades and keeps the direction.
  useEffect(() => {
    const v = view.current;
    if (!ready || !v || !space || !url) return;
    if (shown.current.space === space.id && shown.current.url === url) return;
    const sameSpace = shown.current.space === space.id;
    let alive = true;
    setError("");
    const slow = setTimeout(() => alive && setLoading(true), 180);
    if (!sameSpace) setVeil(true);
    const since = performance.now();
    loadPano(url)
      .then(async (img) => {
        if (!sameSpace) await new Promise((r) => setTimeout(r, Math.max(0, 200 - (performance.now() - since))));
        if (!alive) return;
        if (sameSpace) v.setImage(img, reduced() ? 0 : 700);
        else {
          v.setImage(img);
          v.lookAt(space.yaw);
        }
        shown.current = { space: space.id, url };
        setVeil(false);
        // the other lights of this space, ready for the slider
        for (const l of TOUR_LIGHT_ORDER) {
          const u = space.panos[l];
          if (u && u !== url) loadPano(u).catch(() => {});
        }
      })
      .catch(() => alive && setError("התמונה לא נטענה."))
      .finally(() => {
        clearTimeout(slow);
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      clearTimeout(slow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, space?.id, url, retry]);

  // The first space turns slowly until the visitor takes over.
  useEffect(() => {
    if (stage !== "inside" || editable || reduced() || !hint) return;
    view.current?.autoRotate(0.03);
    return () => view.current?.autoRotate(0);
  }, [stage, editable, hint, ready]);

  // a dragged label is drawn from a draft until the studio saves its new place
  const linksSig = JSON.stringify(space?.links ?? []);
  useEffect(() => setDraft(null), [space?.id, linksSig]);

  const go = (id: string) => {
    if (id === space?.id) return;
    setHint(false);
    setPicked(id);
  };

  // ---------- from the building into the apartment ----------
  const enter = useCallback(() => {
    setStage("inside");
    requestAnimationFrame(() => canvas.current?.focus({ preventScroll: true }));
  }, []);

  const fly = () => {
    const el = video.current;
    if (!entry?.video || !el || reduced()) return enter();
    setStage("flying");
    el.currentTime = 0;
    el.play().catch(enter);
  };

  const back = () => {
    setStage("overview");
    if (video.current) video.current.pause();
  };

  // ---------- full screen ----------
  useEffect(() => {
    setCanFull(Boolean(document.fullscreenEnabled && root.current?.requestFullscreen));
    const on = () => setFull(document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else root.current?.requestFullscreen().catch(() => {});
  };

  // ---------- moving a label (studio) ----------
  const labelDown = (e: React.PointerEvent, to: string) => {
    if (!editable) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = { to, x: e.clientX, y: e.clientY, moved: false };
  };
  const labelMove = (e: React.PointerEvent) => {
    const d = dragging.current;
    const v = view.current;
    if (!d || !v || !canvas.current) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
    d.moved = true;
    const rect = canvas.current.getBoundingClientRect();
    const at = v.unproject(e.clientX - rect.left, e.clientY - rect.top);
    setDraft(linksRef.current.map((l) => (l.to === d.to ? { ...l, yaw: at.yaw, pitch: Math.max(-0.9, Math.min(0.9, at.pitch)) } : l)));
  };
  const labelUp = () => {
    const d = dragging.current;
    if (d?.moved && space) onLinks?.(space.id, linksRef.current);
    // the click that follows a drag is not a visit
    setTimeout(() => (dragging.current = null), 0);
  };

  if (!space) return null;
  const inside = stage === "inside";
  const idx = Math.max(0, lights.indexOf(lit));

  return (
    <div className={`tv${full ? " is-full" : ""}${editable ? " is-edit" : ""}`} ref={root} data-stage={stage}>
      <canvas
        ref={canvas}
        className={`tv-canvas${veil ? " is-veiled" : ""}`}
        tabIndex={0}
        role="img"
        aria-label={`מבט 360° על ${space.title}. גוררים, או משתמשים במקשי החיצים, כדי להסתכל מסביב.`}
      />

      <div className={`tv-labels${veil || !inside ? " is-off" : ""}`}>
        {links.map((l) => {
          const target = spaces.find((s) => s.id === l.to);
          if (!target) return null;
          return (
            <button
              key={l.to}
              type="button"
              className="tv-label"
              ref={(el) => {
                if (el) labels.current.set(l.to, el);
                else labels.current.delete(l.to);
              }}
              onPointerDown={(e) => labelDown(e, l.to)}
              onPointerMove={labelMove}
              onPointerUp={labelUp}
              onPointerCancel={labelUp}
              onClick={() => {
                if (dragging.current?.moved) return;
                go(l.to);
              }}
            >
              <i aria-hidden />
              {target.title}
            </button>
          );
        })}
      </div>

      {loading && inside && (
        <span className="tv-load" role="status" aria-label="טוען">
          <span className="spinner" />
        </span>
      )}
      {error && (
        <div className="tv-error" role="alert">
          <p>{error}</p>
          {view.current && (
            <button type="button" className="tv-pill" onClick={() => setRetry((n) => n + 1)}>
              ניסיון נוסף
            </button>
          )}
        </div>
      )}
      {inside && hint && !veil && !error && <p className="tv-hint">גוררים כדי להסתכל מסביב</p>}

      <header className="tv-top">
        <p className="tv-title">
          {title && <b>{title}</b>}
          {inside && <span>{space.title}</span>}
        </p>
        <span className="tv-actions">
          {editable && inside && (
            <button type="button" className="tv-pill" onClick={() => view.current && onStart?.(space.id, view.current.yaw)}>
              זה המבט הראשון
            </button>
          )}
          {entry && inside && (
            <button type="button" className="tv-pill" onClick={back}>
              חזרה לבניין
            </button>
          )}
          {canFull && (
            <button type="button" className="tv-pill tv-icon" onClick={toggleFull} aria-label={full ? "יציאה ממסך מלא" : "מסך מלא"}>
              <svg viewBox="0 0 24 24" aria-hidden>
                {full ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
              </svg>
            </button>
          )}
        </span>
      </header>

      {inside && (
        <footer className="tv-bottom">
          {lights.length > 1 && (
            <div className="tv-light">
              <label htmlFor={lightId}>תצוגת תאורה</label>
              <input
                id={lightId}
                type="range"
                min={0}
                max={lights.length - 1}
                step={1}
                value={idx}
                aria-valuetext={TOUR_LIGHTS[lit].he}
                onChange={(e) => setLight(lights[Number(e.target.value)])}
              />
              <span className="tv-light-names">
                {lights.map((l) => (
                  <button key={l} type="button" aria-pressed={l === lit} onClick={() => setLight(l)}>
                    {TOUR_LIGHTS[l].he}
                  </button>
                ))}
              </span>
            </div>
          )}
          {spaces.length > 1 && (
            <nav className="tv-spaces" aria-label="חללים">
              {spaces.map((s) => (
                <button key={s.id} type="button" aria-current={s.id === space.id ? "true" : undefined} onClick={() => go(s.id)}>
                  {s.title}
                </button>
              ))}
            </nav>
          )}
          <p className="tv-note">הדמיה להמחשה בלבד</p>
        </footer>
      )}

      {entry && (
        <div className={`tv-entry${inside ? " is-off" : ""}`} aria-hidden={inside}>
          <div className="tv-cover" style={{ "--x": entry.x, "--y": entry.y } as React.CSSProperties}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={entry.overview} alt="" draggable={false} />
            {entry.video && (
              <video
                ref={video}
                src={entry.video}
                className={stage === "flying" ? "is-on" : ""}
                muted
                playsInline
                preload="auto"
                onEnded={enter}
                onError={() => stage === "flying" && enter()}
              />
            )}
            {stage === "overview" && (
              <button type="button" className="tv-marker" style={{ left: `${entry.x * 100}%`, top: `${entry.y * 100}%` }} onClick={fly} tabIndex={inside ? -1 : 0}>
                <i aria-hidden />
                <span>כניסה לדירה</span>
              </button>
            )}
          </div>
          {stage === "overview" && <p className="tv-hint">לוחצים על הדירה כדי להיכנס</p>}
          {stage === "flying" && (
            <button type="button" className="tv-pill tv-skip" onClick={enter}>
              דילוג
            </button>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
