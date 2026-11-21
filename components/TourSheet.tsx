"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Sheet from "./Sheet";
import Thinking from "./Thinking";
import TourViewer from "./TourViewer";
import { overviewOf, type TourApi } from "./useTour";
import { MODELS, TOUR_IMAGES, roomById, type ModelKey } from "@/lib/presets";
import { CREDITS_PER_CLIP, CREDITS_PER_TOUR_IMAGE } from "@/lib/plans";
import { APPROACH, CLOSEUP, TOUR_LIGHTS, TOUR_LIGHT_ORDER, isBusy, panoKey, sameEntry, type TourAsset, type TourLight } from "@/lib/tour";
import { IconCheck } from "./Icons";
import type { Media, Shot } from "./types";

type Props = {
  open: boolean;
  onClose: () => void;
  api: TourApi;
  shots: Shot[];
  media: Media;
  imageBlob: (id: string) => Blob | undefined;
  name: string;
  model: ModelKey;
  accounts: boolean;
  signedIn: boolean;
  balance: number;
  // the public link: who may have one, whether the account copy is up to date, and its address
  share: { user: boolean; state: "off" | "saving" | "saved" | "error"; link: string };
};

const EXTRA: TourLight[] = ["morning", "sunset", "night"];
const made = (a?: TourAsset) => Boolean(a && a.status !== "error");

// The interactive tour of a project: choose the spaces and lightings, optionally
// open from the facade, then try the result, place the labels and share a link.
export default function TourSheet(p: Props) {
  const { tour } = p.api;
  const [setup, setSetup] = useState(!tour);
  const [on, setOn] = useState<Set<string>>(new Set());
  const [lights, setLights] = useState<Set<TourLight>>(new Set());
  const [entry, setEntry] = useState({ use: true, x: 0.5, y: 0.4, video: true });
  const [overview, setOverview] = useState<{ blob: Blob; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);

  const facade = p.shots.find((s) => s.room === "exterior");

  // every space the tour can have: the project's photos (the facade opens the
  // tour instead), and spaces of the tour whose photo has since been removed
  const candidates = useMemo(() => {
    const list: { id: string; title: string; img?: string }[] = p.shots
      .filter((s) => s.room !== "exterior")
      .map((s, i) => ({ id: s.id, title: tour?.spaces.find((x) => x.id === s.id)?.title ?? (s.room === "other" ? `חלל ${i + 1}` : roomById(s.room).he), img: p.media[s.id]?.img }));
    for (const s of tour?.spaces ?? []) if (!list.some((x) => x.id === s.id)) list.push({ id: s.id, title: s.title, img: undefined });
    return list;
  }, [p.shots, p.media, tour]);

  // the form starts from the tour as it is, or from everything when there is none
  useEffect(() => {
    if (!p.open) return;
    setSetup(!tour);
    setOn(new Set(tour ? tour.spaces.map((s) => s.id) : candidates.map((c) => c.id)));
    setLights(new Set(tour ? EXTRA.filter((l) => tour.spaces.some((s) => s.panos[l])) : EXTRA));
    setEntry(tour ? { use: Boolean(tour.entry), x: tour.entry?.x ?? 0.5, y: tour.entry?.y ?? 0.4, video: tour.entry ? Boolean(tour.entry.video) : true } : { use: true, x: 0.5, y: 0.4, video: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.open]);

  // the facade as the tour's opening frame, to mark the apartment on
  useEffect(() => {
    if (!p.open || !facade) return;
    const blob = p.imageBlob(facade.id);
    if (!blob) return;
    let alive = true;
    let url = "";
    overviewOf(blob, facade.fx, facade.fy)
      .then((b) => {
        if (!alive) return;
        url = URL.createObjectURL(b);
        setOverview({ blob: b, url });
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
      setOverview(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.open, facade?.id, facade?.fx, facade?.fy]);

  // ---------- what the chosen tour costs: only what does not exist yet ----------
  const chosen = candidates.filter((c) => on.has(c.id));
  const withEntry = Boolean(facade && overview && entry.use);
  const kept = Boolean(tour?.entry && facade && sameEntry(tour.entry, { shot: facade.id, fx: facade.fx, fy: facade.fy, x: entry.x, y: entry.y }));
  let images = 0;
  for (const c of chosen) {
    const old = tour?.spaces.find((s) => s.id === c.id);
    for (const l of ["day", ...lights] as TourLight[]) if (!made(old?.panos[l])) images++;
  }
  const flight = withEntry && entry.video;
  if (flight && !(kept && made(tour?.entry?.closeup))) images++;
  const clip = flight && !(kept && made(tour?.entry?.video)) ? 1 : 0;
  const credits = images * CREDITS_PER_TOUR_IMAGE + clip * CREDITS_PER_CLIP[p.model];
  const dollars = images * TOUR_IMAGES.pano.pricePerImage + clip * MODELS[p.model].pricePerClip;
  const costLine = credits === 0 ? "בלי עלות נוספת" : p.accounts ? `${credits} קרדיטים${p.signedIn ? `, יתרה ${p.balance}` : ""}` : `כ-$${dollars.toFixed(2)}`;

  const start = async () => {
    setStarting(true);
    try {
      await p.api.make({
        spaces: chosen.map((c) => c.id),
        lights: EXTRA.filter((l) => lights.has(l)),
        entry: withEntry && facade && overview ? { shot: facade.id, fx: facade.fx, fy: facade.fy, x: entry.x, y: entry.y, overview: overview.blob, video: entry.video } : undefined,
      });
      setSetup(false);
    } finally {
      setStarting(false);
    }
  };

  const pick = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setEntry((v) => ({ ...v, x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) }));
  };
  const nudge = (e: React.KeyboardEvent) => {
    const d = { ArrowLeft: [-0.02, 0], ArrowRight: [0.02, 0], ArrowUp: [0, -0.02], ArrowDown: [0, 0.02] }[e.key];
    if (!d) return;
    e.preventDefault();
    setEntry((v) => ({ ...v, x: clamp01(v.x + d[0]), y: clamp01(v.y + d[1]) }));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(p.share.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* the address stays selectable in the field */
    }
  };

  let action: React.ReactNode;
  if (p.accounts && !p.signedIn && credits > 0)
    action = (
      <Link className="btn btn-primary" href="/login?next=/studio">
        התחברות כדי ליצור סיור
      </Link>
    );
  else if (p.accounts && credits > p.balance)
    action = (
      <Link className="btn btn-primary" href="/pricing">
        חסרים {credits - p.balance} קרדיטים
      </Link>
    );
  else
    action = (
      <button type="button" className="btn btn-primary" onClick={start} disabled={!chosen.length || starting}>
        {tour ? "עדכון הסיור" : "יצירת הסיור"}
      </button>
    );

  const { view, busy, ready, total, failed } = p.api;

  return (
    <Sheet
      open={p.open}
      onClose={p.onClose}
      title="סיור אינטראקטיבי"
      wide
      footer={
        setup ? (
          <div className="ts-foot">
            <span className="ts-cost">{costLine}</span>
            <span className="ts-foot-actions">
              {tour && (
                <button type="button" className="btn btn-quiet" onClick={() => setSetup(false)}>
                  ביטול
                </button>
              )}
              {action}
            </span>
          </div>
        ) : undefined
      }
    >
      {setup ? (
        <div className="ts">
          <p className="sheet-lead">
            מהתמונות של הנכס נבנה סיור שהקונים מסתובבים בו בעצמם: מבט 360° בכל חלל, תוויות שמובילות מחלל לחלל ותצוגת תאורה מבוקר עד לילה. בסוף מקבלים קישור לשיתוף.
          </p>

          <h3>החללים בסיור</h3>
          {candidates.length ? (
            <ul className="ts-spaces">
              {candidates.map((c) => (
                <li key={c.id}>
                  <label className="toggle">
                    <span className="ts-space">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {c.img ? <img src={c.img} alt="" /> : <i aria-hidden />}
                      <b>{c.title}</b>
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={on.has(c.id)}
                      onChange={(e) =>
                        setOn((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(c.id);
                          else next.delete(c.id);
                          return next;
                        })
                      }
                    />
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="fine">בפרויקט יש רק תמונת חזית. מוסיפים תמונות של חללי הפנים כדי לבנות מהן סיור.</p>
          )}

          <h3>תאורה</h3>
          <div className="chips">
            <span className="chip is-static">יום</span>
            {EXTRA.map((l) => (
              <button
                key={l}
                type="button"
                className="chip"
                aria-pressed={lights.has(l)}
                onClick={() =>
                  setLights((prev) => {
                    const next = new Set(prev);
                    if (next.has(l)) next.delete(l);
                    else next.add(l);
                    return next;
                  })
                }
              >
                {TOUR_LIGHTS[l].he}
              </button>
            ))}
          </div>
          <p className="fine">כל תאורה היא תמונת 360° נוספת לכל חלל. החדר עצמו לא משתנה, רק האור.</p>

          {facade && (
            <>
              <h3>כניסה מהחזית</h3>
              <label className="toggle">
                <span>
                  <b>הסיור נפתח בבניין</b>
                  <small>הקונה לוחץ על הדירה ונכנס אליה</small>
                </span>
                <input type="checkbox" role="switch" checked={entry.use} onChange={(e) => setEntry({ ...entry, use: e.target.checked })} />
              </label>
              {entry.use && (
                <>
                  <div className="ts-pick" onClick={pick}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {overview && <img src={overview.url} alt="חזית הבניין" draggable={false} />}
                    <button
                      type="button"
                      className="ts-pin"
                      style={{ left: `${entry.x * 100}%`, top: `${entry.y * 100}%` }}
                      onKeyDown={nudge}
                      onClick={(e) => e.stopPropagation()}
                      aria-label="מיקום הדירה בתמונה. מזיזים עם מקשי החיצים"
                    />
                  </div>
                  <p className="fine">לוחצים על הדירה בתמונה כדי לסמן אותה.</p>
                  <label className="toggle">
                    <span>
                      <b>מעוף מצלמה אל הדירה</b>
                      <small>קליפ של 5 שניות מהבניין אל הדירה שסומנה, באיכות שנבחרה לסרטון</small>
                    </span>
                    <input type="checkbox" role="switch" checked={entry.video} onChange={(e) => setEntry({ ...entry, video: e.target.checked })} />
                  </label>
                </>
              )}
            </>
          )}

          <p className="fine ts-fine">
            תמונות ה-360° נוצרות ב-AI מתוך התמונה: מה שלא נראה בה הוא השלמה ולא צילום של הנכס. לכן הסיור מסומן תמיד ״הדמיה להמחשה בלבד״.
          </p>
        </div>
      ) : (
        tour && (
          <div className="ts">
            {view.spaces.length > 0 ? (
              <div className="ts-stage">
                <TourViewer
                  spaces={view.spaces}
                  entry={view.entry}
                  title={p.name || undefined}
                  editable
                  wheel={false}
                  onLinks={p.api.setLinks}
                  onStart={p.api.setStart}
                />
              </div>
            ) : (
              <div className="ts-wait">
                {busy > 0 ? (
                  <Thinking lines={["יוצר מבט 360° לכל חלל", "ממשיך את החדר מעבר לפריים", "מחבר את קצוות התמונה", "כל תמונה לוקחת כדקה"]} progress={(ready + 0.3) / Math.max(1, total)} />
                ) : (
                  <p>עוד אין חלל מוכן בסיור.</p>
                )}
              </div>
            )}

            {view.spaces.length > 0 && busy > 0 && <Thinking compact lines={[`יוצר עוד ${busy} חלקים של הסיור`, "אפשר לסגור את המסך, היצירה ממשיכה"]} progress={(ready + 0.3) / Math.max(1, total)} />}
            {view.spaces.length > 0 && (
              <p className="fine">
                גוררים כל תווית אל הפתח שמוביל לחלל שלה. ״זה המבט הראשון״ קובע לאן מסתכלים כשנכנסים לחלל.
              </p>
            )}

            <ul className="ts-status">
              {tour.spaces.map((s) => (
                <li key={s.id}>
                  <b>{s.title}</b>
                  <span className="ts-chips">
                    {TOUR_LIGHT_ORDER.filter((l) => s.panos[l]).map((l) => (
                      <Part key={l} label={TOUR_LIGHTS[l].he} asset={s.panos[l]!} onAgain={() => p.api.again(panoKey(s.id, l))} />
                    ))}
                  </span>
                </li>
              ))}
              {tour.entry?.video && (
                <li>
                  <b>כניסה מהחזית</b>
                  <span className="ts-chips">
                    {tour.entry.closeup && <Part label="מבט קרוב" asset={tour.entry.closeup} onAgain={() => p.api.again(CLOSEUP)} />}
                    <Part label="מעוף מצלמה" asset={tour.entry.video} onAgain={() => p.api.again(APPROACH)} />
                  </span>
                </li>
              )}
            </ul>
            {failed > 0 && <p className="fine">יצירה שנכשלה לא מחויבת. ״ניסיון נוסף״ יוצר את החלק שוב.</p>}

            <div className="ts-share">
              {!p.share.user ? (
                <p>
                  <b>קישור לשיתוף</b>
                  <small>
                    {p.accounts ? (
                      <>
                        <Link href="/login?next=/studio">מתחברים</Link> כדי לקבל קישור שאפשר לשלוח לקונים ולשלב באתר.
                      </>
                    ) : (
                      "קישור לשיתוף זמין כשהפרויקט נשמר בחשבון."
                    )}
                  </small>
                </p>
              ) : (
                <>
                  <label className="toggle">
                    <span>
                      <b>קישור ציבורי</b>
                      <small>כל מי שמקבל את הקישור רואה את הסיור, בלי להתחבר</small>
                    </span>
                    <input type="checkbox" role="switch" checked={Boolean(tour.published)} onChange={(e) => p.api.publish(e.target.checked)} />
                  </label>
                  {tour.published && (
                    <>
                      <div className="ts-link">
                        <input readOnly dir="ltr" value={p.share.link} onFocus={(e) => e.currentTarget.select()} aria-label="הקישור לסיור" />
                        <button type="button" className="btn btn-dark btn-small" onClick={copy}>
                          {copied ? "הועתק" : "העתקה"}
                        </button>
                        <a className="btn btn-outline btn-small" href={p.share.link} target="_blank" rel="noreferrer">
                          פתיחה
                        </a>
                      </div>
                      <p className="fine" role="status">
                        {p.share.state === "saving"
                          ? "שומר בחשבון. הקישור יתעדכן בעוד רגע."
                          : p.share.state === "error"
                            ? "השמירה בחשבון נכשלה, ננסה שוב. עד אז הקישור מציג את הגרסה הקודמת."
                            : busy > 0
                              ? "הקישור פעיל. מה שעוד נוצר יתווסף אליו כשיסתיים."
                              : "הקישור פעיל ומעודכן."}
                      </p>
                    </>
                  )}
                </>
              )}
            </div>

            <div className="ts-foot">
              <button type="button" className="btn btn-outline btn-small" onClick={() => setSetup(true)}>
                שינוי חללים ותאורה
              </button>
              <button
                type="button"
                className="link ts-remove"
                onClick={async () => {
                  if (!confirm("למחוק את הסיור? התמונות שלו יימחקו והקישור יפסיק לעבוד.")) return;
                  await p.api.discard();
                  setSetup(true);
                }}
              >
                מחיקת הסיור
              </button>
            </div>
          </div>
        )
      )}
    </Sheet>
  );
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

// One part of the tour and where it stands.
function Part({ label, asset, onAgain }: { label: string; asset: TourAsset; onAgain: () => void }) {
  if (asset.status === "error")
    return (
      <span className="ts-chip is-error" title={asset.error}>
        {label}: נכשל
        <button type="button" className="link" onClick={onAgain}>
          ניסיון נוסף
        </button>
      </span>
    );
  return (
    <span className={`ts-chip${asset.status === "done" ? " is-done" : ""}`}>
      {isBusy(asset) ? <span className="spinner" aria-label="בעבודה" /> : <IconCheck />}
      {label}
    </span>
  );
}
