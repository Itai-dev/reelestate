"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ASPECTS,
  DEFAULT_MODEL,
  EDITS,
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
import { CREDITS_PER_CLIP, CREDITS_PER_EDIT } from "@/lib/plans";
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
  startEdit,
  understand,
  writeScript,
  type Action,
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
import Thinking from "./Thinking";
import ChangeBar, { type Change } from "./ChangeBar";
import { loadBrandFonts, type Brand } from "@/lib/brand";
import { download as cloudDownload, getProject, getUser, saveProject, sb, signInWithGoogle, upload as cloudUpload, type CloudProject } from "@/lib/cloud";
import type { User } from "@supabase/supabase-js";
import { promptOf, sigOf, type Info, type Media, type Settings, type Shot } from "./types";

type Files = { img: Record<string, string>; vid: Record<string, string>; vidSrc: Record<string, string>; logo?: string; music?: string };
type Saved = { shots: Shot[]; info: Info; settings: Settings; musicName?: string; brand?: Brand | null; savedAt?: number; files?: Files };
const NO_FILES = (): Files => ({ img: {}, vid: {}, vidSrc: {} });

// Empties the browser copy of the current project (its photos, clips, logo and music).
async function clearLocal() {
  const saved = await load<Saved>("project");
  for (const s of saved?.shots ?? []) {
    await remove(`img:${s.id}`);
    await remove(`vid:${s.id}`);
  }
  await remove("logo");
  await remove("music");
  await remove("project");
}

// Copies a project from the account into the browser, then the normal load takes over.
async function importCloud(c: CloudProject) {
  const d = c.data as unknown as Saved;
  const files: Files = { ...NO_FILES(), ...(c.data.files as Partial<Files> | undefined) };
  const shots = (d.shots ?? []) as Shot[];
  await Promise.all(
    shots.map(async (s) => {
      if (files.img[s.id]) await save(`img:${s.id}`, await cloudDownload(files.img[s.id]).catch(() => null));
      if (files.vid[s.id]) {
        const v = await cloudDownload(files.vid[s.id]).catch(() => null);
        if (v) await save(`vid:${s.id}`, v);
      }
    }),
  );
  if (files.logo) await save("logo", await cloudDownload(files.logo).catch(() => null));
  if (files.music) await save("music", await cloudDownload(files.music).catch(() => null));
  await save("project", { ...d, shots, files, savedAt: new Date(c.updated_at).getTime() });
}

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
  const [changes, setChanges] = useState<Change[]>([]);
  const [writing, setWriting] = useState(false);
  const scriptTried = useRef(false);
  const snapshots = useRef(new Map<string, { info: Info; settings: Settings; captions: Record<string, string | undefined>; videos: Record<string, string | undefined> }>());
  const [lastShot, setLastShot] = useState<string | null>(null);
  const style = brand?.applyPrompt ? brand.photoStyle : undefined;
  const styleRef = useRef(style);
  styleRef.current = style;

  const blobs = useRef(new Map<string, Blob>());
  const shotsRef = useRef<Shot[]>([]);
  shotsRef.current = shots;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const mediaRef = useRef(media);
  mediaRef.current = media;
  const logoRef = useRef(logo);
  logoRef.current = logo;
  const musicRef = useRef(music);
  musicRef.current = music;
  const downloading = useRef(new Set<string>());
  const downloadedFrom = useRef(new Map<string, string>()); // shot id -> clip url already saved locally
  const polling = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [cloud, setCloud] = useState<"off" | "saving" | "saved" | "error">("off");
  const pid = useRef("");
  const files = useRef<Files>(NO_FILES());
  const dirty = useRef({ logo: false, music: false });

  // ---------- load saved project (from the account when signed in) ----------
  useEffect(() => {
    (async () => {
      const q = new URLSearchParams(location.search);
      let id = (await load<string>("projectId")) || "";
      const want = q.get("p");
      if (q.has("new") || (want && want !== id)) {
        await clearLocal();
        id = want || crypto.randomUUID();
        history.replaceState(null, "", "/");
      }
      if (!id) id = crypto.randomUUID();
      pid.current = id;
      const prev = await load<string>("projectId");
      await save("projectId", id);
      if (prev !== id && typeof BroadcastChannel !== "undefined") {
        const ch = new BroadcastChannel("reel-estate");
        ch.postMessage({ type: "project", id });
        ch.close();
      }

      const u = await getUser().catch(() => null);
      setUser(u);
      if (u) {
        try {
          const c = await getProject(id);
          const local = await load<Saved>("project");
          if (c && (!local?.shots?.length || new Date(c.updated_at).getTime() > (local.savedAt ?? 0) + 1000)) await importCloud(c);
          setCloud("saved");
        } catch {
          setCloud("error");
        }
      }

      const saved = await load<Saved>("project");
      files.current = { ...NO_FILES(), ...saved?.files };
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
              s.status === "preparing" || (BUSY.has(s.status) && !(s.modelKey && (s.modelKey in MODELS || s.modelKey.startsWith("edit")))) ? { ...s, status: "idle" } : s,
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
    latest.current = { shots, info, settings, musicName: music?.name, brand, savedAt: Date.now(), files: files.current };
    const id = setTimeout(async () => {
      if ((await load<string>("projectId")) === pid.current) save("project", latest.current);
    }, 400);
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

  useEffect(() => {
    if (step !== "video" || !hydrated || scriptTried.current) return;
    if (!(config?.mode === "live") || locked || !shots.length) return;
    if (info.hook || shots.some((s) => s.caption)) return;
    scriptTried.current = true;
    writeTexts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, hydrated, config]);

  // ---------- account sync ----------
  useEffect(() => {
    const { data } = sb().auth.onAuthStateChange((_e: string, session: { user: User } | null) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  const hadShots = useRef(false);
  if (shots.length) hadShots.current = true;

  // Another tab switched projects: this tab's copy is stale, so reload it.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel("reel-estate");
    ch.onmessage = (e) => {
      if (e.data?.type === "project" && e.data.id !== pid.current) location.reload();
    };
    return () => ch.close();
  }, []);

  const syncing = useRef(false);
  const syncAgain = useRef(false);
  useEffect(() => {
    if (!hydrated || !user) return;
    if (!shots.length && !hadShots.current) return;
    const run = async () => {
      if (syncing.current) {
        syncAgain.current = true;
        return;
      }
      if ((await load<string>("projectId")) !== pid.current) return;
      syncing.current = true;
      setCloud("saving");
      try {
        const base = `${user.id}/${pid.current}`;
        const f = files.current;
        for (const sh of shotsRef.current) {
          const img = blobs.current.get(sh.id);
          if (img && !f.img[sh.id]) f.img[sh.id] = await cloudUpload(`${base}/img-${sh.id}.jpg`, img);
          const vidUrl = mediaRef.current[sh.id]?.vid;
          if (vidUrl && sh.videoUrl && f.vidSrc[sh.id] !== sh.videoUrl) {
            const blob = await fetch(vidUrl).then((r) => r.blob());
            f.vid[sh.id] = await cloudUpload(`${base}/vid-${sh.id}.mp4`, blob);
            f.vidSrc[sh.id] = sh.videoUrl;
          }
        }
        const ids = new Set(shotsRef.current.map((x) => x.id));
        for (const k of Object.keys(f.img)) if (!ids.has(k)) delete f.img[k];
        for (const k of Object.keys(f.vid)) if (!ids.has(k)) (delete f.vid[k], delete f.vidSrc[k]);
        if (logoRef.current && (dirty.current.logo || !f.logo)) {
          f.logo = await cloudUpload(`${base}/logo`, logoRef.current.blob);
          dirty.current.logo = false;
        }
        if (!logoRef.current) f.logo = undefined;
        if (musicRef.current && (dirty.current.music || !f.music)) {
          f.music = await cloudUpload(`${base}/music`, musicRef.current.blob);
          dirty.current.music = false;
        }
        if (!musicRef.current) f.music = undefined;
        const l = latest.current;
        const first = shotsRef.current[0];
        await saveProject({
          id: pid.current,
          userId: user.id,
          name: l?.info.name ?? "",
          data: { ...l, files: f },
          cover: first ? f.img[first.id] ?? null : null,
        });
        setCloud("saved");
      } catch {
        setCloud("error");
      } finally {
        syncing.current = false;
        if (syncAgain.current) {
          syncAgain.current = false;
          setTimeout(run, 500);
        }
      }
    };
    const t = setTimeout(run, 2000);
    return () => clearTimeout(t);
  }, [hydrated, user, shots, info, settings, brand, media, logo, music]);

  // ---------- brand ----------
  const setLogoBlob = (blob: Blob) => {
    dirty.current.logo = true;
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

  // Changes a finished clip from one sentence; the earlier versions stay one tap away.
  const editClip = async (id: string, prompt: string, label: string) => {
    const s = shotsRef.current.find((x) => x.id === id);
    if (!s?.videoUrl) return;
    const versions = s.versions?.length ? s.versions : [{ url: s.videoUrl, label: "מקור" }];
    update(id, { versions, editError: undefined });
    try {
      const requestId = await startEdit(s.videoUrl, prompt);
      update(id, { status: "queued", requestId, modelKey: "edit720", pendingSig: s.genSig, editLabel: label, position: undefined });
      refreshMe();
    } catch (e) {
      update(id, { editError: e instanceof Error ? e.message : "העריכה נכשלה" });
    }
  };

  // ---------- on-screen copy ----------
  const writeTexts = async () => {
    setWriting(true);
    try {
      const list = shotsRef.current;
      const r = await writeScript({
        info: { name: info.name, location: info.location, price: info.price, cta: info.cta },
        brand: brand ? { name: brand.name, tone: brand.tone, vibe: brand.vibe } : null,
        rooms: list.map((s) => (s.room === "other" ? "חלל" : ROOMS.find((x) => x.id === s.room)!.he)),
        style: settingsRef.current.textStyle ?? "bold",
      });
      setInfo((i) => ({ ...i, hook: r.hook || i.hook, cta: i.cta || r.cta }));
      setShots((prev) => prev.map((s) => {
        const k = list.findIndex((x) => x.id === s.id);
        return k >= 0 && r.captions[k] ? { ...s, caption: r.captions[k] } : s;
      }));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "לא הצלחנו לכתוב טקסטים");
    }
    setWriting(false);
  };

  // ---------- one-line changes ----------
  const runChange = async (text: string) => {
    const id = uid();
    const snap = {
      info: { ...info },
      settings: { ...settings },
      captions: Object.fromEntries(shots.map((s) => [s.id, s.caption])),
      videos: Object.fromEntries(shots.map((s) => [s.id, s.videoUrl])),
    };
    snapshots.current.set(id, snap);
    setChanges((c) => [{ id, text, reply: "", state: "working", canUndo: false }, ...c]);
    const setC = (patch: Partial<Change>) => setChanges((c) => c.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    try {
      const list = shotsRef.current;
      const state = {
        textStyle: settings.textStyle ?? "bold",
        pace: settings.pace,
        labels: settings.labels,
        texts: { hook: info.hook, name: info.name, location: info.location, price: info.price, cta: info.cta, phone: info.phone, website: info.website },
        shots: list.map((s, i) => ({ shot: i + 1, room: ROOMS.find((x) => x.id === s.room)?.he, caption: s.caption, hasVideo: s.status === "done" })),
      };
      const { actions, reply } = await understand(text, state);
      let clips = 0;
      for (const a of actions as Action[]) {
        if (a.type === "text") setInfo((i) => ({ ...i, [a.field]: a.value }));
        else if (a.type === "caption") {
          const target = list[a.shot - 1];
          if (target) update(target.id, { caption: a.value });
        } else if (a.type === "style") setSettings((st) => ({ ...st, textStyle: a.value }));
        else if (a.type === "labels") setSettings((st) => ({ ...st, labels: a.value }));
        else if (a.type === "pace") setSettings((st) => ({ ...st, pace: a.value }));
        else if (a.type === "clip") {
          const target = list[a.shot - 1];
          if (target?.videoUrl && target.status === "done") {
            clips++;
            editClip(target.id, a.prompt, a.label || text.slice(0, 20));
          }
        }
      }
      if (!actions.length) setC({ state: "error", reply: reply || "לא הבנתי מה לשנות. נסו לנסח אחרת." });
      else setC({ state: "done", reply: (reply || "עודכן") + (clips ? ` (${clips} קליפים בעריכה, כדקה)` : ""), canUndo: true });
    } catch (e) {
      setC({ state: "error", reply: e instanceof Error ? e.message : "השינוי נכשל" });
    }
  };

  const undoChange = (id: string) => {
    const snap = snapshots.current.get(id);
    if (!snap) return;
    setInfo(snap.info);
    setSettings(snap.settings);
    setShots((prev) => prev.map((s) => ({ ...s, caption: snap.captions[s.id], videoUrl: snap.videos[s.id] ?? s.videoUrl })));
    setChanges((c) => c.map((x) => (x.id === id ? { ...x, canUndo: false, reply: "בוטל" } : x)));
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
              else if (st.status === "done") {
                const isEdit = s.modelKey!.startsWith("edit");
                update(s.id, {
                  status: "done",
                  videoUrl: st.videoUrl,
                  genSig: s.pendingSig,
                  editError: undefined,
                  versions: isEdit ? [...(s.versions ?? []), { url: st.videoUrl, label: s.editLabel ?? "עריכה" }] : [{ url: st.videoUrl, label: "מקור" }],
                });
              } else if (s.modelKey!.startsWith("edit")) {
                update(s.id, { status: "done", editError: st.refunded ? `${st.error}. הקרדיט הוחזר.` : st.error });
                if (st.refunded) refreshMe();
              } else {
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

  const stepIndex = STEPS.findIndex((x) => x.id === step);
  const genTotal = shots.filter((s) => BUSY.has(s.status) || (s.status === "done" && s.genSig === sigOf(s, settings.aspect, style))).length;
  const genProgress = genTotal ? (genTotal - busyCount + 0.15) / genTotal : 0;
  const GEN_LINES = useMemo(
    () => [
      `יוצר וידאו ל-${busyCount} חללים`,
      "המודל לומד את עומק החלל",
      "מתכנן את תנועת המצלמה",
      "מרנדר אור וצללים",
      "שומר על קווים ישרים ועל הרהיטים במקום",
      "כל קליפ לוקח בין דקה לחמש דקות",
    ],
    [busyCount],
  );

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

      {hydrated && !user && shots.length > 0 && (
        <div className="notice notice-save">
          <span>הפרויקט נשמר כרגע רק בדפדפן הזה. התחברו כדי לשמור אותו בחשבון ולפתוח מכל מכשיר.</span>
          <GoogleButton small />
        </div>
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
          <nav className="progress-head" aria-label="שלבים">
            <div className="progress-top">
              {stepIndex > 0 ? (
                <button type="button" className="back" onClick={() => go(STEPS[stepIndex - 1].id)}>
                  <IconChevron className="flip" /> {STEPS[stepIndex - 1].label}
                </button>
              ) : (
                <span />
              )}
              <span className="progress-count">
                שלב {stepIndex + 1} מתוך 3
              </span>
            </div>
            <ol className="progress-steps">
              {STEPS.map((st, i) => (
                <li key={st.id} className={i < stepIndex || (done[st.id] && i !== stepIndex) ? "is-done" : i === stepIndex ? "is-now" : ""}>
                  <button type="button" onClick={() => go(st.id)} aria-current={step === st.id ? "step" : undefined}>
                    <i />
                    <span>{st.label}</span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          {!hydrated && <Thinking lines={["פותח את הפרויקט"]} />}

          {hydrated && busyCount > 0 && step !== "video" && (
            <button type="button" className="live-strip" onClick={() => go("video")}>
              <Thinking compact lines={GEN_LINES} progress={genProgress} />
              <span>לסרטון</span>
            </button>
          )}

          {hydrated && step === "photos" && (
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
                  {adding > 0 && <Thinking compact lines={[`מוסיף ${adding} תמונות`, "מקטין ומיישר אותן"]} />}
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
                  {busyCount > 0 && (
                    <div className="block">
                      <Thinking lines={GEN_LINES} progress={genProgress} />
                      <p className="fine">
                        {genTotal - busyCount} מתוך {genTotal} קליפים מוכנים. אפשר לסגור את המסך, היצירה ממשיכה ונשמרת.
                      </p>
                    </div>
                  )}
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
                    <ChangeBar busy={false} disabled={locked} log={changes} onSend={runChange} onUndo={undoChange} />
                  )}

                  <div className="block texts">
                    <h2>טקסט על הסרטון</h2>
                    <p className="block-sub">משפט פתיחה שעוצר גלילה, שורה אחת לכל חלל, וקריאה לפעולה בסוף.</p>
                    <div className="field">
                      <span>סגנון</span>
                      <div className="seg">
                        <button type="button" aria-pressed={(settings.textStyle ?? "bold") === "bold"} onClick={() => setSettings({ ...settings, textStyle: "bold" })}>
                          <b>פרפורמנס</b>
                          <small>טקסט בולט על משטחי צבע</small>
                        </button>
                        <button type="button" aria-pressed={settings.textStyle === "calm"} onClick={() => setSettings({ ...settings, textStyle: "calm" })}>
                          <b>יוקרה שקטה</b>
                          <small>טקסט עדין על התמונה</small>
                        </button>
                      </div>
                    </div>
                    {writing ? (
                      <Thinking lines={["כותב משפט פתיחה", "מנסח שורה לכל חלל", "בוחר קריאה לפעולה"]} />
                    ) : (
                      <>
                        <label className="field">
                          <span>משפט פתיחה</span>
                          <input value={info.hook ?? ""} onChange={(e) => setInfo({ ...info, hook: e.target.value })} placeholder="למשל: 4 חדרים מול הים ביפו" />
                        </label>
                        {shots.map((s, i) => (
                          <div key={s.id} className="texts-row">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={media[s.id]?.img} alt="" />
                            <input
                              value={s.caption ?? ""}
                              onChange={(e) => update(s.id, { caption: e.target.value })}
                              placeholder={s.room === "other" ? `חלל ${i + 1}` : ROOMS.find((r) => r.id === s.room)?.he}
                              aria-label={`השורה של חלל ${i + 1}`}
                            />
                          </div>
                        ))}
                        <label className="field">
                          <span>קריאה לפעולה</span>
                          <input value={info.cta} onChange={(e) => setInfo({ ...info, cta: e.target.value })} placeholder="לתיאום סיור בנכס" />
                        </label>
                        {live && (
                          <button type="button" className="btn btn-outline btn-small" onClick={writeTexts} disabled={locked}>
                            כתיבה מחדש לפי המותג
                          </button>
                        )}
                      </>
                    )}
                  </div>

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
                              dirty.current.music = true;
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
            <SaveState cloud={cloud} user={user} />
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
        {busyCount > 0 && (
          <span className="bar-progress" aria-hidden>
            <span style={{ width: `${genProgress * 100}%` }} />
          </span>
        )}
        <div className="bar-info">
          <b>
            שלב {stepIndex + 1}/3 · {STEPS[stepIndex].label}
          </b>
          <small>{busyCount ? `${genTotal - busyCount}/${genTotal} קליפים מוכנים` : costNote ?? STEPS[stepIndex].sub}</small>
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
          onEdit={(prompt, label) => editClip(shown.id, prompt, label)}
          onPickVersion={(url) => update(shown.id, { videoUrl: url })}
          editCost={accounts ? `${CREDITS_PER_EDIT.edit720} קרדיט` : `~$${EDITS.edit720.pricePerClip.toFixed(2)}`}
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

function SaveState({ cloud, user }: { cloud: "off" | "saving" | "saved" | "error"; user: User | null }) {
  if (!user) return <p className="save-state">נשמר רק בדפדפן הזה</p>;
  return (
    <p className={`save-state is-${cloud}`}>
      {cloud === "saving" ? "שומר בחשבון…" : cloud === "error" ? "השמירה בחשבון נכשלה, ננסה שוב" : "נשמר בחשבון"}
    </p>
  );
}

export function GoogleButton({ small, next = "/" }: { small?: boolean; next?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={`btn btn-google${small ? " btn-small" : ""}`}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const { error } = await signInWithGoogle(next);
        if (error) {
          setBusy(false);
          alert("ההתחברות עם Google עוד לא מוגדרת. נסו שוב בהמשך.");
        }
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden className="g-logo">
        <path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8z" />
        <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2.1v2.8A11 11 0 0 0 12 23z" />
        <path fill="#FBBC05" d="M5.7 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8z" />
        <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 0 0 2.1 7.1l3.6 2.8C6.6 7.4 9.1 5.4 12 5.4z" />
      </svg>
      {busy ? "מעביר ל-Google…" : "התחברות עם Google"}
    </button>
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
