import * as THREE from "three";
import {
  type CoreQualityTier,
  type NeutronCoreState,
  QUALITY_CONFIGS,
  STATE_PROFILES,
  type StateVisualProfile,
} from "./neutronCoreTypes";
import {
  NeutronCoreFragmentShader,
  NeutronCoreVertexShader,
  NeutronNucleusBodyFragmentShader,
  NeutronNucleusBodyVertexShader,
} from "./NeutronCoreShader";

function pseudoRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

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

  // Active state & visual parameters
  private currentState: NeutronCoreState = "idle";
  private currentProfile: StateVisualProfile = { ...STATE_PROFILES.idle };
  private targetProfile: StateVisualProfile = { ...STATE_PROFILES.idle };

  // Proximity & depth smoothing
  private smoothedProximity = 0;

  // Integrated stable circulation phases (eliminates variable-speed time multiplication runaway)
  private accumulatedFlowTime = 0;
  private accumulatedTurbTime = 0;

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

  private buildParticleSystem() {
    // Clean up any existing points
    if (this.pointsMesh) {
      this.group.remove(this.pointsMesh);
      this.bufferGeometry?.dispose();
      this.shaderMaterial?.dispose();
      this.pointsMesh = null;
    }

    const cfg = QUALITY_CONFIGS[this.quality];
    const totalCount = cfg.nucleusCount + cfg.flowCount + cfg.atmosphereCount;

    const positions = new Float32Array(totalCount * 3);
    const aRandom = new Float32Array(totalCount * 3);
    const aRadius = new Float32Array(totalCount);
    const aScale = new Float32Array(totalCount);

    const rand = pseudoRandom(20260926);
    let idx = 0;

    // 1. Dense Central Nucleus (concentrated white-hot energy sphere): r in [0, 36]
    for (let i = 0; i < cfg.nucleusCount; i++) {
      const u = rand();
      const v = rand();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      // Continuous cubic power distribution: dense, coalesced luminous body at r in [0, 16] smoothly expanding to 36
      const r = Math.pow(rand(), 2.2) * 36.0;

      const sinPhi = Math.sin(phi);
      positions[idx * 3] = r * sinPhi * Math.cos(theta);
      positions[idx * 3 + 1] = r * sinPhi * Math.sin(theta);
      positions[idx * 3 + 2] = r * Math.cos(phi);

      aRandom[idx * 3] = rand();
      aRandom[idx * 3 + 1] = rand();
      aRandom[idx * 3 + 2] = rand();
      aRadius[idx] = r;
      aScale[idx] = 0.85 + rand() * 0.45;
      idx++;
    }

    // 2. Volumetric Spherical Mantle (luminous electric-cyan body): r in [25, 120]
    for (let i = 0; i < cfg.flowCount; i++) {
      const u = rand();
      const v = rand();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 25.0 + Math.pow(rand(), 1.4) * 95.0;

      const sinPhi = Math.sin(phi);
      positions[idx * 3] = r * sinPhi * Math.cos(theta);
      positions[idx * 3 + 1] = r * sinPhi * Math.sin(theta);
      positions[idx * 3 + 2] = r * Math.cos(phi);

      aRandom[idx * 3] = rand();
      aRandom[idx * 3 + 1] = rand();
      aRandom[idx * 3 + 2] = rand();
      aRadius[idx] = r;
      aScale[idx] = 0.6 + rand() * 0.7;
      idx++;
    }

    // 3. Atmospheric Halo Envelope (soft dissolving energetic particles into void): r in [70, 220]
    for (let i = 0; i < cfg.atmosphereCount; i++) {
      const u = rand();
      const v = rand();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 70.0 + Math.pow(rand(), 1.3) * 150.0;

      const sinPhi = Math.sin(phi);
      positions[idx * 3] = r * sinPhi * Math.cos(theta);
      positions[idx * 3 + 1] = r * sinPhi * Math.sin(theta);
      positions[idx * 3 + 2] = r * Math.cos(phi);

      aRandom[idx * 3] = rand();
      aRandom[idx * 3 + 1] = rand();
      aRandom[idx * 3 + 2] = rand();
      aRadius[idx] = r;
      aScale[idx] = 0.4 + rand() * 0.55;
      idx++;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aRandom", new THREE.BufferAttribute(aRandom, 3));
    geo.setAttribute("aRadius", new THREE.BufferAttribute(aRadius, 1));
    geo.setAttribute("aScale", new THREE.BufferAttribute(aScale, 1));
    this.bufferGeometry = geo;

    const mat = new THREE.ShaderMaterial({
      vertexShader: NeutronCoreVertexShader,
      fragmentShader: NeutronCoreFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uFlowTime: { value: 0 },
        uTurbTime: { value: 0 },
        uBrightness: { value: 1.0 },
        uDepthScale: { value: 1.0 },
        uTurbulence: { value: 0.25 },
        uFlowSpeed: { value: 0.22 },
        uPulse: { value: 1.0 },
        uProximity: { value: 0.0 },
        uReducedMotion: { value: 0.0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.shaderMaterial = mat;

    this.pointsMesh = new THREE.Points(geo, mat);
    this.pointsMesh.renderOrder = 3;
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
    const sphereGeo = new THREE.SphereGeometry(44, 48, 48);
    const nucleusMat = new THREE.ShaderMaterial({
      vertexShader: NeutronNucleusBodyVertexShader,
      fragmentShader: NeutronNucleusBodyFragmentShader,
      uniforms: {
        uPulse: { value: 1.0 },
        uTurbTime: { value: 0.0 },
        uBrightness: { value: 1.0 },
        uProximity: { value: 0.0 },
        uReducedMotion: { value: 0.0 },
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

    // 3. Integrated stable phase accumulation (frame-rate independent, zero time-multiplication runaway)
    if (!reducedMotion) {
      const flowRate = 0.55 + this.currentProfile.flowSpeed * 2.0; // 1.0 at idle baseline (0.22)
      this.accumulatedFlowTime += safeDeltaSec * flowRate;

      const turbRate = 0.65 + this.currentProfile.turbulence * 1.4; // 1.0 at idle baseline (0.25)
      this.accumulatedTurbTime += safeDeltaSec * turbRate;
    }

    // 4. Smooth cursor proximity
    this.smoothedProximity += (proximityTarget - this.smoothedProximity) * 0.08;

    // 5. Calculate depth scale based on camera distance
    // At Home z=950: 1.0; approaches Brain z=460: smoothly attenuates to 0.55; dive z=-70: expands gracefully
    const depthScale = THREE.MathUtils.clamp((cameraZ - 50.0) / 900.0, 0.45, 1.15);

    // 6. Breathing pulse calculation
    const pulsePhase = elapsedSec * this.currentProfile.pulseRate * Math.PI * 2.0;
    const pulse = 1.0 + Math.sin(pulsePhase) * this.currentProfile.pulseAmplitude * this.currentProfile.coreExpansion;

    // 7. Update shader uniforms for particles
    if (this.shaderMaterial) {
      const u = this.shaderMaterial.uniforms;
      u.uTime.value = elapsedSec;
      u.uFlowTime.value = this.accumulatedFlowTime;
      u.uTurbTime.value = this.accumulatedTurbTime;
      u.uBrightness.value = this.currentProfile.brightness * (1.0 + this.smoothedProximity * 0.25);
      u.uDepthScale.value = depthScale;
      u.uTurbulence.value = this.currentProfile.turbulence;
      u.uFlowSpeed.value = this.currentProfile.flowSpeed;
      u.uPulse.value = pulse;
      u.uProximity.value = this.smoothedProximity;
      u.uReducedMotion.value = reducedMotion ? 1.0 : 0.0;
    }

    // 8. Update central white-hot nucleus body shader & scale
    if (this.nucleusMesh && this.nucleusMaterial) {
      const nu = this.nucleusMaterial.uniforms;
      nu.uPulse.value = pulse;
      nu.uTurbTime.value = this.accumulatedTurbTime;
      nu.uBrightness.value = this.currentProfile.brightness * (1.0 + this.smoothedProximity * 0.2);
      nu.uProximity.value = this.smoothedProximity;
      nu.uReducedMotion.value = reducedMotion ? 1.0 : 0.0;
      this.nucleusMesh.scale.set(depthScale, depthScale, depthScale);
    }

    // 9. Update multi-tier electric cyan corona sprites
    const pulseOffset = (pulse - 1.0);
    if (this.coreSprite) {
      const innerScale = 190 * (1.0 + pulseOffset * 0.6) * depthScale * (1.0 + this.smoothedProximity * 0.15);
      this.coreSprite.scale.set(innerScale, innerScale, 1);
      this.coreSprite.material.opacity = (0.68 + pulseOffset * 0.12) * Math.min(1.0, depthScale * 1.1);
    }
    if (this.outerCoronaSprite) {
      const outerScale = 320 * (1.0 + pulseOffset * 0.5) * depthScale;
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
