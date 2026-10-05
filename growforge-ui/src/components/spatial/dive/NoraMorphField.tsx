"use client";

import { useEffect, useRef } from "react";
import { NORA_AUDIO_EVENT } from "@/lib/noraVisualSignal";
import type { InnerCorePhase } from "./overviewCommandModel";
import type { NoraStageLevel } from "./noraStageModel";
import { noraMorphParams, noraMorphState, type NoraMorphParams, type NoraMorphState } from "./noraMorphModel";
import styles from "./NoraStageField.module.css";

/**
 * NORA Morph Field. A procedural, asymmetrical neural filament topology that continuously deforms. It is deliberately
 * not a sphere, ring or orb and shares nothing with the CORE: a few anisotropic lobes plus trailing tendrils of nodes,
 * joined by filaments that fade in and out as the neighbourhood changes, with sparse white-hot intersections and a handful
 * of translucent membranes. Depth drives opacity and defocus; pointer position drives parallax. There is no uniform halo
 * and no whole-object scaling: every motion is local (per-node deformation, reach, flow, convergence, flattening).
 *
 * Inputs are only the stage `level` and NORA conversation `phase` (see noraMorphModel.ts); nothing drawn encodes a
 * count, rate or score. Reduced motion renders one procedural still frame.
 */

const TAU = Math.PI * 2;
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (rand: () => number) => { let s = 0; for (let i = 0; i < 4; i++) s += rand(); return (s - 2) * 1.7; };

interface Node { x: number; y: number; z: number; p: [number, number, number]; size: number; tw: number; tendril: boolean; }

/** Seeded asymmetric field: unequal lobes at different depths, and curved tendrils that leave the mass. */
function buildNodes(): Node[] {
  const rand = mulberry32(0x4d4f5250);
  const lobes: { c: [number, number, number]; r: [number, number, number]; n: number }[] = [
    { c: [-0.34, 0.04, 0.12], r: [0.5, 0.34, 0.38], n: 96 },
    { c: [0.3, -0.1, -0.18], r: [0.46, 0.3, 0.42], n: 80 },
    { c: [0.02, 0.27, 0.3], r: [0.3, 0.2, 0.28], n: 42 },
    { c: [0.66, 0.2, 0.08], r: [0.22, 0.14, 0.2], n: 26 },
    { c: [-0.82, -0.2, -0.2], r: [0.18, 0.13, 0.16], n: 16 },
    // dense hubs inside two lobes: selected regions of tighter filament density, so the mass has structure rather than an even spread
    { c: [-0.4, 0.06, 0.2], r: [0.22, 0.17, 0.2], n: 34 },
    { c: [0.34, -0.12, -0.08], r: [0.2, 0.15, 0.18], n: 28 },
  ];
  const nodes: Node[] = [];
  const mk = (x: number, y: number, z: number, tendril: boolean): Node => ({ x, y, z, p: [rand() * TAU, rand() * TAU, rand() * TAU], size: 0.7 + rand() * 0.8, tw: 0.4 + rand() * 0.9, tendril });
  for (const l of lobes) for (let i = 0; i < l.n; i++) nodes.push(mk(l.c[0] + gauss(rand) * l.r[0] * 0.5, l.c[1] + gauss(rand) * l.r[1] * 0.5, l.c[2] + gauss(rand) * l.r[2] * 0.5, false));
  const tendrils: { from: [number, number, number]; dir: [number, number, number]; bend: [number, number, number]; len: number; n: number }[] = [
    { from: [0.8, 0.22, 0.1], dir: [1, 0.25, 0.2], bend: [0, -0.5, 0.4], len: 0.55, n: 8 },
    { from: [-0.95, -0.2, -0.2], dir: [-1, -0.3, 0.1], bend: [0.1, 0.6, 0.3], len: 0.5, n: 7 },
    { from: [0.1, 0.45, 0.3], dir: [0.15, 1, -0.2], bend: [0.6, 0, 0.2], len: 0.4, n: 6 },
    { from: [0.4, -0.38, -0.2], dir: [0.3, -1, 0.3], bend: [-0.5, 0, 0.3], len: 0.42, n: 6 },
  ];
  for (const t of tendrils) for (let i = 0; i < t.n; i++) {
    const u = (i + 1) / t.n, d = Math.hypot(...t.dir);
    nodes.push(mk(
      t.from[0] + (t.dir[0] / d) * t.len * u + t.bend[0] * u * u * 0.9 + (rand() - 0.5) * 0.05,
      t.from[1] + (t.dir[1] / d) * t.len * u + t.bend[1] * u * u * 0.9 + (rand() - 0.5) * 0.05,
      t.from[2] + (t.dir[2] / d) * t.len * u + t.bend[2] * u * u * 0.9 + (rand() - 0.5) * 0.05, true));
  }
  return nodes;
}

/** Pre-rendered soft sprites: a hard dot, a defocused dot and a hot flare. Colour is set by tinting through globalAlpha. */
function sprite(kind: "sharp" | "soft" | "hot" | "warm"): HTMLCanvasElement {
  const s = 64, c = document.createElement("canvas"); c.width = c.height = s;
  const g = c.getContext("2d")!, r = s / 2;
  const rg = g.createRadialGradient(r, r, 0, r, r, r);
  if (kind === "sharp") { rg.addColorStop(0, "rgba(214,242,252,1)"); rg.addColorStop(0.28, "rgba(150,214,238,.9)"); rg.addColorStop(0.55, "rgba(90,170,210,.18)"); rg.addColorStop(1, "rgba(60,140,190,0)"); }
  else if (kind === "soft") { rg.addColorStop(0, "rgba(150,214,238,.55)"); rg.addColorStop(0.5, "rgba(90,170,210,.16)"); rg.addColorStop(1, "rgba(60,140,190,0)"); }
  else if (kind === "hot") { rg.addColorStop(0, "rgba(255,255,255,1)"); rg.addColorStop(0.14, "rgba(236,250,255,.98)"); rg.addColorStop(0.34, "rgba(150,222,248,.38)"); rg.addColorStop(0.7, "rgba(70,160,210,.07)"); rg.addColorStop(1, "rgba(60,140,190,0)"); }
  else { rg.addColorStop(0, "rgba(255,236,196,.95)"); rg.addColorStop(0.3, "rgba(222,184,118,.55)"); rg.addColorStop(1, "rgba(200,150,80,0)"); }
  g.fillStyle = rg; g.fillRect(0, 0, s, s);
  return c;
}

const KEYS: (keyof NoraMorphParams)[] = ["amp", "speed", "reach", "flow", "hot", "converge", "flat", "lean", "wave", "warm", "energy"];

export function NoraMorphField({ level, phase, onWake, forceState }: { level: NoraStageLevel; phase: InnerCorePhase; onWake: () => void; forceState?: NoraMorphState }) {
  const host = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ level, phase, forceState });
  const audio = useRef(0);
  const redraw = useRef<(() => void) | null>(null);
  const recoil = useRef<{ x: number; y: number; t: number } | null>(null);
  const pointer = useRef({ tx: 0, ty: 0, x: 0, y: 0, ta: 0, act: 0 });
  useEffect(() => { stateRef.current = { level, phase, forceState }; redraw.current?.(); }, [level, phase, forceState]);
  useEffect(() => {
    const onAudio = (event: Event) => { const e = (event as CustomEvent<{ energy?: number }>).detail?.energy; audio.current = typeof e === "number" ? Math.max(0, Math.min(1, e)) : 0; };
    window.addEventListener(NORA_AUDIO_EVENT, onAudio);
    return () => window.removeEventListener(NORA_AUDIO_EVENT, onAudio);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current, hostEl = host.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !hostEl || !ctx) { if (hostEl) hostEl.dataset.renderer = "unavailable"; return; }
    hostEl.dataset.renderer = "morph-canvas2d";
    const nodes = buildNodes();
    const N = nodes.length;
    const sprites = { sharp: sprite("sharp"), soft: sprite("soft"), hot: sprite("hot"), warm: sprite("warm") };
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = motionQuery.matches;
    let w = 0, h = 0, dpr = 1, raf = 0, last = 0, t = 0, frameNo = 0, frameDt = 0.016;
    const resolve = () => noraMorphParams(stateRef.current.forceState ?? noraMorphState(stateRef.current.level, stateRef.current.phase), stateRef.current.level);
    const live: NoraMorphParams = { ...resolve() };
    // projected positions, rebuilt each frame
    const X = new Float32Array(N), Y = new Float32Array(N), Z = new Float32Array(N), SX = new Float32Array(N), SY = new Float32Array(N), SC = new Float32Array(N);
    // render-only: how close each node is to the two main hubs, and a slowly eased "heat" that decides which intersections become hotspots
    const hubW = new Float32Array(N), heat = new Float32Array(N);
    const hubWeight = (x: number, y: number, z: number) => Math.max(Math.exp(-(((x + 0.4) ** 2) / 0.05 + ((y - 0.06) ** 2) / 0.04 + ((z - 0.2) ** 2) / 0.05)), Math.exp(-(((x - 0.34) ** 2) / 0.05 + ((y + 0.12) ** 2) / 0.04 + ((z + 0.08) ** 2) / 0.05)));
    // edge strengths ease in and out so topology changes read as growth, not flicker
    const edges = new Map<number, number>();
    let present = new Set<number>();
    let hotSet: number[] = [];
    let tris: [number, number, number][] = [];
    let flowEdges: number[] = [];
    const focus = 12; // retrieval gathers toward one anchor node inside the first lobe
    const attentionNodes = [3, 41, 77, 118, 160];

    const resize = () => {
      const r = hostEl.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, Math.round(r.width)); h = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    };

    function topology() {
      const reach2 = live.reach * live.reach;
      present = new Set();
      const deg = new Uint8Array(N);
      for (let i = 0; i < N; i++) {
        let b1 = -1, b2 = -1, b3 = -1, d1 = reach2, d2 = reach2, d3 = reach2;
        for (let j = 0; j < N; j++) {
          if (j === i) continue;
          const dx = X[i] - X[j], dy = Y[i] - Y[j], dz = Z[i] - Z[j], d = dx * dx + dy * dy + dz * dz;
          if (d >= d3) continue;
          if (d < d1) { b3 = b2; d3 = d2; b2 = b1; d2 = d1; b1 = j; d1 = d; }
          else if (d < d2) { b3 = b2; d3 = d2; b2 = j; d2 = d; }
          else { b3 = j; d3 = d; }
        }
        for (const j of [b1, b2, b3]) if (j >= 0) { const key = i < j ? i * N + j : j * N + i; if (!present.has(key)) { present.add(key); deg[i]++; deg[j]++; } }
      }
      // sparse white-hot intersections: highest-degree nodes, capped by state
      hotSet = Array.from({ length: N }, (_, i) => i).filter((i) => deg[i] >= 4).sort((a, b) => deg[b] - deg[a] || a - b).slice(0, Math.round(live.hot));
      // translucent membranes: triangles whose three sides are all present
      const adj = new Map<number, Set<number>>();
      for (const key of present) { const a = Math.floor(key / N), b = key % N; (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b); (adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a); }
      const found: [number, number, number][] = [];
      for (const key of present) {
        const a = Math.floor(key / N), b = key % N;
        for (const c of adj.get(a)!) if (c > b && adj.get(b)?.has(c)) found.push([a, b, c]);
        if (found.length > 220) break;
      }
      // keep a stable spread of membranes, not the first ones found
      // membranes concentrate around the two hubs (richer there), with a few elsewhere so the rest of the web keeps its negative space
      const hubTri = (t3: [number, number, number]) => (hubW[t3[0]] + hubW[t3[1]] + hubW[t3[2]]) / 3;
      const near = found.filter((t3) => hubTri(t3) > 0.3), far = found.filter((t3) => hubTri(t3) <= 0.3);
      const pick = (list: [number, number, number][], n: number) => list.filter((_, i) => i % Math.max(1, Math.floor(list.length / n)) === 0).slice(0, n);
      tris = [...pick(near, 46), ...pick(far, 10)];
      flowEdges = Array.from(present);
    }

    function draw() {
      const c = ctx!;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.globalCompositeOperation = "source-over"; c.globalAlpha = 1;
      c.clearRect(0, 0, w, h);
      if (reduced) Object.assign(live, resolve());
      const S = Math.min(w * (w < 520 ? 0.27 : 0.335), h * 0.68), cx = w * 0.47, cy = h * 0.5;
      const e = live.energy;
      const speed = live.speed, tt = t * speed;
      // parallax: the camera leans toward the pointer, slowly
      const yaw = 0.42 * Math.sin(t * 0.045) + pointer.current.x * 0.3, pitch = -0.2 + pointer.current.y * 0.16 + 0.06 * Math.sin(t * 0.037);
      const cyw = Math.cos(yaw), syw = Math.sin(yaw), cpt = Math.cos(pitch), spt = Math.sin(pitch);
      const au = audio.current;
      const act = pointer.current.act, ptx = (pointer.current.x * 0.5 + 0.5) * w, pty = (pointer.current.y * 0.5 + 0.5) * h, rr2 = (S * 0.34) * (S * 0.34);
      const lift = (px: number, py: number) => act > 0.01 ? act * Math.exp(-(((px - ptx) ** 2 + (py - pty) ** 2) / rr2)) : 0;
      const f = 3.4;
      const fx = nodes[focus], fxd = 0.5 + 0.5 * Math.sin(t * 0.3);
      for (let i = 0; i < N; i++) {
        const n = nodes[i];
        // spatially coherent flow: neighbouring nodes move together, so the topology bends rather than jitters
        let x = n.x + live.amp * Math.sin(tt * 0.31 + n.y * 2.3 + n.p[0]) + live.amp * 0.5 * Math.sin(tt * 0.53 + n.z * 3.1 + n.p[1]);
        let y = n.y + live.amp * 0.8 * Math.sin(tt * 0.27 + n.z * 2.1 + n.p[1]) + live.amp * 0.4 * Math.sin(tt * 0.61 + n.x * 2.7 + n.p[2]);
        let z = n.z + live.amp * Math.sin(tt * 0.23 + n.x * 2.5 + n.p[2]);
        if (live.converge > 0) { const k = live.converge * (0.55 + 0.25 * fxd); x += (fx.x - x) * k; y += (fx.y - y) * k; z += (fx.z - z) * k; }
        if (live.flat > 0) z *= 1 - live.flat;
        if (live.wave > 0) { const a = live.wave * (0.4 + au * 1.6); y += a * Math.sin(x * 5.5 - t * 2.4 + n.p[0] * 0.5); }
        z += live.lean * (0.5 - (n.x + 1) * 0.25);
        // yaw then pitch
        const x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw;
        const y2 = y * cpt - z1 * spt, z2 = y * spt + z1 * cpt;
        X[i] = x; Y[i] = y; Z[i] = z; // pre-rotation positions drive topology (stable under camera motion)
        hubW[i] = hubWeight(x, y, z);
        const sc = f / (f - z2);
        // layered parallax: near nodes follow the pointer further than far ones, so the depth planes visibly separate
        SX[i] = cx + x1 * sc * S + pointer.current.x * z2 * S * 0.09; SY[i] = cy + y2 * sc * S + pointer.current.y * z2 * S * 0.06; SC[i] = sc; Z[i] = z;
        (nodes[i] as Node & { zc?: number }).zc = z2;
      }
      // soft click recoil: a local, damped push away from the contact point, never a whole-object scale
      const rc = recoil.current;
      if (rc) {
        const age = t - rc.t;
        if (age > 2.2) recoil.current = null;
        else for (let i = 0; i < N; i++) {
          const dx = SX[i] - rc.x, dy = SY[i] - rc.y, d = Math.hypot(dx, dy) || 1;
          const push = Math.exp(-d / (S * 0.5)) * Math.exp(-age * 2.6) * Math.cos(age * 9) * S * 0.055;
          SX[i] += (dx / d) * push; SY[i] += (dy / d) * push;
        }
      }
      if (frameNo % 3 === 0 || reduced) topology();
      frameNo++;
      for (const key of present) edges.set(key, Math.min(1, (edges.get(key) ?? 0) + 0.12));
      for (const [key, s] of edges) if (!present.has(key)) { const ns = s - 0.07; if (ns <= 0.02) edges.delete(key); else edges.set(key, ns); }

      // soft environmental spill: the brightest intersections lightly illuminate the air around them (additive, very low alpha, no edge)
      c.globalCompositeOperation = "lighter";
      for (let hi = 0; hi < N; hi++) {
        if (heat[hi] < 0.06) continue;
        const rr = S * (0.26 + heat[hi] * 0.3), g = c.createRadialGradient(SX[hi], SY[hi], 0, SX[hi], SY[hi], rr);
        g.addColorStop(0, `rgba(86,170,214,${0.1 * heat[hi] * e})`); g.addColorStop(0.5, `rgba(44,108,158,${0.035 * heat[hi] * e})`); g.addColorStop(1, "rgba(20,60,100,0)");
        c.fillStyle = g; c.fillRect(SX[hi] - rr, SY[hi] - rr, rr * 2, rr * 2);
      }

      // body: a very dark, slightly lifted translucent mass behind the filaments (no outline, no halo)
      c.globalCompositeOperation = "source-over";
      for (const [lx, ly, lz, r] of [[-0.34, 0.04, 0.12, 0.62], [0.3, -0.1, -0.18, 0.56], [0.02, 0.27, 0.3, 0.38]] as const) {
        const x1 = lx * cyw + lz * syw, z1 = -lx * syw + lz * cyw, y2 = ly * cpt - z1 * spt;
        const px = cx + x1 * S * 1.02, py = cy + y2 * S * 1.02, rr = r * S;
        const g = c.createRadialGradient(px, py, 0, px, py, rr);
        g.addColorStop(0, `rgba(34,84,108,${0.52 * e})`); g.addColorStop(0.6, `rgba(14,40,56,${0.3 * e})`); g.addColorStop(1, "rgba(2,10,16,0)");
        c.fillStyle = g; c.fillRect(px - rr, py - rr, rr * 2, rr * 2);
      }

      // membranes: Fresnel-weighted (edge-on facets catch light), faint specular streak on the facing edge
      const zc = (i: number) => (nodes[i] as Node & { zc?: number }).zc ?? 0;
      for (const [a, b, d] of tris) {
        const sa = edges.get(a < b ? a * N + b : b * N + a) ?? 0, sb = edges.get(b < d ? b * N + d : d * N + b) ?? 0, sd = edges.get(a < d ? a * N + d : d * N + a) ?? 0;
        const vis = Math.min(sa, sb, sd); if (vis < 0.2) continue;
        const ux = SX[b] - SX[a], uy = SY[b] - SY[a], vx = SX[d] - SX[a], vy = SY[d] - SY[a];
        const area = Math.abs(ux * vy - uy * vx) / (S * S);
        const dz1 = zc(b) - zc(a), dz2 = zc(d) - zc(a);
        const nl = Math.hypot(ux * vy - uy * vx, (uy * dz2 - dz1 * vy) * S, (dz1 * vx - ux * dz2) * S) || 1;
        const facing = Math.abs((ux * vy - uy * vx)) / nl; // 1 = facing the viewer
        const fres = Math.pow(1 - Math.min(1, facing), 2);
        const depth = 1 / (1 + Math.max(0, 0.5 - (zc(a) + zc(b) + zc(d)) / 3) * 1.2);
        const hubTri = (hubW[a] + hubW[b] + hubW[d]) / 3;
        const alpha = Math.min(0.66, (0.07 + fres * 0.4 + Math.min(area, 0.02) * 3.6) * (1 + hubTri * 0.9)) * vis * depth * e;
        c.fillStyle = `rgba(110,190,222,${alpha})`;
        c.beginPath(); c.moveTo(SX[a], SY[a]); c.lineTo(SX[b], SY[b]); c.lineTo(SX[d], SY[d]); c.closePath(); c.fill();
        if (hubTri > 0.35 && fres > 0.25) { c.fillStyle = `rgba(190,232,248,${alpha * 0.32})`; c.fill(); }
        if (fres > 0.5) { c.strokeStyle = `rgba(210,240,252,${0.26 * fres * vis * depth * e})`; c.lineWidth = 0.7; c.beginPath(); c.moveTo(SX[a], SY[a]); c.lineTo(SX[b], SY[b]); c.stroke(); }
      }

      // filaments: cold cyan-white, opacity from depth and strength; thin enough that the topology reads
      const warmEdge = (i: number, j: number) => live.warm > 0.02 && (attentionNodes.includes(i) || attentionNodes.includes(j));
      c.lineCap = "round";
      for (const [key, s] of edges) {
        const i = Math.floor(key / N), j = key % N;
        const depth = 1 / (1 + Math.max(0, 0.45 - (zc(i) + zc(j)) / 2) * 3.4);
        const hubE = 1 + ((hubW[i] + hubW[j]) / 2) * 0.55;
        // a slow ambient shimmer moves through the web (brightness only; it is not a travelling pulse and claims no activity)
        const near = 1 + Math.max(0, (zc(i) + zc(j)) / 2 - 0.2) * 0.9;
        const a = s * depth * e * near * hubE * (0.84 + 0.16 * Math.sin(t * 0.55 + (SX[i] + SY[j]) * 0.011)) * (1 + 1.1 * lift((SX[i] + SX[j]) / 2, (SY[i] + SY[j]) / 2));
        const warm = warmEdge(i, j);
        c.strokeStyle = warm ? `rgba(214,178,116,${Math.min(0.55, a * 0.7 * Math.min(1, live.warm))})` : `rgba(150,214,238,${Math.min(0.62, a * 0.5)})`;
        c.lineWidth = (0.5 + 0.7 * ((SC[i] + SC[j]) * 0.5 - 0.8)) * (warm ? 1.1 : 1) * (0.8 + 0.2 * Math.min(1, depth * 1.6));
        c.beginPath(); c.moveTo(SX[i], SY[i]); c.lineTo(SX[j], SY[j]); c.stroke();
      }

      // light travelling along filaments, only in states that mean activity
      if (live.flow > 0.02 && flowEdges.length) {
        c.globalCompositeOperation = "lighter";
        const count = Math.round(26 * live.flow);
        for (let k = 0; k < count; k++) {
          const key = flowEdges[(k * 37 + 11) % flowEdges.length], i = Math.floor(key / N), j = key % N;
          const u = ((t * (0.18 + (k % 5) * 0.05) + k * 0.37) % 1);
          const px = SX[i] + (SX[j] - SX[i]) * u, py = SY[i] + (SY[j] - SY[i]) * u;
          const fade = Math.sin(u * Math.PI) * (edges.get(key) ?? 0);
          c.globalAlpha = 0.85 * fade * e; const r = 6;
          c.drawImage(sprites.sharp, px - r, py - r, r * 2, r * 2);
        }
        c.globalAlpha = 1;
      }

      // nodes, far to near, with defocus: only the focal band is crisp, out-of-focus nodes bloom soft and dim
      const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => zc(a) - zc(b));
      const hotRank = new Map(hotSet.map((v, k) => [v, k] as const));
      c.globalCompositeOperation = "lighter";
      for (const i of order) {
        const n = nodes[i];
        const blur = Math.min(1, Math.abs(zc(i) - 0.1) / 0.8);
        const depth = 1 / (1 + Math.max(0, 0.45 - zc(i)) * 1.4);
        const twinkle = 0.78 + 0.22 * Math.sin(t * n.tw + n.p[1]);
        const warm = live.warm > 0.02 && attentionNodes.includes(i);
        const rank = hotRank.get(i);
        heat[i] += ((rank === undefined ? 0 : rank < 3 ? 1 : 0.32) - heat[i]) * (reduced ? 1 : 1 - Math.exp(-frameDt * 2.2)); // slow ease: hotspots do not flicker as the topology shifts
        const lf = lift(SX[i], SY[i]);
        const r = (1.5 + n.size * 1.1) * SC[i] * (1 + blur * 1.8) * (1 + lf * 0.3);
        if (blur > 0.45) { c.globalAlpha = Math.min(0.5, 0.45 * depth * e * twinkle * (1 - blur * 0.3)); c.drawImage(sprites.soft, SX[i] - r * 2.2, SY[i] - r * 2.2, r * 4.4, r * 4.4); }
        else { c.globalAlpha = Math.min(1, 0.75 * depth * e * twinkle * (1 + lf * 0.7)); c.drawImage(warm ? sprites.warm : sprites.sharp, SX[i] - r * 1.6, SY[i] - r * 1.6, r * 3.2, r * 3.2); }
        if (heat[i] > 0.05 && blur < 0.85) {
          const hr = (11.5 + n.size * 6.5) * SC[i] * (0.8 + heat[i] * 1.6);
          c.globalAlpha = Math.min(1, (0.5 + 0.5 * Math.sin(t * 0.9 * n.tw + n.p[2]) ** 2) * depth * e * (0.3 + heat[i] * 0.95));
          c.drawImage(sprites.hot, SX[i] - hr, SY[i] - hr, hr * 2, hr * 2);
          if (heat[i] > 0.6) { const cr = (3.2 + n.size * 1.4) * SC[i]; c.globalAlpha = Math.min(1, heat[i] * depth * e); c.drawImage(sprites.hot, SX[i] - cr, SY[i] - cr, cr * 2, cr * 2); }
        }
      }
      c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
    }

    const ro = new ResizeObserver(() => { resize(); draw(); });
    ro.observe(hostEl);
    resize();

    const onMove = (ev: PointerEvent) => {
      const r = hostEl.getBoundingClientRect();
      pointer.current.tx = ((ev.clientX - r.left) / r.width - 0.5) * 2; pointer.current.ty = ((ev.clientY - r.top) / r.height - 0.5) * 2; pointer.current.ta = 1;
    };
    const onLeave = () => { pointer.current.tx = 0; pointer.current.ty = 0; pointer.current.ta = 0; };
    const onClick = (ev: MouseEvent) => { const r = hostEl.getBoundingClientRect(); recoil.current = { x: ev.clientX - r.left, y: ev.clientY - r.top, t }; if (reduced) draw(); };
    hostEl.addEventListener("pointermove", onMove); hostEl.addEventListener("pointerleave", onLeave); hostEl.addEventListener("click", onClick);

    const frame = (now: number) => {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now; t += dt; frameDt = dt || 0.016;
      const goal = resolve();
      const k = 1 - Math.exp(-dt * 1.8);
      for (const key of KEYS) live[key] += (goal[key] - live[key]) * k;
      const pk = 1 - Math.exp(-dt * 3);
      pointer.current.x += (pointer.current.tx - pointer.current.x) * pk; pointer.current.y += (pointer.current.ty - pointer.current.y) * pk; pointer.current.act += (pointer.current.ta - pointer.current.act) * (1 - Math.exp(-dt * 4));
      draw();
      raf = requestAnimationFrame(frame);
    };
    redraw.current = draw;
    const start = () => {
      cancelAnimationFrame(raf); last = 0;
      if (reduced) { t = 8; draw(); }
      else if (!document.hidden) raf = requestAnimationFrame(frame);
    };
    const onMotion = () => { reduced = motionQuery.matches; start(); };
    const onVisibility = () => start();
    motionQuery.addEventListener("change", onMotion);
    document.addEventListener("visibilitychange", onVisibility);
    start();
    return () => {
      redraw.current = null; cancelAnimationFrame(raf); ro.disconnect();
      hostEl.removeEventListener("pointermove", onMove); hostEl.removeEventListener("pointerleave", onLeave); hostEl.removeEventListener("click", onClick);
      motionQuery.removeEventListener("change", onMotion); document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const state = forceState ?? noraMorphState(level, phase);
  return (
    <button ref={host} type="button" className={styles.field} onClick={onWake} aria-label="Open NORA" data-nora-stage-field data-nora-morph-field data-level={level} data-state={state}>
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
    </button>
  );
}
