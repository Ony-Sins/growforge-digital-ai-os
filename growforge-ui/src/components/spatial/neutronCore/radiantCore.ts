import * as THREE from "three";

/**
 * RADIANT CORE (2026-09-30, prototype from the user's reference image: bright heart, dense wavy ring,
 * fine radiating rays with tip dots — "like the reference, without the tails, in 3D").
 *
 *  1. HEART  — a small, intense white-cyan glow with a tight cluster of bright points.
 *  2. RING   — a dense spherical shell of glowing particles whose radius undulates (petal-like waves).
 *              Seen from any angle its limb reads as the thick bright wavy ring of the reference.
 *  3. RAYS   — fine straight filaments radiating outward from the shell, fading along their length and
 *              ending in a bright dot; fainter inner rays connect the heart to the shell.
 *
 * Everything lives at a FIXED world size (no distance compensation), so it grows and shrinks naturally
 * and continuously as the camera scrolls in and out. Motion is slow and standing: rotation, breathing,
 * a gentle ripple along the shell. Purely visual — nothing here implies data or activity.
 */

export const RADIANT = {
  heartRadius: 13,
  shellRadius: 118,
  shellThickness: 9,
  shellPoints: 5500,
  outerRays: 900,
  innerRays: 260,
  heartPoints: 700,
};

const POINT_VERT = /* glsl */ `
  attribute float aBright;
  attribute float aSize;
  attribute vec3 aDir;       // unit direction from centre (for the shell ripple)
  attribute float aPhase;
  uniform float uTime;
  uniform float uPx;
  uniform float uReveal;
  uniform float uRipple;     // shell only
  uniform float uTextFade;   // 1 on CORE: soften particles behind the greeting text
  varying float vA;
  varying float vHot;
  void main() {
    vec3 p = position;
    // standing ripple on the shell: moves the surface in and out in place, never travels
    p += aDir * uRipple * sin(uTime * 0.6 + aPhase * 6.2831) * 1.6;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float twinkle = 0.78 + 0.22 * sin(uTime * (0.8 + aPhase) + aPhase * 40.0);
    vA = uReveal * aBright * twinkle;
    // variation: a minority of particles are bright sparks, most are faint dust
    vA *= aPhase > 0.86 ? 1.5 : 0.55;
    vA *= 1.0 - 0.7 * uTextFade * smoothstep(0.25, 0.55, gl_Position.y / gl_Position.w);
    vHot = aBright;
    // The STRUCTURE grows with scroll (fixed world size); individual particles stay fine, growing only
    // gently as the camera closes in, so up close the ring stays a delicate field instead of blobs.
    float closeness = pow(880.0 / max(-mv.z, 1.0), 0.3);
    gl_PointSize = clamp(aSize * uPx * 1.25 * closeness * closeness, 1.0 * uPx, 5.0 * uPx);
    vA *= mix(1.0, 0.85, smoothstep(1.0, 1.6, closeness)); // and dim slightly, keeping labels readable
  }
`;

const POINT_FRAG = /* glsl */ `
  varying float vA;
  varying float vHot;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float core = exp(-d * d * 9.0);
    float halo = exp(-d * 3.0) * 0.35;
    vec3 c = mix(vec3(0.18, 0.72, 1.0), vec3(0.88, 0.98, 1.0), clamp(vHot * core, 0.0, 1.0));
    float a = (core + halo) * vA * 1.6;
    gl_FragColor = vec4(c * a, a);
  }
`;

const RAY_VERT = /* glsl */ `
  attribute float aT;        // 0 at the ray's root, 1 at its tip
  attribute float aBright;
  uniform float uReveal;
  uniform float uTime;
  varying float vA;
  varying float vT;
  void main() {
    vT = aT;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float shimmer = 0.85 + 0.15 * sin(uTime * 0.5 + aBright * 31.0);
    vA = uReveal * aBright * shimmer;
  }
`;

const RAY_FRAG = /* glsl */ `
  varying float vA;
  varying float vT;
  void main() {
    // bright where it leaves the ring, fading toward the tip (the tip dot carries the end)
    float fade = mix(1.0, 0.18, smoothstep(0.0, 1.0, vT));
    vec3 c = vec3(0.30, 0.82, 1.0);
    float a = vA * fade;
    gl_FragColor = vec4(c * a, a);
  }
`;

let seed = 7;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const randDir = () => {
  const z = 2 * rnd() - 1;
  const t = rnd() * Math.PI * 2;
  const r = Math.sqrt(1 - z * z);
  return new THREE.Vector3(r * Math.cos(t), r * Math.sin(t), z);
};
/** Petal-like undulation of the shell radius, as a function of direction. */
const undulation = (d: THREE.Vector3) => {
  const theta = Math.atan2(d.y, d.x);
  const phi = Math.acos(THREE.MathUtils.clamp(d.z, -1, 1));
  return 1 + 0.085 * Math.sin(12 * theta) * Math.sin(phi) + 0.05 * Math.sin(7 * phi + 1.3);
};

export class RadiantCore {
  readonly group = new THREE.Group();
  private uTime = { value: 0 };
  private uPx = { value: 1 };
  private uReveal = { value: 1 };
  private uTextFade = { value: 1 };
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  private glowTex: THREE.CanvasTexture;
  private glow: THREE.Sprite;

  constructor(parent: THREE.Object3D) {
    seed = 7;
    // ---- points: heart cluster + shell + ray tips, one geometry per role for independent tuning
    const pointsOf = (build: (push: (p: THREE.Vector3, dir: THREE.Vector3, bright: number, size: number) => void) => void, ripple: number) => {
      const pos: number[] = [], dir: number[] = [], br: number[] = [], sz: number[] = [], ph: number[] = [];
      build((p, d, b, s) => {
        pos.push(p.x, p.y, p.z);
        dir.push(d.x, d.y, d.z);
        br.push(b);
        sz.push(s);
        ph.push(rnd());
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("aDir", new THREE.Float32BufferAttribute(dir, 3));
      g.setAttribute("aBright", new THREE.Float32BufferAttribute(br, 1));
      g.setAttribute("aSize", new THREE.Float32BufferAttribute(sz, 1));
      g.setAttribute("aPhase", new THREE.Float32BufferAttribute(ph, 1));
      const m = new THREE.ShaderMaterial({
        vertexShader: POINT_VERT,
        fragmentShader: POINT_FRAG,
        uniforms: { uTime: this.uTime, uPx: this.uPx, uReveal: this.uReveal, uRipple: { value: ripple }, uTextFade: this.uTextFade },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const pts = new THREE.Points(g, m);
      pts.frustumCulled = false;
      pts.raycast = () => {};
      this.geos.push(g);
      this.mats.push(m);
      return pts;
    };

    const heart = pointsOf((push) => {
      for (let i = 0; i < RADIANT.heartPoints; i++) {
        const d = randDir();
        const r = Math.pow(rnd(), 2.2) * RADIANT.heartRadius * 1.6;
        push(d.clone().multiplyScalar(r), d, 0.75 + 0.25 * rnd(), 1.4 + 1.4 * rnd());
      }
    }, 0);

    const shell = pointsOf((push) => {
      for (let i = 0; i < RADIANT.shellPoints; i++) {
        const d = randDir();
        // thickness biased toward the middle of the band so the ring reads dense, with a soft edge
        const off = (rnd() + rnd() + rnd() - 1.5) / 1.5;
        const r = RADIANT.shellRadius * undulation(d) + off * RADIANT.shellThickness;
        push(d.clone().multiplyScalar(r), d, 0.55 + 0.45 * Math.pow(rnd(), 1.5), 1.0 + 1.4 * rnd());
      }
    }, 1);

    // ---- rays
    const rayPos: number[] = [], rayT: number[] = [], rayB: number[] = [];
    const tipPts: { p: THREE.Vector3; d: THREE.Vector3; b: number }[] = [];
    for (let i = 0; i < RADIANT.outerRays; i++) {
      const d = randDir();
      const base = RADIANT.shellRadius * undulation(d) + RADIANT.shellThickness * 0.6;
      const len = 18 + Math.pow(rnd(), 1.6) * 78;
      const a = d.clone().multiplyScalar(base);
      const b = d.clone().multiplyScalar(base + len);
      const br = 0.14 + 0.28 * rnd();
      rayPos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      rayT.push(0, 1);
      rayB.push(br, br);
      tipPts.push({ p: b, d, b: 0.55 + 0.45 * rnd() });
    }
    for (let i = 0; i < RADIANT.innerRays; i++) {
      const d = randDir();
      const a = d.clone().multiplyScalar(RADIANT.heartRadius * 3.2);
      const b = d.clone().multiplyScalar(RADIANT.shellRadius * undulation(d) - RADIANT.shellThickness);
      const br = 0.06 + 0.12 * rnd();
      rayPos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      rayT.push(0, 1);
      rayB.push(br, br);
    }
    const rayGeo = new THREE.BufferGeometry();
    rayGeo.setAttribute("position", new THREE.Float32BufferAttribute(rayPos, 3));
    rayGeo.setAttribute("aT", new THREE.Float32BufferAttribute(rayT, 1));
    rayGeo.setAttribute("aBright", new THREE.Float32BufferAttribute(rayB, 1));
    const rayMat = new THREE.ShaderMaterial({
      vertexShader: RAY_VERT,
      fragmentShader: RAY_FRAG,
      uniforms: { uTime: this.uTime, uReveal: this.uReveal },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const rays = new THREE.LineSegments(rayGeo, rayMat);
    rays.frustumCulled = false;
    rays.raycast = () => {};
    this.geos.push(rayGeo);
    this.mats.push(rayMat);

    const tips = pointsOf((push) => {
      for (const t of tipPts) push(t.p, t.d, t.b, 1.6 + 1.2 * rnd());
    }, 0);

    // ---- heart glow (soft radial light, small: the reference's heart is compact, not a big blob)
    const cv = document.createElement("canvas");
    cv.width = cv.height = 256;
    const ctx = cv.getContext("2d");
    if (ctx) {
      const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, "rgba(235,252,255,1)");
      g.addColorStop(0.12, "rgba(140,230,255,0.85)");
      g.addColorStop(0.35, "rgba(40,170,255,0.28)");
      g.addColorStop(0.7, "rgba(10,80,190,0.06)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
    }
    this.glowTex = new THREE.CanvasTexture(cv);
    const glowMat = new THREE.SpriteMaterial({ map: this.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.mats.push(glowMat);
    this.glow = new THREE.Sprite(glowMat);
    this.glow.scale.setScalar(RADIANT.heartRadius * 7);
    this.glow.raycast = () => {};

    // heart points/glow not added: the stellar nucleus is the heart
    void heart;
    // rays + tip dots removed (user: long light streaks ruin the look)
    void rays; void tips;
    this.group.add(shell);
    this.group.name = "RADIANT_CORE";
    parent.add(this.group);
  }

  setPixelRatio(px: number) {
    this.uPx.value = px;
  }

  /** reveal: overall visibility 0..1. */
  update(elapsedSec: number, reveal: number, reducedMotion: boolean, textFade = 0) {
    this.uTextFade.value = textFade;
    const t = reducedMotion ? 0 : elapsedSec;
    this.uTime.value = t;
    this.uReveal.value = reveal;
    this.group.visible = reveal > 0.002;
    this.group.rotation.y = t * 0.035;
    this.group.rotation.x = Math.sin(t * 0.05) * 0.08;
    const breathe = 1 + 0.05 * Math.sin(t * 0.9);
    this.glow.scale.setScalar(RADIANT.heartRadius * 7 * breathe);
    this.glow.material.opacity = reveal * (0.85 + 0.15 * Math.sin(t * 0.9));
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.glowTex.dispose();
    this.group.parent?.remove(this.group);
  }
}
