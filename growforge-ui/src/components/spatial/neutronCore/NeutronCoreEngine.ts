import * as THREE from "three";
import {
  type CoreQualityTier,
  type NeutronCoreState,
  STATE_PROFILES,
  type StateVisualProfile,
} from "./neutronCoreTypes";
import {
  NeutronCoreFragmentShader,
  NeutronCoreVertexShader,
  NeutronNucleusBodyFragmentShader,
  NeutronNucleusBodyVertexShader,
} from "./NeutronCoreShader";
import {
  type CoreMotionState,
  type CoreParticleBuffers,
  NUCLEUS_MESH_RADIUS,
  generateCoreParticles,
} from "./coreParticleField";
import {
  BRAIN_DRIVE_IDLE,
  type BrainDrive,
  type BrainSharedUniforms,
  createBrainSharedUniforms,
} from "../brain/brainUniforms";

/** Modest growth of the nucleus (apparent size) as the camera arrives at BRAIN. */
const NUCLEUS_BRAIN_BOOST = 0.3;
/** How much faster the outer atmosphere swirls at full zoom depth. */
const DIVE_SPEED_GAIN = 2.6;

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export class NeutronCoreEngine {
  public group: THREE.Group;
  private scene: THREE.Scene;
  private quality: CoreQualityTier;

  public pointsMesh: THREE.Points | null = null;
  public nucleusMesh: THREE.Mesh | null = null;
  public nucleusMaterial: THREE.ShaderMaterial | null = null;
  public coreSprite: THREE.Sprite | null = null;
  public outerCoronaSprite: THREE.Sprite | null = null;
  public shaderMaterial: THREE.ShaderMaterial | null = null;
  public bufferGeometry: THREE.BufferGeometry | null = null;

  /** Uniforms shared by reference with every BRAIN renderer (one update, all shaders in sync). */
  public readonly shared: BrainSharedUniforms = createBrainSharedUniforms();

  // Active state & visual parameters
  private currentState: NeutronCoreState = "idle";
  private currentProfile: StateVisualProfile = { ...STATE_PROFILES.idle };
  private targetProfile: StateVisualProfile = { ...STATE_PROFILES.idle };

  // Proximity & depth smoothing
  private smoothedProximity = 0;
  private depthFx = 1;

  // Monotonic integrals (never reset, never wrap): see CoreMotionState.
  private flowTotal = 0;
  private flowBlend = 0;
  private accumulatedTurbTime = 0;
  private arborClock = 0;

  // The single shared particle source (identity = buffer index).
  private field: CoreParticleBuffers | null = null;
  private motion: CoreMotionState = {
    flowTotal: 0,
    flowBlend: 0,
    turbTime: 0,
    turbulence: 0.25,
    pulse: 1,
    reducedMotion: false,
  };
  private nucleusRadiusWorld = NUCLEUS_MESH_RADIUS * 0.9;

  // Performance tracking for graceful frame-time fallback
  private slowFrameCounter = 0;
  private emaFrameTime = 16.6;

  constructor(scene: THREE.Scene, initialQuality: CoreQualityTier = "high") {
    this.scene = scene;
    this.quality = initialQuality;
    this.group = new THREE.Group();
    this.group.name = "NEUTRON_CORE_ENGINE_GROUP";
    this.scene.add(this.group);

    this.buildNucleusBody();
    this.buildParticleSystem();
    this.buildCoreGlowSprite();
    this.buildStellarSprite();
  }

  public setState(state: NeutronCoreState) {
    if (this.currentState === state) return;
    this.currentState = state;
    this.targetProfile = STATE_PROFILES[state] || STATE_PROFILES.idle;
  }

  public getState(): NeutronCoreState {
    return this.currentState;
  }

  public getQuality(): CoreQualityTier {
    return this.quality;
  }

  /** Shared particle source (members occupy indices [0, MEMBER_COUNT) at every quality tier). */
  public getParticleField(): CoreParticleBuffers {
    return this.field!;
  }

  /** Live motion state for the CPU replica of the shader motion. */
  public getMotionState(): CoreMotionState {
    return this.motion;
  }

  /** Verification hook: 1 = volumetric depth treatment on, 0 = off (A/B in the browser). */
  public setDepthFx(v: number) {
    this.depthFx = v;
    if (this.shaderMaterial) this.shaderMaterial.uniforms.uDepthFx.value = v;
  }

  /** World radius of the visible nucleus surface right now. */
  public getNucleusRadius(): number {
    return this.nucleusRadiusWorld;
  }

  private buildParticleSystem() {
    // Clean up any existing points
    if (this.pointsMesh) {
      this.group.remove(this.pointsMesh);
      this.bufferGeometry?.dispose();
      this.shaderMaterial?.dispose();
      this.pointsMesh = null;
    }

    const field = generateCoreParticles(this.quality);
    this.field = field;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(field.positions, 3));
    geo.setAttribute("aRandom", new THREE.BufferAttribute(field.aRandom, 3));
    geo.setAttribute("aRadius", new THREE.BufferAttribute(field.aRadius, 1));
    geo.setAttribute("aScale", new THREE.BufferAttribute(field.aScale, 1));
    geo.setAttribute("aMember", new THREE.BufferAttribute(field.aMember, 1));
    this.bufferGeometry = geo;

    const s = this.shared;
    const mat = new THREE.ShaderMaterial({
      vertexShader: NeutronCoreVertexShader,
      fragmentShader: NeutronCoreFragmentShader,
      uniforms: {
        uBrightness: { value: 1.0 },
        uDepthScale: { value: 1.0 },
        uProximity: { value: 0.0 },
        uDepthFx: { value: this.depthFx },
        uFlowTotal: s.uFlowTotal,
        uFlowBlend: s.uFlowBlend,
        uTurbTime: s.uTurbTime,
        uTurbulence: s.uTurbulence,
        uPulse: s.uPulse,
        uReducedMotion: s.uReducedMotion,
        uLinks: s.uLinks,
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.shaderMaterial = mat;

    this.pointsMesh = new THREE.Points(geo, mat);
    this.pointsMesh.renderOrder = 3;
    this.pointsMesh.frustumCulled = false;
    this.group.add(this.pointsMesh);
  }

  private buildNucleusBody() {
    if (this.nucleusMesh) {
      this.group.remove(this.nucleusMesh);
      this.nucleusMesh.geometry.dispose();
      this.nucleusMaterial?.dispose();
      this.nucleusMesh = null;
      this.nucleusMaterial = null;
    }

    // Luminous white-hot neutron star central body (Reference A: substantial core mass, ~30% of total diameter)
    const sphereGeo = new THREE.SphereGeometry(NUCLEUS_MESH_RADIUS, 48, 48);
    const nucleusMat = new THREE.ShaderMaterial({
      vertexShader: NeutronNucleusBodyVertexShader,
      fragmentShader: NeutronNucleusBodyFragmentShader,
      uniforms: {
        uPulse: this.shared.uPulse,
        uTurbTime: this.shared.uTurbTime,
        uBrightness: { value: 1.0 },
        uProximity: { value: 0.0 },
        uReducedMotion: this.shared.uReducedMotion,
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.nucleusMaterial = nucleusMat;
    this.nucleusMesh = new THREE.Mesh(sphereGeo, nucleusMat);
    this.nucleusMesh.name = "NEUTRON_NUCLEUS_BODY";
    this.nucleusMesh.renderOrder = 2;
    this.group.add(this.nucleusMesh);
  }

  /**
   * The approved stellar core (public/textures/stellar-core-reference-v1.png) as a REAL 3D sphere that
   * can be spun freely. The image's central detail is projected onto the sphere from three axes and
   * blended by the normal (triplanar), so there is no seam or tear at any orientation; its own baked rim
   * is never sampled - the limb glow is computed from the view angle instead, so it always sits on the
   * silhouette. A separate camera-facing halo plane carries the flames, glow and click shockwaves.
   */
  public stellarSprite: THREE.Object3D | null = null;
  private plungeFreeze = false;
  private frozenNucleusScale: number | null = null;
  public setPlungeFreeze(on: boolean) {
    if(on && !this.plungeFreeze) this.frozenNucleusScale=this.nucleusRadiusWorld/NUCLEUS_MESH_RADIUS;
    this.plungeFreeze = on;
    // This shader describes the exterior. Rear faces would paint its white limb over the front.
    // Depth-test the approach; the destination membrane takes over before crossing the surface.
    if(this.stellarSphere){const material=this.stellarSphere.material as THREE.Material;material.side=THREE.FrontSide;material.depthTest=on;material.depthWrite=on;}
    if(!on)this.stellarUniforms.uDive.value=0;
  }
  public setDiveLight(progress:number){this.stellarUniforms.uDive.value=THREE.MathUtils.smoothstep(progress,.55,.84);}
  private stellarSphere: THREE.Mesh | null = null;
  private stellarHalo: THREE.Mesh | null = null;
  private spinVel = { x: 0, y: 0 };
  private coreDragging = false;
  private lastCamera: THREE.Camera | null = null;
  private stellarUniforms = {
    uMap: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uEnergy: { value: 0 },
    uSpinCharge: { value: 0 },
    uHover: { value: 0 },
    uShock: { value: 0 }, // strongest active wave (0 = none): drives the surface brightening
    uShocks: { value: [0, 0, 0, 0, 0, 0] }, // each click's own wave, 0..1 progress (0 = free slot)
    uClose: { value: 0 }, // 0 far .. 1 at the closest Explore point: more light, motion and atmosphere
    uMapReady: { value: 0 }, // 0 until the surface image has decoded, then eases to 1 (see buildStellarSprite)
    uDive: { value: 0 }, // exterior radiance dissolves into the interior during the boundary crossing
  };
  private shockStarts: number[] = [];
  /** performance.now() when the surface image finished loading; null while it is still streaming in. */
  private stellarMapLoadedAt: number | null = null;

  /** User grabbed the core: turn ONLY the core, about the camera's own axes (a trackball). */
  public dragCore(dxPx: number, dyPx: number, dtMs: number) {
    const k = 0.008;
    this.turnCore(dxPx * k, dyPx * k);
    const inv = 1000 / Math.max(8, dtMs);
    this.spinVel.x = dxPx * k * inv;
    this.spinVel.y = dyPx * k * inv;
  }
  public setCoreDragging(on: boolean) {
    this.coreDragging = on;
  }
  /** A click on the core (no drag): shockwave out of the limb, ripples across the surface, a small jump. */
  public pulseCore() {
    // every click adds its own wave; earlier ones keep travelling (oldest dropped past 6)
    this.shockStarts.push(performance.now());
    if (this.shockStarts.length > 6) this.shockStarts.shift();
  }
  private tmpAxis = new THREE.Vector3();
  private turnCore(yaw: number, pitch: number) {
    const s = this.stellarSphere;
    if (!s) return;
    const cam = this.lastCamera;
    const up = cam ? this.tmpAxis.set(0, 1, 0).applyQuaternion(cam.quaternion) : this.tmpAxis.set(0, 1, 0);
    s.rotateOnWorldAxis(up, yaw);
    const right = cam ? this.tmpAxis.set(1, 0, 0).applyQuaternion(cam.quaternion) : this.tmpAxis.set(1, 0, 0);
    s.rotateOnWorldAxis(right, pitch);
  }

  private buildStellarSprite() {
    // The 2 MB surface image streams in after the first frames. Until it decodes the sphere shows its own procedural
    // plasma (below) at the same colour/brightness, then crossfades to the image: never an unlit black ball.
    const tex = new THREE.TextureLoader().load("/textures/stellar-core-reference-v1.png", () => { this.stellarMapLoadedAt = performance.now(); });
    tex.colorSpace = THREE.SRGBColorSpace;
    this.stellarUniforms.uMap.value = tex;
    const U = this.stellarUniforms;
    const NOISE = `
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float v=0.0, a=0.5; for(int k=0;k<4;k++){ v+=a*n(p); p*=2.03; a*=0.5; } return v; }`;

    // ---- sphere: the star's body
    const sphereMat = new THREE.ShaderMaterial({
      uniforms: U,
      transparent: true /* draw in the same pass as the particles, after them (renderOrder) */, depthWrite: false, depthTest: false,
      vertexShader: `
        varying vec3 vObj; varying vec3 vViewN;
        void main(){
          vObj = normalize(position);
          vViewN = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D uMap; uniform float uTime; uniform float uEnergy; uniform float uSpinCharge; uniform float uHover; uniform float uShock; uniform float uShocks[6]; uniform float uClose; uniform float uDive; uniform float uMapReady;
        varying vec3 vObj; varying vec3 vViewN;
        ${NOISE}
        // Baseline surface used before the image is available: deep-blue plasma with bright electric veins.
        vec3 baseline(vec3 p, float t){
          float f = fbm(p.xy * 3.2 + p.z * 1.7 + t * 0.05);
          float g = fbm(p.yz * 7.0 - p.x * 2.0 - t * 0.07);
          vec3 deep = vec3(0.012, 0.075, 0.30), vein = vec3(0.30, 0.72, 1.0);
          return mix(deep, vein, smoothstep(0.38, 0.80, f) * (0.35 + 0.65 * g));
        }
        // centre crop of the image only (the disc spans r<0.405; the rim is never sampled)
        vec3 tap(vec2 p){ return texture2D(uMap, p * 0.27 + 0.5).rgb; }
        void main(){
          float t = uTime * (1.0 + 1.6 * uEnergy);
          vec3 p = vObj;
          // plasma flow on the surface: warp the lookup with slow noise so it churns in place
          vec2 w1 = vec2(fbm(p.xy * 3.0 + t * 0.12), fbm(p.yz * 3.0 - t * 0.1)) - 0.5;
          p += vec3(w1, -w1.x) * (0.12 + 0.1 * uClose);
          // a second, faster and finer flow layer that only resolves up close
          vec2 w2 = vec2(fbm(p.xz * 9.0 - t * 0.35), fbm(p.xy * 9.0 + t * 0.3)) - 0.5;
          p += vec3(w2.x, w2.y, w2.x - w2.y) * 0.05 * uClose;
          vec3 bw = pow(abs(normalize(p)), vec3(10.0)); bw /= (bw.x + bw.y + bw.z);
          vec3 col = tap(p.yz) * bw.x + tap(p.xz) * bw.y + tap(p.xy) * bw.z;
          col = mix(baseline(p, t), col, uMapReady);
          // restore the photo's deep-blue contrast (blending three taps flattens it toward white)
          // up close, lift the deep blues so the body glows rather than reading as a dark painted ball
          col = pow(col, vec3(mix(1.55, 1.2, uClose))) * (1.3 + 0.45 * uClose);
          // fine live filaments that only resolve at close range
          float fil = smoothstep(0.72, 0.95, fbm(vObj.xy * 22.0 + vObj.z * 11.0 - t * 0.5));
          col += vec3(0.55, 0.9, 1.0) * fil * 0.35 * uClose;
          float ndv = clamp(vViewN.z, 0.0, 1.0);
          // click ripples: rings travelling out from the centre of the face while the shock plays
          float d = 1.0 - ndv;
          float ripple = 0.0;
          for (int i = 0; i < 6; i++) { float k = uShocks[i]; if (k > 0.0) ripple += max(sin(d * 40.0 - k * 30.0), 0.0) * (1.0 - k) * smoothstep(0.0, 0.1, k); }
          col *= 1.0 + 0.35 * min(ripple, 2.0);
          // living light: breathing, drifting hot cells, hover brightening
          float breathe = 0.95 + 0.06 * sin(uTime * 0.9) + 0.3 * uEnergy + 0.45 * uHover + 0.5 * (1.0 - uShock) * step(0.001, uShock);
          float cells = smoothstep(0.62, 0.88, fbm(vObj.xy * 4.0 + vObj.z * 2.0 - t * 0.15));
          col = col * breathe + vec3(0.6, 0.92, 1.0) * cells * (0.08 + 0.2 * uEnergy);
          // limb: bright white-cyan rim at the silhouette, like the reference photo's edge
          float limb = pow(1.0 - ndv, 3.0);
          col = mix(col, vec3(0.88, 0.97, 1.0), clamp(limb * 1.2, 0.0, 1.0));
          col *= mix(1.0, 0.32, uDive);
          gl_FragColor = vec4(col, 1.0 - uDive);
        }`,
    });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), sphereMat);
    sphere.renderOrder = 21;
    sphere.raycast = () => {};
    sphere.rotation.set(0.35, 0, 0.12);

    // ---- halo: flames, glow and shockwave around the silhouette (camera facing, additive)
    const haloMat = new THREE.ShaderMaterial({
      uniforms: U,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform float uTime; uniform float uEnergy; uniform float uSpinCharge; uniform float uHover; uniform float uShock; uniform float uShocks[6]; uniform float uClose; uniform float uDive; varying vec2 vUv;
        ${NOISE}
        void main(){
          float t = uTime * (1.0 + 1.6 * uEnergy);
          vec2 c = (vUv - 0.5) * 3.24;
          float r = length(c);
          float ang = atan(c.y, c.x);
          const float R = 0.405;
          float over = r - R;
          float tongues = fbm(vec2(ang * 6.0 + t * 0.18, over * 8.0 - t * 0.9));
          float tongues2 = fbm(vec2(ang * 12.0 - t * 0.12, over * 14.0 - t * 1.2));
          float reach = (0.07 + 0.11 * tongues + 0.05 * uEnergy) * (0.8 + 0.4 * sin(uTime * 1.3 + ang * 3.0));
          float flame = smoothstep(reach, -0.01, over) * smoothstep(-0.02, 0.005, over) * (0.35 + 0.8 * tongues2);
          vec3 flameCol = mix(vec3(0.25, 0.7, 1.0), vec3(0.85, 0.97, 1.0), smoothstep(0.03, 0.0, over));
          float glow = exp(-max(over, 0.0) * (12.0 - 5.0 * uClose - 4.0 * uHover)) * (0.35 + 0.45 * uClose + 0.12 * sin(uTime * 1.7) + 0.35 * uEnergy + 0.9 * uHover) * smoothstep(R - 0.03, R + 0.005, r);
          // click shockwave: a bright ring leaving the limb and fading as it expands
          float shock = 0.0;
          for (int i = 0; i < 6; i++) { float k = uShocks[i]; if (k > 0.0) shock += exp(-pow((over - k * 0.77) / (0.012 + 0.03 * k), 2.0)) * (1.0 - k); }
          // atmosphere: a broad, faint scatter glow that grows as you approach, blending the star into the dust
          float atmo = exp(-max(over, 0.0) * 4.5) * smoothstep(R - 0.03, R + 0.005, r) * (0.18 + 0.06 * sin(uTime * 0.7)) * uClose;
          vec3 col = flameCol * flame * 0.8 + vec3(0.15, 0.5, 1.0) * glow * 0.55 + vec3(0.12, 0.42, 0.95) * atmo;
          // Short irregular electrical tracks remain trapped immediately outside the limb.
          float charge=uSpinCharge;
          float jag=sin(ang*27.+uTime*2.1)*.003+sin(ang*61.-uTime*3.3)*.002;
          float arc=0.;
          for(int j=0;j<3;j++){
            float lane=R+.013+float(j)*.017+jag;
            float track=exp(-pow((r-lane)/.0022,2.));
            float broken=smoothstep(.18,.65,sin(ang*(5.+float(j)*3.)+uTime*(.8+float(j)*.2)));
            arc+=track*broken;
          }
          col+=vec3(.25,.64,.95)*min(arc,.9)*charge*.65;
          // fade to zero well inside the plane (half-extent 0.9) so no square edge ever shows
          col *= 1.0 - smoothstep(0.62, 0.86, r);
          // The wave has its own wider support; the atmosphere fade must not clip its travel.
          col += vec3(0.7,0.94,1.0)*shock*1.4*(1.0-smoothstep(1.25,1.55,r));
          gl_FragColor = vec4(col * (1.0 - uDive), 1.0);
        }`,
    });
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), haloMat);
    halo.renderOrder = 22;
    halo.raycast = () => {};
    halo.onBeforeRender = (_r, _s, camera) => {
      halo.quaternion.copy(camera.quaternion);
      this.lastCamera = camera;
    };

    const root = new THREE.Group();
    root.add(sphere, halo);
    this.stellarSphere = sphere;
    this.stellarHalo = halo;
    this.stellarSprite = root;
    this.group.add(root);
  }

  private buildCoreGlowSprite() {
    if (this.coreSprite) {
      this.group.remove(this.coreSprite);
      this.coreSprite.material.map?.dispose();
      this.coreSprite.material.dispose();
      this.coreSprite = null;
    }
    if (this.outerCoronaSprite) {
      this.group.remove(this.outerCoronaSprite);
      this.outerCoronaSprite.material.map?.dispose();
      this.outerCoronaSprite.material.dispose();
      this.outerCoronaSprite = null;
    }

    // 1. Inner Electric-Cyan Corona & White-Hot Radiance (Calibrated Smooth Falloff)
    const canvasInner = document.createElement("canvas");
    canvasInner.width = 512;
    canvasInner.height = 512;
    const ctxInner = canvasInner.getContext("2d");
    if (ctxInner) {
      const g = ctxInner.createRadialGradient(256, 256, 0, 256, 256, 256);
      g.addColorStop(0.0, "rgba(255, 255, 255, 0.90)");
      g.addColorStop(0.22, "rgba(255, 255, 255, 0.80)");
      g.addColorStop(0.38, "rgba(160, 240, 255, 0.70)");
      g.addColorStop(0.55, "rgba(0, 220, 255, 0.55)");
      g.addColorStop(0.72, "rgba(10, 130, 250, 0.28)");
      g.addColorStop(0.88, "rgba(5, 50, 180, 0.08)");
      g.addColorStop(1.0, "rgba(0, 0, 0, 0.0)");
      ctxInner.fillStyle = g;
      ctxInner.fillRect(0, 0, 512, 512);
    }

    const textureInner = new THREE.CanvasTexture(canvasInner);
    const spriteMatInner = new THREE.SpriteMaterial({
      map: textureInner,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.68,
    });
    const spriteInner = new THREE.Sprite(spriteMatInner);
    spriteInner.scale.set(190, 190, 1);
    spriteInner.renderOrder = 1;
    this.coreSprite = spriteInner;
    this.group.add(spriteInner);

    // 2. Broad Electric-Cyan Outer Atmosphere Aura (Calibrated Soft Atmosphere)
    const canvasOuter = document.createElement("canvas");
    canvasOuter.width = 512;
    canvasOuter.height = 512;
    const ctxOuter = canvasOuter.getContext("2d");
    if (ctxOuter) {
      const g = ctxOuter.createRadialGradient(256, 256, 0, 256, 256, 256);
      g.addColorStop(0.0, "rgba(0, 220, 255, 0.42)");
      g.addColorStop(0.25, "rgba(10, 180, 255, 0.26)");
      g.addColorStop(0.50, "rgba(14, 120, 240, 0.11)");
      g.addColorStop(0.75, "rgba(6, 40, 140, 0.03)");
      g.addColorStop(1.0, "rgba(0, 0, 0, 0.0)");
      ctxOuter.fillStyle = g;
      ctxOuter.fillRect(0, 0, 512, 512);
    }

    const textureOuter = new THREE.CanvasTexture(canvasOuter);
    const spriteMatOuter = new THREE.SpriteMaterial({
      map: textureOuter,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.44,
    });
    const spriteOuter = new THREE.Sprite(spriteMatOuter);
    spriteOuter.scale.set(320, 320, 1);
    spriteOuter.renderOrder = 0;
    this.outerCoronaSprite = spriteOuter;
    this.group.add(spriteOuter);
  }

  public update(
    elapsedSec: number,
    cameraZ: number,
    proximityTarget: number,
    reducedMotion: boolean,
    deltaMs: number,
    brain: BrainDrive = BRAIN_DRIVE_IDLE,
  ) {
    // 0. Clamped frame delta: prevents background-tab suspension or hitch jumps
    const safeDeltaSec = Math.min(Math.max(deltaMs, 0), 64.0) / 1000.0;

    // 1. Frame-time monitoring & graceful fallback (no dynamic oscillation)
    this.emaFrameTime += (deltaMs - this.emaFrameTime) * 0.05;
    if (this.emaFrameTime > 20.0) {
      this.slowFrameCounter++;
      // If sustained >20ms for ~150 frames (~3 sec) and not yet on lowest tier, downshift
      if (this.slowFrameCounter > 150) {
        if (this.quality === "high") {
          this.quality = "medium";
          this.buildParticleSystem();
          this.slowFrameCounter = 0;
        } else if (this.quality === "medium") {
          this.quality = "low";
          this.buildParticleSystem();
          this.slowFrameCounter = 0;
        }
      }
    } else {
      this.slowFrameCounter = Math.max(0, this.slowFrameCounter - 1);
    }

    // 2. Smooth profile transitions (bounded lerp rates)
    const lerpSpeed = 0.06;
    this.currentProfile.brightness += (this.targetProfile.brightness - this.currentProfile.brightness) * lerpSpeed;
    this.currentProfile.pulseRate += (this.targetProfile.pulseRate - this.currentProfile.pulseRate) * lerpSpeed;
    this.currentProfile.pulseAmplitude += (this.targetProfile.pulseAmplitude - this.currentProfile.pulseAmplitude) * lerpSpeed;
    this.currentProfile.turbulence += (this.targetProfile.turbulence - this.currentProfile.turbulence) * lerpSpeed;
    this.currentProfile.flowSpeed += (this.targetProfile.flowSpeed - this.currentProfile.flowSpeed) * lerpSpeed;
    this.currentProfile.coreExpansion += (this.targetProfile.coreExpansion - this.currentProfile.coreExpansion) * lerpSpeed;

    // 3. Monotonic phase integrals (frame-rate independent; never reset, never wrap).
    if (!reducedMotion) {
      // 1.0 at idle baseline (0.22); the outer atmosphere swirls faster the deeper the dive
      const flowRate = (0.55 + this.currentProfile.flowSpeed * 2.0) * (1.0 + DIVE_SPEED_GAIN * brain.speed);
      this.flowTotal += safeDeltaSec * flowRate;
      this.flowBlend += safeDeltaSec * flowRate * brain.rigid;

      const turbRate = 0.65 + this.currentProfile.turbulence * 1.4; // 1.0 at idle baseline (0.25)
      this.accumulatedTurbTime += safeDeltaSec * turbRate;

      this.arborClock += safeDeltaSec;
    }

    // 4. Smooth cursor proximity
    this.smoothedProximity += (proximityTarget - this.smoothedProximity) * 0.08;

    // 5. Continuous depth scale based on camera distance (particles + CORE appearance unchanged):
    // At CORE (d=880): 0.92; at BRAIN (d=460): 0.52; approaching Missions scales with (d/460)*0.52.
    const dist = Math.max(0.1, cameraZ);
    const depthScale = dist >= 460.0
      ? THREE.MathUtils.clamp(0.52 + (dist - 460.0) * (0.40 / 420.0), 0.52, 1.15)
      : THREE.MathUtils.clamp((dist / 460.0) * 0.52, 0.02, 0.52);
    // Nucleus apparent size: exactly the CORE look at d>=880, then a slow, monotonic growth of
    // +NUCLEUS_BRAIN_BOOST while diving in to BRAIN (d=330), easing back toward Missions (d<330).
    const A0 = 0.92 / 880.0;
    const growth = dist >= 330.0 ? smoothstep(880.0, 330.0, dist) : smoothstep(120.0, 330.0, dist);
    // One smooth distance law (from the later journey work): no thresholds, the core grows continuously
    // as you scroll in and shrinks as you scroll out. Calibrated to match the CORE look at d=880.
    void growth; void A0; void NUCLEUS_BRAIN_BOOST;
    let nucleusScale = 0.92 * Math.pow(dist / 880.0, 0.45);
    // DIVE IN: hold the core's real size from the moment the plunge starts, so the approach is physical and
    // the core rushes up to fill the view instead of following the gentle scroll curve.
    if (this.plungeFreeze) {
      if (this.frozenNucleusScale === null) this.frozenNucleusScale = nucleusScale;
      nucleusScale = this.frozenNucleusScale;
    } else this.frozenNucleusScale = null;
    this.nucleusRadiusWorld = NUCLEUS_MESH_RADIUS * nucleusScale;

    // 6. Breathing pulse calculation
    const pulsePhase = elapsedSec * this.currentProfile.pulseRate * Math.PI * 2.0;
    const pulse = 1.0 + Math.sin(pulsePhase) * this.currentProfile.pulseAmplitude * this.currentProfile.coreExpansion;

    // 7. Shared uniforms (one write feeds the CORE, membrane, dendrites and junctions)
    const sh = this.shared;
    sh.uFlowTotal.value = this.flowTotal;
    sh.uFlowBlend.value = this.flowBlend;
    sh.uTurbTime.value = this.accumulatedTurbTime;
    sh.uTurbulence.value = this.currentProfile.turbulence;
    sh.uPulse.value = pulse;
    sh.uReducedMotion.value = reducedMotion ? 1.0 : 0.0;
    sh.uLinks.value = brain.links;
    sh.uClock.value = elapsedSec;
    sh.uTime64.value = this.arborClock % 64.0;

    const m = this.motion;
    m.flowTotal = this.flowTotal;
    m.flowBlend = this.flowBlend;
    m.turbTime = this.accumulatedTurbTime;
    m.turbulence = this.currentProfile.turbulence;
    m.pulse = pulse;
    m.reducedMotion = reducedMotion;

    // 8. Particle material
    if (this.shaderMaterial) {
      const u = this.shaderMaterial.uniforms;
      u.uBrightness.value = this.currentProfile.brightness * (1.0 + this.smoothedProximity * 0.25);
      u.uDepthScale.value = depthScale;
      u.uProximity.value = this.smoothedProximity;
    }

    // 9. Central white-hot nucleus body
    if (this.nucleusMesh && this.nucleusMaterial) {
      const nu = this.nucleusMaterial.uniforms;
      // slightly calmer body as the field connects (less white blowout up close)
      nu.uBrightness.value = this.currentProfile.brightness * (1.0 + this.smoothedProximity * 0.2) * (1.0 - 0.14 * brain.links);
      nu.uProximity.value = this.smoothedProximity;
      this.nucleusMesh.scale.set(nucleusScale, nucleusScale, nucleusScale);
      this.nucleusMesh.visible = !this.stellarSprite;
    }
    if (this.stellarSprite && this.stellarSphere && this.stellarHalo) {
      const radius = NUCLEUS_MESH_RADIUS * nucleusScale;
      // ONE journey value for the whole scroll, furthest point (1200) -> Explore end point (85), eased on a
      // log scale so every scroll notch changes it by a similar amount. Size, glow reach, glow strength,
      // surface light and atmosphere all follow it, so nothing steps or pops anywhere along the way.
      const jl = (Math.log(1200) - Math.log(THREE.MathUtils.clamp(dist, 136, 1200))) / (Math.log(1200) - Math.log(136));
      this.stellarUniforms.uClose.value = jl * jl * (3 - 2 * jl);
      const energy = this.currentState === "idle" ? 0 : 1;
      this.stellarUniforms.uEnergy.value += (energy - this.stellarUniforms.uEnergy.value) * 0.05;
      const speed=Math.hypot(this.spinVel.x,this.spinVel.y);
      const spinTarget=reducedMotion ? 0 : THREE.MathUtils.smoothstep(speed,.8,9);
      const spinEase=1-Math.exp(-Math.min(deltaMs,100)/140);
      this.stellarUniforms.uSpinCharge.value+=(spinTarget-this.stellarUniforms.uSpinCharge.value)*spinEase;
      this.stellarUniforms.uTime.value = reducedMotion ? 0 : elapsedSec;
      this.stellarUniforms.uMapReady.value = this.stellarMapLoadedAt === null ? 0 : THREE.MathUtils.smoothstep(performance.now() - this.stellarMapLoadedAt, 0, 600);
      this.stellarUniforms.uHover.value += (this.smoothedProximity - this.stellarUniforms.uHover.value) * 0.15;
      // click shockwave progress (1.6 s)
      const nowMs = performance.now();
      this.shockStarts = this.shockStarts.filter((t0) => nowMs - t0 < 1600);
      const slots = this.stellarUniforms.uShocks.value;
      for (let i = 0; i < 6; i++) slots[i] = i < this.shockStarts.length ? Math.max(0.0001, (nowMs - this.shockStarts[i]) / 1600) : 0;
      // newest wave drives the surface lift; jumps from overlapping clicks add up (capped)
      const shock = this.shockStarts.length ? slots[this.shockStarts.length - 1] : 0;
      this.stellarUniforms.uShock.value = shock;
      if (!reducedMotion && !this.coreDragging) {
        // release inertia decays smoothly back to the default turn
        const decay = Math.exp(-deltaMs / 700);
        this.spinVel.x *= decay;
        this.spinVel.y *= decay;
        const dt = deltaMs * 0.001;
        this.turnCore(this.spinVel.x * dt, this.spinVel.y * dt);
        // default sideways turn, OPPOSITE to the particle swirl (particles turn by -angle about Y)
        this.stellarSphere.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), dt * (0.12 + 0.15 * this.stellarUniforms.uEnergy.value));
      }
      // breathing + a springy jump on click
      let jump = 0;
      for (let i = 0; i < this.shockStarts.length; i++) jump += Math.sin(slots[i] * Math.PI) * Math.exp(-slots[i] * 3) * 0.12;
      jump = Math.min(jump, 0.22);
      const living = reducedMotion ? 1 : 1 + 0.018 * Math.sin(elapsedSec * 1.3) + 0.03 * this.stellarUniforms.uEnergy.value + jump;
      this.stellarSphere.scale.setScalar(radius * living);
      // Larger wave support; R=0.405 in 3.24x UV space preserves the existing corona world size.
      const size = (radius / 0.125) * living;
      this.stellarHalo.scale.set(size, size, 1);
    }

    // 10. Multi-tier electric cyan corona sprites
    // With the stellar core, its own halo is the ONLY glow: the old corona sprites follow a different,
    // kinked distance curve and produced a visible glow break when scrolling into Explore.
    if (this.stellarSprite) {
      if (this.coreSprite) this.coreSprite.visible = false;
      if (this.outerCoronaSprite) this.outerCoronaSprite.visible = false;
    }
    const pulseOffset = (pulse - 1.0);
    if (this.coreSprite) {
      const innerScale = 190 * (1.0 + pulseOffset * 0.6) * nucleusScale * (1.0 + this.smoothedProximity * 0.15);
      this.coreSprite.scale.set(innerScale, innerScale, 1);
      this.coreSprite.material.opacity = (0.58 + pulseOffset * 0.12) * Math.min(1.0, depthScale * 1.1) * (this.stellarSprite ? 0.35 : 1);
    }
    if (this.outerCoronaSprite) {
      const outerScale = 320 * (1.0 + pulseOffset * 0.5) * nucleusScale;
      this.outerCoronaSprite.scale.set(outerScale, outerScale, 1);
      this.outerCoronaSprite.material.opacity = (0.44 + pulseOffset * 0.08) * Math.min(1.0, depthScale * 1.1) * (this.stellarSprite ? 0.35 : 1);
    }
  }

  public dispose() {
    this.scene.remove(this.group);
    if (this.pointsMesh) {
      this.bufferGeometry?.dispose();
      this.shaderMaterial?.dispose();
    }
    if (this.nucleusMesh) {
      this.nucleusMesh.geometry.dispose();
      this.nucleusMaterial?.dispose();
    }
    if (this.coreSprite) {
      this.coreSprite.material.map?.dispose();
      this.coreSprite.material.dispose();
    }
    if (this.outerCoronaSprite) {
      this.outerCoronaSprite.material.map?.dispose();
      this.outerCoronaSprite.material.dispose();
    }
  }
}
