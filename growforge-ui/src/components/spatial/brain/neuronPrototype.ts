import * as THREE from "three";
import { hash01 } from "../neutronCore/coreParticleField";

/**
 * VISUAL PROTOTYPE (awaiting approval before it is applied across the network).
 *
 * One real, recorded pair of records (a hub and the record it is really linked to) drawn as living
 * neural tissue instead of a flat line between two dots:
 *   - each junction is a SOMA: an irregular, translucent body whose surface flows out into tapered,
 *     branching dendrites, with a small luminous nucleus inside;
 *   - the relation is an AXON: a translucent tube with an inner light thread, a few fine branching
 *     filaments, and a standing (non-travelling) plasma texture. It never implies data transfer.
 * Reference: the approved neuron photograph (luminous junctions, glassy cords, dark space between).
 *
 * The prototype rides the records' live world positions, so drift, hold/release and elastic glide all
 * carry over unchanged. It is revealed only with depth and camera proximity, so BRAIN arrival and the
 * rest of the field look exactly as before. It is not pickable (raycast disabled): labels and the
 * screen-space hit test keep owning interaction.
 */

const MEMBRANE_VERT = /* glsl */ `
  attribute float aT;     // 0 at the root of a strand, 1 at its tip (soma: 0)
  attribute float aSeed;
  uniform float uTime;
  varying vec3 vN;
  varying vec3 vView;
  varying float vT;
  varying float vSeed;
  varying vec3 vLocal;
  void main() {
    vT = aT;
    vSeed = aSeed;
    vLocal = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const MEMBRANE_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uReveal;
  uniform float uCore;     // inner light thread seen through the wall (axon / dendrites)
  uniform float uSkin;     // translucent membrane: brightest where the view grazes the wall
  uniform float uNucleus;  // soma: luminous interior mass
  varying vec3 vN;
  varying vec3 vView;
  varying float vT;
  varying float vSeed;
  varying vec3 vLocal;
  void main() {
    float ndv = abs(dot(normalize(vN), normalize(vView)));
    float rim = pow(1.0 - ndv, 2.2);
    // a tight bright thread plus a softer glow filling the fibre, so a process near the lens reads as
    // luminous tissue rather than a hollow pipe
    float core = pow(ndv, 7.0) + 0.35 * pow(ndv, 2.0);
    // fibrous surface streaks (static in space) modulated by a slow in-place breath: standing plasma,
    // never a pattern that moves along the strand, so it cannot read as data transfer
    float fib = 0.5 + 0.5 * sin(dot(vLocal, vec3(1.7, 2.3, 1.1)) * 2.4 + vSeed * 40.0 + vT * 26.0);
    float breathe = 0.65 + 0.35 * sin(uTime * 0.8 + vSeed * 23.0);
    float plasma = fib * breathe;
    float tipFade = 1.0 - smoothstep(0.45, 1.0, vT);
    vec3 deep = vec3(0.06, 0.34, 0.66);
    vec3 ice = vec3(0.52, 0.84, 1.0);
    vec3 white = vec3(0.80, 0.95, 1.0);
    // pure emission (additive): no alpha re-multiply, so the tissue glows instead of going grey
    vec3 e = mix(deep, ice, rim) * rim * uSkin;
    e += deep * (0.10 + 0.22 * plasma) * uSkin;
    e += white * core * uCore * (0.6 + 0.4 * plasma);
    e += mix(ice, white, ndv) * uNucleus * pow(ndv, 1.6) * (0.85 + 0.15 * breathe);
    gl_FragColor = vec4(e * uReveal * tipFade, 1.0);
  }
`;

/** A tube following a centreline, with a radius profile; rebuilt into preallocated buffers. */
class Strand {
  readonly geometry = new THREE.BufferGeometry();
  private pos: Float32Array;
  private nrm: Float32Array;
  constructor(private segments: number, private radial: number, seed: number) {
    const rings = segments + 1;
    const n = rings * (radial + 1);
    this.pos = new Float32Array(n * 3);
    this.nrm = new Float32Array(n * 3);
    const t = new Float32Array(n);
    const sd = new Float32Array(n).fill(seed);
    for (let i = 0; i < rings; i++) for (let j = 0; j <= radial; j++) t[i * (radial + 1) + j] = i / segments;
    const idx: number[] = [];
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < radial; j++) {
        const a = i * (radial + 1) + j;
        const b = a + radial + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    this.geometry.setIndex(idx);
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("normal", new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("aT", new THREE.BufferAttribute(t, 1));
    this.geometry.setAttribute("aSeed", new THREE.BufferAttribute(sd, 1));
  }

  private tan = new THREE.Vector3();
  private nor = new THREE.Vector3();
  private bin = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  /** centre(u) and radius(u) for u in [0,1]. Parallel-transport frames keep the tube from twisting. */
  build(centre: (u: number, out: THREE.Vector3) => void, radius: (u: number) => number) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= this.segments; i++) {
      const p = new THREE.Vector3();
      centre(i / this.segments, p);
      pts.push(p);
    }
    const tan = this.tan, nor = this.nor, bin = this.bin, tmp = this.tmp;
    tan.subVectors(pts[1], pts[0]).normalize();
    tmp.set(Math.abs(tan.y) < 0.9 ? 0 : 1, Math.abs(tan.y) < 0.9 ? 1 : 0, 0);
    nor.crossVectors(tan, tmp).normalize();
    for (let i = 0; i <= this.segments; i++) {
      const next = pts[Math.min(i + 1, this.segments)];
      const prev = pts[Math.max(i - 1, 0)];
      const newTan = tmp.subVectors(next, prev).normalize();
      // transport the normal onto the new tangent
      nor.addScaledVector(newTan, -nor.dot(newTan)).normalize();
      tan.copy(newTan);
      bin.crossVectors(tan, nor);
      const r = radius(i / this.segments);
      for (let j = 0; j <= this.radial; j++) {
        const ang = (j / this.radial) * Math.PI * 2;
        const cx = Math.cos(ang), sy = Math.sin(ang);
        const nx = nor.x * cx + bin.x * sy, ny = nor.y * cx + bin.y * sy, nz = nor.z * cx + bin.z * sy;
        const k = (i * (this.radial + 1) + j) * 3;
        this.pos[k] = pts[i].x + nx * r;
        this.pos[k + 1] = pts[i].y + ny * r;
        this.pos[k + 2] = pts[i].z + nz * r;
        this.nrm[k] = nx;
        this.nrm[k + 1] = ny;
        this.nrm[k + 2] = nz;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }
}

/** Smooth deterministic 3D value noise in [-1, 1] (static soma shapes only; not per frame). */
function noise3(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (v: number) => v * v * (3 - 2 * v);
  const h = (a: number, b: number, c: number) => hash01(((a * 73856093) ^ (b * 19349663) ^ (c * 83492791) ^ seed) | 0) * 2 - 1;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const u = s(xf), v = s(yf), w = s(zf);
  return lerp(
    lerp(lerp(h(xi, yi, zi), h(xi + 1, yi, zi), u), lerp(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
    lerp(lerp(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), lerp(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v),
    w,
  );
}

interface Dendrite {
  strand: Strand;
  dir: THREE.Vector3; // local-space root direction
}

/** One junction: soma body + dendrites, built once in local space (+X = toward its partner). */
class Soma {
  readonly group = new THREE.Group();
  readonly radius: number;
  private body: THREE.Mesh;
  private dendrites: Dendrite[] = [];

  constructor(seed: number, radius: number, material: THREE.ShaderMaterial, dendriteMat: THREE.ShaderMaterial, nucleusMat: THREE.ShaderMaterial) {
    this.radius = radius;
    const rnd = (k: number) => hash01(seed * 131 + k);
    // Dendrite roots: spread around the body, avoiding the axon direction (+X) where the axon leaves.
    const dirs: THREE.Vector3[] = [];
    const count = 8 + Math.floor(rnd(1) * 3);
    for (let i = 0; i < count; i++) {
      const phi = Math.acos(2 * rnd(10 + i) - 1);
      const th = rnd(40 + i) * Math.PI * 2;
      const d = new THREE.Vector3(Math.cos(phi), Math.sin(phi) * Math.cos(th), Math.sin(phi) * Math.sin(th));
      if (d.x > 0.55) d.x = -d.x * 0.6; // keep the axon hillock clear
      dirs.push(d.normalize());
    }
    const axon = new THREE.Vector3(1, 0, 0);

    // Body: sphere displaced by noise and pulled out into cones toward every process, so the surface
    // flows continuously into dendrites and the axon hillock instead of reading as a ball.
    const geo = new THREE.IcosahedronGeometry(1, 6);
    const p = geo.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      let r = 0.9 + 0.12 * noise3(v.x * 2.2, v.y * 2.2, v.z * 2.2, seed);
      for (const d of dirs) r += 0.75 * Math.pow(Math.max(0, v.dot(d)), 7);
      r += 0.95 * Math.pow(Math.max(0, v.dot(axon)), 6);
      v.multiplyScalar(r * radius);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const seedAttr = new Float32Array(p.count).fill(seed % 1);
    geo.setAttribute("aT", new THREE.BufferAttribute(new Float32Array(p.count), 1));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seedAttr, 1));
    this.body = new THREE.Mesh(geo, material);
    this.body.raycast = () => {};
    this.group.add(this.body);
    // Luminous interior: a smaller soft body glowing from inside the membrane (the reference's bright core).
    const inner = new THREE.IcosahedronGeometry(radius * 0.62, 4);
    inner.setAttribute("aT", new THREE.BufferAttribute(new Float32Array(inner.attributes.position.count), 1));
    inner.setAttribute("aSeed", new THREE.BufferAttribute(new Float32Array(inner.attributes.position.count).fill(seed % 1), 1));
    const nucleus = new THREE.Mesh(inner, nucleusMat);
    nucleus.raycast = () => {};
    this.group.add(nucleus);

    // Dendrites: fine, tapering, wavy processes that fork, like the reference - never straight rods.
    // Each is a cubic curve with two independent bends plus a gentle sinusoidal waver along its length.
    const wobble = (curve: THREE.CubicBezierCurve3, amp: number, k: number, ph: number) => {
      const t = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      return (u: number, out: THREE.Vector3) => {
        curve.getPoint(u, out);
        curve.getTangent(u, t);
        a.crossVectors(t, Math.abs(t.y) < 0.9 ? up : new THREE.Vector3(1, 0, 0)).normalize();
        b.crossVectors(t, a);
        const env = Math.sin(Math.PI * u) * amp;
        out.addScaledVector(a, Math.sin(u * k + ph) * env).addScaledVector(b, Math.cos(u * k * 0.7 + ph * 1.3) * env * 0.6);
      };
    };
    const jitter = (k: number) => new THREE.Vector3(rnd(k) - 0.5, rnd(k + 1) - 0.5, rnd(k + 2) - 0.5);
    dirs.forEach((d, i) => {
      const len = radius * (5.0 + 5.0 * rnd(70 + i));
      const root = d.clone().multiplyScalar(radius * 1.0);
      const tip = d.clone().multiplyScalar(radius + len).addScaledVector(jitter(90 + i * 5), len * 0.9);
      const c1 = root.clone().lerp(tip, 0.33).addScaledVector(jitter(300 + i * 5), len * 0.7);
      const c2 = root.clone().lerp(tip, 0.66).addScaledVector(jitter(400 + i * 5), len * 0.7);
      const curve = new THREE.CubicBezierCurve3(root, c1, c2, tip);
      const r0 = radius * 0.11;
      const s = new Strand(40, 7, hash01(seed * 7 + i));
      s.build(wobble(curve, len * 0.06, 9 + 6 * rnd(500 + i), rnd(510 + i) * 6.3), (u) => r0 * Math.pow(1 - u, 1.7) + 0.02);
      this.addStrand(s, dendriteMat);
      this.dendrites.push({ strand: s, dir: d });
      // forks, and a finer fork off some forks
      const forks = 2 + Math.floor(rnd(150 + i) * 2);
      for (let f = 0; f < forks; f++) {
        const k = 600 + i * 17 + f * 5;
        const at = 0.25 + 0.45 * rnd(k);
        const base = curve.getPoint(at);
        const dir = curve.getTangent(at).addScaledVector(jitter(k + 1), 1.6).normalize();
        const flen = len * (0.3 + 0.35 * rnd(k + 4));
        const ftip = base.clone().addScaledVector(dir, flen).addScaledVector(jitter(k + 7), flen * 0.6);
        const fc = new THREE.CubicBezierCurve3(base, base.clone().addScaledVector(dir, flen * 0.35).addScaledVector(jitter(k + 11), flen * 0.5), base.clone().lerp(ftip, 0.7).addScaledVector(jitter(k + 13), flen * 0.4), ftip);
        const fr = r0 * Math.pow(1 - at, 1.7) * 0.6 + 0.02;
        const fs = new Strand(24, 6, hash01(seed * 11 + k));
        fs.build(wobble(fc, flen * 0.07, 11, rnd(k + 15) * 6.3), (u) => fr * Math.pow(1 - u, 1.5) + 0.015);
        this.addStrand(fs, dendriteMat);
        if (rnd(k + 17) < 0.55) {
          const at2 = 0.4 + 0.3 * rnd(k + 19);
          const b2 = fc.getPoint(at2);
          const d2 = fc.getTangent(at2).addScaledVector(jitter(k + 21), 1.8).normalize();
          const l2 = flen * 0.5;
          const t2 = b2.clone().addScaledVector(d2, l2);
          const sc = new THREE.CubicBezierCurve3(b2, b2.clone().addScaledVector(d2, l2 * 0.4).addScaledVector(jitter(k + 23), l2 * 0.4), b2.clone().lerp(t2, 0.7), t2);
          const ss = new Strand(16, 5, hash01(seed * 13 + k));
          const sr = fr * Math.pow(1 - at2, 1.5) * 0.6 + 0.015;
          ss.build(wobble(sc, l2 * 0.06, 12, rnd(k + 25) * 6.3), (u) => sr * Math.pow(1 - u, 1.4) + 0.012);
          this.addStrand(ss, dendriteMat);
        }
      }
    });
  }

  private addStrand(s: Strand, mat: THREE.ShaderMaterial) {
    const m = new THREE.Mesh(s.geometry, mat);
    m.raycast = () => {};
    m.frustumCulled = false;
    this.group.add(m);
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
}

export interface NeuronPairInfo {
  aId: string;
  bId: string;
}

export class NeuronPairPrototype {
  readonly group = new THREE.Group();
  private uTime = { value: 0 };
  private uReveal = { value: 0 };
  private bodyMat: THREE.ShaderMaterial;
  private dendriteMat: THREE.ShaderMaterial;
  private axonMat: THREE.ShaderMaterial;
  private nucleusMat: THREE.ShaderMaterial;
  private somaA: Soma;
  private somaB: Soma;
  private axon = new Strand(64, 10, 0.37);
  private branches: { strand: Strand; at: number; seed: number }[] = [];
  private info: NeuronPairInfo | null = null;
  private q = new THREE.Quaternion();
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private side1 = new THREE.Vector3();
  private side2 = new THREE.Vector3();

  constructor(parent: THREE.Object3D) {
    const make = (skin: number, core: number, nucleus: number) =>
      new THREE.ShaderMaterial({
        vertexShader: MEMBRANE_VERT,
        fragmentShader: MEMBRANE_FRAG,
        uniforms: {
          uTime: this.uTime,
          uReveal: this.uReveal,
          uSkin: { value: skin },
          uCore: { value: core },
          uNucleus: { value: nucleus },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
    this.bodyMat = make(0.22, 0.0, 0.06);
    this.dendriteMat = make(0.34, 0.26, 0.0);
    this.axonMat = make(0.32, 0.38, 0.0);
    this.nucleusMat = make(0.0, 0.0, 0.32);
    this.somaA = new Soma(0.173, 1.5, this.bodyMat, this.dendriteMat, this.nucleusMat);
    this.somaB = new Soma(0.619, 1.25, this.bodyMat, this.dendriteMat, this.nucleusMat);
    this.group.add(this.somaA.group, this.somaB.group);
    const axonMesh = new THREE.Mesh(this.axon.geometry, this.axonMat);
    axonMesh.raycast = () => {};
    axonMesh.frustumCulled = false;
    this.group.add(axonMesh);
    for (let i = 0; i < 4; i++) {
      const s = new Strand(18, 6, hash01(900 + i));
      const m = new THREE.Mesh(s.geometry, this.dendriteMat);
      m.raycast = () => {};
      m.frustumCulled = false;
      this.group.add(m);
      this.branches.push({ strand: s, at: 0.22 + 0.18 * i + 0.06 * hash01(930 + i), seed: hash01(960 + i) });
    }
    this.group.name = "BRAIN_NEURON_PROTOTYPE";
    this.group.visible = false;
    parent.add(this.group);
  }

  setPair(info: NeuronPairInfo | null) {
    this.info = info;
  }

  getPair(): NeuronPairInfo | null {
    return this.info;
  }

  /**
   * a/b: live world positions of the two real records; `reveal` (0..1) is the caller's gate
   * (knowledge surface x depth x proximity). Nothing is drawn while it is 0.
   */
  update(a: THREE.Vector3, b: THREE.Vector3, elapsedSec: number, reveal: number) {
    this.uTime.value = elapsedSec;
    this.uReveal.value = reveal;
    this.group.visible = !!this.info && reveal > 0.002;
    if (!this.group.visible) return;

    this.dir.subVectors(b, a);
    const len = this.dir.length();
    if (len < 1e-3) return;
    this.dir.divideScalar(len);
    const X = new THREE.Vector3(1, 0, 0);
    this.q.setFromUnitVectors(X, this.dir);
    this.somaA.group.position.copy(a);
    this.somaA.group.quaternion.copy(this.q);
    this.q.setFromUnitVectors(X, this.tmpA.copy(this.dir).negate());
    this.somaB.group.position.copy(b);
    this.somaB.group.quaternion.copy(this.q);
    const breathe = 1 + 0.025 * Math.sin(elapsedSec * 0.8);
    this.somaA.group.scale.setScalar(breathe);
    this.somaB.group.scale.setScalar(2 - breathe);

    // Axon centreline: leaves each hillock, gently sinuous, slowly swaying (standing, not travelling).
    this.side1.set(Math.abs(this.dir.y) < 0.9 ? 0 : 1, Math.abs(this.dir.y) < 0.9 ? 1 : 0, 0).cross(this.dir).normalize();
    this.side2.crossVectors(this.dir, this.side1);
    const start = this.tmpA.copy(a).addScaledVector(this.dir, this.somaA.radius * 1.3);
    const end = this.tmpB.copy(b).addScaledVector(this.dir, -this.somaB.radius * 1.3);
    const span = start.distanceTo(end);
    const sway = Math.sin(elapsedSec * 0.35) * 0.04;
    const centre = (u: number, out: THREE.Vector3) => {
      const env = Math.sin(Math.PI * u);
      out.copy(start).lerp(end, u);
      out.addScaledVector(this.side1, span * env * (0.07 * Math.sin(u * Math.PI * 1.5 + 0.8) + sway));
      out.addScaledVector(this.side2, span * env * 0.05 * Math.cos(u * Math.PI * 2.2 + 0.3));
    };
    const rA = this.somaA.radius * 0.34, rB = this.somaB.radius * 0.34;
    // thick at both hillocks, slimmer through the middle, subtle beading along the length
    this.axon.build(centre, (u) => {
      const hill = Math.max(Math.pow(1 - u, 6) * rA * 1.6, Math.pow(u, 6) * rB * 1.6);
      return Math.max(0.09, ((rA + (rB - rA) * u) * 0.42 + hill * 0.42)) *
        (1 + 0.12 * Math.sin(u * 34.0));
    });

    // Fine branching filaments peeling off the axon and tapering out into the dark.
    const base = new THREE.Vector3(), next = new THREE.Vector3(), outDir = new THREE.Vector3();
    for (const br of this.branches) {
      centre(br.at, base);
      centre(br.at + 0.02, next);
      const ang = br.seed * Math.PI * 2;
      outDir.copy(this.side1).multiplyScalar(Math.cos(ang)).addScaledVector(this.side2, Math.sin(ang));
      outDir.addScaledVector(next.sub(base).normalize(), 0.9).normalize();
      const flen = span * (0.16 + 0.12 * br.seed);
      const p1 = base.clone().addScaledVector(outDir, flen * 0.5).addScaledVector(this.side2, flen * 0.12);
      const p2 = base.clone().addScaledVector(outDir, flen);
      const curve = new THREE.QuadraticBezierCurve3(base.clone(), p1, p2);
      br.strand.build((u, o) => o.copy(curve.getPoint(u)), (u) => 0.2 * Math.pow(1 - u, 1.2) + 0.025);
    }
  }

  dispose() {
    this.somaA.dispose();
    this.somaB.dispose();
    this.axon.geometry.dispose();
    for (const b of this.branches) b.strand.geometry.dispose();
    this.bodyMat.dispose();
    this.dendriteMat.dispose();
    this.axonMat.dispose();
    this.nucleusMat.dispose();
    this.group.parent?.remove(this.group);
  }
}
