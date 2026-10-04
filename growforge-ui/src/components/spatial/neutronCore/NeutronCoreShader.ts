import { CORE_MOTION_GLSL } from "./coreMotionGlsl";

export const NeutronCoreVertexShader = /* glsl */ `
  attribute vec3 aRandom;
  attribute float aRadius;
  attribute float aScale;
  attribute float aMember;   // 1 = atmosphere particle that can link up in BRAIN

  uniform float uBrightness;
  uniform float uDepthScale;
  uniform float uProximity;
  uniform float uLinks;
  uniform float uDepthFx; // 1 = volumetric depth treatment on (verification can A/B it)

  ${CORE_MOTION_GLSL}

  varying float vDistToCenter;
  varying float vRandom;
  varying float vProximity;
  varying float vNoise;
  varying float vMember;
  varying float vDim;
  varying float vOuter;
  varying float vCalm;
  varying float vDof;
  varying float vDepthLum;
  varying float vThin;

  void main() {
    vRandom = aRandom.x;
    vProximity = uProximity;

    vec3 pos = coreParticleWorld(position, aRandom);
    vMember = aMember * uLinks;

    vDistToCenter = length(pos);
    vDim = (1.0 - aMember) * uLinks * smoothstep(60.0, 95.0, vDistToCenter);
    // BRAIN focuses on the inner field: the outer atmosphere recedes as the field connects
    vOuter = uLinks * smoothstep(118.0, 190.0, vDistToCenter);
    vCalm = uLinks;
    vNoise = sin(uTurbTime * 2.2 + aRandom.y * 12.566);

    // Volume opening: as the user zooms in, the loose dust (not the linked structure, not the nucleus/corona)
    // spreads outward - by BRAIN it reaches past the camera, so the user travels *through* the field with real
    // parallax and visible space between particles. Same particles; CORE (uLinks = 0) is unchanged.
    float spread = uLinks * uDepthFx * (1.0 - aMember) * smoothstep(45.0, 120.0, length(position));
    pos *= 1.0 + 0.95 * spread;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Cohesive point size scaling: dense seamless energy coalescence in nucleus, soft atmospheric dust in envelope
    float coreSizing = smoothstep(36.0, 0.0, vDistToCenter);
    float baseSize = mix(16.0, 28.0, coreSizing) * mix(1.0, 0.75, smoothstep(50.0, 180.0, vDistToCenter));
    float pointSize = baseSize * aScale * (320.0 / max(1.0, -mvPosition.z)) * uDepthScale;
    pointSize *= (1.0 + uProximity * 0.25);
    pointSize *= (1.0 + vMember * 0.12);

    // Volumetric depth, growing with zoom depth (uLinks = 0 in CORE, so CORE is unchanged):
    //  - the non-structural envelope thins out, so the field opens up instead of reading as one dense layer
    //  - particles in front of the core's depth plane grow and soften (near, out of focus), particles behind
    //    shrink and dim (far); the band around the core stays sharp. The existing swirl then gives parallax.
    float depthOn = uLinks * uDepthFx;
    vec4 mvCore = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float dz = mvPosition.z - mvCore.z; // > 0: closer to the camera than the core
    float front = smoothstep(15.0, 120.0, dz);
    float back = smoothstep(15.0, 140.0, -dz);
    float thinnable = (1.0 - aMember) * smoothstep(38.0, 60.0, length(position));
    // near-lens fade: dust about to pass the camera dissolves instead of becoming blobs
    float nearFade = mix(1.0, smoothstep(35.0, 120.0, -mvPosition.z), depthOn);
    vThin = (1.0 - thinnable * smoothstep(aRandom.y, aRandom.y + 0.08, 0.5 * depthOn)) * nearFade;
    vDof = depthOn * max(front, 0.55 * back);
    vDepthLum = 1.0 + depthOn * (0.15 * front - 0.7 * back);
    pointSize *= 1.0 + depthOn * (0.7 * front - 0.5 * back);
    gl_PointSize = vThin < 0.01 ? 0.0 : clamp(pointSize, 1.5, 48.0);
  }
`;

export const NeutronCoreFragmentShader = /* glsl */ `
  uniform float uBrightness;
  uniform float uProximity;

  varying float vDistToCenter;
  varying float vRandom;
  varying float vProximity;
  varying float vNoise;
  varying float vMember;
  varying float vDim;
  varying float vOuter;
  varying float vCalm;
  varying float vDof;
  varying float vDepthLum;
  varying float vThin;

  void main() {
    // 2D distance from point sprite center (range 0.0 to 1.0)
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord) * 2.0;
    if (dist > 1.0) {
      discard;
    }

    // Multi-tier Gaussian energy distribution: intense core spot + radiant aura
    // out-of-focus (near/far) particles get a softer profile; in-focus ones stay tight
    float coreGauss = exp(-dist * dist * mix(5.0 + 1.5 * vMember, 2.8, vDof));
    float auraGauss = exp(-dist * 2.4) * 0.50 * (1.0 - 0.15 * vMember) * (1.0 + 0.4 * vDof);
    float hotCenter = exp(-dist * 9.0) * 0.85;

    // Approved GrowForge neutron star palette (matching Reference A):
    vec3 cWhite = vec3(1.0, 1.0, 1.0);
    vec3 cWhiteHotCyan = vec3(0.78, 0.92, 1.0);
    vec3 cElectricCyan = vec3(0.20, 0.66, 1.0); // matched to the stellar core's blue
    vec3 cRadiantBlue = vec3(0.10, 0.42, 0.92);
    vec3 cDeepSpaceBlue = vec3(0.02, 0.18, 0.50);

    float nucleusFactor = smoothstep(26.0, 0.0, vDistToCenter);
    float coronaFactor = smoothstep(55.0, 16.0, vDistToCenter);
    float mantleFactor = smoothstep(135.0, 32.0, vDistToCenter);
    float atmosphereFactor = smoothstep(230.0, 70.0, vDistToCenter);

    float plasmaShimmer = 0.85 + 0.15 * vNoise;

    vec3 col = cDeepSpaceBlue;
    col = mix(col, cRadiantBlue, atmosphereFactor);
    col = mix(col, cElectricCyan, mantleFactor);
    col = mix(col, cWhiteHotCyan, coronaFactor * 0.88);
    col = mix(col, cWhite, pow(nucleusFactor, 1.15) * plasmaShimmer + hotCenter * 0.4 * nucleusFactor);

    // Linked atmosphere particles warm very slightly toward white-cyan (restrained)
    col = mix(col, vec3(0.70, 0.95, 1.0), vMember * 0.28);

    col = mix(col, cWhite, vProximity * 0.15);

    float particleEnergy = (coreGauss * 0.55 + auraGauss * 0.45 + hotCenter * 0.65 * nucleusFactor);
    // the white-hot centre calms down as the field connects (no blowout up close)
    float radialLuminance = mix(0.75, 1.32 - 0.34 * vCalm, nucleusFactor) * (1.0 - 0.18 * vCalm * coronaFactor);
    float lumBoost = (1.0 + vMember * 0.22 - vDim * 0.3) * (1.0 - 0.8 * vOuter);
    float particleIntensity = particleEnergy * radialLuminance * uBrightness * 1.35 * lumBoost * vDepthLum * (1.0 - 0.3 * vDof) * vThin;

    gl_FragColor = vec4(col * particleIntensity, particleIntensity);
  }
`;

export const NeutronNucleusBodyVertexShader = /* glsl */ `
  uniform float uPulse;
  uniform float uTurbTime;
  uniform float uReducedMotion;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;

  void main() {
    vNormal = normalize(normalMatrix * normal);

    vec3 pos = position;
    if (uReducedMotion < 0.5) {
      // Micro-plasma organic breathing pulse (gated by non-idle pulse states)
      float pulseScale = 1.0 + (uPulse - 1.0) * 0.60;
      pos *= pulseScale;

      // Subtle high-frequency surface perturbation (subtle micro-plasma skin)
      float shimmer = sin(pos.x * 0.12 + pos.y * 0.12 + uTurbTime * 1.4) * 0.10;
      pos += normal * shimmer;
    }

    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPosition = worldPos.xyz;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const NeutronNucleusBodyFragmentShader = /* glsl */ `
  uniform float uBrightness;
  uniform float uTurbTime;
  uniform float uProximity;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;

  void main() {
    vec3 viewDir = normalize(vViewPosition);
    vec3 normal = normalize(vNormal);

    // Fresnel / View Incidence: center facing camera = 1.0, grazing edge = 0.0
    float NdotV = max(0.0, dot(normal, viewDir));

    // Substantial luminous white-hot mass (Reference A): solid white core with non-linear limb falloff
    float coreLuminance = pow(NdotV, 0.55);
    float limbGlow = pow(1.0 - NdotV, 1.3);

    // Subtle internal plasma turbulence texture
    float plasmaNoise = sin(vWorldPosition.x * 0.12 + uTurbTime * 1.6) *
                        cos(vWorldPosition.y * 0.12 - uTurbTime * 1.4) *
                        sin(vWorldPosition.z * 0.12 + uTurbTime * 1.2);
    float shimmer = 0.96 + 0.04 * plasmaNoise;

    // Reference A Palette:
    // Core: Pure blazing white (#FFFFFF)
    // Limb: Saturated electric cyan (#00F0FF / #0DEBFF)
    vec3 cPureWhite = vec3(1.0, 1.0, 1.0);
    vec3 cElectricCyan = vec3(0.05, 0.92, 1.0);

    // Composite core color: blazing white interior with rich electric cyan limb
    vec3 col = mix(cElectricCyan, cPureWhite, coreLuminance * shimmer);
    col += cElectricCyan * limbGlow * 1.2;

    // Soft silhouette edge with cinematic calibrated alpha (preventing overexposed blowout)
    float edgeAlpha = smoothstep(0.0, 0.20, NdotV);
    float alpha = mix(0.58, 0.77, edgeAlpha) * uBrightness;

    gl_FragColor = vec4(col * alpha, alpha);
  }
`;
