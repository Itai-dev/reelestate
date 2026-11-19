"use client";

import { useEffect, useState } from "react";
import Sheet from "./Sheet";
import { ASPECTS, PACES, roomById, type Aspect } from "@/lib/presets";
import { cropToFrame, decode } from "@/lib/image";
import { FONT_DISPLAY, FONT_UI, Reel, stillTimes, type ReelClip } from "@/lib/reel";
import { fontStack, loadBrandFonts, type Brand } from "@/lib/brand";
import type { Info, Settings, Shot } from "./types";

type Props = {
  open: boolean;
  onClose: () => void;
  shots: Shot[];
  imageBlob: (id: string) => Blob | undefined;
  info: Info;
  settings: Settings;
  logo?: Blob;
  brand?: Brand | null;
};

type Ad = { label: string; url: string; blob: Blob; name: string };

const FORMATS: Aspect[] = ["4:5", "9:16", "1:1"];

const slug = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 40) || "ad";

// Branded image ads drawn by the same engine as the video, from the project's photos.
export default function AdsSheet(p: Props) {
  const [aspect, setAspect] = useState<Aspect>("4:5");
  const [ads, setAds] = useState<Ad[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!p.open) return;
    let cancelled = false;
    setAds(null);
    setError("");
    (async () => {
      try {
        const { w, h } = ASPECTS[aspect];
        await Promise.all([
          document.fonts.load(`400 80px ${FONT_DISPLAY}`, "שלום Aa"),
          document.fonts.load(`500 40px ${FONT_UI}`, "שלום Aa"),
          document.fonts.load(`600 40px ${FONT_UI}`, "054"),
        ]).catch(() => {});
        const b = p.brand;
        if (b) await Promise.race([loadBrandFonts(b), new Promise((r) => setTimeout(r, 2500))]);
        const look = b
          ? { heading: fontStack(b.fonts.heading, b.fonts.headingKind), body: fontStack(b.fonts.body, "sans"), accent: b.colors.primary, grade: b.applyGrade ? b.grade : undefined }
          : undefined;
        const clips: ReelClip[] = [];
        for (const s of p.shots) {
          const blob = p.imageBlob(s.id);
          if (!blob) continue;
          const { canvas } = await cropToFrame(blob, w, h, s.fx, s.fy);
          clips.push({ photo: canvas, motion: s.motion, label: s.room === "other" ? "" : roomById(s.room).he, caption: s.caption, render: s.render });
        }
        if (!clips.length) throw new Error("אין עדיין תמונות בפרויקט.");
        const logo = p.logo ? await decode(p.logo).catch(() => undefined) : undefined;
        const canvas = document.createElement("canvas");
        const reel = new Reel(canvas, {
          width: w,
          height: h,
          clips,
          info: p.info,
          logo,
          layout: "full",
          labels: true,
          clipSeconds: PACES[p.settings.pace].seconds,
          look,
          textStyle: p.settings.textStyle ?? "bold",
          stills: true,
        });
        const out: Ad[] = [];
        const base = slug(p.info.name || "reel-estate");
        for (const [i, st] of stillTimes(reel).entries()) {
          reel.render(st.t);
          const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((x) => (x ? res(x) : rej(new Error("toBlob"))), "image/jpeg", 0.92));
          out.push({ label: st.label, blob, url: URL.createObjectURL(blob), name: `${base}-${aspect.replace(":", "x")}-${i + 1}.jpg` });
          if (cancelled) return;
        }
        if (!cancelled) setAds(out);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.open, aspect]);

  useEffect(() => () => ads?.forEach((a) => URL.revokeObjectURL(a.url)), [ads]);

  const saveAll = async () => {
    if (!ads) return;
    const files = ads.map((a) => new File([a.blob], a.name, { type: "image/jpeg" }));
    if (navigator.canShare?.({ files })) {
      await navigator.share({ files }).catch(() => {});
      return;
    }
    for (const a of ads) {
      const link = document.createElement("a");
      link.href = a.url;
      link.download = a.name;
      link.click();
      await new Promise((r) => setTimeout(r, 250));
    }
  };

  return (
    <Sheet
      open={p.open}
      onClose={p.onClose}
      title="מודעות תמונה"
      wide
      footer={
        <button type="button" className="btn btn-primary" onClick={saveAll} disabled={!ads?.length}>
          שמירת כל המודעות
        </button>
      }
    >
      <p className="sheet-lead">אותו מיתוג ואותם טקסטים כמו בסרטון, כתמונות מוכנות לפיד, לסטורי ולמודעות.</p>
      <div className="seg ads-format" role="group" aria-label="פורמט">
        {FORMATS.map((a) => (
          <button key={a} type="button" aria-pressed={aspect === a} onClick={() => setAspect(a)}>
            <b dir="ltr">{a}</b>
            <small>{ASPECTS[a].hint}</small>
          </button>
        ))}
      </div>
      {error && <p className="error-inline">{error}</p>}
      {!ads && !error && <p className="ads-wait">מכין את המודעות…</p>}
      {ads && (
        <div className={`ads-grid ads-${aspect.replace(":", "x")}`}>
          {ads.map((a) => (
            <figure key={a.name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.url} alt={a.label} />
              <figcaption>
                <span>{a.label}</span>
                <a href={a.url} download={a.name}>
                  שמירה
                </a>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </Sheet>
  );
}
