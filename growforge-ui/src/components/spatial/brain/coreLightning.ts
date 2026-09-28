import * as THREE from "three";

/**
 * Rare, thin lightning discharges from the nucleus surface into the near-core field - a restrained
 * sign that the core is alive. Only active while zoomed into BRAIN (`intensity` from the caller);
 * never in CORE / Missions, off under reduced motion. Each strike: jagged main path + one fork,
 * a bright flash, one re-strike flicker, then a fast decay (~0.4 s). At most MAX_BOLTS at once.
 */

const MAX_BOLTS = 2;
const MAIN_LEVELS = 5; // 2^5 = 32 segments
const FORK_LEVELS = 3; // 8 segments
const SEG_PER_BOLT = ((1 << MAIN_LEVELS) + (1 << FORK_LEVELS)) * 2; // x2: bright core line + faint offset pass (a hair thicker)
const DURATION = 0.42;

interface Bolt {
  t0: number;
  pts: THREE.Vector3[]; // main path
  fork: THREE.Vector3[];
  strikes: number;
}

function jagged(a: THREE.Vector3, b: THREE.Vector3, levels: number, amp: number): THREE.Vector3[] {
  let pts = [a.clone(), b.clone()];
  let disp = amp;
  const dir = new THREE.Vector3();
  const side = new THREE.Vector3();
  for (let l = 0; l < levels; l++) {
    const next: THREE.Vector3[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      dir.subVectors(q, p);
      side.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).cross(dir).normalize();
      const mid = p.clone().add(q).multiplyScalar(0.5).addScaledVector(side, (Math.random() * 2 - 1) * disp);
      next.push(mid, q);
    }
    pts = next;
    disp *= 0.55;
  }
  return pts;
}

export class CoreLightning {
  public readonly mesh: THREE.LineSegments;
  private geo: THREE.BufferGeometry;
  private pos: Float32Array;
  private col: Float32Array;
  private bolts: (Bolt | null)[] = new Array(MAX_BOLTS).fill(null);
  private nextStrike = 0;
  private strikes = 0;

  constructor(scene: THREE.Scene) {
    const verts = MAX_BOLTS * SEG_PER_BOLT * 2;
    this.pos = new Float32Array(verts * 3);
    this.col = new Float32Array(verts * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    this.mesh = new THREE.LineSegments(this.geo, mat);
    this.mesh.name = "CORE_LIGHTNING";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.raycast = () => {};
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  private spawn(now: number, nucleusR: number, slot: number) {
    const dir = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
    const start = dir.clone().multiplyScalar(nucleusR * 1.02);
    const reach = 32 + Math.random() * 48;
    const bend = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.9);
    const end = dir.clone().add(bend).normalize().multiplyScalar(nucleusR + reach);
    const pts = jagged(start, end, MAIN_LEVELS, reach * 0.22);
    const k = Math.floor(pts.length * (0.3 + Math.random() * 0.3));
    const forkEnd = pts[k].clone().add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(reach * 0.7));
    const fork = jagged(pts[k], forkEnd, FORK_LEVELS, reach * 0.12);
    this.bolts[slot] = { t0: now, pts, fork, strikes: 1 };
    this.strikes++;
  }

  /** `intensity` 0..1: how deep into BRAIN (0 = off). Strike cadence ~2.5-6 s at full intensity. */
  public update(now: number, intensity: number, nucleusR: number, reducedMotion: boolean) {
    const on = intensity > 0.3 && !reducedMotion;
    if (!on) {
      this.bolts.fill(null);
      this.mesh.visible = false;
      this.nextStrike = now + 1.5 + Math.random() * 2;
      return;
    }
    if (now >= this.nextStrike) {
      const slot = this.bolts.findIndex((b) => b === null);
      if (slot >= 0) this.spawn(now, nucleusR, slot);
      this.nextStrike = now + (2.5 + Math.random() * 3.5) / Math.max(0.5, intensity);
    }

    let any = false;
    this.col.fill(0);
    const writeBolt = (slot: number, b: Bolt, bright: number) => {
      let v = slot * SEG_PER_BOLT * 2;
      const put = (path: THREE.Vector3[], scale: number) => {
        for (let pass = 0; pass < 2; pass++) {
          const off = pass === 0 ? 0 : 0.7;
          const k = pass === 0 ? 1.7 : 0.45; // >1: whiter than the filaments (tone-mapped), restrained glow pass
          for (let i = 0; i < path.length - 1; i++) {
            const fade = 1 - 0.55 * (i / path.length); // brighter at the core end
            for (const p of [path[i], path[i + 1]]) {
              this.pos[v * 3] = p.x + off; this.pos[v * 3 + 1] = p.y + off; this.pos[v * 3 + 2] = p.z;
              const c = bright * scale * fade * k;
              this.col[v * 3] = 0.86 * c; this.col[v * 3 + 1] = 0.97 * c; this.col[v * 3 + 2] = 1.0 * c;
              v++;
            }
          }
        }
      };
      put(b.pts, 1.0);
      put(b.fork, 0.55);
    };
    this.bolts.forEach((b, slot) => {
      if (!b) return;
      const age = now - b.t0;
      if (age > DURATION) { this.bolts[slot] = null; return; }
      // flash, dip, one re-strike, decay
      const env = age < 0.05 ? 1 : age < 0.1 ? 0.25 : age < 0.14 ? 0.85 : Math.max(0, 0.85 * (1 - (age - 0.14) / (DURATION - 0.14)));
      if (age >= 0.1 && b.strikes === 1) {
        b.pts = b.pts.map((p, i) => (i === 0 || i === b.pts.length - 1 ? p : p.clone().addScalar((Math.random() - 0.5) * 1.6)));
        b.strikes = 2;
      }
      writeBolt(slot, b, env * intensity * 0.9);
      any = true;
    });
    this.mesh.visible = any;
    (this.geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
  }

  public debugInfo() {
    return { strikes: this.strikes, active: this.bolts.filter(Boolean).length };
  }

  public dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
