import * as THREE from "three";
import type { GraphNode, GraphLink, GraphCategory } from "@/lib/spatial/obsidianReader";

export const CORE_DEPTH = -70;

export const ZOOM_TIERS = {
  HOME: { z: 950, label: "Home (Core)", name: "home" },
  BRAIN: { z: 460, label: "AI Brain (Graph)", name: "brain" },
  DASHBOARD: { z: 160, label: "Dashboard (HUD)", name: "dashboard" },
  CORE: { z: -70, label: "CORE (Pipeline)", name: "core" },
} as const;

export type ZoomTierName = "home" | "brain" | "dashboard" | "core";

/**
 * Soft radial-gradient glow sprite texture, same technique as the existing
 * Brain's `createHaloTexture` (NeuralBrainCanvas.tsx) — this is what actually
 * produces a realistic glow/bloom look with plain WebGL materials (no
 * postprocessing bloom pass needed). Cached per color since many nodes/stars
 * reuse the same few category colors.
 */
const glowTextureCache = new Map<string, THREE.Texture>();
export function getGlowTexture(colorHex: string): THREE.Texture {
  const cached = glowTextureCache.get(colorHex);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Texture();

  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, colorHex);
  gradient.addColorStop(0.3, colorHex);
  gradient.addColorStop(0.7, "rgba(255, 255, 255, 0.12)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  glowTextureCache.set(colorHex, texture);
  return texture;
}

/** Small soft round dot (no hard-edged color stop), used for the ambient
 *  starfield so it reads as soft light instead of hard flat squares. */
let starDotTexture: THREE.Texture | null = null;
export function getStarDotTexture(): THREE.Texture {
  if (starDotTexture) return starDotTexture;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Texture();

  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,0.95)");
  gradient.addColorStop(0.4, "rgba(180,210,255,0.5)");
  gradient.addColorStop(1, "rgba(180,210,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);

  starDotTexture = new THREE.CanvasTexture(canvas);
  starDotTexture.needsUpdate = true;
  return starDotTexture;
}

export interface GrowthRecord {
  node: GraphNode;
  parent: GrowthRecord | null;
  link: GraphLink | null;
  index: number;
  home: { x: number; y: number; z: number };
  born: number;
  origin: { x: number; y: number; z: number } | null;
}

export interface GrowthPlan {
  records: GrowthRecord[];
  byNode: Map<string, GrowthRecord>;
  treeLinks: Set<GraphLink>;
  duration: number;
}

/**
 * Spherical and dual-hemisphere layout algorithm ported from AIS-OS 3D-brain reference.
 * Distributes nodes evenly along spherical sectors by category with a soft dual-hemisphere brain envelope.
 */
export function layoutSpatialGlobe(nodes: GraphNode[], categories: GraphCategory[]) {
  if (!nodes.length) return;

  const validCategories = categories.length > 0 ? categories : [{ id: "vault", label: "Vault", color: "#38bdf8", count: nodes.length }];

  validCategories.forEach((cat, sector) => {
    const list = nodes.filter((n) => n.source === cat.id).sort((a, b) => a.id.localeCompare(b.id));
    if (!list.length) return;

    list.forEach((n, i) => {
      const yNorm = 1 - 2 * ((i + 0.5) / list.length);
      const turn = (i * 0.61803398875) % 1;
      const angle = ((sector + 0.08 + turn * 0.84) / validCategories.length) * Math.PI * 2;
      const baseRadius = 260 + 60 * ((i * 0.754877666) % 1);
      const horizontal = Math.sqrt(Math.max(0, 1 - yNorm * yNorm));

      // Dual-hemisphere anatomical shaping: slight elongation along Z and separation along X
      const hemisphereSide = Math.sin(angle) >= 0 ? 1 : -1;
      const separation = 18 * hemisphereSide;

      const posX = baseRadius * horizontal * Math.sin(angle) + separation;
      const posY = baseRadius * yNorm * 0.88;
      const posZ = baseRadius * horizontal * Math.cos(angle) * 1.12;

      n.x = n.fx = posX;
      n.y = n.fy = posY;
      n.z = n.fz = posZ;
    });
  });

  // Handle any orphan nodes without matched categories
  nodes.filter((n) => n.x === undefined).forEach((n, i) => {
    const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2;
    n.x = n.fx = Math.sin(angle) * 280;
    n.y = n.fy = (Math.random() - 0.5) * 180;
    n.z = n.fz = Math.cos(angle) * 280;
  });
}

/**
 * Creates orbital rings, rotating beads, and central core halo around the AI Assistant Core.
 * Ported from AIS-OS 3d-brain constellation.js with GrowForge electric-blue & gold styling.
 */
export function createCoreOrbitals(scene: THREE.Scene | THREE.Group) {
  const group = new THREE.Group();
  scene.add(group);
  const rings: { ring: THREE.Line; bead: THREE.Mesh; radius: number }[] = [];

  const ringColors = [0x0078ff, 0x38bdf8, 0xffc432];

  for (let i = 0; i < 3; i++) {
    const radius = 380 + i * 45;
    const points = Array.from({ length: 181 }, (_, j) => {
      const a = (j / 180) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0);
    });

    const ring = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({
        color: ringColors[i % ringColors.length],
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      })
    );

    ring.rotation.set(i === 0 ? 0.8 : i === 1 ? -0.5 : 0.2, i === 0 ? -0.4 : 0.45, 0.15 * i);
    group.add(ring);

    const bead = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 12, 10),
      new THREE.MeshBasicMaterial({ color: i === 2 ? 0xffd970 : 0xbae6fd })
    );
    ring.add(bead);
    rings.push({ ring, bead, radius });
  }

  // Central geometric icosahedron core
  const coreMesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(44, 2),
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x00d8ff,
      emissiveIntensity: 0.8,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    })
  );
  coreMesh.userData = { isCoreOrb: true, label: "AI Assistant Core" };
  group.add(coreMesh);

  // Dense luminous particle core / cloud (Home tier visual identity)
  const coreParticleCount = 650;
  const coreParticleGeo = new THREE.BufferGeometry();
  const coreParticlePos = new Float32Array(coreParticleCount * 3);
  const coreParticleScales = new Float32Array(coreParticleCount);
  const coreParticleOriginalR = new Float32Array(coreParticleCount);
  const coreParticleSpeed = new Float32Array(coreParticleCount);

  for (let i = 0; i < coreParticleCount; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);
    const r = 24 + Math.pow(Math.random(), 1.8) * 110;
    const sinPhi = Math.sin(phi);

    coreParticlePos[i * 3] = r * sinPhi * Math.cos(theta);
    coreParticlePos[i * 3 + 1] = r * sinPhi * Math.sin(theta);
    coreParticlePos[i * 3 + 2] = r * Math.cos(phi);

    coreParticleScales[i] = 3.0 + Math.random() * 5.0;
    coreParticleOriginalR[i] = r;
    coreParticleSpeed[i] = (Math.random() * 0.4 + 0.2) * (Math.random() > 0.5 ? 1 : -1);
  }

  coreParticleGeo.setAttribute("position", new THREE.BufferAttribute(coreParticlePos, 3));
  const coreParticleMat = new THREE.PointsMaterial({
    color: 0x67e8f9,
    size: 6.5,
    map: getStarDotTexture(),
    transparent: true,
    opacity: 0.75,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const coreParticlePoints = new THREE.Points(coreParticleGeo, coreParticleMat);
  coreParticlePoints.userData = { isCoreOrb: true };
  group.add(coreParticlePoints);

  // Outer soft glow sprite — wide, luminous halo
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const glow = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    glow.addColorStop(0, "rgba(56, 189, 248, 0.85)");
    glow.addColorStop(0.25, "rgba(0, 120, 255, 0.35)");
    glow.addColorStop(0.7, "rgba(255, 196, 50, 0.12)");
    glow.addColorStop(1, "rgba(11, 18, 32, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 128, 128);
  }

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  sprite.scale.set(380, 380, 1);
  sprite.userData = { isCoreOrb: true };
  group.add(sprite);

  // Inner hot-white core sprite — tight, near-opaque
  const hotSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: getGlowTexture("rgba(255,255,255,0.98)"),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  hotSprite.scale.set(115, 115, 1);
  hotSprite.userData = { isCoreOrb: true };
  group.add(hotSprite);

  // Eased 0..1 hover intensity — approaches the target each frame instead of
  // snapping, so the glow fades in/out smoothly regardless of frame rate.
  // Deliberately NOT used anywhere near rotation (see update() below): the
  // previous version multiplied rotation *speed* by a hover boost, which,
  // since rotation is driven by continuously-increasing elapsed time,
  // caused the angle to jump discontinuously the instant hover toggled —
  // that's what actually looked like "the shape changing," not a real
  // shape change. Rotation now always runs at a constant rate, hover or not.
  let hoverIntensity = 0;

  return {
    group,
    coreMesh,
    /**
     * @param proximityTarget 0..1, continuous — how close the cursor is to
     * the core right now (1 = right on it, 0 = far away or off-canvas), NOT
     * a hover boolean. The caller (SpatialCanvas.tsx) computes this fresh
     * every frame from real screen-space cursor distance; this function is
     * the only place it gets smoothed, so the glow visibly ramps up the
     * closer the cursor gets, rather than snapping on contact.
     */
    update(t: number, isFocused: boolean, zoomZ: number, proximityTarget: number = 0) {
      // Ease toward the target (~0.5s to fully settle at 60fps — deliberately
      // slower than a UI hover state, since this should read as the core
      // "waking up" gradually, not a snap) instead of jumping instantly.
      const hoverTarget = THREE.MathUtils.clamp(proximityTarget, 0, 1);
      hoverIntensity += (hoverTarget - hoverIntensity) * 0.05;

      // Rotation speed is constant regardless of hover — only brightness reacts.
      coreMesh.rotation.set(t * 0.08, t * 0.11, 0);

      // Core glow scales with zoom depth (brightest at Home z=950, softly subdued when zoomed into Graph z=460)
      const zoomFactor = THREE.MathUtils.clamp((zoomZ - 200) / 750, 0.3, 1.0);
      const pulse = Math.sin(t * 1.2) * 0.12;
      const glowBoost = 1.0 + hoverIntensity * 0.25;

      sprite.material.opacity = (isFocused ? 0.4 : 0.82 + pulse) * zoomFactor * glowBoost;
      hotSprite.material.opacity = (isFocused ? 0.6 : 0.9 + pulse) * zoomFactor * (1.0 + hoverIntensity * 0.3);

      const targetScale = (115 + pulse * 18) * (1.0 + hoverIntensity * 0.2);
      hotSprite.scale.set(targetScale, targetScale, 1);

      // Rotate and animate dense particle cloud — same constant rate, hover-independent.
      coreParticlePoints.rotation.y = t * 0.05;
      coreParticlePoints.rotation.x = Math.sin(t * 0.03) * 0.2;
      coreParticleMat.opacity = (0.75 + pulse * 0.15) * zoomFactor * glowBoost;

      rings.forEach(({ ring, bead, radius }, i) => {
        ring.rotation.z = t * (i % 2 === 0 ? 0.015 : -0.02);
        bead.position.set(Math.cos(t * 0.18 + i * 2.1) * radius, Math.sin(t * 0.18 + i * 2.1) * radius, 0);
        (ring.material as THREE.LineBasicMaterial).opacity = (isFocused ? 0.06 : 0.18) * zoomFactor * (1.0 + hoverIntensity * 0.4);
      });
    },
    dispose() {
      scene.remove(group);
      coreParticleGeo.dispose();
      coreParticleMat.dispose();
    },
  };
}

/**
 * Plan connectivity replay growth timeline from roots across real edges.
 * Ported from AIS-OS growth.js.
 */
export function planGrowth(nodes: GraphNode[], links: GraphLink[]): GrowthPlan {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const adjacent = new Map<string, { id: string; link: GraphLink }[]>();
  nodes.forEach((n) => adjacent.set(n.id, []));

  for (const link of links) {
    const a = typeof link.source === "object" ? (link.source as { id: string }).id : link.source;
    const b = typeof link.target === "object" ? (link.target as { id: string }).id : link.target;
    if (!byId.has(a) || !byId.has(b)) continue;
    adjacent.get(a)?.push({ id: b, link });
    adjacent.get(b)?.push({ id: a, link });
  }

  const ranked = [...nodes].sort((a, b) => (b.degree || 0) - (a.degree || 0) || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  const records: GrowthRecord[] = [];
  const byNode = new Map<string, GrowthRecord>();

  const append = (node: GraphNode, parent: GrowthRecord | null = null, link: GraphLink | null = null) => {
    const record: GrowthRecord = {
      node,
      parent,
      link,
      index: records.length,
      home: { x: node.x ?? 0, y: node.y ?? 0, z: node.z ?? 0 },
      born: 0,
      origin: parent ? { ...parent.home } : null,
    };
    records.push(record);
    byNode.set(node.id, record);
    seen.add(node.id);
    return record;
  };

  for (const seed of ranked) {
    if (seen.has(seed.id)) continue;
    const queue = [append(seed)];
    for (let q = 0; q < queue.length; q++) {
      const parent = queue[q];
      const available = (adjacent.get(parent.node.id) || []).filter((item) => !seen.has(item.id));
      for (const next of available.slice(0, 3)) {
        const targetNode = byId.get(next.id);
        if (targetNode) queue.push(append(targetNode, parent, next.link));
      }
      if (available.length > 3) queue.push(parent);
    }
  }

  records.forEach((record, i) => {
    record.born = i === 0 ? 0 : i === 1 ? 1.0 : i === 2 ? 2.0 : 2.5 + 24 * Math.pow((i - 2) / Math.max(1, records.length - 3), 0.62);
  });

  return {
    records,
    byNode,
    treeLinks: new Set(records.map((r) => r.link).filter((l): l is GraphLink => l !== null)),
    duration: 28,
  };
}

export function growthPosition(record: GrowthRecord, t: number) {
  const age = Math.max(0, t - record.born);
  const u = Math.min(1, age / 1.5);
  const spring = u >= 1 ? 1 : 1 - Math.exp(-5 * u) * Math.cos(7 * u);
  const spread = 0.18 + 0.82 * Math.min(1, t / 25);
  const origin = record.origin || { x: 0, y: 0, z: 0 };
  const progress = record.index === 0 ? Math.min(1, t / 16) : spring;

  return {
    x: origin.x + (record.home.x * spread - origin.x) * progress,
    y: origin.y + (record.home.y * spread - origin.y) * progress,
    z: origin.z + (record.home.z * spread - origin.z) * progress,
  };
}
