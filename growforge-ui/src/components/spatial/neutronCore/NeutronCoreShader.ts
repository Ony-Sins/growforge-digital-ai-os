export const NeutronCoreVertexShader = /* glsl */ `
  attribute vec3 aRandom;
  attribute float aRadius;
  attribute float aScale;

  uniform float uTime;
  uniform float uFlowTime;
  uniform float uTurbTime;
  uniform float uBrightness;
  uniform float uDepthScale;
  uniform float uTurbulence;
  uniform float uFlowSpeed;
  uniform float uPulse;
  uniform float uProximity;
  uniform float uReducedMotion;

  varying float vDistToCenter;
  varying float vRandom;
  varying float vProximity;
  varying float vNoise;

  void main() {
    vRandom = aRandom.x;
    vProximity = uProximity;

    vec3 pos = position;
    float origR = length(pos);

    if (uReducedMotion < 0.5) {
      // 1. Volumetric breathing pulse (strongest at hot core, gentle at perimeter)
      float pulseEffect = (uPulse - 1.0) * exp(-origR / 80.0);
      pos += (origR > 0.001 ? normalize(pos) : vec3(0.0, 1.0, 0.0)) * pulseEffect * origR;

      // 2. Convective 3D fluid currents in rest frame: stable & cohesive in the nucleus, fully fluid in the mantle
      float convPhase = uTurbTime * 1.2 + aRandom.y * 6.28318;
      float turbIntensity = smoothstep(2.0, 24.0, origR) * (1.1 + uTurbulence * 1.5) * exp(-origR / 180.0) * aRandom.z;
      vec3 convectiveFlow = vec3(
        sin(convPhase + origR * 0.04 + aRandom.x * 3.14159),
        cos(convPhase * 0.92 + pos.y * 0.04 + aRandom.z * 3.14159) * 1.1,
        sin(convPhase * 1.08 + pos.z * 0.04 + aRandom.y * 3.14159)
      ) * turbIntensity;
      pos += convectiveFlow;

      // 3. Subtle spherical surface perturbation (micro-plasma texture, tapered inside dense nucleus)
      float waveTaper = smoothstep(4.0, 28.0, origR);
      float wave = sin(origR * 0.06 - uTurbTime * 1.4 + aRandom.z * 6.28318) * (0.6 + uTurbulence * 1.0) * waveTaper;
      pos += (origR > 0.001 ? normalize(pos) : vec3(0.0, 1.0, 0.0)) * wave;

      // 4. 3D Spherical Differential Circulation (calm, composed structural rotation: ~35-45s per revolution)
      float rTotal = length(pos);
      float angSpeed = 0.165 / (1.0 + pow(rTotal / 95.0, 0.65));
      float angle = angSpeed * uFlowTime + aRandom.x * 6.28318;
      
      float cosA = cos(angle);
      float sinA = sin(angle);
      float nx = pos.x * cosA - pos.z * sinA;
      float nz = pos.x * sinA + pos.z * cosA;
      pos.x = nx;
      pos.z = nz;
    }

    vDistToCenter = length(pos);
    vNoise = sin(uTurbTime * 2.2 + aRandom.y * 12.566);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Cohesive point size scaling: dense seamless energy coalescence in nucleus, soft atmospheric dust in envelope
    float coreSizing = smoothstep(36.0, 0.0, vDistToCenter);
    float baseSize = mix(16.0, 28.0, coreSizing) * mix(1.0, 0.75, smoothstep(50.0, 180.0, vDistToCenter));
    float pointSize = baseSize * aScale * (320.0 / max(1.0, -mvPosition.z)) * uDepthScale;
    pointSize *= (1.0 + uProximity * 0.25);
    gl_PointSize = clamp(pointSize, 1.5, 48.0);
  }
`;

export const NeutronCoreFragmentShader = /* glsl */ `
  uniform float uBrightness;
  uniform float uProximity;

  varying float vDistToCenter;
  varying float vRandom;
  varying float vProximity;
  varying float vNoise;

  void main() {
    // 2D distance from point sprite center (range 0.0 to 1.0)
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord) * 2.0;
    if (dist > 1.0) {
      discard;
    }

    // Multi-tier Gaussian energy distribution: intense core spot + radiant aura
    float coreGauss = exp(-dist * dist * 5.0);
    float auraGauss = exp(-dist * 2.4) * 0.50;
    float hotCenter = exp(-dist * 9.0) * 0.85;

    // Approved GrowForge neutron star palette (matching Reference A):
    // White-Hot Core -> Saturated Electric Cyan -> Radiant Sky/Instrument Blue -> Deep Void Envelope
    vec3 cWhite = vec3(1.0, 1.0, 1.0);
    vec3 cWhiteHotCyan = vec3(0.72, 0.96, 1.0);       // Ultra-hot cyan transition
    vec3 cElectricCyan = vec3(0.05, 0.92, 1.0);       // Saturated electric cyan (#0DEBFF)
    vec3 cRadiantBlue = vec3(0.12, 0.60, 1.0);        // Luminous sky blue (#1F99FF)
    vec3 cDeepSpaceBlue = vec3(0.02, 0.18, 0.50);

    // Non-linear radial structure profiles:
    // Inner Neutron Nucleus: r in [0..24] (white-hot concentrated intelligence core)
    // Cyan Corona: r in [20..55] (intense luminous electric-cyan energy boundary)
    // Mantle: r in [45..135] (radiant electric/sky blue circulating body)
    // Atmosphere Envelope: r in [110..220+] (soft particle field dissolving into void)
    float nucleusFactor = smoothstep(26.0, 0.0, vDistToCenter);
    float coronaFactor = smoothstep(55.0, 16.0, vDistToCenter);
    float mantleFactor = smoothstep(135.0, 32.0, vDistToCenter);
    float atmosphereFactor = smoothstep(230.0, 70.0, vDistToCenter);

    // Micro-plasma internal shimmer (subtle high-energy luminance fluctuations)
    float plasmaShimmer = 0.85 + 0.15 * vNoise;

    // Seamless composite color
    vec3 col = cDeepSpaceBlue;
    col = mix(col, cRadiantBlue, atmosphereFactor);
    col = mix(col, cElectricCyan, mantleFactor);
    col = mix(col, cWhiteHotCyan, coronaFactor * 0.88);
    col = mix(col, cWhite, pow(nucleusFactor, 1.15) * plasmaShimmer + hotCenter * 0.4 * nucleusFactor);

    // Cursor proximity boost
    col = mix(col, cWhite, vProximity * 0.15);

    // Intensity shaping: vibrant luminous particles matching Reference A
    float particleEnergy = (coreGauss * 0.55 + auraGauss * 0.45 + hotCenter * 0.65 * nucleusFactor);
    float radialLuminance = mix(0.75, 1.45, nucleusFactor);
    float particleIntensity = particleEnergy * radialLuminance * uBrightness * 1.35;

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
    float alpha = mix(0.65, 0.85, edgeAlpha) * uBrightness;

    gl_FragColor = vec4(col * alpha, alpha);
  }
`;
