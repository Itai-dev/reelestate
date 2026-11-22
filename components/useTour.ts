"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, checkGeneration, fetchVideo, startGeneration, startTourImage, uploadImage } from "@/lib/api";
import { load, remove, save } from "@/lib/store";
import { cropToFrame, decode, preparePano } from "@/lib/image";
import { roomById, type ModelKey, type TourKey } from "@/lib/presets";
import {
  APPROACH,
  APPROACH_PROMPT,
  CLOSEUP,
  CLOSEUP_ZOOM,
  OVERVIEW,
  OVERVIEW_SIZE,
  PANO_REF_WIDTH,
  assetOf,
  assets,
  baseKey,
  chainLinks,
  isBusy,
  localKey,
  sameEntry,
  panoKey,
  tourFiles,
  tourKeys,
  viewOf,
  withAsset,
  type Tour,
  type TourAsset,
  type TourLight,
  type TourLink,
  type TourSpace,
} from "@/lib/tour";
import { refreshMe } from "./SiteNav";
import type { Shot } from "./types";

type Args = {
  live: boolean;
  shots: () => Shot[];
  imageBlob: (id: string) => Blob | undefined;
  model: () => ModelKey;
  style: () => string | undefined;
  // credits ran out, or the visitor has to sign in
  onBlocked: (code: "no_credits" | "auth") => void;
};

// A 360° image the owner uploads for a space: a render from a 3D model or a photo
// from a 360° camera, already checked and sized. finish: let the model re-create
// it as a photograph of the same space.
export type PanoUpload = { id: string; title: string; blob: Blob; finish: boolean };

export type TourPlan = {
  spaces: string[]; // ids of photos and uploads, in tour order
  uploads?: PanoUpload[]; // the spaces among them that are new uploads
  lights: TourLight[]; // besides daylight
  entry?: { shot: string; fx: number; fy: number; x: number; y: number; overview: Blob; video: boolean };
};

const WAITING: TourAsset = { status: "waiting" };

// The project's interactive tour: its state, the making of its images and
// camera approach, and the browser copy of its files. It lives in the studio
// (not in the sheet), so making continues while the sheet is closed.
export function useTour(a: Args) {
  const [tour, setTour] = useState<Tour | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const ref = useRef<Tour | null>(null);
  ref.current = tour;
  const args = useRef(a);
  args.current = a;
  const starting = useRef(new Set<string>());
  const fetching = useRef(new Set<string>());
  const uploaded = useRef(new Map<string, { url: string; at: number }>());
  const polling = useRef(false);

  const setUrl = useCallback((key: string, blob: Blob | null) => {
    setUrls((u) => {
      const next = { ...u };
      if (next[key]) URL.revokeObjectURL(next[key]);
      if (blob) next[key] = URL.createObjectURL(blob);
      else delete next[key];
      return next;
    });
  }, []);

  const patch = useCallback((key: string, p: Partial<TourAsset>) => setTour((t) => (t ? withAsset(t, key, p) : t)), []);

  // Opens a saved tour: its finished files come back from the browser copy.
  const open = useCallback(async (saved: Tour | null | undefined) => {
    if (!saved) return;
    // a request that was cut off mid-way is not started again by itself
    let t = saved;
    for (const { key, asset } of assets(saved)) if (asset.status === "preparing") t = withAsset(t, key, { status: "error", error: "היצירה נקטעה" });
    const found: Record<string, string> = {};
    for (const { key } of tourFiles(t)) {
      if (key.startsWith("base:")) continue; // an upload as it came in: kept, never shown
      const blob = await load<Blob>(localKey(key));
      if (blob) found[key] = URL.createObjectURL(blob);
      else if (key !== OVERVIEW) t = withAsset(t, key, { status: "error", error: "הקובץ לא נמצא במכשיר הזה" });
    }
    setUrls(found);
    setTour(t);
  }, []);

  // ---------- making ----------

  // A reference image on fal's storage. The same panorama is the reference for
  // every lighting, so it is uploaded once.
  const refUrl = async (name: string, blob: () => Promise<Blob | undefined>) => {
    const hit = uploaded.current.get(name);
    if (hit && Date.now() - hit.at < 20 * 60_000) return hit.url;
    const b = await blob();
    if (!b) throw new Error("התמונה חסרה");
    const url = await uploadImage(b);
    uploaded.current.set(name, { url, at: Date.now() });
    return url;
  };
  const stored = (key: string) => () => load<Blob>(localKey(key));
  // A panorama as the model's reference: a large upload is sent smaller, so it
  // passes through the server's upload limit.
  const panoRef = (key: string) => async () => {
    const b = await load<Blob>(localKey(key));
    if (!b || b.size < 2_500_000) return b;
    return (await preparePano(b, PANO_REF_WIDTH).catch(() => null))?.blob ?? b;
  };

  const run = useCallback(async (key: string) => {
    if (starting.current.has(key)) return;
    starting.current.add(key);
    patch(key, { status: "preparing", error: undefined, requestId: undefined });
    try {
      const t = ref.current;
      if (!t) return;
      let job: { requestId: string; model: TourKey | ModelKey };
      if (key === APPROACH) {
        const start = await refUrl(OVERVIEW, stored(OVERVIEW));
        const end = await refUrl(`${CLOSEUP}:${t.entry?.closeup?.v}`, stored(CLOSEUP));
        const model = args.current.model();
        job = { requestId: await startGeneration(model, start, APPROACH_PROMPT, end), model };
      } else if (key === CLOSEUP) {
        const src = await refUrl(`closeup-src:${t.entry?.x}:${t.entry?.y}`, async () => closeView((await load<Blob>(localKey(OVERVIEW)))!, t.entry!.x, t.entry!.y));
        job = await startTourImage({ kind: "closeup", imageUrl: src });
      } else {
        const [, id, light] = key.split(":");
        const space = t.spaces.find((s) => s.id === id);
        if (!space) return;
        if (light === "day" && space.upload) {
          const base = await load<Blob>(localKey(baseKey(id)));
          if (!base) throw new Error("תמונת ה-360° שהועלתה לא נמצאת במכשיר הזה");
          if (!space.finish) {
            // shown as it is: nothing to make, and nothing to pay for
            await save(localKey(key), base);
            setUrl(key, base);
            patch(key, { status: "done", v: `upload:${Date.now()}`, error: undefined });
            return;
          }
          const src = await refUrl(baseKey(id), panoRef(baseKey(id)));
          job = await startTourImage({ kind: "panoFinish", imageUrl: src, style: args.current.style() });
        } else if (light === "day") {
          const src = await refUrl(`photo:${id}`, async () => args.current.imageBlob(id));
          job = await startTourImage({ kind: "pano", imageUrl: src, room: space.room, style: args.current.style() });
        } else {
          const src = await refUrl(`${panoKey(id, "day")}:${space.panos.day?.v}`, panoRef(panoKey(id, "day")));
          job = await startTourImage({ kind: "panoLight", imageUrl: src, light });
        }
      }
      patch(key, { status: "queued", requestId: job.requestId, model: job.model });
      refreshMe();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      if (code === "no_credits" || code === "auth") args.current.onBlocked(code);
      patch(key, { status: "error", error: code === "no_credits" ? "נגמרו הקרדיטים" : code === "auth" ? "צריך להתחבר" : e instanceof Error ? e.message : "היצירה נכשלה" });
    } finally {
      starting.current.delete(key);
    }
  }, [patch, setUrl]);

  // Whatever is waiting starts as soon as what it is made from exists: a
  // lighting needs the daylight panorama, the approach needs the close view.
  useEffect(() => {
    if (!tour || !a.live) return;
    for (const s of tour.spaces) {
      const day = s.panos.day;
      if (day?.status === "waiting") run(panoKey(s.id, "day"));
      if (day?.status !== "done") continue;
      for (const l of ["morning", "sunset", "night"] as const) if (s.panos[l]?.status === "waiting") run(panoKey(s.id, l));
    }
    const e = tour.entry;
    if (e?.closeup?.status === "waiting") run(CLOSEUP);
    if (e?.closeup?.status === "done" && e.video?.status === "waiting") run(APPROACH);
  }, [tour, a.live, run]);

  // Follow what is being made, and keep each finished file in the browser.
  useEffect(() => {
    if (!a.live) return;
    const tick = async () => {
      const t = ref.current;
      if (!t || polling.current) return;
      polling.current = true;
      try {
        await Promise.all(
          assets(t)
            .filter((x) => x.asset.status === "queued" && x.asset.requestId && x.asset.model && !fetching.current.has(x.key))
            .map(async ({ key, asset }) => {
              try {
                const st = await checkGeneration(asset.model as TourKey | ModelKey, asset.requestId!);
                if (st.status === "done") {
                  fetching.current.add(key);
                  try {
                    const blob = await fetchVideo(st.videoUrl);
                    // the tour may have been removed or made again meanwhile
                    if (assetOf(ref.current ?? { spaces: [] }, key)?.requestId !== asset.requestId) return;
                    await save(localKey(key), blob);
                    setUrl(key, blob);
                    patch(key, { status: "done", v: st.videoUrl, requestId: undefined, error: undefined });
                  } finally {
                    fetching.current.delete(key);
                  }
                } else if (st.status === "error") {
                  patch(key, { status: "error", requestId: undefined, error: st.refunded ? `${st.error}. הקרדיט הוחזר.` : st.error });
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
  }, [a.live, patch, setUrl]);

  // ---------- actions ----------

  // Builds the tour, or adds to it: spaces and lightings that already exist are
  // kept as they are, so only what is new is made (and paid for).
  const make = useCallback(
    async (plan: TourPlan) => {
      const prev = ref.current;
      const shots = args.current.shots();
      const spaces: TourSpace[] = [];
      for (const id of plan.spaces) {
        const old = prev?.spaces.find((s) => s.id === id);
        const shot = shots.find((s) => s.id === id);
        const up = old ? undefined : plan.uploads?.find((u) => u.id === id);
        if (!old && !shot && !up) continue;
        const panos: TourSpace["panos"] = { ...old?.panos };
        if (up) {
          await save(localKey(baseKey(id)), up.blob);
          if (!up.finish) {
            // the upload is the daylight panorama, as it is
            await save(localKey(panoKey(id, "day")), up.blob);
            setUrl(panoKey(id, "day"), up.blob);
            panos.day = { status: "done", v: `upload:${Date.now()}` };
          }
        }
        for (const l of ["day", ...plan.lights] as TourLight[]) {
          if (!panos[l] || panos[l]!.status === "error") panos[l] = { ...WAITING };
        }
        const fallback = `חלל ${spaces.length + 1}`;
        spaces.push({
          id,
          room: old?.room ?? shot?.room ?? "other",
          title: old?.title ?? (up ? up.title.trim() || fallback : shot!.room === "other" ? fallback : roomById(shot!.room).he),
          yaw: old?.yaw ?? 0,
          panos,
          links: old?.links ?? [],
          ...(old?.upload || up ? { upload: true, finish: old ? old.finish : up!.finish } : {}),
        });
      }
      let entry = prev?.entry;
      const dropFlight = async () => {
        await remove(localKey(CLOSEUP));
        await remove(localKey(APPROACH));
        setUrl(CLOSEUP, null);
        setUrl(APPROACH, null);
        uploaded.current.delete(OVERVIEW);
      };
      if (plan.entry) {
        const e = plan.entry;
        await save(localKey(OVERVIEW), e.overview);
        setUrl(OVERVIEW, e.overview);
        if (!entry || !sameEntry(entry, e)) {
          // another photo, framing or apartment: the old flight no longer fits
          await dropFlight();
          entry = { shot: e.shot, fx: e.fx, fy: e.fy, x: e.x, y: e.y };
        }
        if (e.video) {
          const keep = (x?: TourAsset) => (x && x.status !== "error" ? x : { ...WAITING });
          entry = { ...entry, closeup: keep(entry.closeup), video: keep(entry.video) };
        }
      } else if (entry) {
        await dropFlight();
        await remove(localKey(OVERVIEW));
        setUrl(OVERVIEW, null);
        entry = undefined;
      }
      // files of spaces that are no longer part of the tour
      for (const s of prev?.spaces ?? []) {
        if (plan.spaces.includes(s.id)) continue;
        for (const l of ["morning", "day", "sunset", "night"] as const) {
          await remove(localKey(panoKey(s.id, l)));
          setUrl(panoKey(s.id, l), null);
        }
        await remove(localKey(baseKey(s.id)));
        uploaded.current.delete(baseKey(s.id));
      }
      setTour({ spaces: chainLinks(spaces), entry, published: prev?.published });
    },
    [setUrl],
  );

  const again = useCallback((key: string) => patch(key, { status: "waiting", error: undefined, requestId: undefined }), [patch]);

  const setLinks = useCallback((space: string, links: TourLink[]) => setTour((t) => (t ? { ...t, spaces: t.spaces.map((s) => (s.id === space ? { ...s, links } : s)) } : t)), []);
  const setStart = useCallback((space: string, yaw: number) => setTour((t) => (t ? { ...t, spaces: t.spaces.map((s) => (s.id === space ? { ...s, yaw } : s)) } : t)), []);
  const publish = useCallback((on: boolean) => setTour((t) => (t ? { ...t, published: on } : t)), []);

  const discard = useCallback(async () => {
    const t = ref.current;
    if (!t) return;
    for (const k of tourKeys(t)) await remove(localKey(k));
    setUrls((u) => {
      Object.values(u).forEach((x) => URL.revokeObjectURL(x));
      return {};
    });
    uploaded.current.clear();
    setTour(null);
  }, []);

  const view = useMemo(() => (tour ? viewOf(tour, (k) => urls[k]) : { spaces: [] }), [tour, urls]);
  const all = tour ? assets(tour) : [];
  return {
    tour,
    view,
    urls,
    total: all.length,
    ready: all.filter((x) => x.asset.status === "done").length,
    busy: all.filter((x) => isBusy(x.asset)).length,
    failed: all.filter((x) => x.asset.status === "error").length,
    open,
    make,
    again,
    setLinks,
    setStart,
    publish,
    discard,
  };
}

export type TourApi = ReturnType<typeof useTour>;

// The part of the overview around the apartment, at the overview's size: the
// frame the camera approach ends on (before the model sharpens it).
async function closeView(overview: Blob, x: number, y: number): Promise<Blob> {
  const bmp = await decode(overview);
  const w = bmp.width / CLOSEUP_ZOOM;
  const h = bmp.height / CLOSEUP_ZOOM;
  const sx = Math.min(Math.max(x * bmp.width - w / 2, 0), bmp.width - w);
  const sy = Math.min(Math.max(y * bmp.height - h / 2, 0), bmp.height - h);
  const c = document.createElement("canvas");
  c.width = OVERVIEW_SIZE.w;
  c.height = OVERVIEW_SIZE.h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, sx, sy, w, h, 0, 0, c.width, c.height);
  bmp.close();
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/jpeg", 0.92));
}

// The facade photo as the tour's 16:9 opening frame, around the photo's focus point.
export async function overviewOf(blob: Blob, fx: number, fy: number): Promise<Blob> {
  return (await cropToFrame(blob, OVERVIEW_SIZE.w, OVERVIEW_SIZE.h, fx, fy)).blob();
}
