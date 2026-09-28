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
    const nucleusScale = dist >= 880.0 ? depthScale : dist * A0 * (1.0 + NUCLEUS_BRAIN_BOOST * growth);
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
    }

    // 10. Multi-tier electric cyan corona sprites
    const pulseOffset = (pulse - 1.0);
    if (this.coreSprite) {
      const innerScale = 190 * (1.0 + pulseOffset * 0.6) * nucleusScale * (1.0 + this.smoothedProximity * 0.15);
      this.coreSprite.scale.set(innerScale, innerScale, 1);
      this.coreSprite.material.opacity = (0.58 + pulseOffset * 0.12) * Math.min(1.0, depthScale * 1.1);
    }
    if (this.outerCoronaSprite) {
      const outerScale = 320 * (1.0 + pulseOffset * 0.5) * nucleusScale;
      this.outerCoronaSprite.scale.set(outerScale, outerScale, 1);
      this.outerCoronaSprite.material.opacity = (0.44 + pulseOffset * 0.08) * Math.min(1.0, depthScale * 1.1);
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
