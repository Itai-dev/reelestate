"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ASPECTS,
  DEFAULT_MODEL,
  FAMILIES,
  MODELS,
  modelKeyOf,
  type Family,
  type Resolution,
  PACES,
  ROOMS,
  type Aspect,
  type Pace,
} from "@/lib/presets";
import Link from "next/link";
import { cropToFrame, normalize } from "@/lib/image";
import { CREDITS_PER_CLIP } from "@/lib/plans";
import { refreshMe, useMe } from "./SiteNav";
import { load, remove, save } from "@/lib/store";
import {
  checkGeneration,
  fetchVideo,
  getConfig,
  ApiError,
  getPassword,
  setPassword,
  startGeneration,
  uploadImage,
  type Config,
} from "@/lib/api";
import ShotCard from "./ShotCard";
import PlayerSheet from "./PlayerSheet";
import { promptOf, sigOf, type Info, type Media, type Settings, type Shot } from "./types";

type Saved = { shots: Shot[]; info: Info; settings: Settings; musicName?: string };

const DEFAULT_INFO: Info = { name: "", location: "", price: "", cta: "", phone: "", brand: "#1d2a3a" };
const DEFAULT_SETTINGS: Settings = { aspect: "9:16", layout: "full", pace: "calm", model: DEFAULT_MODEL, labels: true };

const uid = () => Math.random().toString(36).slice(2, 10);
const BUSY = new Set(["preparing", "queued", "rendering"]);

export default function Studio() {
  const [hydrated, setHydrated] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [info, setInfo] = useState<Info>(DEFAULT_INFO);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [media, setMedia] = useState<Media>({});
  const [logo, setLogo] = useState<{ blob: Blob; url: string } | null>(null);
  const [music, setMusic] = useState<{ blob: Blob; url: string; name: string } | null>(null);
  const [adding, setAdding] = useState(0);
  const [player, setPlayer] = useState(false);
  const [pw, setPw] = useState("");
  const [notice, setNotice] = useState<React.ReactNode>("");
  const me = useMe();
  const [drag, setDrag] = useState(false);

  const blobs = useRef(new Map<string, Blob>());
  const shotsRef = useRef<Shot[]>([]);
  shotsRef.current = shots;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const downloading = useRef(new Set<string>());
  const downloadedFrom = useRef(new Map<string, string>()); // shot id -> clip url already saved locally
  const polling = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // ---------- load saved project ----------
  useEffect(() => {
    (async () => {
      const saved = await load<Saved>("project");
      if (saved) {
        const m: Media = {};
        for (const s of saved.shots) {
          const img = await load<Blob>(`img:${s.id}`);
          if (!img) continue;
          blobs.current.set(s.id, img);
          m[s.id] = { img: URL.createObjectURL(img) };
          const vid = await load<Blob>(`vid:${s.id}`);
          if (vid) {
            m[s.id].vid = URL.createObjectURL(vid);
            if (s.videoUrl) downloadedFrom.current.set(s.id, s.videoUrl);
          }
        }
        // older saves may name models that no longer exist
        setShots(
          saved.shots
            .filter((s) => m[s.id])
            .map((s) =>
              s.status === "preparing" || (BUSY.has(s.status) && !(s.modelKey && s.modelKey in MODELS)) ? { ...s, status: "idle" } : s,
            ),
        );
        setMedia(m);
        setInfo({ ...DEFAULT_INFO, ...saved.info });
        const st = { ...DEFAULT_SETTINGS, ...saved.settings };
        if (!(st.model in MODELS)) st.model = DEFAULT_MODEL;
        setSettings(st);
        const lg = await load<Blob>("logo");
        if (lg) setLogo({ blob: lg, url: URL.createObjectURL(lg) });
        const mu = await load<Blob>("music");
        if (mu) setMusic({ blob: mu, url: URL.createObjectURL(mu), name: saved.musicName ?? "מוזיקה" });
      }
      setHydrated(true);
    })();
    getConfig()
      .then(setConfig)
      .catch(() => setConfig({ mode: "demo", accounts: false, protected: false }));
    setPw(getPassword());
  }, []);

  // ---------- save on change (and right away when the app is backgrounded) ----------
  const latest = useRef<Saved | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    latest.current = { shots, info, settings, musicName: music?.name };
    const id = setTimeout(() => save("project", latest.current), 400);
    return () => clearTimeout(id);
  }, [hydrated, shots, info, settings, music]);
  useEffect(() => {
    const flush = () => {
      if (latest.current && document.visibilityState === "hidden") save("project", latest.current);
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  const update = useCallback((id: string, patch: Partial<Shot>) => {
    setShots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  // ---------- photos ----------
  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    if (!list.length) return;
    setAdding(list.length);
    let failed = 0;
    for (const f of list) {
      try {
        const { blob, w, h } = await normalize(f);
        const id = uid();
        blobs.current.set(id, blob);
        await save(`img:${id}`, blob);
        const url = URL.createObjectURL(blob);
        setMedia((m) => ({ ...m, [id]: { img: url } }));
        setShots((prev) => [
          ...prev,
          { id, room: "other", motion: "push_in", light: "day", life: false, fx: 0.5, fy: 0.5, imgW: w, imgH: h, status: "idle" },
        ]);
      } catch {
        failed++;
      }
      setAdding((n) => n - 1);
    }
    setAdding(0);
    if (failed) setNotice(`${failed} תמונות לא נפתחו. HEIC נפתח רק בספארי; אפשר לשמור כ-JPG ולנסות שוב.`);
  };

  const removeShot = (id: string) => {
    setShots((prev) => prev.filter((s) => s.id !== id));
    const m = media[id];
    if (m) {
      URL.revokeObjectURL(m.img);
      if (m.vid) URL.revokeObjectURL(m.vid);
    }
    blobs.current.delete(id);
    remove(`img:${id}`);
    remove(`vid:${id}`);
  };

  const move = (id: string, dir: -1 | 1) => {
    setShots((prev) => {
      const i = prev.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const sortByTour = () => {
    const order = (s: Shot) => ROOMS.findIndex((r) => r.id === s.room);
    setShots((prev) => prev.map((s, i) => ({ s, i })).sort((a, b) => order(a.s) - order(b.s) || a.i - b.i).map((x) => x.s));
  };

  // ---------- generation ----------
  const live = config?.mode === "live" || config?.mode === "mock";
  const locked = Boolean(config?.protected && !pw);

  const needsGeneration = (s: Shot) =>
    !BUSY.has(s.status) && (s.status === "idle" || s.status === "error" || (s.status === "done" && s.genSig !== sigOf(s, settings.aspect)));

  const generate = async (id: string) => {
    const s = shotsRef.current.find((x) => x.id === id);
    const blob = blobs.current.get(id);
    if (!s || !blob) return;
    const { aspect, model } = settingsRef.current;
    const sig = sigOf(s, aspect);
    update(id, { status: "preparing", error: undefined });
    try {
      const { w, h } = ASPECTS[aspect];
      const cropped = await (await cropToFrame(blob, w, h, s.fx, s.fy)).blob();
      const imageUrl = await uploadImage(cropped);
      const requestId = await startGeneration(model, imageUrl, promptOf(s));
      update(id, { status: "queued", requestId, modelKey: model, pendingSig: sig, position: undefined });
      refreshMe();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      if (code === "no_credits")
        setNotice(
          <>
            נגמרו הקרדיטים. <Link href="/pricing">להוספת קרדיטים</Link>
          </>,
        );
      if (code === "auth")
        setNotice(
          <>
            צריך להתחבר כדי ליצור וידאו. <Link href="/login?next=/">התחברות</Link>
          </>,
        );
      update(id, { status: code === "no_credits" || code === "auth" ? "idle" : "error", error: e instanceof Error ? e.message : "היצירה נכשלה" });
    }
  };

  const generateAll = () => {
    shots.filter(needsGeneration).forEach((s) => generate(s.id));
  };

  // poll queued clips and download finished ones
  useEffect(() => {
    if (!live) return;
    const tick = async () => {
      if (polling.current) return;
      polling.current = true;
      try {
        const pending = shotsRef.current.filter((s) => (s.status === "queued" || s.status === "rendering") && s.requestId && s.modelKey);
        await Promise.all(
          pending.map(async (s) => {
            try {
              const st = await checkGeneration(s.modelKey!, s.requestId!);
              if (st.status === "queued") update(s.id, { status: "queued", position: st.position });
              else if (st.status === "rendering") update(s.id, { status: "rendering" });
              else if (st.status === "done") update(s.id, { status: "done", videoUrl: st.videoUrl, genSig: s.pendingSig });
              else {
                update(s.id, { status: "error", error: st.refunded ? `${st.error}. הקרדיטים הוחזרו.` : st.error });
                if (st.refunded) refreshMe();
              }
            } catch {
              /* network hiccup: try again next tick */
            }
          }),
        );
      } finally {
        polling.current = false;
      }
    };
    tick();
    const iv = setInterval(tick, 4000);
    return () => clearInterval(iv);
  }, [live, update]);

  // download finished clips once, keep them in the browser for export
  useEffect(() => {
    for (const s of shots) {
      if (s.status !== "done" || !s.videoUrl) continue;
      if (downloadedFrom.current.get(s.id) === s.videoUrl || downloading.current.has(s.id)) continue;
      const url = s.videoUrl;
      downloading.current.add(s.id);
      fetchVideo(url)
        .then(async (blob) => {
          await save(`vid:${s.id}`, blob);
          downloadedFrom.current.set(s.id, url);
          setMedia((m) => {
            const prev = m[s.id];
            if (!prev) return m;
            if (prev.vid) URL.revokeObjectURL(prev.vid);
            return { ...m, [s.id]: { ...prev, vid: URL.createObjectURL(blob) } };
          });
        })
        .catch(() => setNotice("קליפ אחד לא ירד למכשיר. רעננו את העמוד כדי לנסות שוב."))
        .finally(() => downloading.current.delete(s.id));
    }
  }, [shots]);

  // ---------- derived ----------
  const toGenerate = shots.filter(needsGeneration);
  const busyCount = shots.filter((s) => BUSY.has(s.status)).length;
  const cost = toGenerate.length * MODELS[settings.model].pricePerClip;
  const accounts = Boolean(config?.accounts);
  const signedIn = Boolean(me?.user);
  const creditsNeeded = toGenerate.length * CREDITS_PER_CLIP[settings.model];
  const balance = me?.credits?.total ?? 0;
  const readyCount = shots.filter((s) => media[s.id]?.vid).length;
  const totalSeconds = useMemo(() => {
    const per = PACES[settings.pace].seconds;
    return shots.length ? Math.round(shots.length * (per - 0.6) + 0.6 + 3.6) : 0;
  }, [shots.length, settings.pace]);

  // ---------- render ----------
  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <h1>מתמונות של נכס לסרטון שמראה את החלל</h1>
          <p>מעלים תמונות, בוחרים תנועת מצלמה ואור לכל חלל, ומקבלים רילס ממותג.</p>
        </div>
        {config?.mode === "demo" && (
          <p className="mode">
            מצב דמו: התצוגה המקדימה מזיזה את התמונות בלבד. כדי לייצר וידאו AI מוסיפים מפתח FAL_KEY בהגדרות השרת.
          </p>
        )}
        {config?.mode === "mock" && <p className="mode">מצב בדיקה: הקליפים מדומים ולא עולים כסף.</p>}
      </header>

      {locked && (
        <form
          className="gate"
          onSubmit={(e) => {
            e.preventDefault();
            const v = (new FormData(e.currentTarget).get("pw") as string).trim();
            setPassword(v);
            setPw(v);
          }}
        >
          <label className="field">
            <span>סיסמת גישה ליצירת וידאו</span>
            <input name="pw" type="password" autoComplete="current-password" />
          </label>
          <button className="btn btn-primary" type="submit">
            כניסה
          </button>
        </form>
      )}

      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          <button type="button" className="link" onClick={() => setNotice("")}>
            הבנתי
          </button>
        </div>
      )}

      <main className="layout">
        <section className="col-shots" aria-labelledby="shots-title">
          <div className="section-head">
            <h2 id="shots-title">צילומים</h2>
            {shots.length > 1 && (
              <button type="button" className="link" onClick={sortByTour}>
                סידור לפי מסלול סיור
              </button>
            )}
          </div>

          {hydrated && shots.length === 0 ? (
            <label
              className={`drop drop-empty${drag ? " is-drag" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                addFiles(e.dataTransfer.files);
              }}
            >
              <input type="file" accept="image/*" multiple onChange={(e) => e.target.files && addFiles(e.target.files)} hidden />
              <span className="drop-title">הוסיפו תמונות של הנכס</span>
              <span className="drop-sub">חזית, סלון, מטבח, חדרים, מרפסת. בין 4 ל-10 תמונות יוצרות רילס של 20–40 שניות.</span>
              <span className="btn btn-primary">בחירת תמונות</span>
            </label>
          ) : (
            <>
              <div className="shots">
                {shots.map((s, i) => (
                  <ShotCard
                    key={s.id}
                    shot={s}
                    index={i}
                    count={shots.length}
                    aspect={settings.aspect}
                    img={media[s.id]?.img ?? ""}
                    vid={media[s.id]?.vid}
                    canGenerate={live && !locked}
                    onChange={(patch) => update(s.id, patch)}
                    onMove={(d) => move(s.id, d)}
                    onRemove={() => removeShot(s.id)}
                    onGenerate={() => generate(s.id)}
                  />
                ))}
              </div>
              <label
                className={`drop drop-more${drag ? " is-drag" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  addFiles(e.dataTransfer.files);
                }}
              >
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    if (e.target.files) addFiles(e.target.files);
                    e.target.value = "";
                  }}
                  hidden
                />
                {adding > 0 ? `מוסיף ${adding} תמונות…` : "הוספת תמונות"}
              </label>
            </>
          )}
        </section>

        <aside className="col-side">
          <section className="panel" aria-labelledby="details-title">
            <h2 id="details-title">פרטי הפרויקט</h2>
            <p className="panel-sub">מופיעים בפתיחה ובכרטיס הסיום של הרילס.</p>
            <label className="field">
              <span>שם הפרויקט</span>
              <input value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} placeholder="למשל: Olive Residences" />
            </label>
            <label className="field">
              <span>מיקום</span>
              <input value={info.location} onChange={(e) => setInfo({ ...info, location: e.target.value })} placeholder="למשל: זכרון יעקב" />
            </label>
            <label className="field">
              <span>שורת מחיר</span>
              <input value={info.price} onChange={(e) => setInfo({ ...info, price: e.target.value })} placeholder="למשל: 4 חדרים החל מ-2,890,000 ₪" />
            </label>
            <label className="field">
              <span>קריאה לפעולה</span>
              <input value={info.cta} onChange={(e) => setInfo({ ...info, cta: e.target.value })} placeholder="למשל: לתיאום סיור בדירה לדוגמה" />
            </label>
            <label className="field">
              <span>טלפון</span>
              <input dir="ltr" inputMode="tel" value={info.phone} onChange={(e) => setInfo({ ...info, phone: e.target.value })} placeholder="*5555" />
            </label>
            <div className="row-2">
              <div className="field">
                <span>לוגו</span>
                <label className="file">
                  <input
                    type="file"
                    accept="image/png,image/svg+xml,image/webp,image/jpeg"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (logo) URL.revokeObjectURL(logo.url);
                      setLogo({ blob: f, url: URL.createObjectURL(f) });
                      save("logo", f);
                    }}
                  />
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logo.url} alt="הלוגו שהועלה" />
                  ) : (
                    "העלאת לוגו"
                  )}
                </label>
                {logo && (
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      URL.revokeObjectURL(logo.url);
                      setLogo(null);
                      remove("logo");
                    }}
                  >
                    הסרה
                  </button>
                )}
              </div>
              <label className="field">
                <span>צבע לכרטיס הסיום</span>
                <span className="color">
                  <input type="color" value={info.brand} onChange={(e) => setInfo({ ...info, brand: e.target.value })} />
                  <code dir="ltr">{info.brand}</code>
                </span>
              </label>
            </div>
          </section>

          <section className="panel" aria-labelledby="style-title">
            <h2 id="style-title">עריכה</h2>

            <div className="field">
              <span>פורמט</span>
              <div className="seg">
                {(Object.keys(ASPECTS) as Aspect[]).map((a) => (
                  <button key={a} type="button" aria-pressed={settings.aspect === a} onClick={() => setSettings({ ...settings, aspect: a })}>
                    <b dir="ltr">{ASPECTS[a].label}</b>
                    <small>{ASPECTS[a].hint}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <span>תצוגה</span>
              <div className="seg">
                <button type="button" aria-pressed={settings.layout === "full"} onClick={() => setSettings({ ...settings, layout: "full" })}>
                  <b>מסך מלא</b>
                  <small>סיור בנכס</small>
                </button>
                <button type="button" aria-pressed={settings.layout === "split"} onClick={() => setSettings({ ...settings, layout: "split" })}>
                  <b>לפני ואחרי</b>
                  <small>תמונה מול וידאו</small>
                </button>
              </div>
            </div>

            <div className="field">
              <span>קצב</span>
              <div className="seg">
                {(Object.keys(PACES) as Pace[]).map((k) => (
                  <button key={k} type="button" aria-pressed={settings.pace === k} onClick={() => setSettings({ ...settings, pace: k })}>
                    <b>{PACES[k].he}</b>
                    <small>{PACES[k].seconds} שניות לחלל</small>
                  </button>
                ))}
              </div>
            </div>

            <label className="check">
              <input type="checkbox" checked={settings.labels} onChange={(e) => setSettings({ ...settings, labels: e.target.checked })} />
              שמות החללים על המסך
            </label>

            <div className="field">
              <span>מוזיקה</span>
              <div className="music">
                <label className="btn btn-ghost">
                  <input
                    type="file"
                    accept="audio/*"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (music) URL.revokeObjectURL(music.url);
                      setMusic({ blob: f, url: URL.createObjectURL(f), name: f.name });
                      save("music", f);
                    }}
                  />
                  {music ? "החלפה" : "העלאת קובץ"}
                </label>
                {music && (
                  <>
                    <span className="music-name" dir="auto">{music.name}</span>
                    <button
                      type="button"
                      className="link"
                      onClick={() => {
                        URL.revokeObjectURL(music.url);
                        setMusic(null);
                        remove("music");
                      }}
                    >
                      הסרה
                    </button>
                  </>
                )}
              </div>
            </div>

            {live && (
              <>
                <div className="field">
                  <span>מודל וידאו</span>
                  <div className="seg">
                    {(Object.keys(FAMILIES) as Family[]).map((f) => (
                      <button
                        key={f}
                        type="button"
                        aria-pressed={MODELS[settings.model].family === f}
                        onClick={() => setSettings({ ...settings, model: modelKeyOf(f, MODELS[settings.model].resolution) })}
                      >
                        <b dir="ltr">{FAMILIES[f].name}</b>
                      </button>
                    ))}
                  </div>
                  <p className="fine">{FAMILIES[MODELS[settings.model].family].note}</p>
                </div>
                <div className="field">
                  <span>רזולוציה</span>
                  <div className="seg">
                    {(["720p", "1080p"] as Resolution[]).map((r) => {
                      const k = modelKeyOf(MODELS[settings.model].family, r);
                      return (
                        <button key={r} type="button" aria-pressed={settings.model === k} onClick={() => setSettings({ ...settings, model: k })}>
                          <b dir="ltr">{r}</b>
                          <small>
                            {accounts ? `${CREDITS_PER_CLIP[k]} קרדיטים לקליפ` : <span dir="ltr">${MODELS[k].pricePerClip.toFixed(2)} לקליפ</span>}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                  <p className="fine">קליפ של 5 שניות לכל חלל.</p>
                </div>
              </>
            )}
          </section>
        </aside>
      </main>

      {shots.length > 0 && (
        <div className="bar">
          <div className="bar-inner">
            <div className="bar-info">
              <b>{shots.length} חללים, כ-{totalSeconds} שניות</b>
              <span>
                {accounts && signedIn ? `יתרה: ${balance} קרדיטים. ` : ""}
                {live
                  ? busyCount
                    ? `${busyCount} קליפים בעבודה`
                    : `${readyCount} מתוך ${shots.length} עם וידאו AI`
                  : "תצוגה מקדימה עם תנועה מדומה"}
              </span>
            </div>
            <div className="bar-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setPlayer(true)}>
                צפייה ברילס
              </button>
              {live && accounts && !signedIn && me && (
                <Link className="btn btn-primary" href="/login?next=/">
                  התחברות כדי ליצור וידאו
                </Link>
              )}
              {live && accounts && signedIn && toGenerate.length > 0 && creditsNeeded > balance && (
                <Link className="btn btn-primary" href="/pricing">
                  חסרים {creditsNeeded - balance} קרדיטים
                </Link>
              )}
              {live && (!accounts || (signedIn && (creditsNeeded <= balance || !toGenerate.length))) && (
                <button type="button" className="btn btn-primary" onClick={generateAll} disabled={!toGenerate.length || locked}>
                  {toGenerate.length ? (
                    <>
                      יצירת וידאו ל-{toGenerate.length} חללים{" "}
                      {accounts ? <small>{creditsNeeded} קרדיטים</small> : <small dir="ltr">~${cost.toFixed(2)}</small>}
                    </>
                  ) : busyCount ? (
                    "יוצר…"
                  ) : (
                    "כל הקליפים מוכנים"
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {player && (
        <PlayerSheet
          shots={shots}
          media={media}
          imageBlob={(id) => blobs.current.get(id)}
          info={info}
          settings={settings}
          logo={logo?.blob}
          musicUrl={music?.url}
          onClose={() => setPlayer(false)}
        />
      )}
    </div>
  );
}
