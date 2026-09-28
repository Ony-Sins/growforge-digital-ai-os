import * as THREE from "three";
import type { GraphCategory, GraphLink, GraphNode } from "@/lib/spatial/obsidianReader";
import type { NeutronCoreEngine } from "../neutronCore/NeutronCoreEngine";
import { CORE_MOTION_GLSL } from "../neutronCore/coreMotionGlsl";
import { MEMBER_COUNT, computeCoreParticle, hash01 } from "../neutronCore/coreParticleField";
import { AtmosphereLinks } from "./atmosphereLinks";
import type { BrainDrive } from "./brainUniforms";

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
  row: number;
  role: string; // role the carrier was chosen for ("hub|" / "|<hubId>" / "|")
}

export interface BrainLabelData {
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
    vec3 w = coreParticleWorld(position, aRand);
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
  private recordGeo: THREE.BufferGeometry | null = null;
  private recordPoints: THREE.Points;
  private recordMat: THREE.ShaderMaterial;

  private uPxScale = { value: 1 };
  private uCatFade = { value: new Array<number>(MAX_CATEGORIES).fill(1) };
  private uKnowledge = { value: 0 };
  private interactive = false;

  private slots = new Map<string, KnowledgeSlot>();
  private signature = "";
  private catIds: string[] = [];
  private catTarget: number[] = new Array(MAX_CATEGORIES).fill(1);
  private hoveredId: string | null = null;
  private connectedIds = new Set<string>();
  private selectedId: string | null = null;

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
    const hubIds = nodes.filter((n) => degree(n.id) >= 3).sort((a, b) => degree(b.id) - degree(a.id) || a.id.localeCompare(b.id)).map((n) => n.id);
    const hubSet = new Set(hubIds);

    const defs = new Map<string, RecordDef>();
    for (const n of nodes) {
      const isHub = hubSet.has(n.id);
      const parentHub = isHub ? null : (hubIds.find((h) => neighbours.get(h)?.has(n.id)) ?? null);
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
        slot = { def, member: -1, hi: 0, pick, world: new THREE.Vector3(), row: 0, role: "" };
        this.slots.set(id, slot);
      }
      slot.def = def;
      slot.pick.userData = { nodeId: id, node: def.node };
    });
    // Carriers are chosen once per topology (deterministic, independent of navigation timing).
    this.assignCarriers();
  }

  /**
   * Choose the real atmosphere particle that carries each record. Hubs use a stable hash of the
   * canonical id; a hub's really-linked records take the hub's nearest neighbours (at similar
   * orbital radius, so they stay together), which turns real relationships into a local cluster.
   *
   * Deterministic: neighbours are measured in each particle's rest frame (its base position
   * rotated by its own fixed phase rx*2PI - the time-independent part of `coreParticleWorld`),
   * never from live positions, so the result does not depend on when BRAIN is entered. Runs once
   * per graph topology; on a genuine topology change a record keeps its particle as long as its
   * role (hub / which hub it belongs to) is unchanged.
   */
  private assignCarriers() {
    const field = this.engine.getParticleField();
    const pos = new Float32Array(MEMBER_COUNT * 3);
    for (let m = 0; m < MEMBER_COUNT; m++) {
      const a = field.aRandom[m * 3] * 6.28318;
      const c = Math.cos(a), s = Math.sin(a);
      const x = field.positions[m * 3], y = field.positions[m * 3 + 1], z = field.positions[m * 3 + 2];
      pos[m * 3] = x * c - z * s;
      pos[m * 3 + 1] = y;
      pos[m * 3 + 2] = x * s + z * c;
    }
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
        let best = -1;
        let bestD = Infinity;
        for (const tol of [16, 40]) {
          for (let m = 0; m < MEMBER_COUNT; m++) {
            if (used.has(m) || Math.abs(radius(m) - radius(hm)) > tol || radius(m) < 60 || radius(m) > 135) continue;
            const dx = pos[m * 3] - pos[hm * 3], dy = pos[m * 3 + 1] - pos[hm * 3 + 1], dz = pos[m * 3 + 2] - pos[hm * 3 + 2];
            const d = dx * dx + dy * dy + dz * dz;
            if (d < bestD) { bestD = d; best = m; }
          }
          if (best >= 0) break;
        }
        kid.member = best >= 0 ? best : hashPick(kid.def.node.id);
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
    this.hoveredId = id;
    this.connectedIds = connected;
  }

  public setSelectedNode(id: string | null) {
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

  public update(elapsedSec: number, drive: BrainDrive) {
    this.lastDrive = drive;
    const active = drive.links > 0.005;
    this.group.visible = active;
    this.pickEnabled = drive.links > 0.6 && this.interactive;
    const field = this.engine.getParticleField();
    const motion = this.engine.getMotionState();


    this.links.update(elapsedSec, drive.links, field, motion);
    if (!active || !this.assigned) return;

    const cf = this.uCatFade.value;
    for (let i = 0; i < MAX_CATEGORIES; i++) cf[i] += (this.catTarget[i] - cf[i]) * 0.1;

    const info = this.recordGeo?.getAttribute("aInfo") as THREE.BufferAttribute | undefined;
    let dirty = false;
    const t = this.tmp;
    this.slots.forEach((slot, id) => {
      const m = slot.member;
      if (m < 0) return;
      computeCoreParticle(
        t,
        field.positions[m * 3], field.positions[m * 3 + 1], field.positions[m * 3 + 2],
        field.aRandom[m * 3], field.aRandom[m * 3 + 1], field.aRandom[m * 3 + 2],
        motion,
      );
      slot.world.set(t.x, t.y, t.z);
      slot.pick.position.copy(slot.world);
      slot.def.node.x = t.x;
      slot.def.node.y = t.y;
      slot.def.node.z = t.z;

      const target = this.hoveredId === id ? 1 : this.connectedIds.has(id) ? 0.55 : this.selectedId === id ? 0.7 : 0;
      const next = slot.hi + (target - slot.hi) * 0.14;
      if (info && Math.abs(next - info.array[slot.row * 4 + 2]) > 0.002) {
        info.array[slot.row * 4 + 2] = next;
        dirty = true;
      }
      slot.hi = next;
    });
    if (dirty && info) info.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  // Labels + introspection
  // -------------------------------------------------------------------------

  /** Live label anchors for the DOM label layer (only meaningful once carriers are assigned). */
  public getLabelData(): BrainLabelData[] {
    if (!this.assigned) return [];
    const out: BrainLabelData[] = [];
    this.slots.forEach((slot, id) => {
      out.push({ id, title: slot.def.node.title, category: slot.def.node.categoryLabel, source: slot.def.node.source, importance: slot.def.importance, hi: slot.hi, world: slot.world });
    });
    return out;
  }

  public debugInfo() {
    return {
      realRecords: this.slots.size,
      hubs: [...this.slots.values()].filter((s) => s.def.isHub).length,
      linked: [...this.slots.values()].filter((s) => s.def.parentHub).length,
      links: this.links.stats,
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

  public debugRecords() {
    const out: { id: string; title: string; world: [number, number, number]; member: number; importance: number; isHub: boolean; parentHub: string | null }[] = [];
    this.slots.forEach((slot, id) =>
      out.push({ id, title: slot.def.node.title, world: [slot.world.x, slot.world.y, slot.world.z], member: slot.member, importance: slot.def.importance, isHub: slot.def.isHub, parentHub: slot.def.parentHub }),
    );
    return out;
  }

  public dispose() {
    this.links.dispose();
    this.recordGeo?.dispose();
    this.recordMat.dispose();
    this.pickGeo.dispose();
    this.pickMat.dispose();
    this.scene.remove(this.group);
  }
}
