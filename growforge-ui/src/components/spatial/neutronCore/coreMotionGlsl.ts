/**
 * Single GLSL source of truth for where a CORE particle is in world space.
 * Included by the CORE points shader, the BRAIN membrane-link shader, the
 * dendrite ribbon shader (gate binding) and the junction-point shader, so the
 * same particle index resolves to the same position everywhere.
 *
 * CPU replica: `computeCoreParticle` in coreParticleField.ts (keep in lockstep;
 * verified in-browser against transform-feedback readback).
 */
export const CORE_MOTION_GLSL = /* glsl */ `
  uniform float uFlowTotal;
  uniform float uFlowBlend;
  uniform float uTurbTime;
  uniform float uTurbulence;
  uniform float uPulse;
  uniform float uReducedMotion;

  const float RIGID_OMEGA = 0.07;

  vec3 coreParticleWorld(vec3 base, vec3 rnd) {
    vec3 pos = base;
    float origR = length(base);
    if (uReducedMotion < 0.5) {
      vec3 n0 = origR > 0.001 ? base / origR : vec3(0.0, 1.0, 0.0);

      // 1. Breathing pulse (strongest at hot core, gentle at perimeter)
      float pulseEffect = (uPulse - 1.0) * exp(-origR / 80.0);
      pos += n0 * pulseEffect * origR;

      // 2. Convective 3D currents
      float convPhase = uTurbTime * 1.2 + rnd.y * 6.28318;
      float turbIntensity = smoothstep(2.0, 24.0, origR) * (1.1 + uTurbulence * 1.5) * exp(-origR / 180.0) * rnd.z;
      vec3 conv = vec3(
        sin(convPhase + origR * 0.04 + rnd.x * 3.14159),
        cos(convPhase * 0.92 + pos.y * 0.04 + rnd.z * 3.14159) * 1.1,
        sin(convPhase * 1.08 + pos.z * 0.04 + rnd.y * 3.14159)
      ) * turbIntensity;
      pos += conv;

      // 3. Micro-plasma surface perturbation
      float waveTaper = smoothstep(4.0, 28.0, origR);
      float wave = sin(origR * 0.06 - uTurbTime * 1.4 + rnd.z * 6.28318) * (0.6 + uTurbulence * 1.0) * waveTaper;
      float rT = length(pos);
      pos += (rT > 0.001 ? pos / rT : vec3(0.0, 1.0, 0.0)) * wave;

      // 4. Rotation about Y. Angular speed is a per-particle CONSTANT (unperturbed
      // radius), so the angle is exactly linear in accumulated time - it can never
      // drift or wobble more the longer the page stays open. The outer shell blends
      // into the shared rigid neural frame via the monotonic accumulator uFlowBlend.
      float omega = 0.165 / (1.0 + pow(origR / 95.0, 0.65));
      float m = smoothstep(50.0, 90.0, origR);
      float angle = omega * (uFlowTotal - m * uFlowBlend) + RIGID_OMEGA * m * uFlowBlend + rnd.x * 6.28318;
      float ca = cos(angle);
      float sa = sin(angle);
      pos = vec3(pos.x * ca - pos.z * sa, pos.y, pos.x * sa + pos.z * ca);
    }
    return pos;
  }
`;
