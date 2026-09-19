"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
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
    position: [-45, -45, -20],
    size: 6.5,
    color: "#eab308",
    emissive: "#fde047",
    description: "Audits every figure against the research dossier. Enforces non-negotiable citation rules.",
    tools: ["Citation Verifier", "Hallucination Scanner"],
    metrics: { throughput: "Guaranteed", reliability: "100%" },
  },

  // 3. Right Hemisphere (Growth, Sales, Performance Media, Client Success)
  {
    id: "dept:sales-bd",
    name: "Revenue & Business Dev",
    role: "Pipeline & Outbound Acquisition",
    kind: "department",
    lobe: "growth_expansion",
    hemisphere: "right",
    position: [65, 30, 25],
    size: 7,
    color: "#10b981",
    emissive: "#34d399",
    description: "Lead generation, B2B outbound sequences, sales funnels, and conversion optimization.",
    tools: ["Apollo.io", "HubSpot Connector"],
    metrics: { throughput: "Active", latency: "290ms" },
  },
  {
    id: "dept:meta-ads",
    name: "Performance & Paid Media",
    role: "Paid Acquisition & Ad Creative",
    kind: "department",
    lobe: "performance_media",
    hemisphere: "right",
    position: [60, -20, 35],
    size: 7,
    color: "#ec4899",
    emissive: "#f472b6",
    description: "Meta Ads campaign structure, Google Ads keyword targeting, ROAS benchmarks, and creative angles.",
    tools: ["Meta Ads MCP", "Google Ads Engine"],
    metrics: { throughput: "Active", latency: "210ms" },
  },
  {
    id: "dept:client-success",
    name: "Client Success & Delivery",
    role: "Retention & Implementation",
    kind: "department",
    lobe: "growth_expansion",
    hemisphere: "right",
    position: [45, -45, -20],
    size: 6.5,
    color: "#14b8a6",
    emissive: "#2dd4bf",
    description: "Onboarding playbooks, milestone tracking, client satisfaction, and account expansion.",
    tools: ["Notion Sync", "Asana Workflow"],
    metrics: { throughput: "Active", latency: "195ms" },
  },
  {
    id: "dept:strategy",
    name: "AI Systems & Automation",
    role: "Workflow & Tool Integration",
    kind: "department",
    lobe: "creative_strategy",
    hemisphere: "right",
    position: [70, 15, -35],
    size: 6.5,
    color: "#6366f1",
    emissive: "#818cf8",
    description: "n8n workflow generation, webhook triggers, API pipelines, and autonomous execution.",
    tools: ["n8n Engine", "Custom REST Webhooks"],
    metrics: { throughput: "Standby", latency: "140ms" },
  },

  // 4. Tendril Knots & Connectors (Sub-network)
  {
    id: "mcp:hubspot",
    name: "HubSpot MCP Server",
    role: "CRM & Contact Sync",
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

  const nodes = useMemo(() => INITIAL_NODES, []);
  const axons = useMemo(() => INITIAL_AXONS, []);

  // Internal refs for animation & Three.js cleanup
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshesRef = useRef<Map<string, { mesh: THREE.Mesh; halo: THREE.Sprite; baseSize: number }>>(new Map());
  const particleSystemsRef = useRef<{ curve: THREE.CatmullRomCurve3; points: THREE.Points; progress: number; speed: number }[]>([]);

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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // 1. Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.fog = new THREE.FogExp2(0x070b14, 0.0022);

    // 2. Camera setup
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 40, 220);
    cameraRef.current = camera;

    // 3. Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x070b14, 1);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. OrbitControls setup
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 450;
    controls.minDistance = 30;
    controlsRef.current = controls;

    // 5. Ambient & Point Lighting
    const ambientLight = new THREE.AmbientLight(0x223355, 1.8);
    scene.add(ambientLight);

    const coreLight = new THREE.PointLight(0x38bdf8, 3.5, 200);
    coreLight.position.set(0, 10, 0);
    scene.add(coreLight);

    const leftLight = new THREE.PointLight(0x8b5cf6, 2, 180);
    leftLight.position.set(-60, 20, 20);
    scene.add(leftLight);

    const rightLight = new THREE.PointLight(0x10b981, 2, 180);
    rightLight.position.set(60, 20, 20);
    scene.add(rightLight);

    // 6. Build Neural Somas (Spheres + Halo Sprites)
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const meshesMap = new Map<string, { mesh: THREE.Mesh; halo: THREE.Sprite; baseSize: number }>();

    nodes.forEach((node) => {
      const geometry = new THREE.SphereGeometry(node.size, 32, 32);
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(node.color),
        emissive: new THREE.Color(node.emissive),
        emissiveIntensity: node.kind === "core" ? 0.9 : 0.6,
        roughness: 0.2,
        metalness: 0.8,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...node.position);
      mesh.userData = { nodeId: node.id };
      scene.add(mesh);

      // Radial bioluminescent halo sprite
      const haloTex = createHaloTexture(node.emissive);
      const haloMat = new THREE.SpriteMaterial({
        map: haloTex,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.7,
      });
      const halo = new THREE.Sprite(haloMat);
      const haloScale = node.size * 3.8;
      halo.scale.set(haloScale, haloScale, 1);
      halo.position.set(...node.position);
      scene.add(halo);

      meshesMap.set(node.id, { mesh, halo, baseSize: node.size });
    });
    meshesRef.current = meshesMap;

    // 7. Build Organic Axon Splines (Curved Bezier Tubes) & Action Potential Particles
    const particleSystems: { curve: THREE.CatmullRomCurve3; points: THREE.Points; progress: number; speed: number }[] = [];

    axons.forEach((axon) => {
      const sourceNode = nodeMap.get(axon.source);
      const targetNode = nodeMap.get(axon.target);
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
        opacity: axon.isInterHemisphere ? 0.35 : 0.45,
        wireframe: false,
      });

      const tubeMesh = new THREE.Mesh(tubeGeometry, tubeMaterial);
      scene.add(tubeMesh);

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
      scene.add(points);

      particleSystems.push({
        curve,
        points,
        progress: Math.random(),
        speed: 0.004 + Math.random() * 0.004,
      });
    });
    particleSystemsRef.current = particleSystems;

    // 8. Raycasting for Interaction
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(
        Array.from(meshesMap.values()).map((v) => v.mesh),
      );

      if (intersects.length > 0) {
        const id = intersects[0].object.userData.nodeId;
        const found = nodeMap.get(id) || null;
        setHoveredNode(found);
        containerRef.current.style.cursor = "pointer";
      } else {
        setHoveredNode(null);
        containerRef.current.style.cursor = "default";
      }
    };

    const handleClick = () => {
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(
        Array.from(meshesMap.values()).map((v) => v.mesh),
      );

      if (intersects.length > 0) {
        const id = intersects[0].object.userData.nodeId;
        const found = nodeMap.get(id) || null;
        setSelectedNode(found);
        if (found) {
          // Smooth zoom to node
          controls.target.lerp(new THREE.Vector3(...found.position), 0.6);
        }
      }
    };

    const dom = renderer.domElement;
    dom.addEventListener("mousemove", handlePointerMove);
    dom.addEventListener("click", handleClick);

    // 9. Animation Loop
    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const elapsedTime = clock.getElapsedTime();

      // Idle biological yaw & sinusoidal breathing float
      if (isAutoRotating) {
        scene.rotation.y += 0.0012;
      }
      scene.position.y = Math.sin(elapsedTime * 0.7) * 1.8;

      // Update action potential traveling particles
      particleSystems.forEach((ps) => {
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

      // Pulse bioluminescent halos
      meshesMap.forEach(({ halo, baseSize }, id) => {
        const nodeObj = nodeMap.get(id);
        const isHovered = hoveredNode?.id === id;
        const isSelected = selectedNode?.id === id;
        const pulse = Math.sin(elapsedTime * 2 + baseSize) * 0.15 + 1;
        const scale = baseSize * (isHovered || isSelected ? 4.8 : 3.8) * pulse;
        halo.scale.set(scale, scale, 1);

        // Telemetry state reaction
        if (nodeObj && telemetry.activeLobe === nodeObj.lobe && telemetry.executionState === "processing") {
          halo.scale.multiplyScalar(1.25);
        }
      });

      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    // 10. Resize handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      dom.removeEventListener("mousemove", handlePointerMove);
      dom.removeEventListener("click", handleClick);
      renderer.dispose();
      if (container && dom) {
        container.removeChild(dom);
      }
    };
  }, [nodes, axons, isAutoRotating, createHaloTexture, hoveredNode?.id, selectedNode?.id, telemetry]);

  // Reset Camera View
  const handleResetView = () => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(0, 40, 220);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
      setSelectedNode(null);
    }
  };

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl border border-electric/30 bg-[#070b14] text-white shadow-2xl transition-all duration-300 ${
        isFullscreen ? "fixed inset-0 z-50 rounded-none h-screen" : "h-[580px]"
      } ${className}`}
    >
      {/* 3D WebGL Canvas Container */}
      <div ref={containerRef} className="h-full w-full" />

      {/* Top Header Overlay */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 flex items-center justify-between p-4 bg-gradient-to-b from-[#070b14]/90 via-[#070b14]/50 to-transparent">
        <div className="pointer-events-auto flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-electric/15 ring-1 ring-electric/30 text-electric backdrop-blur-md">
            <Brain className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-sm font-semibold tracking-tight text-white flex items-center gap-1.5">
                Obsidian Neural Brain
                <span className="inline-flex items-center gap-1 rounded-full bg-electric/20 px-2 py-0.5 text-[10px] font-medium text-electric ring-1 ring-inset ring-electric/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-electric animate-pulse" />
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
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 p-1 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setIsAutoRotating(!isAutoRotating)}
            title={isAutoRotating ? "Pause rotation" : "Resume auto-rotation"}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            {isAutoRotating ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={handleResetView}
            title="Reset perspective"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen mode"}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Operational State Badge (Bottom-Left) */}
      <div className="pointer-events-auto absolute bottom-4 left-4 flex flex-col gap-2">
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0c1222]/80 px-3 py-2 backdrop-blur-md text-xs shadow-lg">
          <Activity className="h-3.5 w-3.5 text-electric animate-pulse" />
          <span className="text-slate-400">System State:</span>
          <span
            className={`font-semibold capitalize ${
              telemetry.executionState === "processing"
                ? "text-electric"
                : telemetry.executionState === "blocked_approval"
                ? "text-amber-400"
                : telemetry.executionState === "error"
                ? "text-crimson"
                : "text-emerald"
            }`}
          >
            {telemetry.executionState}
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-400">Active Lobe:</span>
          <span className="font-semibold text-white capitalize">
            {LOBE_COLORS[telemetry.activeLobe]?.label || telemetry.activeLobe}
          </span>
        </div>

        {/* Cognitive Lobe Selector Filter */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-[#0c1222]/80 p-1 backdrop-blur-md text-[11px]">
          <span className="px-2 font-medium text-slate-400 flex items-center gap-1">
            <Layers className="h-3 w-3" /> Lobes:
          </span>
          {(Object.keys(LOBE_COLORS) as BrainLobe[]).map((lobe) => (
            <button
              key={lobe}
              type="button"
              onClick={() => setFilterLobe(filterLobe === lobe ? "all" : lobe)}
              className={`rounded-lg px-2 py-1 transition-all ${
                filterLobe === lobe
                  ? "bg-white/20 text-white font-semibold shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {LOBE_COLORS[lobe].label.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Obsidian Inspect Badge / Node Card (Top-Right on Hover or Select) */}
      {(hoveredNode || selectedNode) && (
        <div className="pointer-events-auto absolute right-4 top-16 w-80 rounded-2xl border border-electric/30 bg-[#0c1222]/90 p-4 text-xs shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-right-2 duration-200">
          {(() => {
            const active = (hoveredNode || selectedNode)!;
            const lobeInfo = LOBE_COLORS[active.lobe];
            return (
              <div className="space-y-3">
                <div className="flex items-start justify-between border-b border-white/10 pb-2.5">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: active.color }} />
                      <h3 className="font-heading font-semibold text-white text-sm">{active.name}</h3>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{active.role} · {lobeInfo.label}</p>
                  </div>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-300">
                    {active.hemisphere}
                  </span>
                </div>

                <p className="text-slate-300 text-[11px] leading-relaxed">{active.description}</p>

                {active.tools && active.tools.length > 0 && (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 mb-1.5">
                      <Zap className="h-3 w-3 text-electric" /> Connected Tools:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {active.tools.map((t) => (
                        <span
                          key={t}
                          className="rounded bg-white/5 px-2 py-0.5 font-mono text-[10px] text-slate-300 border border-white/10"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {active.metrics && (
                  <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-2 text-[10px]">
                    {active.metrics.throughput && (
                      <div>
                        <span className="text-slate-400">Throughput:</span>
                        <p className="font-semibold text-white">{active.metrics.throughput}</p>
                      </div>
                    )}
                    {active.metrics.latency && (
                      <div>
                        <span className="text-slate-400">Latency:</span>
                        <p className="font-semibold text-white">{active.metrics.latency}</p>
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
