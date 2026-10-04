import * as THREE from "three";

/**
 * BRAIN arrival nucleus as a LUMINOUS LATTICE (panel 3 of the approved storyboard, 2026-09-30 prototype).
 *
 *  - a geodesic wire shell around the (shrunken, still glowing) nucleus: clear strands, small junction sparks;
 *  - one clean connector from the shell to every REAL record (live positions, so drift / hold / glide carry).
 *
 * Strands are camera-facing ribbons (bright core, soft edge) rather than 1px lines: the previous hairline web
 * read as noise. Nothing here moves directionally; the shell only breathes and turns slowly.
 */

const RIBBON_VERT = /* glsl */ `
  attribute vec3 aA;
  attribute vec3 aB;
  attribute float aT;
  attribute float aSide;
  attribute float aWidth;
  attribute float aBright;
  uniform float uReveal;
  uniform float uTime;
  varying float vAcross;
  varying float vA;
  varying float vT;
  void main() {
    vec3 d = aB - aA;
    float len = length(d);
    vec3 dir = d / max(len, 1e-3);
    vec3 p = mix(aA, aB, aT);
    vec3 view = normalize(cameraPosition - p);
    vec3 across = normalize(cross(dir, view));
    // keep the ribbon's on-screen width sensible at any distance
    float w = min(aWidth, length(cameraPosition - p) * 0.008);
    p += across * aSide * w;
    vAcross = aSide;
    vT = aT;
    float breathe = 0.85 + 0.15 * sin(uTime * 0.6 + aBright * 40.0);
    vA = uReveal * aBright * breathe;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const RIBBON_FRAG = /* glsl */ `
  varying float vAcross;
  varying float vA;
  varying float vT;
  uniform vec3 uColor;
  void main() {
    float x = abs(vAcross);
    float core = exp(-x * x * 18.0);
    float glow = exp(-x * x * 3.0) * 0.35;
    // taper both ends slightly so connectors seat into their junctions
    float ends = smoothstep(0.0, 0.06, vT) * smoothstep(1.0, 0.94, vT);
    float a = (core + glow) * vA * mix(0.55, 1.0, ends);
    vec3 c = mix(uColor, vec3(0.92, 0.98, 1.0), core * 0.55);
    gl_FragColor = vec4(c * a, a);
  }
`;

const SPARK_VERT = /* glsl */ `
  attribute float aBright;
  uniform float uReveal;
  uniform float uTime;
  uniform float uPx;
  varying float vA;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec4 mv = viewMatrix * wp;
    gl_Position = projectionMatrix * mv;
    vA = uReveal * aBright * (0.7 + 0.3 * sin(uTime * 0.9 + aBright * 70.0));
    gl_PointSize = clamp(uPx * 900.0 / max(-mv.z, 1.0), 1.5 * uPx, 7.0 * uPx);
  }
`;

const SPARK_FRAG = /* glsl */ `
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float g = exp(-d * d * 6.0);
    gl_FragColor = vec4(vec3(0.85, 0.97, 1.0) * g * vA, g * vA);
  }
`;

/** Tunables. */
export const LATTICE_RADIUS = 36;
export const LATTICE_NODES = 150;
export const LATTICE_STRAND_WIDTH = 0.7;
export const SPOKE_WIDTH = 0.8;
export const LATTICE_BRIGHT = 1.1;
export const SPOKE_BRIGHT = 0.95;
/** Soft cyan glow filling the lattice (the storyboard's luminous centre). */
export const INNER_GLOW = 0.42;

class Ribbons {
  readonly geometry = new THREE.BufferGeometry();
  readonly mesh: THREE.Mesh;
  private a: Float32Array;
  private b: Float32Array;
  private w: Float32Array;
  private br: Float32Array;
  readonly capacity: number;
  private seg: number;

  constructor(capacity: number, segments: number, material: THREE.ShaderMaterial) {
    this.capacity = capacity;
    this.seg = segments;
    const vPer = (segments + 1) * 2;
    const n = capacity * vPer;
    this.a = new Float32Array(n * 3);
    this.b = new Float32Array(n * 3);
    this.w = new Float32Array(n);
    this.br = new Float32Array(n);
    const t = new Float32Array(n), side = new Float32Array(n);
    const idx: number[] = [];
    for (let r = 0; r < capacity; r++) {
      for (let s = 0; s <= segments; s++) {
        const v = r * vPer + s * 2;
        t[v] = t[v + 1] = s / segments;
        side[v] = -1;
        side[v + 1] = 1;
        if (s < segments) idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
    this.geometry.setIndex(idx);
    this.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.geometry.setAttribute("aA", new THREE.BufferAttribute(this.a, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("aB", new THREE.BufferAttribute(this.b, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("aT", new THREE.BufferAttribute(t, 1));
    this.geometry.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
    this.geometry.setAttribute("aWidth", new THREE.BufferAttribute(this.w, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("aBright", new THREE.BufferAttribute(this.br, 1).setUsage(THREE.DynamicDrawUsage));
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.raycast = () => {};
  }

  /** Write ribbon `r`; brightness 0 hides it. */
  set(r: number, a: THREE.Vector3, b: THREE.Vector3, width: number, bright: number) {
    const vPer = (this.seg + 1) * 2;
    for (let v = r * vPer; v < (r + 1) * vPer; v++) {
      this.a[v * 3] = a.x; this.a[v * 3 + 1] = a.y; this.a[v * 3 + 2] = a.z;
      this.b[v * 3] = b.x; this.b[v * 3 + 1] = b.y; this.b[v * 3 + 2] = b.z;
      this.w[v] = width;
      this.br[v] = bright;
    }
  }

  commit() {
    for (const k of ["aA", "aB", "aWidth", "aBright"]) (this.geometry.getAttribute(k) as THREE.BufferAttribute).needsUpdate = true;
  }
}

export interface LatticeRecord {
  id: string;
  world: THREE.Vector3;
  importance: number;
}

export class LatticeCore {
  readonly group = new THREE.Group();
  private shell = new THREE.Group();
  private uReveal = { value: 0 };
  private uTime = { value: 0 };
  private uPx = { value: 1 };
  private shellRibbons: Ribbons;
  private spokes: Ribbons;
  private sparkGeo = new THREE.BufferGeometry();
  private mats: THREE.ShaderMaterial[] = [];
  private nodes: THREE.Vector3[] = [];
  private edges: [number, number][] = [];
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private worldNode = new THREE.Vector3();
  private glow: THREE.Sprite;
  private endGeo = new THREE.BufferGeometry();
  private endPos: Float32Array;
  private endBright: Float32Array;
  private glowTex: THREE.CanvasTexture;

  constructor(parent: THREE.Object3D) {
    const ribbonMat = (color: THREE.Color) => {
      const m = new THREE.ShaderMaterial({
        vertexShader: RIBBON_VERT,
        fragmentShader: RIBBON_FRAG,
        uniforms: { uReveal: this.uReveal, uTime: this.uTime, uColor: { value: color } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      this.mats.push(m);
      return m;
    };

    // geodesic shell: Fibonacci nodes, each linked to its nearest few -> an even, triangulated lattice
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < LATTICE_NODES; i++) {
      const y = 1 - (i / (LATTICE_NODES - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = golden * i;
      // slight radial irregularity: organic, not a perfect geodesic ball
      const jitter = 1 + 0.07 * Math.sin(i * 12.9898) * Math.cos(i * 4.1414);
      this.nodes.push(new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r).multiplyScalar(LATTICE_RADIUS * jitter));
    }
    const seen = new Set<string>();
    this.nodes.forEach((p, i) => {
      const near = this.nodes.map((q, j) => [p.distanceToSquared(q), j] as [number, number]).filter(([, j]) => j !== i).sort((a, b) => a[0] - b[0]).slice(0, 4);
      for (const [, j] of near) {
        const k = i < j ? `${i}:${j}` : `${j}:${i}`;
        if (!seen.has(k)) { seen.add(k); this.edges.push([i, j]); }
      }
    });
    this.shellRibbons = new Ribbons(this.edges.length, 6, ribbonMat(new THREE.Color(0.35, 0.78, 1.0)));
    this.shellRibbons.mesh.renderOrder = 2;
    this.group.add(this.shellRibbons.mesh);

    // junction sparks on the shell
    const sp = new Float32Array(this.nodes.length * 3), sb = new Float32Array(this.nodes.length);
    this.nodes.forEach((p, i) => { sp.set([p.x, p.y, p.z], i * 3); sb[i] = 0.35 + 0.65 * ((i * 0.618) % 1); });
    this.sparkGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    this.sparkGeo.setAttribute("aBright", new THREE.BufferAttribute(sb, 1));
    const sparkMat = new THREE.ShaderMaterial({
      vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG,
      uniforms: { uReveal: this.uReveal, uTime: this.uTime, uPx: this.uPx },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.mats.push(sparkMat);
    const sparks = new THREE.Points(this.sparkGeo, sparkMat);
    sparks.frustumCulled = false;
    sparks.raycast = () => {};
    sparks.renderOrder = 3;
    this.shell.add(sparks);
    this.group.add(this.shell);

    this.spokes = new Ribbons(64, 10, ribbonMat(new THREE.Color(0.30, 0.72, 0.98)));
    // bright junction where each connector meets its real record
    this.endPos = new Float32Array(64 * 3);
    this.endBright = new Float32Array(64);
    this.endGeo.setAttribute("position", new THREE.BufferAttribute(this.endPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.endGeo.setAttribute("aBright", new THREE.BufferAttribute(this.endBright, 1).setUsage(THREE.DynamicDrawUsage));
    const ends = new THREE.Points(this.endGeo, sparkMat);
    ends.frustumCulled = false;
    ends.raycast = () => {};
    ends.renderOrder = 4;
    this.group.add(ends);
    this.spokes.mesh.renderOrder = 2;
    this.group.add(this.spokes.mesh);

    // inner glow: a soft radial sprite, so the centre reads as light rather than a dark hole
    const cv = document.createElement("canvas");
    cv.width = cv.height = 256;
    const ctx = cv.getContext("2d");
    if (ctx) {
      const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, "rgba(170,240,255,0.9)");
      g.addColorStop(0.25, "rgba(60,200,255,0.45)");
      g.addColorStop(0.6, "rgba(20,110,200,0.12)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
    }
    this.glowTex = new THREE.CanvasTexture(cv);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    this.glow.scale.setScalar(LATTICE_RADIUS * 2.6);
    this.glow.renderOrder = 1;
    this.group.add(this.glow);

    this.group.name = "BRAIN_LATTICE_CORE";
    this.group.visible = false;
    parent.add(this.group);
  }

  setPixelRatio(px: number) {
    this.uPx.value = px;
  }

  update(elapsedSec: number, reveal: number, records: LatticeRecord[]) {
    this.uTime.value = elapsedSec;
    this.uReveal.value = reveal;
    this.group.visible = reveal > 0.002;
    if (!this.group.visible) return;
    const breathe = 1 + 0.015 * Math.sin(elapsedSec * 0.7);
    this.glow.material.opacity = INNER_GLOW * reveal * (0.9 + 0.1 * Math.sin(elapsedSec * 0.7));
    this.shell.rotation.y = elapsedSec * 0.03;
    this.shell.scale.setScalar(breathe);
    this.shell.updateMatrixWorld();

    // shell strands follow the rotating shell (ribbons are world-space)
    this.edges.forEach(([i, j], r) => {
      this.tmpA.copy(this.nodes[i]).applyMatrix4(this.shell.matrixWorld);
      this.tmpB.copy(this.nodes[j]).applyMatrix4(this.shell.matrixWorld);
      this.shellRibbons.set(r, this.tmpA, this.tmpB, LATTICE_STRAND_WIDTH, LATTICE_BRIGHT);
    });
    this.shellRibbons.commit();

    // one connector per real record: from the shell node facing it, to the record itself
    for (let r = 0; r < this.spokes.capacity; r++) {
      const rec = records[r];
      if (!rec || rec.world.length() < LATTICE_RADIUS * 1.25) {
        this.spokes.set(r, this.tmpA.set(0, 0, 0), this.tmpA, 0, 0);
        this.endBright[r] = 0;
        continue;
      }
      this.endPos.set([rec.world.x, rec.world.y, rec.world.z], r * 3);
      this.endBright[r] = 1.6 + 0.8 * rec.importance;
      let best = 0, bestDot = -2;
      const dir = this.tmpB.copy(rec.world).normalize();
      this.nodes.forEach((n, i) => {
        this.worldNode.copy(n).applyMatrix4(this.shell.matrixWorld);
        const dd = this.worldNode.dot(dir);
        if (dd > bestDot) { bestDot = dd; best = i; }
      });
      this.worldNode.copy(this.nodes[best]).applyMatrix4(this.shell.matrixWorld);
      this.spokes.set(r, this.worldNode, rec.world, SPOKE_WIDTH * (0.8 + 0.4 * rec.importance), SPOKE_BRIGHT * (0.7 + 0.5 * rec.importance));
    }
    this.spokes.commit();
    (this.endGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.endGeo.getAttribute("aBright") as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.shellRibbons.geometry.dispose();
    this.spokes.geometry.dispose();
    this.sparkGeo.dispose();
    this.endGeo.dispose();
    this.glowTex.dispose();
    this.glow.material.dispose();
    for (const m of this.mats) m.dispose();
    this.group.parent?.remove(this.group);
  }
}
