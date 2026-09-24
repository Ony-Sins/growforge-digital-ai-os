"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GraphNode, GraphLink, SpatialGraphData } from "@/lib/spatial/obsidianReader";
import {
  ZOOM_TIERS,
  type ZoomTierName,
  layoutSpatialGlobe,
  createCoreOrbitals,
  planGrowth,
  growthPosition,
  getGlowTexture,
  getStarDotTexture,
  type GrowthPlan,
} from "./spatialGeometry";
import { SpatialHud } from "./SpatialHud";
import { NoteReaderModal } from "./NoteReaderModal";
import { BusinessHubModal } from "./BusinessHubModal";
import { SpatialChatDrawer } from "./SpatialChatDrawer";

interface SpatialTelemetryData {
  activeJobCount: number;
  totalJobCount: number;
  recentJobs: { id: string; title: string; status: string; currentStep: string; percent: number }[];
  mcp: {
    totalConnected: number;
    servers: { id: string; name: string; catalogId?: string; transport: string; toolCount: number; tools: { name: string; description: string }[] }[];
    connectors: {
      slack: { connected: boolean; name: string };
      notion: { connected: boolean; name: string };
      hubspot: { connected: boolean; name: string };
    };
  };
  models: { totalConfigured: number; active: { id: string; name: string; isPrimary: boolean; latencyMs: number | null }[] };
  telemetry: { executionState: string };
}

const DIVE_MS = 1150;
const DIVE_END_Z = -70;

interface SpatialCanvasProps {
  className?: string;
  initialTier?: ZoomTierName;
}

export function SpatialCanvas({ className = "", initialTier = "brain" }: SpatialCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [graphData, setGraphData] = useState<SpatialGraphData | null>(null);
  const [telemetryData, setTelemetryData] = useState<SpatialTelemetryData | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());
  const activeCategoriesRef = useRef<Set<string>>(activeCategories);
  useEffect(() => {
    activeCategoriesRef.current = activeCategories;
  }, [activeCategories]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [isBusinessHubOpen, setIsBusinessHubOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInitialPrompt, setChatInitialPrompt] = useState<string | undefined>(undefined);
  const [currentTier, setCurrentTier] = useState<ZoomTierName>(initialTier);
  const [isDiving, setIsDiving] = useState(false);
  const diveRef = useRef<{ start: number; startZ: number; navigated: boolean } | null>(null);
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);
  const [isCinema, setIsCinema] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayTime, setReplayTime] = useState(0);

  // References for Three.js objects
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const targetCameraZRef = useRef<number>(ZOOM_TIERS[initialTier.toUpperCase() as keyof typeof ZOOM_TIERS]?.z ?? 460);
  const growthPlanRef = useRef<GrowthPlan | null>(null);
  const hoveredNodeIdRef = useRef<string | null>(null);
  const isCoreHoveredRef = useRef<boolean>(false);
  // Ambient rotation pauses on click/drag/zoom and auto-resumes after this many
  // ms of no interaction (user asked for "5-10 secs" — picked the midpoint).
  const lastInteractionRef = useRef<number>(0);

  // Mesh & line maps for fast interaction updates
  const nodeMeshMap = useRef<
    Map<
      string,
      {
        group: THREE.Group;
        node: GraphNode;
        outerMaterial: THREE.MeshStandardMaterial;
        coreMaterial: THREE.MeshStandardMaterial;
        haloSprite: THREE.Sprite;
        // Eased 0..1 cursor-proximity glow — boxed in an object so it can be
        // mutated in place every frame without replacing the Map entry.
        proximity: { v: number };
        // Eased connection-highlight multiplier (1 = neutral, >1 = boosted
        // because it's connected to the exactly-hovered node, <1 = dimmed
        // because it isn't). Also boxed so it can ease smoothly every frame
        // instead of snapping the instant hover state changes — this is what
        // used to be set directly (with zero easing) inside the pointermove
        // handler; unifying it here fixed the "instant on/off" report.
        connectionGlow: { v: number };
      }
    >
  >(new Map());
  const linkObjectMap = useRef<
    Map<
      string,
      {
        line: THREE.Line;
        link: GraphLink;
        material: THREE.LineBasicMaterial;
        midpoint: THREE.Vector3;
        proximity: { v: number };
        connectionGlow: { v: number };
      }
    >
  >(new Map());
  // Last known cursor position in container-relative pixels, used every frame
  // (not just on pointermove) since node screen positions keep changing from
  // ambient rotation/zoom even when the cursor itself is still. Starts far
  // off-screen so nothing glows before the user has actually moved the mouse.
  const cursorPixelRef = useRef<{ x: number; y: number }>({ x: -99999, y: -99999 });
  // Which node IDs are directly connected to the currently-hovered node —
  // recomputed only when the hovered node actually changes (in pointermove),
  // read every frame in the animate loop. Kept separate from hoveredNodeIdRef
  // so pointermove never has to touch materials directly.
  const connectedTargetsRef = useRef<Set<string>>(new Set());

  // 1. Fetch Real Data (Obsidian Graph & Live Telemetry)
  const refreshData = useCallback(async () => {
    try {
      const [graphRes, telemRes] = await Promise.all([
        fetch("/api/spatial/graph"),
        fetch("/api/spatial/telemetry"),
      ]);

      if (graphRes.ok) {
        const json = await graphRes.json();
        if (json.ok && json.data) {
          const data: SpatialGraphData = json.data;
          layoutSpatialGlobe(data.nodes, data.categories);
          growthPlanRef.current = planGrowth(data.nodes, data.links);
          setGraphData(data);
          setActiveCategories(new Set(data.categories.map((c) => c.id)));
        }
      }

      if (telemRes.ok) {
        const telemJson = await telemRes.json();
        if (telemJson.ok && telemJson.data) {
          setTelemetryData(telemJson.data);
        }
      }
    } catch (err) {
      console.error("[SpatialCanvas] Failed to load graph/telemetry data:", err);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const initLoad = async () => {
      if (isMounted) await refreshData();
    };
    void initLoad();
    const interval = setInterval(() => {
      if (isMounted) void refreshData();
    }, 12000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [refreshData]);

  // Dashboard → CORE: the camera accelerates through the core (nodes streak
  // past, FOV widens, exposure blows out to white) and CORE emerges from the
  // light on the other side. Reduced-motion users get a plain navigation.
  const handleEnterCore = useCallback(() => {
    if (diveRef.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !cameraRef.current) {
      routerRef.current.push("/core");
      return;
    }
    diveRef.current = { start: performance.now(), startZ: cameraRef.current.position.z, navigated: false };
    setIsDiving(true);
  }, []);

  // Fast-travel zoom navigation
  const handleSelectTier = (tier: ZoomTierName) => {
    setCurrentTier(tier);
    const targetZ = ZOOM_TIERS[tier.toUpperCase() as keyof typeof ZOOM_TIERS]?.z ?? 460;
    targetCameraZRef.current = targetZ;
  };

  // 2. Initialize Three.js WebGL Scene
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070b14);
    scene.fog = new THREE.FogExp2(0x070b14, 0.00085);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(48, width / height, 1, 3500);
    camera.position.set(0, 15, targetCameraZRef.current);
    cameraRef.current = camera;

    // WebGL Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.replaceChildren(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 60;
    controls.maxDistance = 1400;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.9;
    controlsRef.current = controls;

    // Any manual drag/zoom/pan should "win" over the fast-travel tier target —
    // otherwise the per-frame correction below fights the user's own scroll-zoom
    // every frame, which is what made zoom feel capped/stuck. Must use
    // "start"/"end" (fired only at real user-gesture boundaries), NOT "change"
    // — "change" also fires every frame during the fast-travel lerp itself
    // (since that lerp moves the camera and controls.update() notices), which
    // would sync the target back to the lerp's current mid-flight position and
    // cancel the animation after a single frame. That was a real bug caught
    // by re-testing the nav buttons after adding this fix, not assumed safe.
    const onInteractionStart = () => {
      lastInteractionRef.current = performance.now();
    };
    const onInteractionEnd = () => {
      targetCameraZRef.current = camera.position.z;
      lastInteractionRef.current = performance.now();
    };
    controls.addEventListener("start", onInteractionStart);
    controls.addEventListener("end", onInteractionEnd);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x38bdf8, 1.2);
    dirLight1.position.set(400, 500, 300);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xf472b6, 0.8);
    dirLight2.position.set(-400, -300, -200);
    scene.add(dirLight2);

    // AI Core & Orbitals
    const orbitals = createCoreOrbitals(scene);

    // Distant Ambient Starfield — soft glow-textured points, not hard flat
    // dots, so the background reads as a light-filled nebula rather than a
    // sparse scatter of solid squares.
    const starGeo = new THREE.BufferGeometry();
    const starCount = 4000;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      starPos[i] = (Math.random() - 0.5) * 2400;
      starPos[i + 1] = (Math.random() - 0.5) * 2400;
      starPos[i + 2] = (Math.random() - 0.5) * 2400;
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xbcd6ff,
      size: 5.5,
      map: getStarDotTexture(),
      transparent: true,
      opacity: 0.55,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);

    // A sparser pass of warm gold specks for the same rim-light flavor the
    // reference has — GrowForge's "Earned Gold" accent, not decorative-only.
    const goldGeo = new THREE.BufferGeometry();
    const goldCount = 220;
    const goldPos = new Float32Array(goldCount * 3);
    for (let i = 0; i < goldCount * 3; i += 3) {
      goldPos[i] = (Math.random() - 0.5) * 1800;
      goldPos[i + 1] = (Math.random() - 0.5) * 1800;
      goldPos[i + 2] = (Math.random() - 0.5) * 1800;
    }
    goldGeo.setAttribute("position", new THREE.BufferAttribute(goldPos, 3));
    const goldMat = new THREE.PointsMaterial({
      color: 0xffc432,
      size: 6,
      map: getStarDotTexture(),
      transparent: true,
      opacity: 0.35,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    scene.add(new THREE.Points(goldGeo, goldMat));

    // Resize Handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    // Animation Loop
    let animationFrameId: number;
    const clock = new THREE.Clock();
    const ROTATION_RESUME_DELAY_MS = 7000;
    // Start already "idle" so ambient rotation begins immediately on load,
    // rather than waiting out the resume delay on first mount.
    lastInteractionRef.current = performance.now() - ROTATION_RESUME_DELAY_MS - 1000;

    // Cursor-proximity glow: "the closer the cursor gets to a node/line/the
    // core, the more it glows" — computed fresh every frame (not just on
    // pointermove) since screen positions keep moving from ambient rotation
    // and zoom even when the cursor itself is still.
    const CURSOR_GLOW_RADIUS_PX = 220;
    const scratchVec = new THREE.Vector3();
    const ZERO_VEC = new THREE.Vector3(0, 0, 0);
    const projectToPixels = (worldPos: THREE.Vector3): { x: number; y: number } | null => {
      scratchVec.copy(worldPos).project(camera);
      if (scratchVec.z > 1) return null; // behind the camera
      return {
        x: (scratchVec.x * 0.5 + 0.5) * container.clientWidth,
        y: (-scratchVec.y * 0.5 + 0.5) * container.clientHeight,
      };
    };
    const proximityTargetFor = (worldPos: THREE.Vector3): number => {
      const px = projectToPixels(worldPos);
      if (!px) return 0;
      const dx = px.x - cursorPixelRef.current.x;
      const dy = px.y - cursorPixelRef.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      return THREE.MathUtils.clamp(1 - dist / CURSOR_GLOW_RADIUS_PX, 0, 1);
    };

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      const dive = diveRef.current;
      if (dive) {
        // Accelerating (cubic) run straight through the core, with FOV warp,
        // a slight roll and exposure blow-out. OrbitControls is bypassed —
        // it would clamp the camera back out to its min distance.
        const t = Math.min((performance.now() - dive.start) / DIVE_MS, 1);
        const e = t * t * t;
        controls.enabled = false;
        camera.position.z = dive.startZ + (DIVE_END_Z - dive.startZ) * e;
        camera.position.x *= 0.92;
        camera.position.y *= 0.92;
        camera.rotation.z = e * 0.6;
        camera.fov = 48 + 72 * e;
        camera.updateProjectionMatrix();
        renderer.toneMappingExposure = 1.15 + 3.4 * e * e;
        if (t >= 1 && !dive.navigated) {
          dive.navigated = true;
          routerRef.current.push("/core?warp=1");
        }
      } else {
        // Smooth camera interpolation for fast-travel zoom only — once the user
        // manually drags/zooms, syncTargetToCamera() keeps this a no-op so it
        // never fights their input (see the OrbitControls "change" listener above).
        if (Math.abs(camera.position.z - targetCameraZRef.current) > 1.5) {
          camera.position.z += (targetCameraZRef.current - camera.position.z) * 0.08;
        }

        // controls.update() MUST run before any .project(camera) calls below —
        // it reconciles OrbitControls' internal state with the camera position
        // we may have just mutated above. Projecting before this reconciliation
        // used a one-frame-stale transform during active zoom, which is what
        // caused the core glow to visibly flicker/dim mid-zoom (reported live).
        controls.update();
      }

      // Update current zoom tier based on real camera distance
      const z = camera.position.length();
      if (z > 700) setCurrentTier("home");
      else if (z <= 700 && z > 300) setCurrentTier("brain");
      else if (z <= 300) setCurrentTier("dashboard");

      // Continuous, distance-driven progressive reveal of nodes & links
      const depthProgress = THREE.MathUtils.clamp((880 - z) / 380, 0.12, 1.0);
      const somethingHovered = !!hoveredNodeIdRef.current;

      // Runs unconditionally every frame now (previously gated behind
      // `!hoveredNodeIdRef.current`, which meant this smooth per-frame system
      // simply stopped running the instant a node was precisely hovered,
      // silently handing off to a second, instant-snap system that used to
      // live in the pointermove handler — that handoff is exactly what read
      // as "instant on/off" on nodes/links even though the core, which never
      // had that second system, faded correctly. Now there's only one path.
      nodeMeshMap.current.forEach((item, id) => {
        const isCategoryActive = activeCategoriesRef.current.has(item.node.source);
        if (!isCategoryActive) {
          item.outerMaterial.opacity = 0.04;
          item.outerMaterial.emissiveIntensity = 0.04;
          item.coreMaterial.emissiveIntensity = 0.1;
          item.haloSprite.material.opacity = 0.03;
          return;
        }

        const distToNode = camera.position.distanceTo(item.group.position);
        const proximityFactor = THREE.MathUtils.clamp(1.15 - Math.abs(distToNode - 320) / 450, 0.35, 1.0);

        // Cursor-proximity glow — eased toward its target here (single
        // smoothing layer) so it ramps up gradually as the cursor nears,
        // instead of snapping the moment it's close enough.
        item.proximity.v += (proximityTargetFor(item.group.position) - item.proximity.v) * 0.05;
        const cursorBoost = 1 + item.proximity.v * 0.7;

        // Connection-highlight (Obsidian-style: hovering an exact node
        // highlights its direct connections, dims the rest) — same eased
        // treatment as everything else now, not a snap.
        const connectionTarget = somethingHovered ? (connectedTargetsRef.current.has(id) ? 1.4 : 0.12) : 1.0;
        item.connectionGlow.v += (connectionTarget - item.connectionGlow.v) * 0.09;

        const combinedBoost = cursorBoost * item.connectionGlow.v;
        item.outerMaterial.opacity = Math.min(1, 0.6 * depthProgress * proximityFactor * combinedBoost);
        item.outerMaterial.emissiveIntensity = 0.55 * depthProgress * proximityFactor * combinedBoost;
        item.coreMaterial.emissiveIntensity = 1.8 * depthProgress * (1 + item.proximity.v * 0.9) * item.connectionGlow.v;
        item.haloSprite.material.opacity = Math.min(1, 0.7 * depthProgress * (1 + item.proximity.v * 0.8) * item.connectionGlow.v);
      });

      linkObjectMap.current.forEach((item) => {
        const linkDepth = THREE.MathUtils.clamp((800 - z) / 350, 0.02, 1.0);
        item.proximity.v += (proximityTargetFor(item.midpoint) - item.proximity.v) * 0.05;

        const sId = typeof item.link.source === "object" ? (item.link.source as { id: string }).id : item.link.source;
        const tId = typeof item.link.target === "object" ? (item.link.target as { id: string }).id : item.link.target;
        const isDirect = somethingHovered && ((sId === hoveredNodeIdRef.current && connectedTargetsRef.current.has(tId)) || (tId === hoveredNodeIdRef.current && connectedTargetsRef.current.has(sId)));
        const connectionTarget = somethingHovered ? (isDirect ? 1.6 : 0.1) : 1.0;
        item.connectionGlow.v += (connectionTarget - item.connectionGlow.v) * 0.09;
        item.material.color.setHex(isDirect ? 0x00ffff : 0x38bdf8);

        item.material.opacity = Math.min(1, 0.22 * linkDepth * (1 + item.proximity.v * 1.6) * item.connectionGlow.v);
      });

      // Ambient self-rotation: paused by any click/drag/zoom (see
      // syncTargetToCamera and handleClick), auto-resumes once the user has
      // left it alone for ROTATION_RESUME_DELAY_MS.
      const idleMs = performance.now() - lastInteractionRef.current;
      if (idleMs > ROTATION_RESUME_DELAY_MS) {
        scene.rotation.y += 0.00045;
      }

      // Core glow reacts to real cursor-to-core screen distance, not a
      // hover boolean — the raw (unsmoothed) target is passed straight to
      // orbitals.update(), which does the easing internally (single
      // smoothing layer, see its own comment for why).
      const coreProximityTarget = proximityTargetFor(ZERO_VEC);
      orbitals.update(elapsedTime, somethingHovered, camera.position.z, coreProximityTarget);
      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      controls.removeEventListener("start", onInteractionStart);
      controls.removeEventListener("end", onInteractionEnd);
      orbitals.dispose();
      renderer.dispose();
    };
  }, []);

  // 3. Build & Update 3D Graph Nodes and Links when graphData changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !graphData) return;

    // Create a group for graph objects
    let graphGroup = scene.getObjectByName("SPATIAL_GRAPH_GROUP") as THREE.Group;
    if (graphGroup) {
      scene.remove(graphGroup);
    }
    graphGroup = new THREE.Group();
    graphGroup.name = "SPATIAL_GRAPH_GROUP";
    scene.add(graphGroup);

    nodeMeshMap.current.clear();
    linkObjectMap.current.clear();

    const outerGeo = new THREE.SphereGeometry(1, 16, 12);
    const coreGeo = new THREE.SphereGeometry(1, 12, 10);

    // Build Nodes — two-layer soma (translucent colored shell + hot-white
    // emissive inner core + additive halo sprite), same technique as the
    // anatomical Brain's per-node glow. A single flat MeshStandardMaterial
    // sphere reads as a cartoon dot; this reads as a small glowing light.
    graphData.nodes.forEach((node) => {
      const radius = Math.max(3.5, Math.min(8.5, 3.5 + (node.degree || 0) * 0.85));
      const colorHex = parseInt(node.color.replace("#", "0x"), 16);

      const group = new THREE.Group();
      group.position.set(node.x ?? 0, node.y ?? 0, node.z ?? 0);

      const outerMat = new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: 0.55,
        roughness: 0.3,
        metalness: 0.1,
        transparent: true,
        opacity: 0.6,
      });
      const outerMesh = new THREE.Mesh(outerGeo, outerMat);
      outerMesh.scale.setScalar(radius);
      outerMesh.userData = { nodeId: node.id, node };
      group.add(outerMesh);

      const coreMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: colorHex,
        emissiveIntensity: 1.8,
        roughness: 0.15,
        metalness: 0.1,
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.scale.setScalar(radius * 0.46);
      coreMesh.userData = { nodeId: node.id, node };
      group.add(coreMesh);

      const haloSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: getGlowTexture(node.color),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          opacity: 0.7,
        })
      );
      haloSprite.scale.setScalar(radius * 5.5);
      haloSprite.raycast = () => {}; // don't let the soft halo steal hover/click priority
      group.add(haloSprite);

      graphGroup.add(group);

      nodeMeshMap.current.set(node.id, {
        group,
        node,
        outerMaterial: outerMat,
        coreMaterial: coreMat,
        haloSprite,
        proximity: { v: 0 },
        connectionGlow: { v: 1 },
      });
    });

    // Build Links
    graphData.links.forEach((link) => {
      const srcNode = graphData.nodes.find((n) => n.id === (typeof link.source === "object" ? (link.source as { id: string }).id : link.source));
      const tgtNode = graphData.nodes.find((n) => n.id === (typeof link.target === "object" ? (link.target as { id: string }).id : link.target));
      if (!srcNode || !tgtNode) return;

      const p1 = new THREE.Vector3(srcNode.x ?? 0, srcNode.y ?? 0, srcNode.z ?? 0);
      const p2 = new THREE.Vector3(tgtNode.x ?? 0, tgtNode.y ?? 0, tgtNode.z ?? 0);

      const lineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      });

      const line = new THREE.Line(lineGeo, lineMat);
      graphGroup.add(line);

      const key = `${srcNode.id}->${tgtNode.id}`;
      linkObjectMap.current.set(key, {
        line,
        link,
        material: lineMat,
        midpoint: new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5),
        proximity: { v: 0 },
        connectionGlow: { v: 1 },
      });
    });
  }, [graphData]);

  // 4. Raycasting for Node Hover, AI Core Hover, and Click Interactions
  useEffect(() => {
    const container = containerRef.current;
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    if (!container || !camera || !scene) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      // Pixel-space cursor position, read every frame in the animate loop for
      // continuous proximity-glow — separate from the NDC `mouse` above,
      // which is only used here for one-shot raycasts on this same event.
      cursorPixelRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      // Check for Core Orb hit first
      const coreHit = intersects.find((i) => i.object.userData?.isCoreOrb);
      if (coreHit) {
        isCoreHoveredRef.current = true;
        container.style.cursor = "pointer";
      } else {
        isCoreHoveredRef.current = false;
      }

      // Check for Graph Node hit. This handler only ever updates state refs
      // now — never touches materials directly. Every material update (for
      // both the general cursor-proximity glow AND this exact-hover
      // connection-highlight) happens in ONE place, the animate loop, so
      // both effects ease smoothly through the same per-frame mechanism
      // instead of this one snapping instantly and fighting the other.
      const nodeHit = intersects.find((i) => i.object.userData?.nodeId);
      if (nodeHit) {
        const nodeId = nodeHit.object.userData.nodeId as string;
        if (hoveredNodeIdRef.current !== nodeId) {
          hoveredNodeIdRef.current = nodeId;
          container.style.cursor = "pointer";

          const connectedTargets = new Set<string>([nodeId]);
          graphData?.links.forEach((l) => {
            const sId = typeof l.source === "object" ? (l.source as { id: string }).id : l.source;
            const tId = typeof l.target === "object" ? (l.target as { id: string }).id : l.target;
            if (sId === nodeId) connectedTargets.add(tId);
            if (tId === nodeId) connectedTargets.add(sId);
          });
          connectedTargetsRef.current = connectedTargets;
        }
      } else if (hoveredNodeIdRef.current !== null) {
        hoveredNodeIdRef.current = null;
        connectedTargetsRef.current = new Set();
        if (!coreHit) container.style.cursor = "default";
      } else if (!coreHit) {
        container.style.cursor = "default";
      }
    };

    const handleClick = (e: MouseEvent) => {
      lastInteractionRef.current = performance.now();
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      // Check if Core Orb is clicked -> Open AI Assistant Chat
      const coreHit = intersects.find((i) => i.object.userData?.isCoreOrb);
      if (coreHit) {
        setIsChatOpen(true);
        return;
      }

      // Check if Graph Node is clicked -> Open Note Reader
      const nodeHit = intersects.find((i) => i.object.userData?.node);
      if (nodeHit) {
        const node = nodeHit.object.userData.node as GraphNode;
        setSelectedNode(node);
      }
    };

    // Reset proximity target when the cursor actually leaves the canvas —
    // otherwise the glow would stay stuck at its last position (e.g. after
    // moving onto a HUD panel) instead of fading back out.
    const handlePointerLeave = () => {
      cursorPixelRef.current = { x: -99999, y: -99999 };
    };

    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerleave", handlePointerLeave);
    container.addEventListener("click", handleClick);

    return () => {
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerleave", handlePointerLeave);
      container.removeEventListener("click", handleClick);
    };
  }, [graphData, activeCategories]);

  // 5. Growth Replay Animation Loop
  useEffect(() => {
    if (!isReplaying || !growthPlanRef.current) return;

    const startTime = performance.now();
    let animId: number;

    const runReplay = (now: number) => {
      const elapsedSec = (now - startTime) / 1000;
      setReplayTime(elapsedSec);

      if (elapsedSec > (growthPlanRef.current?.duration ?? 28)) {
        setIsReplaying(false);
        setReplayTime(0);
        return;
      }

      growthPlanRef.current?.records.forEach((record) => {
        const item = nodeMeshMap.current.get(record.node.id);
        if (item) {
          const pos = growthPosition(record, elapsedSec);
          item.group.position.set(pos.x, pos.y, pos.z);
          item.group.visible = elapsedSec >= record.born;
        }
      });

      animId = requestAnimationFrame(runReplay);
    };

    animId = requestAnimationFrame(runReplay);
    return () => cancelAnimationFrame(animId);
  }, [isReplaying]);

  // Category Toggles
  const handleToggleCategory = (catId: string) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const handleSoloCategory = (catId: string) => {
    setActiveCategories(new Set([catId]));
  };

  return (
    <div className={`relative w-full h-full overflow-hidden select-none ${className}`}>
      {/* 3D Canvas Viewport */}
      <div ref={containerRef} className="w-full h-full inset-0 absolute" />

      {/* Spatial HUD Overlay — dissolves while the camera dives into the core */}
      <div className={isDiving ? "pointer-events-none opacity-0 transition-opacity duration-300" : "transition-opacity duration-300"}>
      <SpatialHud
        onEnterCore={handleEnterCore}
        currentTier={currentTier}
        onSelectTier={handleSelectTier}
        categories={graphData?.categories || []}
        activeCategories={activeCategories}
        onToggleCategory={handleToggleCategory}
        onSoloCategory={handleSoloCategory}
        allNodes={graphData?.nodes || []}
        onSelectNode={(node) => {
          setSelectedNode(node);
          // Focus camera on node position
          if (cameraRef.current && node.x !== undefined && controlsRef.current) {
            controlsRef.current.target.set(node.x, node.y ?? 0, node.z ?? 0);
          }
        }}
        isCinema={isCinema}
        onToggleCinema={() => setIsCinema(!isCinema)}
        isReplaying={isReplaying}
        replayTime={replayTime}
        onToggleReplay={() => setIsReplaying(!isReplaying)}
        onResetReplay={() => {
          setIsReplaying(false);
          setReplayTime(0);
          refreshData();
        }}
        telemetryData={telemetryData}
        onOpenBusinessHub={() => setIsBusinessHubOpen(true)}
        isNoteOpen={!!selectedNode}
        isChatOpen={isChatOpen}
        onOpenChat={(prompt?: string) => {
          setChatInitialPrompt(prompt);
          setIsChatOpen(true);
        }}
      />
      </div>

      {isDiving && <div className="dive-flash pointer-events-none absolute inset-0 z-50" aria-hidden />}

      {/* Note Reader Modal (Wikilinks & Markdown Previews) */}
      <NoteReaderModal
        node={selectedNode}
        allNodes={graphData?.nodes || []}
        allLinks={graphData?.links || []}
        onClose={() => setSelectedNode(null)}
        onSelectNode={(node) => {
          setSelectedNode(node);
          if (cameraRef.current && node.x !== undefined && controlsRef.current) {
            controlsRef.current.target.set(node.x, node.y ?? 0, node.z ?? 0);
          }
        }}
      />

      {/* Business Comms Triage Hub (Slack, Notion, HubSpot) */}
      <BusinessHubModal
        isOpen={isBusinessHubOpen}
        onClose={() => setIsBusinessHubOpen(false)}
        telemetryData={telemetryData}
      />

      {/* AI Assistant Spatial Holographic Chat Drawer */}
      <SpatialChatDrawer
        isOpen={isChatOpen}
        onClose={() => {
          setIsChatOpen(false);
          setChatInitialPrompt(undefined);
        }}
        initialPrompt={chatInitialPrompt}
      />
    </div>
  );
}
