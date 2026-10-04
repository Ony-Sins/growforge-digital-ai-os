import * as THREE from "three";
import { CORE_MOTION_GLSL } from "../neutronCore/coreMotionGlsl";
import {
  type CoreMotionState,
  type CoreParticleBuffers,
  MEMBER_COUNT,
  computeCoreParticle,
  hash01,
} from "../neutronCore/coreParticleField";
import type { BrainSharedUniforms } from "./brainUniforms";

/**
 * Faint living filaments between the CORE's own atmosphere particles.
 * Current Explore ownership: this renderer is decorative only. Named-record
 * endpoints are excluded; SemanticBundles alone renders canonical relationships.
 * Legacy tier/debug interfaces remain for compatibility, not a second edge owner.
 *
 * Three tiers, all between particles that already orbit the core:
 *   ordinary  - sparse, dim, slightly sinuous background connectivity (sparse on purpose: no fog)
 *   local     - every real knowledge record gets a few brighter filaments to its nearest neighbours,
 *               so records read as small star-like junctions inside the atmosphere
 *   relation  - a real link (hub -> linked record) between two records that sit close together;
 *               pulses are emitted from the hub end in rhythmic bursts (bright head, fading tail)
 *
 * Endpoints are particle indices of the same buffer the CORE points use and both ends are placed in the
 * vertex shader with the shared `coreParticleWorld`, so a filament is always attached to a rendered
 * particle. Neighbour choice runs on a CPU replica a couple of times per second with hysteresis.
 * Rendering is GPU-instanced (one instance per filament).
 */

const SEG = 24;
const STRANDS = 5;
const MAX_EDGES = 2600;
export const LINK_MAX_LEN = 52;
const RELATION_MAX_LEN = 88;
const MIN_ORDINARY_LEN = 12;
const ORDINARY_MAX_R = 140; // matches the shader's radial fade (100..138)
const RELINK_SEC = 0.7;
const FADE_OUT_SEC = 1.5;
const NEVER = 1e9;

const VERT = /* glsl */ `
  attribute float aT;   // per-vertex: parametric t along the edge
  attribute float aStrand;
  attribute vec3 aBaseA; // per-instance (one instance = one filament)
  attribute vec3 aRandA;
  attribute vec3 aBaseB;
  attribute vec3 aRandB;
  attribute vec2 aMembers; // particle indices of the two ends
  attribute vec4 aLife; // x = tier*direction (0 ordinary, +-1 local, +-2 relation; sign = pulse emitted from A(+)/B(-)), y = birth, z = death, w = seed

  uniform float uMaxLen;
  ${CORE_MOTION_GLSL}
  uniform float uClock;
  uniform float uLinks;
  uniform float uTime64;
  uniform float uPulseGain;
  uniform float uAmbient;
  uniform float uPinMember[4];
  uniform vec3 uPinWorld[4];

  varying float vAlpha;
  varying float vPulse;

  void main() {
    float t = aT;
    float seed = aLife.w;
    float tier = abs(aLife.x);
    float dirSign = aLife.x >= 0.0 ? 1.0 : -1.0;
    vec3 pa = coreParticleWorld(aBaseA, aRandA);
    vec3 pb = coreParticleWorld(aBaseB, aRandB);
    // a held / gliding record: its cords follow the displaced end (elastic, never detached)
    for (int i = 0; i < 4; i++) {
      if (uPinMember[i] >= 0.0) {
        if (abs(aMembers.x - uPinMember[i]) < 0.5) pa = uPinWorld[i];
        if (abs(aMembers.y - uPinMember[i]) < 0.5) pb = uPinWorld[i];
      }
    }
    vec3 d = pb - pa;
    float len = length(d);
    vec3 dir = d / max(len, 1e-3);
    vec3 ref = abs(dir.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 b1 = normalize(cross(dir, ref));
    vec3 b2 = cross(dir, b1);

    // uneven, slowly breathing sinuous curve (zero offset at both particles); key filaments are calmer
    float env = sin(3.14159 * t);
    float ph = uClock * (0.22 + seed * 0.26);
    float f1 = 1.0 + floor(seed * 2.0) * 0.5;
    float f2 = 1.0 + floor(fract(seed * 7.0) * 2.0) * 0.5;
    float bend = tier > 0.5 ? 0.075 : 0.11;
    vec3 off = (b1 * sin(t * 3.14159 * f1 + seed * 31.0 + ph) + b2 * cos(t * 3.14159 * f2 + seed * 17.0 - ph * 0.8)) * len * bend * env;
    float angle = aStrand * 6.28318 / 5.0;
    vec3 bundle = (b1 * cos(angle) + b2 * sin(angle)) * len * 0.018 * env;
    vec3 p = mix(pa, pb, t) + off + bundle;
    float rMid = length(0.5 * (pa + pb));

    // Connectivity accumulates with zoom. Ordinary filaments spread outward from the dense inner atmosphere;
    // key structure (around real records) emerges earlier so the meaningful junctions are readable first.
    float th = tier > 1.5 ? 0.35 + 0.1 * fract(seed * 13.37)
             : tier > 0.5 ? 0.45 + 0.35 * fract(seed * 13.37)
                          : 0.06 + 0.45 * smoothstep(55.0, 135.0, rMid) + 0.3 * fract(seed * 13.37);
    float appear = smoothstep(th, th + 0.14, uLinks);
    float born = smoothstep(0.0, 1.4, uClock - aLife.y);
    float dying = 1.0 - smoothstep(0.0, ${FADE_OUT_SEC.toFixed(2)}, uClock - aLife.z);
    float reach = uMaxLen * (0.5 + 0.5 * uLinks) * (tier > 1.5 ? 1.7 : tier > 0.5 ? 1.2 : 1.0);
    // no outer clutter: ordinary filaments live in the inner field around the core only
    float radial = tier > 0.5 ? 1.0 : 1.0 - smoothstep(100.0, 138.0, rMid);
    float lenFade = (1.0 - smoothstep(reach * 0.6, reach, len)) * radial;
    float life = appear * born * dying * lenFade;
    float tw = 0.78 + 0.22 * sin(uClock * (0.6 + seed) + seed * 40.0);
    float ends = 0.55 + 0.45 * env;

    // Information moving through the field. Key filaments carry rhythmic bursts emitted from the record/hub
    // end (bright head, fading tail); a minority of ordinary filaments carry slower, dimmer ones.
    float s = dirSign > 0.0 ? t : 1.0 - t;
    float period = tier > 1.5 ? 4.0 : (tier > 0.5 ? 8.0 : 16.0);
    float head = fract(uTime64 / period + fract(seed * 5.3)) * 1.7;
    float x = head - s;
    float burst = smoothstep(-0.02, 0.01, x) * exp(-max(x, 0.0) * 8.0);
    float amp = tier > 1.5 ? 1.3 : (tier > 0.5 ? 0.85 : (seed > 0.62 ? 0.3 : 0.0));
    float pulse = burst * amp * uPulseGain;
    vPulse = pulse * life;

    float base = tier > 1.5 ? 0.24 : (tier > 0.5 ? 0.18 : 0.035 * (0.3 + 0.7 * fract(seed * 7.31)));
    vAlpha = (base * tw * ends + pulse * 0.9) * life * uAmbient;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FRAG = /* glsl */ `
  varying float vAlpha;
  varying float vPulse;
  void main() {
    vec3 col = mix(vec3(0.55, 0.88, 1.0), vec3(1.0), clamp(vPulse * 1.6, 0.0, 1.0));
    gl_FragColor = vec4(col, vAlpha);
  }
`;

export interface LinkStats {
  alive: number;
  ordinary: number;
  local: number;
  relation: number;
  longestOrdinary: number;
  longestKey: number;
  maxLen: number;
}

export class AtmosphereLinks {
  public readonly mesh: THREE.LineSegments;
  private geometry: THREE.InstancedBufferGeometry;
  private material: THREE.ShaderMaterial;
  private glints: THREE.Points;
  private glintGeo = new THREE.BufferGeometry();
  private glintMat: THREE.ShaderMaterial;
  private glintReady = false;

  private slotA = new Int32Array(MAX_EDGES).fill(-1);
  private slotB = new Int32Array(MAX_EDGES).fill(-1);
  private slotState = new Uint8Array(MAX_EDGES); // 0 free, 1 alive, 2 dying
  private slotKind = new Int8Array(MAX_EDGES); // signed tier
  private slotFreeAt = new Float64Array(MAX_EDGES);
  private slotMissSince = new Float64Array(MAX_EDGES); // 0 = currently wanted
  private pairSlot = new Map<number, number>();
  private memPos = new Float32Array(MEMBER_COUNT * 3);
  private lastRelink = -1e9;
  private wasActive = false;
  private dirty = false;
  private longestOrdinary = 0;
  private longestKey = 0;

  private keyMembers: number[] = [];
  private relations: [number, number][] = [];

  private aBaseA: THREE.InstancedBufferAttribute;
  private aRandA: THREE.InstancedBufferAttribute;
  private aBaseB: THREE.InstancedBufferAttribute;
  private aRandB: THREE.InstancedBufferAttribute;
  private aLife: THREE.InstancedBufferAttribute;
  private aMembers!: THREE.InstancedBufferAttribute;
  private uPinMember = { value: [-1, -1, -1, -1] };
  private uPinWorld = { value: [0, 1, 2, 3].map(() => new THREE.Vector3()) };
  private pinned = new Map<number, THREE.Vector3>();
  private uPulseGain = { value: 0 }; // no decorative pulses implying live execution
  private uAmbient = { value: 0.35 };
  private ambientTarget = 0.35;

  private tmp = { x: 0, y: 0, z: 0 };
  private nn = new Float32Array(MEMBER_COUNT * 5);
  private nnIdx = new Int32Array(MEMBER_COUNT * 5);

  constructor(shared: BrainSharedUniforms) {
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.instanceCount = MAX_EDGES;
    const vt = new Float32Array(SEG * 2 * STRANDS);
    const vs = new Float32Array(vt.length);
    for (let s = 0; s < STRANDS; s++) for (let k = 0; k < SEG; k++) {
      const row = (s * SEG + k) * 2;
      vt[row] = k / SEG;
      vt[row + 1] = (k + 1) / SEG;
      vs[row] = vs[row + 1] = s;
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(vt.length * 3), 3));
    geometry.setAttribute("aT", new THREE.BufferAttribute(vt, 1));
    geometry.setAttribute("aStrand", new THREE.BufferAttribute(vs, 1));
    const inst = (n: number) => new THREE.InstancedBufferAttribute(new Float32Array(MAX_EDGES * n), n).setUsage(THREE.DynamicDrawUsage);
    this.aBaseA = inst(3);
    this.aRandA = inst(3);
    this.aBaseB = inst(3);
    this.aRandB = inst(3);
    this.aLife = inst(4);
    this.aMembers = inst(2);
    for (let e = 0; e < MAX_EDGES; e++) {
      this.aLife.array[e * 4 + 1] = NEVER;
      this.aLife.array[e * 4 + 2] = NEVER;
    }
    geometry.setAttribute("aBaseA", this.aBaseA);
    geometry.setAttribute("aRandA", this.aRandA);
    geometry.setAttribute("aBaseB", this.aBaseB);
    geometry.setAttribute("aRandB", this.aRandB);
    geometry.setAttribute("aLife", this.aLife);
    geometry.setAttribute("aMembers", this.aMembers);
    this.geometry = geometry;

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uFlowTotal: shared.uFlowTotal,
        uFlowBlend: shared.uFlowBlend,
        uTurbTime: shared.uTurbTime,
        uTurbulence: shared.uTurbulence,
        uPulse: shared.uPulse,
        uReducedMotion: shared.uReducedMotion,
        uClock: shared.uClock,
        uLinks: shared.uLinks,
        uTime64: shared.uTime64,
        uMaxLen: { value: LINK_MAX_LEN },
        uPulseGain: this.uPulseGain,
        uAmbient: this.uAmbient,
        uPinMember: this.uPinMember,
        uPinWorld: this.uPinWorld,
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.LineSegments(this.geometry, this.material);
    this.mesh.name = "ATMOSPHERE_LINKS";
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    this.mesh.raycast = () => {};
    this.mesh.visible = false;
    // Optical detail at existing member endpoints, never new semantic nodes.
    this.glintMat = new THREE.ShaderMaterial({
      uniforms: { ...this.material.uniforms }, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `${CORE_MOTION_GLSL}
        attribute vec3 aRandom; attribute float aLight;
        uniform float uLinks; uniform float uAmbient; varying float vLight;
        void main(){vec3 p=coreParticleWorld(position,aRandom);
          vec4 view=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*view;
          float depth=max(1.,-view.z);
          gl_PointSize=clamp(1800./depth,2.,34.);
          vLight=aLight*smoothstep(.35,.85,uLinks)*uAmbient;}`,
      fragmentShader: `varying float vLight;void main(){float r=length(gl_PointCoord-.5)*2.;
        float glow=exp(-r*r*5.)*(1.-smoothstep(.7,1.,r));
        float heart=exp(-r*r*42.);
        gl_FragColor=vec4(mix(vec3(.04,.42,.85),vec3(.65,.94,1.),heart),vLight*(glow*.45+heart*.7));}`,
    });
    this.glints = new THREE.Points(this.glintGeo, this.glintMat);
    this.glints.frustumCulled = false;
    this.glints.raycast = () => {};
    this.mesh.add(this.glints);
  }

  /** Verification hook: scale the data pulses (1 = normal, 0 = off). */
  /** Records displaced from their orbit (held / gliding back). Their cords follow and are never cut. */
  public setPinnedMembers(pins: { member: number; world: THREE.Vector3 }[]) {
    this.pinned.clear();
    for (let i = 0; i < 4; i++) {
      const p = pins[i];
      this.uPinMember.value[i] = p ? p.member : -1;
      if (p) { this.uPinWorld.value[i].copy(p.world); this.pinned.set(p.member, this.uPinWorld.value[i]); }
    }
  }

  public setPulseGain(g: number) {
    this.uPulseGain.value = g;
  }
  public setAmbientFocus(focused: boolean) { this.ambientTarget = focused ? 0.10 : 0.35; }

  /** Real records (member indices) and real links between them (hub member, linked member). */
  public setKeyStructure(records: number[], relations: [number, number][]) {
    this.keyMembers = records;
    this.relations = relations;
    this.dirty = true;
  }

  /** CPU replica positions of all member particles (world space, current motion state). */
  public refreshPositions(field: CoreParticleBuffers, motion: CoreMotionState): Float32Array {
    const t = this.tmp;
    for (let i = 0; i < MEMBER_COUNT; i++) {
      computeCoreParticle(
        t,
        field.positions[i * 3], field.positions[i * 3 + 1], field.positions[i * 3 + 2],
        field.aRandom[i * 3], field.aRandom[i * 3 + 1], field.aRandom[i * 3 + 2],
        motion,
      );
      this.memPos[i * 3] = t.x;
      this.memPos[i * 3 + 1] = t.y;
      this.memPos[i * 3 + 2] = t.z;
    }
    return this.memPos;
  }

  public get stats(): LinkStats {
    let ordinary = 0, local = 0, relation = 0;
    for (let s = 0; s < MAX_EDGES; s++) {
      if (this.slotState[s] !== 1) continue;
      const k = Math.abs(this.slotKind[s]);
      if (k === 0) ordinary++;
      else if (k === 1) local++;
      else relation++;
    }
    return { alive: ordinary + local + relation, ordinary, local, relation, longestOrdinary: this.longestOrdinary, longestKey: this.longestKey, maxLen: LINK_MAX_LEN };
  }

  /** Key filaments with fresh endpoint positions (verification / label anchoring). */
  /**
   * Key filaments with fresh endpoints and on-curve sample points (at `ts`), computed with the same
   * formula as the vertex shader (key tier bend) so verification probes sit exactly on the rendered line.
   */
  public debugKeyEdges(field: CoreParticleBuffers, motion: CoreMotionState, clock = 0, ts: number[] = []) {
    const pos = this.refreshPositions(field, motion);
    const out: { a: number[]; b: number[]; tier: number; emitFromA: boolean; slot: number; curve: number[][] }[] = [];
    for (const [, slot] of this.pairSlot) {
      const kind = this.slotKind[slot];
      if (this.slotState[slot] !== 1 || kind === 0) continue;
      const a = this.slotA[slot], b = this.slotB[slot];
      const pa = [pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]];
      const pb = [pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]];
      const d = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
      const len = Math.hypot(d[0], d[1], d[2]) || 1e-3;
      const dir = [d[0] / len, d[1] / len, d[2] / len];
      const ref = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      let b1 = [dir[1] * ref[2] - dir[2] * ref[1], dir[2] * ref[0] - dir[0] * ref[2], dir[0] * ref[1] - dir[1] * ref[0]];
      const n1 = Math.hypot(b1[0], b1[1], b1[2]) || 1;
      b1 = [b1[0] / n1, b1[1] / n1, b1[2] / n1];
      const b2 = [dir[1] * b1[2] - dir[2] * b1[1], dir[2] * b1[0] - dir[0] * b1[2], dir[0] * b1[1] - dir[1] * b1[0]];
      const seed = this.aLife.array[slot * 4 + 3];
      const ph = clock * (0.22 + seed * 0.26);
      const f1 = 1 + Math.floor(seed * 2) * 0.5;
      const f2 = 1 + Math.floor(((seed * 7) % 1) * 2) * 0.5;
      const curve = ts.map((t) => {
        const env = Math.sin(Math.PI * t);
        const s1 = Math.sin(t * Math.PI * f1 + seed * 31 + ph) * len * 0.075 * env;
        const s2 = Math.cos(t * Math.PI * f2 + seed * 17 - ph * 0.8) * len * 0.075 * env;
        return [0, 1, 2].map((c) => pa[c] + d[c] * t + b1[c] * s1 + b2[c] * s2);
      });
      out.push({ a: pa, b: pb, tier: Math.abs(kind), emitFromA: kind > 0, slot, curve });
    }
    return out;
  }

  /** Radius of the midpoint of every alive filament (evidence that connectivity follows the atmosphere, not a shell). */
  public debugEdgeRadii(): { ordinary: number[]; key: number[] } {
    const ordinary: number[] = [];
    const key: number[] = [];
    const p = this.memPos;
    for (const [, slot] of this.pairSlot) {
      if (this.slotState[slot] !== 1) continue;
      const a = this.slotA[slot], b = this.slotB[slot];
      const mx = (p[a * 3] + p[b * 3]) / 2, my = (p[a * 3 + 1] + p[b * 3 + 1]) / 2, mz = (p[a * 3 + 2] + p[b * 3 + 2]) / 2;
      (this.slotKind[slot] === 0 ? ordinary : key).push(Math.sqrt(mx * mx + my * my + mz * mz));
    }
    return { ordinary, key };
  }

  public debugMemberPositions(field: CoreParticleBuffers, motion: CoreMotionState): number[] {
    return Array.from(this.refreshPositions(field, motion));
  }

  public update(now: number, links: number, field: CoreParticleBuffers, motion: CoreMotionState) {
    this.uAmbient.value += (this.ambientTarget - this.uAmbient.value) * 0.12;
    if (!this.glintReady) {
      this.glintGeo.setAttribute("position", new THREE.BufferAttribute(field.positions.slice(0, MEMBER_COUNT * 3), 3));
      this.glintGeo.setAttribute("aRandom", new THREE.BufferAttribute(field.aRandom.slice(0, MEMBER_COUNT * 3), 3));
      this.glintGeo.setAttribute("aLight", new THREE.BufferAttribute(new Float32Array(MEMBER_COUNT), 1));
      this.glintReady = true;
    }
    const active = links > 0.012;
    this.mesh.visible = active;
    if (!active) {
      this.wasActive = false;
      return;
    }
    if (!this.wasActive || this.dirty || now - this.lastRelink > RELINK_SEC) {
      this.relink(now, field, motion);
      this.lastRelink = now;
      this.wasActive = true;
      this.dirty = false;
      const light = this.glintGeo.getAttribute("aLight") as THREE.BufferAttribute;
      (light.array as Float32Array).fill(0);
      const keys = new Set(this.keyMembers);
      for (let e = 0; e < MAX_EDGES; e++) if (this.slotState[e] === 1) {
        for (const member of [this.slotA[e], this.slotB[e]]) {
          if (member >= 0 && !keys.has(member) && hash01(member * 17) > 0.80) light.setX(member, 0.85);
        }
      }
      light.needsUpdate = true;
    }
  }

  private relink(now: number, field: CoreParticleBuffers, motion: CoreMotionState) {
    const pos = this.refreshPositions(field, motion);
    const K = 5;
    const nn = this.nn;
    const nnIdx = this.nnIdx;
    nn.fill(1e30);
    nnIdx.fill(-1);
    const R2 = LINK_MAX_LEN * LINK_MAX_LEN;
    for (let i = 0; i < MEMBER_COUNT; i++) {
      const ix = pos[i * 3], iy = pos[i * 3 + 1], iz = pos[i * 3 + 2];
      for (let j = i + 1; j < MEMBER_COUNT; j++) {
        const dx = pos[j * 3] - ix;
        if (dx > LINK_MAX_LEN || dx < -LINK_MAX_LEN) continue;
        const dy = pos[j * 3 + 1] - iy;
        if (dy > LINK_MAX_LEN || dy < -LINK_MAX_LEN) continue;
        const dz = pos[j * 3 + 2] - iz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > R2) continue;
        for (let side = 0; side < 2; side++) {
          const a = side === 0 ? i : j;
          const b = side === 0 ? j : i;
          const base = a * K;
          if (d2 < nn[base + K - 1]) {
            let p = K - 1;
            while (p > 0 && nn[base + p - 1] > d2) {
              nn[base + p] = nn[base + p - 1];
              nnIdx[base + p] = nnIdx[base + p - 1];
              p--;
            }
            nn[base + p] = d2;
            nnIdx[base + p] = b;
          }
        }
      }
    }

    const keyOf = (a: number, b: number) => (a < b ? a * MEMBER_COUNT + b : b * MEMBER_COUNT + a);

    const desired = new Map<number, number>(); // pair key -> signed tier
    const records = new Set(this.keyMembers);

    // ordinary: sparse and irregular (1 nearest, sometimes a 2nd, rarely more) - avoids a foggy lattice
    for (let i = 0; i < MEMBER_COUNT; i++) {
      if (records.has(i)) continue;
      let accepted = 0;
      for (let k = 0; k < K; k++) {
        const j = nnIdx[i * K + k];
        if (j < 0) break;
        if (records.has(j)) continue;
        if (nn[i * K + k] < MIN_ORDINARY_LEN * MIN_ORDINARY_LEN) continue;
        // inner field only: filaments whose midpoint lies beyond the visible band are never created
        const mx = (pos[i * 3] + pos[j * 3]) * 0.5, my = (pos[i * 3 + 1] + pos[j * 3 + 1]) * 0.5, mz = (pos[i * 3 + 2] + pos[j * 3 + 2]) * 0.5;
        if (mx * mx + my * my + mz * mz > ORDINARY_MAX_R * ORDINARY_MAX_R) continue;
        const key = keyOf(i, j);
        if (accepted === 0 || hash01(key * 7 + 1) < (accepted === 1 ? 0.12 : 0.03)) desired.set(key, 0);
        accepted++;
      }
    }
    let longestOrd = 0;
    let longestKey = 0;
    for (const [key, slot] of this.pairSlot) {
      if (this.slotState[slot] !== 1) continue;
      const a = this.slotA[slot];
      const b = this.slotB[slot];
      const dx = pos[a * 3] - pos[b * 3];
      const dy = pos[a * 3 + 1] - pos[b * 3 + 1];
      const dz = pos[a * 3 + 2] - pos[b * 3 + 2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const want = desired.get(key);
      const kind = this.slotKind[slot];
      if (want !== undefined && want !== kind) {
        this.slotKind[slot] = want;
        this.aLife.array[slot * 4] = want;
      }
      const isKey = (want ?? kind) !== 0;
      const cap = isKey ? RELATION_MAX_LEN * 1.15 : LINK_MAX_LEN * 1.05;
      if (want === undefined) {
        if (this.slotMissSince[slot] === 0) this.slotMissSince[slot] = now;
      } else this.slotMissSince[slot] = 0;
      // a filament no longer wanted fades out after a grace period (prevents stale links piling up into a fog)
      const stale = want === undefined && (isKey || len > LINK_MAX_LEN * 0.5 || now - this.slotMissSince[slot] > 2.5);
      const elastic = this.pinned.has(this.slotA[slot]) || this.pinned.has(this.slotB[slot]);
      if (!elastic && (stale || len > cap)) this.kill(slot, now, key);
      else if (isKey) longestKey = Math.max(longestKey, len);
      else longestOrd = Math.max(longestOrd, len);
    }
    this.longestOrdinary = longestOrd;
    this.longestKey = longestKey;
    for (let s = 0; s < MAX_EDGES; s++) {
      if (this.slotState[s] === 2 && now - this.slotFreeAt[s] > FADE_OUT_SEC + 0.1) this.release(s);
    }
    let cursor = 0;
    for (const [key, signed] of desired) {
      if (this.pairSlot.has(key)) continue;
      while (cursor < MAX_EDGES && this.slotState[cursor] !== 0) cursor++;
      if (cursor >= MAX_EDGES) break;
      this.write(cursor, Math.floor(key / MEMBER_COUNT), key % MEMBER_COUNT, key, signed, now, field);
      cursor++;
    }

    this.aBaseA.needsUpdate = true;
    this.aRandA.needsUpdate = true;
    this.aBaseB.needsUpdate = true;
    this.aRandB.needsUpdate = true;
    this.aLife.needsUpdate = true;
  }

  private write(slot: number, a: number, b: number, key: number, signed: number, birth: number, field: CoreParticleBuffers) {
    const seed = hash01(key);
    for (let c = 0; c < 3; c++) {
      this.aBaseA.array[slot * 3 + c] = field.positions[a * 3 + c];
      this.aRandA.array[slot * 3 + c] = field.aRandom[a * 3 + c];
      this.aBaseB.array[slot * 3 + c] = field.positions[b * 3 + c];
      this.aRandB.array[slot * 3 + c] = field.aRandom[b * 3 + c];
    }
    this.aLife.array[slot * 4] = signed;
    this.aLife.array[slot * 4 + 1] = birth;
    this.aLife.array[slot * 4 + 2] = NEVER;
    this.aLife.array[slot * 4 + 3] = seed;
    this.aMembers.array[slot * 2] = a;
    this.aMembers.array[slot * 2 + 1] = b;
    this.aMembers.needsUpdate = true;
    this.slotA[slot] = a;
    this.slotB[slot] = b;
    this.slotKind[slot] = signed;
    this.slotMissSince[slot] = 0;
    this.slotState[slot] = 1;
    this.pairSlot.set(key, slot);
  }

  private setSlotLife(slot: number, index: 1 | 2, value: number) {
    this.aLife.array[slot * 4 + index] = value;
  }

  private kill(slot: number, now: number, key: number) {
    this.slotState[slot] = 2;
    this.slotFreeAt[slot] = now;
    this.setSlotLife(slot, 2, now);
    this.pairSlot.delete(key);
  }

  private release(slot: number) {
    this.slotState[slot] = 0;
    this.slotA[slot] = -1;
    this.slotB[slot] = -1;
    this.slotKind[slot] = 0;
    this.aLife.array[slot * 4] = 0;
    this.setSlotLife(slot, 1, NEVER);
    this.setSlotLife(slot, 2, NEVER);
  }

  public dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.glintGeo.dispose();
    this.glintMat.dispose();
  }
}

