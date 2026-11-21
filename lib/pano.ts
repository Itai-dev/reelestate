// A small WebGL viewer for 2:1 equirectangular panoramas. Dragging changes the
// viewing direction (with a little momentum), pinching or scrolling zooms, and a
// new image can be cross-faded in without moving the view, which is what the
// lighting preview needs. The panorama is projected properly: it is never shown
// as a flat, stretched picture.
//
// Angles are in radians. yaw 0 looks at the centre of the image and grows to the
// right; pitch 0 is the horizon and grows upward.

const VERT = `attribute vec2 p; varying vec2 v; void main() { v = p; gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v;
uniform sampler2D a;
uniform sampler2D b;
uniform float fade;
uniform vec2 tanHalf;
uniform vec2 rot;
const float PI = 3.141592653589793;

// Softens the line where the left and right edges of the image meet.
vec3 look(sampler2D t, vec2 uv) {
  vec3 c = texture2D(t, uv).rgb;
  float d = min(uv.x, 1.0 - uv.x);
  const float w = 0.012;
  if (d < w) {
    vec3 m = texture2D(t, vec2(1.0 - uv.x, uv.y)).rgb;
    c = mix(0.5 * (c + m), c, smoothstep(0.0, w, d));
  }
  return c;
}

void main() {
  vec3 d = normalize(vec3(v.x * tanHalf.x, v.y * tanHalf.y, -1.0));
  float cp = cos(rot.y), sp = sin(rot.y);
  d = vec3(d.x, d.y * cp - d.z * sp, d.y * sp + d.z * cp);
  float cy = cos(rot.x), sy = sin(rot.x);
  d = vec3(d.x * cy - d.z * sy, d.y, d.x * sy + d.z * cy);
  vec2 uv = vec2(atan(d.x, -d.z) / (2.0 * PI) + 0.5, 0.5 - asin(clamp(d.y, -1.0, 1.0)) / PI);
  vec3 c = look(a, uv);
  if (fade > 0.0) c = mix(c, look(b, uv), fade);
  gl_FragColor = vec4(c, 1.0);
}`;

const RAD = Math.PI / 180;
const FOV_MIN = 50 * RAD;
const FOV_MAX = 118 * RAD;
const TAU = Math.PI * 2;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
// keeps an angle within -PI..PI
export const wrap = (a: number) => a - TAU * Math.floor((a + Math.PI) / TAU);

export type PanoSource = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

export class PanoView {
  yaw = 0;
  pitch = 0;
  fov = 100 * RAD; // across the diagonal, so it suits both phones and wide screens
  onFrame?: () => void; // after every drawn frame: reposition labels here
  onTouch?: () => void; // the first time the visitor moves the view
  wheelZoom = true;

  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private uni: Record<string, WebGLUniformLocation | null> = {};
  private tex: [WebGLTexture | null, WebGLTexture | null] = [null, null];
  private src: [PanoSource | null, PanoSource | null] = [null, null];
  private fadeT = 0; // 0..1 while cross-fading, else 0
  private fadeMs = 0;
  private fadeFrom = 0;
  private raf = 0;
  private w = 1;
  private h = 1;
  private vy = 0; // momentum, radians per ms
  private vp = 0;
  private spin = 0; // idle rotation, radians per ms
  private last = 0; // time of the previous frame while animating
  private lastMove = 0; // time of the previous pointer move
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch = 0;
  private moved = false;
  private ro: ResizeObserver | null = null;
  private off: (() => void)[] = [];
  private dead = false;

  constructor(private canvas: HTMLCanvasElement) {
    const opts = { antialias: false, alpha: false, preserveDrawingBuffer: false };
    this.gl = (canvas.getContext("webgl", opts) || canvas.getContext("experimental-webgl", opts)) as WebGLRenderingContext | null;
    if (!this.gl) throw new Error("webgl");
    this.setup();
    this.listen();
    this.resize();
  }

  // ---------- public ----------

  // Shows an image. With fade (ms) it is cross-faded over the current one and the
  // viewing direction does not change.
  setImage(source: PanoSource, fade = 0) {
    if (this.dead || !this.gl) return;
    if (this.fadeT > 0 || this.fadeMs) this.finishFade();
    if (!this.src[0] || fade <= 0) {
      this.upload(0, source);
      this.invalidate();
      return;
    }
    this.upload(1, source);
    this.fadeMs = fade;
    this.fadeFrom = performance.now();
    this.fadeT = 0.0001;
    this.invalidate();
  }

  lookAt(yaw: number, pitch = 0) {
    this.yaw = wrap(yaw);
    this.pitch = pitch;
    this.vy = this.vp = 0;
    this.limit();
    this.invalidate();
  }

  // A slow turn until the visitor takes over. Radians per second; 0 stops it.
  autoRotate(speed: number) {
    this.spin = speed / 1000;
    this.invalidate();
  }

  // Where a direction falls on the canvas, in CSS pixels.
  project(yaw: number, pitch: number): { x: number; y: number; visible: boolean } {
    const cp = Math.cos(pitch);
    let x = cp * Math.sin(yaw);
    let y = Math.sin(pitch);
    let z = -cp * Math.cos(yaw);
    // undo the camera's yaw, then its pitch
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    [x, z] = [x * cy + z * sy, -x * sy + z * cy];
    const c = Math.cos(this.pitch), s = Math.sin(this.pitch);
    [y, z] = [y * c + z * s, -y * s + z * c];
    if (z > -0.05) return { x: 0, y: 0, visible: false };
    const [tx, ty] = this.tans();
    const nx = x / -z / tx;
    const ny = y / -z / ty;
    return { x: ((nx + 1) / 2) * this.w, y: ((1 - ny) / 2) * this.h, visible: Math.abs(nx) < 1.15 && Math.abs(ny) < 1.15 };
  }

  // The direction under a point of the canvas (CSS pixels from its top left).
  unproject(px: number, py: number): { yaw: number; pitch: number } {
    const [tx, ty] = this.tans();
    let x = ((px / this.w) * 2 - 1) * tx;
    let y = (1 - (py / this.h) * 2) * ty;
    let z = -1;
    const n = Math.hypot(x, y, z);
    x /= n;
    y /= n;
    z /= n;
    const c = Math.cos(this.pitch), s = Math.sin(this.pitch);
    [y, z] = [y * c - z * s, y * s + z * c];
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    [x, z] = [x * cy - z * sy, x * sy + z * cy];
    return { yaw: Math.atan2(x, -z), pitch: Math.asin(clamp(y, -1, 1)) };
  }

  nudge(dyaw: number, dpitch: number) {
    this.touched();
    this.yaw = wrap(this.yaw + dyaw);
    this.pitch += dpitch;
    this.limit();
    this.invalidate();
  }

  zoom(factor: number) {
    this.fov = clamp(this.fov * factor, FOV_MIN, FOV_MAX);
    this.limit();
    this.invalidate();
  }

  invalidate() {
    if (this.dead || this.raf) return;
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.off.forEach((f) => f());
    const gl = this.gl;
    if (gl) {
      this.tex.forEach((t) => t && gl.deleteTexture(t));
      if (this.program) gl.deleteProgram(this.program);
    }
    this.gl = null;
  }

  // ---------- drawing ----------

  private setup() {
    const gl = this.gl!;
    const sh = (type: number, text: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, text);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || "program");
    gl.useProgram(prog);
    this.program = prog;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const n of ["a", "b", "fade", "tanHalf", "rot"]) this.uni[n] = gl.getUniformLocation(prog, n);
    gl.uniform1i(this.uni.a, 0);
    gl.uniform1i(this.uni.b, 1);
    // both samplers always have something to read, even before the first image
    this.tex = [null, null];
    for (const slot of [0, 1] as const) {
      this.tex[slot] = gl.createTexture();
      gl.activeTexture(slot ? gl.TEXTURE1 : gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tex[slot]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([16, 16, 20]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
  }

  private upload(slot: 0 | 1, source: PanoSource) {
    const gl = this.gl!;
    this.src[slot] = source;
    gl.activeTexture(slot ? gl.TEXTURE1 : gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[slot]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, fit(source, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number));
  }

  private finishFade() {
    if (!this.src[1]) return;
    // the new image becomes the current one
    this.tex = [this.tex[1], this.tex[0]];
    this.src = [this.src[1], null];
    const gl = this.gl!;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[0]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[1]);
    this.fadeT = 0;
    this.fadeMs = 0;
  }

  private tans(): [number, number] {
    const t = Math.tan(this.fov / 2);
    const d = Math.hypot(this.w, this.h);
    return [(t * this.w) / d, (t * this.h) / d];
  }

  // Generated panoramas are weakest straight up and straight down, so the view
  // stops before the top or bottom of the image comes into the frame.
  private limit() {
    const vfov = 2 * Math.atan(this.tans()[1]);
    const max = clamp(82 * RAD - vfov / 2, 8 * RAD, 60 * RAD);
    this.pitch = clamp(this.pitch, -max, max);
  }

  private frame = (now: number) => {
    this.raf = 0;
    const gl = this.gl;
    if (!gl || this.dead) return;
    const dt = this.last ? Math.min(64, now - this.last) : 16;
    this.last = now;
    let again = false;

    if (!this.pointers.size) {
      if (Math.abs(this.vy) > 1e-6 || Math.abs(this.vp) > 1e-6) {
        this.yaw = wrap(this.yaw + this.vy * dt);
        this.pitch += this.vp * dt;
        const k = Math.pow(0.996, dt);
        this.vy *= k;
        this.vp *= k;
        if (Math.abs(this.vy) < 2e-5) this.vy = 0;
        if (Math.abs(this.vp) < 2e-5) this.vp = 0;
        this.limit();
        again = true;
      } else if (this.spin) {
        this.yaw = wrap(this.yaw + this.spin * dt);
        again = true;
      }
    }
    if (this.fadeMs) {
      this.fadeT = clamp((now - this.fadeFrom) / this.fadeMs, 0.0001, 1);
      if (this.fadeT >= 1) this.finishFade();
      else again = true;
    }

    if (this.src[0]) {
      const [tx, ty] = this.tans();
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.uniform1f(this.uni.fade, this.fadeMs ? ease(this.fadeT) : 0);
      gl.uniform2f(this.uni.tanHalf, tx, ty);
      gl.uniform2f(this.uni.rot, this.yaw, this.pitch);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    this.onFrame?.();
    if (again) this.invalidate();
    else this.last = 0;
  };

  private resize = () => {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = rect.width;
    this.h = rect.height;
    const cw = Math.round(rect.width * dpr);
    const ch = Math.round(rect.height * dpr);
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    this.limit();
    this.invalidate();
  };

  // ---------- input ----------

  private touched() {
    this.spin = 0;
    if (this.moved) return;
    this.moved = true;
    this.onTouch?.();
  }

  private listen() {
    const c = this.canvas;
    const on = <E extends Event>(type: string, fn: (e: E) => void, opts?: AddEventListenerOptions) => {
      c.addEventListener(type, fn as EventListener, opts);
      this.off.push(() => c.removeEventListener(type, fn as EventListener, opts));
    };

    on<PointerEvent>("pointerdown", (e) => {
      c.setPointerCapture?.(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.vy = this.vp = 0;
      this.pinch = this.spread();
    });
    on<PointerEvent>("pointermove", (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pointers.size >= 2) {
        const s = this.spread();
        if (this.pinch && s) this.zoom(this.pinch / s);
        this.pinch = s;
        this.touched();
        return;
      }
      if (!dx && !dy) return;
      this.touched();
      // the picture follows the finger
      const [tx, ty] = this.tans();
      const ky = (2 * Math.atan(tx)) / this.w;
      const kp = (2 * Math.atan(ty)) / this.h;
      const now = performance.now();
      const dt = clamp(now - this.lastMove, 4, 60);
      this.yaw = wrap(this.yaw - dx * ky);
      this.pitch += dy * kp;
      this.vy = 0.6 * this.vy + 0.4 * ((-dx * ky) / dt);
      this.vp = 0.6 * this.vp + 0.4 * ((dy * kp) / dt);
      this.lastMove = now;
      this.limit();
      this.invalidate();
    });
    const end = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      this.pinch = this.spread();
      if (!this.pointers.size) {
        // a finger that stopped before lifting leaves no momentum
        if (performance.now() - this.lastMove > 90) this.vy = this.vp = 0;
        this.vy = clamp(this.vy, -0.004, 0.004);
        this.vp = clamp(this.vp, -0.004, 0.004);
        this.last = 0;
        this.invalidate();
      }
    };
    on<PointerEvent>("pointerup", end);
    on<PointerEvent>("pointercancel", end);
    on<WheelEvent>(
      "wheel",
      (e) => {
        if (!this.wheelZoom) return;
        e.preventDefault();
        this.touched();
        this.zoom(Math.exp(e.deltaY * 0.0012));
      },
      { passive: false },
    );
    on<KeyboardEvent>("keydown", (e) => {
      const step = 8 * RAD;
      if (e.key === "ArrowLeft") this.nudge(-step, 0);
      else if (e.key === "ArrowRight") this.nudge(step, 0);
      else if (e.key === "ArrowUp") this.nudge(0, step);
      else if (e.key === "ArrowDown") this.nudge(0, -step);
      else if (e.key === "+" || e.key === "=") this.zoom(0.9);
      else if (e.key === "-") this.zoom(1.1);
      else return;
      e.preventDefault();
    });
    on("webglcontextlost", (e) => e.preventDefault());
    on("webglcontextrestored", () => {
      try {
        this.setup();
        const [a, b] = this.src;
        if (a) this.upload(0, a);
        if (b) this.upload(1, b);
        this.invalidate();
      } catch {
        /* the next image will try again */
      }
    });

    this.ro = new ResizeObserver(this.resize);
    this.ro.observe(c);
  }

  private spread() {
    if (this.pointers.size < 2) return 0;
    const [p, q] = [...this.pointers.values()];
    return Math.hypot(p.x - q.x, p.y - q.y);
  }
}

const ease = (t: number) => t * t * (3 - 2 * t);

// Phones with a small texture limit get a scaled copy.
function fit(source: PanoSource, max: number): PanoSource {
  const w = "naturalWidth" in source ? source.naturalWidth : source.width;
  const h = "naturalHeight" in source ? source.naturalHeight : source.height;
  if (!w || !h || (w <= max && h <= max)) return source;
  const k = max / Math.max(w, h);
  const c = document.createElement("canvas");
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  c.getContext("2d")!.drawImage(source, 0, 0, c.width, c.height);
  return c;
}

const cache = new Map<string, Promise<HTMLImageElement>>();

// Loads a panorama once per address. Images from the account come from another
// origin, so they are requested in a way WebGL is allowed to read.
export function loadPano(url: string): Promise<HTMLImageElement> {
  let p = cache.get(url);
  if (!p) {
    p = new Promise<HTMLImageElement>((res, rej) => {
      const img = new Image();
      if (!url.startsWith("blob:") && !url.startsWith("/")) img.crossOrigin = "anonymous";
      img.onload = () => res(img);
      img.onerror = () => {
        cache.delete(url);
        rej(new Error("image"));
      };
      img.src = url;
    });
    cache.set(url, p);
  }
  return p;
}
