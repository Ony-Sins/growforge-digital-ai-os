"use client";

import { useEffect, useRef } from "react";

interface CoreOrbFieldProps {
  zoom?: number;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260925);

// Dust stars kept far away from the central core
const DUST: { x: number; y: number; r: number; tw: number; sp: number }[] = [];
while (DUST.length < 380) {
  const x = rand();
  const y = rand();
  const dx = (x - 0.5) * 1.5;
  const dy = y - 0.48;
  if (Math.hypot(dx, dy) < 0.28) continue;
  DUST.push({
    x,
    y,
    r: 0.3 + Math.pow(rand(), 3) * 1.0,
    tw: rand() * 6.28,
    sp: 0.3 + rand() * 1.2,
  });
}

// 4 normalized hero stars placed unevenly across the UI, away from the core
const HERO_STARS = [
  { x: 0.26, y: 0.23, r: 2.8 },
  { x: 0.74, y: 0.28, r: 2.4 },
  { x: 0.15, y: 0.64, r: 2.3 },
  { x: 0.89, y: 0.84, r: 2.2 },
].map((s, i) => ({ ...s, ph: i * 1.7, sp: 0.5 + (i % 4) * 0.25 }));

const SPHERE_COUNT = 1800;
const SPHERE = Array.from({ length: SPHERE_COUNT }, (_, i) => {
  const y = 1 - (2 * (i + 0.5)) / SPHERE_COUNT;
  const rr = Math.sqrt(1 - y * y);
  const th = i * 2.399963229728653;
  const rad = 0.88 + 0.12 * Math.pow(rand(), 0.5);
  return { x: Math.cos(th) * rr, y, z: Math.sin(th) * rr, rad, s: 0.55 + rand() * 1.1 };
});

// Precompute neighbor connections for the glowing constellation mesh
const SPHERE_LINKS: [number, number][] = [];
for (let i = 0; i < SPHERE_COUNT; i += 2) {
  for (let j = i + 1; j < Math.min(i + 35, SPHERE_COUNT); j++) {
    const dx = SPHERE[i].x - SPHERE[j].x;
    const dy = SPHERE[i].y - SPHERE[j].y;
    const dz = SPHERE[i].z - SPHERE[j].z;
    const d = Math.hypot(dx, dy, dz);
    if (d > 0.05 && d < 0.135) {
      SPHERE_LINKS.push([i, j]);
      if (SPHERE_LINKS.length >= 480) break;
    }
  }
  if (SPHERE_LINKS.length >= 480) break;
}

// Layered realistic concentric horizontal particle rings around the core
const RING_DEFS = [
  { r: 1.45, spread: 0.05, ratio: 0.13, tilt: -0.07, n: 560, sp: 0.42 },
  { r: 1.82, spread: 0.07, ratio: 0.13, tilt: -0.07, n: 680, sp: 0.34 },
  { r: 2.25, spread: 0.09, ratio: 0.13, tilt: -0.07, n: 800, sp: 0.27 },
  { r: 2.78, spread: 0.11, ratio: 0.13, tilt: -0.07, n: 720, sp: 0.21 },
  { r: 3.35, spread: 0.14, ratio: 0.13, tilt: -0.07, n: 540, sp: 0.17 },
];
const RING = RING_DEFS.flatMap((d, band) =>
  Array.from({ length: d.n }, () => {
    const g = (rand() + rand() + rand() - 1.5) / 1.5;
    return { band, a0: rand() * Math.PI * 2, r: d.r + g * d.spread * 2, s: 0.5 + Math.pow(rand(), 2) * 1.7, o: 0.3 + rand() * 0.7 };
  }),
);

const BUCKETS = Array.from({ length: 10 }, (_, i) => `rgba(${170 + i * 8},${225 + i * 3},255,${(0.1 + i * 0.1).toFixed(2)})`);


export function CoreOrbField({ zoom = 0 }: CoreOrbFieldProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let boost = 0;
    let pointer = { x: -9999, y: -9999 };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const box = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = box.width;
      h = box.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      if (reduce) frame(0);
    };

    const onMove = (e: PointerEvent) => {
      const box = canvas.getBoundingClientRect();
      pointer = { x: e.clientX - box.left, y: e.clientY - box.top };
    };

    function glow(x: number, y: number, r: number, stops: [number, string][]) {
      const g = ctx!.createRadialGradient(x, y, 0, x, y, r);
      stops.forEach(([o, c]) => g.addColorStop(o, c));
      ctx!.fillStyle = g;
      ctx!.beginPath();
      ctx!.arc(x, y, r, 0, Math.PI * 2);
      ctx!.fill();
    }

    function frame(ms: number) {
      const c = ctx!;
      const t = ms / 1000;
      const z = zoomRef.current;
      const cx = w / 2;
      const cy = h * 0.48;
      const R = h * 0.096 * (1 + z * 1.35);

      const target = Math.max(0, Math.min(1, 1 - Math.hypot(pointer.x - cx, pointer.y - cy) / (R * 3.6)));
      boost += (target - boost) * 0.06;
      const b = boost;

      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = "high";
      c.globalCompositeOperation = "source-over";
      const bg = c.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#010206");
      bg.addColorStop(0.55, "#01040c");
      bg.addColorStop(1, "#010205");
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);

      // dust stars (distant, away from core)
      for (const s of DUST) {
        const a = (0.25 + 0.65 * (s.r / 1.3)) * (0.6 + 0.4 * Math.sin(t * s.sp + s.tw));
        c.fillStyle = `rgba(180,220,255,${a.toFixed(2)})`;
        c.beginPath();
        c.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        c.fill();
      }

      // normalized hero stars (no crosshair flare lines)
      for (const s of HERO_STARS) {
        const px = s.x * w;
        const py = s.y * h;
        const k = 0.82 + 0.18 * Math.sin(t * s.sp + s.ph);
        const r = s.r * k * (h / 900 + 0.35);
        glow(px, py, r * 8.5, [[0, "rgba(140,205,255,.28)"], [0.4, "rgba(60,130,240,.08)"], [1, "rgba(30,80,200,0)"]]);
        glow(px, py, r * 3.4, [[0, "rgba(255,255,255,1)"], [0.35, "rgba(190,235,255,.85)"], [0.8, "rgba(90,175,255,.25)"], [1, "rgba(60,140,255,0)"]]);
        glow(px, py, r * 1.2, [[0, "rgba(255,255,255,1)"], [1, "rgba(235,250,255,.95)"]]);
      }

      // cinematic vignette
      c.globalCompositeOperation = "source-over";
      const vig = c.createRadialGradient(cx, h * 0.5, h * 0.2, cx, h * 0.5, Math.max(w, h) * 0.75);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(0.5, "rgba(0,1,4,.3)");
      vig.addColorStop(1, "rgba(0,1,3,.92)");
      c.fillStyle = vig;
      c.fillRect(0, 0, w, h);

      // --- CENTRAL CORE & HORIZONTAL PARTICLE RING ---
      c.globalCompositeOperation = "lighter";
      const spin = reduce ? 0 : t;

      // 1. Broad Ambient Core Glow
      glow(cx, cy, R * 4.4, [[0, `rgba(20,110,240,${0.18 + b * 0.16})`], [0.5, "rgba(10,60,180,0.08)"], [1, "rgba(0,40,140,0)"]]);
      glow(cx, cy, R * 2.4, [[0, `rgba(60,180,255,${0.35 + b * 0.2})`], [0.6, "rgba(30,120,255,0.15)"], [1, "rgba(0,80,220,0)"]]);

      // 2. Horizontal Particle Ring (Back Half)
      const drawRing = (front: boolean) => {
        for (const p of RING) {
          const d = RING_DEFS[p.band];
          const a = p.a0 + spin * d.sp;
          const isFront = Math.sin(a) > 0;
          if (isFront !== front) continue;
          const px = Math.cos(a) * p.r * R;
          const py = Math.sin(a) * p.r * R * d.ratio;
          const ct = Math.cos(d.tilt);
          const st = Math.sin(d.tilt);
          const x = cx + px * ct - py * st;
          const y = cy + px * st + py * ct;
          const behind = !front && Math.abs(px) < R * 0.92 && d.ratio < 0.2;
          const al = p.o * (behind ? 0.2 : 1) * (0.8 + b * 0.45);
          c.fillStyle = BUCKETS[Math.min(9, Math.max(0, Math.floor(al * 10)))];
          c.fillRect(x - p.s / 2, y - p.s / 2, p.s, p.s);
        }
      };
      drawRing(false);

      // 3. Rotating Constellation Sphere Shell
      const ang = spin * 0.12;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);

      const sphereScreen: { x: number; y: number; z: number; al: number; s: number }[] = [];
      for (let i = 0; i < SPHERE_COUNT; i++) {
        const p = SPHERE[i];
        const sx = p.x * ca + p.z * sa;
        const sz = -p.x * sa + p.z * ca;
        const depth = (sz + 1) / 2;
        const limb = Math.hypot(sx, p.y);
        const al = (0.28 + 0.85 * depth * depth) * (0.6 + 0.65 * limb) * (0.95 + b * 0.35);
        sphereScreen.push({
          x: cx + sx * p.rad * R,
          y: cy + p.y * p.rad * R,
          z: sz,
          al,
          s: p.s * (0.7 + depth * 0.6),
        });
      }

      // Constellation lattice links
      c.lineWidth = 0.85;
      for (let k = 0; k < SPHERE_LINKS.length; k++) {
        const [i1, i2] = SPHERE_LINKS[k];
        const p1 = sphereScreen[i1];
        const p2 = sphereScreen[i2];
        if (p1.z > -0.3 || p2.z > -0.3) {
          const linkAlpha = Math.min(p1.al, p2.al) * 0.42;
          if (linkAlpha > 0.08) {
            c.strokeStyle = `rgba(100,215,255,${linkAlpha.toFixed(2)})`;
            c.beginPath();
            c.moveTo(p1.x, p1.y);
            c.lineTo(p2.x, p2.y);
            c.stroke();
          }
        }
      }

      // Sphere points
      for (let i = 0; i < SPHERE_COUNT; i++) {
        const p = sphereScreen[i];
        c.fillStyle = BUCKETS[Math.min(9, Math.max(0, Math.floor(p.al * 10)))];
        c.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
      }

      // Soft corona bloom around the sphere
      glow(cx, cy, R * 1.05, [[0, "rgba(255,255,255,0.45)"], [0.5, "rgba(80,205,255,0.3)"], [1, "rgba(30,120,255,0)"]]);

      // 4. Horizontal Particle Ring (Front Half)
      drawRing(true);

      // 5. Radiant Central White-Hot Core Star
      glow(cx, cy, R * 0.72, [[0, "rgba(255,255,255,1)"], [0.25, `rgba(180,240,255,${0.95 + b * 0.05})`], [0.6, `rgba(60,190,255,${0.65 + b * 0.2})`], [1, "rgba(0,100,255,0)"]]);
      glow(cx, cy, R * 0.36, [[0, "rgba(255,255,255,1)"], [0.75, "rgba(255,255,255,1)"], [1, "rgba(200,245,255,0.9)"]]);

      // Bright energy beads riding the horizontal rings
      [[0, 0.35], [2, 1.5], [4, 3.4]].forEach(([band, off]) => {
        const d = RING_DEFS[band];
        if (!d) return;
        const a = off + spin * d.sp;
        const px = Math.cos(a) * d.r * R;
        const py = Math.sin(a) * d.r * R * d.ratio;
        const ct = Math.cos(d.tilt);
        const st = Math.sin(d.tilt);
        glow(cx + px * ct - py * st, cy + px * st + py * ct, 6, [[0, "rgba(255,255,255,1)"], [0.4, "rgba(120,215,255,.7)"], [1, "rgba(60,160,255,0)"]]);
      });

      c.globalCompositeOperation = "source-over";
      if (!reduce) raf = requestAnimationFrame(frame);
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    window.addEventListener("pointermove", onMove);
    if (!reduce) raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />;
}
