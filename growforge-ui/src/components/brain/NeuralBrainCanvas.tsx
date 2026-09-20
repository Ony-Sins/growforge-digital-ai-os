"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import * as THREE from "three";
import { useTelemetry } from "@/lib/useTelemetry";
import type { BrainLobe } from "@/lib/telemetryStore";
import {
  Brain,
  Maximize2,
  Minimize2,
  RotateCcw,
  Play,
  Pause,
  Layers,
  Activity,
  Zap,
  X,
  Move,
} from "lucide-react";

export interface BrainNode {
  id: string;
  name: string;
  role: string;
  kind: "core" | "department" | "tendril" | "connector";
  lobe: BrainLobe;
  hemisphere: "center" | "left" | "right";
  position: [number, number, number];
  size: number;
  color: string;
  emissive: string;
  description: string;
  tools?: string[];
  metrics?: { throughput?: string; latency?: string; reliability?: string };
}

export interface BrainAxon {
  id: string;
  source: string;
  target: string;
  color: string;
  curveOffset: [number, number, number];
  isInterHemisphere?: boolean;
}

const LOBE_COLORS: Record<BrainLobe, { main: string; emissive: string; label: string }> = {
  neural_core: { main: "#3b82f6", emissive: "#60a5fa", label: "Neural Core & Planning" },
  creative_strategy: { main: "#8b5cf6", emissive: "#a78bfa", label: "Creative & Strategy" },
  growth_expansion: { main: "#10b981", emissive: "#34d399", label: "Growth & Business Dev" },
  analytics_governance: { main: "#f59e0b", emissive: "#fbbf24", label: "Analytics & Finance" },
  performance_media: { main: "#ec4899", emissive: "#f472b6", label: "Paid Media & Ads" },
};

const INITIAL_NODES: BrainNode[] = [
  // 1. Central Core
  {
    id: "hq",
    name: "GrowForge HQ Core",
    role: "Central Executive Orchestrator",
    kind: "core",
    lobe: "neural_core",
    hemisphere: "center",
    position: [0, 10, 0],
    size: 9,
    color: "#3b82f6",
    emissive: "#60a5fa",
    description: "Multi-agent coordinator, plan synthesizer, and cross-department reconciler.",
    tools: ["orchestrator", "router", "memory_vault"],
    metrics: { throughput: "100%", latency: "24ms", reliability: "99.9%" },
  },

  // 2. Left Hemisphere (Strategy, Analytics, Research, QA)
  {
    id: "dept:marketing",
    name: "Marketing & Strategy",
    role: "Brand Positioning & Messaging",
    kind: "department",
    lobe: "creative_strategy",
    hemisphere: "left",
    position: [-65, 30, 25],
    size: 7,
    color: "#8b5cf6",
    emissive: "#a78bfa",
    description: "Brand narrative, market differentiation, customer avatars, and go-to-market architecture.",
    tools: ["Voice DNA", "Audience Profiler"],
    metrics: { throughput: "Active", latency: "310ms" },
  },
  {
    id: "dept:finance-ops",
    name: "Finance & Operations",
    role: "Capital Allocation & Unit Economics",
    kind: "department",
    lobe: "analytics_governance",
    hemisphere: "left",
    position: [-60, -25, 30],
    size: 7,
    color: "#f59e0b",
    emissive: "#fbbf24",
    description: "P&L projections, break-even analysis, runway modeling, and risk mitigation.",
    tools: ["World Bank Tool", "Unit Economics Engine"],
    metrics: { throughput: "Calibrated", latency: "180ms" },
  },
  {
    id: "research",
    name: "Live Research Engine",
    role: "Market & Sourced Intelligence",
    kind: "department",
    lobe: "analytics_governance",
    hemisphere: "left",
    position: [-70, 15, -35],
    size: 6.5,
    color: "#38bdf8",
    emissive: "#7dd3fc",
    description: "Google live fact retrieval, competitor price benchmarking, and regulatory discovery.",
    tools: ["Google Search", "DuckDuckGo Fallback", "Open-Meteo"],
    metrics: { throughput: "Real-time", latency: "420ms" },
  },
  {
    id: "qa",
    name: "QA & Evidence Gate",
    role: "Strategic Integrity Auditor",
    kind: "department",
    lobe: "analytics_governance",
    hemisphere: "left",
    position: [-45, -55, -20],
    size: 6,
    color: "#eab308",
    emissive: "#fde047",
    description: "Evidence gating, hallucination defense, sanity validation, and QA verification.",
    tools: ["Claim Validator", "Reality Checker"],
    metrics: { throughput: "Enforced", latency: "95ms" },
  },

  // 3. Right Hemisphere (Sales, Performance Media, Client Success, GTM)
  {
    id: "dept:sales-bd",
    name: "Sales & Outbound BD",
    role: "Pipeline & Deal Acquisition",
    kind: "department",
    lobe: "growth_expansion",
    hemisphere: "right",
    position: [65, 30, 25],
    size: 7,
    color: "#10b981",
    emissive: "#34d399",
    description: "Cold outreach, lead qualification, CRM synchronization, and pipeline closing sequences.",
    tools: ["HubSpot MCP", "Outreach Engine"],
    metrics: { throughput: "Streaming", latency: "210ms" },
  },
  {
    id: "dept:meta-ads",
    name: "Paid Media & Meta Ads",
    role: "Performance Campaign Execution",
    kind: "department",
    lobe: "performance_media",
    hemisphere: "right",
    position: [60, -20, 35],
    size: 7,
    color: "#ec4899",
    emissive: "#f472b6",
    description: "Ad creative variations, ROAS optimization, budget allocation, and audience retargeting.",
    tools: ["ComfyUI", "Whisper", "Piper Voice"],
    metrics: { throughput: "Scaled", latency: "490ms" },
  },
  {
    id: "dept:client-success",
    name: "Client Success & Onboarding",
    role: "Retention & Expansion Operations",
    kind: "department",
    lobe: "growth_expansion",
    hemisphere: "right",
    position: [45, -55, -20],
    size: 6,
    color: "#14b8a6",
    emissive: "#5eead4",
    description: "Onboarding workflows, health scores, recurring touchpoints, and account retention.",
    tools: ["Notion Sync", "Slack MCP"],
    metrics: { throughput: "Nominal", latency: "140ms" },
  },
  {
    id: "dept:strategy",
    name: "Executive GTM Strategy",
    role: "High-Leverage Strategic Orchestration",
    kind: "department",
    lobe: "creative_strategy",
    hemisphere: "right",
    position: [70, 15, -35],
    size: 6.5,
    color: "#6366f1",
    emissive: "#818cf8",
    description: "Offer design, high-ticket pricing, market positioning, and full funnel architecture.",
    tools: ["Funnel Simulator", "Pricing Architect"],
    metrics: { throughput: "Synthesized", latency: "260ms" },
  },

  // 4. Peripheral Tendrils & Custom Tool Nodes
  {
    id: "mcp:hubspot",
    name: "HubSpot CRM Connector",
    role: "Live CRM Data Pipeline",
    kind: "connector",
    lobe: "growth_expansion",
    hemisphere: "right",
    position: [92, 42, 35],
    size: 3.5,
    color: "#fb923c",
    emissive: "#fdba74",
    description: "Official HubSpot Protocol connector with contact management and deal pipeline tools.",
    tools: ["hubspot_get_contacts", "hubspot_create_deal"],
  },
  {
    id: "mcp:notion",
    name: "Notion Knowledge Base",
    role: "Vault & Shared Memory",
    kind: "connector",
    lobe: "growth_expansion",
    hemisphere: "right",
    position: [68, -65, -35],
    size: 3.5,
    color: "#f87171",
    emissive: "#fca5a5",
    description: "Notion workspace synchronization for client documents and strategy notes.",
    tools: ["notion_search_pages", "notion_append_block"],
  },
  {
    id: "tool:open-meteo",
    name: "Open-Meteo Weather API",
    role: "Environmental Planning",
    kind: "tendril",
    lobe: "analytics_governance",
    hemisphere: "left",
    position: [-95, 25, -45],
    size: 3.5,
    color: "#38bdf8",
    emissive: "#7dd3fc",
    description: "Zero-auth forecast tool used for regional campaign timing and location planning.",
    tools: ["open_meteo_forecast"],
  },
  {
    id: "tool:world-bank",
    name: "World Bank Indicator API",
    role: "Macroeconomic Intelligence",
    kind: "tendril",
    lobe: "analytics_governance",
    hemisphere: "left",
    position: [-85, -38, 45],
    size: 3.5,
    color: "#fbbf24",
    emissive: "#fef08a",
    description: "Zero-auth public economic and development indicator database.",
    tools: ["world_bank_indicator"],
  },
];

const INITIAL_AXONS: BrainAxon[] = [
  // Core to Departments
  { id: "ax-hq-marketing", source: "hq", target: "dept:marketing", color: "#8b5cf6", curveOffset: [-10, 15, 10] },
  { id: "ax-hq-finance", source: "hq", target: "dept:finance-ops", color: "#f59e0b", curveOffset: [-15, -10, 15] },
  { id: "ax-hq-research", source: "hq", target: "research", color: "#38bdf8", curveOffset: [-20, 10, -15] },
  { id: "ax-hq-qa", source: "hq", target: "qa", color: "#eab308", curveOffset: [-10, -25, -10] },
  { id: "ax-hq-sales", source: "hq", target: "dept:sales-bd", color: "#10b981", curveOffset: [10, 15, 10] },
  { id: "ax-hq-meta", source: "hq", target: "dept:meta-ads", color: "#ec4899", curveOffset: [15, -10, 15] },
  { id: "ax-hq-cs", source: "hq", target: "dept:client-success", color: "#14b8a6", curveOffset: [10, -25, -10] },
  { id: "ax-hq-strat", source: "hq", target: "dept:strategy", color: "#6366f1", curveOffset: [20, 10, -15] },

  // Inter-Hemispheric Bridges (Corpus Callosum)
  { id: "ax-bridge-mkt-sales", source: "dept:marketing", target: "dept:sales-bd", color: "#818cf8", curveOffset: [0, 45, 30], isInterHemisphere: true },
  { id: "ax-bridge-fin-meta", source: "dept:finance-ops", target: "dept:meta-ads", color: "#f472b6", curveOffset: [0, -35, 45], isInterHemisphere: true },
  { id: "ax-bridge-res-strat", source: "research", target: "dept:strategy", color: "#38bdf8", curveOffset: [0, 30, -50], isInterHemisphere: true },
  { id: "ax-bridge-qa-cs", source: "qa", target: "dept:client-success", color: "#2dd4bf", curveOffset: [0, -60, -30], isInterHemisphere: true },

  // Department to Tendril / Connector
  { id: "ax-sales-hubspot", source: "dept:sales-bd", target: "mcp:hubspot", color: "#10b981", curveOffset: [10, 5, 5] },
  { id: "ax-cs-notion", source: "dept:client-success", target: "mcp:notion", color: "#14b8a6", curveOffset: [10, -8, -5] },
  { id: "ax-res-meteo", source: "research", target: "tool:open-meteo", color: "#38bdf8", curveOffset: [-10, 5, -5] },
  { id: "ax-fin-worldbank", source: "dept:finance-ops", target: "tool:world-bank", color: "#f59e0b", curveOffset: [-10, -5, 5] },
];

export function NeuralBrainCanvas({ className = "" }: { className?: string } = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { telemetry } = useTelemetry(2500);

  const [selectedNode, setSelectedNode] = useState<BrainNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<BrainNode | null>(null);
  const [isAutoRotating, setIsAutoRotating] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [filterLobe, setFilterLobe] = useState<BrainLobe | "all">("all");
  const [dynamicTopology, setDynamicTopology] = useState<{ nodes: BrainNode[]; axons: BrainAxon[] }>({
    nodes: [],
    axons: [],
  });

  const loadDynamicTopology = useCallback(async () => {
    try {
      const res = await fetch("/api/mcp/connect");
      if (res.ok) {
        const data = await res.json();
        if (data.topology) {
          setDynamicTopology({
            nodes: (data.topology.nodes as BrainNode[]) || [],
            axons: (data.topology.axons as BrainAxon[]) || [],
          });
        }
      }
    } catch {
      // Non-blocking
    }
  }, []);

  useEffect(() => {
    const initialTimer = setTimeout(() => {
      void loadDynamicTopology();
    }, 0);
    const interval = setInterval(loadDynamicTopology, 4000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [loadDynamicTopology]);

  const allNodes = useMemo(() => [...INITIAL_NODES, ...dynamicTopology.nodes], [dynamicTopology.nodes]);
  const nodeMapRef = useRef<Map<string, BrainNode>>(new Map(allNodes.map((n) => [n.id, n])));
  useEffect(() => {
    nodeMapRef.current = new Map(allNodes.map((n) => [n.id, n]));
  }, [allNodes]);

  // Three.js internal instances
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const brainGroupRef = useRef<THREE.Group | null>(null);
  const dynamicGroupRef = useRef<THREE.Group | null>(null);

  // Persistent Camera Target (allows panning Up/Down/Left/Right into lobes)
  const cameraTargetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 10, 0));

  const meshesRef = useRef<Map<string, { mesh: THREE.Mesh; halo: THREE.Sprite; baseSize: number }>>(new Map());
  const particleSystemsRef = useRef<{ curve: THREE.CatmullRomCurve3; points: THREE.Points; progress: number; speed: number }[]>([]);
  const dynamicParticleSystemsRef = useRef<{ curve: THREE.CatmullRomCurve3; points: THREE.Points; progress: number; speed: number }[]>([]);

  // Persistent interaction & state refs to avoid tearing down WebGL on state updates
  const isAutoRotatingRef = useRef(isAutoRotating);
  const selectedNodeRef = useRef<BrainNode | null>(selectedNode);
  const hoveredNodeRef = useRef<BrainNode | null>(hoveredNode);
  const telemetryRef = useRef(telemetry);
  const filterLobeRef = useRef<BrainLobe | "all">(filterLobe);

  useEffect(() => {
    isAutoRotatingRef.current = isAutoRotating;
    selectedNodeRef.current = selectedNode;
    hoveredNodeRef.current = hoveredNode;
    telemetryRef.current = telemetry;
    filterLobeRef.current = filterLobe;
  }, [isAutoRotating, selectedNode, hoveredNode, telemetry, filterLobe]);

  // Create radial glow halo canvas texture
  const createHaloTexture = useCallback((colorHex: string) => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (!ctx) return new THREE.Texture();

    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, colorHex);
    gradient.addColorStop(0.3, colorHex);
    gradient.addColorStop(0.7, "rgba(255, 255, 255, 0.15)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }, []);

  // 1. Initial Scene Setup — Mounts ONLY ONCE (Zero Auto-Reset on Data Polls)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 1. Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.fog = new THREE.FogExp2(0x030712, 0.0022);

    // 2. Camera setup with persistent target
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1200);
    camera.position.set(0, 40, 220);
    camera.lookAt(cameraTargetRef.current);
    cameraRef.current = camera;

    // 3. Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x030712, 1);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Brain Group Hierarchy (turntable container with direct unclamped 360° rotation)
    const brainGroup = new THREE.Group();
    brainGroup.rotation.order = "YXZ";
    scene.add(brainGroup);
    brainGroupRef.current = brainGroup;

    // Dedicated dynamic group for dynamic BYO-MCP nodes/axons
    const dynamicGroup = new THREE.Group();
    brainGroup.add(dynamicGroup);
    dynamicGroupRef.current = dynamicGroup;

    // 5. Ambient & Point Lighting
    const ambientLight = new THREE.AmbientLight(0x1e293b, 2.0);
    scene.add(ambientLight);

    const coreLight = new THREE.PointLight(0x38bdf8, 3.5, 220);
    coreLight.position.set(0, 10, 0);
    scene.add(coreLight);

    const leftLight = new THREE.PointLight(0x8b5cf6, 2.4, 200);
    leftLight.position.set(-65, 25, 25);
    scene.add(leftLight);

    const rightLight = new THREE.PointLight(0x10b981, 2.4, 200);
    rightLight.position.set(65, 25, 25);
    scene.add(rightLight);

    // 6. Build Initial Static Neural Somas
    const meshesMap = new Map<string, { mesh: THREE.Mesh; halo: THREE.Sprite; baseSize: number }>();

    INITIAL_NODES.forEach((node) => {
      const geometry = new THREE.SphereGeometry(node.size, 32, 32);
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(node.color),
        emissive: new THREE.Color(node.emissive),
        emissiveIntensity: node.kind === "core" ? 0.95 : 0.65,
        roughness: 0.2,
        metalness: 0.85,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...node.position);
      mesh.userData = { nodeId: node.id };
      brainGroup.add(mesh);

      // Radial bioluminescent halo sprite
      const haloTex = createHaloTexture(node.emissive);
      const haloMat = new THREE.SpriteMaterial({
        map: haloTex,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.75,
      });
      const halo = new THREE.Sprite(haloMat);
      const haloScale = node.size * 3.8;
      halo.scale.set(haloScale, haloScale, 1);
      halo.position.set(...node.position);
      brainGroup.add(halo);

      meshesMap.set(node.id, { mesh, halo, baseSize: node.size });
    });
    meshesRef.current = meshesMap;

    // 7. Build Initial Static Axon Splines & Action Potential Particles
    const staticNodeMap = new Map(INITIAL_NODES.map((n) => [n.id, n]));
    const particleSystems: { curve: THREE.CatmullRomCurve3; points: THREE.Points; progress: number; speed: number }[] = [];

    INITIAL_AXONS.forEach((axon) => {
      const sourceNode = staticNodeMap.get(axon.source);
      const targetNode = staticNodeMap.get(axon.target);
      if (!sourceNode || !targetNode) return;

      const p1 = new THREE.Vector3(...sourceNode.position);
      const p3 = new THREE.Vector3(...targetNode.position);
      const mid = new THREE.Vector3().addVectors(p1, p3).multiplyScalar(0.5);
      mid.add(new THREE.Vector3(...axon.curveOffset));

      const curve = new THREE.CatmullRomCurve3([p1, mid, p3]);
      const tubeGeometry = new THREE.TubeGeometry(curve, 32, 0.45, 8, false);
      const tubeMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(axon.color),
        transparent: true,
        opacity: axon.isInterHemisphere ? 0.35 : 0.48,
        wireframe: false,
      });

      const tubeMesh = new THREE.Mesh(tubeGeometry, tubeMaterial);
      brainGroup.add(tubeMesh);

      // Action potential traveling particles
      const particleCount = 3;
      const particleGeo = new THREE.BufferGeometry();
      const positions = new Float32Array(particleCount * 3);
      particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

      const particleMat = new THREE.PointsMaterial({
        color: new THREE.Color(0xffffff),
        size: 2.2,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.9,
      });

      const points = new THREE.Points(particleGeo, particleMat);
      brainGroup.add(points);

      particleSystems.push({
        curve,
        points,
        progress: Math.random(),
        speed: 0.004 + Math.random() * 0.004,
      });
    });
    particleSystemsRef.current = particleSystems;

    // 8. Interactive Panning, Rotation & Raycasting Controls
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    let isDragging = false;
    let dragMode: "rotate" | "pan" | null = null;
    let prevX = 0;
    let prevY = 0;
    let totalDragDist = 0;
    const rotateSensitivity = 0.006;

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
      totalDragDist = 0;

      // Right-Click (2), Middle-Click (1), or Shift + Left-Click -> Pan Mode
      if (e.button === 2 || e.button === 1 || e.shiftKey) {
        dragMode = "pan";
        if (container) container.style.cursor = "move";
      } else if (e.button === 0) {
        dragMode = "rotate";
        if (container) container.style.cursor = "grabbing";
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!container) return;
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (isDragging) {
        const deltaX = e.clientX - prevX;
        const deltaY = e.clientY - prevY;
        prevX = e.clientX;
        prevY = e.clientY;
        totalDragDist += Math.abs(deltaX) + Math.abs(deltaY);

        if (dragMode === "pan") {
          // Horizontal & Vertical Camera Panning
          const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
          const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);

          const distanceToTarget = camera.position.distanceTo(cameraTargetRef.current);
          const panFactor = Math.max(distanceToTarget, 30) * 0.0014;
          const panX = -deltaX * panFactor;
          const panY = deltaY * panFactor;

          camera.position.addScaledVector(right, panX);
          camera.position.addScaledVector(up, panY);
          cameraTargetRef.current.addScaledVector(right, panX);
          cameraTargetRef.current.addScaledVector(up, panY);
          camera.lookAt(cameraTargetRef.current);

          container.style.cursor = "move";
          return;
        }

        if (dragMode === "rotate") {
          // Unclamped 360° direct object rotation
          brainGroup.rotation.y += deltaX * rotateSensitivity;
          brainGroup.rotation.x += deltaY * rotateSensitivity;

          container.style.cursor = "grabbing";
          return;
        }
      }

      // Hover Raycasting
      raycaster.setFromCamera(mouse, camera);
      const meshesToTest = Array.from(meshesRef.current.values()).map((v) => v.mesh);
      const intersects = raycaster.intersectObjects(meshesToTest);

      if (intersects.length > 0) {
        const id = intersects[0].object.userData.nodeId;
        const found = nodeMapRef.current.get(id) || null;
        hoveredNodeRef.current = found;
        setHoveredNode(found);
        container.style.cursor = "pointer";
      } else {
        hoveredNodeRef.current = null;
        setHoveredNode(null);
        container.style.cursor = "default";
      }
    };

    const onPointerUp = () => {
      if (!container) return;
      const wasDragging = isDragging;
      const currentMode = dragMode;
      isDragging = false;
      dragMode = null;

      // Click node selection
      if (wasDragging && currentMode === "rotate" && totalDragDist < 6) {
        raycaster.setFromCamera(mouse, camera);
        const meshesToTest = Array.from(meshesRef.current.values()).map((v) => v.mesh);
        const intersects = raycaster.intersectObjects(meshesToTest);

        if (intersects.length > 0) {
          const id = intersects[0].object.userData.nodeId;
          const found = nodeMapRef.current.get(id) || null;
          selectedNodeRef.current = found;
          setSelectedNode(found);
        }
      }

      container.style.cursor = hoveredNodeRef.current ? "pointer" : "default";
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Zoom relative to current panned target
      const zoomFactor = e.deltaY * 0.18;
      const viewDir = new THREE.Vector3().subVectors(camera.position, cameraTargetRef.current);
      const currentDist = viewDir.length();
      const newDist = Math.min(Math.max(currentDist + zoomFactor, 35), 650);
      viewDir.setLength(newDist);
      camera.position.copy(cameraTargetRef.current).add(viewDir);
      camera.lookAt(cameraTargetRef.current);
    };

    const dom = renderer.domElement;
    dom.addEventListener("contextmenu", onContextMenu);
    dom.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    dom.addEventListener("wheel", onWheel, { passive: false });

    // 9. Animation Loop
    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Continuous unbroken sideways turntable yaw rotation
      if (isAutoRotatingRef.current) {
        brainGroup.rotation.y += 0.0012;
      }
      brainGroup.position.y = Math.sin(elapsedTime * 0.7) * 1.8;

      // Update static & dynamic action potential particles
      const allParticleSystems = [
        ...particleSystemsRef.current,
        ...dynamicParticleSystemsRef.current,
      ];

      allParticleSystems.forEach((ps) => {
        ps.progress += ps.speed;
        if (ps.progress > 1) ps.progress = 0;

        const posAttr = ps.points.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < 3; i++) {
          const t = (ps.progress + i * 0.15) % 1;
          const pt = ps.curve.getPoint(t);
          posAttr.setXYZ(i, pt.x, pt.y, pt.z);
        }
        posAttr.needsUpdate = true;
      });

      // Pulse bioluminescent halos & handle telemetry highlights
      const currentHoveredId = hoveredNodeRef.current?.id;
      const currentSelectedId = selectedNodeRef.current?.id;
      const currentFilter = filterLobeRef.current;
      const currentTelemetry = telemetryRef.current;

      meshesRef.current.forEach(({ mesh, halo, baseSize }, id) => {
        const nodeObj = nodeMapRef.current.get(id);
        const isHovered = currentHoveredId === id;
        const isSelected = currentSelectedId === id;
        const isFiltered = currentFilter !== "all" && nodeObj?.lobe !== currentFilter;

        if (mesh.material instanceof THREE.MeshStandardMaterial) {
          mesh.material.opacity = isFiltered ? 0.2 : 1;
          mesh.material.transparent = isFiltered;
        }

        const pulse = Math.sin(elapsedTime * 2 + baseSize) * 0.15 + 1;
        const scale = baseSize * (isHovered || isSelected ? 4.8 : 3.8) * pulse * (isFiltered ? 0.4 : 1);
        halo.scale.set(scale, scale, 1);

        if (
          nodeObj &&
          currentTelemetry.activeLobe === nodeObj.lobe &&
          currentTelemetry.executionState === "processing"
        ) {
          halo.scale.multiplyScalar(1.25);
        }
      });

      renderer.render(scene, camera);
    };

    animate();

    // 10. True Edge-to-Edge Dynamic ResizeObserver
    const handleResize = () => {
      if (!container || !camera || !renderer) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(container);
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      dom.removeEventListener("contextmenu", onContextMenu);
      dom.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      dom.removeEventListener("wheel", onWheel);
      renderer.dispose();
      if (container && dom) {
        container.removeChild(dom);
      }
    };
  }, [createHaloTexture]);

  // 2. Incremental Dynamic Topology Updates (Adds/Removes BYO-MCP nodes without resetting Camera/Zoom)
  useEffect(() => {
    const dynamicGroup = dynamicGroupRef.current;
    if (!dynamicGroup) return;

    // Clear previous dynamic meshes from dynamicGroup
    while (dynamicGroup.children.length > 0) {
      const child = dynamicGroup.children[0];
      dynamicGroup.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) child.material.dispose();
      }
    }

    // Clean up dynamic entries in meshesRef and dynamicParticleSystemsRef
    dynamicTopology.nodes.forEach((node) => {
      meshesRef.current.delete(node.id);
    });
    dynamicParticleSystemsRef.current = [];

    if (dynamicTopology.nodes.length === 0) return;

    // Build Dynamic Somas
    dynamicTopology.nodes.forEach((node) => {
      const geometry = new THREE.SphereGeometry(node.size, 32, 32);
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(node.color),
        emissive: new THREE.Color(node.emissive),
        emissiveIntensity: 0.9,
        roughness: 0.2,
        metalness: 0.8,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...node.position);
      mesh.userData = { nodeId: node.id };
      dynamicGroup.add(mesh);

      const haloTex = createHaloTexture(node.emissive);
      const haloMat = new THREE.SpriteMaterial({
        map: haloTex,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.85,
      });
      const halo = new THREE.Sprite(haloMat);
      const haloScale = node.size * 4.0;
      halo.scale.set(haloScale, haloScale, 1);
      halo.position.set(...node.position);
      dynamicGroup.add(halo);

      meshesRef.current.set(node.id, { mesh, halo, baseSize: node.size });
    });

    // Build Dynamic Axons
    const dynamicParticles: { curve: THREE.CatmullRomCurve3; points: THREE.Points; progress: number; speed: number }[] = [];

    dynamicTopology.axons.forEach((axon) => {
      const sourceNode = nodeMapRef.current.get(axon.source);
      const targetNode = nodeMapRef.current.get(axon.target);
      if (!sourceNode || !targetNode) return;

      const p1 = new THREE.Vector3(...sourceNode.position);
      const p3 = new THREE.Vector3(...targetNode.position);
      const mid = new THREE.Vector3().addVectors(p1, p3).multiplyScalar(0.5);
      mid.add(new THREE.Vector3(...axon.curveOffset));

      const curve = new THREE.CatmullRomCurve3([p1, mid, p3]);
      const tubeGeometry = new THREE.TubeGeometry(curve, 32, 0.5, 8, false);
      const tubeMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(axon.color),
        transparent: true,
        opacity: 0.6,
      });

      const tubeMesh = new THREE.Mesh(tubeGeometry, tubeMaterial);
      dynamicGroup.add(tubeMesh);

      const particleCount = 4;
      const particleGeo = new THREE.BufferGeometry();
      const positions = new Float32Array(particleCount * 3);
      particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

      const particleMat = new THREE.PointsMaterial({
        color: new THREE.Color(0x22d3ee),
        size: 2.8,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.95,
      });

      const points = new THREE.Points(particleGeo, particleMat);
      dynamicGroup.add(points);

      dynamicParticles.push({
        curve,
        points,
        progress: Math.random(),
        speed: 0.005 + Math.random() * 0.003,
      });
    });

    dynamicParticleSystemsRef.current = dynamicParticles;
  }, [dynamicTopology, createHaloTexture]);

  // Reset Camera View & Brain Rotation (Explicit user action only)
  const handleResetView = () => {
    if (cameraRef.current) {
      cameraRef.current.position.set(0, 40, 220);
      cameraTargetRef.current.set(0, 10, 0);
      cameraRef.current.lookAt(cameraTargetRef.current);
    }
    if (brainGroupRef.current) {
      brainGroupRef.current.rotation.set(0, 0, 0);
    }
    setSelectedNode(null);
    selectedNodeRef.current = null;
  };

  return (
    <div
      className={`relative w-full overflow-hidden bg-[#030712] text-slate-100 transition-all duration-300 ${
        isFullscreen
          ? "fixed inset-0 z-50 w-screen h-screen overflow-hidden rounded-none m-0 p-0"
          : "h-[580px] rounded-2xl border border-cyan-500/30 shadow-2xl"
      } ${className}`}
    >
      {/* True Edge-to-Edge 3D WebGL Canvas Container */}
      <div ref={containerRef} className="h-full w-full absolute inset-0 overflow-hidden" />

      {/* Top Header Overlay */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 flex items-center justify-between p-4 bg-gradient-to-b from-[#030712]/90 via-[#030712]/50 to-transparent">
        <div className="pointer-events-auto flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/15 ring-1 ring-cyan-500/30 text-cyan-400 backdrop-blur-md">
            <Brain className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-sm font-semibold tracking-tight text-slate-100 flex items-center gap-1.5">
                Obsidian Neural Brain
                <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold text-cyan-400 ring-1 ring-inset ring-cyan-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  Live WebGL
                </span>
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              Dual-hemisphere cognitive architecture & live synaptic firing stream
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-slate-800 bg-[#030712]/80 p-1 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setIsAutoRotating(!isAutoRotating)}
            title={isAutoRotating ? "Pause rotation" : "Resume auto-rotation"}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-cyan-400 transition-colors"
          >
            {isAutoRotating ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={handleResetView}
            title="Reset perspective & center"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-cyan-400 transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen mode"}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-cyan-400 transition-colors"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Operational State Badge & Controls Hint (Bottom-Left) */}
      <div className="pointer-events-auto absolute bottom-4 left-4 flex flex-col gap-2">
        <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-[#030712]/90 px-3 py-2 backdrop-blur-md text-xs shadow-lg">
          <Activity className="h-3.5 w-3.5 text-cyan-400 animate-pulse" />
          <span className="text-slate-400">System State:</span>
          <span
            className={`font-semibold capitalize ${
              telemetry.executionState === "processing"
                ? "text-cyan-400"
                : telemetry.executionState === "blocked_approval"
                ? "text-amber-400"
                : telemetry.executionState === "error"
                ? "text-crimson"
                : "text-emerald"
            }`}
          >
            {telemetry.executionState}
          </span>
          <span className="text-slate-700">·</span>
          <span className="text-slate-400">Active Lobe:</span>
          <span className="font-semibold text-slate-100 capitalize">
            {LOBE_COLORS[telemetry.activeLobe]?.label || telemetry.activeLobe}
          </span>
        </div>

        {/* Cognitive Lobe Selector Filter & Pan/Rotate Hint */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-800 bg-[#030712]/90 p-1 backdrop-blur-md text-[11px]">
          <span className="px-2 font-medium text-slate-400 flex items-center gap-1">
            <Layers className="h-3 w-3 text-cyan-400" /> Lobes:
          </span>
          {(Object.keys(LOBE_COLORS) as BrainLobe[]).map((lobe) => (
            <button
              key={lobe}
              type="button"
              onClick={() => setFilterLobe(filterLobe === lobe ? "all" : lobe)}
              className={`rounded-lg px-2 py-1 transition-all ${
                filterLobe === lobe
                  ? "bg-cyan-500/20 text-cyan-300 font-semibold ring-1 ring-cyan-500/30 shadow-sm"
                  : "text-slate-400 hover:text-slate-100 hover:bg-slate-800"
              }`}
            >
              {LOBE_COLORS[lobe].label.split(" ")[0]}
            </button>
          ))}
          <span className="hidden md:inline-flex items-center gap-1 pl-2 pr-2 text-[10px] text-slate-500 border-l border-slate-800">
            <Move className="h-3 w-3 text-slate-400" /> Right-drag to Pan · Left-drag to Rotate
          </span>
        </div>
      </div>

      {/* Obsidian Inspect Badge / Node Card (Top-Right on Hover or Select) */}
      {(hoveredNode || selectedNode) && (
        <div className="pointer-events-auto absolute right-4 top-16 w-80 rounded-2xl border border-cyan-500/30 bg-[#030712]/95 p-4 text-xs shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-right-2 duration-200">
          {(() => {
            const active = (hoveredNode || selectedNode)!;
            const lobeInfo = LOBE_COLORS[active.lobe];
            return (
              <div className="space-y-3">
                <div className="flex items-start justify-between border-b border-slate-800 pb-2.5">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: active.color }} />
                      <h3 className="font-heading font-semibold text-slate-100 text-sm">{active.name}</h3>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{active.role} · {lobeInfo.label}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-300 border border-slate-700">
                      {active.hemisphere}
                    </span>
                    {selectedNode && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedNode(null);
                          selectedNodeRef.current = null;
                        }}
                        className="rounded p-0.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
                        title="Unpin / resume rotation"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-slate-300 text-[11px] leading-relaxed">{active.description}</p>

                {active.tools && active.tools.length > 0 && (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 mb-1.5">
                      <Zap className="h-3 w-3 text-cyan-400" /> Connected Tools:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {active.tools.map((t) => (
                        <span
                          key={t}
                          className="rounded bg-slate-900 px-2 py-0.5 font-mono text-[10px] text-cyan-300 border border-cyan-500/20"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {active.metrics && (
                  <div className="grid grid-cols-2 gap-2 border-t border-slate-800 pt-2 text-[10px]">
                    {active.metrics.throughput && (
                      <div>
                        <span className="text-slate-400">Throughput:</span>
                        <p className="font-semibold text-slate-100">{active.metrics.throughput}</p>
                      </div>
                    )}
                    {active.metrics.latency && (
                      <div>
                        <span className="text-slate-400">Latency:</span>
                        <p className="font-semibold text-slate-100">{active.metrics.latency}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
