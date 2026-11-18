// The reel compositor: lays clips on a timeline with crossfades, draws the
// project's titles, room labels and end card on a canvas, plays it, and
// records it to a video file in the browser.
import { coverRect } from "./image";
import { MOTIONS, type MotionId } from "./presets";
import { gradeFilter, gradeWash, inkOn, type Grade } from "./brand";

export type ReelClip = {
  photo: HTMLCanvasElement; // the photo, already cropped to the output frame
  video?: HTMLVideoElement; // the AI clip, when one exists
  motion: MotionId;
  label: string;
};

export type ReelInfo = {
  name: string;
  location: string;
  price: string;
  cta: string;
  phone: string;
  brand: string;
  website?: string;
};

// The brand's look on the reel: its fonts, accent colour and colour grade.
export type ReelLook = { heading: string; body: string; accent: string; grade?: Grade };

export type ReelSpec = {
  width: number;
  height: number;
  clips: ReelClip[];
  info: ReelInfo;
  logo?: ImageBitmap;
  layout: "full" | "split";
  labels: boolean;
  clipSeconds: number;
  look?: ReelLook;
};

export const FONT_DISPLAY = '"Bellefair", "Frank Ruhl Libre", serif';
export const FONT_UI = '"Rubik", "Heebo", system-ui, sans-serif';

const XF = 0.6; // crossfade between clips
const END = 3.6; // end card length
const INTRO_END = 3.2;

type Seg = { start: number; len: number; clip: ReelClip };

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => 0.5 - Math.cos(Math.PI * clamp(t)) / 2;
// 0 → 1 → 0 window with soft edges
const windowed = (t: number, a: number, b: number, f: number) =>
  clamp(Math.min((t - a) / f, (b - t) / f));

export class Reel {
  readonly segs: Seg[];
  readonly endStart: number;
  readonly total: number;
  private ctx: CanvasRenderingContext2D;
  private u: number; // 1% of the short side
  private tall: boolean;
  private fDisplay: string;
  private fUi: string;
  private accent: string;
  private filter: string | null;
  private wash: string | null;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly spec: ReelSpec,
  ) {
    canvas.width = spec.width;
    canvas.height = spec.height;
    this.ctx = canvas.getContext("2d")!;
    this.u = Math.min(spec.width, spec.height) / 100;
    this.tall = spec.height / spec.width > 1.5;
    this.fDisplay = spec.look?.heading ?? FONT_DISPLAY;
    this.fUi = spec.look?.body ?? FONT_UI;
    this.accent = spec.look?.accent ?? "rgba(255,255,255,0.9)";
    this.filter = spec.look?.grade ? gradeFilter(spec.look.grade) : null;
    this.wash = spec.look?.grade ? gradeWash(spec.look.grade) : null;
    let t = 0;
    this.segs = spec.clips.map((clip) => {
      const vd = clip.video && Number.isFinite(clip.video.duration) ? clip.video.duration - 0.08 : Infinity;
      const len = Math.max(1.6, Math.min(spec.clipSeconds, vd));
      const seg = { start: t, len, clip };
      t += len - XF;
      return seg;
    });
    const last = this.segs[this.segs.length - 1];
    this.endStart = last ? last.start + last.len - XF : 0;
    this.total = this.endStart + END;
  }

  // ---------- playback sync for <video> elements ----------

  sync(t: number, playing: boolean) {
    this.segs.forEach((seg, i) => {
      const v = seg.clip.video;
      if (!v) return;
      const local = t - seg.start;
      const isLast = i === this.segs.length - 1;
      const target = clamp(local, 0, Math.max(0, v.duration - 0.05) || 0);
      if (local >= 0 && (local <= seg.len + 0.05 || isLast)) {
        if (playing && local < v.duration - 0.05) {
          if (v.paused) {
            v.currentTime = target;
            v.play().catch(() => {});
          } else if (Math.abs(v.currentTime - target) > 0.35) {
            v.currentTime = target;
          }
        } else {
          if (!v.paused) v.pause();
          if (Math.abs(v.currentTime - target) > 0.04) v.currentTime = target;
        }
      } else if (local < 0 && local > -0.8) {
        // about to start: park on the first frame
        if (!v.paused) v.pause();
        if (v.currentTime > 0.05) v.currentTime = 0;
      } else if (!v.paused) {
        v.pause();
      }
    });
  }

  // Redraw when a paused clip finishes seeking, so scrubbing shows the real frame.
  onFrameReady(cb: () => void) {
    for (const seg of this.segs) {
      seg.clip.video?.addEventListener("seeked", cb);
      seg.clip.video?.addEventListener("loadeddata", cb);
    }
  }

  pauseAll() {
    this.segs.forEach((s) => s.clip.video?.pause());
  }

  // ---------- drawing ----------

  render(t: number) {
    const { ctx, spec } = this;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, spec.width, spec.height);
    if (spec.layout === "split") this.renderSplit(t);
    else this.renderFull(t);
    this.renderEnd(t);
    ctx.restore();
  }

  private active(t: number) {
    const out: { seg: Seg; local: number; alpha: number; index: number }[] = [];
    this.segs.forEach((seg, i) => {
      const local = t - seg.start;
      const isLast = i === this.segs.length - 1;
      if (local < 0 || (!isLast && local > seg.len)) return;
      out.push({ seg, local, alpha: i === 0 ? 1 : clamp(local / XF), index: i });
    });
    return out;
  }

  private drawMedia(seg: Seg, local: number, x: number, y: number, w: number, h: number, still = false) {
    const { ctx } = this;
    const { photo, video, motion } = seg.clip;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    if (this.filter) ctx.filter = this.filter;
    if (!still && video && video.readyState >= 2 && video.videoWidth) {
      const r = coverRect(video.videoWidth, video.videoHeight, w, h);
      ctx.drawImage(video, r.x, r.y, r.w, r.h, x, y, w, h);
    } else {
      // a clip that is still seeking falls back to the unmoved photo (≈ its first frame)
      if (video) still = true;
      const r = coverRect(photo.width, photo.height, w, h);
      let s = 1;
      let ox = 0;
      let oy = 0;
      if (!still) {
        const kb = MOTIONS[motion].kb;
        const e = ease(local / seg.len);
        s = lerp(kb.s0, kb.s1, e);
        const room = (s - 1) / 2;
        ox = clamp(lerp(kb.x0, kb.x1, e), -room, room);
        oy = clamp(lerp(kb.y0, kb.y1, e), -room, room);
      }
      const dw = w * s;
      const dh = h * s;
      const cx = x + w / 2 + ox * w;
      const cy = y + h / 2 + oy * h;
      ctx.drawImage(photo, r.x, r.y, r.w, r.h, cx - dw / 2, cy - dh / 2, dw, dh);
    }
    ctx.filter = "none";
    if (this.wash) {
      ctx.globalCompositeOperation = "soft-light";
      ctx.fillStyle = this.wash;
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  }

  private text(
    str: string,
    x: number,
    y: number,
    size: number,
    opts: { font?: string; weight?: number; align?: CanvasTextAlign; color?: string; dir?: CanvasDirection; maxW?: number; shadow?: boolean } = {},
  ) {
    const { ctx } = this;
    let px = size;
    const font = opts.font ?? this.fUi;
    const weight = opts.weight ?? 400;
    ctx.font = `${weight} ${px}px ${font}`;
    if (opts.maxW) {
      const w = ctx.measureText(str).width;
      if (w > opts.maxW) {
        px = Math.max(size * 0.5, (px * opts.maxW) / w);
        ctx.font = `${weight} ${px}px ${font}`;
      }
    }
    ctx.direction = opts.dir ?? "rtl";
    ctx.textAlign = opts.align ?? "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = opts.color ?? "#fff";
    if (opts.shadow) {
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = this.u * 2;
    }
    ctx.fillText(str, x, y);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    return px;
  }

  private drawLogo(x: number, y: number, maxW: number, maxH: number, align: "right" | "center") {
    const logo = this.spec.logo;
    if (!logo) return 0;
    const k = Math.min(maxW / logo.width, maxH / logo.height);
    const w = logo.width * k;
    const h = logo.height * k;
    this.ctx.drawImage(logo, align === "right" ? x - w : x - w / 2, y, w, h);
    return h;
  }

  private renderFull(t: number) {
    const { ctx, spec, u } = this;
    const W = spec.width;
    const H = spec.height;
    for (const a of this.active(t)) {
      ctx.globalAlpha = a.alpha;
      this.drawMedia(a.seg, a.local, 0, 0, W, H);
    }
    ctx.globalAlpha = 1;

    const right = W - 7 * u;
    const base = this.tall ? H * 0.75 : H - 9 * u;
    const info = spec.info;

    // soft shade behind text
    const shade = Math.max(
      info.name || info.location ? windowed(t, 0.2, INTRO_END, 0.6) : 0,
      spec.labels ? 0.55 : 0,
    );
    if (shade > 0 && t < this.endStart + XF) {
      const g = ctx.createLinearGradient(0, H * 0.5, 0, H);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, `rgba(0,0,0,${0.55 * shade})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, H * 0.5, W, H * 0.5);
    }

    if (spec.logo && t < this.endStart) {
      ctx.globalAlpha = 0.92 * clamp((this.endStart - t) / 0.4);
      this.drawLogo(right, this.tall ? H * 0.08 : 6 * u, 18 * u, 7 * u, "right");
      ctx.globalAlpha = 1;
    }

    // intro title
    const k = windowed(t, 0.3, INTRO_END, 0.6);
    if (k > 0 && (info.name || info.location)) {
      ctx.globalAlpha = k;
      const lift = (1 - ease(k)) * 2 * u;
      if (info.name)
        this.text(info.name, right, base - 4.6 * u + lift, 8.4 * u, { font: this.fDisplay, maxW: W - 14 * u, shadow: true });
      if (info.location)
        this.text(info.location, right, base + 0.6 * u + lift, 3.4 * u, { weight: 400, color: "rgba(255,255,255,0.88)", shadow: true });
      ctx.globalAlpha = 1;
    }

    // room labels
    if (spec.labels) {
      this.segs.forEach((seg, i) => {
        const start = i === 0 ? Math.max(seg.start + 0.5, INTRO_END + 0.1) : seg.start + 0.5;
        const end = seg.start + seg.len - 0.35;
        const a = windowed(t, start, end, 0.35);
        if (a <= 0 || !seg.clip.label) return;
        ctx.globalAlpha = a;
        ctx.fillStyle = this.accent;
        ctx.fillRect(right - 6 * u, base - 4.4 * u, 6 * u, Math.max(3, 0.4 * u));
        this.text(seg.clip.label, right, base, 3.8 * u, { weight: 500, shadow: true });
        ctx.globalAlpha = 1;
      });
    }
  }

  private renderSplit(t: number) {
    const { ctx, spec, u } = this;
    const W = spec.width;
    const H = spec.height;
    const m = 2.4 * u;
    const g = 1.2 * u;
    const paneW = (W - 2 * m - g) / 2;
    const paneH = (paneW * H) / W;
    const py = (H - paneH) / 2;
    const rightX = W - m - paneW; // before: the photo (read first in RTL)
    const leftX = m; // after: the video

    for (const a of this.active(t)) {
      ctx.globalAlpha = a.alpha;
      this.drawMedia(a.seg, a.local, rightX, py, paneW, paneH, true);
      this.drawMedia(a.seg, a.local, leftX, py, paneW, paneH);
    }
    ctx.globalAlpha = 1;

    // pills above the panes
    const pill = (label: string, cx: number) => {
      ctx.font = `600 ${3 * u}px ${this.fUi}`;
      const w = ctx.measureText(label).width + 4 * u;
      const h = 5.2 * u;
      const y = py - h - 2 * u;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.roundRect(cx - w / 2, y, w, h, 0.8 * u);
      ctx.fill();
      this.text(label, cx, y + h * 0.68, 3 * u, { weight: 600, color: "#111", align: "center" });
    };
    pill("התמונה", rightX + paneW / 2);
    pill("הסרטון", leftX + paneW / 2);

    const info = spec.info;
    if (info.name) this.text(info.name, W / 2, py - 14 * u, 6.6 * u, { font: this.fDisplay, align: "center", maxW: W - 10 * u });

    this.segs.forEach((seg, i) => {
      const a = windowed(t, seg.start + 0.3, seg.start + seg.len - 0.25, 0.3);
      if (a <= 0 || !seg.clip.label || !spec.labels) return;
      ctx.globalAlpha = a;
      this.text(seg.clip.label, W / 2, py + paneH + 7 * u, 3.8 * u, { weight: 500, align: "center" });
      ctx.globalAlpha = 1;
      void i;
    });
    if (info.location)
      this.text(info.location, W / 2, py + paneH + 12.5 * u, 2.9 * u, { align: "center", color: "rgba(255,255,255,0.7)" });
  }

  private renderEnd(t: number) {
    if (t < this.endStart) return;
    const { ctx, spec, u } = this;
    const W = spec.width;
    const H = spec.height;
    const info = spec.info;
    const brand = /^#[0-9a-f]{6}$/i.test(info.brand) ? info.brand : "#1d1e22";
    const ink = inkOn(brand);
    const local = t - this.endStart;

    ctx.globalAlpha = 0.93 * clamp(local / XF);
    ctx.fillStyle = brand;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;

    const items: { h: number; at: number; draw: (y: number) => void }[] = [];
    const gap = (h: number) => items.push({ h, at: 0, draw: () => {} });
    if (spec.logo) {
      const lh = Math.min(16 * u, (spec.logo.height * 34 * u) / spec.logo.width);
      items.push({ h: lh, at: 0.25, draw: (y) => this.drawLogo(W / 2, y, 34 * u, 16 * u, "center") });
      gap(5 * u);
    }
    if (info.name) {
      items.push({ h: 8 * u, at: 0.4, draw: (y) => this.text(info.name, W / 2, y + 6.6 * u, 8 * u, { font: this.fDisplay, align: "center", color: ink, maxW: W - 12 * u }) });
    }
    if (info.price) {
      gap(2.2 * u);
      items.push({ h: 4 * u, at: 0.55, draw: (y) => this.text(info.price, W / 2, y + 3.2 * u, 3.6 * u, { align: "center", color: ink, maxW: W - 12 * u }) });
    }
    if (info.cta || info.phone) {
      gap(4.5 * u);
      items.push({
        h: 0.3 * u,
        at: 0.65,
        draw: (y) => {
          ctx.fillStyle = ink;
          ctx.fillRect(W / 2 - 5 * u, y, 10 * u, Math.max(2, 0.25 * u));
        },
      });
      gap(4.5 * u);
    }
    if (info.cta) {
      items.push({ h: 4.2 * u, at: 0.8, draw: (y) => this.text(info.cta, W / 2, y + 3.3 * u, 3.6 * u, { align: "center", color: ink, weight: 500, maxW: W - 12 * u }) });
    }
    if (info.phone) {
      gap(1.6 * u);
      items.push({ h: 6 * u, at: 0.9, draw: (y) => this.text(info.phone, W / 2, y + 5 * u, 5.4 * u, { align: "center", color: ink, weight: 600, dir: "ltr" }) });
    }
    if (info.website) {
      gap(2.2 * u);
      items.push({ h: 3.6 * u, at: 1.0, draw: (y) => this.text(info.website!, W / 2, y + 3 * u, 3 * u, { align: "center", color: ink, dir: "ltr", maxW: W - 12 * u }) });
    }

    const total = items.reduce((s, i) => s + i.h, 0);
    let y = H / 2 - total / 2;
    for (const it of items) {
      const a = clamp((local - it.at) / 0.45);
      if (a > 0 && it.at > 0) {
        ctx.globalAlpha = a;
        it.draw(y + (1 - ease(a)) * 1.5 * u);
        ctx.globalAlpha = 1;
      }
      y += it.h;
    }
  }
}

// ---------- player + recorder ----------

export class ReelPlayer {
  t = 0;
  playing = false;
  loop = true;
  onTime?: (t: number) => void;
  onState?: (playing: boolean) => void;
  private raf = 0;
  private clockStart = 0;
  private clockT = 0;
  private audio?: { el: HTMLAudioElement; ctx: AudioContext; gain: GainNode; dest?: MediaStreamAudioDestinationNode };
  private endResolve?: () => void;

  constructor(
    readonly reel: Reel,
    private musicUrl?: string,
  ) {
    reel.sync(0, false);
    reel.render(0);
    reel.onFrameReady(() => {
      if (!this.playing) reel.render(this.t);
    });
  }

  private ensureAudio() {
    if (!this.musicUrl || this.audio) return;
    try {
      const el = new Audio(this.musicUrl);
      el.preload = "auto";
      el.loop = true;
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const src = ctx.createMediaElementSource(el);
      const gain = ctx.createGain();
      src.connect(gain).connect(ctx.destination);
      this.audio = { el, ctx, gain };
    } catch {
      this.audio = undefined;
    }
  }

  private audioGain(t: number) {
    const total = this.reel.total;
    return clamp(Math.min(t / 0.6, (total - t) / 1.8));
  }

  play() {
    if (this.playing) return;
    if (this.t >= this.reel.total - 0.05) this.t = 0;
    this.ensureAudio();
    if (this.audio) {
      this.audio.ctx.resume().catch(() => {});
      this.audio.el.currentTime = this.t % (this.audio.el.duration || Infinity) || 0;
      this.audio.el.play().catch(() => {});
    }
    this.playing = true;
    this.clockStart = performance.now();
    this.clockT = this.t;
    this.onState?.(true);
    this.raf = requestAnimationFrame(this.tick);
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.audio?.el.pause();
    this.reel.sync(this.t, false);
    this.onState?.(false);
  }

  seek(t: number) {
    this.t = clamp(t, 0, this.reel.total);
    this.clockStart = performance.now();
    this.clockT = this.t;
    if (this.audio) this.audio.el.currentTime = this.t;
    this.reel.sync(this.t, this.playing);
    this.reel.render(this.t);
    this.onTime?.(this.t);
  }

  private tick = (now: number) => {
    this.t = this.clockT + (now - this.clockStart) / 1000;
    const total = this.reel.total;
    if (this.t >= total) {
      this.reel.render(total);
      this.onTime?.(total);
      if (this.endResolve) {
        const r = this.endResolve;
        this.endResolve = undefined;
        this.pause();
        r();
        return;
      }
      if (this.loop) {
        this.t = 0;
        this.clockStart = now;
        this.clockT = 0;
        if (this.audio) this.audio.el.currentTime = 0;
      } else {
        this.pause();
        return;
      }
    }
    if (this.audio) this.audio.gain.gain.value = this.audioGain(this.t);
    this.reel.sync(this.t, true);
    this.reel.render(this.t);
    this.onTime?.(this.t);
    this.raf = requestAnimationFrame(this.tick);
  };

  destroy() {
    this.pause();
    this.reel.pauseAll();
    if (this.audio) {
      this.audio.el.pause();
      this.audio.ctx.close().catch(() => {});
    }
  }

  // Plays the reel once from the start in real time and records the canvas.
  async record(): Promise<{ blob: Blob; ext: "mp4" | "webm" }> {
    this.pause();
    this.seek(0);
    this.ensureAudio();
    const canvas = this.reel.canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream };
    const stream = canvas.captureStream(30);
    if (this.audio) {
      if (!this.audio.dest) {
        this.audio.dest = this.audio.ctx.createMediaStreamDestination();
        this.audio.gain.connect(this.audio.dest);
      }
      this.audio.dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
    }
    const mime = pickMime(Boolean(this.audio));
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 10_000_000 } : { videoBitsPerSecond: 10_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    const stopped = new Promise<void>((r) => (rec.onstop = () => r()));
    const ended = new Promise<void>((r) => (this.endResolve = r));
    rec.start(500);
    this.play();
    await ended;
    await new Promise((r) => setTimeout(r, 200));
    rec.stop();
    await stopped;
    stream.getVideoTracks().forEach((tr) => tr.stop());
    const type = rec.mimeType || mime || "video/webm";
    return { blob: new Blob(chunks, { type }), ext: type.includes("mp4") ? "mp4" : "webm" };
  }

  cancelRecording() {
    if (this.endResolve) {
      const r = this.endResolve;
      this.endResolve = undefined;
      this.pause();
      r();
    }
  }
}

function pickMime(withAudio: boolean) {
  if (typeof MediaRecorder === "undefined") return "";
  const v = [
    withAudio ? "video/mp4;codecs=avc1.640028,mp4a.40.2" : "video/mp4;codecs=avc1.640028",
    withAudio ? "video/mp4;codecs=avc1,mp4a.40.2" : "video/mp4;codecs=avc1",
    "video/mp4",
    withAudio ? "video/webm;codecs=vp9,opus" : "video/webm;codecs=vp9",
    "video/webm",
  ];
  return v.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

export function canRecord() {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof (HTMLCanvasElement.prototype as unknown as { captureStream?: unknown }).captureStream === "function"
  );
}
