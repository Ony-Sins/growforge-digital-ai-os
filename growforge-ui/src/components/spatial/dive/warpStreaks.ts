import * as THREE from "three";

/**
 * Light-speed trails for the DIVE IN plunge, made from the scene's OWN particles. No new particles are
 * added: every trail is anchored on an existing star / transit-dust point at its real world position and
 * stretched along the line of flight in proportion to the speed, so the particles that were already
 * floating in the scene are the ones seen streaking past and being left behind.
 */
const MAX_SEGMENTS = 6000;

export class WarpStreaks {
  readonly lines: THREE.LineSegments;
  private pos = new Float32Array(MAX_SEGMENTS * 6);
  private col = new Float32Array(MAX_SEGMENTS * 6);
  private mat: THREE.LineBasicMaterial;
  private sources: THREE.Points[] = [];
  private provider: ((emit: (x: number, y: number, z: number) => void) => void) | null = null;
  private p = new THREE.Vector3();
  private rel = new THREE.Vector3();

  constructor(parent: THREE.Object3D) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("color", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    this.lines = new THREE.LineSegments(g, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 30;
    this.lines.visible = false;
    parent.add(this.lines);
  }

  /** The existing point clouds whose particles become the trails. */
  setSources(sources: THREE.Points[]) {
    this.sources = sources;
  }

  /** Extra existing particles whose world positions are computed elsewhere (the core's particle field). */
  setProvider(provider: (emit: (x: number, y: number, z: number) => void) => void) {
    this.provider = provider;
  }

  /** speed 0..1 (0 hides). `forward` = unit direction of travel (camera -> core). */
  update(camPos: THREE.Vector3, forward: THREE.Vector3, speed: number, _dtMs: number) {
    void _dtMs; // trails are anchored on real particles; motion comes from the camera itself
    this.lines.visible = speed > 0.01;
    if (!this.lines.visible) return;
    const len = speed * speed * 140;
    let n = 0;
    const emit = (x: number, y: number, z: number) => {
      if (n >= MAX_SEGMENTS) return;
      this.p.set(x, y, z);
      this.rel.subVectors(this.p, camPos);
      const ahead = this.rel.dot(forward);
      if (ahead < -40 || ahead > 700) return; // only what the camera is flying through / towards
      const lateral = Math.sqrt(Math.max(0, this.rel.lengthSq() - ahead * ahead));
      if (lateral > 260) return;
      // the particle stays where it is; its trail extends back along the flight path
      const k = n * 6;
      this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
      this.pos[k + 3] = x + forward.x * len; this.pos[k + 4] = y + forward.y * len; this.pos[k + 5] = z + forward.z * len;
      const near = 1 - Math.min(1, Math.max(0, ahead) / 700);
      const b = speed * (0.3 + 0.7 * near);
      this.col[k] = 0.8 * b; this.col[k + 1] = 0.95 * b; this.col[k + 2] = 1.0 * b;
      this.col[k + 3] = 0.04 * b; this.col[k + 4] = 0.2 * b; this.col[k + 5] = 0.5 * b;
      n++;
    };
    this.provider?.(emit);
    for (const src of this.sources) {
      if (!src.visible) continue;
      src.updateMatrixWorld();
      const arr = (src.geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
      for (let i = 0; i < arr.length && n < MAX_SEGMENTS; i += 3) {
        this.p.set(arr[i], arr[i + 1], arr[i + 2]).applyMatrix4(src.matrixWorld);
        emit(this.p.x, this.p.y, this.p.z);
      }
    }
    this.lines.geometry.setDrawRange(0, n * 2);
    this.lines.geometry.attributes.position.needsUpdate = true;
    this.lines.geometry.attributes.color.needsUpdate = true;
  }

  dispose() {
    this.lines.geometry.dispose();
    this.mat.dispose();
    this.lines.parent?.remove(this.lines);
  }
}
