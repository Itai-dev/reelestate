"use client";

import { useState } from "react";
import type { Brand } from "@/lib/brand";
import { fontStack } from "@/lib/brand";
import Thinking from "./Thinking";

type Props = {
  brand: Brand | null;
  logoUrl?: string;
  busy: boolean;
  error: string;
  canRead: boolean;
  onRead: (url: string) => void;
  onChange: (patch: Partial<Brand>) => void;
  onRemove: () => void;
  onLogo: (f: File) => void;
};


export default function BrandPanel(p: Props) {
  const [url, setUrl] = useState("");
  const b = p.brand;
  return (
    <div className="brand-panel">
      <form
        className="brand-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) p.onRead(url.trim());
        }}
      >
        <label className="field">
          <span>כתובת האתר</span>
          <input dir="ltr" inputMode="url" autoCapitalize="none" placeholder="yourcompany.co.il" value={url} onChange={(e) => setUrl(e.target.value)} disabled={p.busy} />
        </label>
        <button className="btn btn-primary" type="submit" disabled={p.busy || !url.trim() || !p.canRead}>
          {b ? "קריאה מחדש" : "הבאת המיתוג"}
        </button>
      </form>
      {!p.canRead && <p className="fine">קריאת מותג מאתר זמינה אחרי התחברות.</p>}
      {p.error && <p className="error-inline">{p.error}</p>}

      {p.busy && (
        <Thinking
          lines={["פותח את האתר", "אוסף לוגו, צבעים ופונטים", "מסתכל על התמונות באתר", "מנסח את שפת הצילום של המותג", "כמעט מוכן"]}
        />
      )}

      {!p.busy && !b && (
        <p className="brand-empty">
          מדביקים קישור לאתר החברה, ואנחנו מביאים את הלוגו, הצבעים, הפונטים ושפת הצילום. הסרטון ייצא בשפה של המותג.
        </p>
      )}

      {!p.busy && b && (
        <div className="kit">
          <div className="kit-card" style={{ background: b.colors.primary, color: luma(b.colors.primary) }}>
            {p.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.logoUrl} alt={`הלוגו של ${b.name}`} />
            ) : (
              <b style={{ fontFamily: fontStack(b.fonts.heading, b.fonts.headingKind) }}>{b.name}</b>
            )}
            <span dir="ltr">{b.host}</span>
          </div>

          {b.vibe.length > 0 && (
            <div className="kit-row">
              <h3>הווייב</h3>
              <div className="chips">
                {b.vibe.map((v) => (
                  <span key={v} className="chip is-static">
                    {v}
                  </span>
                ))}
              </div>
              {b.tone && <p className="fine">{b.tone}</p>}
            </div>
          )}

          <div className="kit-row">
            <h3>צבעים</h3>
            <div className="swatches">
              {b.colors.palette.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="swatch"
                  aria-pressed={b.colors.primary === c}
                  aria-label={`צבע ראשי ${c}`}
                  style={{ background: c }}
                  onClick={() => p.onChange({ colors: { ...b.colors, primary: c } })}
                />
              ))}
              <label className="swatch swatch-pick" aria-label="צבע אחר">
                <input type="color" value={b.colors.primary} onChange={(e) => p.onChange({ colors: { ...b.colors, primary: e.target.value } })} />+
              </label>
            </div>
            <p className="fine">הצבע המסומן צובע את כרטיס הסיום ואת הסימון ליד שם החלל.</p>
          </div>

          <div className="kit-row">
            <h3>פונטים</h3>
            <p className="kit-font" style={{ fontFamily: fontStack(b.fonts.heading, b.fonts.headingKind) }}>
              {b.name}
            </p>
            <p className="fine" dir="ltr">
              {[b.fonts.heading, b.fonts.body].filter((f, i, a) => f && a.indexOf(f) === i).join(" · ") || "—"}
            </p>
            <p className="fine">פונט שלא זמין בעברית או ב-Google Fonts מוחלף בפונט עברי מאותו סגנון.</p>
          </div>

          {b.images.length > 0 && (
            <div className="kit-row">
              <h3>שפת הצילום</h3>
              <div className="kit-images">
                {b.images.slice(0, 4).map((src) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={src} src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />
                ))}
              </div>
              {b.photoStyle && (
                <p className="fine" dir="ltr">
                  {b.photoStyle}
                </p>
              )}
            </div>
          )}

          <label className="toggle">
            <span>
              <b>וידאו בשפת הצילום של המותג</b>
              <small>האור, הצבע והאווירה נכנסים לווידאו</small>
            </span>
            <input type="checkbox" role="switch" checked={b.applyPrompt} onChange={(e) => p.onChange({ applyPrompt: e.target.checked })} />
          </label>
          <label className="toggle">
            <span>
              <b>גוון צבע של המותג</b>
              <small>חם או קר, רווי או עדין, על כל ה-Reel</small>
            </span>
            <input type="checkbox" role="switch" checked={b.applyGrade} onChange={(e) => p.onChange({ applyGrade: e.target.checked })} />
          </label>

          <div className="ed-tools">
            <label className="btn btn-quiet btn-small">
              <input type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" hidden onChange={(e) => e.target.files?.[0] && p.onLogo(e.target.files[0])} />
              החלפת לוגו
            </label>
            <button type="button" className="btn btn-quiet btn-small is-danger" onClick={p.onRemove}>
              הסרת המותג
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function luma(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.6 ? "#17181b" : "#fff";
}
