"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";

export type HubStatus = "unassigned" | "pending" | "active" | "done" | "error";

export interface SphereHub {
  id: string;
  status: HubStatus;
}

interface CoreSphere3DProps {
  hubs: SphereHub[];
  selectedId: string | null;
  onSelect?: (id: string) => void;
}

const HUB_COLORS: Record<HubStatus, number> = {
  unassigned: 0x334155,
  pending: 0x22d3ee,
  active: 0x00ff88,
  done: 0x10b981,
  error: 0xef4444,
};

/** Even spread of N points over a sphere (golden-angle spiral). */
function fibonacciPoint(i: number, n: number, radius: number): THREE.Vector3 {
  const y = 1 - (i / Math.max(n - 1, 1)) * 2;
  const r = Math.sqrt(1 - y * y);
  const theta = i * 2.399963229728653;
  return new THREE.Vector3(Math.cos(theta) * r * radius, y * radius * 0.92, Math.sin(theta) * r * radius);
}

function glowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.65)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(canvas);
}

/**
 * The CORE hub: one node per GrowForge department around a glowing core.
 * Every visual signal is driven by real step status passed in as props —
 * nodes light by status, and a pulse only travels a link while that
 * department's step is genuinely running. With nothing running the sphere is
 * calm; it never animates activity that isn't happening.
 */
export function CoreSphere3D({ hubs, selectedId, onSelect }: CoreSphere3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef({ hubs, selectedId, onSelect });

  useEffect(() => {
    liveRef.current = { hubs, selectedId, onSelect };
  }, [hubs, selectedId, onSelect]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 300;
    const height = container.clientHeight || 340;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.z = 5.4;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    const outerGeo = new THREE.IcosahedronGeometry(1.8, 2);
    const outerMat = new THREE.MeshBasicMaterial({ color: 0x00f5ff, wireframe: true, transparent: true, opacity: 0.26 });
    const outer = new THREE.Mesh(outerGeo, outerMat);
    group.add(outer);

    const innerGeo = new THREE.IcosahedronGeometry(1.62, 1);
    const innerMat = new THREE.MeshBasicMaterial({ color: 0x10b981, wireframe: true, transparent: true, opacity: 0.13 });
    group.add(new THREE.Mesh(innerGeo, innerMat));

    const coreGeo = new THREE.SphereGeometry(0.62, 20, 20);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, wireframe: true, transparent: true, opacity: 0.2 });
    const core = new THREE.Mesh(coreGeo, coreMat);
    group.add(core);

    const glow = glowTexture();
    const coreGlowMat = new THREE.SpriteMaterial({ map: glow, color: 0x22d3ee, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    const coreGlow = new THREE.Sprite(coreGlowMat);
    coreGlow.scale.set(2.1, 2.1, 1);
    group.add(coreGlow);

    // Ambient mesh vertices — structural decoration only, not data.
    const vertexPositions = outerGeo.attributes.position;
    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(vertexPositions.array), 3));
    const dotMat = new THREE.PointsMaterial({ size: 0.11, map: glow, color: 0x22d3ee, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    group.add(new THREE.Points(dotGeo, dotMat));

    // One hub + link + travelling pulse per department.
    const count = liveRef.current.hubs.length;
    const hubObjs = liveRef.current.hubs.map((h, i) => {
      const pos = fibonacciPoint(i, count, 1.8);

      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: HUB_COLORS[h.status], transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      sprite.position.copy(pos);
      group.add(sprite);

      const hit = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 10), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      hit.position.copy(pos);
      hit.userData.hubId = h.id;
      group.add(hit);

      const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), pos.clone()]);
      const lineMat = new THREE.LineBasicMaterial({ color: HUB_COLORS[h.status], transparent: true, opacity: 0.2 });
      const line = new THREE.Line(lineGeo, lineMat);
      group.add(line);

      const pulse = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      pulse.scale.set(0.3, 0.3, 1);
      group.add(pulse);

      return { id: h.id, pos, sprite, hit, line, lineMat, lineGeo, pulse };
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let dragging = false;
    let moved = 0;
    let lastX = 0;
    let lastY = 0;

    const onDown = (e: PointerEvent) => {
      dragging = true;
      moved = 0;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      group.rotation.y += dx * 0.006;
      group.rotation.x += dy * 0.006;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      const wasClick = dragging && moved < 5;
      dragging = false;
      if (!wasClick) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(hubObjs.map((h) => h.hit), false)[0];
      const id = hit?.object.userData.hubId as string | undefined;
      if (id) liveRef.current.onSelect?.(id);
    };
    container.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    const clock = new THREE.Clock();
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      const { hubs: liveHubs, selectedId: sel } = liveRef.current;
      const anyActive = liveHubs.some((h) => h.status === "active");

      if (!dragging) {
        group.rotation.y += 0.0032;
        group.rotation.x = Math.sin(t * 0.3) * 0.14;
      }
      core.rotation.y -= 0.006;
      const breath = 1 + Math.sin(t * (anyActive ? 3 : 1.4)) * (anyActive ? 0.03 : 0.012);
      outer.scale.setScalar(breath);
      coreGlowMat.opacity = anyActive ? 0.55 + Math.sin(t * 4) * 0.18 : 0.42;

      for (const obj of hubObjs) {
        const status = liveHubs.find((h) => h.id === obj.id)?.status ?? "unassigned";
        const color = HUB_COLORS[status];
        const selected = sel === obj.id;
        (obj.sprite.material as THREE.SpriteMaterial).color.setHex(color);
        obj.lineMat.color.setHex(color);

        const base = status === "unassigned" ? 0.22 : status === "pending" ? 0.34 : 0.46;
        const beat = status === "active" ? 1 + Math.sin(t * 5 + obj.pos.x) * 0.28 : 1;
        obj.sprite.scale.setScalar(base * beat * (selected ? 1.55 : 1));
        (obj.sprite.material as THREE.SpriteMaterial).opacity = status === "unassigned" ? 0.45 : 0.95;
        obj.lineMat.opacity = status === "unassigned" ? 0.08 : status === "pending" ? 0.22 : status === "active" ? 0.55 : 0.34;

        const pm = obj.pulse.material as THREE.SpriteMaterial;
        if (status === "active") {
          const p = (t * 0.7 + obj.pos.y) % 1;
          obj.pulse.position.copy(obj.pos).multiplyScalar(p);
          pm.opacity = 0.9 * Math.sin(p * Math.PI);
          pm.color.setHex(0xb6ffe0);
        } else {
          pm.opacity = 0;
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      container.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      renderer.dispose();
      [outerGeo, innerGeo, coreGeo, dotGeo].forEach((g) => g.dispose());
      [outerMat, innerMat, coreMat, coreGlowMat, dotMat].forEach((m) => m.dispose());
      hubObjs.forEach((o) => {
        (o.sprite.material as THREE.Material).dispose();
        (o.pulse.material as THREE.Material).dispose();
        (o.hit.material as THREE.Material).dispose();
        o.hit.geometry.dispose();
        o.lineGeo.dispose();
        o.lineMat.dispose();
      });
      glow.dispose();
    };
    // Scene is built once for a fixed department set; live status flows in via liveRef.
  }, []);

  return (
    <div className="relative h-[460px] w-full select-none">
      <div ref={containerRef} className="h-full w-full cursor-grab active:cursor-grabbing" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-80 w-80 rounded-full bg-gradient-to-tr from-emerald-500/15 via-cyan-500/20 to-blue-600/10 blur-3xl" />
      </div>
    </div>
  );
}
