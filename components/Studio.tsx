"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  readBrand,
  startGeneration,
  uploadImage,
  type Config,
} from "@/lib/api";
import ShotCard from "./ShotCard";
import ShotSheet from "./ShotSheet";
import BrandPanel from "./BrandSheet";
import PlayerSheet from "./PlayerSheet";
import { IconCheck, IconChevron, IconFrame, IconPlay, IconPlus, IconSpark } from "./Icons";
import { statusLine } from "./ShotCard";
import { loadBrandFonts, type Brand } from "@/lib/brand";
import { promptOf, sigOf, type Info, type Media, type Settings, type Shot } from "./types";

type Saved = { shots: Shot[]; info: Info; settings: Settings; musicName?: string; brand?: Brand | null };

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
  const [brand, setBrand] = useState<Brand | null>(null);
  const [brandBusy, setBrandBusy] = useState(false);
  const [brandError, setBrandError] = useState("");
  const [step, setStep] = useState<"photos" | "brand" | "video">("photos");
  const [openShot, setOpenShot] = useState<string | null>(null);
  const [lastShot, setLastShot] = useState<string | null>(null);
  const style = brand?.applyPrompt ? brand.photoStyle : undefined;
  const styleRef = useRef(style);
  styleRef.current = style;

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
        if (saved.brand) {
          setBrand(saved.brand);
          loadBrandFonts(saved.brand);
        }
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
    latest.current = { shots, info, settings, musicName: music?.name, brand };
    const id = setTimeout(() => save("project", latest.current), 400);
    return () => clearTimeout(id);
  }, [hydrated, shots, info, settings, music, brand]);
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

  // ---------- brand ----------
  const setLogoBlob = (blob: Blob) => {
    setLogo((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { blob, url: URL.createObjectURL(blob) };
    });
    save("logo", blob);
  };

  const fetchBrand = async (url: string) => {
    setBrandBusy(true);
    setBrandError("");
    try {
      const { brand: b, logo: data } = await readBrand(url);
      setBrand(b);
      loadBrandFonts(b);
      setInfo((i) => ({ ...i, brand: b.colors.primary, website: b.host }));
      if (data) setLogoBlob(await (await fetch(data)).blob());
    } catch (e) {
      setBrandError(e instanceof Error ? e.message : "לא הצלחנו לקרוא את האתר");
    }
    setBrandBusy(false);
  };

  const patchBrand = (patch: Partial<Brand>) => {
    setBrand((b) => (b ? { ...b, ...patch } : b));
    if (patch.colors) setInfo((i) => ({ ...i, brand: patch.colors!.primary }));
  };

  const removeBrand = () => {
    setBrand(null);
    setInfo((i) => ({ ...i, website: "" }));
  };

  const sortByTour = () => {
    const order = (s: Shot) => ROOMS.findIndex((r) => r.id === s.room);
    setShots((prev) => prev.map((s, i) => ({ s, i })).sort((a, b) => order(a.s) - order(b.s) || a.i - b.i).map((x) => x.s));
  };

  // ---------- generation ----------
  const live = config?.mode === "live" || config?.mode === "mock";
  const locked = Boolean(config?.protected && !pw);

  const needsGeneration = (s: Shot) =>
    !BUSY.has(s.status) && (s.status === "idle" || s.status === "error" || (s.status === "done" && s.genSig !== sigOf(s, settings.aspect, style)));

  const generate = async (id: string) => {
    const s = shotsRef.current.find((x) => x.id === id);
    const blob = blobs.current.get(id);
    if (!s || !blob) return;
    const { aspect, model } = settingsRef.current;
    const sig = sigOf(s, aspect, styleRef.current);
    update(id, { status: "preparing", error: undefined });
    try {
      const { w, h } = ASPECTS[aspect];
      const cropped = await (await cropToFrame(blob, w, h, s.fx, s.fy)).blob();
      const imageUrl = await uploadImage(cropped);
      const requestId = await startGeneration(model, imageUrl, promptOf(s, styleRef.current));
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
  const brandReady = live && !locked && (!accounts || signedIn);
  const shown = shots.find((s) => s.id === (openShot ?? lastShot));
  const shownIndex = shown ? shots.indexOf(shown) : 0;
  const isStale = (s: Shot) => s.status === "done" && s.genSig !== sigOf(s, settings.aspect, style);
  const openCard = (id: string) => {
    setLastShot(id);
    setOpenShot(id);
  };
  const go = (st: typeof step) => {
    setStep(st);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(true);
    },
    onDragLeave: () => setDrag(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      addFiles(e.dataTransfer.files);
    },
  };
  const picker = (
    <input
      ref={fileInput}
      type="file"
      accept="image/*"
      multiple
      hidden
      onChange={(e) => {
        if (e.target.files) addFiles(e.target.files);
        e.target.value = "";
      }}
    />
  );

  const done = { photos: shots.length > 0, brand: Boolean(brand || info.name || logo), video: shots.length > 0 && readyCount === shots.length };
  const STEPS = [
    { id: "photos", label: "תמונות", sub: shots.length ? `${shots.length} חללים` : "מעלים את הנכס" },
    { id: "brand", label: "מותג ופרטים", sub: brand ? brand.name : info.name || "לוגו, צבעים, טקסט" },
    { id: "video", label: "סרטון", sub: live ? `${readyCount}/${shots.length || 0} קליפים` : "תצוגה מקדימה" },
  ] as const;

  // one main action per step
  let primary: React.ReactNode = null;
  if (step === "photos") {
    primary = shots.length ? (
      <button type="button" className="btn btn-primary" onClick={() => go("brand")}>
        המשך למותג <IconChevron />
      </button>
    ) : (
      <button type="button" className="btn btn-primary" onClick={() => fileInput.current?.click()}>
        בחירת תמונות
      </button>
    );
  } else if (step === "brand") {
    primary = (
      <button type="button" className="btn btn-primary" onClick={() => go("video")} disabled={!shots.length}>
        המשך לסרטון <IconChevron />
      </button>
    );
  } else if (!live || !toGenerate.length) {
    primary = (
      <button type="button" className="btn btn-primary" onClick={() => setPlayer(true)} disabled={!shots.length || busyCount > 0}>
        {busyCount ? `יוצר ${busyCount} קליפים…` : readyCount ? "צפייה וייצוא" : "צפייה בתצוגה מקדימה"}
      </button>
    );
  } else if (accounts && !signedIn) {
    primary = (
      <Link className="btn btn-primary" href="/login?next=/">
        התחברות כדי ליצור וידאו
      </Link>
    );
  } else if (accounts && creditsNeeded > balance) {
    primary = (
      <Link className="btn btn-primary" href="/pricing">
        חסרים {creditsNeeded - balance} קרדיטים
      </Link>
    );
  } else {
    primary = (
      <button type="button" className="btn btn-primary" onClick={generateAll} disabled={locked}>
        יצירת וידאו ל-{toGenerate.length} חללים
      </button>
    );
  }
  const costNote =
    step === "video" && live && toGenerate.length > 0 ? (accounts ? `${creditsNeeded} קרדיטים${signedIn ? `, יתרה ${balance}` : ""}` : `~$${cost.toFixed(2)}`) : null;

  return (
    <div className="app">
      <nav className="steps" aria-label="שלבים">
        {STEPS.map((st, i) => (
          <button key={st.id} type="button" className="step" aria-current={step === st.id ? "step" : undefined} onClick={() => go(st.id)}>
            <span className={`step-dot${done[st.id] ? " is-done" : ""}`}>{done[st.id] && step !== st.id ? <IconCheck /> : i + 1}</span>
            <span className="step-text">
              <b>{st.label}</b>
              <small>{st.sub}</small>
            </span>
          </button>
        ))}
      </nav>

      {config?.mode === "demo" && <p className="mode">מצב דמו: התצוגה המקדימה מזיזה את התמונות בלבד. כדי לייצר וידאו AI מוסיפים מפתח FAL_KEY בהגדרות השרת.</p>}
      {config?.mode === "mock" && <p className="mode">מצב בדיקה: הקליפים מדומים ולא עולים כסף.</p>}

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
          <button className="btn btn-dark" type="submit">
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
        <div className="col-main">
          {picker}

          {step === "photos" && (
            <section className="stage" aria-labelledby="t-photos">
              <header className="stage-head">
                <h1 id="t-photos">תמונות הנכס</h1>
                <p>כל תמונה הופכת לקליפ של חלל אחד. לוחצים על תמונה כדי לבחור חלל, תנועת מצלמה ואור.</p>
              </header>
              {shots.length === 0 ? (
                <div className={`drop-empty${drag ? " is-drag" : ""}`} {...dropProps} onClick={() => fileInput.current?.click()} role="button" tabIndex={0}>
                  <span className="drop-art" aria-hidden>
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="drop-title">גררו לכאן תמונות, או בחרו מהמכשיר</span>
                  <span className="drop-sub">חזית, סלון, מטבח, חדרים, מרפסת. 4 עד 10 תמונות יוצרות רילס של 20–40 שניות.</span>
                </div>
              ) : (
                <>
                  <div className="toolbar">
                    <span>{shots.length} חללים, לפי סדר ההופעה בסרטון</span>
                    {shots.length > 1 && (
                      <button type="button" className="link" onClick={sortByTour}>
                        סידור אוטומטי לפי מסלול סיור
                      </button>
                    )}
                  </div>
                  <div className={`grid grid-${settings.aspect.replace(":", "x")}`}>
                    {shots.map((s, i) => (
                      <ShotCard
                        key={s.id}
                        shot={s}
                        index={i}
                        aspect={settings.aspect}
                        img={media[s.id]?.img ?? ""}
                        vid={media[s.id]?.vid}
                        stale={isStale(s)}
                        onOpen={() => openCard(s.id)}
                      />
                    ))}
                    <button type="button" className={`card card-add${drag ? " is-drag" : ""}`} {...dropProps} onClick={() => fileInput.current?.click()}>
                      <span className="card-media" style={{ aspectRatio: `${ASPECTS[settings.aspect].w} / ${ASPECTS[settings.aspect].h}` }}>
                        <IconPlus />
                        <b>{adding > 0 ? `מוסיף ${adding}…` : "הוספת תמונות"}</b>
                      </span>
                    </button>
                  </div>
                </>
              )}
            </section>
          )}

          {step === "brand" && (
            <section className="stage" aria-labelledby="t-brand">
              <header className="stage-head">
                <h1 id="t-brand">מותג ופרטים</h1>
                <p>מה יופיע על הסרטון ובאיזו שפה הוא ייראה.</p>
              </header>

              <div className="block">
                <div className="block-head">
                  <IconSpark className="assist-star" />
                  <div>
                    <h2>המותג</h2>
                    <p>מדביקים קישור לאתר החברה ומקבלים לוגו, צבעים, פונטים ושפת צילום. אפשר גם לדלג ולהעלות לוגו ידנית למטה.</p>
                  </div>
                </div>
                <BrandPanel
                  brand={brand}
                  logoUrl={logo?.url}
                  busy={brandBusy}
                  error={brandError}
                  canRead={brandReady}
                  onRead={fetchBrand}
                  onChange={patchBrand}
                  onRemove={removeBrand}
                  onLogo={setLogoBlob}
                />
              </div>

              <div className="block">
                <h2>פורמט</h2>
                <p className="block-sub">איפה הסרטון יתפרסם. אפשר לייצא שוב בפורמט אחר בכל שלב.</p>
                <FormatTabs value={settings.aspect} onChange={(aspect) => setSettings({ ...settings, aspect })} />
              </div>

              <div className="block">
                <h2>טקסט על הסרטון</h2>
                <p className="block-sub">שם ומיקום בפתיחה. מחיר, קריאה לפעולה וטלפון בכרטיס הסיום.</p>
                <div className="row-2">
                  <label className="field">
                    <span>שם הפרויקט</span>
                    <input value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} placeholder="Olive Residences" />
                  </label>
                  <label className="field">
                    <span>מיקום</span>
                    <input value={info.location} onChange={(e) => setInfo({ ...info, location: e.target.value })} placeholder="זכרון יעקב" />
                  </label>
                </div>
                <label className="field">
                  <span>שורת מחיר</span>
                  <input value={info.price} onChange={(e) => setInfo({ ...info, price: e.target.value })} placeholder="4 חדרים החל מ-2,890,000 ₪" />
                </label>
                <label className="field">
                  <span>קריאה לפעולה</span>
                  <input value={info.cta} onChange={(e) => setInfo({ ...info, cta: e.target.value })} placeholder="לתיאום סיור בדירה לדוגמה" />
                </label>
                <div className="row-2">
                  <label className="field">
                    <span>טלפון</span>
                    <input dir="ltr" inputMode="tel" value={info.phone} onChange={(e) => setInfo({ ...info, phone: e.target.value })} placeholder="*5555" />
                  </label>
                  <label className="field">
                    <span>אתר</span>
                    <input dir="ltr" inputMode="url" value={info.website ?? ""} onChange={(e) => setInfo({ ...info, website: e.target.value })} placeholder="yourcompany.co.il" />
                  </label>
                </div>
                <div className="row-2">
                  <div className="field">
                    <span>לוגו</span>
                    <label className="file">
                      <input type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" hidden onChange={(e) => e.target.files?.[0] && setLogoBlob(e.target.files[0])} />
                      {logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logo.url} alt="הלוגו" />
                      ) : (
                        "העלאת לוגו"
                      )}
                    </label>
                  </div>
                  <label className="field">
                    <span>צבע כרטיס הסיום</span>
                    <span className="color">
                      <input type="color" value={info.brand} onChange={(e) => setInfo({ ...info, brand: e.target.value })} />
                      <code dir="ltr">{info.brand}</code>
                    </span>
                  </label>
                </div>
              </div>
            </section>
          )}

          {step === "video" && (
            <section className="stage" aria-labelledby="t-video">
              <header className="stage-head">
                <h1 id="t-video">הסרטון</h1>
                <p>{live ? "יוצרים וידאו AI לכל חלל, צופים ומייצאים." : "צופים בתצוגה המקדימה ומייצאים."}</p>
              </header>

              {shots.length === 0 ? (
                <div className="block empty-block">
                  <p>עוד אין תמונות.</p>
                  <button type="button" className="btn btn-outline" onClick={() => go("photos")}>
                    להוספת תמונות
                  </button>
                </div>
              ) : (
                <>
                  <button type="button" className="poster" onClick={() => setPlayer(true)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={media[shots[0].id]?.img} alt="" />
                    <span className="poster-play">
                      <IconPlay />
                    </span>
                    <span className="poster-text">
                      <b>{info.name || "צפייה ברילס"}</b>
                      <small>
                        כ-{totalSeconds} שניות, {ASPECTS[settings.aspect].hint}
                      </small>
                    </span>
                  </button>

                  {live && (
                    <div className="block">
                      <h2>קליפים</h2>
                      <ul className="clips">
                        {shots.map((s, i) => {
                          const busy = BUSY.has(s.status);
                          return (
                            <li key={s.id}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={media[s.id]?.img} alt="" />
                              <span className="clip-text">
                                <b>
                                  {i + 1}. {ROOMS.find((r) => r.id === s.room)?.he}
                                </b>
                                <small className={s.status === "error" ? "is-error" : ""}>{statusLine(s, isStale(s), live)}</small>
                              </span>
                              {busy ? (
                                <span className="spinner" aria-label="בעבודה" />
                              ) : s.status === "done" && !isStale(s) ? (
                                <IconCheck className="clip-ok" />
                              ) : (
                                <button type="button" className="btn btn-quiet btn-small" onClick={() => generate(s.id)} disabled={locked || (accounts && !signedIn)}>
                                  {s.status === "error" ? "ניסיון נוסף" : s.status === "done" ? "יצירה מחדש" : "יצירה"}
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  <div className="block">
                    <h2>עריכה</h2>
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
                    <label className="toggle">
                      <span>
                        <b>שמות החללים על המסך</b>
                      </span>
                      <input type="checkbox" role="switch" checked={settings.labels} onChange={(e) => setSettings({ ...settings, labels: e.target.checked })} />
                    </label>
                    <div className="toggle">
                      <span>
                        <b>מוזיקה</b>
                        <small dir="auto">{music ? music.name : "בלי מוזיקה"}</small>
                      </span>
                      <span className="music">
                        {music && (
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
                        )}
                        <label className="btn btn-outline btn-small">
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
                          {music ? "החלפה" : "העלאה"}
                        </label>
                      </span>
                    </div>
                  </div>

                  {live && (
                    <div className="block">
                      <h2>מודל וידאו</h2>
                      <div className="field">
                        <div className="seg">
                          {(Object.keys(FAMILIES) as Family[]).map((f) => (
                            <button
                              key={f}
                              type="button"
                              aria-pressed={MODELS[settings.model].family === f}
                              onClick={() => setSettings({ ...settings, model: modelKeyOf(f, MODELS[settings.model].resolution) })}
                            >
                              <b dir="ltr">{FAMILIES[f].name}</b>
                              <small>{FAMILIES[f].note}</small>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="field">
                        <span>רזולוציה</span>
                        <div className="seg">
                          {(["720p", "1080p"] as Resolution[]).map((r) => {
                            const k = modelKeyOf(MODELS[settings.model].family, r);
                            return (
                              <button key={r} type="button" aria-pressed={settings.model === k} onClick={() => setSettings({ ...settings, model: k })}>
                                <b dir="ltr">{r}</b>
                                <small>{accounts ? `${CREDITS_PER_CLIP[k]} קרדיטים לקליפ` : <span dir="ltr">${MODELS[k].pricePerClip.toFixed(2)} לקליפ</span>}</small>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </div>

        <aside className="col-side">
          <section
            className="sum"
            aria-label="הרילס"
            style={shots[0] && media[shots[0].id] ? ({ "--photo": `url(${media[shots[0].id].img})` } as React.CSSProperties) : undefined}
          >
            <p className="sum-head">
              <b>{info.name || "פרויקט חדש"}</b>
            </p>
            <p className="sum-sub">{shots.length ? `${shots.length} חללים, כ-${totalSeconds} שניות, ${ASPECTS[settings.aspect].hint}` : "מתחילים מתמונות של הנכס"}</p>
            {shots.length > 0 && (
              <div className="sum-thumbs" aria-hidden>
                {shots.slice(0, 8).map((s) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={s.id} src={media[s.id]?.img} alt="" className={s.status === "done" ? "is-ready" : ""} />
                ))}
              </div>
            )}
            <div className="sum-actions">
              {costNote && <p className="sum-total">{costNote}</p>}
              {primary}
              {shots.length > 0 && step !== "video" && (
                <button type="button" className="btn btn-outline" onClick={() => setPlayer(true)}>
                  <IconPlay /> תצוגה מקדימה
                </button>
              )}
            </div>
          </section>
        </aside>
      </main>

      <div className="bar">
        <div className="bar-info">
          <b>{STEPS.find((x) => x.id === step)!.label}</b>
          <small>{costNote ?? STEPS.find((x) => x.id === step)!.sub}</small>
        </div>
        <div className="bar-actions">{primary}</div>
      </div>

      {shown && (
        <ShotSheet
          open={Boolean(openShot)}
          shot={shown}
          index={shownIndex}
          count={shots.length}
          aspect={settings.aspect}
          img={media[shown.id]?.img ?? ""}
          vid={media[shown.id]?.vid}
          stale={isStale(shown)}
          live={live}
          canGenerate={live && !locked}
          style={style}
          onChange={(patch) => update(shown.id, patch)}
          onMove={(d) => move(shown.id, d)}
          onRemove={() => {
            setOpenShot(null);
            setLastShot(null);
            removeShot(shown.id);
          }}
          onGenerate={() => generate(shown.id)}
          onClose={() => setOpenShot(null)}
        />
      )}

      {player && (
        <PlayerSheet
          shots={shots}
          media={media}
          imageBlob={(id) => blobs.current.get(id)}
          info={info}
          settings={settings}
          logo={logo?.blob}
          brand={brand}
          musicUrl={music?.url}
          onClose={() => setPlayer(false)}
        />
      )}
    </div>
  );
}

// Output formats as tabs; the underline slides to the chosen one.
function FormatTabs({ value, onChange }: { value: Aspect; onChange: (a: Aspect) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [line, setLine] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current?.querySelector<HTMLElement>('[aria-selected="true"]');
      if (el) setLine({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    document.fonts?.ready.then(measure);
    return () => window.removeEventListener("resize", measure);
  }, [value]);
  return (
    <div className="tabs" role="tablist" aria-label="פורמט" ref={ref}>
      {(Object.keys(ASPECTS) as Aspect[]).map((a) => (
        <button key={a} type="button" role="tab" aria-selected={value === a} onClick={() => onChange(a)}>
          <IconFrame w={ASPECTS[a].w} h={ASPECTS[a].h} />
          <span>{ASPECTS[a].hint}</span>
        </button>
      ))}
      {line && <i className="tabs-line" style={{ width: line.w, transform: `translateX(${line.x}px)` }} />}
    </div>
  );
}
