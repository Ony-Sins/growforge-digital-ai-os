"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useTelemetry } from "@/lib/useTelemetry";
import { useAppState } from "@/lib/appState";
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
  Trash2,
} from "lucide-react";
import { NodeDeleteConfirmModal, type DeletableNodeType } from "@/components/workspace/NodeDeleteConfirmModal";
import {
  generateProceduralBrainWeb,
  calculateNodeBrainPosition,
} from "./brainGeometry";

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
  // 1. Central Core — the single true structural minimum anchored in the midbrain
  {
    id: "hq",
    name: "GrowForge HQ Core",
    role: "Central Executive Orchestrator",
    kind: "core",
    lobe: "neural_core",
    hemisphere: "center",
    position: [0, 8, 10],
    size: 8.5,
    color: "#0078FF",
    emissive: "#60a5fa",
    description: "Multi-agent coordinator, plan synthesizer, and cross-department reconciler.",
    tools: ["orchestrator", "router", "memory_vault"],
    metrics: { throughput: "100%", latency: "24ms", reliability: "99.9%" },
  },
];

const INITIAL_AXONS: BrainAxon[] = [];

/** Canonical 3D definitions for departments and engine nodes positioned onto procedural shell anchors.
 *  Only rendered dynamically when executionState === "processing" and their mapped lobe is active. */
export const DEPARTMENT_NODE_DEFINITIONS: Record<string, BrainNode> = {
  "dept:sales-bd": {
    id: "dept:sales-bd",
    name: "Revenue & Business Development",
    role: "Pipeline & Deal Acquisition",
    kind: "department",
    lobe: "growth_expansion",
    hemisphere: "right",
    position: [48, 18, 24],
    size: 6.8,
    color: "#10b981",
    emissive: "#34d399",
    description: "Cold outreach, lead qualification, CRM synchronization, and pipeline closing sequences.",
    tools: ["Outreach Engine"],
    metrics: { throughput: "Active", latency: "210ms" },
  },
  "dept:marketing": {
    id: "dept:marketing",
    name: "Marketing & Brand Strategy",
    role: "Brand Positioning & Messaging",
    kind: "department",
    lobe: "creative_strategy",
    hemisphere: "left",
    position: [-48, 18, 24],
    size: 6.8,
    color: "#8b5cf6",
    emissive: "#a78bfa",
    description: "Brand narrative, market differentiation, customer avatars, and go-to-market architecture.",
    tools: ["Voice DNA", "Audience Profiler"],
    metrics: { throughput: "Active", latency: "310ms" },
  },
  "dept:meta-ads": {
    id: "dept:meta-ads",
    name: "Paid Media & Performance",
    role: "Performance Campaign Execution",
    kind: "department",
    lobe: "performance_media",
    hemisphere: "right",
    position: [46, -18, 28],
    size: 6.5,
    color: "#ec4899",
    emissive: "#f472b6",
    description: "Campaign scaling, ad creative testing, algorithmic bidding, and ROAS optimization.",
    tools: ["Ads Architect"],
    metrics: { throughput: "Active", latency: "180ms" },
  },
  "dept:finance": {
    id: "dept:finance",
    name: "Financial Modeling & Ops",
    role: "Unit Economics & Cashflow",
    kind: "department",
    lobe: "analytics_governance",
    hemisphere: "left",
    position: [-46, -18, 22],
    size: 6.5,
    color: "#f59e0b",
    emissive: "#fbbf24",
    description: "Budget forecasting, profit margins, burn rate monitoring, and financial scenario models.",
    tools: ["Finance Core"],
    metrics: { throughput: "Active", latency: "140ms" },
  },
  "dept:content": {
    id: "dept:content",
    name: "Content Engine & Creative",
    role: "Asset & Copy Generation",
    kind: "department",
    lobe: "creative_strategy",
    hemisphere: "left",
    position: [-38, 28, 6],
    size: 6.2,
    color: "#a855f7",
    emissive: "#c084fc",
    description: "Long-form editorial, social media collateral, video scripting, and visual prompt decks.",
    tools: ["Copy Studio"],
    metrics: { throughput: "Active", latency: "260ms" },
  },
  "dept:web-build": {
    id: "dept:web-build",
    name: "Full-Stack Development",
    role: "Digital Infrastructure & Code",
    kind: "department",
    lobe: "neural_core",
    hemisphere: "center",
    position: [0, -18, 16],
    size: 6.2,
    color: "#06b6d4",
    emissive: "#22d3ee",
    description: "Next.js applications, responsive design systems, database schemas, and API connectors.",
    tools: ["Code Sandbox"],
    metrics: { throughput: "Active", latency: "190ms" },
  },
  "dept:seo": {
    id: "dept:seo",
    name: "Search Engine & Visibility",
    role: "Organic Discovery & Ranking",
    kind: "department",
    lobe: "performance_media",
    hemisphere: "right",
    position: [38, 28, 6],
    size: 6.2,
    color: "#0ea5e9",
    emissive: "#38bdf8",
    description: "Keyword clustering, technical audits, backlink strategy, and search intent optimization.",
    tools: ["SEO Crawler"],
    metrics: { throughput: "Active", latency: "220ms" },
  },
  "dept:operations": {
    id: "dept:operations",
    name: "Autonomous Workflows",
    role: "Execution Automation",
    kind: "department",
    lobe: "neural_core",
    hemisphere: "center",
    position: [0, 32, -8],
    size: 6.8,
    color: "#0078FF",
    emissive: "#60a5fa",
    description: "Automations, CRM workflows, n8n integrations, and AI tool orchestration.",
    tools: ["n8n Manager"],
    metrics: { throughput: "Active", latency: "120ms" },
  },
  research: {
    id: "research",
    name: "Live Research Engine",
    role: "Market & Sourced Intelligence",
    kind: "department",
    lobe: "analytics_governance",
    hemisphere: "left",
    position: [-48, 22, -12],
    size: 6.5,
    color: "#38bdf8",
    emissive: "#7dd3fc",
    description: "Live web research, competitor pricing, and market demand intelligence.",
    tools: ["Search Engine"],
    metrics: { throughput: "Real-time", latency: "420ms" },
  },
  qa: {
    id: "qa",
    name: "QA & Evidence Gate",
    role: "Strategic Integrity Auditor",
    kind: "department",
    lobe: "analytics_governance",
    hemisphere: "left",
    position: [-36, -8, -42],
    size: 6.0,
    color: "#eab308",
    emissive: "#fde047",
    description: "Evidence gating, hallucination defense, sanity validation, and QA verification.",
    tools: ["Claim Validator"],
    metrics: { throughput: "Enforced", latency: "95ms" },
  },
};

interface NodeMeshRecord {
  group: THREE.Group;
  outerMesh: THREE.Mesh;
  outerMat: THREE.MeshPhysicalMaterial;
  coreMesh: THREE.Mesh;
  coreMat: THREE.MeshStandardMaterial;
  halo: THREE.Sprite;
  baseSize: number;
}

interface AmbientWebRecord {
  tubesGroup: THREE.Group;
  nodesGroup: THREE.Group;
  tubes: {
    mesh: THREE.Mesh;
    mat: THREE.MeshBasicMaterial;
    lobe: BrainLobe;
    baseOpacity: number;
  }[];
  nodes: {
    group: THREE.Group;
    outerMesh: THREE.Mesh;
    outerMat: THREE.MeshStandardMaterial;
    coreMesh: THREE.Mesh;
    coreMat: THREE.MeshStandardMaterial;
    lobe: BrainLobe;
    startPos: THREE.Vector3;
    targetPos: THREE.Vector3;
    delay: number;
  }[];
}

interface LightningArcRecord {
  group: THREE.Group;
  tubeMat: THREE.MeshBasicMaterial;
  innerMat: THREE.MeshBasicMaterial;
  branchMats: THREE.MeshBasicMaterial[];
  startTime: number;
  duration: number; // in seconds
}

export function NeuralBrainCanvas({
  className = "",
  userSeed,
}: {
  className?: string;
  userSeed?: string;
} = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { telemetry } = useTelemetry(2500);
  const { profileName } = useAppState();

  const activeUserSeed = userSeed || profileName || "growforge-default-operator";

  const [selectedNode, setSelectedNode] = useState<BrainNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<BrainNode | null>(null);
  const [isAutoRotating, setIsAutoRotating] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [filterLobe, setFilterLobe] = useState<BrainLobe | "all">("all");
  const [dynamicTopology, setDynamicTopology] = useState<{ nodes: BrainNode[]; axons: BrainAxon[] }>({
    nodes: [],
    axons: [],
  });
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    type: DeletableNodeType;
    endpoint: string;
  } | null>(null);

  const loadDynamicTopology = useCallback(async () => {
    try {
      const res = await fetch("/api/mcp/connect");
      if (res.ok) {
        const data = await res.json();
        if (data.topology) {
          // Reposition dynamic nodes onto the procedural shell coordinates for this user
          const ambientPositions = ambientNodePositionsRef.current;
          const positionedNodes = ((data.topology.nodes as BrainNode[]) || []).map((node) => {
            const anchorPos = calculateNodeBrainPosition(
              node.id,
              node.lobe || "neural_core",
              node.hemisphere || "center",
              activeUserSeed
            );

            // Pull toward the nearest ambient web point so a mathematically valid
            // anchor position doesn't render floating alone in a sparse patch of
            // the web — real nodes should visually sit inside the structure.
            let pos = anchorPos;
            if (ambientPositions.length > 0) {
              let nearest = ambientPositions[0];
              let nearestDist = Infinity;
              for (const candidate of ambientPositions) {
                const dx = candidate[0] - anchorPos[0];
                const dy = candidate[1] - anchorPos[1];
                const dz = candidate[2] - anchorPos[2];
                const dist = dx * dx + dy * dy + dz * dz;
                if (dist < nearestDist) {
                  nearestDist = dist;
                  nearest = candidate;
                }
              }
              const blend = 0.55;
              pos = [
                anchorPos[0] + (nearest[0] - anchorPos[0]) * blend,
                anchorPos[1] + (nearest[1] - anchorPos[1]) * blend,
                anchorPos[2] + (nearest[2] - anchorPos[2]) * blend,
              ];
            }

            return {
              ...node,
              position: pos,
            };
          });

          setDynamicTopology({
            nodes: positionedNodes,
            axons: (data.topology.axons as BrainAxon[]) || [],
          });
        }
      }
    } catch {
      // Non-blocking
    }
  }, [activeUserSeed]);

  async function handleConfirmDelete(keepCredentialsOnFile: boolean) {
    if (!deleteTarget) return;
    try {
      const res = await fetch(deleteTarget.endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keepOnFile: keepCredentialsOnFile }),
      });
      if (res.ok) {
        await loadDynamicTopology();
        setSelectedNode(null);
        setHoveredNode(null);
        setDeleteTarget(null);
      }
    } catch (err) {
      console.error("[NeuralBrainCanvas] failed to disconnect/remove node:", err);
    }
  }

  function handleRequestDelete(active: BrainNode) {
    if (active.id === "cap:higgsfield") {
      setDeleteTarget({
        id: "higgsfield",
        name: "Higgsfield AI",
        type: "capability_key",
        endpoint: "/api/vault/system/higgsfield",
      });
    } else if (active.id.startsWith("cap:model:")) {
      const modelId = active.id.replace(/^cap:model:/, "");
      setDeleteTarget({
        id: modelId,
        name: active.name,
        type: "ai_model",
        endpoint: `/api/vault/system/${encodeURIComponent(modelId)}`,
      });
    } else if (active.id.startsWith("mcp-node:") || active.kind === "tendril" || active.kind === "connector") {
      const serverId = active.id.startsWith("mcp-node:")
        ? active.id.split(":")[1]
        : (active as unknown as { pluginId?: string }).pluginId || active.id;
      setDeleteTarget({
        id: serverId,
        name: active.name,
        type: "byo_mcp",
        endpoint: `/api/mcp/connect?id=${encodeURIComponent(serverId)}`,
      });
    }
  }

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

  // Department nodes appear ONLY when actively executing a job matching their lobe/id
  const activeDepartmentNodes = useMemo(() => {
    if (telemetry.executionState !== "processing") {
      return [];
    }
    const nodes: BrainNode[] = [];
    const activeLobe = telemetry.activeLobe;
    const activeNodeId = telemetry.activeNodeId;

    Object.values(DEPARTMENT_NODE_DEFINITIONS).forEach((dept) => {
      const isLobeMatch = activeLobe && dept.lobe === activeLobe;
      const isNodeMatch = activeNodeId && (dept.id === activeNodeId || dept.id === `dept:${activeNodeId}`);
      if (isLobeMatch || isNodeMatch) {
        // Adjust position with user seed
        const seededPos = calculateNodeBrainPosition(dept.id, dept.lobe, dept.hemisphere, activeUserSeed);
        nodes.push({
          ...dept,
          position: seededPos,
        });
      }
    });
    return nodes;
  }, [telemetry.executionState, telemetry.activeLobe, telemetry.activeNodeId, activeUserSeed]);

  const activeDepartmentAxons = useMemo(() => {
    return activeDepartmentNodes.map((dept) => ({
      id: `ax-hq-${dept.id}`,
      source: "hq",
      target: dept.id,
      color: "#FFC432", // Earned gold for actively executing department axons
      curveOffset: [
        dept.position[0] * 0.25,
        dept.position[1] * 0.25 + 6,
        dept.position[2] * 0.25,
      ] as [number, number, number],
    }));
  }, [activeDepartmentNodes]);

  const allDynamicNodes = useMemo(
    () => [...activeDepartmentNodes, ...dynamicTopology.nodes],
    [activeDepartmentNodes, dynamicTopology.nodes]
  );

  const allDynamicAxons = useMemo(
    () => [...activeDepartmentAxons, ...dynamicTopology.axons],
    [activeDepartmentAxons, dynamicTopology.axons]
  );

  const allNodes = useMemo(() => [...INITIAL_NODES, ...allDynamicNodes], [allDynamicNodes]);
  const nodeMapRef = useRef<Map<string, BrainNode>>(new Map(allNodes.map((n) => [n.id, n])));
  useEffect(() => {
    nodeMapRef.current = new Map(allNodes.map((n) => [n.id, n]));
  }, [allNodes]);

  // Three.js internal instances
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const brainGroupRef = useRef<THREE.Group | null>(null);
  const dynamicGroupRef = useRef<THREE.Group | null>(null);
  const clockRef = useRef<THREE.Clock | null>(null);

  // Persistent Camera Target
  const cameraTargetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, -2, 0));

  // Node records map
  const meshesRef = useRef<Map<string, NodeMeshRecord>>(new Map());
  const particleSystemsRef = useRef<{ curve: THREE.CatmullRomCurve3; points: THREE.Points; progress: number; speed: number }[]>([]);
  const dynamicParticleSystemsRef = useRef<{ curve: THREE.CatmullRomCurve3; points: THREE.Points; progress: number; speed: number }[]>([]);

  // Ambient Procedural Connective Web Ref
  const ambientWebRef = useRef<AmbientWebRecord | null>(null);
  // Raw ambient node positions, kept separately (and set synchronously at
  // generation time) so loadDynamicTopology can pull real nodes toward the
  // nearest one — otherwise a mathematically-correct anchor position can still
  // land in a locally sparse patch of the ambient web and look disconnected.
  const ambientNodePositionsRef = useRef<[number, number, number][]>([]);

  // Lightning Arc Ref & Trigger
  const activeLightningRef = useRef<LightningArcRecord | null>(null);
  const triggerLightningRef = useRef<((lobe?: BrainLobe, activePos?: [number, number, number]) => void) | null>(null);
  const prevExecutionStateRef = useRef(telemetry.executionState);
  const prevJobIdRef = useRef(telemetry.activeJobId);

  // Persistent interaction & state refs to avoid tearing down WebGL on state updates
  const isAutoRotatingRef = useRef(isAutoRotating);
  const selectedNodeRef = useRef<BrainNode | null>(selectedNode);
  const hoveredNodeRef = useRef<BrainNode | null>(hoveredNode);
  const telemetryRef = useRef(telemetry);
  const filterLobeRef = useRef<BrainLobe | "all">(filterLobe);

  // Camera Intro Animation Refs (Plays once per mount)
  const introStartTimeRef = useRef<number | null>(null);
  const introDoneRef = useRef<boolean>(false);

  useEffect(() => {
    isAutoRotatingRef.current = isAutoRotating;
    selectedNodeRef.current = selectedNode;
    hoveredNodeRef.current = hoveredNode;
    telemetryRef.current = telemetry;
    filterLobeRef.current = filterLobe;
  }, [isAutoRotating, selectedNode, hoveredNode, telemetry, filterLobe]);

  // Event trigger for the one-off lightning arc on new job start
  useEffect(() => {
    const isProcessing = telemetry.executionState === "processing";
    const wasProcessing = prevExecutionStateRef.current === "processing";
    const jobChanged = telemetry.activeJobId && telemetry.activeJobId !== prevJobIdRef.current;

    if (isProcessing && (!wasProcessing || jobChanged)) {
      const activeDeptPos = activeDepartmentNodes[0]?.position;
      triggerLightningRef.current?.(telemetry.activeLobe, activeDeptPos);
    }

    prevExecutionStateRef.current = telemetry.executionState;
    prevJobIdRef.current = telemetry.activeJobId;
  }, [telemetry.executionState, telemetry.activeJobId, telemetry.activeLobe, activeDepartmentNodes]);

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

  // Helper to construct a two-layer translucent glass node around a glowing core
  const buildTwoLayerNodeMesh = useCallback(
    (node: BrainNode): NodeMeshRecord => {
      const group = new THREE.Group();
      group.position.set(...node.position);

      // 1. Outer Translucent / Transmissive Glass Shell (MeshPhysicalMaterial)
      const outerGeo = new THREE.SphereGeometry(node.size, 32, 32);
      const outerMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(node.color),
        emissive: new THREE.Color(node.emissive || node.color),
        emissiveIntensity: 0.12,
        roughness: 0.1,
        metalness: 0.05,
        transmission: 0.88,
        thickness: 1.8,
        ior: 1.45,
        reflectivity: 0.7,
        clearcoat: 1.0,
        clearcoatRoughness: 0.08,
        transparent: true,
        opacity: 0.95,
        attenuationColor: new THREE.Color(node.color),
        attenuationDistance: node.size * 2.5,
      });
      const outerMesh = new THREE.Mesh(outerGeo, outerMat);
      outerMesh.userData = { nodeId: node.id };
      group.add(outerMesh);

      // 2. Inner Glowing Core Sphere
      const coreSize = node.size * 0.46;
      const coreGeo = new THREE.SphereGeometry(coreSize, 24, 24);
      const coreMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color("#FFFFFF"),
        emissive: new THREE.Color(node.emissive || node.color),
        emissiveIntensity: node.kind === "core" ? 2.4 : 1.8,
        roughness: 0.15,
        metalness: 0.2,
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.userData = { nodeId: node.id };
      group.add(coreMesh);

      // 3. Subtle Bioluminescent Halo
      const haloTex = createHaloTexture(node.emissive || node.color);
      const haloMat = new THREE.SpriteMaterial({
        map: haloTex,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.75,
      });
      const halo = new THREE.Sprite(haloMat);
      const haloScale = node.size * 3.6;
      halo.scale.set(haloScale, haloScale, 1);
      group.add(halo);

      return { group, outerMesh, outerMat, coreMesh, coreMat, halo, baseSize: node.size };
    },
    [createHaloTexture]
  );

  // 1. Initial Scene Setup — Mounts ONLY ONCE
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 1. Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.fog = new THREE.FogExp2(0x030712, 0.0022);

    // 2. Camera setup with tight macro framing for intro reveal
    const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 1500);
    const INTRO_DURATION = 2.4; // 2.4s dolly back
    const FORMATION_DURATION = 3.4; // ambient web: scattered starfield -> brain silhouette
    const FORMATION_MAX_DELAY = 0.9; // per-node stagger so convergence isn't perfectly synced
    const SPIRAL_TURNS = 1.35; // how much each node spirals as it converges
    const macroPos = new THREE.Vector3(-14, 16, 44);
    const macroTarget = new THREE.Vector3(0, 8, 10);
    const restingPos = new THREE.Vector3(0, 5, 260);
    const restingTarget = new THREE.Vector3(0, -2, 0);

    camera.position.copy(macroPos);
    cameraTargetRef.current.copy(macroTarget);
    camera.lookAt(macroTarget);
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
    const ambientLight = new THREE.AmbientLight(0x0a192f, 2.2);
    scene.add(ambientLight);

    const coreLight = new THREE.PointLight(0x0078FF, 3.8, 250);
    coreLight.position.set(0, 10, 10);
    scene.add(coreLight);

    const leftLight = new THREE.PointLight(0x8b5cf6, 2.2, 220);
    leftLight.position.set(-60, 20, 20);
    scene.add(leftLight);

    const rightLight = new THREE.PointLight(0x10b981, 2.2, 220);
    rightLight.position.set(60, 20, 20);
    scene.add(rightLight);

    // 6. LAYER 1: Ambient Procedural Connective Web (Nodes + Thin Dim Curved Tubes)
    // 480 nodes (up from 210) is the density needed for the dual-hemisphere silhouette
    // to actually read as solid rather than a sparse dot scatter — verified live, not
    // assumed. Node material was switched off MeshPhysicalMaterial transmission (an
    // expensive per-object render pass) to a plain MeshStandardMaterial to afford this
    // node count without a frame-rate regression; these are small background nodes,
    // not the hero interactive ones, so the visual cost of losing glass transmission
    // is minor next to the density gain.
    const webData = generateProceduralBrainWeb(activeUserSeed, 480);
    const webNodePositions: [number, number, number][] = webData.nodes.map((n) => n.position);
    // Imperative Three.js ref write inside the mount effect, same pattern as
    // meshesRef/ambientWebRef below; flagged only because loadDynamicTopology's
    // closure also reads this ref.
    // eslint-disable-next-line react-hooks/immutability
    ambientNodePositionsRef.current = webNodePositions;
    const ambientTubesGroup = new THREE.Group();
    brainGroup.add(ambientTubesGroup);

    const ambientNodesGroup = new THREE.Group();
    brainGroup.add(ambientNodesGroup);

    const ambientTubes: AmbientWebRecord["tubes"] = [];
    const ambientNodes: AmbientWebRecord["nodes"] = [];

    // Build ambient web connective tubes
    webData.links.forEach((link) => {
      const p1 = new THREE.Vector3(...link.p1);
      const mid = new THREE.Vector3(...link.mid);
      const p2 = new THREE.Vector3(...link.p2);

      const curve = new THREE.CatmullRomCurve3([p1, mid, p2]);
      const tubeGeo = new THREE.TubeGeometry(curve, 16, 0.16, 6, false);
      const baseOpacity = link.isInterHemisphere ? 0.14 : 0.22;

      const tubeMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color("#0078FF"),
        transparent: true,
        opacity: baseOpacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      ambientTubesGroup.add(tubeMesh);
      ambientTubes.push({
        mesh: tubeMesh,
        mat: tubeMat,
        lobe: link.lobe,
        baseOpacity,
      });
    });

    // Build ambient web mini-nodes (small shells around glowing cores). Each one starts
    // scattered like a distant starfield and converges/spirals into its real anatomical
    // position during the formation window handled in the animation loop below.
    webData.nodes.forEach((wNode) => {
      const targetPos = new THREE.Vector3(...wNode.position);

      // Scattered starfield origin: a wide, roughly spherical cloud well outside the
      // brain's own ~90-unit envelope, so points visibly travel/spiral inward.
      const scatterRadius = 160 + Math.random() * 220;
      const scatterTheta = Math.acos(2 * Math.random() - 1);
      const scatterPhi = Math.random() * Math.PI * 2;
      const startPos = new THREE.Vector3(
        scatterRadius * Math.sin(scatterTheta) * Math.cos(scatterPhi),
        scatterRadius * Math.cos(scatterTheta) * 0.6,
        scatterRadius * Math.sin(scatterTheta) * Math.sin(scatterPhi)
      );

      const g = new THREE.Group();
      g.position.copy(startPos);

      const oGeo = new THREE.SphereGeometry(wNode.size, 12, 12);
      const oMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color("#0078FF"),
        emissive: new THREE.Color("#0078FF"),
        emissiveIntensity: 0.12,
        roughness: 0.35,
        metalness: 0.1,
        transparent: true,
        opacity: 0.55,
      });
      const oMesh = new THREE.Mesh(oGeo, oMat);
      g.add(oMesh);

      const cGeo = new THREE.SphereGeometry(wNode.size * 0.45, 10, 10);
      const cMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color("#FFFFFF"),
        emissive: new THREE.Color("#60a5fa"),
        emissiveIntensity: 1.4,
      });
      const cMesh = new THREE.Mesh(cGeo, cMat);
      g.add(cMesh);

      ambientNodesGroup.add(g);
      ambientNodes.push({
        group: g,
        outerMesh: oMesh,
        outerMat: oMat,
        coreMesh: cMesh,
        coreMat: cMat,
        lobe: wNode.lobe,
        startPos,
        targetPos,
        delay: Math.random() * FORMATION_MAX_DELAY,
      });
    });

    ambientWebRef.current = {
      tubesGroup: ambientTubesGroup,
      nodesGroup: ambientNodesGroup,
      tubes: ambientTubes,
      nodes: ambientNodes,
    };

    // 7. LAYER 2: Real Interactive Nodes (HQ Core & Static Base)
    const meshesMap = new Map<string, NodeMeshRecord>();

    INITIAL_NODES.forEach((node) => {
      const nodeRecord = buildTwoLayerNodeMesh(node);
      brainGroup.add(nodeRecord.group);
      meshesMap.set(node.id, nodeRecord);
    });
    meshesRef.current = meshesMap;

    // 8. Build Initial Static Axon Splines & Action Potential Particles
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
        size: 2.4,
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

    // 9. Lightning Arc Generator Trigger
    triggerLightningRef.current = (targetLobe?: BrainLobe, activePos?: [number, number, number]) => {
      if (!sceneRef.current || !brainGroupRef.current) return;

      // Clean up previous bolt if still active
      if (activeLightningRef.current) {
        brainGroupRef.current.remove(activeLightningRef.current.group);
        activeLightningRef.current.group.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            if (obj.material instanceof THREE.Material) obj.material.dispose();
          }
        });
        activeLightningRef.current = null;
      }

      const boltGroup = new THREE.Group();
      brainGroupRef.current.add(boltGroup);

      // Determine key waypoints
      const waypoints: THREE.Vector3[] = [new THREE.Vector3(0, 8, 10)]; // HQ Core

      if (activePos) {
        waypoints.push(new THREE.Vector3(...activePos));
      } else {
        // Frontal waypoint
        waypoints.push(new THREE.Vector3(-24, 18, 20));
      }

      // Add peripheral web waypoints in the target lobe
      const webNodes = ambientWebRef.current?.nodes || [];
      const matchingWeb = webNodes.filter((n) => !targetLobe || n.lobe === targetLobe);
      if (matchingWeb.length > 0) {
        const randSample1 = matchingWeb[Math.floor(Math.random() * matchingWeb.length)];
        waypoints.push(randSample1.group.position.clone());
        const randSample2 = matchingWeb[Math.floor(Math.random() * matchingWeb.length)];
        if (randSample2 !== randSample1) {
          waypoints.push(randSample2.group.position.clone());
        }
      } else {
        waypoints.push(new THREE.Vector3(44, 18, 24));
        waypoints.push(new THREE.Vector3(-38, -14, 28));
      }

      // Recursive fractal midpoint displacement algorithm
      function subdivideSegment(pA: THREE.Vector3, pB: THREE.Vector3, depth: number, maxOffset: number): THREE.Vector3[] {
        if (depth <= 0) return [pA, pB];
        const mid = new THREE.Vector3().addVectors(pA, pB).multiplyScalar(0.5);
        const dir = new THREE.Vector3().subVectors(pB, pA);
        const perp = new THREE.Vector3(-dir.y, dir.x + dir.z, -dir.x).normalize();
        const randOffset = (Math.random() - 0.5) * 2 * maxOffset;
        mid.addScaledVector(perp, randOffset);

        const left = subdivideSegment(pA, mid, depth - 1, maxOffset * 0.55);
        const right = subdivideSegment(mid, pB, depth - 1, maxOffset * 0.55);
        return [...left.slice(0, -1), ...right];
      }

      const jaggedPoints: THREE.Vector3[] = [];
      for (let w = 0; w < waypoints.length - 1; w++) {
        const seg = subdivideSegment(waypoints[w], waypoints[w + 1], 3, 3.8);
        if (w === 0) {
          jaggedPoints.push(...seg);
        } else {
          jaggedPoints.push(...seg.slice(1));
        }
      }

      // Main Outer Bolt (Electric Blue)
      const mainCurve = new THREE.CatmullRomCurve3(jaggedPoints);
      const tubeGeo = new THREE.TubeGeometry(mainCurve, jaggedPoints.length * 3, 0.4, 6, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color("#00F0FF"),
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
      });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      boltGroup.add(tubeMesh);

      // Core Hot White Inner Arc
      const innerGeo = new THREE.TubeGeometry(mainCurve, jaggedPoints.length * 3, 0.18, 5, false);
      const innerMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color("#FFFFFF"),
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
      });
      const innerMesh = new THREE.Mesh(innerGeo, innerMat);
      boltGroup.add(innerMesh);

      // Secondary Branching Forks
      const branchMats: THREE.MeshBasicMaterial[] = [];
      if (jaggedPoints.length > 8) {
        for (let b = 0; b < 2; b++) {
          const forkIdx = Math.floor(jaggedPoints.length * (0.28 + b * 0.38));
          const forkStart = jaggedPoints[forkIdx];
          const forkEnd = forkStart.clone().add(
            new THREE.Vector3(
              (Math.random() - 0.5) * 26,
              (Math.random() - 0.5) * 26,
              (Math.random() - 0.5) * 26
            )
          );
          const branchPts = subdivideSegment(forkStart, forkEnd, 2, 2.4);
          const bCurve = new THREE.CatmullRomCurve3(branchPts);
          const bGeo = new THREE.TubeGeometry(bCurve, branchPts.length * 2, 0.22, 5, false);
          const bMat = tubeMat.clone();
          const bMesh = new THREE.Mesh(bGeo, bMat);
          boltGroup.add(bMesh);
          branchMats.push(bMat);
        }
      }

      activeLightningRef.current = {
        group: boltGroup,
        tubeMat,
        innerMat,
        branchMats,
        startTime: clockRef.current?.getElapsedTime() || 0,
        duration: 0.38, // 380ms fast flash
      };
    };

    // 10. OrbitControls with exact boundary parameters
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.minDistance = 140;
    controls.maxDistance = 900;
    controls.enablePan = true;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.copy(macroTarget);
    controls.update();
    controlsRef.current = controls;

    // Raycasting for interactive hover and click node selection (Layer 2 real nodes only)
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    let isDown = false;
    let downX = 0;
    let downY = 0;

    const onPointerDown = (e: PointerEvent) => {
      isDown = true;
      downX = e.clientX;
      downY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!container) return;
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      // Hover Raycasting against real outer glass meshes only
      raycaster.setFromCamera(mouse, camera);
      const meshesToTest = Array.from(meshesRef.current.values()).map((v) => v.outerMesh);
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

    const onPointerUp = (e: PointerEvent) => {
      if (!container) return;
      const wasDown = isDown;
      isDown = false;

      // Click node selection if not dragging
      const dist = Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY);
      if (wasDown && dist < 6) {
        raycaster.setFromCamera(mouse, camera);
        const meshesToTest = Array.from(meshesRef.current.values()).map((v) => v.outerMesh);
        const intersects = raycaster.intersectObjects(meshesToTest);

        if (intersects.length > 0) {
          const id = intersects[0].object.userData.nodeId;
          const found = nodeMapRef.current.get(id) || null;
          selectedNodeRef.current = found;
          setSelectedNode(found);
        }
      }
    };

    const dom = renderer.domElement;
    dom.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    // 11. Animation Loop
    let animationFrameId: number;
    const clock = new THREE.Clock();
    clockRef.current = clock;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Camera Intro Reveal Animation (dollying back from tight macro to resting)
      if (introStartTimeRef.current === null) {
        introStartTimeRef.current = elapsedTime;
      }
      if (!introDoneRef.current) {
        const introElapsed = elapsedTime - introStartTimeRef.current;
        const progress = Math.min(1, introElapsed / INTRO_DURATION);
        // Smooth cubic ease-out
        const ease = 1 - Math.pow(1 - progress, 3);

        camera.position.lerpVectors(macroPos, restingPos, ease);
        const currentLookAt = new THREE.Vector3().lerpVectors(macroTarget, restingTarget, ease);
        camera.lookAt(currentLookAt);
        controls.target.copy(currentLookAt);

        if (progress >= 1) {
          introDoneRef.current = true;
          controls.enabled = true;
        } else {
          controls.enabled = false;
        }
      }

      // Continuous unbroken sideways turntable yaw rotation
      if (isAutoRotatingRef.current) {
        brainGroup.rotation.y += 0.0012;
      }
      brainGroup.position.y = Math.sin(elapsedTime * 0.7) * 1.6;

      // Update OrbitControls smooth damping
      if (controlsRef.current && introDoneRef.current) {
        controlsRef.current.update();
      }

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

      // Update Ambient Connective Web Layer (Activity-Based Earned Gold Lighting)
      const currentTelemetry = telemetryRef.current;
      const isProcessing = currentTelemetry.executionState === "processing";
      const activeLobe = currentTelemetry.activeLobe;

      if (ambientWebRef.current) {
        const { tubes, nodes } = ambientWebRef.current;

        // Overall web-formation progress (0 = still a scattered starfield, 1 = fully
        // resolved brain). Tubes fade in against this so connective tissue only
        // appears once the nodes it links have mostly arrived — they never visibly
        // stretch or snap, they just aren't drawn yet.
        const webFormationProgress = Math.min(1, elapsedTime / (FORMATION_DURATION + FORMATION_MAX_DELAY));
        const tubeRevealFactor = Math.max(0, Math.min(1, (webFormationProgress - 0.45) / 0.4));

        // Ambient Tubes
        tubes.forEach((tube) => {
          const isActiveLobe = isProcessing && activeLobe && tube.lobe === activeLobe;
          if (isActiveLobe) {
            // Earned Gold glowing tube
            tube.mat.color.set("#FFC432");
            tube.mat.opacity = (0.48 + Math.sin(elapsedTime * 4.0) * 0.12) * tubeRevealFactor;
          } else {
            // Dim electric blue resting tube
            tube.mat.color.set("#0078FF");
            tube.mat.opacity = tube.baseOpacity * (Math.sin(elapsedTime * 1.4) * 0.15 + 0.9) * tubeRevealFactor;
          }
        });

        // Ambient Nodes — spiral-converge from their scattered starfield origin into
        // anatomical position, staggered per-node so the formation feels organic
        // rather than perfectly synchronized.
        nodes.forEach((wNode) => {
          const nodeElapsed = Math.max(0, elapsedTime - wNode.delay);
          const rawProgress = Math.min(1, nodeElapsed / FORMATION_DURATION);
          const ease = 1 - Math.pow(1 - rawProgress, 3);

          if (rawProgress < 1) {
            const lerped = new THREE.Vector3().lerpVectors(wNode.startPos, wNode.targetPos, ease);
            // Spiral: rotate the still-remaining offset around the target's vertical
            // axis, unwinding to zero as the node arrives.
            const offset = new THREE.Vector3().subVectors(lerped, wNode.targetPos);
            const spinAngle = (1 - ease) * SPIRAL_TURNS * Math.PI * 2;
            const cos = Math.cos(spinAngle);
            const sin = Math.sin(spinAngle);
            const rx = offset.x * cos - offset.z * sin;
            const rz = offset.x * sin + offset.z * cos;
            wNode.group.position.set(wNode.targetPos.x + rx, lerped.y, wNode.targetPos.z + rz);
            wNode.group.visible = true;
          } else if (!wNode.group.visible || wNode.group.position.distanceTo(wNode.targetPos) > 0.01) {
            wNode.group.position.copy(wNode.targetPos);
          }

          const isActiveLobe = isProcessing && activeLobe && wNode.lobe === activeLobe;
          if (isActiveLobe) {
            wNode.coreMat.emissive.set("#FFC432");
            wNode.coreMat.emissiveIntensity = 2.4 + Math.sin(elapsedTime * 4.0) * 0.6;
            wNode.outerMat.emissive.set("#FFC432");
            wNode.outerMat.emissiveIntensity = 0.35;
          } else {
            wNode.coreMat.emissive.set("#60a5fa");
            wNode.coreMat.emissiveIntensity = 1.3 + Math.sin(elapsedTime * 1.4) * 0.2;
            wNode.outerMat.emissive.set("#0078FF");
            wNode.outerMat.emissiveIntensity = 0.08;
          }
        });
      }

      // Update Lightning Arc Animation
      if (activeLightningRef.current) {
        const bolt = activeLightningRef.current;
        const boltAge = elapsedTime - bolt.startTime;
        const progress = boltAge / bolt.duration;

        if (progress >= 1) {
          brainGroup.remove(bolt.group);
          bolt.group.traverse((obj) => {
            if (obj instanceof THREE.Mesh) {
              obj.geometry.dispose();
              if (obj.material instanceof THREE.Material) obj.material.dispose();
            }
          });
          activeLightningRef.current = null;
        } else {
          // Lightning phases: intense flicker then rapid fade out
          let opacity = 1.0;
          if (progress < 0.3) {
            // Rapid forward flash / intense ionization
            opacity = 0.85 + Math.random() * 0.3;
          } else if (progress < 0.65) {
            // Electric crackle flicker
            opacity = 0.7 + Math.random() * 0.35;
          } else {
            // Rapid decay
            opacity = (1 - progress) * 2.8;
          }

          bolt.tubeMat.opacity = Math.max(0, Math.min(1, opacity));
          bolt.innerMat.opacity = Math.max(0, Math.min(1, opacity * 1.2));
          bolt.branchMats.forEach((bm) => {
            bm.opacity = Math.max(0, Math.min(1, opacity * 0.85));
          });
        }
      }

      // Pulse bioluminescent halos & handle telemetry highlights for real nodes
      const currentHoveredId = hoveredNodeRef.current?.id;
      const currentSelectedId = selectedNodeRef.current?.id;
      const currentFilter = filterLobeRef.current;

      meshesRef.current.forEach(({ outerMesh, outerMat, coreMat, halo, baseSize }, id) => {
        const nodeObj = nodeMapRef.current.get(id);
        const isHovered = currentHoveredId === id;
        const isSelected = currentSelectedId === id;
        const isFiltered = currentFilter !== "all" && nodeObj?.lobe !== currentFilter;
        const isActiveNode =
          nodeObj &&
          isProcessing &&
          (currentTelemetry.activeNodeId === nodeObj.id || currentTelemetry.activeLobe === nodeObj.lobe);

        outerMesh.visible = !isFiltered;

        // Earned gold emissive on active nodes (glowing core + glass shell transmission)
        if (isActiveNode) {
          coreMat.emissive.set("#FFC432");
          coreMat.emissiveIntensity = 3.2;
          outerMat.emissive.set("#FFC432");
          outerMat.emissiveIntensity = 0.45;
        } else {
          coreMat.emissive.set(nodeObj?.emissive || "#60a5fa");
          coreMat.emissiveIntensity = nodeObj?.kind === "core" ? 2.4 : 1.8;
          outerMat.emissive.set(nodeObj?.emissive || nodeObj?.color || "#0078FF");
          outerMat.emissiveIntensity = 0.12;
        }

        const pulse = Math.sin(elapsedTime * 2 + baseSize) * 0.15 + 1;
        const scale = baseSize * (isHovered || isSelected ? 4.6 : 3.6) * pulse * (isFiltered ? 0.3 : 1);
        halo.scale.set(scale, scale, 1);

        if (isActiveNode) {
          halo.scale.multiplyScalar(1.35);
        }
      });

      renderer.render(scene, camera);
    };

    animate();

    // 12. True Edge-to-Edge Dynamic ResizeObserver
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
      dom.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      controls.dispose();
      renderer.dispose();
      if (container && dom) {
        container.removeChild(dom);
      }
    };
  }, [createHaloTexture, buildTwoLayerNodeMesh, activeUserSeed]);

  // 2. Incremental Dynamic Topology Updates (Adds/Removes BYO-MCP and capability nodes without resetting Camera/Zoom)
  useEffect(() => {
    const dynamicGroup = dynamicGroupRef.current;
    if (!dynamicGroup) return;

    // Clear previous dynamic meshes from dynamicGroup
    while (dynamicGroup.children.length > 0) {
      const child = dynamicGroup.children[0];
      dynamicGroup.remove(child);
      child.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (obj.material instanceof THREE.Material) obj.material.dispose();
        }
      });
    }

    // Clean up dynamic entries in meshesRef and dynamicParticleSystemsRef
    allDynamicNodes.forEach((node) => {
      meshesRef.current.delete(node.id);
    });
    dynamicParticleSystemsRef.current = [];

    if (allDynamicNodes.length === 0) return;

    // Build Dynamic Two-Layer Somas
    allDynamicNodes.forEach((node) => {
      const nodeRecord = buildTwoLayerNodeMesh(node);
      dynamicGroup.add(nodeRecord.group);
      meshesRef.current.set(node.id, nodeRecord);
    });

    // Build Dynamic Axons (glowing amber/blue tubes)
    const dynamicParticles: { curve: THREE.CatmullRomCurve3; points: THREE.Points; progress: number; speed: number }[] = [];

    allDynamicAxons.forEach((axon) => {
      const sourceNode = nodeMapRef.current.get(axon.source);
      const targetNode = nodeMapRef.current.get(axon.target);
      if (!sourceNode || !targetNode) return;

      const p1 = new THREE.Vector3(...sourceNode.position);
      const p3 = new THREE.Vector3(...targetNode.position);
      const mid = new THREE.Vector3().addVectors(p1, p3).multiplyScalar(0.5);
      mid.add(new THREE.Vector3(...axon.curveOffset));

      const curve = new THREE.CatmullRomCurve3([p1, mid, p3]);
      const tubeGeometry = new THREE.TubeGeometry(curve, 32, 0.48, 8, false);
      const tubeMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(axon.color),
        transparent: true,
        opacity: 0.65,
      });

      const tubeMesh = new THREE.Mesh(tubeGeometry, tubeMaterial);
      dynamicGroup.add(tubeMesh);

      const particleCount = 4;
      const particleGeo = new THREE.BufferGeometry();
      const positions = new Float32Array(particleCount * 3);
      particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

      const particleMat = new THREE.PointsMaterial({
        color: new THREE.Color(axon.color === "#FFC432" ? 0xffea79 : 0x22d3ee),
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
  }, [allDynamicNodes, allDynamicAxons, buildTwoLayerNodeMesh]);

  // Reset Camera View & Brain Rotation (Explicit user action only)
  const handleResetView = () => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(0, 5, 260);
      cameraTargetRef.current.set(0, -2, 0);
      controlsRef.current.target.copy(cameraTargetRef.current);
      controlsRef.current.update();
    }
    if (brainGroupRef.current) {
      brainGroupRef.current.rotation.set(0, 0, 0);
    }
    setSelectedNode(null);
  };

  return (
    <div
      className={`relative w-full h-full overflow-hidden bg-[#030712] text-slate-100 transition-all duration-300 ${
        isFullscreen
          ? "fixed inset-0 z-50 w-screen h-screen overflow-hidden rounded-none m-0 p-0"
          : "inset-0 w-full h-full"
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
                  Procedural Cortical WebGL
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
                ? "text-gold"
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

                {/* Remove / Disconnect Action for dynamic connectors and tendrils */}
                {(active.kind === "connector" || active.kind === "tendril") && (
                  <div className="pt-2 border-t border-slate-800 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleRequestDelete(active)}
                      className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-400 hover:bg-red-500/20 hover:border-red-500/50 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" /> Remove
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Shared Node Deletion / Credential Retention Modal */}
      {deleteTarget && (
        <NodeDeleteConfirmModal
          isOpen={Boolean(deleteTarget)}
          nodeName={deleteTarget.name}
          nodeType={deleteTarget.type}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
}
