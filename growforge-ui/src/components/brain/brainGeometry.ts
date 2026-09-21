/**
 * Procedural Anatomical Brain Point Cloud & Topology Geometry Generator
 *
 * Generates an organic, dual-hemisphere human brain silhouette point cloud
 * (cerebral cortex with gyri/sulci convolutions, longitudinal fissure,
 * temporal lobes, cerebellum, and brainstem) using mathematical parametric deformations.
 *
 * Zero external 3D assets — 100% code-generated and deterministic.
 * Seeded with per-user identity hash for unique internal arrangement while
 * maintaining the anatomical silhouette.
 */

import type { BrainLobe } from "@/lib/telemetryStore";

export interface PointMetadata {
  baseX: number;
  baseY: number;
  baseZ: number;
  lobe: BrainLobe;
  hemisphere: "left" | "right" | "center";
  region: "cortex" | "temporal" | "cerebellum" | "stem" | "deep";
  layer: number; // 0 = inner/deep, 1 = surface shell
}

export interface ProceduralBrainShellData {
  positions: Float32Array;
  colors: Float32Array;
  metadata: PointMetadata[];
  count: number;
}

/** 32-bit FNV-1a + Murmur-style deterministic string hashing */
export function hashString(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Fast, robust Mulberry32 pseudo-random number generator */
export function createPrng(seed: number) {
  let s = seed >>> 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Maps 3D anatomical coordinates to cognitive brain lobes:
 * - frontal / superior anterior -> creative_strategy (left) / growth_expansion (right)
 * - midbrain / central axis -> neural_core
 * - inferior / temporal / ads -> performance_media (right) / analytics_governance (left)
 * - posterior / occipital / cerebellum -> analytics_governance (left) / growth_expansion (right)
 */
export function getLobeForCoordinates(x: number, y: number, z: number): BrainLobe {
  const isLeft = x < -6;
  const isRight = x > 6;

  // Central core / midbrain
  if (!isLeft && !isRight && Math.abs(z) < 35 && y > -25) {
    return "neural_core";
  }

  // Anterior / Frontal region (z > 10)
  if (z >= 10) {
    if (y < -10) {
      // Inferior frontal / temporal anterior
      return isRight ? "performance_media" : "analytics_governance";
    }
    return isRight ? "growth_expansion" : "creative_strategy";
  }

  // Middle temporal / Parietal region (-20 <= z < 10)
  if (z >= -20) {
    if (y > 15) {
      return isRight ? "growth_expansion" : "creative_strategy";
    }
    return isRight ? "performance_media" : "analytics_governance";
  }

  // Posterior / Occipital & Cerebellar region (z < -20)
  if (y < -15) {
    return isRight ? "growth_expansion" : "neural_core";
  }
  return isRight ? "performance_media" : "analytics_governance";
}

/** Canonical anatomical anchor points on the procedural brain shell for real nodes */
export const ANATOMICAL_LOBE_ANCHORS: Record<
  BrainLobe,
  { left: [number, number, number]; right: [number, number, number]; center: [number, number, number] }
> = {
  neural_core: {
    center: [0, 8, 12],
    left: [-42, -32, -16],
    right: [42, -32, -16],
  },
  creative_strategy: {
    left: [-48, 18, 24],
    center: [-25, 28, 10],
    right: [-48, 18, 24], // fallback
  },
  growth_expansion: {
    right: [48, 18, 24],
    center: [25, 28, 10],
    left: [48, 18, 24], // fallback
  },
  performance_media: {
    right: [46, -18, 28],
    center: [30, -15, 15],
    left: [46, -18, 28], // fallback
  },
  analytics_governance: {
    left: [-46, -18, 22],
    center: [-25, -12, 10],
    right: [-46, -18, 22], // fallback
  },
};

/**
 * Generate the ambient point shell forming the brain silhouette.
 *
 * @param userSeedKey String identity for deterministic seeding (e.g. user ID / profile name)
 * @param pointCount Total points to generate (default 3,200)
 */
export function generateProceduralBrainShell(
  userSeedKey = "growforge-default-operator",
  pointCount = 3200
): ProceduralBrainShellData {
  const seed = hashString(`gf-brain-shell-${userSeedKey}`);
  const prng = createPrng(seed);

  const positions = new Float32Array(pointCount * 3);
  const colors = new Float32Array(pointCount * 3);
  const metadata: PointMetadata[] = [];

  // Base resting color: Electric Blue (#0078FF -> r:0.0, g:0.47, b:1.0)
  const baseR = 0.0;
  const baseG = 0.47;
  const baseB = 1.0;

  // Distribution quotas:
  // - 72% Surface Cortical Shell (dual hemispheres with gyri/sulci convolutions)
  // - 14% Temporal Lobes & Inferior Structures
  // - 9% Cerebellum (dense bilateral posterior-inferior cluster)
  // - 5% Brainstem & Deep Midbrain Pathways
  const cortexQuota = Math.floor(pointCount * 0.72);
  const temporalQuota = Math.floor(pointCount * 0.14);
  const cerebellumQuota = Math.floor(pointCount * 0.09);
  const stemQuota = pointCount - cortexQuota - temporalQuota - cerebellumQuota;

  let pIdx = 0;

  function addPoint(
    x: number,
    y: number,
    z: number,
    region: PointMetadata["region"],
    layer = 1
  ) {
    if (pIdx >= pointCount) return;

    // Add subtle organic jitter from user seed (within ±1.2 units)
    const jx = (prng() - 0.5) * 2.2;
    const jy = (prng() - 0.5) * 2.2;
    const jz = (prng() - 0.5) * 2.2;

    const finalX = x + jx;
    const finalY = y + jy;
    const finalZ = z + jz;

    const lobe = getLobeForCoordinates(finalX, finalY, finalZ);
    const hemisphere: PointMetadata["hemisphere"] =
      finalX < -4 ? "left" : finalX > 4 ? "right" : "center";

    const i3 = pIdx * 3;
    positions[i3] = finalX;
    positions[i3 + 1] = finalY;
    positions[i3 + 2] = finalZ;

    // Resting electric blue shade with layer-depth modulation
    const brightness = layer === 1 ? 0.85 + prng() * 0.3 : 0.45 + prng() * 0.3;
    colors[i3] = baseR * brightness;
    colors[i3 + 1] = baseG * brightness;
    colors[i3 + 2] = baseB * brightness;

    metadata.push({
      baseX: finalX,
      baseY: finalY,
      baseZ: finalZ,
      lobe,
      hemisphere,
      region,
      layer,
    });

    pIdx++;
  }

  // 1. Dual-Hemisphere Cortical Shell
  for (let i = 0; i < cortexQuota; i++) {
    const isLeft = prng() < 0.5;
    const hSign = isLeft ? -1 : 1;

    // Spherical polar angles with even distribution
    const u = prng();
    const v = prng();
    const theta = Math.acos(2 * u - 1); // 0 to PI
    const phi = 2 * Math.PI * v; // 0 to 2PI

    // Hemisphere center offset
    const hCenterX = hSign * 27;
    const hCenterY = 5;
    const hCenterZ = 2;

    // Semi-axes for cerebral ellipsoid
    const rx = 34;
    const ry = 38;
    const rz = 52;

    let x = hCenterX + rx * Math.sin(theta) * Math.cos(phi);
    let y = hCenterY + ry * Math.cos(theta);
    let z = hCenterZ + rz * Math.sin(theta) * Math.sin(phi);

    // Anatomical Deformations:
    // A. Longitudinal Fissure (medial flattening where hemispheres meet)
    if (hSign === -1 && x > -5) {
      x = -5 - prng() * 4;
    } else if (hSign === 1 && x < 5) {
      x = 5 + prng() * 4;
    }

    // B. Superior parietal dome arching
    if (y > 15) {
      y += Math.sin((z + 10) * 0.03) * 6;
    }

    // C. Anterior frontal taper
    if (z > 25) {
      x *= 0.92;
      y = y * 0.95 + 4;
    }

    // D. Posterior occipital rounding
    if (z < -25) {
      x *= 0.88;
      y = y * 0.9 - 2;
    }

    // E. Cortical Sulci & Gyri (surface folding harmonic displacement)
    const gyriFold =
      Math.sin(x * 0.15 + y * 0.18) * Math.cos(z * 0.16) * 3.8 +
      Math.sin(y * 0.22 + z * 0.26) * 2.4 +
      Math.cos(x * 0.28 - z * 0.2) * 1.8;

    const layer = prng() < 0.82 ? 1 : 0.5; // 82% surface shell, 18% sub-cortical
    const foldFactor = layer === 1 ? gyriFold : gyriFold * 0.3;

    // Apply fold displacement along radial normal
    const dist = Math.sqrt((x - hCenterX) ** 2 + (y - hCenterY) ** 2 + (z - hCenterZ) ** 2) || 1;
    x += ((x - hCenterX) / dist) * foldFactor;
    y += ((y - hCenterY) / dist) * foldFactor;
    z += ((z - hCenterZ) / dist) * foldFactor;

    if (layer < 1) {
      // Subsurface point pushed inward
      x = hCenterX + (x - hCenterX) * (0.65 + prng() * 0.25);
      y = hCenterY + (y - hCenterY) * (0.65 + prng() * 0.25);
      z = hCenterZ + (z - hCenterZ) * (0.65 + prng() * 0.25);
    }

    addPoint(x, y, z, "cortex", layer);
  }

  // 2. Temporal Lobes (Bilateral Inferior Lateral Arcs)
  for (let i = 0; i < temporalQuota; i++) {
    const isLeft = prng() < 0.5;
    const hSign = isLeft ? -1 : 1;

    const t = prng(); // 0 to 1 along anterior curve
    const tx = hSign * (38 + prng() * 12);
    const ty = -12 - Math.sin(t * Math.PI) * 16 - prng() * 8;
    const tz = -15 + t * 42; // extends anteriorly

    // Gyri fold modulation on temporal cortex
    const fold = Math.sin(tx * 0.2 + tz * 0.3) * 2.5;

    addPoint(tx + fold, ty, tz + fold, "temporal", 1);
  }

  // 3. Cerebellum (Bilateral Posterior-Inferior Rounded Clusters)
  for (let i = 0; i < cerebellumQuota; i++) {
    const isLeft = prng() < 0.5;
    const hSign = isLeft ? -1 : 1;

    const cx = hSign * (18 + prng() * 16);
    const cy = -32 - prng() * 18;
    const cz = -38 + (prng() - 0.5) * 24;

    // Transverse cerebellar folia pattern (tight horizontal ridges)
    const folia = Math.sin(cy * 0.55) * 1.6;

    addPoint(cx + folia, cy, cz + folia, "cerebellum", 1);
  }

  // 4. Brainstem & Midbrain Column
  for (let i = 0; i < stemQuota; i++) {
    const t = prng(); // vertical descent
    const sy = -20 - t * 45; // extends down to -65
    const taper = (1 - t * 0.45);
    const sx = (prng() - 0.5) * 12 * taper;
    const sz = -10 - t * 12 + (prng() - 0.5) * 10 * taper;

    addPoint(sx, sy, sz, "stem", 0.6);
  }

  return {
    positions,
    colors,
    metadata,
    count: pIdx,
  };
}

/**
 * Calculates a deterministic node position on or near the brain shell
 * for a specific user and node ID.
 */
export function calculateNodeBrainPosition(
  nodeId: string,
  lobe: BrainLobe,
  hemisphere: "left" | "right" | "center",
  userSeedKey = "growforge-default-operator"
): [number, number, number] {
  const anchors = ANATOMICAL_LOBE_ANCHORS[lobe] || ANATOMICAL_LOBE_ANCHORS.neural_core;
  const baseAnchor = anchors[hemisphere] || anchors.center || [0, 8, 12];

  if (nodeId === "hq") {
    return [0, 8, 10];
  }

  const seed = hashString(`${userSeedKey}:${nodeId}:${lobe}`);
  const prng = createPrng(seed);

  // Deterministic orbital displacement around the lobe anchor (within ±6 units)
  const angle = prng() * Math.PI * 2;
  const elevation = (prng() - 0.5) * 10;
  const radius = 3 + prng() * 6;

  const x = baseAnchor[0] + Math.cos(angle) * radius;
  const y = baseAnchor[1] + elevation;
  const z = baseAnchor[2] + Math.sin(angle) * radius;

  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(z * 10) / 10];
}
