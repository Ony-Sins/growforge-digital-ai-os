import type { CoreQualityTier } from "./neutronCoreTypes";
import { QUALITY_CONFIGS } from "./neutronCoreTypes";

/**
 * Shared, deterministic CORE particle source.
 *
 * Both the CORE points shader and the BRAIN membrane / dendrite renderers read
 * particle identity from here, so "the same particle" is literally the same
 * index in the same buffer, and its world position is the same function
 * (`coreParticleWorld` in GLSL and `computeCoreParticle` below).
 *
 * Buffer layout (index order is the particle's canonical identity):
 *   [0 .. MEMBER_COUNT)          link members — tier-independent, own PRNG stream
 *   [MEMBER_COUNT .. )           nucleus, mantle, atmosphere (tier-dependent counts)
 * Members are ordinary atmosphere particles (same radius law r = 70 + u^1.3 * 150,
 * same size range, same look in CORE); they are simply the ones that can later
 * link up. There is no separate shell or band.
 */

export const MEMBER_COUNT = 900;

/** Angular speed (rad/s per unit flow-time) the outer atmosphere blends toward in BRAIN (~ its natural mean). */
export const RIGID_OMEGA = 0.07;

export const NUCLEUS_MESH_RADIUS = 44;

export function pseudoRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** Deterministic 32-bit hash -> [0,1). */
export function hash01(n: number): number {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

export interface CoreParticleBuffers {
  count: number;
  positions: Float32Array; // base positions (x,y,z)
  aRandom: Float32Array; // vec3
  aRadius: Float32Array;
  aScale: Float32Array;
  aMember: Float32Array; // 1 for membrane members
  atmosphereStart: number;
  atmosphereEnd: number;
}

export function coreParticleCount(tier: CoreQualityTier): number {
  const cfg = QUALITY_CONFIGS[tier];
  return cfg.nucleusCount + cfg.flowCount + cfg.atmosphereCount;
}

/**
 * Generates the CORE particle buffers. Members come first from an independent
 * PRNG stream so their identity never changes when the quality tier does.
 */
export function generateCoreParticles(tier: CoreQualityTier): CoreParticleBuffers {
  const cfg = QUALITY_CONFIGS[tier];
  const total = cfg.nucleusCount + cfg.flowCount + cfg.atmosphereCount;
  const positions = new Float32Array(total * 3);
  const aRandom = new Float32Array(total * 3);
  const aRadius = new Float32Array(total);
  const aScale = new Float32Array(total);
  const aMember = new Float32Array(total);

  let idx = 0;
  const put = (r: number, theta: number, phi: number, rnd: () => number, scale: number, member: number) => {
    const sinPhi = Math.sin(phi);
    positions[idx * 3] = r * sinPhi * Math.cos(theta);
    positions[idx * 3 + 1] = r * sinPhi * Math.sin(theta);
    positions[idx * 3 + 2] = r * Math.cos(phi);
    aRandom[idx * 3] = rnd();
    aRandom[idx * 3 + 1] = rnd();
    aRandom[idx * 3 + 2] = rnd();
    aRadius[idx] = r;
    aScale[idx] = scale;
    aMember[idx] = member;
    idx++;
  };

  // 0. Link members: atmosphere particles from an independent stream (fixed count).
  const mrand = pseudoRandom(20260928);
  for (let i = 0; i < MEMBER_COUNT; i++) {
    const theta = mrand() * 2 * Math.PI;
    const phi = Math.acos(2 * mrand() - 1);
    // near-core field (r 50..155): the particles that already orbit closest to the nucleus
    const r = 50 + Math.pow(mrand(), 1.15) * 105;
    put(r, theta, phi, mrand, 0.4 + mrand() * 0.55, 1);
  }

  const rand = pseudoRandom(20260926);

  // 1. Dense central nucleus: r in [0, 36]
  for (let i = 0; i < cfg.nucleusCount; i++) {
    const theta = rand() * 2 * Math.PI;
    const phi = Math.acos(2 * rand() - 1);
    const r = Math.pow(rand(), 2.2) * 36;
    put(r, theta, phi, rand, 0.85 + rand() * 0.45, 0);
  }

  // 2. Volumetric mantle: r in [25, 120]
  for (let i = 0; i < cfg.flowCount; i++) {
    const theta = rand() * 2 * Math.PI;
    const phi = Math.acos(2 * rand() - 1);
    const r = 25 + Math.pow(rand(), 1.4) * 95;
    put(r, theta, phi, rand, 0.6 + rand() * 0.7, 0);
  }

  // 3. Remaining atmosphere: r in [70, 220] (members above are part of the same population).
  const atmosphereStart = idx;
  const atmosphereTarget = cfg.atmosphereCount - MEMBER_COUNT;
  let placed = 0;
  let guard = 0;
  while (placed < atmosphereTarget && guard < atmosphereTarget * 8) {
    guard++;
    const theta = rand() * 2 * Math.PI;
    const phi = Math.acos(2 * rand() - 1);
    const r = 70 + Math.pow(rand(), 1.3) * 150;
    put(r, theta, phi, rand, 0.4 + rand() * 0.55, 0);
    placed++;
  }
  const atmosphereEnd = idx;

  return {
    count: idx,
    positions: positions.subarray(0, idx * 3),
    aRandom: aRandom.subarray(0, idx * 3),
    aRadius: aRadius.subarray(0, idx),
    aScale: aScale.subarray(0, idx),
    aMember: aMember.subarray(0, idx),
    atmosphereStart,
    atmosphereEnd,
  };
}

/**
 * Motion state shared with the shaders (mirrors the GLSL uniforms).
 *
 * Rotation about Y is  angle = w*(F - m*B) + RIGID_OMEGA*m*B + phase,  where
 *   w = per-particle angular speed from its unperturbed radius,
 *   m = smoothstep(50, 90, r)  (outer shell follows the rigid neural frame),
 *   F = integral of flowRate dt              (flowTotal)
 *   B = integral of flowRate * rigidBlend dt (flowBlend)
 * Both are monotonic integrals, so changing the blend only changes rates -
 * never the angle itself - which is what keeps the CORE<->BRAIN handoff free
 * of snaps. The rigid neural frame angle is RIGID_OMEGA * B.
 */
export interface CoreMotionState {
  flowTotal: number;
  flowBlend: number;
  turbTime: number;
  turbulence: number;
  pulse: number;
  reducedMotion: boolean;
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * CPU replica of `coreParticleWorld` (see coreMotionGlsl.ts). Keep in lockstep.
 * Used only for membrane relinking and gate binding; rendering is GPU-exact.
 */
export function computeCoreParticle(
  out: { x: number; y: number; z: number },
  bx: number,
  by: number,
  bz: number,
  rx: number,
  ry: number,
  rz: number,
  st: CoreMotionState,
): void {
  let px = bx;
  let py = by;
  let pz = bz;
  const origR = Math.sqrt(bx * bx + by * by + bz * bz);
  if (!st.reducedMotion) {
    const invR = origR > 0.001 ? 1 / origR : 0;
    const nx0 = origR > 0.001 ? bx * invR : 0;
    const ny0 = origR > 0.001 ? by * invR : 1;
    const nz0 = origR > 0.001 ? bz * invR : 0;

    // 1. breathing pulse
    const pulseEffect = (st.pulse - 1) * Math.exp(-origR / 80);
    px += nx0 * pulseEffect * origR;
    py += ny0 * pulseEffect * origR;
    pz += nz0 * pulseEffect * origR;

    // 2. convective currents
    const convPhase = st.turbTime * 1.2 + ry * 6.28318;
    const turbIntensity = smoothstep(2, 24, origR) * (1.1 + st.turbulence * 1.5) * Math.exp(-origR / 180) * rz;
    const cx = Math.sin(convPhase + origR * 0.04 + rx * 3.14159) * turbIntensity;
    const cy = Math.cos(convPhase * 0.92 + py * 0.04 + rz * 3.14159) * 1.1 * turbIntensity;
    const cz = Math.sin(convPhase * 1.08 + pz * 0.04 + ry * 3.14159) * turbIntensity;
    px += cx;
    py += cy;
    pz += cz;

    // 3. surface wave
    const waveTaper = smoothstep(4, 28, origR);
    const wave = Math.sin(origR * 0.06 - st.turbTime * 1.4 + rz * 6.28318) * (0.6 + st.turbulence * 1.0) * waveTaper;
    const r2 = Math.sqrt(px * px + py * py + pz * pz);
    if (r2 > 0.001) {
      px += (px / r2) * wave;
      py += (py / r2) * wave;
      pz += (pz / r2) * wave;
    }

    // 4. rotation about Y (see CoreMotionState)
    const omega = 0.165 / (1 + Math.pow(origR / 95, 0.65));
    const m = smoothstep(50, 90, origR);
    const angle = omega * (st.flowTotal - m * st.flowBlend) + RIGID_OMEGA * m * st.flowBlend + rx * 6.28318;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const nx = px * cosA - pz * sinA;
    const nz = px * sinA + pz * cosA;
    px = nx;
    pz = nz;
  }
  out.x = px;
  out.y = py;
  out.z = pz;
}
