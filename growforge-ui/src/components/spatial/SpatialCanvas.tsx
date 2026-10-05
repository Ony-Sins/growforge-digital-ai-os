"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GraphNode, SpatialGraphData } from "@/lib/spatial/obsidianReader";
import {
  CORE_DEPTH,
  type ZoomTierName,
  layoutSpatialGlobe,
  createCoreOrbitals,
  getStarDotTexture,
} from "./spatialGeometry";
import { BrainField } from "./brain/BrainField";
import { CoreLightning } from "./brain/coreLightning";
import type { BrainDrive } from "./brain/brainUniforms";
import { NeutronCoreEngine } from "./neutronCore/NeutronCoreEngine";
import { advanceDive, diveDistance, diveLandingOpacity, diveContentOpacity, diveMembraneLight } from "./dive/diveJourney";
import { DiveNetworkLayer } from "./dive/DiveNetworkLayer";
import { DiveOverview } from "./dive/DiveOverview";
import { DIVE_OPEN_EVENT, DIVE_SCOPE_EVENT, type DiveLensId, type DiveScopeDetail } from "@/lib/diveLenses";
import { parseSurfaceLocation, sameSurface, withSurface, type SurfaceLocation } from "@/lib/surfaceLocation";
import type { NeutronCoreState } from "./neutronCore/neutronCoreTypes";
import { SpatialHud } from "./SpatialHud";
import { CoreZoomTier } from "./CoreZoomTier";
import { NoteReaderModal } from "./NoteReaderModal";
import { BusinessHubModal } from "./BusinessHubModal";
import { useAppState } from "@/lib/appState";

interface SpatialTelemetryData {
  activeJobCount: number;
  totalJobCount: number;
  pendingApprovals?: number;
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

/** Lens: 38 (was 48) shows the whole scene ~1.3x larger at the same distances, so every threshold holds. */
const BASE_FOV = 38;
/** DIVE IN: Explore end point (manual scroll stops here), plunge length, and the dive space camera. */
const EXPLORE_END_DIST = 136;
const DIVE_PLUNGE_TO = 8; // through the core's surface
const DIVE_LAYER_MAX = 260;
const CORE_CAMERA_DIST = 880;
/** Named records soft-reveal between these distances (fixed, independent of the arrival point). */
const NAMES_REVEAL_FULL = 272;
/** Explore arrival = exactly where the named records have been revealed. */
const BRAIN_CAMERA_DIST = NAMES_REVEAL_FULL;
const MISSIONS_CAMERA_DIST = 90;
const BRAIN_JOURNEY_MS = 7600; // long enough for the same particles to link up gradually
/** Extra envelope speed once the camera is closer than BRAIN — the "travelling inward" feel. */
const DEEP_APPROACH_SPEED = 0.62;

// BRAIN emergence is a pure function of camera distance, so it plays identically
// for the guided dolly and for manual wheel/drag zoom, and reverses on the way out.
const REVEAL_START_DIST = 800;
const REVEAL_END_DIST = 350;

const smooth01 = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Centered dolly easing: brief settle, steady push, long controlled deceleration. */
function dollyEase(t: number): number {
  const a = t * t * (3 - 2 * t); // smoothstep
  return 1 - Math.pow(1 - a, 1.6);
}

function driveFromReveal(reveal: number, approach = 0): BrainDrive {
  return {
    rigid: smooth01(0.05, 0.6, reveal) * 0.85,
    links: smooth01(0.05, 0.97, reveal),
    // fastest mid-dive, then settles to a calm (still slightly quickened) swirl on arrival
    speed: smooth01(0.0, 0.55, reveal) * (1 - 0.85 * smooth01(0.55, 1.0, reveal)) + approach * DEEP_APPROACH_SPEED,
  };
}

interface TravelTransition {
  startTime: number;
  duration: number;
  startDist: number;
  targetDist: number;
  fromTier: ZoomTierName;
  toTier: ZoomTierName;
  targetVisualMode: "core" | "brain" | "missions";
  startTarget: THREE.Vector3;
}

interface SpatialCanvasProps {
  className?: string;
  initialTier?: ZoomTierName;
  /** URL addressed a Dive lens (reload / shared link): land directly inside Dive In on it, without the plunge. */
  initialDiveLensId?: DiveLensId;
}

const USE_GPU_CORE = true;

export function SpatialCanvas({ className = "", initialTier = "home", initialDiveLensId }: SpatialCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isListening, setIsListening] = useState(false);
  const isListeningRef = useRef(isListening);
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);
  const [graphData, setGraphData] = useState<SpatialGraphData | null>(null);
  const graphSnapshotRef = useRef<SpatialGraphData | null>(null);
  useEffect(() => { graphSnapshotRef.current = graphData; }, [graphData]);
  const [telemetryData, setTelemetryData] = useState<SpatialTelemetryData | null>(null);
  const telemetryDataRef = useRef(telemetryData);
  useEffect(() => {
    telemetryDataRef.current = telemetryData;
  }, [telemetryData]);
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());
  const activeCategoriesRef = useRef<Set<string>>(activeCategories);
  useEffect(() => {
    activeCategoriesRef.current = activeCategories;
  }, [activeCategories]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [isBusinessHubOpen, setIsBusinessHubOpen] = useState(false);
  const [currentTier, setCurrentTier] = useState<ZoomTierName>(initialTier);
  const [coreZoomProgress, setCoreZoomProgress] = useState(0);
  const lastCoreZoomPaintRef = useRef(0);
  // Camera depth can cross legacy thresholds during a CORE zoom journey. Keep
  // the visual owner separate so that depth never swaps in the Missions scene.
  const [visualMode, setVisualMode] = useState<"core" | "brain" | "missions">(
    initialTier === "brain" ? "brain" : initialTier === "core" ? "missions" : "core",
  );
  const visualModeRef = useRef(visualMode);
  useEffect(() => {
    visualModeRef.current = visualMode;
  }, [visualMode]);
  const coreOverlayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (currentTier === "core") coreOverlayRef.current?.scrollTo({ top: 0 });
  }, [currentTier]);
  const [isDiving, setIsDiving] = useState(false);
  // DIVE IN: the plunge (in/out) and the dive space it lands in.
  const diveInRef = useRef<{ progress: number; target: 0 | 1; last: number; startDist: number; radius: number; ray: THREE.Vector3; startTarget: THREE.Vector3; minDistance: number; returnTier: ZoomTierName; returnVisual: "core" | "brain" | "missions" } | null>(null);
  const diveLandingRef = useRef<HTMLDivElement>(null);
  const selectTierRef = useRef<(tier: ZoomTierName) => void>(() => {});
  const pendingDiveExitRef = useRef<(() => void) | null>(null);
  const startDiveOutRef = useRef<() => void>(() => {});
  const diveLayerRef = useRef(false);
  const [diveLayer, setDiveLayer] = useState(false);
  // Navigation state lives in the URL (see lib/surfaceLocation). The lens shown inside Dive In is reported by the
  // existing scope event; `diveInitialLens` seeds DiveOverview when it mounts (reload / Back / Forward into Dive).
  const [activeLensId, setActiveLensId] = useState<DiveLensId | null>(null);
  const [diveInitialLens, setDiveInitialLens] = useState<DiveLensId | undefined>(initialDiveLensId);
  const pendingInstantDiveRef = useRef(!!initialDiveLensId);
  const navTargetRef = useRef<SurfaceLocation | null>(null);
  const navTargetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, setDivePrompt] = useState(false);
  const divePromptRef = useRef(false);
  const flashRef = useRef<HTMLDivElement>(null);
  const startDiveInRef = useRef<() => void>(() => {});
  const exitDiveLayerNowRef = useRef<() => void>(() => {});
  const diveRef = useRef<{ start: number; startZ: number; navigated: boolean } | null>(null);
  const travelTransitionRef = useRef<TravelTransition | null>(null);
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
  const targetDistanceRef = useRef<number>(initialTier === "core" ? MISSIONS_CAMERA_DIST : initialTier === "brain" ? BRAIN_CAMERA_DIST : CORE_CAMERA_DIST);
  const currentTierRef = useRef<ZoomTierName>(initialTier);
  const isInteractingRef = useRef<boolean>(false);
  const knownCategoryIdsRef = useRef<Set<string>>(new Set());
  const hoveredNodeIdRef = useRef<string | null>(null);
  const isCoreHoveredRef = useRef<boolean>(false);
  // Ambient rotation pauses on click/drag/zoom and auto-resumes after this many
  // ms of no interaction (user asked for "5-10 secs" — picked the midpoint).
  const lastInteractionRef = useRef<number>(0);

  // BRAIN arbor: the CORE's own particles organising into membrane + dendrites.
  const brainFieldRef = useRef<BrainField | null>(null);
  const diveNetworkRef=useRef<DiveNetworkLayer|null>(null);
  // Smoothed BRAIN reveal progress (0..1), eased per frame in a frame-rate
  // independent way so the handoff can never snap, even if camera distance jitters.
  const brainRevealRef = useRef(0);

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
  const coreOwnsClickRef = useRef(false);
  // DOM label layer for identifying records (hover / cursor proximity / sidebar-list hover / hub)
  const labelLayerRef = useRef<HTMLDivElement>(null);
  const inspectRef = useRef<{position: THREE.Vector3; target: THREE.Vector3; distance: number; min: number} | null>(null);
  const diveInspectionRef = useRef<typeof inspectRef.current>(null);
  const inspectTravelRef = useRef<{start: number; from: THREE.Vector3; fromTarget: THREE.Vector3; to: THREE.Vector3; toTarget: THREE.Vector3; returning: boolean} | null>(null);
  const labelHoverRef = useRef<(id:string|null)=>void>(()=>{});
  const labelSelectRef = useRef<(id: string, focus: boolean) => void>(() => {});
  const listHoverIdRef = useRef<string | null>(null);
  const knowledgeGateRef = useRef(0);

  // Set when BRAIN is left with the orbit pivot away from the nucleus (e.g. a focused record);
  // the pivot then glides home and the flag clears once it arrives (user panning in CORE is untouched).
  const pivotReturnRef = useRef(false);
  // The Systems panel covers the scene: the BRAIN knowledge layer must not stay active under it.
  const { isSettingsOpen } = useAppState();
  const settingsOpenRef = useRef(isSettingsOpen);
  useEffect(() => {
    settingsOpenRef.current = isSettingsOpen;
  }, [isSettingsOpen]);

  // 1. Fetch Real Data (Obsidian Graph & Live Telemetry)
  const refreshData = useCallback(async () => {
    try {
      const isDemo = typeof window !== "undefined" && (new URLSearchParams(window.location.search).get("demo") === "true" || new URLSearchParams(window.location.search).get("demo") === "1");
      const [graphRes, telemRes] = await Promise.all([
        fetch(isDemo ? "/api/spatial/graph?demo=true" : "/api/spatial/graph"),
        fetch("/api/spatial/telemetry"),
      ]);

      if (graphRes.ok) {
        const json = await graphRes.json();
        const data: SpatialGraphData = json.data;
        if (data && data.nodes) {
          layoutSpatialGlobe(data.nodes, data.categories);
          setGraphData((prev) => {
            if (!prev) return data;
            const sameNodes = prev.nodes.length === data.nodes.length &&
              prev.nodes.every((n, i) => n.id === data.nodes[i]?.id);
            const sameLinks = prev.links.length === data.links.length;
            if (sameNodes && sameLinks) return prev;
            return data;
          });
          // A routine refresh must not undo the user's layer filter: only categories
          // that have never been seen before are switched on.
          const fresh = data.categories.map((c) => c.id).filter((id) => !knownCategoryIdsRef.current.has(id));
          if (fresh.length > 0) {
            fresh.forEach((id) => knownCategoryIdsRef.current.add(id));
            setActiveCategories((prev) => new Set([...prev, ...fresh]));
          }
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

  const selectedNodeRef = useRef<GraphNode | null>(null);
  useEffect(() => { selectedNodeRef.current=selectedNode; }, [selectedNode]);
  const closeInspection = useCallback(() => {
    setSelectedNode(null);
    hoveredNodeIdRef.current=null;
    listHoverIdRef.current=null;
    connectedTargetsRef.current=new Set();
    brainFieldRef.current?.setHoveredNode(null,new Set());
    const saved=inspectRef.current,camera=cameraRef.current,controls=controlsRef.current;
    if(saved && camera && controls){
      inspectTravelRef.current={start:performance.now(),from:camera.position.clone(),fromTarget:controls.target.clone(),to:saved.position.clone(),toTarget:saved.target.clone(),returning:true};
    }
  }, []);
  useEffect(()=>{labelSelectRef.current=(id,focus)=>{
    const node=graphData?.nodes.find(n=>n.id===id);
    if(!node || visualModeRef.current!=="brain" || diveInRef.current || diveLayerRef.current)return;
    setSelectedNode(node);brainFieldRef.current?.setSelectedNode(id);
    if(!focus && !inspectRef.current)return;
    const camera=cameraRef.current,controls=controlsRef.current,world=brainFieldRef.current?.getRecordWorld(id);
    if(!camera || !controls || !world)return;
    if(!inspectRef.current)inspectRef.current={position:camera.position.clone(),target:controls.target.clone(),distance:camera.position.distanceTo(controls.target),min:controls.minDistance};
    travelTransitionRef.current=null;diveRef.current=null;pivotReturnRef.current=false;
    const radial=world.clone().normalize();
    const tangent=new THREE.Vector3().crossVectors(camera.up,radial).normalize();
    // An oblique approach separates the inspected orb from CORE in projection.
    const approach=radial.clone().addScaledVector(tangent,.85).normalize();
    const standOff=node.degree>4 ? 30 : node.source==="mcp" ? 19 : 25;
    const to=world.clone().addScaledVector(approach,standOff);
    const right=new THREE.Vector3().crossVectors(camera.up,approach).normalize();
    const toTarget=world.clone().addScaledVector(right,standOff*.13);
    controls.minDistance=12;
    inspectTravelRef.current={start:performance.now(),from:camera.position.clone(),fromTarget:controls.target.clone(),to,toTarget,returning:false};
    lastInteractionRef.current=performance.now();
  };
    labelHoverRef.current=(id)=>{const neighbours=new Set<string>(id?[id]:[]);if(id)graphData?.links.forEach(l=>{if(l.source===id)neighbours.add(l.target);if(l.target===id)neighbours.add(l.source);});hoveredNodeIdRef.current=id;connectedTargetsRef.current=neighbours;brainFieldRef.current?.setHoveredNode(id,neighbours);};
  },[graphData]);
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{if(e.key==="Escape")closeInspection();};
    window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);
  },[closeInspection]);

  // Unified cancellation helper for mutual exclusion and clean interruptions
  const cancelTransitions = useCallback((restoreCamera = true) => {
    inspectTravelRef.current=null;
    if (inspectRef.current && controlsRef.current) {controlsRef.current.minDistance=inspectRef.current.min;inspectRef.current=null;}
    if (travelTransitionRef.current) {
      travelTransitionRef.current = null;
    }
    if (diveRef.current) {
      diveRef.current = null;
      setIsDiving(false);
    }
    if (restoreCamera && cameraRef.current) {
      cameraRef.current.rotation.z = 0;
      cameraRef.current.fov = BASE_FOV;
      cameraRef.current.updateProjectionMatrix();
      if (rendererRef.current) rendererRef.current.toneMappingExposure = 1.05;
    }
    if (controlsRef.current) {
      controlsRef.current.enabled = true;
    }
  }, []);

  // Everything transient that belongs to the BRAIN knowledge layer. Called the moment another surface is
  // chosen and whenever the visual surface stops being BRAIN (nav, manual zoom out, Missions dive).
  const clearBrainFocus = useCallback(() => {
    hoveredNodeIdRef.current = null;
    connectedTargetsRef.current = new Set();
    listHoverIdRef.current = null;
    brainFieldRef.current?.setHoveredNode(null, new Set());
    if (containerRef.current) containerRef.current.style.cursor = "default";
    setSelectedNode(null);
  }, []);

  // Dashboard → CORE (Missions): camera accelerates through the core into Tier 5.
  const handleEnterCore = useCallback(() => {
    if (diveRef.current) return;
    clearBrainFocus();
    cancelTransitions(true);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !cameraRef.current) {
      setCurrentTier("core");
      currentTierRef.current = "core";
      setVisualMode("missions");
      targetDistanceRef.current = MISSIONS_CAMERA_DIST;
      if (cameraRef.current) {
        cameraRef.current.position.set(0, 15, CORE_DEPTH);
      }
      return;
    }
    diveRef.current = { start: performance.now(), startZ: cameraRef.current.position.z, navigated: false };
    setIsDiving(true);
  }, [cancelTransitions, clearBrainFocus]);

  // Fast-travel zoom navigation with calibrated cinematic acceleration / deceleration
  const handleSelectTier = useCallback((tier: ZoomTierName): void => {
    // Clicking the same header button again while its transition plays skips straight to the page.
    const inFlight = travelTransitionRef.current;
    if (inFlight && inFlight.toTier === tier) {
      inFlight.startTime = performance.now() - inFlight.duration;
      return;
    }
    if (diveRef.current && tier === "core") {
      diveRef.current.start = performance.now() - DIVE_MS;
      return;
    }
    if ((diveLayerRef.current || diveInRef.current) && tier === "brain") {
      pendingDiveExitRef.current = diveInRef.current?.returnVisual === "brain" ? null : () => selectTierRef.current("brain");
      startDiveOutRef.current(); return;
    }
    if (diveLayerRef.current || diveInRef.current) exitDiveLayerNowRef.current();
    if (tier !== "brain") clearBrainFocus();
    const isReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const targetDist = tier === "home" ? CORE_CAMERA_DIST : tier === "brain" ? BRAIN_CAMERA_DIST : MISSIONS_CAMERA_DIST;
    targetDistanceRef.current = targetDist;

    if (tier === "core") {
      // Missions tier requested
      cancelTransitions(true);
      setCurrentTier("core");
      currentTierRef.current = "core";
      setVisualMode("missions");
      if (cameraRef.current && controlsRef.current) {
        if (isReducedMotion) {
          cameraRef.current.position.set(0, 15, CORE_DEPTH);
          controlsRef.current.target.set(0, 0, 0);
          controlsRef.current.update();
        } else {
          handleEnterCore();
        }
      }
      return;
    }

    // Leaving Missions back to CORE or Brain
    if (visualModeRef.current === "missions" || currentTierRef.current === "core") {
      cancelTransitions(true);
      setVisualMode(tier === "brain" ? "brain" : "core");
      setCurrentTier(tier);
      currentTierRef.current = tier;
      if (cameraRef.current && controlsRef.current) {
        controlsRef.current.target.set(0, 0, 0);
        const ray = new THREE.Vector3().subVectors(cameraRef.current.position, controlsRef.current.target).normalize();
        if (ray.lengthSq() < 0.001) ray.set(0, 0, 1);
        const currentDist = cameraRef.current.position.distanceTo(controlsRef.current.target);
        if (isReducedMotion || Math.abs(currentDist - targetDist) < 10) {
          cameraRef.current.position.copy(controlsRef.current.target).addScaledVector(ray, targetDist);
          controlsRef.current.update();
          return;
        }
      }
    }

    if (!cameraRef.current || !controlsRef.current) {
      cancelTransitions(true);
      setCurrentTier(tier);
      currentTierRef.current = tier;
      setVisualMode(tier === "brain" ? "brain" : "core");
      return;
    }

    const currentDist = cameraRef.current.position.distanceTo(controlsRef.current.target);

    if (isReducedMotion) {
      cancelTransitions(true);
      const ray = new THREE.Vector3().subVectors(cameraRef.current.position, controlsRef.current.target).normalize();
      if (ray.lengthSq() < 0.001) ray.set(0, 0, 1);
      cameraRef.current.position.copy(controlsRef.current.target).addScaledVector(ray, targetDist);
      controlsRef.current.update();
      setCurrentTier(tier);
      currentTierRef.current = tier;
      setVisualMode(tier === "brain" ? "brain" : "core");
      return;
    }

    // Start clean transition from current live position (cancel any previous in-flight transition)
    cancelTransitions(false);
    const distDelta = Math.abs(targetDist - currentDist);
    const duration = Math.max(600, Math.min(BRAIN_JOURNEY_MS, (distDelta / Math.abs(CORE_CAMERA_DIST - BRAIN_CAMERA_DIST)) * BRAIN_JOURNEY_MS));

    travelTransitionRef.current = {
      startTime: performance.now(),
      duration,
      startDist: currentDist,
      targetDist,
      fromTier: currentTierRef.current,
      toTier: tier,
      targetVisualMode: tier === "brain" ? "brain" : "core",
      startTarget: controlsRef.current.target.clone(),
    };
  }, [cancelTransitions, handleEnterCore, clearBrainFocus]);

  useEffect(() => { selectTierRef.current = handleSelectTier; }, [handleSelectTier]);

  // ---- URL-addressable navigation: CORE / Explore / Dive In (+ lens). Systems is owned by appState (panel=settings). ----
  // While the UI is travelling toward a location the URL already names (reload, Back, Forward), `navTargetRef` holds it and
  // the writer stays quiet, so an in-between state can never overwrite the destination in the address bar.
  const armNavTarget = useCallback((target: SurfaceLocation | null) => {
    navTargetRef.current = target;
    if (navTargetTimerRef.current) clearTimeout(navTargetTimerRef.current);
    navTargetTimerRef.current = target ? setTimeout(() => { navTargetRef.current = null; }, 5000) : null;
  }, []);
  useEffect(() => {
    armNavTarget(parseSurfaceLocation(window.location.search)); // what the URL asked for at load
    return () => { if (navTargetTimerRef.current) clearTimeout(navTargetTimerRef.current); };
  }, [armNavTarget]);
  const wasDiveLayerRef = useRef(false);
  useEffect(() => { // a lens chosen by Back/Forward/reload seeds ONE entry into Dive In; leaving it resets to Overview
    if (wasDiveLayerRef.current && !diveLayer) setDiveInitialLens(undefined);
    wasDiveLayerRef.current = diveLayer;
  }, [diveLayer]);
  useEffect(() => {
    const onScope = (event: Event) => setActiveLensId((event as CustomEvent<DiveScopeDetail>).detail?.lensId ?? null);
    window.addEventListener(DIVE_SCOPE_EVENT, onScope);
    return () => window.removeEventListener(DIVE_SCOPE_EVENT, onScope);
  }, []);
  useEffect(() => {
    if (visualMode === "missions" && !diveLayer) return; // legacy Missions tier keeps its own ?tier=core URL
    const desired: SurfaceLocation = diveLayer
      ? { surface: "dive", lensId: activeLensId ?? diveInitialLens ?? "lens.overview" }
      : visualMode === "brain" ? { surface: "explore" } : { surface: "core" };
    const target = navTargetRef.current;
    if (target) {
      if (sameSurface(target, desired)) {
        armNavTarget(null); // arrived
        // Canonicalize without adding history (e.g. ?lens=bogus or ?lens=Finance → the real slug).
        const canonical = withSurface(window.location.search, desired);
        if (canonical !== window.location.search) window.history.replaceState(window.history.state, "", `${window.location.pathname}${canonical}${window.location.hash}`);
      }
      return; // still travelling: do not write
    }
    const current = parseSurfaceLocation(window.location.search);
    if (sameSurface(current, desired)) return;
    const url = `${window.location.pathname}${withSurface(window.location.search, desired)}${window.location.hash}`;
    window.history.pushState(window.history.state, "", url);
  }, [diveLayer, visualMode, activeLensId, diveInitialLens, armNavTarget]);
  useEffect(() => {
    const onPopState = () => {
      const loc = parseSurfaceLocation(window.location.search);
      armNavTarget(loc);
      if (loc.surface === "dive") {
        if (diveLayerRef.current) window.dispatchEvent(new CustomEvent(DIVE_OPEN_EVENT, { detail: { lensId: loc.lensId } }));
        else { setDiveInitialLens(loc.lensId); startDiveInRef.current(); }
      } else {
        selectTierRef.current(loc.surface === "explore" ? "brain" : "home");
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [armNavTarget]);

  // 2. Initialize Three.js WebGL Scene
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x010206);
    scene.fog = new THREE.FogExp2(0x010206, 0.00045);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(BASE_FOV, width / height, 1, 3500);
    camera.position.set(0, 15, targetDistanceRef.current);
    cameraRef.current = camera;

    // WebGL Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.replaceChildren(renderer.domElement);
    rendererRef.current = renderer;

    // Controls: Bounded pitch & decoupled orbit vs guided depth navigation
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    // Manual scroll stops at the closest Explore framing (core ~370px wide). Going deeper is the
    // upcoming DIVE IN transition, not more scroll.
    controls.minDistance = 136; // same end framing as the approved d=85 at fov 48
    controls.maxDistance = 1200;
    controls.minPolarAngle = 0.15; // Controlled pitch: prevents flipping at zenith
    controls.maxPolarAngle = Math.PI - 0.15; // Prevents flipping at nadir
    controls.rotateSpeed = 0.75;
    controls.zoomSpeed = 0.9;
    controlsRef.current = controls;

    const onInteractionStart = () => {
      brainFieldRef.current?.setMotionPaused(true);
      diveNetworkRef.current?.setPaused(true);
      if(inspectRef.current)inspectTravelRef.current=null;else cancelTransitions(true);
      if (cameraRef.current && controlsRef.current) {
        targetDistanceRef.current = cameraRef.current.position.distanceTo(controlsRef.current.target);
      }
      isInteractingRef.current = true;
      lastInteractionRef.current = performance.now();
    };
    const onInteractionEnd = () => {
      brainFieldRef.current?.setMotionPaused(false);
      diveNetworkRef.current?.setPaused(false);
      isInteractingRef.current = false;
      targetDistanceRef.current = camera.position.distanceTo(controls.target);
      lastInteractionRef.current = performance.now();
    };
    const onControlsChange = () => {
      lastInteractionRef.current = performance.now();
      if (isInteractingRef.current) {
        targetDistanceRef.current = camera.position.distanceTo(controls.target);
      }
    };
    controls.addEventListener("start", onInteractionStart);
    controls.addEventListener("end", onInteractionEnd);
    controls.addEventListener("change", onControlsChange);

    const handleWheel = (ev: WheelEvent) => {
      // Inside Dive, wheel belongs to content; only explicit navigation reverses the journey.
      if (diveLayerRef.current || diveInRef.current) return;
      if (ev.target instanceof Element && ev.target.closest("button,input,textarea,select,[data-dive-inspector],.atlas-panel,.entity-panel,.nora-conversation,.studio-command-dock-wrapper")) return;
      if(inspectRef.current){inspectTravelRef.current=null;lastInteractionRef.current=performance.now();return;}
      // Ordinary wheel input belongs to graph zoom. Dive entry requires explicit navigation.
      if (travelTransitionRef.current || diveRef.current) {
        cancelTransitions(true);
        if (cameraRef.current && controlsRef.current) {
          targetDistanceRef.current = cameraRef.current.position.distanceTo(controlsRef.current.target);
        }
      }
      lastInteractionRef.current = performance.now();
    };
    const journeySurface = container.parentElement ?? container;
    journeySurface.addEventListener("wheel", handleWheel, { passive: false, capture: true });

    // ---------------- DIVE IN ----------------
    const diveNetwork=new DiveNetworkLayer();scene.add(diveNetwork.group);diveNetworkRef.current=diveNetwork;
    const setFlash = (o: number, ms = 0) => {
      const f = flashRef.current;
      if (!f) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        f.style.transition = "none";
        f.style.opacity = "0";
        return;
      }
      f.style.transition = ms ? `opacity ${ms}ms ease-out` : "none";
      f.style.opacity = String(o);
    };
    // What belongs to the Explore surface disappears in the dive space; what belongs to the journey stays.
    const applyDiveSpaceVisibility = (inside: boolean) => {
      if(neutronCore)neutronCore.group.visible=!inside;
      diveNetwork.group.visible=false; // Layer 1 uses an operational overview; Explore records stay in Explore.
      if (neutronCore?.pointsMesh) neutronCore.pointsMesh.visible = !inside;
      if (arbor) arbor.group.visible = arbor.group.visible && !inside;
      transitField.visible = !inside;
    };
    const enterDiveLayer = () => {
      diveLayerRef.current = true; setDiveLayer(true);
      controls.minDistance = .1; controls.maxDistance = DIVE_LAYER_MAX;
    };
    const leaveDiveLayer = () => {
      diveLayerRef.current = false; setDiveLayer(false);
      applyDiveSpaceVisibility(false);
    };
    const startDiveIn = () => {
      pendingDiveExitRef.current = null;
      const cur = diveInRef.current;
      if (cur) {
        cur.progress = advanceDive(cur.progress, cur.target, performance.now() - cur.last, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
        if (cur.target === 1 && cur.progress < 1) cur.progress = 1; // existing repeat-click skip
        cur.target = 1; cur.last = performance.now();
        if(cur.progress < 1) setIsDiving(true);
        return;
      }
      diveInspectionRef.current=inspectRef.current;
      const startTarget = controls.target.clone();
      const minDistance = controls.minDistance;
      const returnTier = currentTierRef.current, returnVisual = visualModeRef.current;
      cancelTransitions(true);
      const ray = camera.position.clone();
      if (ray.lengthSq() < .001) ray.set(0,0,1);
      const startDist = ray.length(); ray.normalize();
      controls.enabled = false; setIsDiving(true);
      setDivePrompt(false); divePromptRef.current = false;
      neutronCore?.setPlungeFreeze(true);
      diveInRef.current = {progress:0,target:1,last:performance.now(),startDist,radius:neutronCore?.getNucleusRadius()??20,ray,startTarget,minDistance,returnTier,returnVisual};
    };
    const startDiveOut = () => {
      const cur = diveInRef.current;
      if (!cur) return;
      cur.progress = advanceDive(cur.progress,cur.target,performance.now()-cur.last,window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      cur.target = 0; cur.last = performance.now(); controls.enabled = false; setIsDiving(true);
    };
    startDiveOutRef.current = startDiveOut;
    startDiveInRef.current = startDiveIn;
    exitDiveLayerNowRef.current = () => {
      pendingDiveExitRef.current = null;
      const cur=diveInRef.current;
      neutronCore?.setPlungeFreeze(false);
      diveInRef.current = null; setFlash(0); setIsDiving(false);
      camera.fov = BASE_FOV; camera.updateProjectionMatrix(); renderer.toneMappingExposure=1.05;
      controls.enabled=true;
      if (diveLayerRef.current) leaveDiveLayer();
      controls.minDistance=cur?.minDistance??EXPLORE_END_DIST; controls.maxDistance=1200;
    };
    const handleDiveSkip = () => {
      const d=diveInRef.current; if(d&&d.target===1){d.progress=1;d.last=performance.now();}
    };
    container.addEventListener("dblclick",handleDiveSkip);

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
    const neutronCore = USE_GPU_CORE ? new NeutronCoreEngine(scene) : null;

    // Grab-the-core rotation. Capture phase so it runs before OrbitControls: a press ON the core spins
    // only the core; a press anywhere else is left untouched and orbits the view as before.
    let coreDrag: { x: number; y: number; t: number; sx: number; sy: number } | null = null;
    const coreScreenHit = (e: PointerEvent) => {
      if (!neutronCore || diveLayerRef.current || diveInRef.current) return false;
      const rect = renderer.domElement.getBoundingClientRect();
      const c = new THREE.Vector3(0, 0, 0).project(camera);
      const cx = rect.left + (c.x * 0.5 + 0.5) * rect.width;
      const cy = rect.top + (-c.y * 0.5 + 0.5) * rect.height;
      const edge = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(neutronCore.getNucleusRadius()).project(camera);
      const rPx = Math.abs(edge.x - c.x) * 0.5 * rect.width;
      return Math.hypot(e.clientX - cx, e.clientY - cy) <= rPx * 1.08;
    };
    const onCoreDown = (e: PointerEvent) => {
      if (e.button !== 0 || !coreScreenHit(e)) return;
      e.stopImmediatePropagation();
      coreOwnsClickRef.current = true;
      coreDrag = { x: e.clientX, y: e.clientY, t: performance.now(), sx: e.clientX, sy: e.clientY };
      neutronCore?.setCoreDragging(true);
      renderer.domElement.style.cursor = "grabbing";
    };
    const onCoreMove = (e: PointerEvent) => {
      if (!coreDrag) return;
      const now = performance.now();
      neutronCore?.dragCore(e.clientX - coreDrag.x, e.clientY - coreDrag.y, now - coreDrag.t);
      coreDrag = { ...coreDrag, x: e.clientX, y: e.clientY, t: now };
    };
    const onCoreUp = (e: PointerEvent) => {
      if (!coreDrag) return;
      // a press without a drag is a click: release a shockwave
      if (Math.hypot(e.clientX - coreDrag.sx, e.clientY - coreDrag.sy) < 5) neutronCore?.pulseCore();
      coreDrag = null;
      neutronCore?.setCoreDragging(false);
      renderer.domElement.style.cursor = "";
    };
    renderer.domElement.addEventListener("pointerdown", onCoreDown, { capture: true });
    window.addEventListener("pointermove", onCoreMove);
    window.addEventListener("pointerup", onCoreUp);
    if (typeof window !== "undefined") {
      const win = window as unknown as {
        __THREE_NEUTRON_ENGINE?: NeutronCoreEngine;
        __THREE_CAMERA?: THREE.PerspectiveCamera;
        __THREE_CONTROLS?: OrbitControls;
      };
      if (neutronCore) win.__THREE_NEUTRON_ENGINE = neutronCore;
      win.__THREE_CAMERA = camera;
      win.__THREE_CONTROLS = controls;
    }
    const orbitals = USE_GPU_CORE ? null : createCoreOrbitals(scene);

    // BRAIN arbor (needs the CORE engine: it shares the engine's particle source and uniforms)
    const arbor = neutronCore ? new BrainField(scene, neutronCore) : null;
    const lightning = neutronCore ? new CoreLightning(scene) : null;
    (window as unknown as { __BRAIN_LIGHTNING?: CoreLightning | null }).__BRAIN_LIGHTNING = lightning;
    brainFieldRef.current = arbor;
    if (arbor) {
      arbor.setViewport(width, height, renderer.getPixelRatio());
      // Re-created render fields must retain the already-loaded real records.
      const snapshot = graphSnapshotRef.current;
      if (snapshot) {
        arbor.setKnowledge(snapshot.nodes, snapshot.links, snapshot.categories);
        arbor.setActiveCategories(activeCategoriesRef.current);
      }
      (window as unknown as { __BRAIN_FIELD?: BrainField }).__BRAIN_FIELD = arbor;
    }

    // Distant Ambient Starfield
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

    // Existing ambient foreground dust; strongly dimmed during the CORE-entry journey.
    const transitGeo = new THREE.BufferGeometry();
    const transitCount = 850;
    const transitPos = new Float32Array(transitCount * 3);
    for (let i = 0; i < transitCount * 3; i += 3) {
      transitPos[i] = (Math.random() - 0.5) * 850;
      transitPos[i + 1] = (Math.random() - 0.5) * 850;
      transitPos[i + 2] = 120 + Math.random() * 950;
    }
    transitGeo.setAttribute("position", new THREE.BufferAttribute(transitPos, 3));
    const transitMat = new THREE.PointsMaterial({
      color: 0xa5f3fc,
      size: 4.5,
      map: getStarDotTexture(),
      transparent: true,
      opacity: 0.45,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const transitField = new THREE.Points(transitGeo, transitMat);
    scene.add(transitField);

    // Resize Handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      arbor?.setViewport(w, h, renderer.getPixelRatio());
    };
    window.addEventListener("resize", handleResize);

    // Animation Loop
    let animationFrameId: number;
    let lastFrameTime = performance.now();
    const animationStartedAt = performance.now();
    const ROTATION_RESUME_DELAY_MS = 7000;
    lastInteractionRef.current = performance.now() - ROTATION_RESUME_DELAY_MS - 1000;

    const labelElsRef = new Map<string, HTMLDivElement>();
    let lastKnowledgeTarget = 0;
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
      const elapsedTime = (performance.now() - animationStartedAt) / 1000;

      const dive = diveRef.current;
      const travel = travelTransitionRef.current;

      const plunge = diveInRef.current;
      if(inspectTravelRef.current){
        const inspection=inspectTravelRef.current;
        const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const t=Math.min(1,(performance.now()-inspection.start)/(reduced?1:900));
        const e=t*t*(3-2*t);
        const a=inspection.from.clone().normalize(),b=inspection.to.clone().normalize();
        const q=new THREE.Quaternion().setFromUnitVectors(a,b);
        const turn=new THREE.Quaternion().slerp(q,e);
        camera.position.copy(a.applyQuaternion(turn)).multiplyScalar(THREE.MathUtils.lerp(inspection.from.length(),inspection.to.length(),e));
        controls.target.lerpVectors(inspection.fromTarget,inspection.toTarget,e);
        camera.lookAt(controls.target);controls.update();
        targetDistanceRef.current=camera.position.distanceTo(controls.target);
        if(t===1){inspectTravelRef.current=null;if(inspection.returning && inspectRef.current){controls.minDistance=inspectRef.current.min;targetDistanceRef.current=inspectRef.current.distance;inspectRef.current=null;}}
      } else if (plunge) {
        const now2=performance.now();
        plunge.progress=advanceDive(plunge.progress,plunge.target,now2-plunge.last,window.matchMedia("(prefers-reduced-motion: reduce)").matches); plunge.last=now2;
        const p=plunge.progress;
        controls.enabled=false;
        controls.target.copy(plunge.startTarget).multiplyScalar(1-smooth01(0,.25,p));
        camera.position.copy(plunge.ray).multiplyScalar(diveDistance(p,plunge.startDist,plunge.radius,DIVE_PLUNGE_TO));
        camera.lookAt(controls.target);
        camera.fov=BASE_FOV; camera.updateProjectionMatrix();
        renderer.toneMappingExposure=1.05;
        setFlash(0);
        neutronCore?.setDiveLight(p);
        if(p>=.55&&!diveLayerRef.current)enterDiveLayer();
        if(p<.55&&diveLayerRef.current)leaveDiveLayer();
        applyDiveSpaceVisibility(p>=.96);
        if(diveLandingRef.current){
          const landing=diveLandingRef.current;
          landing.style.opacity=String(diveLandingOpacity(p));landing.style.pointerEvents=p===1?'auto':'none';
          landing.inert=p!==1;
          landing.style.setProperty('--dive-content-opacity',String(diveContentOpacity(p)));
          landing.style.setProperty('--dive-membrane-light',String(diveMembraneLight(p)));
        }
        if(p===1&&plunge.target===1){
          targetDistanceRef.current=DIVE_PLUNGE_TO;setIsDiving(false);setFlash(0);
        }else if(p===0&&plunge.target===0){
          leaveDiveLayer(); neutronCore?.setPlungeFreeze(false);
          inspectRef.current=diveInspectionRef.current;diveInspectionRef.current=null;
          controls.target.copy(plunge.startTarget); controls.minDistance=plunge.minDistance;controls.maxDistance=1200;controls.enabled=true;
          targetDistanceRef.current=camera.position.distanceTo(controls.target);
          currentTierRef.current=plunge.returnTier;setCurrentTier(plunge.returnTier);setVisualMode(plunge.returnVisual);
          renderer.toneMappingExposure=1.05;setFlash(0);diveInRef.current=null;setIsDiving(false);
          const requestedExit = pendingDiveExitRef.current;
          pendingDiveExitRef.current = null;
          requestedExit?.();
        }
      } else if (dive) {
        // Accelerating (cubic) run straight through the core, with FOV warp,
        // a slight roll and exposure blow-out. OrbitControls is bypassed.
        const t = Math.min((performance.now() - dive.start) / DIVE_MS, 1);
        const e = t * t * t;
        controls.enabled = false;
        camera.position.z = dive.startZ + (DIVE_END_Z - dive.startZ) * e;
        camera.position.x *= 0.92;
        camera.position.y *= 0.92;
        camera.rotation.z = e * 0.6;
        camera.fov = BASE_FOV + 72 * e;
        camera.updateProjectionMatrix();
        renderer.toneMappingExposure = 1.05 + 3.4 * e * e;
        if (t >= 1 && !dive.navigated) {
          dive.navigated = true;
          targetDistanceRef.current = MISSIONS_CAMERA_DIST;
          camera.position.set(0, 15, CORE_DEPTH);
          controls.target.set(0, 0, 0);
          camera.rotation.z = 0;
          camera.fov = BASE_FOV;
          camera.updateProjectionMatrix();
          renderer.toneMappingExposure = 1.05;
          controls.enabled = true;
          setIsDiving(false);
          diveRef.current = null;
          setCurrentTier("core");
          currentTierRef.current = "core";
          setVisualMode("missions");
        }
      } else if (travel) {
        // Cinematic continuous CORE <-> BRAIN journey (Calibrated 3-stage orchestration)
        controls.enabled = false;
        const elapsed = performance.now() - travel.startTime;
        const tau = Math.min(elapsed / travel.duration, 1.0);
        // Centered dolly: quick settle, steady push, long controlled deceleration
        const e = dollyEase(tau);

        const currentDist = travel.startDist + (travel.targetDist - travel.startDist) * e;
        const ray = new THREE.Vector3().subVectors(camera.position, controls.target);
        controls.target.copy(travel.startTarget).multiplyScalar(1 - e);
        if (ray.lengthSq() < 0.001) ray.set(0, 0, 1);
        ray.normalize();
        camera.position.copy(controls.target).addScaledVector(ray, currentDist);

        // Subtle perspective lens breathing (smooth expansion during peak mid-dive)
        const lensWave = Math.sin(tau * Math.PI);
        camera.fov = BASE_FOV + 3.2 * lensWave;
        camera.updateProjectionMatrix();
        renderer.toneMappingExposure = 1.05 + 0.10 * lensWave;

        // Evolve visual mode & navigation tier during travel
        if (travel.toTier === "brain") {
          if (tau > 0.45 && visualModeRef.current !== "brain") {
            setVisualMode("brain");
          }
          if (tau >= 0.85 && currentTierRef.current !== "brain") {
            currentTierRef.current = "brain";
            setCurrentTier("brain");
          }
        } else if (travel.toTier === "home") {
          if (tau > 0.15 && visualModeRef.current !== "core") {
            setVisualMode("core");
          }
          if (tau >= 0.85 && currentTierRef.current !== "home") {
            currentTierRef.current = "home";
            setCurrentTier("home");
          }
        }

        if (tau >= 1.0) {
          camera.fov = BASE_FOV;
          camera.updateProjectionMatrix();
          renderer.toneMappingExposure = 1.05;
          currentTierRef.current = travel.toTier;
          setCurrentTier(travel.toTier);
          setVisualMode(travel.targetVisualMode);
          targetDistanceRef.current = travel.targetDist;
          travelTransitionRef.current = null;
          controls.enabled = true;
        }
      } else {
        // Pivot return after leaving BRAIN without a guided journey (manual scroll-out):
        // frame-rate independent exponential glide of the orbit target back to the nucleus.
        if (pivotReturnRef.current) {
          const k = Math.exp(-Math.min(performance.now() - lastFrameTime, 100) / 1000 / 0.3);
          controls.target.multiplyScalar(k);
          if (controls.target.lengthSq() < 0.01) {
            controls.target.set(0, 0, 0);
            pivotReturnRef.current = false;
          }
        }

        // Smooth radial distance interpolation when fast-traveling / damping
        if (!isInteractingRef.current) {
          const currentDist = camera.position.distanceTo(controls.target);
          if (Math.abs(currentDist - targetDistanceRef.current) > 1.0) {
            const newDist = currentDist + (targetDistanceRef.current - currentDist) * 0.08;
            const ray = new THREE.Vector3().subVectors(camera.position, controls.target);
            if (ray.lengthSq() < 0.001) ray.set(0, 0, 1);
            ray.normalize();
            camera.position.copy(controls.target).addScaledVector(ray, newDist);
          }
        }

        controls.update();
      }

      if(process.env.NODE_ENV === "development"){container.dataset.diveProgress=String(diveInRef.current?.progress??0);container.dataset.cameraPosition=camera.position.toArray().map(n=>n.toFixed(3)).join(",");container.dataset.cameraTarget=controls.target.toArray().map(n=>n.toFixed(3)).join(",");container.dataset.hoveredRecord=hoveredNodeIdRef.current??"";}
      // Distance from orbit target (depth progression)
      const d = inspectRef.current?.distance ?? camera.position.distanceTo(controls.target);
      if (performance.now() - lastCoreZoomPaintRef.current > 40) {
        lastCoreZoomPaintRef.current = performance.now();
        setCoreZoomProgress(THREE.MathUtils.clamp((CORE_CAMERA_DIST - d) / (CORE_CAMERA_DIST - BRAIN_CAMERA_DIST), 0, 1));
      }

      // Logical tier resolution based on spherical distance from target (when not under travel controller)
      if (!travelTransitionRef.current && !diveRef.current && !diveInRef.current && !diveLayerRef.current) {
        if (d > 660) {
          if (currentTierRef.current !== "home") {
            currentTierRef.current = "home";
            setCurrentTier("home");
            setVisualMode("core");
          }
        } else {
          // Manual scroll stays in BRAIN all the way in; MISSIONS is an explicit navigation journey.
          // A small return band keeps a completed MISSIONS arrival (d=90) from flipping straight back.
          if (currentTierRef.current !== "brain" && !(currentTierRef.current === "core" && d < 125)) {
            currentTierRef.current = "brain";
            setCurrentTier("brain");
            setVisualMode("brain");
          }
        }
      }

      const now = performance.now();
      // A backgrounded tab / long hitch must not become one giant step (rotations, decays and spin integrate deltaMs).
      const deltaMs = Math.min(now - lastFrameTime, 100);
      lastFrameTime = now;
      const isReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const somethingHovered = !!hoveredNodeIdRef.current;

      // BRAIN emergence: a pure function of camera distance (guided dolly or manual
      // zoom alike), eased per frame in a frame-rate independent way so it can
      // never snap - even if the camera jitters or the user reverses mid-flight.
      const inMissions = !!diveRef.current || visualModeRef.current === "missions";
      const revealTarget = inMissions ? 0 : THREE.MathUtils.clamp((REVEAL_START_DIST - d) / (REVEAL_START_DIST - REVEAL_END_DIST), 0, 1);
      const revealBlend = 1 - Math.exp(-Math.min(deltaMs, 100) / 1000 / 0.14);
      brainRevealRef.current += (revealTarget - brainRevealRef.current) * revealBlend;
      const approach = smooth01(REVEAL_END_DIST, MISSIONS_CAMERA_DIST + 10, d);
      const brainDrive = driveFromReveal(brainRevealRef.current, approach);
      // Knowledge layer (labels, record points, pick targets) exists only on the BRAIN surface. Camera distance
      // alone is not enough: Missions sits deeper than BRAIN, and the first part of every journey out of BRAIN
      // is still within BRAIN distance while another surface is already selected.
      const travelNow = travelTransitionRef.current;
      const knowledgeTarget =
        visualModeRef.current === "brain" && !diveRef.current && !diveLayerRef.current && !(travelNow && travelNow.toTier !== "brain") && !settingsOpenRef.current ? (diveInRef.current ? 1-smooth01(0,.2,diveInRef.current.progress) : 1) : 0;
      const gateTau = knowledgeTarget > knowledgeGateRef.current ? 0.35 : 0.08;
      knowledgeGateRef.current += (knowledgeTarget - knowledgeGateRef.current) * (1 - Math.exp(-Math.min(deltaMs, 100) / 1000 / gateTau));
      if (knowledgeTarget === 0 && knowledgeGateRef.current < 0.01) knowledgeGateRef.current = 0;
      // Any exit from BRAIN (nav, manual zoom out, Missions dive) drops hover / list focus / open note.
      if (knowledgeTarget === 0 && lastKnowledgeTarget === 1 && !diveInRef.current) {
        clearBrainFocus();
        // Leaving BRAIN (not merely opening Systems over it): bring the orbit pivot home. A guided journey
        // already eases it via travel.startTarget; manual exits use the glide above.
        if (visualModeRef.current !== "brain" && controls.target.lengthSq() > 0.01) pivotReturnRef.current = true;
      }
      if (travelNow || diveRef.current) pivotReturnRef.current = false;
      lastKnowledgeTarget = knowledgeTarget;
      arbor?.setKnowledgeGate(knowledgeGateRef.current);

      // DIVE IN prompt: only while resting at the Explore end point
      const atEnd = !inspectRef.current && visualModeRef.current === "brain" && !diveLayerRef.current && !diveInRef.current && !travelNow && !diveRef.current && d <= EXPLORE_END_DIST + 4;
      if (atEnd !== divePromptRef.current) {
        divePromptRef.current = atEnd;
        setDivePrompt(atEnd);
      }

      const journeyProgress=diveInRef.current?.progress??0;
      starMat.opacity=.55*(1-.85*smooth01(0,.3,journeyProgress));
      transitMat.opacity=.45*(1-.95*smooth01(0,.2,journeyProgress));
      // Continuous cosmic starfield & foreground transit dust rotation
      if (!isReducedMotion) {
        starField.rotation.y += deltaMs * 0.00008;
        transitField.rotation.y += deltaMs * 0.00004;
      }

      // Update CORE visualization
      const coreProximityTarget = proximityTargetFor(ZERO_VEC);

      if (neutronCore) {
        // Truthful operational state: listening > executing > idle
        const isExecuting = (telemetryDataRef.current?.activeJobCount ?? 0) > 0;
        const targetState: NeutronCoreState = isListeningRef.current
          ? "listening"
          : isExecuting
            ? "executing"
            : "idle";
        neutronCore.setState(targetState);
        neutronCore.update(elapsedTime, d, coreProximityTarget, isReducedMotion, deltaMs, brainDrive);
        arbor?.update(elapsedTime, brainDrive, d, camera);
        diveNetwork.update(elapsedTime,isReducedMotion);
        if (diveLayerRef.current) applyDiveSpaceVisibility((diveInRef.current?.progress??1)>=.96);
        // rare discharges at the nucleus once zoomed into BRAIN (never in CORE / Missions)
        lightning?.update(elapsedTime, smooth01(0.6, 1.0, brainDrive.links), neutronCore.getNucleusRadius(), isReducedMotion);
      } else if (orbitals) {
        orbitals.group.visible = visualModeRef.current !== "brain";
        orbitals.update(elapsedTime, somethingHovered, d, coreProximityTarget);
      }

      // Record labels - the same rule for every node (no always-on labels):
      //  - at BRAIN arrival only near the cursor / hovered / sidebar-located / connected to the hovered node
      //  - zooming deeper than the BRAIN arrival distance soft-reveals every name (faint)
      //  - the hovered (or sidebar-located) name glows brighter
      const layer = labelLayerRef.current;
      if (layer && arbor) {
        const data = arbor.getLabelData();
        const els = labelElsRef;
        if (els.size !== data.length || data.some((r) => !els.has(r.id))) {
          layer.replaceChildren();
          els.clear();
          for (const r of data) {
            const el = document.createElement("div");
            el.dataset.nodeId=r.id;el.setAttribute("role","button");el.tabIndex=0;el.setAttribute("aria-label",r.title);
            let pressed:{x:number;y:number}|null=null;
            el.addEventListener("pointerdown",ev=>{ev.stopPropagation();pressed={x:ev.clientX,y:ev.clientY};});
            el.addEventListener("click",ev=>{ev.stopPropagation();if(pressed && Math.hypot(ev.clientX-pressed.x,ev.clientY-pressed.y)<=5)labelSelectRef.current(r.id,false);});
            el.addEventListener("dblclick",ev=>{ev.stopPropagation();if(pressed && Math.hypot(ev.clientX-pressed.x,ev.clientY-pressed.y)<=5)labelSelectRef.current(r.id,true);});
            el.addEventListener("keydown",ev=>{if(ev.key==="Enter" || ev.key===" "){ev.preventDefault();labelSelectRef.current(r.id,ev.key==="Enter");}});
            el.addEventListener("pointerenter",()=>labelHoverRef.current(r.id));
            el.addEventListener("pointerleave",()=>labelHoverRef.current(null));
            el.style.cssText =
              "position:absolute;left:0;top:0;opacity:0;pointer-events:auto;cursor:pointer;white-space:nowrap;padding-left:7px;border-left:1px solid rgba(140,225,255,0.55);" +
              "font:500 10.5px/1.25 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:0.06em;color:rgba(215,246,255,0.9);text-shadow:0 0 6px rgba(0,0,0,0.9);" +
              "transition:opacity 220ms ease-out,color 180ms ease-out,border-color 180ms ease-out;will-change:transform,opacity;";
            const t = document.createElement("div");
            t.textContent = r.title.length > 30 ? r.title.slice(0, 29) + "\u2026" : r.title;
            const c = document.createElement("div");
            c.textContent = r.category;
            c.style.cssText = "font-size:8.5px;letter-spacing:0.16em;text-transform:uppercase;color:rgba(120,205,235,0.75)";
            el.append(t, c);
            layer.appendChild(el);
            els.set(r.id, el);
          }
        }
        const visible = smooth01(0.72, 0.95, brainRevealRef.current) * knowledgeGateRef.current;
        const hideLayer = visible < 0.005;
        if ((layer.style.visibility === "hidden") !== hideLayer) layer.style.visibility = hideLayer ? "hidden" : "visible";
        const occupied: {left:number;right:number;top:number;bottom:number}[] = [];
        const viewport = container.getBoundingClientRect();
        for (const panel of document.querySelectorAll('aside, nav[aria-label="Primary navigation"]')) {
          const rect = panel.getBoundingClientRect();
          if (rect.width && rect.height) occupied.push({left:rect.left-viewport.left,right:rect.right-viewport.left,top:rect.top-viewport.top,bottom:rect.bottom-viewport.top});
        }
        const reader = document.querySelector('button[title="Close reader (Esc)"]')?.closest('.fixed');
        if (reader) {
          const rect=reader.getBoundingClientRect();
          occupied.push({left:rect.left-viewport.left,right:rect.right-viewport.left,top:rect.top-viewport.top,bottom:rect.bottom-viewport.top});
        }
        const labelDepth = 1 - THREE.MathUtils.smoothstep(d, 136, 600);
        const hasLabelFocus = data.some(r => r.labelPriority === 3);
        const idleAlpha = hasLabelFocus ? .20 + .08 * labelDepth : .22 + .12 * labelDepth;
        const corePx=projectToPixels(ZERO_VEC);
        const coreEdge = neutronCore ? new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0).multiplyScalar(neutronCore.getNucleusRadius()) : null;
        const coreEdgePx=coreEdge ? projectToPixels(coreEdge) : null;
        const coreRadius=corePx && coreEdgePx ? Math.hypot(coreEdgePx.x-corePx.x,coreEdgePx.y-corePx.y)+12 : 0;
        for (const r of [...data].sort((a,b)=>b.labelPriority-a.labelPriority || a.id.localeCompare(b.id))) {
          const el = els.get(r.id);
          if (!el) continue;
          const px = visible > 0.01 ? projectToPixels(r.world) : null;
          if(process.env.NODE_ENV === "development" && px){
            const edge=projectToPixels(r.world.clone().addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),arbor.getRecordRadius(r.id)));
            el.dataset.recordCentre=`${px.x.toFixed(2)},${px.y.toFixed(2)}`;
            el.dataset.recordRadius=String(edge?Math.hypot(edge.x-px.x,edge.y-px.y):0);
          }
          let alpha = 0;
          if (px && activeCategoriesRef.current.has(r.source)) {
            const focus = r.labelPriority === 3 ? 1 : r.labelPriority === 2 ? .60 : idleAlpha;
            alpha = visible * focus;
            const localDepth = 1 - THREE.MathUtils.smoothstep(camera.position.distanceTo(r.world), 100, 500);
            el.style.fontSize = `${(9.5 + 2 * localDepth).toFixed(2)}px`;
            const category = el.children[1] as HTMLElement | undefined;
            if (category) category.style.fontSize = `${(7.5 + localDepth).toFixed(2)}px`;
            const hot = focus >= 1 ? "1" : "0";
            if (el.dataset.hot !== hot) {
              el.dataset.hot = hot;
              el.style.color = hot === "1" ? "rgba(255,255,255,1)" : "rgba(215,246,255,0.9)";
              el.style.textShadow = "0 1px 3px rgba(0,0,0,0.9)";
              el.style.borderLeftColor = hot === "1" ? "rgba(170,240,255,0.95)" : "rgba(140,225,255,0.55)";
            }
          }
          if (alpha < 0.02 || !px) {
            el.style.visibility = "hidden";
            if (el.style.opacity !== "0") el.style.opacity = "0";
            continue;
          }
          const orbEdge=inspectRef.current && r.labelPriority===3 ? projectToPixels(r.world.clone().addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),arbor.getRecordRadius(r.id))) : null;
          const pad=orbEdge ? Math.max(9,Math.hypot(orbEdge.x-px.x,orbEdge.y-px.y)+8) : 9;
          const candidates=[[px.x+pad,px.y-14],[px.x-pad-el.offsetWidth,px.y-14],[px.x-el.offsetWidth/2,px.y-pad-el.offsetHeight],[px.x-el.offsetWidth/2,px.y+pad]];
          const box=candidates.map(([left,top])=>({left,top,right:left+el.offsetWidth,bottom:top+el.offsetHeight})).find(box=>{
            const overlap=occupied.some(o=>box.left<o.right+6 && box.right>o.left-6 && box.top<o.bottom+6 && box.bottom>o.top-6);
            const overCore=corePx && Math.hypot(Math.max(box.left,Math.min(corePx.x,box.right))-corePx.x,Math.max(box.top,Math.min(corePx.y,box.bottom))-corePx.y)<coreRadius;
            return !overlap && !overCore && box.left>=6 && box.right<=container.clientWidth-6 && box.top>=76 && box.bottom<=container.clientHeight-10;
          });
          if(!box) {
            el.style.visibility="hidden";el.style.opacity="0";continue;
          }
          occupied.push(box);
          el.style.visibility = "visible";
          el.style.transform = `translate(${box.left.toFixed(1)}px, ${box.top.toFixed(1)}px)`;
          el.style.opacity = alpha.toFixed(2);
        }
      }

      renderer.render(scene, camera);

      // Verification probe: max/mean luminance of screen rects, read right after the frame is drawn.
      const probe = (window as unknown as { __BRAIN_PROBE?: { active: boolean; rects: { x: number; y: number; w: number; h: number }[]; out: number[][] } }).__BRAIN_PROBE;
      if (probe?.active) {
        const gl = renderer.getContext();
        const dpr = renderer.getPixelRatio();
        const H = renderer.domElement.height;
        const row: number[] = [];
        for (const r of probe.rects) {
          const w = Math.max(1, Math.round(r.w * dpr));
          const h = Math.max(1, Math.round(r.h * dpr));
          const buf = new Uint8Array(w * h * 4);
          gl.readPixels(Math.round(r.x * dpr), H - Math.round((r.y + r.h) * dpr), w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
          let mx = 0;
          let sum = 0;
          for (let i = 0; i < buf.length; i += 4) {
            const l = 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
            if (l > mx) mx = l;
            sum += l;
          }
          row.push(mx, sum / (w * h));
        }
        row.push(performance.now());
        probe.out.push(row);
      }
    };

    // Reload on a Dive lens: begin the plunge already completed so the page lands inside Dive In (no CORE flash).
    // Placed here, once the scene and CORE exist and just before the first frame.
    if (pendingInstantDiveRef.current) {
      pendingInstantDiveRef.current = false;
      startDiveIn();
      if (diveInRef.current) diveInRef.current.progress = 1;
    }
    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      container.removeEventListener("dblclick", handleDiveSkip);
      diveNetwork.dispose();diveNetworkRef.current=null;
      renderer.domElement.removeEventListener("pointerdown", onCoreDown, { capture: true });
      window.removeEventListener("pointermove", onCoreMove);
      window.removeEventListener("pointerup", onCoreUp);
      window.removeEventListener("resize", handleResize);
      journeySurface.removeEventListener("wheel", handleWheel, true);
      controls.removeEventListener("start", onInteractionStart);
      controls.removeEventListener("end", onInteractionEnd);
      controls.removeEventListener("change", onControlsChange);
      arbor?.dispose();
      lightning?.dispose();
      brainFieldRef.current = null;
      neutronCore?.dispose();
      orbitals?.dispose();
      starGeo.dispose();
      starMat.dispose();
      transitGeo.dispose();
      transitMat.dispose();


      renderer.dispose();
    };
  }, [cancelTransitions, clearBrainFocus]);

  // 3. Map real knowledge records onto arbor junctions when graph data changes.
  // Same topology => the arbor keeps its motion state; nothing is rebuilt or reset.
  useEffect(() => {
    if (!brainFieldRef.current || !graphData) return;
    brainFieldRef.current.setKnowledge(graphData.nodes, graphData.links, graphData.categories);
    brainFieldRef.current.setActiveCategories(activeCategories);
    diveNetworkRef.current?.setGraph(graphData.nodes,graphData.links,id=>brainFieldRef.current?.getRecordWorld(id)??null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphData]);

  // Sync category filters to the arbor
  useEffect(() => {
    brainFieldRef.current?.setActiveCategories(activeCategories);
  }, [activeCategories]);

  // Sync selected node to the arbor
  useEffect(() => {
    brainFieldRef.current?.setSelectedNode(selectedNode?.id ?? null);
    diveNetworkRef.current?.setFocus(selectedNode?.id??null,hoveredNodeIdRef.current);
  }, [selectedNode]);

  // 4. Raycasting for Node Hover, AI Core Hover, and Click Interactions
  useEffect(() => {
    const container = containerRef.current;
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    if (!container || !camera || !scene) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerMove = (e: MouseEvent) => {
      if (diveLayerRef.current) {
        container.style.cursor = "default";
        isCoreHoveredRef.current = false;
        return;
      }
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      // Pixel-space cursor position, read every frame in the animate loop for
      // continuous proximity-glow — separate from the NDC `mouse` above,
      // which is only used here for one-shot raycasts on this same event.
      cursorPixelRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true).filter(i=>diveLayerRef.current ? i.object.userData.diveRecord : !i.object.userData.diveRecord);

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
          brainFieldRef.current?.setHoveredNode(nodeId, connectedTargets);
          diveNetworkRef.current?.setHovered(nodeId);
        }
      } else if (hoveredNodeIdRef.current !== null) {
        hoveredNodeIdRef.current = null;
        connectedTargetsRef.current = new Set();
        brainFieldRef.current?.setHoveredNode(null, new Set());
        diveNetworkRef.current?.setHovered(null);
        if (!coreHit) container.style.cursor = "default";
      } else if (!coreHit) {
        container.style.cursor = "default";
      }
    };

    const handleClick = (e: MouseEvent) => {
      if (diveLayerRef.current) { pressAt = null; return; }
      if(e.target instanceof Element && e.target.closest(".spatial-header,.surface-glass,.nora-conversation,.studio-command-dock-wrapper,[data-dive-inspector],input,textarea,select")){pressAt=null;return;}
      if(coreOwnsClickRef.current){if(selectedNodeRef.current && pressAt && Math.hypot(e.clientX-pressAt.x,e.clientY-pressAt.y)<=5)closeInspection();coreOwnsClickRef.current=false;pressAt=null;return;}
      if(!pressAt || Math.hypot(e.clientX-pressAt.x,e.clientY-pressAt.y)>5){pressAt=null;return;}
      lastInteractionRef.current = performance.now();
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true).filter(i=>diveLayerRef.current ? i.object.userData.diveRecord : !i.object.userData.diveRecord);

      // Check if Graph Node is clicked -> Open Note Reader
      const nodeHit = intersects.find((i) => i.object.userData?.node);
      if (nodeHit) {
        const node = nodeHit.object.userData.node as GraphNode;
        setSelectedNode(node);
      } else if (pressAt && Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) <= 5 && (selectedNodeRef.current || !intersects.some((i) => i.object.userData?.isCoreOrb))) {
        // a plain click on empty space (not an orbit drag, not the core) ends the selection and releases the node
        closeInspection();
      }
      pressAt = null;
    };
    const handleNodeDoubleClick=(e:MouseEvent)=>{
      if(isCoreHoveredRef.current || diveInRef.current || diveLayerRef.current)return;
      const rect=container.getBoundingClientRect();mouse.set(((e.clientX-rect.left)/rect.width)*2-1,-((e.clientY-rect.top)/rect.height)*2+1);
      raycaster.setFromCamera(mouse,camera);
      const hit=raycaster.intersectObjects(scene.children,true).find(i=>i.object.userData?.nodeId);
      if(hit)labelSelectRef.current(hit.object.userData.nodeId,true);
    };
    let pressAt: { x: number; y: number } | null = null;
    const handlePressAt = (e: PointerEvent) => {
      coreOwnsClickRef.current=false;
      pressAt = { x: e.clientX, y: e.clientY };
    };

    // Reset proximity target when the cursor actually leaves the canvas —
    // otherwise the glow would stay stuck at its last position (e.g. after
    // moving onto a HUD panel) instead of fading back out.
    const handlePointerLeave = () => {
      cursorPixelRef.current = { x: -99999, y: -99999 };
      hoveredNodeIdRef.current = null;
      brainFieldRef.current?.setHoveredNode(null, new Set());
    };

    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerleave", handlePointerLeave);
    container.addEventListener("dblclick",handleNodeDoubleClick);
    container.addEventListener("click", handleClick);
    container.addEventListener("pointerdown", handlePressAt);

    return () => {
      container.removeEventListener("pointerdown", handlePressAt);
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerleave", handlePointerLeave);
      container.removeEventListener("dblclick",handleNodeDoubleClick);
      container.removeEventListener("click", handleClick);
    };
  }, [graphData, activeCategories, closeInspection]);

  // Sidebar list hover: locate a record in the field (size + ring + label) and show its real neighbours.
  const handleListHover = (id: string | null) => {
    listHoverIdRef.current = id;
    if (id === null) {
      if (!hoveredNodeIdRef.current) {
        connectedTargetsRef.current = new Set();
        brainFieldRef.current?.setHoveredNode(null, new Set());
      }
      return;
    }
    const connected = new Set<string>([id]);
    graphData?.links.forEach((l) => {
      const s = typeof l.source === "object" ? (l.source as { id: string }).id : l.source;
      const t = typeof l.target === "object" ? (l.target as { id: string }).id : l.target;
      if (s === id) connected.add(t);
      if (t === id) connected.add(s);
    });
    connectedTargetsRef.current = connected;
    brainFieldRef.current?.setHoveredNode(id, connected);
  };

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
    <div data-spatial-viewport className={`relative w-full h-full overflow-hidden select-none ${className}`}>
      {/* 3D Canvas Viewport */}
      <div ref={containerRef} className="w-full h-full inset-0 absolute" />

      {/* Record label layer (positioned per frame from the WebGL scene) */}
      <div ref={labelLayerRef} data-brain-labels className="pointer-events-none absolute inset-0 z-[25] overflow-hidden" />

      {diveLayer && <div ref={diveLandingRef} data-dive-journey inert className="absolute inset-0" style={{opacity:0}}><DiveOverview initialLensId={diveInitialLens} /></div>}

      {/* white flash through the core's surface */}
      <div ref={flashRef} aria-hidden className="pointer-events-none absolute inset-0 z-[60] bg-[radial-gradient(circle_at_center,#ffffff_0%,#dff7ff_45%,#7fd8ff_100%)] opacity-0" />

      {/* Spatial HUD Overlay — dissolves while the camera dives into the core */}
      <div className={isDiving ? "journey-hud" : undefined}>
      <SpatialHud
        visualMode={visualMode}
        coreZoomProgress={coreZoomProgress}
        onEnterCore={handleEnterCore}
        currentTier={currentTier}
        onSelectTier={handleSelectTier}
        diveActive={diveLayer}
        onDiveIn={() => startDiveInRef.current()}
        categories={graphData?.categories || []}
        activeCategories={activeCategories}
        onToggleCategory={handleToggleCategory}
        onSoloCategory={handleSoloCategory}
        allNodes={graphData?.nodes || []}
        onFocusNode={(node)=>labelSelectRef.current(node.id,true)}
        onSelectNode={(node) => {
          labelSelectRef.current(node.id,false);
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
        selectedNode={selectedNode}
        onHoverNode={handleListHover}
        onHoverNodes={(ids) => {
          const connected = new Set(ids);
          connectedTargetsRef.current = connected;
          brainFieldRef.current?.setHoveredNode(null, connected);
        }}
        onFitGraph={() => {
          closeInspection();
          inspectTravelRef.current = null;
          inspectRef.current = null;
          handleSelectTier("brain");
        }}
        onOpenNode={(node) => setSelectedNode(node)}
        useGpuCore={USE_GPU_CORE}
        onListeningChange={setIsListening}
      />
      </div>

      {/* 5. CORE Pipeline 5th Zoom Tier Overlay (z=-70) */}
      <div
        ref={coreOverlayRef}
        aria-hidden={currentTier !== "core"}
        inert={currentTier !== "core" ? true : undefined}
        className={`absolute inset-0 z-20 transition-all duration-500 overflow-x-hidden overflow-y-auto bg-[#050811] ${
          currentTier === "core" && visualMode === "missions"
            ? "opacity-100 pointer-events-auto translate-y-0"
            : "opacity-0 pointer-events-none translate-y-4"
        }`}
      >
        <CoreZoomTier className="pt-28 pb-28 px-3 sm:px-4 md:px-8 max-w-7xl mx-auto" />
      </div>

      {/* Note Reader Modal (Wikilinks & Markdown Previews) */}
      <NoteReaderModal
        node={diveLayer || isDiving ? null : selectedNode}
        allNodes={graphData?.nodes || []}
        allLinks={graphData?.links || []}
        onClose={closeInspection}
        onSelectNode={(node) => {
          labelSelectRef.current(node.id,true);
        }}
      />

      {/* Business Comms Triage Hub (Slack, Notion, HubSpot) */}
      <BusinessHubModal
        isOpen={isBusinessHubOpen}
        onClose={() => setIsBusinessHubOpen(false)}
        telemetryData={telemetryData}
      />
    </div>
  );
}
