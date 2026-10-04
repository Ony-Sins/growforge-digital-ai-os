"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { innerCoreVisualConfig as optics, coreCalibrationEnabled } from "./innerCoreVisualConfig";
import styles from "./OverviewRuntime.module.css";
import type { InnerCorePhase } from './overviewCommandModel';
import { NORA_AUDIO_EVENT } from "@/lib/noraVisualSignal";

const initialCalibrationSearch = typeof window === "undefined" ? "" : window.location.search;

// Native ambient material only. No geometry represents agents, jobs or traffic.
const membraneVertex = `
  varying vec3 surface;
  varying vec3 normalView;
  varying vec3 viewDirection;
  void main() {
    surface = position;
    float fold = sin(position.y * ${optics.geometry.frequency.toFixed(1)} + sin(position.x * 3.0) * 1.2) * ${optics.geometry.deformation.toFixed(6)};
    vec4 p = modelViewMatrix * vec4(position + normal * fold, 1.0);
    normalView = normalize(normalMatrix * normal);
    viewDirection = normalize(-p.xyz);
    gl_Position = projectionMatrix * p;
  }
`;
const membraneFragment = `
  varying vec3 surface;
  varying vec3 normalView;
  varying vec3 viewDirection;
  uniform float time;
  uniform float clarity;
  uniform float density;
  uniform float phase;
  void main() {
    vec3 perturbation = vec3(sin(surface.y * ${optics.material.foldFrequency.toFixed(1)} + phase), sin(surface.x * ${(optics.material.foldFrequency*.83).toFixed(2)} + phase), 0.0) * ${optics.material.foldNormal.toFixed(6)} * step(.5, phase);
    vec3 n = normalize(normalView + perturbation);
    float facing = abs(dot(n, normalize(viewDirection)));
    float rim = pow(1.0 - facing, ${optics.material.fresnelExponent.toFixed(6)});
    float key = pow(max(dot(n, normalize(vec3(-.62, .55, .58))), 0.0), ${optics.material.keyExponent.toFixed(6)});
    float bounce = pow(max(dot(n, normalize(vec3(.65, -.55, .3))), 0.0), ${optics.material.bounceExponent.toFixed(6)});
    vec3 p = surface;
    // Broad curved optical folds, gently shifting in light.
    float fold = p.y + .22 * sin(p.x * 3.0 + phase) + .13 * sin(p.z * 4.0 - phase);
    float ribbon = pow(.5 + .5 * sin(fold * 6.0 + phase + time * .18), 9.0);
    float fine = pow(.5 + .5 * sin(fold * 28.0 + p.z * 3.0 + time * .08), 32.0);
    float azimuth = atan(p.y, p.x);
    float lobes = .35 + .65 * pow(.5 + .5 * sin(azimuth * 5.0 + sin(p.z * 3.0) + phase), 2.0);
    float lit = rim * (.28 + key * 1.5 + bounce * 1.1) * mix(1.0, lobes, step(.5, phase));
    float veil = ${optics.material.foldIntensity.toFixed(6)} * ribbon * (.12 + .46 * key + .3 * bounce) * (1.0 - facing * ${optics.material.transmission.toFixed(6)});
    float light = lit + veil;
    float edge = pow(rim, 4.0) * (.18 + key * .38);
    vec3 color = mix(vec3(${optics.material.deepBlue.join(",")}), vec3(${optics.material.cyan.join(",")}), clamp(light * 1.9, 0.0, 1.0));
    color *= 1.0 + ${optics.material.emissive.toFixed(6)} * rim;
    color += vec3(${optics.material.rimWhite.toFixed(6)}) * rim * (1.0-step(.5,phase));
    color += vec3(.55,.7,.75) * rim * key + vec3(.1,.35,.45) * ribbon * key;
    color += vec3(.28, .34, .34) * pow(key, 3.0) * rim + vec3(.18,.55,.65) * edge;
    float alpha = (${optics.material.centerOpacity.toFixed(6)} + lit * ${optics.material.rimIntensity.toFixed(6)} + veil + fine * rim * .01) * density * (1.0 + clarity * .13);
    gl_FragColor = vec4(color, clamp(alpha * ${optics.material.thickness.toFixed(6)} / .06, 0.0, ${optics.material.maximumOpacity.toFixed(6)}));
  }
`;

export function InnerCore({ onWake, phase='idle' }: { onWake: () => void; phase?: InnerCorePhase }) {
  const host = useRef<HTMLButtonElement>(null);
  const phaseRef = useRef(phase);
  const audioEnergyRef = useRef(0);
  const wakeTimeRef = useRef(0);
  const [telemetry, setTelemetry] = useState<{ phase: string; audio: number; glow: number; clarity: number } | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const handleAudio = (event: Event) => {
      const detail = (event as CustomEvent<{ energy?: number }>).detail;
      audioEnergyRef.current = typeof detail?.energy === 'number' ? Math.max(0, Math.min(1, detail.energy)) : 0;
    };
    window.addEventListener(NORA_AUDIO_EVENT, handleAudio);
    return () => {
      window.removeEventListener(NORA_AUDIO_EVENT, handleAudio);
    };
  }, []);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const calibration = coreCalibrationEnabled(initialCalibrationSearch || window.location.search, process.env.NODE_ENV === "production");
    element.dataset.calibration = calibration ? "idle-t0-dpr1" : "off";
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    } catch {
      element.dataset.renderer = "unavailable";
      return;
    }
    element.dataset.renderer = "webgl";
    renderer.setPixelRatio(calibration ? optics.calibration.dpr : Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 0);
    Object.assign(renderer.domElement.style, { position: "absolute", left: `-${optics.geometry.canvasPadding}px`, top: "0", width: `calc(100% + ${optics.geometry.canvasPadding * 2}px)`, height: "100%", pointerEvents: "none" });
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(optics.geometry.fov, 1, .1, 30);
    camera.position.z = optics.geometry.cameraZ;
    const root = new THREE.Group(); root.position.set(optics.geometry.centerX, optics.geometry.centerY, 0); scene.add(root);
    const membraneMaterials: THREE.ShaderMaterial[] = [];
    const material = (density: number, phase: number) => {
      const result = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { time: { value: 0 }, clarity: { value: 0 }, density: { value: density }, phase: { value: phase } },
        vertexShader: membraneVertex, fragmentShader: membraneFragment,
      });
      membraneMaterials.push(result);
      return result;
    };
    const aura = new THREE.Mesh(new THREE.PlaneGeometry(3.4,3.4), new THREE.ShaderMaterial({
      transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
      vertexShader:`varying vec2 point;void main(){point=(uv-.5)*3.4;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec2 point;void main(){float distanceToRim=(length(point)-${optics.geometry.radius.toFixed(6)})/${optics.material.auraWidth.toFixed(6)};gl_FragColor=vec4(.02,.6,.95,exp(-distanceToRim*distanceToRim)*${optics.material.auraIntensity.toFixed(6)});}`,
    })); root.add(aura);
    // Continuous spherical skins; optical folds stay inside a symmetric silhouette.
    const skin = new THREE.Mesh(new THREE.SphereGeometry(optics.geometry.radius, 80, 64), material(optics.material.outerDensity, .3));
    skin.material.side = THREE.FrontSide; root.add(skin);
    const membranes = new THREE.Group(); root.add(membranes);
    for (const sheet of optics.geometry.shells) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(optics.geometry.radius * sheet.scale, 80, 64), material(sheet.density, sheet.phase));
      mesh.material.side = THREE.FrontSide;
      membranes.add(mesh);
    }
    const filaments = new THREE.Group(); root.add(filaments);
    const thread = new THREE.LineBasicMaterial({ color: optics.paths.color, transparent: true, opacity: optics.paths.opacity, linewidth: optics.paths.thickness, depthWrite: false });
    const highlight = new THREE.LineBasicMaterial({ color: optics.paths.highlightColor, transparent: true, opacity: optics.paths.highlightOpacity, depthWrite: false });
    const curve = (points: THREE.Vector3[], lineMaterial: THREE.Material = thread, group = filaments) => {
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), lineMaterial));
    };
    // Deterministic non-orthogonal structure with crossings at varying depths.
    const points: THREE.Vector3[] = [];
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let index = 0; index < optics.paths.nodes; index++) {
      const y = 1 - (index + .5) / optics.paths.nodes * 2;
      const radius = Math.sqrt(1 - y * y), angle = index * goldenAngle;
      points.push(new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius).multiplyScalar(optics.paths.radius * (.65 + .35 * ((index * 7 % 11) / 10))));
    }
    for (let index = 0; index < optics.paths.count; index++) {
      const start = points[index], end = points[(index + 3) % points.length];
      const middle = start.clone().add(end).multiplyScalar(.25);
      middle.z += Math.sin(index * 2.3) * .38; middle.y += Math.cos(index * 1.7) * .2;
      curve(new THREE.QuadraticBezierCurve3(start, middle, end).getPoints(64), index % 5 === 0 ? highlight : thread);
    }
    const nodeGeometry = new THREE.SphereGeometry(optics.paths.nodeRadius, 8, 6);
    const nodeMaterial = new THREE.MeshBasicMaterial({ color: optics.paths.nodeColor, transparent: true, opacity: optics.paths.nodeOpacity });
    points.forEach((point, index) => {
      const node = new THREE.Mesh(nodeGeometry, nodeMaterial);
      node.position.copy(point); node.scale.setScalar(index % 5 === 0 ? 1.6 : 1); filaments.add(node);
    });
    // User-requested optical framing: fixed decorative points, not execution telemetry.
    // The separate event-backed execution halo remains owned by OverviewRuntime.
    // Hide the rear arc where the spherical membrane occludes it. This is optical framing only.
    const orbitMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,
      uniforms:{opacity:{value:optics.orbits.opacity}},
      vertexShader:`varying vec3 worldPoint;void main(){worldPoint=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(worldPoint,1.);}`,
      fragmentShader:`varying vec3 worldPoint;uniform float opacity;void main(){if(worldPoint.z<0. && length(worldPoint.xy-vec2(${optics.geometry.centerX.toFixed(6)},${optics.geometry.centerY.toFixed(6)}))<${optics.geometry.radius.toFixed(6)})discard;gl_FragColor=vec4(vec3(${optics.orbits.color.join(",")}),opacity);}`
    });
    const opticalOrbits:THREE.Group[]=[];
    for(let index=0;index<optics.orbits.count;index++){
      const optical=new THREE.Group();optical.rotation.set(optics.orbits.tilts[index][0],optics.orbits.tilts[index][1],optics.orbits.tilts[index][2]);root.add(optical);opticalOrbits.push(optical);
      const arc=Array.from({length:129},(_,j)=>new THREE.Vector3(Math.cos(j/128*Math.PI*2)*optics.orbits.radius,Math.sin(j/128*Math.PI*2)*optics.orbits.minorRadius,0));
      curve(arc,orbitMaterial,optical);
      for(const at of Array.from({length:optics.orbits.nodesPerOrbit},(_,node)=>19+index*7+node*(57+index*2))){const point=new THREE.Mesh(nodeGeometry,nodeMaterial);point.position.copy(arc[at]);point.scale.setScalar(optics.orbits.nodeScale);optical.add(point);}
    }
    const nucleus = new THREE.Group(); root.add(nucleus);
    const glowMaterial = new THREE.ShaderMaterial({
      uniforms:{energy:{value:0}},
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 point;void main(){point=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 point;uniform float energy;void main(){float r=length(point-.5)*2.;float haze=exp(-r*r*${optics.nucleus.bloomFalloff}.)*${optics.nucleus.bloomIntensity.toFixed(6)};float halo=exp(-r*r*${optics.nucleus.haloFalloff}.)*${optics.nucleus.haloIntensity.toFixed(6)};float heart=exp(-r*r*${optics.nucleus.radiusFalloff}.);vec3 light=mix(vec3(.01,.48,.8),vec3(.92,1.,1.),clamp(heart*${optics.nucleus.whiteIntensity.toFixed(6)},0.,1.));gl_FragColor=vec4(light,(haze+halo+heart)*(1.+energy*.35));}`,
    });
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(optics.nucleus.planeSize, optics.nucleus.planeSize), glowMaterial); nucleus.add(halo);
    const baseMaterial = new THREE.LineBasicMaterial({color:optics.base.brightness,transparent:true,opacity:optics.base.opacity,depthWrite:false});
    const baseHalo = new THREE.Group(); root.add(baseHalo);
    for(const radius of optics.base.radii) {
      const ring=Array.from({length:129},(_,i)=>new THREE.Vector3(Math.cos(i/128*Math.PI*2)*radius,optics.base.y,Math.sin(i/128*Math.PI*2)*radius*optics.base.eccentricity));
      curve(ring,baseMaterial,baseHalo);
    }
    const reflection = new THREE.Mesh(new THREE.PlaneGeometry(2.5, optics.base.blur), new THREE.ShaderMaterial({
      transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
      vertexShader:`varying vec2 uvPoint;void main(){uvPoint=uv-.5;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec2 uvPoint;void main(){float glow=exp(-uvPoint.x*uvPoint.x*18.-uvPoint.y*uvPoint.y*32.);gl_FragColor=vec4(vec3(${optics.base.glowColor.join(",")}),glow*${optics.base.glowIntensity.toFixed(6)});}`,
    })); reflection.position.y=optics.base.y; root.add(reflection);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = new THREE.Vector2();
    const inverseRoot = new THREE.Quaternion();
    let hovering = false, time = optics.calibration.time as number, last = 0, frame = 0, visible = true;
    let calibratedFrameRendered = false;

    // Smooth physical signals (interpolated per frame without React renders)
    let attention = 0;
    let audioEnergy = 0;
    let thinkingEnergy = 0;
    let responseEnergy = 0;
    let executionEnergy = 0;
    let awaitingEnergy = 0;
    let successEnergy = 0;
    let degradedEnergy = 0;
    let pointerInfluence = 0;
    let lastTelemetryEmit = 0;

    const resize = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      calibratedFrameRendered = false;
      renderer.setSize(width + optics.geometry.canvasPadding * 2, height, false); camera.aspect = (width + optics.geometry.canvasPadding * 2) / height; camera.updateProjectionMatrix();
    }); resize.observe(element);
    const move = (event: PointerEvent) => {
      const box = element.getBoundingClientRect();
      pointer.set((event.clientX - box.left) / box.width - .5, (event.clientY - box.top) / box.height - .5);
    };
    const enter = () => { hovering = true; };
    const leave = () => { hovering = false; pointer.set(0, 0); };
    const click = () => {
      wakeTimeRef.current = performance.now();
    };
    const resetMotion = () => {
      if (!motion.matches) return;
      time = 0; root.rotation.set(0, 0, 0); root.scale.setScalar(1);
      membranes.rotation.set(0, 0, 0); filaments.rotation.set(0, 0, 0); nucleus.scale.setScalar(1);
      nucleus.position.set(0, 0, 0);
    };
    motion.addEventListener("change", resetMotion);
    element.addEventListener("pointermove", move); element.addEventListener("pointerenter", enter);
    element.addEventListener("pointerleave", leave); element.addEventListener("click", click);
    const observer = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; }); observer.observe(element);

    const animate = (now: number) => {
      frame = requestAnimationFrame(animate);
      if (!visible || document.hidden) { last = now; return; }
      if (calibration && calibratedFrameRendered) return;
      if (now - last < 16) return;
      const dt = Math.min((now - last) / 1000, .05); last = now;

      const phase=calibration ? "idle" : phaseRef.current;

      // Exponential damping rates calibrated for human perception
      const easeAttn = 1 - Math.exp(-dt * 4.5);
      const easeAudio = 1 - Math.exp(-dt * 14.0); // Ultra-responsive voice tracking
      const easeThink = 1 - Math.exp(-dt * 3.8);
      const easeResp = 1 - Math.exp(-dt * 4.2);
      const easeExec = 1 - Math.exp(-dt * 2.8);
      const easeAwait = 1 - Math.exp(-dt * 3.2);
      const easeSuccess = 1 - Math.exp(-dt * 5.2);
      const easeDegraded = 1 - Math.exp(-dt * 3.2);
      const easePointer = 1 - Math.exp(-dt * 4.2);

      attention += ((phase === 'attentive' || (hovering && !calibration) ? 1 : 0) - attention) * easeAttn;
      audioEnergy += ((phase === 'listening' ? audioEnergyRef.current : 0) - audioEnergy) * easeAudio;
      thinkingEnergy += ((phase === 'thinking' ? 1 : 0) - thinkingEnergy) * easeThink;
      responseEnergy += ((phase === 'responding' ? 1 : 0) - responseEnergy) * easeResp;
      executionEnergy += ((phase === 'executing' ? 1 : 0) - executionEnergy) * easeExec;
      awaitingEnergy += ((phase === 'awaiting' ? 1 : 0) - awaitingEnergy) * easeAwait;
      successEnergy += ((phase === 'success' ? 1 : 0) - successEnergy) * easeSuccess;
      degradedEnergy += ((phase === 'degraded' ? 1 : 0) - degradedEnergy) * easeDegraded;
      pointerInfluence += ((hovering && !calibration ? 1 : 0) - pointerInfluence) * easePointer;

      // Click / Wake 0-800ms impulse progression:
      // 0–150ms: distinct physical inward compression
      // 150–350ms: nucleus brightens brilliantly
      // 250–800ms: single outward energy propagation wave through shells
      let wakeCompression = 0;
      let wakeNucleus = 0;
      let wakeWave = 0;
      if (wakeTimeRef.current > 0) {
        const elapsed = (now - wakeTimeRef.current) / 1000;
        if (elapsed < 0.15) {
          wakeCompression = Math.sin((elapsed / 0.15) * (Math.PI / 2)) * 0.055;
        } else if (elapsed < 0.38) {
          const t = (elapsed - 0.15) / 0.23;
          wakeNucleus = Math.sin(t * Math.PI) * 0.75;
        } else if (elapsed < 0.85) {
          const t = (elapsed - 0.25) / 0.60;
          wakeWave = Math.sin(t * Math.PI) * 0.55;
          wakeNucleus = (1 - t) * 0.25;
        } else {
          wakeTimeRef.current = 0;
        }
      }

      if (!motion.matches && !calibration) {
        // Organic living time progression: steady idle life + active acceleration
        const speedBoost = thinkingEnergy * 1.5 + audioEnergy * 0.6 + executionEnergy * 0.35 + responseEnergy * 0.25 - awaitingEnergy * 0.25;
        time += dt * (1.2 + speedBoost);
        membranes.rotation.y = time * .035;
        membranes.rotation.z = Math.sin(time * .12) * .05;
        filaments.rotation.y = -time * .028;
        opticalOrbits.forEach((orbit, index) => {
          orbit.rotation.z = optics.orbits.tilts[index][2] + time * .006;
        });

        // Pointer attention: noticeable nucleus shift towards cursor + subtle root tilt
        root.rotation.y += (pointer.x * .08 * pointerInfluence - root.rotation.y) * easePointer;
        root.rotation.x += (pointer.y * .05 * pointerInfluence - root.rotation.x) * easePointer;
        nucleus.position.x += (pointer.x * .12 * pointerInfluence - nucleus.position.x) * easePointer;
        nucleus.position.y += (-pointer.y * .09 * pointerInfluence - nucleus.position.y) * easePointer;

        // Organic breathing scale: clearly perceptible breathing every ~4.8s
        const idlePulse = Math.sin(time * 1.3) * 0.035;
        const awaitPulse = awaitingEnergy * Math.sin(time * 0.8) * 0.03;
        const voicePulse = audioEnergy * 0.16; // 16% breathing with voice
        const thinkPulse = thinkingEnergy * 0.08;
        const execPulse = executionEnergy * 0.04;
        nucleus.scale.setScalar(1 + idlePulse + awaitPulse + voicePulse + thinkPulse + execPulse + wakeNucleus * 0.12);
        root.scale.setScalar(1 - wakeCompression + wakeWave * 0.025);
      } else {
        root.rotation.set(0, 0, 0);
        nucleus.position.set(0, 0, 0);
        nucleus.scale.setScalar(1);
        root.scale.setScalar(1);
      }

      // Glow uniform: composite of physical energies with high dynamic range
      const totalEnergy = attention * .35 + audioEnergy * 1.25 + thinkingEnergy * 1.25 + responseEnergy * 0.75 + executionEnergy * 0.50 + awaitingEnergy * 0.35 + successEnergy * 0.90 + wakeNucleus * 0.85 - degradedEnergy * 0.35;
      glowMaterial.uniforms.energy.value = totalEnergy;

      // Internal filaments brightness
      thread.opacity = optics.paths.opacity + attention * .06 + audioEnergy * .35 + thinkingEnergy * .35 + executionEnergy * .15 + successEnergy * 0.25;
      orbitMaterial.uniforms.opacity.value = optics.orbits.opacity + attention * .04 + audioEnergy * .12 + thinkingEnergy * .12;

      // Base halo & ground reflection response
      baseHalo.scale.setScalar(1 + (thinkingEnergy * 0.06 + audioEnergy * 0.08 + successEnergy * 0.09 + wakeWave * 0.06));

      // Membrane clarity & wave propagation
      const baseClarity = pointerInfluence * .55 + attention * .25 + audioEnergy * .55 + responseEnergy * 0.85 + successEnergy * 0.90 + wakeWave * 0.65 - degradedEnergy * 0.25;
      membraneMaterials.forEach(shader => {
        shader.uniforms.time.value = time;
        shader.uniforms.clarity.value = baseClarity;
      });

      halo.quaternion.copy(camera.quaternion).premultiply(inverseRoot.copy(root.quaternion).invert());
      renderer.render(scene, camera);
      calibratedFrameRendered = calibration;

      // Publish lightweight telemetry in development mode for live debugging
      if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
        (window as unknown as { __CORE_TELEMETRY?: object }).__CORE_TELEMETRY = {
          phase,
          audioEnergy: Math.round(audioEnergy * 100) / 100,
          totalEnergy: Math.round(totalEnergy * 100) / 100,
          clarity: Math.round(baseClarity * 100) / 100,
          attention: Math.round(attention * 100) / 100,
          thinking: Math.round(thinkingEnergy * 100) / 100,
          response: Math.round(responseEnergy * 100) / 100,
          hovering,
        };
        if (now - lastTelemetryEmit > 250 && window.location.search.includes('telemetry=1')) {
          lastTelemetryEmit = now;
          setTelemetry({ phase, audio: Math.round(audioEnergy * 100) / 100, glow: Math.round(totalEnergy * 100) / 100, clarity: Math.round(baseClarity * 100) / 100 });
        }
      }
    }; frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame); resize.disconnect(); observer.disconnect(); motion.removeEventListener("change", resetMotion);
      element.removeEventListener("pointermove", move); element.removeEventListener("pointerenter", enter);
      element.removeEventListener("pointerleave", leave); element.removeEventListener("click", click);
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      scene.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          geometries.add(object.geometry);
          (Array.isArray(object.material) ? object.material : [object.material]).forEach(item => materials.add(item));
        }
      });
      materials.add(orbitMaterial); materials.add(baseMaterial);
      geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose());
      renderer.dispose(); renderer.domElement.remove();
    };
  }, []);

  return (
    <>
      <button ref={host} className={styles.core} data-phase={phase} aria-label="Open NORA from the Inner Core" onClick={onWake}>
        <span className={styles.fallback} aria-hidden="true" />
      </button>
      {telemetry && (
        <aside className={styles.devTelemetry} aria-label="CORE Live Telemetry">
          <strong>CORE LIVE TELEMETRY</strong>
          <span>Phase: <em>{telemetry.phase}</em></span>
          <span>Audio Energy: <em>{telemetry.audio}</em></span>
          <span>Nucleus Glow: <em>{telemetry.glow}</em></span>
          <span>Clarity: <em>{telemetry.clarity}</em></span>
        </aside>
      )}
    </>
  );
}
