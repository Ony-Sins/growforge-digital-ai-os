import * as THREE from "three";
import type { GraphCategory, GraphLink, GraphNode } from "@/lib/spatial/obsidianReader";
import { entityType } from "@/lib/spatial/entityPresentation";
import type { NeutronCoreEngine } from "../neutronCore/NeutronCoreEngine";
import { CORE_MOTION_GLSL } from "../neutronCore/coreMotionGlsl";
import { MEMBER_COUNT, computeCoreParticle, hash01 } from "../neutronCore/coreParticleField";
import { AtmosphereLinks } from "./atmosphereLinks";
import type { BrainDrive } from "./brainUniforms";
import { createRecordKnot } from "./recordKnot";
import { SemanticBundles, type SemanticEdge } from "./semanticBundles";

const MAX_CATEGORIES = 16;

interface RecordDef {
  node: GraphNode;
  cat: number;
  isHub: boolean; // a record with several real links
  parentHub: string | null; // the hub this record is really linked to (if any)
  importance: number; // hub 1.0, linked to a hub 0.7, other 0.5
  degree: number;
}

interface KnowledgeSlot {
  def: RecordDef;
  member: number; // index of the real CORE atmosphere particle carrying this record (-1 until assigned)
  hi: number;
  pick: THREE.Mesh;
  world: THREE.Vector3;
  offset: THREE.Vector3; // displacement from orbit while frozen / gliding back
  offsetVel: THREE.Vector3;
  row: number;
  role: string; // role the carrier was chosen for ("hub|" / "|<hubId>" / "|")
}

export interface BrainLabelData {
  labelPriority: number;
  id: string;
  title: string;
  category: string;
  source: string;
  importance: number;
  hi: number;
  world: THREE.Vector3;
}

const RECORD_VERT = /* glsl */ `
  attribute vec3 aRand;
  attribute vec4 aInfo; // size px, seed, hover, category
  attribute float aImp; // importance 0.5 .. 1.0
  attribute vec4 aPin; // xyz displaced position, w = 1 when displaced
  uniform float uLinks;
  uniform float uPxScale;
  uniform float uClock;
  uniform float uCatFade[${MAX_CATEGORIES}];
  uniform float uKnowledge; // 1 only while the BRAIN surface is active
  ${CORE_MOTION_GLSL}
  varying float vA;
  varying float vHover;
  varying float vImp;

  void main() {
    vec3 w = mix(coreParticleWorld(position, aRand), aPin.xyz, step(0.5, aPin.w));
    vec4 mv = modelViewMatrix * vec4(w, 1.0);
    gl_Position = projectionMatrix * mv;
    float depth = max(-mv.z, 1.0);
    float persp = clamp(pow(460.0 / depth, 0.6), 0.55, 1.5);
    // progressive reveal: hub first, then its linked records, then the rest (closer = more legible)
    float start = 0.35 + (1.0 - aImp) * 0.8 + 0.06 * aInfo.y;
    float appear = smoothstep(start, start + 0.22, uLinks);
    float catf = uCatFade[int(aInfo.w + 0.5)];
    // heartbeat: slightly stronger for more important records
    float beat = 0.5 + 0.5 * sin(uClock * (1.3 + aInfo.y * 0.5) + aInfo.y * 40.0);
    vA = uKnowledge * appear * catf * (0.82 + (0.1 + 0.28 * aImp) * beat) * (0.85 + aInfo.z * 0.15);
    vHover = aInfo.z;
    vImp = aImp;
    float size = aInfo.x * uPxScale * persp * (1.0 + aInfo.z * 0.9) * (0.94 + 0.1 * aImp * beat);
    gl_PointSize = clamp(size, 1.0, 18.0 * uPxScale);
  }
`;

const RECORD_FRAG = /* glsl */ `
  varying float vA;
  varying float vHover;
  varying float vImp;
  void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    // tight bright core + slightly tighter halo than the background dust; a thin locator ring only while hovered
    float core = exp(-d * d * 10.0);
    float halo = exp(-d * 3.2) * (0.16 + 0.12 * vImp);
    float ring = exp(-pow((d - 0.8) / 0.07, 2.0)) * smoothstep(0.35, 0.9, vHover) * 0.75;
    vec3 col = mix(vec3(0.6, 0.92, 1.0), vec3(1.0), core);
    gl_FragColor = vec4(col, (core + halo + ring) * vA);
  }
`;

function fnv(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * BRAIN = the CORE's surrounding particle field connecting up. Nothing is added
 * around the core: faint sinuous filaments link atmosphere particles that already
 * orbit it (AtmosphereLinks). Real knowledge records are carried by a subset of those
 * same particles, drawn as small tight-cored points with a subtle hierarchy; a hub's
 * really-linked records are carried by the hub's nearest neighbours, so real
 * relationships read as a local cluster with its own brighter filaments and outward
 * data pulses - never as long lines across the field.
 */
export class BrainField {
  public readonly group = new THREE.Group();
  private scene: THREE.Scene;
  private engine: NeutronCoreEngine;

  private links: AtmosphereLinks;
  private semantic = new SemanticBundles();
  private adjacency = new Map<string, Set<string>>();
  private recordGeo: THREE.BufferGeometry | null = null;
  private recordPoints: THREE.Points;
  private recordMat: THREE.ShaderMaterial;

  private uPxScale = { value: 1 };
  private uCatFade = { value: new Array<number>(MAX_CATEGORIES).fill(1) };
  private uKnowledge = { value: 0 };
  private interactive = false;

  private slots = new Map<string, KnowledgeSlot>();
  private trialKnots = new Map<string, ReturnType<typeof createRecordKnot>>();
  private signature = "";
  private catIds: string[] = [];
  private catTarget: number[] = new Array(MAX_CATEGORIES).fill(1);
  private hoveredId: string | null = null;
  private connectedIds = new Set<string>();
  private selectedId: string | null = null;
  private hoverFrozen: THREE.Vector3 | null = null;
  private selectFrozen: THREE.Vector3 | null = null;
  private lastSec = 0;

  private assigned = false;
  private assignmentRuns = 0;
  private pickEnabled = false;
  private pickGeo = new THREE.SphereGeometry(11, 10, 8);
  private pickMat = new THREE.MeshBasicMaterial({ visible: false });

  private tmp = { x: 0, y: 0, z: 0 };
  private lastDrive: BrainDrive = { links: 0, rigid: 0, speed: 0 };

  constructor(scene: THREE.Scene, engine: NeutronCoreEngine) {
    this.scene = scene;
    this.engine = engine;
    this.group.name = "BRAIN_FIELD_GROUP";
    this.group.visible = false;

    const sh = engine.shared;
    this.links = new AtmosphereLinks(sh);
    this.group.add(this.links.mesh);
    this.group.add(this.semantic.group);

    this.recordMat = new THREE.ShaderMaterial({
      vertexShader: RECORD_VERT,
      fragmentShader: RECORD_FRAG,
      uniforms: {
        uFlowTotal: sh.uFlowTotal,
        uFlowBlend: sh.uFlowBlend,
        uTurbTime: sh.uTurbTime,
        uTurbulence: sh.uTurbulence,
        uPulse: sh.uPulse,
        uReducedMotion: sh.uReducedMotion,
        uLinks: sh.uLinks,
        uClock: sh.uClock,
        uPxScale: this.uPxScale,
        uCatFade: this.uCatFade,
        uKnowledge: this.uKnowledge,
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    this.recordPoints = new THREE.Points(new THREE.BufferGeometry(), this.recordMat);
    this.recordPoints.name = "BRAIN_RECORDS";
    this.recordPoints.visible = false; // physical record bodies now own the visible glyph
    this.recordPoints.renderOrder = 6;
    this.recordPoints.frustumCulled = false;
    this.recordPoints.raycast = () => {};
    this.group.add(this.recordPoints);
    this.scene.add(this.group);
  }

  public setViewport(_width: number, _height: number, pixelRatio: number) {
    this.uPxScale.value = pixelRatio;
  }

  // -------------------------------------------------------------------------
  // Knowledge mapping
  // -------------------------------------------------------------------------

  public setKnowledge(nodes: GraphNode[], links: GraphLink[], categories: GraphCategory[]) {
    const idOf = (v: unknown) => (typeof v === "object" ? (v as { id: string }).id : (v as string));
    const linkKey = (l: GraphLink) => `${idOf(l.source)}>${idOf(l.target)}`;
    const signature = nodes.map((n) => n.id).sort().join("|") + "#" + links.map(linkKey).sort().join("|") + "#" + categories.map((c) => c.id).join(",");

    if (signature === this.signature) {
      // Routine data refresh: same topology. Refresh node references only; nothing is rebuilt or reset.
      const byId = new Map(nodes.map((n) => [n.id, n]));
      this.slots.forEach((slot, id) => {
        const fresh = byId.get(id);
        if (fresh) {
          slot.def.node = fresh;
          slot.pick.userData = { nodeId: id, node: fresh };
        }
      });
      return;
    }
    this.signature = signature;
    this.catIds = categories.map((c) => c.id);

    const ids = new Set(nodes.map((n) => n.id));
    const neighbours = new Map<string, Set<string>>();
    for (const l of links) {
      const s = idOf(l.source);
      const t = idOf(l.target);
      if (!ids.has(s) || !ids.has(t)) continue;
      if (!neighbours.has(s)) neighbours.set(s, new Set());
      if (!neighbours.has(t)) neighbours.set(t, new Set());
      neighbours.get(s)!.add(t);
      neighbours.get(t)!.add(s);
    }
    const degree = (id: string) => neighbours.get(id)?.size ?? 0;
    this.adjacency = neighbours;
    const unique = new Set<string>();
    const edges: SemanticEdge[] = [];
    for (const link of links) {
      const s = idOf(link.source), t = idOf(link.target);
      if (!ids.has(s) || !ids.has(t) || s === t) continue;
      const key = JSON.stringify([s,t].sort());
      if (unique.has(key)) continue;
      unique.add(key);
      edges.push(degree(s) > degree(t) || degree(s) === degree(t) && s < t ? [s,t] : [t,s]);
    }
    this.semantic.setEdges(edges);
    const hubIds = nodes.filter((n) => n.taxonomyKind === "department" || n.taxonomyKind === "oversight" || (!n.parentId && degree(n.id) >= 3)).sort((a, b) => degree(b.id) - degree(a.id) || a.id.localeCompare(b.id)).map((n) => n.id);
    const hubSet = new Set(hubIds);

    const defs = new Map<string, RecordDef>();
    for (const n of nodes) {
      const isHub = hubSet.has(n.id);
      const declaredParent = n.parentId && ids.has(n.parentId) && neighbours.get(n.parentId)?.has(n.id) ? n.parentId : null;
      const parentHub = isHub ? null : declaredParent ?? (hubIds.find((h) => neighbours.get(h)?.has(n.id)) ?? null);
      defs.set(n.id, {
        node: n,
        cat: Math.min(Math.max(0, this.catIds.indexOf(n.source)), MAX_CATEGORIES - 1),
        isHub,
        parentHub,
        importance: isHub ? 1.0 : parentHub ? 0.7 : 0.5,
        degree: degree(n.id),
      });
    }

    for (const [id, slot] of this.slots) {
      if (!defs.has(id)) {
        this.group.remove(slot.pick);
        this.slots.delete(id);
      }
    }
    defs.forEach((def, id) => {
      let slot = this.slots.get(id);
      if (!slot) {
        const pick = new THREE.Mesh(this.pickGeo, this.pickMat);
        pick.name = `BRAIN_PICK_${id}`;
        const enabledRaycast = THREE.Mesh.prototype.raycast;
        pick.raycast = (rc, hits) => {
          if (this.pickEnabled) enabledRaycast.call(pick, rc, hits);
        };
        this.group.add(pick);
        slot = { def, member: -1, hi: 0, pick, world: new THREE.Vector3(), offset: new THREE.Vector3(), offsetVel: new THREE.Vector3(), row: 0, role: "" };
        this.slots.set(id, slot);
      }
      slot.def = def;
      // Match the visible body, not an invisible 11-unit neighbourhood around it.
      // Proximity may reveal a label, but only a direct body hit may freeze a record.
      slot.pick.scale.setScalar(this.getRecordRadius(id) / 11);
      slot.pick.userData = { nodeId: id, node: def.node };
    });
    // Carriers are chosen once per topology (deterministic, independent of navigation timing).
    for (const knot of this.trialKnots.values()) { this.group.remove(knot.group); knot.dispose(); }
    this.trialKnots.clear();
    const ranked = [...defs.values()].sort((a, b) => b.degree - a.degree || a.node.id.localeCompare(b.node.id));
    const trial = ranked;
    for (const def of trial) {
      if (!def || this.trialKnots.has(def.node.id)) continue;
      const radius = def.isHub ? 5.2 : def.node.source === "mcp" ? 2.6 : 3.8;
      const knot = createRecordKnot(fnv(def.node.id) % 10000, def.degree, radius, def.node.title);
      knot.group.name = `RECORD_KNOT_${def.node.id}`;
      this.trialKnots.set(def.node.id, knot);
      this.group.add(knot.group);
    }
    this.assignCarriers();
  }

  /**
   * Assign unique deterministic carrier IDs uniformly, regardless of graph degree.
   * Named bodies use independent bounded presentation paths; carriers are excluded from ambient edges.
   * Existing assignments remain stable on data refresh.
   */
  private assignCarriers() {
    const field = this.engine.getParticleField();
    const used = new Set<number>();
    const radius = (m: number) => field.aRadius[m];
    const roleOf = (s: KnowledgeSlot) => `${s.def.isHub ? "hub" : ""}|${s.def.parentHub ?? ""}`;
    // keep existing carriers whose role did not change (no unnecessary remapping on data changes)
    const kept = new Set<KnowledgeSlot>();
    for (const s of this.slots.values()) {
      if (s.member >= 0 && s.role === roleOf(s) && !used.has(s.member)) {
        kept.add(s);
        used.add(s.member);
      }
    }
    for (const s of this.slots.values()) {
      if (s.def.parentHub && kept.has(s)) {
        const hub = this.slots.get(s.def.parentHub);
        if (!hub || !kept.has(hub)) {
          kept.delete(s);
          used.delete(s.member);
        }
      }
    }
    const hashPick = (id: string) => {
      let m = Math.floor(hash01(fnv(id)) * MEMBER_COUNT);
      for (let guard = 0; guard < MEMBER_COUNT; guard++) {
        const r = radius(m);
        if (!used.has(m) && r >= 65 && r <= 125) return m;
        m = (m + 1) % MEMBER_COUNT;
      }
      return m;
    };
    const slots = [...this.slots.values()];
    const hubs = slots.filter((s) => s.def.isHub).sort((a, b) => b.def.degree - a.def.degree || a.def.node.id.localeCompare(b.def.node.id));
    const relations: [number, number][] = [];

    for (const hub of hubs) {
      if (kept.has(hub)) continue;
      hub.member = hashPick(hub.def.node.id);
      used.add(hub.member);
    }
    for (const hub of hubs) {
      const hm = hub.member;
      const kids = slots.filter((s) => s.def.parentHub === hub.def.node.id).sort((a, b) => a.def.node.id.localeCompare(b.def.node.id));
      for (const kid of kids) {
        if (kept.has(kid)) {
          relations.push([hm, kid.member]);
          continue;
        }
        kid.member = hashPick(kid.def.node.id);
        used.add(kid.member);
        relations.push([hm, kid.member]);
      }
    }
    for (const s of slots) {
      if (s.def.isHub || s.def.parentHub || kept.has(s)) continue;
      s.member = hashPick(s.def.node.id);
      used.add(s.member);
    }
    for (const s of slots) s.role = roleOf(s);
    this.links.setKeyStructure(slots.map((s) => s.member), relations);
    this.writeRecordAttributes();
    this.assigned = true;
    this.assignmentRuns++;
  }

  private writeRecordAttributes() {
    const field = this.engine.getParticleField();
    const n = this.slots.size;
    const pos = new Float32Array(n * 3);
    const rnd = new Float32Array(n * 3);
    const info = new Float32Array(n * 4);
    const imp = new Float32Array(n);
    let row = 0;
    this.slots.forEach((slot, id) => {
      slot.row = row;
      const m = slot.member;
      pos.set(field.positions.subarray(m * 3, m * 3 + 3), row * 3);
      rnd.set(field.aRandom.subarray(m * 3, m * 3 + 3), row * 3);
      info[row * 4] = 3.4 + 2.0 * slot.def.importance; // hub 5.4, linked 4.8, other 4.4 px
      info[row * 4 + 1] = hash01(fnv(id));
      info[row * 4 + 2] = 0;
      info[row * 4 + 3] = slot.def.cat;
      imp[row] = slot.def.importance;
      row++;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aRand", new THREE.BufferAttribute(rnd, 3));
    geo.setAttribute("aInfo", new THREE.BufferAttribute(info, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aImp", new THREE.BufferAttribute(imp, 1));
    geo.setAttribute("aPin", new THREE.BufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage));
    this.recordGeo?.dispose();
    this.recordGeo = geo;
    this.recordPoints.geometry = geo;
  }

  public setActiveCategories(active: Set<string>) {
    this.catTarget.fill(1);
    this.catIds.forEach((id, i) => {
      if (i < MAX_CATEGORIES) this.catTarget[i] = active.has(id) ? 1 : 0;
    });
  }

  public setHoveredNode(id: string | null, connected: Set<string>) {
    if (id !== this.hoveredId) this.hoverFrozen = id ? this.slots.get(id)?.world.clone() ?? null : null;
    this.hoveredId = id;
    this.connectedIds = connected;
  }

  public setSelectedNode(id: string | null) {
    // a clicked record stays frozen where it was for the whole selection; clearing it lets it glide back
    if (id !== this.selectedId) this.selectFrozen = id ? this.slots.get(id)?.world.clone() ?? null : null;
    this.selectedId = id;
  }

  /**
   * The knowledge layer (record points, pick targets, hover) belongs to the BRAIN surface only.
   * `gate` is the caller's smoothed 0..1 "BRAIN surface is active" value; picking needs it > 0.5.
   */
  public setKnowledgeGate(gate: number) {
    this.uKnowledge.value = gate;
    this.interactive = gate > 0.5;
    if (!this.interactive && (this.hoveredId || this.connectedIds.size)) {
      this.hoveredId = null;
      this.connectedIds = new Set();
    }
  }

  public setPulseGain(g: number) {
    this.links.setPulseGain(g);
  }

  // -------------------------------------------------------------------------
  // Per frame
  // -------------------------------------------------------------------------

  private motionPaused = false;
  private nodeFlow = 0;
  private previousFlow: number | null = null;
  public setMotionPaused(paused: boolean) { this.motionPaused = paused; }

  public update(elapsedSec: number, drive: BrainDrive, distance = 272, camera?: THREE.Camera) {
    this.lastDrive = drive;
    const active = drive.links > 0.005;
    this.group.visible = active;
    this.pickEnabled = drive.links > 0.6 && this.interactive;
    const field = this.engine.getParticleField();
    const motion = this.engine.getMotionState();
    if(this.previousFlow === null)this.nodeFlow=motion.flowTotal;
    else if(!this.motionPaused)this.nodeFlow+=Math.max(0,motion.flowTotal-this.previousFlow);
    this.previousFlow=motion.flowTotal;


    this.links.update(elapsedSec, drive.links, field, motion);
    // Retain the atmospheric renderer for deeper layers; normal Explore has no decorative web.
    this.links.mesh.visible = false;
    if (!this.assigned) return;

    const cf = this.uCatFade.value;
    for (let i = 0; i < MAX_CATEGORIES; i++) cf[i] += (this.catTarget[i] - cf[i]) * 0.1;

    const info = this.recordGeo?.getAttribute("aInfo") as THREE.BufferAttribute | undefined;
    let dirty = false;
    const t = this.tmp;
    const dt = this.motionPaused ? 0 : Math.min(0.05, Math.max(0, elapsedSec - this.lastSec));
    this.lastSec = elapsedSec;
    const W = 2.6; // glide-back natural frequency (critically damped, ~2 s, no overshoot)
    const pinAttr = this.recordGeo?.getAttribute("aPin") as THREE.BufferAttribute | undefined;
    const pins: { member: number; world: THREE.Vector3; d: number }[] = [];
    // Presentation paths are independent of graph degree and of the atmosphere's rigid frame.
    const targets = new Map<string, THREE.Vector3>();
    for (const [id] of this.slots) {
      const seed = fnv(id);
      const h = (salt: number) => hash01(fnv(`${seed}:${salt}`));
      const time = motion.reducedMotion ? 0 : this.nodeFlow;
      const phase = h(1) * Math.PI * 2 + time * (.018 + h(2) * .018);
      const radius = 70 + h(3) * 55;
      const drift = Math.sin(time * .027 + h(4) * 6.28) * 3;
      const point = new THREE.Vector3(Math.cos(phase) * (radius + drift),
        Math.sin(phase * .73 + h(5) * 6.28) * 5, Math.sin(phase) * (radius + drift));
      point.applyAxisAngle(new THREE.Vector3(1, 0, 0), (h(6) - .5) * 2.3);
      point.applyAxisAngle(new THREE.Vector3(0, 0, 1), (h(7) - .5) * 2.3);
      targets.set(id, point);
    }
    // A smooth compact spacing bias, computed from unmodified paths (no accumulated physics).
    const spaced = new Map<string, THREE.Vector3>();
    for (const [id, point] of targets) {
      const bias = new THREE.Vector3();
      for (const [otherId, other] of targets) {
        if (id === otherId) continue;
        const delta = point.clone().sub(other), separation = delta.length();
        if (separation > .001 && separation < 18) {
          bias.addScaledVector(delta, 4 * Math.pow(1 - separation / 18, 2) / separation);
        }
      }
      if (bias.length() > 6) bias.setLength(6);
      spaced.set(id, point.clone().add(bias));
    }
    const depth = THREE.MathUtils.smoothstep(distance, 136, 600);
    const overviewGain = .12 + .48 * (1 - depth);
    this.slots.forEach((slot, id) => {
      const m = slot.member;
      if (m < 0) return;
      const path = spaced.get(id)!;
      t.x = path.x; t.y = path.y; t.z = path.z;
      const frozen = id === this.selectedId && this.selectFrozen ? this.selectFrozen : id === this.hoveredId && this.hoverFrozen ? this.hoverFrozen : null;
      if (frozen) {
        slot.world.copy(frozen);
        slot.offset.set(frozen.x - t.x, frozen.y - t.y, frozen.z - t.z);
        slot.offsetVel.set(0, 0, 0);
      } else {
        if (slot.offset.lengthSq() > 0) {
          slot.offsetVel.addScaledVector(slot.offset, -W * W * dt).addScaledVector(slot.offsetVel, -2 * W * dt);
          slot.offset.addScaledVector(slot.offsetVel, dt);
          if (slot.offset.lengthSq() < 0.0025 && slot.offsetVel.lengthSq() < 0.0025) { slot.offset.set(0, 0, 0); slot.offsetVel.set(0, 0, 0); }
        }
        slot.world.set(t.x + slot.offset.x, t.y + slot.offset.y, t.z + slot.offset.z);
      }
      const displaced = slot.offset.lengthSq() > 0;
      const focus = this.selectedId ?? this.hoveredId;
      const weight = !focus ? overviewGain : id === focus ? 1 : this.adjacency.get(focus)?.has(id) ? .65 : .14;
      this.trialKnots.get(id)?.update(slot.world, elapsedSec,
        this.uKnowledge.value * drive.links * cf[slot.def.cat] * weight, slot.hi, motion.reducedMotion);
      if (pinAttr) {
        pinAttr.array.set([slot.world.x, slot.world.y, slot.world.z, displaced ? 1 : 0], slot.row * 4);
      }
      if (displaced) pins.push({ member: m, world: slot.world, d: slot.offset.lengthSq() });
      slot.pick.position.copy(slot.world);
      slot.def.node.x = slot.world.x;
      slot.def.node.y = slot.world.y;
      slot.def.node.z = slot.world.z;

      const target = this.hoveredId === id ? 1 : this.connectedIds.has(id) ? 0.55 : this.selectedId === id ? 0.7 : 0;
      const next = slot.hi + (target - slot.hi) * 0.14;
      if (info && Math.abs(next - info.array[slot.row * 4 + 2]) > 0.002) {
        info.array[slot.row * 4 + 2] = next;
        dirty = true;
      }
      slot.hi = next;
    });
    // Resolve both endpoints after every slot has moved, including held and releasing records.
    const focus = this.selectedId ?? this.hoveredId;
    for(const [id,slot] of this.slots){
      const neighbors=this.adjacency.get(id);
      const directions:THREE.Vector3[]=[];
      if(focus && neighbors)for(const neighbor of neighbors){
        if(id!==focus && neighbor!==focus)continue;
        const other=this.slots.get(neighbor);if(other)directions.push(other.world.clone().sub(slot.world));
      }
      this.trialKnots.get(id)?.setContacts(directions);
    }
    this.links.setAmbientFocus(!!focus);
    this.semantic.update(id => {
      const slot = this.slots.get(id);
      return slot ? {world:slot.world,gain:this.uKnowledge.value * drive.links * cf[slot.def.cat]} : undefined;
    }, focus, 1 - depth, this.engine.getNucleusRadius(), camera);
    if (dirty && info) info.needsUpdate = true;
    if (pinAttr) pinAttr.needsUpdate = true;
    this.links.setPinnedMembers(pins.sort((a, b) => b.d - a.d).slice(0, 4));
  }

  // -------------------------------------------------------------------------
  // Labels + introspection
  // -------------------------------------------------------------------------

  /** Live label anchors for the DOM label layer (only meaningful once carriers are assigned). */
  public getLabelData(): BrainLabelData[] {
    if (!this.assigned) return [];
    const out: BrainLabelData[] = [];
    this.slots.forEach((slot, id) => {
      const focus = this.selectedId ?? this.hoveredId;
      const priority = id === focus ? 3 : focus && this.adjacency.get(focus)?.has(id) ? 2 : 0;
      out.push({ id, title: slot.def.node.title, category: entityType(slot.def.node), source: slot.def.node.source, importance: slot.def.importance, hi: slot.hi, world: slot.world, labelPriority: priority });
    });
    return out;
  }

  public debugInfo() {
    return {
      realRecords: this.slots.size,
      trialRecords: [...this.trialKnots.keys()],
      hubs: [...this.slots.values()].filter((s) => s.def.isHub).length,
      linked: [...this.slots.values()].filter((s) => s.def.parentHub).length,
      links: this.links.stats,
      semantic: this.semantic.debug(),
      selected: this.selectedId,
      drive: this.lastDrive,
      groupVisible: this.group.visible,
      assigned: this.assigned,
      assignmentRuns: this.assignmentRuns,
      interactive: this.interactive && this.pickEnabled,
      hovered: this.hoveredId,
    };
  }

  public debugEdgeRadii() {
    return this.links.debugEdgeRadii();
  }

  public debugMemberPositions(): number[] {
    return this.links.debugMemberPositions(this.engine.getParticleField(), this.engine.getMotionState());
  }

  public debugKeyEdges(ts: number[] = []) {
    return this.links.debugKeyEdges(this.engine.getParticleField(), this.engine.getMotionState(), this.engine.shared.uClock.value, ts);
  }

  /** GLSL source + CPU replica samples, for the in-browser GPU/CPU parity test. */
  public debugParity() {
    const eng = this.engine;
    const field = eng.getParticleField();
    const t = { x: 0, y: 0, z: 0 };
    const members: number[][] = [];
    for (let i = 0; i < MEMBER_COUNT; i += 41) {
      computeCoreParticle(
        t,
        field.positions[i * 3], field.positions[i * 3 + 1], field.positions[i * 3 + 2],
        field.aRandom[i * 3], field.aRandom[i * 3 + 1], field.aRandom[i * 3 + 2],
        eng.getMotionState(),
      );
      members.push([i, field.positions[i * 3], field.positions[i * 3 + 1], field.positions[i * 3 + 2], field.aRandom[i * 3], field.aRandom[i * 3 + 1], field.aRandom[i * 3 + 2], t.x, t.y, t.z]);
    }
    const u = eng.shared;
    return {
      glsl: CORE_MOTION_GLSL,
      uniforms: {
        uFlowTotal: u.uFlowTotal.value, uFlowBlend: u.uFlowBlend.value, uTurbTime: u.uTurbTime.value,
        uTurbulence: u.uTurbulence.value, uPulse: u.uPulse.value, uReducedMotion: u.uReducedMotion.value,
      },
      members,
    };
  }

  public getRecordRadius(id:string) {const def=this.slots.get(id)?.def;return (def?.isHub?5.2:def?.node.source==="mcp"?2.6:3.8)*.55;}
  public getRecordWorld(id: string) { return this.slots.get(id)?.world.clone() ?? null; }

  public debugRecords() {
    const out: { id: string; title: string; world: [number, number, number]; member: number; importance: number; isHub: boolean; parentHub: string | null }[] = [];
    this.slots.forEach((slot, id) =>
      out.push({ id, title: slot.def.node.title, world: [slot.world.x, slot.world.y, slot.world.z], member: slot.member, importance: slot.def.importance, isHub: slot.def.isHub, parentHub: slot.def.parentHub }),
    );
    return out;
  }

  public dispose() {
    for (const knot of this.trialKnots.values()) knot.dispose();
    this.trialKnots.clear();
    this.semantic.dispose();
    this.links.dispose();
    this.recordGeo?.dispose();
    this.recordMat.dispose();
    this.pickGeo.dispose();
    this.pickMat.dispose();
    this.scene.remove(this.group);
  }
}
