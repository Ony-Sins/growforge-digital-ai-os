import * as THREE from "three";
import { computeCoreParticle, hash01 } from "../neutronCore/coreParticleField";
import { CORE_MOTION_GLSL } from "../neutronCore/coreMotionGlsl";
import type { NeutronCoreEngine } from "../neutronCore/NeutronCoreEngine";

/**
 * Far-view NEURAL WEB (stage 1 of the BRAIN visual direction, 2026-09-30).
 *
 * Every strand is a CONNECTOR between two real CORE particles - there is no separate point cloud and no
 * decoration floating on its own. Both ends are placed in the vertex shader with the same
 * `coreParticleWorld` the particles are drawn with (plus the same volume-opening spread), so each strand
 * stays attached to its two rendered particles as the field swirls and breathes; the web is alive because
 * the particles are.
 *
 * Only particles deep inside the field (radius ~55-165, well within the outer mantle) are linked, and only
 * pairs orbiting at almost the same radius: rotation speed depends on radius, so such pairs stay neighbours
 * and a strand never stretches across the field. It is atmosphere, not data: real records and real
 * relationships keep their own renderers, and nothing on the web moves directionally.
 *
 * Reveal is driven by the caller (0 on CORE, so CORE is untouched; 1 at BRAIN arrival).
 */

/** Overall strand brightness (additive 1px lines) - the main visibility knob. */
export const WEB_STRAND_GAIN = 0.55;
/** Only particles in this radius band are linked (outer mantle is ~220). */
export const WEB_MIN_R = 55;
export const WEB_MAX_R = 165;
/** Longest connector, and how closely two particles' orbit radii must match to be linked. */
export const WEB_MAX_LEN = 13;
export const WEB_MAX_DR = 3.5;
/** Connectors per particle (upper bound). */
export const WEB_NEIGHBOURS = 3;

const VERT = /* glsl */ `
  attribute vec3 aRand;
  attribute float aMember;
  attribute float aBright;
  attribute vec3 aOtherBase; // the particle at the strand's other end
  attribute vec3 aOtherRand;
  attribute float aOtherMember;
  uniform float uReveal;
  uniform float uDepthFx;
  ${CORE_MOTION_GLSL}
  uniform float uLinks;
  uniform float uClock;
  varying float vA;
  varying float vFar;
  void main() {
    vec3 pos = coreParticleWorld(position, aRand);
    // identical to the CORE points shader's volume opening, so the strand end sits on the drawn particle
    float spread = uLinks * uDepthFx * (1.0 - aMember) * smoothstep(45.0, 120.0, length(position));
    pos *= 1.0 + 0.18 * spread;
    vec3 other = coreParticleWorld(aOtherBase, aOtherRand);
    other *= 1.0 + 0.18 * uLinks * uDepthFx * (1.0 - aOtherMember) * smoothstep(45.0, 120.0, length(aOtherBase));
    // a connector belongs between NEIGHBOURS: if the two particles drift apart it lets go softly
    float stretch = 1.0 - smoothstep(${(WEB_MAX_LEN * 1.3).toFixed(1)}, ${(WEB_MAX_LEN * 2.2).toFixed(1)}, distance(pos, other));
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    vec4 mvCore = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float dz = mv.z - mvCore.z;
    vFar = smoothstep(10.0, 170.0, -dz); // far side of the core recedes into midnight blue
    float nearLens = smoothstep(12.0, 55.0, -mv.z);
    float shimmer = 0.8 + 0.2 * sin(uClock * 0.4 + aBright * 61.0);
    // Deep inside the field on screen too: the camera-side hemisphere projects wide, so it recedes (as the
    // mantle's own particles do at arrival), and nothing is drawn beyond the field's projected outline.
    float front = smoothstep(10.0, 90.0, dz);
    float planar = length(mv.xy - mvCore.xy) * (mvCore.z / min(mv.z, -1.0));
    float inside = 1.0 - smoothstep(135.0, 175.0, planar);
    vA = uReveal * aBright * nearLens * (1.0 - 0.55 * vFar) * (1.0 - 0.85 * front) * inside * stretch * shimmer;
  }
`;

const FRAG = /* glsl */ `
  varying float vA;
  varying float vFar;
  void main() {
    vec3 c = mix(vec3(0.42, 0.80, 0.98), vec3(0.10, 0.24, 0.46), vFar);
    gl_FragColor = vec4(c * vA, vA);
  }
`;

export class NeuralWeb {
  readonly group = new THREE.Group();
  private uReveal = { value: 0 };
  private geo = new THREE.BufferGeometry();
  private mat: THREE.ShaderMaterial;
  readonly stats: { particlesLinked: number; strands: number };

  constructor(parent: THREE.Object3D, engine: NeutronCoreEngine) {
    const field = engine.getParticleField();
    const P = field.positions, R = field.aRandom, M = field.aMember;
    // Neighbours must be found where particles are actually DRAWN: each is rotated about the core axis by
    // its own phase, so rest-position neighbours are not screen neighbours. Evaluate the shared motion
    // function at time zero; pairs at (almost) the same radius share an angular speed, so they stay together.
    const W = new Float32Array(field.count * 3);
    const t = { x: 0, y: 0, z: 0 };
    const st = { flowTotal: 0, flowBlend: 0, turbTime: 0, turbulence: 0, pulse: 1, reducedMotion: false };
    for (let i = 0; i < field.count; i++) {
      computeCoreParticle(t, P[i * 3], P[i * 3 + 1], P[i * 3 + 2], R[i * 3], R[i * 3 + 1], R[i * 3 + 2], st);
      W[i * 3] = t.x; W[i * 3 + 1] = t.y; W[i * 3 + 2] = t.z;
    }

    // candidate particles: every rendered CORE particle inside the band
    const idx: number[] = [];
    for (let i = 0; i < field.count; i++) {
      const r = field.aRadius[i];
      if (r >= WEB_MIN_R && r <= WEB_MAX_R) idx.push(i);
    }
    // spatial hash on rest positions
    const cell = WEB_MAX_LEN;
    const grid = new Map<string, number[]>();
    const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
    for (const i of idx) {
      const k = key(W[i * 3], W[i * 3 + 1], W[i * 3 + 2]);
      let b = grid.get(k);
      if (!b) grid.set(k, (b = []));
      b.push(i);
    }

    const base: number[] = [], rand: number[] = [], member: number[] = [], bright: number[] = [];
    const oBase: number[] = [], oRand: number[] = [], oMember: number[] = [];
    const seen = new Set<string>();
    const linked = new Set<number>();
    const max2 = WEB_MAX_LEN * WEB_MAX_LEN;
    const push = (i: number, o: number, b: number) => {
      base.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      rand.push(R[i * 3], R[i * 3 + 1], R[i * 3 + 2]);
      member.push(M[i]);
      oBase.push(P[o * 3], P[o * 3 + 1], P[o * 3 + 2]);
      oRand.push(R[o * 3], R[o * 3 + 1], R[o * 3 + 2]);
      oMember.push(M[o]);
      bright.push(b);
    };
    for (const i of idx) {
      const x = W[i * 3], y = W[i * 3 + 1], z = W[i * 3 + 2], ri = field.aRadius[i];
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
      const near: [number, number][] = [];
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
        const bucket = grid.get(`${cx + a},${cy + b},${cz + c}`);
        if (!bucket) continue;
        for (const j of bucket) {
          if (j === i || Math.abs(field.aRadius[j] - ri) > WEB_MAX_DR) continue;
          const d2 = (W[j * 3] - x) ** 2 + (W[j * 3 + 1] - y) ** 2 + (W[j * 3 + 2] - z) ** 2;
          if (d2 < max2 && d2 > 1) near.push([d2, j]);
        }
      }
      near.sort((p, q) => p[0] - q[0]);
      // irregular degree (1..WEB_NEIGHBOURS): avoids a uniform lattice
      const take = Math.min(near.length, 1 + Math.floor(hash01(i * 31 + 7) * WEB_NEIGHBOURS));
      for (let t = 0; t < take; t++) {
        const j = near[t][1];
        const pk = i < j ? `${i}:${j}` : `${j}:${i}`;
        if (seen.has(pk)) continue;
        seen.add(pk);
        linked.add(i);
        linked.add(j);
        // shorter connectors are a touch brighter; some strands carry more light so the web has knots
        const len = Math.sqrt(near[t][0]);
        const b = WEB_STRAND_GAIN * (0.35 + 0.65 * hash01(i * 7 + j)) * (1 - 0.5 * (len / WEB_MAX_LEN));
        push(i, j, b);
        push(j, i, b);
      }
    }

    this.geo.setAttribute("position", new THREE.Float32BufferAttribute(base, 3));
    this.geo.setAttribute("aRand", new THREE.Float32BufferAttribute(rand, 3));
    this.geo.setAttribute("aMember", new THREE.Float32BufferAttribute(member, 1));
    this.geo.setAttribute("aBright", new THREE.Float32BufferAttribute(bright, 1));
    this.geo.setAttribute("aOtherBase", new THREE.Float32BufferAttribute(oBase, 3));
    this.geo.setAttribute("aOtherRand", new THREE.Float32BufferAttribute(oRand, 3));
    this.geo.setAttribute("aOtherMember", new THREE.Float32BufferAttribute(oMember, 1));

    const sh = engine.shared;
    const depthFx = engine.shaderMaterial?.uniforms.uDepthFx ?? { value: 1 };
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uReveal: this.uReveal,
        uLinks: sh.uLinks,
        uDepthFx: depthFx,
        uClock: sh.uClock,
        uFlowTotal: sh.uFlowTotal,
        uFlowBlend: sh.uFlowBlend,
        uTurbTime: sh.uTurbTime,
        uTurbulence: sh.uTurbulence,
        uPulse: sh.uPulse,
        uReducedMotion: sh.uReducedMotion,
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const lines = new THREE.LineSegments(this.geo, this.mat);
    lines.frustumCulled = false;
    lines.raycast = () => {};
    lines.renderOrder = 1;
    this.group.add(lines);
    this.group.name = "BRAIN_NEURAL_WEB";
    this.group.visible = false;
    this.stats = { particlesLinked: linked.size, strands: seen.size };
    parent.add(this.group);
  }

  /** reveal 0..1 (0 = CORE, untouched). Motion comes entirely from the particles themselves. */
  update(reveal: number) {
    this.uReveal.value = reveal;
    this.group.visible = reveal > 0.002;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
    this.group.parent?.remove(this.group);
  }
}
