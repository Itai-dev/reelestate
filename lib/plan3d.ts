// Builds an apartment in 3D from its layout, in the browser: walls with their doors
// and windows, floors, furniture by room type, the outlook, light. From it come a
// photograph of each room and a 360° panorama from a standing point in it. The
// pictures are plain on purpose: the image model turns them into photographs, and
// what matters here is that every room is the same apartment from every angle.
//
// Plan coordinates: metres, x east, y north, z up. three.js: (x, z, -y).
import * as THREE from "three";
import type { Layout, LayoutRoom, Wall as Side } from "./layout";

const H = 2.75; // ceiling
const T = 0.12; // wall thickness
const EYE = 1.55;
const GROUND = -21; // the apartment is on a high floor

type V3 = [number, number, number];
type Axis = "x" | "y"; // a wall line: "x" runs north-south at x = c, "y" runs east-west at y = c
type Opening = { ax: Axis; c: number; a0: number; a1: number; z0: number; z1: number; kind: "slider" | "open" | "door" | "window"; rooms: string[] };
type Foot = { room: string; x0: number; y0: number; x1: number; y1: number };
type Room = LayoutRoom & { x1: number; y1: number };

export type PlanShot = {
  id: string; // the layout room
  still: Blob;
  w: number;
  h: number;
  pano?: Blob;
  at: { x: number; y: number; heading: number }; // where the panorama stands, and where its centre looks (radians, clockwise from north)
};

const COLORS: Record<string, [string, number, number?]> = {
  wall: ["#efe8dc", 0.9], ceil: ["#f6f4f0", 0.95], oak: ["#c2a079", 0.5], tile: ["#d8d2c6", 0.4], deck: ["#bdb4a6", 0.7],
  white: ["#f1efea", 0.6], frame: ["#24231f", 0.5, 0.4], steel: ["#b9bcbf", 0.35, 0.8], sofa: ["#b9b3a4", 0.95], cushion: ["#d8d2c4", 0.95],
  olive: ["#6f7350", 0.9], wood: ["#a9845c", 0.5], dark: ["#5b4634", 0.5], stone: ["#e2d9c8", 0.35], rug: ["#ddd2bd", 1], linen: ["#f2eee6", 0.95],
  brass: ["#b08d4f", 0.35, 0.8], leaf: ["#44683c", 0.7], pot: ["#cdbfa9", 0.7], terra: ["#b8684a", 0.8], sea: ["#3d7fa3", 0.25], lawn: ["#768a58", 1],
  hill: ["#6f7f5a", 1], roofs: ["#d6c9b4", 0.9], tiles: ["#b5714f", 0.9],
};

const edges = (r: Room): Record<Side, [Axis, number, number, number]> => ({ W: ["x", r.x, r.y, r.y1], E: ["x", r.x1, r.y, r.y1], S: ["y", r.y, r.x, r.x1], N: ["y", r.y1, r.x, r.x1] });

function shared(a: Room, b: Room) {
  const ea = edges(a), eb = edges(b);
  for (const sa of "WESN" as unknown as Side[])
    for (const sb of "WESN" as unknown as Side[]) {
      const [ax, c, a0, a1] = ea[sa], [bx, c2, b0, b1] = eb[sb];
      if (ax === bx && Math.abs(c - c2) < 0.06 && Math.min(a1, b1) - Math.max(a0, b0) >= 0.9) return { ax, c, s0: Math.max(a0, b0), s1: Math.min(a1, b1), sa, sb };
    }
  return null;
}

// A point on a wall line: a along the wall, off across it.
const P = (ax: Axis, c: number, a: number, z: number, off = 0): V3 => (ax === "x" ? [c + off, a, z] : [a, c + off, z]);

class Model {
  scene = new THREE.Scene();
  rooms = new Map<string, Room>();
  open: Opening[] = [];
  foot: Foot[] = [];
  focus = new Map<string, V3>(); // what a photograph of the room looks at
  private mats = new Map<string, THREE.Material>();
  private unit = new THREE.BoxGeometry(1, 1, 1);
  private tube = new THREE.CylinderGeometry(1, 1, 1, 24);
  private ball = new THREE.IcosahedronGeometry(1, 2);

  constructor(readonly layout: Layout) {
    for (const r of layout.rooms) this.rooms.set(r.id, { ...r, x1: r.x + r.w, y1: r.y + r.d });
    this.openings();
    this.walls();
    this.floors();
    for (const r of this.rooms.values()) this.furnish(r);
    this.outside();
    this.light();
  }

  mat(name: string) {
    let m = this.mats.get(name);
    if (!m) {
      if (name === "glass") m = new THREE.MeshStandardMaterial({ color: "#dfeef2", roughness: 0.05, transparent: true, opacity: 0.14, depthWrite: false });
      else if (name === "curtain") m = new THREE.MeshStandardMaterial({ color: "#f3efe8", roughness: 1, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
      else {
        const [color, roughness, metalness = 0] = COLORS[name];
        m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
      }
      this.mats.set(name, m);
    }
    return m;
  }

  private add(mesh: THREE.Mesh, material: string) {
    const solid = material !== "glass" && material !== "curtain";
    mesh.castShadow = solid;
    mesh.receiveShadow = solid;
    this.scene.add(mesh);
    return mesh;
  }

  box(a: V3, b: V3, material: string, room?: string) {
    const lo = a.map((v, i) => Math.min(v, b[i])), hi = a.map((v, i) => Math.max(v, b[i]));
    const m = new THREE.Mesh(this.unit, this.mat(material));
    m.scale.set(Math.max(hi[0] - lo[0], 0.001), Math.max(hi[2] - lo[2], 0.001), Math.max(hi[1] - lo[1], 0.001));
    m.position.set((lo[0] + hi[0]) / 2, (lo[2] + hi[2]) / 2, -(lo[1] + hi[1]) / 2);
    if (room && lo[2] < 1) this.foot.push({ room, x0: lo[0], y0: lo[1], x1: hi[0], y1: hi[1] });
    return this.add(m, material);
  }

  cyl(at: V3, r: number, h: number, material: string, room?: string) {
    const m = new THREE.Mesh(this.tube, this.mat(material));
    m.scale.set(r, h, r);
    m.position.set(at[0], at[2], -at[1]);
    if (room && at[2] - h / 2 < 1) this.foot.push({ room, x0: at[0] - r, y0: at[1] - r, x1: at[0] + r, y1: at[1] + r });
    return this.add(m, material);
  }

  plant(x: number, y: number, seed: number, room: string) {
    let s = seed * 9301 + 49297;
    const rnd = (lo: number, hi: number) => ((s = (s * 9301 + 49297) % 233280), lo + (s / 233280) * (hi - lo));
    this.cyl([x, y, 0.2], 0.18, 0.4, "pot", room);
    this.cyl([x, y, 0.7], 0.02, 0.7, "dark");
    for (let i = 0; i < 22; i++) {
      const a = rnd(0, 6.28), r = rnd(0.05, 0.28), z = rnd(0.85, 1.65), size = rnd(0.09, 0.16);
      const m = new THREE.Mesh(this.ball, this.mat("leaf"));
      m.scale.set(size, size * 0.55, size);
      m.position.set(x + r * Math.cos(a), z, -(y + r * Math.sin(a)));
      this.add(m, "leaf");
    }
  }

  // ---------- doors and windows ----------
  private openings() {
    for (const cn of this.layout.connections) {
      const A = this.rooms.get(cn.a)!, B = this.rooms.get(cn.b)!;
      const sh = shared(A, B);
      if (!sh) continue;
      const { ax, c, s0, s1 } = sh;
      const mid = (s0 + s1) / 2, length = s1 - s0, rooms = [A.id, B.id];
      if (A.type === "balcony" || B.type === "balcony") {
        const w = Math.min(length - 0.6, 3.6);
        this.open.push({ ax, c, a0: mid - w / 2, a1: mid + w / 2, z0: 0, z1: 2.3, kind: "slider", rooms });
      } else if (cn.open) {
        const w = Math.min(length - 0.8, 3.2);
        this.open.push({ ax, c, a0: mid - w / 2, a1: mid + w / 2, z0: 0, z1: 2.4, kind: "open", rooms });
      } else {
        // a door sits near the end of the shared wall, leaving the main room a long free wall
        const useA = A.type === "living" || (B.type !== "living" && A.w * A.d >= B.w * B.d);
        const [, , r0, r1] = edges(useA ? A : B)[useA ? sh.sa : sh.sb];
        const rm = (r0 + r1) / 2;
        const d0 = Math.abs(s0 + 0.55 - rm) >= Math.abs(s1 - 0.55 - rm) ? s0 + 0.1 : s1 - 1.0;
        this.open.push({ ax, c, a0: d0, a1: d0 + 0.9, z0: 0, z1: 2.1, kind: "door", rooms });
      }
    }
    for (const w of this.layout.windows) {
      const r = this.rooms.get(w.room);
      if (!r || r.type === "balcony") continue;
      const [ax, c, a0, a1] = edges(r)[w.wall];
      if (!this.outer(r, ax, c)) continue;
      const width = r.type === "bathroom" ? 0.8 : Math.min(a1 - a0 - 1.0, 2.6);
      if (width < 0.5) continue;
      const [sill, head] = r.type === "bathroom" ? [1.4, 2.1] : r.type === "living" ? [0.35, 2.4] : [0.9, 2.3];
      const mid = (a0 + a1) / 2;
      this.open.push({ ax, c, a0: mid - width / 2, a1: mid + width / 2, z0: sill, z1: head, kind: "window", rooms: [r.id] });
    }
  }

  // a wall of the room that no other room touches
  private outer(r: Room, ax: Axis, c: number) {
    for (const o of this.rooms.values()) {
      if (o === r) continue;
      const sh = shared(r, o);
      if (sh && sh.ax === ax && Math.abs(sh.c - c) < 0.06) return false;
    }
    return true;
  }

  private wallBox(ax: Axis, c: number, a0: number, a1: number, z0: number, z1: number, material = "wall", t = T) {
    if (a1 - a0 < 0.01 || z1 - z0 < 0.01) return;
    this.box(P(ax, c, a0, z0, -t / 2), P(ax, c, a1, z1, t / 2), material);
  }

  private walls() {
    // every wall line once, even where two rooms share it
    const lines = new Map<string, { ax: Axis; c: number; spans: [number, number][] }>();
    for (const r of this.rooms.values()) {
      if (r.type === "balcony") continue;
      for (const [ax, c, a0, a1] of Object.values(edges(r))) {
        const key = `${ax}:${c.toFixed(2)}`;
        if (!lines.has(key)) lines.set(key, { ax, c, spans: [] });
        lines.get(key)!.spans.push([a0, a1]);
      }
    }
    for (const { ax, c, spans } of lines.values()) {
      spans.sort((p, q) => p[0] - q[0]);
      const merged: [number, number][] = [[...spans[0]]];
      for (const [s0, s1] of spans.slice(1)) {
        const last = merged[merged.length - 1];
        if (s0 <= last[1] + 0.01) last[1] = Math.max(last[1], s1);
        else merged.push([s0, s1]);
      }
      for (const [s0, s1] of merged) {
        const cuts = this.open.filter((o) => o.ax === ax && Math.abs(o.c - c) < 0.06 && o.a0 >= s0 - 0.01 && o.a1 <= s1 + 0.01).sort((p, q) => p.a0 - q.a0);
        let at = s0 - T / 2;
        for (const o of cuts) {
          this.wallBox(ax, c, at, o.a0, 0, H);
          this.wallBox(ax, c, o.a0, o.a1, 0, o.z0);
          this.wallBox(ax, c, o.a0, o.a1, o.z1, H);
          at = o.a1;
        }
        this.wallBox(ax, c, at, s1 + T / 2, 0, H);
      }
    }
    for (const { ax, c, a0, a1, z0, z1, kind } of this.open) {
      if (kind === "window") {
        this.wallBox(ax, c, a0, a1, z0, z1, "glass", 0.012);
        for (const a of [a0, (a0 + a1) / 2, a1]) this.wallBox(ax, c, a - 0.02, a + 0.02, z0, z1, "frame", 0.07);
        for (const z of [z0, z1 - 0.04]) this.wallBox(ax, c, a0, a1, z, z + 0.04, "frame", 0.07);
      } else if (kind === "slider") {
        let n = Math.max(3, Math.round((a1 - a0) / 1.15));
        n += (n + 1) % 2; // an odd number of bays, so the middle one is the open door
        const w = (a1 - a0) / n;
        for (let i = 0; i <= n; i++) this.wallBox(ax, c, a0 + i * w - 0.022, a0 + i * w + 0.022, z0, z1, "frame", 0.07);
        this.wallBox(ax, c, a0, a1, z1 - 0.04, z1, "frame", 0.07);
        for (let i = 0; i < n; i++) {
          if (i === (n - 1) / 2) continue;
          this.wallBox(ax, c, a0 + i * w, a0 + (i + 1) * w, 0.04, z1 - 0.04, "glass", 0.012);
          this.wallBox(ax, c, a0 + i * w, a0 + (i + 1) * w, 0, 0.04, "frame", 0.07);
        }
      } else if (kind === "door") {
        for (const a of [a0 - 0.03, a1]) this.wallBox(ax, c, a, a + 0.03, 0, z1 + 0.03, "white", T + 0.02);
        this.wallBox(ax, c, a0, a1, z1, z1 + 0.03, "white", T + 0.02);
      }
    }
    // curtains at the windows of the rooms people sit and sleep in
    for (const { ax, c, a0, a1, kind, rooms } of this.open) {
      const r = this.rooms.get(rooms[0])!;
      if (kind !== "window" || r.type === "bathroom" || r.type === "kitchen") continue;
      const inward = (ax === "x" ? c < (r.x + r.x1) / 2 : c < (r.y + r.y1) / 2) ? 1 : -1;
      for (const [b0, b1] of [[a0 - 0.15, a0 + 0.35], [a1 - 0.35, a1 + 0.15]]) {
        const n = 24, pos: number[] = [], idx: number[] = [];
        for (let i = 0; i <= n; i++) {
          const a = b0 + ((b1 - b0) * i) / n, off = inward * (T / 2 + 0.08 + 0.04 * Math.sin(i * 1.5));
          for (const z of [0.02, 2.5]) {
            const p = P(ax, c, a, z, off);
            pos.push(p[0], p[2], -p[1]);
          }
        }
        for (let i = 0; i < n; i++) idx.push(i * 2, i * 2 + 2, i * 2 + 3, i * 2, i * 2 + 3, i * 2 + 1);
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        this.add(new THREE.Mesh(g, this.mat("curtain")), "curtain");
      }
    }
  }

  private floors() {
    for (const r of this.rooms.values()) {
      const floor = r.type === "kitchen" || r.type === "bathroom" ? "tile" : r.type === "balcony" ? "deck" : "oak";
      this.box([r.x - T / 2, r.y - T / 2, -0.2], [r.x1 + T / 2, r.y1 + T / 2, 0], floor);
      this.box([r.x - T / 2, r.y - T / 2, H], [r.x1 + T / 2, r.y1 + T / 2, H + 0.2], "ceil");
      if (r.type !== "balcony") continue;
      for (const [ax, c, a0, a1] of Object.values(edges(r))) {
        if (!this.outer(r, ax, c)) continue;
        this.wallBox(ax, c, a0, a1, 0.05, 1.02, "glass", 0.012);
        this.wallBox(ax, c, a0, a1, 1.02, 1.06, "frame", 0.05);
      }
    }
  }

  // ---------- furniture, placed along each room's freest wall ----------
  // For each side of a room: the longest stretch of wall with no opening.
  private freeSpans(r: Room) {
    const out = {} as Record<Side, { len: number; u0: number; u1: number }>;
    for (const [side, [ax, c, a0, a1]] of Object.entries(edges(r)) as [Side, [Axis, number, number, number]][]) {
      const cuts = this.open
        .filter((o) => o.ax === ax && Math.abs(o.c - c) < 0.06 && o.a1 > a0 && o.a0 < a1)
        .map((o) => [Math.max(o.a0, a0), Math.min(o.a1, a1)])
        .sort((p, q) => p[0] - q[0]);
      let best = { len: 0, u0: a0, u1: a0 }, at = a0;
      for (const [c0, c1] of [...cuts, [a1, a1]]) {
        if (c0 - at > best.len) best = { len: c0 - at, u0: at, u1: c0 };
        at = Math.max(at, c1);
      }
      out[side] = best;
    }
    return out;
  }

  // A frame along one side of a room: u runs along the wall (0 at the middle of the
  // free stretch), v into the room. half: how wide the main piece is, so that it is
  // kept inside the room even when the free stretch is short.
  private along(r: Room, side: Side, span: { len: number; u0: number; u1: number }, half = 0) {
    const [, , e0, e1] = edges(r)[side];
    let mid = (span.u0 + span.u1) / 2;
    if (half) mid = Math.min(Math.max(mid, e0 + half + 0.1), Math.max(e0 + half + 0.1, e1 - half - 0.1));
    const at = (u: number, v: number, z: number): V3 =>
      side === "S" ? [mid + u, r.y + T / 2 + v, z] : side === "N" ? [mid + u, r.y1 - T / 2 - v, z] : side === "W" ? [r.x + T / 2 + v, mid + u, z] : [r.x1 - T / 2 - v, mid + u, z];
    return {
      len: span.len,
      depth: side === "N" || side === "S" ? r.d : r.w,
      at,
      box: (u0: number, u1: number, v0: number, v1: number, z0: number, z1: number, material: string, foot = true) => this.box(at(u0, v0, z0), at(u1, v1, z1), material, foot ? r.id : undefined),
      cyl: (u: number, v: number, z: number, radius: number, h: number, material: string, foot = true) => {
        const p = at(u, v, z);
        return this.cyl(p, radius, h, material, foot ? r.id : undefined);
      },
    };
  }

  private furnish(r: Room) {
    const spans = this.freeSpans(r);
    const order = (Object.keys(spans) as Side[]).sort((a, b) => spans[b].len - spans[a].len);
    const kind = r.type, id = r.id;
    if (kind === "living") {
      const L = Math.max(0.7, Math.min(2.5, spans[order[0]].len - 0.4) / 2);
      const w = this.along(r, order[0], spans[order[0]], L + 0.2);
      w.box(-L, L, 0.05, 0.98, 0.08, 0.34, "sofa");
      w.box(-L, L, 0.05, 0.3, 0.08, 0.82, "sofa");
      for (const s of [-1, 1]) {
        w.box(s * L, s * (L + 0.2), 0.05, 0.98, 0.08, 0.6, "sofa");
        w.box(s * 0.04, s * (L - 0.02), 0.3, 0.96, 0.34, 0.5, "cushion");
        w.box(s * (L - 0.55), s * (L - 0.1), 0.28, 0.46, 0.5, 0.92, "olive");
      }
      w.box(-L - 0.1, L + 0.1, 1.05, Math.min(w.depth - 1.2, 3.1), 0, 0.012, "rug", false);
      w.box(-0.6, 0.6, 1.5, 2.15, 0.3, 0.36, "stone");
      for (const u of [-0.52, 0.52]) for (const v of [1.58, 2.07]) w.cyl(u, v, 0.15, 0.015, 0.3, "frame", false);
      const art = Math.min(0.9, L);
      w.box(-art, art, 0, 0.03, 1.3, 2.0, "frame", false);
      w.box(-art + 0.04, art - 0.04, 0.03, 0.035, 1.34, 1.96, "linen", false);
      w.box(-art * 0.66, -art * 0.11, 0.035, 0.04, 1.45, 1.85, "terra", false);
      w.box(art * 0.11, art * 0.66, 0.035, 0.04, 1.5, 1.8, "olive", false);
      w.cyl(L + 0.45, 0.3, 0.75, 0.012, 1.5, "brass", false);
      w.cyl(L + 0.45, 0.3, 1.6, 0.18, 0.28, "linen", false);
      const p = w.at(-L - 0.5, 0.35, 0);
      if (p[0] > r.x + 0.3 && p[0] < r.x1 - 0.3 && p[1] > r.y + 0.3 && p[1] < r.y1 - 0.3) this.plant(p[0], p[1], 4, id);
      if (spans[order[1]].len >= 2) this.along(r, order[1], spans[order[1]]).box(-0.9, 0.9, 0.03, 0.45, 0.14, 0.62, "wood");
      this.focus.set(id, w.at(0, 1.2, 0.8));
    } else if (kind === "kitchen") {
      const L = Math.max(1, Math.min(3.6, spans[order[0]].len - 0.1) / 2);
      const w = this.along(r, order[0], spans[order[0]], L);
      w.box(-L, L - 0.72, 0, 0.62, 0, 0.88, "olive");
      w.box(-L, L - 0.72, 0, 0.64, 0.88, 0.92, "stone");
      w.box(-L, L - 0.72, 0, 0.36, 1.5, 2.3, "wood", false);
      w.box(-L, L - 0.72, 0, 0.012, 0.92, 1.5, "stone", false);
      w.box(L - 0.7, L, 0, 0.7, 0, 2.1, "steel");
      w.box(-0.4, 0.4, 0.12, 0.52, 0.92, 0.93, "frame", false);
      this.focus.set(id, w.at(0, 0.8, 0.9));
      if (w.depth >= 3.4 && L >= 1.3) {
        w.box(-1.0, 1.0, 1.75, 2.65, 0, 0.88, "wood");
        w.box(-1.08, 1.08, 1.68, 2.72, 0.88, 0.93, "stone");
        for (const u of [-0.6, 0, 0.6]) {
          w.cyl(u, 3.0, 0.66, 0.17, 0.05, "wood");
          w.cyl(u, 3.0, 0.32, 0.018, 0.64, "frame", false);
        }
        for (const u of [-0.5, 0.5]) {
          w.cyl(u, 2.2, 1.95, 0.12, 0.2, "brass", false);
          w.cyl(u, 2.2, 2.4, 0.004, 0.7, "frame", false);
        }
        w.cyl(0.2, 2.2, 0.97, 0.15, 0.07, "pot", false);
        this.focus.set(id, w.at(0, 1.6, 1.0));
      }
    } else if (kind === "bedroom" || kind === "kids") {
      const half = kind === "bedroom" ? 0.9 : 0.5, cover = kind === "bedroom" ? "olive" : "terra";
      // the bed's head goes to a wall the bed fits against, at full length into the room
      const side = order.find((s) => (s === "N" || s === "S" ? r.d : r.w) >= 2.6) ?? order[0];
      const w = this.along(r, side, spans[side], half + 0.15);
      w.box(-half - 0.15, half + 0.15, 0, 0.1, 0.1, 1.2, "wood");
      w.box(-half, half, 0.1, 2.15, 0.12, 0.4, "wood");
      w.box(-half + 0.02, half - 0.02, 0.1, 2.13, 0.4, 0.58, "linen");
      w.box(-half, half, 0.75, 2.16, 0.4, 0.61, cover);
      for (const u of kind === "bedroom" ? [-0.45, 0.45] : [0]) w.box(u - 0.33, u + 0.33, 0.16, 0.55, 0.58, 0.74, "linen", false);
      for (const s of kind === "bedroom" ? [-1, 1] : [1]) {
        w.box(s * (half + 0.2), s * (half + 0.68), 0.02, 0.45, 0, 0.48, "dark");
        w.cyl(s * (half + 0.44), 0.24, 0.64, 0.09, 0.22, "linen", false);
        w.cyl(s * (half + 0.44), 0.24, 0.5, 0.035, 0.05, "brass", false);
      }
      w.box(-half - 0.5, half + 0.5, 0.9, Math.min(w.depth - 0.5, 2.9), 0, 0.012, "rug", false);
      w.box(-0.6, 0.6, 0, 0.03, 1.45, 2.05, "frame", false);
      w.box(-0.56, 0.56, 0.03, 0.035, 1.49, 2.01, "linen", false);
      w.box(-0.3, 0.3, 0.035, 0.04, 1.6, 1.9, kind === "kids" ? "olive" : "terra", false);
      const other = order.find((s) => s !== side && spans[s].len >= 1.3);
      if (other && kind === "bedroom") {
        const half2 = Math.min(1.0, spans[other].len / 2 - 0.1);
        const s2 = this.along(r, other, spans[other]);
        const a = s2.at(-half2, 0, 0), b = s2.at(half2, 0.6, 0);
        const clash = this.foot.some((f) => f.room === id && Math.min(a[0], b[0]) < f.x1 && Math.max(a[0], b[0]) > f.x0 && Math.min(a[1], b[1]) < f.y1 && Math.max(a[1], b[1]) > f.y0);
        if (!clash) s2.box(-half2, half2, 0, 0.6, 0, 2.35, "wood");
      }
      this.focus.set(id, w.at(0, 1.0, 0.7));
    } else if (kind === "bathroom") {
      const w = this.along(r, order[0], spans[order[0]], 0.52);
      w.box(-0.5, 0.5, 0, 0.5, 0.3, 0.85, "wood");
      w.box(-0.52, 0.52, 0, 0.52, 0.85, 0.89, "stone");
      w.box(-0.4, 0.4, 0, 0.02, 1.1, 1.9, "steel", false);
      if (spans[order[1]].len >= 0.9) this.along(r, order[1], spans[order[1]], 0.2).box(-0.2, 0.2, 0.05, 0.65, 0, 0.42, "white");
      this.focus.set(id, w.at(0, 0.5, 1.0));
    } else if (kind === "balcony") {
      // against the apartment's wall, looking out
      const inner = (Object.keys(spans) as Side[]).find((s) => !this.outer(r, edges(r)[s][0], edges(r)[s][1])) ?? order[0];
      const [, , e0, e1] = edges(r)[inner];
      const w = this.along(r, inner, { len: e1 - e0, u0: e0, u1: e1 });
      const end = (e1 - e0) / 2;
      w.box(-end + 0.3, -end + 1.8, 0.1, 0.8, 0.24, 0.36, "linen");
      w.box(-end + 0.3, -end + 0.7, 0.1, 0.8, 0.3, 0.72, "linen");
      w.cyl(-end + 2.3, 0.5, 0.4, 0.26, 0.03, "stone");
      w.cyl(-end + 2.3, 0.5, 0.2, 0.02, 0.4, "frame", false);
      const p = w.at(end - 0.45, 0.4, 0);
      this.plant(p[0], p[1], 9, id);
      this.focus.set(id, w.at(0, 60, 0.6));
    } else {
      this.focus.set(id, [(r.x + r.x1) / 2, (r.y + r.y1) / 2, 1]);
    }
  }

  // ---------- the outlook: a low city, hills, and the sea to the north ----------
  private bounds() {
    const rs = [...this.rooms.values()];
    return { x0: Math.min(...rs.map((r) => r.x)), x1: Math.max(...rs.map((r) => r.x1)), y0: Math.min(...rs.map((r) => r.y)), y1: Math.max(...rs.map((r) => r.y1)) };
  }

  private outside() {
    const b = this.bounds(), mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
    this.box([mx - 400, my - 400, GROUND - 1], [mx + 400, b.y1 + 70, GROUND], "lawn");
    this.box([mx - 3000, b.y1 + 70, GROUND - 1.5], [mx + 3000, b.y1 + 6000, GROUND - 0.5], "sea");
    let s = 5;
    const rnd = (lo: number, hi: number) => ((s = (s * 9301 + 49297) % 233280), lo + (s / 233280) * (hi - lo));
    for (let i = 0; i < 70; i++) {
      const x = mx + rnd(-220, 220), y = my + rnd(-260, 60);
      const w = rnd(9, 20), d = rnd(9, 16), h = rnd(5, 15);
      if (Math.abs(x - mx) < 28 && Math.abs(y - my) < 28) continue;
      this.box([x - w / 2, y - d / 2, GROUND], [x + w / 2, y + d / 2, GROUND + h], "roofs");
      this.box([x - w / 2 - 0.3, y - d / 2 - 0.3, GROUND + h], [x + w / 2 + 0.3, y + d / 2 + 0.3, GROUND + h + 0.5], "tiles");
    }
    for (const [x, y, rr, h] of [[900, 1500, 700, 95], [-2300, 500, 800, 110], [2300, -400, 900, 150], [-1200, -1900, 900, 160], [400, -2400, 1100, 140]]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 16), this.mat("hill"));
      m.scale.set(rr, h, rr);
      m.position.set(mx + x, GROUND - 3, -(my + y));
      this.scene.add(m);
    }
    this.scene.background = new THREE.Color("#bfd9ee");
  }

  private light() {
    const b = this.bounds(), mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
    this.scene.add(new THREE.HemisphereLight("#eef4ff", "#d9cbb4", 1.5));
    // the sun stands high in the north-west, so it reaches in through the balcony door
    const sun = new THREE.DirectionalLight("#fff3e0", 3.2);
    sun.position.set(mx - 16, 22, -(my + 26));
    sun.target.position.set(mx, 0, -my);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    const reach = Math.max(b.x1 - b.x0, b.y1 - b.y0) / 2 + 6;
    Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 90 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun, sun.target);
    // a soft lamp under each ceiling, so that rooms away from the windows are not dark
    for (const r of this.rooms.values()) {
      const lamp = new THREE.PointLight("#fff4e6", r.type === "balcony" ? 3 : 9, 9, 1.4);
      lamp.position.set((r.x + r.x1) / 2, H - 0.7, -(r.y + r.y1) / 2);
      this.scene.add(lamp);
    }
  }

  // ---------- where to stand ----------
  private freePoints(r: Room, wallGap: number, gap: number) {
    const pts: [number, number][] = [];
    for (let x = r.x + wallGap; x <= r.x1 - wallGap + 1e-6; x += 0.25)
      for (let y = r.y + wallGap; y <= r.y1 - wallGap + 1e-6; y += 0.25)
        if (!this.foot.some((f) => f.room === r.id && f.x0 - gap < x && x < f.x1 + gap && f.y0 - gap < y && y < f.y1 + gap)) pts.push([x, y]);
    return pts;
  }

  // The standing point of a room's panorama: free floor near the middle.
  stand(id: string): [number, number] {
    const r = this.rooms.get(id)!;
    const cx = (r.x + r.x1) / 2, cy = (r.y + r.y1) / 2;
    const pts = this.freePoints(r, r.type === "balcony" ? 0.5 : 0.6, 0.42);
    if (!pts.length) return [cx, cy];
    return pts.reduce((best, p) => ((p[0] - cx) ** 2 + (p[1] - cy) ** 2 < (best[0] - cx) ** 2 + (best[1] - cy) ** 2 ? p : best));
  }

  // The camera of a room's photograph: the free point farthest from what it looks at.
  camera(id: string): { pos: V3; target: V3 } {
    const r = this.rooms.get(id)!, f = this.focus.get(id)!;
    if (r.type === "balcony") {
      const [x, y] = this.stand(id);
      return { pos: [x, y, 1.5], target: [x, y + 60, 0.2] };
    }
    const pts = this.freePoints(r, 0.4, 0.8);
    const all = pts.length ? pts : [this.stand(id)];
    const p = all.reduce((best, q) => ((q[0] - f[0]) ** 2 + (q[1] - f[1]) ** 2 > (best[0] - f[0]) ** 2 + (best[1] - f[1]) ** 2 ? q : best));
    return { pos: [p[0], p[1], 1.4], target: f };
  }

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry !== this.unit && m.geometry !== this.tube && m.geometry !== this.ball) m.geometry.dispose();
    });
    this.unit.dispose();
    this.tube.dispose();
    this.ball.dispose();
    for (const m of this.mats.values()) m.dispose();
  }
}

const EQUIRECT_VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
// Unrolls the six views around a point into one 2:1 picture whose centre looks along `heading`.
const EQUIRECT_FRAG = `
uniform samplerCube map; uniform float heading; varying vec2 vUv;
void main() {
  float lon = (vUv.x - 0.5) * 6.28318530718 + heading, lat = (vUv.y - 0.5) * 3.14159265359;
  vec3 dir = vec3(sin(lon) * cos(lat), sin(lat), -cos(lon) * cos(lat));
  gl_FragColor = textureCube(map, dir);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/jpeg", 0.92));
const breathe = () => new Promise<void>((r) => setTimeout(r, 0));

// The rooms of a layout that get pictures: everything people show a buyer.
export const shownRooms = (layout: Layout) => layout.rooms.filter((r) => r.type !== "hall" && r.type !== "bathroom");

// A photograph (aspect w:h) and, when asked, a 360° panorama of each chosen room.
export async function renderPlan(layout: Layout, opts: { rooms: string[]; aspect: [number, number]; panos: boolean; onProgress?: (done: number, total: number) => void }): Promise<PlanShot[]> {
  const model = new Model(layout);
  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const [aw, ah] = opts.aspect;
  const k = 1600 / Math.max(aw, ah);
  const W = Math.round((aw * k) / 2) * 2, Hh = Math.round((ah * k) / 2) * 2;
  const cube = new THREE.WebGLCubeRenderTarget(1024, { type: THREE.HalfFloatType });
  const around = new THREE.CubeCamera(0.03, 9000, cube);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: { map: { value: cube.texture }, heading: { value: 0 } }, vertexShader: EQUIRECT_VERT, fragmentShader: EQUIRECT_FRAG, depthTest: false }));
  const flat = new THREE.Scene().add(quad);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const out: PlanShot[] = [];
  const ids = opts.rooms.filter((id) => model.rooms.has(id));
  const total = ids.length * (opts.panos ? 2 : 1);
  let done = 0;
  try {
    for (const id of ids) {
      // the photograph: a wide lens across the picture's long side
      const { pos, target } = model.camera(id);
      const long = 2 * Math.atan(18 / 17);
      const fov = Hh >= W ? long : 2 * Math.atan((Math.tan(long / 2) * Hh) / W);
      const cam = new THREE.PerspectiveCamera((fov * 180) / Math.PI, W / Hh, 0.03, 9000);
      cam.position.set(pos[0], pos[2], -pos[1]);
      cam.lookAt(target[0], target[2], -target[1]);
      renderer.setRenderTarget(null);
      renderer.setSize(W, Hh, false);
      renderer.render(model.scene, cam);
      const still = await toBlob(canvas);
      opts.onProgress?.(++done, total);
      await breathe();

      const [sx, sy] = model.stand(id);
      const f = model.focus.get(id)!;
      const heading = Math.atan2(f[0] - sx, f[1] - sy);
      let pano: Blob | undefined;
      if (opts.panos) {
        around.position.set(sx, EYE, -sy);
        around.update(renderer, model.scene);
        renderer.setRenderTarget(null);
        renderer.setSize(2048, 1024, false);
        (quad.material as THREE.ShaderMaterial).uniforms.heading.value = heading;
        renderer.render(flat, ortho);
        pano = await toBlob(canvas);
        opts.onProgress?.(++done, total);
        await breathe();
      }
      out.push({ id, still, w: W, h: Hh, pano, at: { x: sx, y: sy, heading } });
    }
  } finally {
    cube.dispose();
    quad.geometry.dispose();
    (quad.material as THREE.Material).dispose();
    model.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  return out;
}
