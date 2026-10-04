/** Optical appearance only; no values represent operational activity. */
export const innerCoreVisualConfig = {
  calibration: { width: 1920, height: 1080, dpr: 1, time: 0 },
  geometry: { radius: 1.18, cameraZ: 5.87, fov: 34, centerY: .055, centerX: .01, canvasPadding: 64, deformation: .002, frequency: 10,
    shells: [{ scale: .98, density: .5, phase: 1.2 }, { scale: .91, density: .45, phase: 3.7 }, { scale: .82, density: .4, phase: 5.4 }] },
  material: { outerDensity: 1.4, fresnelExponent: 2.8, rimIntensity: .88, centerOpacity: .008, foldIntensity: 1.1,
    cyan: [.12,.68,1.0], deepBlue: [.015,.13,.25], transmission: .88, emissive: .65, foldNormal: .85, foldFrequency: 6.1, keyExponent: 1.6, bounceExponent: 1.8, maximumOpacity: .82, thickness: .06, rimWhite: .35, auraWidth: .16, auraIntensity: .12 },
  nucleus: { planeSize: 2.8, radiusFalloff: 540, whiteIntensity: 1.35, bloomFalloff: 20, bloomIntensity: .72, haloFalloff: 42, haloIntensity: .45 },
  paths: { count: 16, nodes: 18, radius: .87, opacity: .12, highlightOpacity: .2, thickness: 1, nodeRadius: .009, nodeOpacity: .65, color: 0x318ab5, highlightColor: 0x78d9ee, nodeColor: 0xb8f3ff },
  orbits: { count: 0, radius: 1.7, minorRadius: 1.08, opacity: .36, thickness: 1, nodesPerOrbit: 2, color: [.22,.64,.76], nodeScale: 2.8,
    tilts: [[.45,.2,-.55],[.7,.3,.55],[.85,-.2,0]] },
  base: { radii: [], y: -1.18, eccentricity: .4, opacity: .38, brightness: 0x48cee8, blur: .18, glowIntensity: .42, glowColor: [.12,.7,1] },
  background: { arcOpacity: 0, center: '#001523', middle: '#001019', edge: '#01090f', centerX: 960, centerY: 565, scaleX: 1030, scaleY: 420 },
} as const;
export function coreCalibrationEnabled(search: string, production: boolean) {
  return !production && new URLSearchParams(search).get('coreCalibration') === '1';
}
