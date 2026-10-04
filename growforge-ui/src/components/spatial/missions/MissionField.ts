import * as THREE from "three";
import type { NeutronCoreEngine } from "../neutronCore/NeutronCoreEngine";
import {
  MISSION_DEPT_MIN_PX,
  MISSION_DEPT_SPREAD_PX,
  MISSION_DEPT_UNASSIGNED_PUSH,
  MISSION_DRIFT_PX,
  MISSION_DRIFT_SPEED,
  MISSION_HUB_COLOR,
  MISSION_HUB_HOVER_SCALE,
  MISSION_HUB_OPACITY,
  MISSION_HUB_SELECTED_SCALE,
  MISSION_HUB_SIZE,
  MISSION_LINK_OPACITY,
  MISSION_PULSE_PERIOD_SEC,
  MISSION_PULSE_SIZE,
  MISSION_SPINE_DEPTH_PX,
  MISSION_SPINE_END_PX,
  MISSION_SPINE_OPACITY,
  MISSION_SPINE_RISE_PX,
  MISSION_SPINE_START_PX,
  MISSION_STAGE_COLOR,
  MISSION_STAGE_SIZE,
  type MissionHubStatus,
  type MissionStageState,
} from "./missionStyle";

/** One recorded pipeline stage of the selected mission, exactly as /api/core/state reports it. */
export interface MissionStageInput {
  key: string;
  label: string;
  state: MissionStageState;
  /** Number of real recorded steps in this stage — 0 means the stage never ran. */
  stepCount: number;
}

/** One department of the selected mission. `stageKey` is the stage it genuinely ran in. */
export interface MissionHubInput {
  id: string;
  name: string;
  status: MissionHubStatus;
  assigned: boolean;
  percent: number | null;
  stageKey: string;
}

export interface MissionSceneInput {
  stages: MissionStageInput[];
  departments: MissionHubInput[];
}

/** A live anchor for screen-space picking and DOM readouts. */
export interface MissionAnchor {
  kind: "stage" | "department";
  id: string;
  name: string;
  detail: string;
  world: THREE.Vector3;
  selectable: boolean;
}

interface StageSlot {
  input: MissionStageInput;
  /** Position along the corridor, 0..1, from the real stage order. */
  t: number;
  world: THREE.Vector3;
  row: number;
  hi: number;
}

interface DeptSlot {
  input: MissionHubInput;
  /** Seeded offset around its stage — deterministic per department, never an even ring. */
  offset: { a: number; r: number; d: number };
  world: THREE.Vector3;
  row: number;
  hi: number;
}

function fnv(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const hash01 = (h: number) => (h % 100000) / 100000;

const NODE_VERT = /* glsl */ `
  attribute vec4 aInfo;  // size px, opacity, emphasis, unused
  attribute vec3 aColor;
  uniform float uGate;
  uniform float uPxScale;
  varying vec3 vColor;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float depth = max(-mv.z, 1.0);
    float persp = clamp(pow(460.0 / depth, 0.6), 0.5, 1.9);
    vColor = aColor;
    vA = uGate * aInfo.y;
    gl_PointSize = clamp(aInfo.x * uPxScale * persp * aInfo.z, 1.0, 40.0 * uPxScale);
  }
`;

/** Same structural language as a BRAIN record: tight specular core + fine rim, so a mission node
 *  belongs to the one universe rather than looking like a widget pasted on top of it. */
const NODE_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vA;
  void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    float core = exp(-d * d * 14.0);
    float rim = exp(-pow((d - 0.66) / 0.095, 2.0)) * 0.42;
    float halo = exp(-d * 3.0) * 0.1;
    vec3 col = mix(vColor, vec3(1.0), core * 0.72);
    gl_FragColor = vec4(col, (core + rim + halo) * vA);
  }
`;

/**
 * MISSIONS as an operational region of the persistent scene.
 *
 * The composition is the selected mission's own recorded shape: its real stages form a corridor
 * running past the real nucleus, and the departments that genuinely ran attach to the stage they
 * ran in — so the picture is asymmetric because the work was. Departments the mission never used
 * drift further out, faint and unlinked. Nothing here is decorative: every node, link and pulse is
 * a field from /api/core/state.
 *
 * Lifecycle mirrors BrainField: one smoothed 0..1 gate owned by SpatialCanvas drives visibility and
 * interactivity together, so the region fades with the camera instead of popping on a mode flag.
 */
export class MissionField {
  public readonly group = new THREE.Group();
  private engine: NeutronCoreEngine;

  private nodeGeo: THREE.BufferGeometry | null = null;
  private nodePoints: THREE.Points;
  private nodeMat: THREE.ShaderMaterial;

  private linkGeo = new THREE.BufferGeometry();
  private linkMat: THREE.LineBasicMaterial;
  private links: THREE.LineSegments;

  private pulseGeo: THREE.BufferGeometry | null = null;
  private pulsePoints: THREE.Points;
  private pulseMat: THREE.ShaderMaterial;

  private uGate = { value: 0 };
  private uPxScale = { value: 1 };

  private stages: StageSlot[] = [];
  private depts: DeptSlot[] = [];
  private signature = "";
  private selectedId: string | null = null;
  private hoveredId: string | null = null;
  private gate = 0;
  private drift = 0;

  constructor(scene: THREE.Scene, engine: NeutronCoreEngine) {
    this.engine = engine;
    this.group.name = "MISSION_FIELD_GROUP";
    this.group.visible = false;

    const mk = () =>
      new THREE.ShaderMaterial({
        vertexShader: NODE_VERT,
        fragmentShader: NODE_FRAG,
        uniforms: { uGate: this.uGate, uPxScale: this.uPxScale },
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      });

    this.nodeMat = mk();
    this.nodePoints = new THREE.Points(new THREE.BufferGeometry(), this.nodeMat);
    this.nodePoints.frustumCulled = false;
    this.group.add(this.nodePoints);

    this.linkMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    });
    this.links = new THREE.LineSegments(this.linkGeo, this.linkMat);
    this.links.frustumCulled = false;
    this.group.add(this.links);

    this.pulseMat = mk();
    this.pulsePoints = new THREE.Points(new THREE.BufferGeometry(), this.pulseMat);
    this.pulsePoints.frustumCulled = false;
    this.group.add(this.pulsePoints);

    scene.add(this.group);
  }

  public setViewport(_w: number, _h: number, pixelRatio: number) {
    this.uPxScale.value = pixelRatio;
  }

  /**
   * Adopt the selected mission. Rebuilt only when the stage/department SET changes; status and
   * percent updates reuse the existing slots so nothing jumps on the 5s poll.
   */
  public setScene(input: MissionSceneInput) {
    const signature = input.stages.map((s) => s.key).join("|") + "#" + input.departments.map((d) => d.id).join("|");
    if (signature === this.signature) {
      const byStage = new Map(input.stages.map((s) => [s.key, s]));
      const byDept = new Map(input.departments.map((d) => [d.id, d]));
      for (const s of this.stages) {
        const fresh = byStage.get(s.input.key);
        if (fresh) s.input = fresh;
      }
      for (const d of this.depts) {
        const fresh = byDept.get(d.input.id);
        if (fresh) d.input = fresh;
      }
      return;
    }
    this.signature = signature;
    const n = Math.max(input.stages.length - 1, 1);
    this.stages = input.stages.map((s, i) => ({ input: s, t: i / n, world: new THREE.Vector3(), row: i, hi: 0 }));
    this.depts = input.departments.map((d, i) => {
      const h = fnv(d.id);
      return {
        input: d,
        // Deterministic scatter: a stable angle and radius per department id, so the cluster is
        // organic and reproducible rather than an evenly divided circle.
        offset: {
          a: hash01(h) * Math.PI * 2,
          r: MISSION_DEPT_MIN_PX + hash01(h >>> 7) * MISSION_DEPT_SPREAD_PX,
          d: (hash01(h >>> 13) - 0.5) * 2,
        },
        world: new THREE.Vector3(),
        row: i,
        hi: 0,
      };
    });
    this.rebuildBuffers();
  }

  private get nodeCount() {
    return this.stages.length + this.depts.length;
  }

  /** Spine segments (stage->stage) plus one link per assigned department to its stage. */
  private get linkCount() {
    return Math.max(this.stages.length - 1, 0) + this.depts.filter((d) => d.input.assigned).length;
  }

  private rebuildBuffers() {
    this.nodeGeo?.dispose();
    this.pulseGeo?.dispose();
    const n = this.nodeCount;
    const l = this.linkCount;
    if (n === 0) {
      this.nodeGeo = null;
      this.pulseGeo = null;
      this.nodePoints.geometry = new THREE.BufferGeometry();
      this.pulsePoints.geometry = new THREE.BufferGeometry();
      this.linkGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(0), 3));
      this.linkGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(0), 3));
      return;
    }
    const mkGeo = (count: number) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute("aInfo", new THREE.BufferAttribute(new Float32Array(count * 4), 4).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
      return g;
    };
    this.nodeGeo = mkGeo(n);
    this.nodePoints.geometry = this.nodeGeo;
    this.pulseGeo = mkGeo(Math.max(l, 1));
    this.pulsePoints.geometry = this.pulseGeo;
    this.linkGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(Math.max(l, 1) * 6), 3).setUsage(THREE.DynamicDrawUsage));
    this.linkGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(Math.max(l, 1) * 6), 3).setUsage(THREE.DynamicDrawUsage));
  }

  public setSelected(id: string | null) {
    this.selectedId = id;
  }

  public setHovered(id: string | null) {
    this.hoveredId = id;
  }

  public setGate(gate: number) {
    this.gate = gate;
    this.uGate.value = gate;
    this.group.visible = gate > 0.004;
    if (gate <= 0.004) this.hoveredId = null;
  }

  public isPickable(): boolean {
    return this.gate > 0.5 && this.nodeCount > 0;
  }

  /** How strongly the core's glare should be pulled back right now (0 off .. 1 fully). */
  public calm(): number {
    return this.gate;
  }

  public update(
    elapsedSec: number,
    deltaMs: number,
    reducedMotion: boolean,
    camera: THREE.PerspectiveCamera,
    viewportHeightPx: number,
    pivot: THREE.Vector3,
  ) {
    if (!this.group.visible || !this.nodeGeo || !this.pulseGeo || this.nodeCount === 0) return;

    if (!reducedMotion) this.drift += (deltaMs / 1000) * MISSION_DRIFT_SPEED;

    // World units per CSS pixel at the pivot's depth — keeps the corridor a stable size on screen.
    const dist = Math.max(camera.position.distanceTo(pivot), 1);
    const halfH = Math.tan((camera.fov * Math.PI) / 360) * dist;
    const u = halfH / Math.max(viewportHeightPx / 2, 1);

    camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const fwd = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2).normalize();

    const place = (out: THREE.Vector3, xPx: number, yPx: number, zPx: number) =>
      out
        .copy(pivot)
        .addScaledVector(right, xPx * u)
        .addScaledVector(up, yPx * u)
        .addScaledVector(fwd, zPx * u);

    const nodePos = this.nodeGeo.getAttribute("position") as THREE.BufferAttribute;
    const nodeInfo = this.nodeGeo.getAttribute("aInfo") as THREE.BufferAttribute;
    const nodeCol = this.nodeGeo.getAttribute("aColor") as THREE.BufferAttribute;
    const pulsePos = this.pulseGeo.getAttribute("position") as THREE.BufferAttribute;
    const pulseInfo = this.pulseGeo.getAttribute("aInfo") as THREE.BufferAttribute;
    const pulseCol = this.pulseGeo.getAttribute("aColor") as THREE.BufferAttribute;
    const linkPos = this.linkGeo.getAttribute("position") as THREE.BufferAttribute;
    const linkCol = this.linkGeo.getAttribute("color") as THREE.BufferAttribute;

    const ease = 1 - Math.exp(-Math.min(deltaMs, 100) / 1000 / 0.12);

    // ---- stage spine: the mission's real recorded sequence ------------------------------------
    for (const s of this.stages) {
      const t = s.t;
      const xPx = MISSION_SPINE_START_PX + (MISSION_SPINE_END_PX - MISSION_SPINE_START_PX) * t;
      const yPx = Math.sin(t * Math.PI) * MISSION_SPINE_RISE_PX + Math.sin(this.drift + t * 2.1) * MISSION_DRIFT_PX;
      const zPx = (0.5 - t) * MISSION_SPINE_DEPTH_PX;
      place(s.world, xPx, yPx, zPx);

      const st = s.input.state;
      const emphasis = this.selectedId === s.input.key ? MISSION_HUB_SELECTED_SCALE : this.hoveredId === s.input.key ? MISSION_HUB_HOVER_SCALE : 1;
      s.hi += (emphasis - s.hi) * ease;
      const col = MISSION_STAGE_COLOR[st];
      const i = s.row;
      nodePos.setXYZ(i, s.world.x, s.world.y, s.world.z);
      nodeInfo.setXYZW(i, MISSION_STAGE_SIZE[st], st === "idle" ? 0.34 : 0.95, s.hi, 0);
      nodeCol.setXYZ(i, col[0], col[1], col[2]);
    }

    // ---- departments: clustered on the stage they actually ran in -----------------------------
    const stageOf = new Map(this.stages.map((s) => [s.input.key, s]));
    for (const d of this.depts) {
      const anchor = stageOf.get(d.input.stageKey) ?? this.stages[Math.floor(this.stages.length / 2)];
      const push = d.input.assigned ? 1 : MISSION_DEPT_UNASSIGNED_PUSH;
      const a = d.offset.a + this.drift * 0.35;
      const r = d.offset.r * push;
      const base = anchor?.world ?? pivot;
      d.world
        .copy(base)
        .addScaledVector(right, Math.cos(a) * r * u)
        .addScaledVector(up, Math.sin(a) * r * u * 0.72)
        .addScaledVector(fwd, d.offset.d * 70 * u);

      const st = d.input.status;
      const emphasis = this.selectedId === d.input.id ? MISSION_HUB_SELECTED_SCALE : this.hoveredId === d.input.id ? MISSION_HUB_HOVER_SCALE : 1;
      d.hi += (emphasis - d.hi) * ease;
      const col = MISSION_HUB_COLOR[st];
      const i = this.stages.length + d.row;
      nodePos.setXYZ(i, d.world.x, d.world.y, d.world.z);
      nodeInfo.setXYZW(i, MISSION_HUB_SIZE[st], MISSION_HUB_OPACITY[st], d.hi, 0);
      nodeCol.setXYZ(i, col[0], col[1], col[2]);
    }

    // ---- links + pulses -----------------------------------------------------------------------
    let li = 0;
    const seg = (from: THREE.Vector3, to: THREE.Vector3, col: [number, number, number], o: number, live: boolean, phase: number) => {
      linkPos.setXYZ(li * 2, from.x, from.y, from.z);
      linkPos.setXYZ(li * 2 + 1, to.x, to.y, to.z);
      linkCol.setXYZ(li * 2, col[0] * o, col[1] * o, col[2] * o);
      linkCol.setXYZ(li * 2 + 1, col[0] * o, col[1] * o, col[2] * o);
      // A pulse exists ONLY for genuinely running work. A finished mission stays still.
      if (live && !reducedMotion) {
        const p = (elapsedSec / MISSION_PULSE_PERIOD_SEC + phase) % 1;
        pulsePos.setXYZ(li, from.x + (to.x - from.x) * p, from.y + (to.y - from.y) * p, from.z + (to.z - from.z) * p);
        pulseInfo.setXYZW(li, MISSION_PULSE_SIZE, Math.sin(p * Math.PI), 1, 0);
        pulseCol.setXYZ(li, 0.72, 1.0, 0.88);
      } else {
        pulseInfo.setXYZW(li, 0, 0, 0, 0);
      }
      li++;
    };

    for (let i = 0; i + 1 < this.stages.length; i++) {
      const a = this.stages[i];
      const b = this.stages[i + 1];
      // A segment carries the state of the stage it leads INTO.
      const st = b.input.state;
      seg(a.world, b.world, MISSION_STAGE_COLOR[st], MISSION_SPINE_OPACITY[st], st === "active", i * 0.17);
    }
    for (const d of this.depts) {
      if (!d.input.assigned) continue;
      const anchor = stageOf.get(d.input.stageKey);
      if (!anchor) continue;
      const st = d.input.status;
      seg(anchor.world, d.world, MISSION_HUB_COLOR[st], MISSION_LINK_OPACITY[st], st === "active", d.row * 0.11);
    }

    nodePos.needsUpdate = true;
    nodeInfo.needsUpdate = true;
    nodeCol.needsUpdate = true;
    pulsePos.needsUpdate = true;
    pulseInfo.needsUpdate = true;
    pulseCol.needsUpdate = true;
    linkPos.needsUpdate = true;
    linkCol.needsUpdate = true;
    this.linkGeo.setDrawRange(0, li * 2);
    this.linkMat.opacity = this.gate;
  }

  /** Live anchors for screen-space picking and the DOM readout (BRAIN-04A's pattern). */
  public getAnchors(): MissionAnchor[] {
    const out: MissionAnchor[] = [];
    for (const s of this.stages) {
      out.push({
        kind: "stage",
        id: s.input.key,
        name: s.input.label,
        detail: s.input.stepCount === 0 ? "no recorded steps" : `${s.input.state} · ${s.input.stepCount} recorded step${s.input.stepCount === 1 ? "" : "s"}`,
        world: s.world,
        selectable: false,
      });
    }
    for (const d of this.depts) {
      out.push({
        kind: "department",
        id: d.input.id,
        name: d.input.name,
        detail: !d.input.assigned
          ? "not needed for this mission"
          : d.input.percent !== null
            ? `${d.input.status} · ${Math.round(d.input.percent)}%`
            : d.input.status,
        world: d.world,
        selectable: d.input.assigned,
      });
    }
    return out;
  }

  public debugInfo() {
    return {
      stages: this.stages.length,
      departments: this.depts.length,
      assigned: this.depts.filter((d) => d.input.assigned).length,
      gate: +this.gate.toFixed(3),
      pickable: this.isPickable(),
      activePulses: this.stages.filter((s) => s.input.state === "active").length + this.depts.filter((d) => d.input.assigned && d.input.status === "active").length,
    };
  }

  public dispose() {
    this.group.removeFromParent();
    this.nodeGeo?.dispose();
    this.pulseGeo?.dispose();
    this.linkGeo.dispose();
    this.nodeMat.dispose();
    this.pulseMat.dispose();
    this.linkMat.dispose();
  }
}
