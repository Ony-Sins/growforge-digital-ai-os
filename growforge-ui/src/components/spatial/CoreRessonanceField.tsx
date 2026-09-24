"use client";

import React, { useEffect, useRef, useState } from "react";

interface RessonanceWave {
  id: string;
  intensity: number; // 0-1
  color: string; // hex
  frequency: number; // waves per second
  amplitude: number; // pixel height
}

interface DepartmentNode {
  id: string;
  name: string;
  angle: number; // 0-360 degrees around circle
  status: "active" | "waiting" | "blocked" | "done" | "idle";
  agentCount: number;
}

interface AgentPerturbation {
  id: string;
  deptId: string;
  progress: number; // 0-100
  status: "active" | "waiting" | "blocked" | "done";
  disturbanceIntensity: number; // how much wave is disturbed (0-1)
}

export interface CoreRessonanceFieldProps {
  departments: DepartmentNode[];
  agents: AgentPerturbation[];
  coreIntensity: number; // 0-1, how active is the core
  onAgentClick?: (agentId: string) => void;
}

const CANVAS_SIZE = 1000;
const CENTER_X = CANVAS_SIZE / 2;
const CENTER_Y = CANVAS_SIZE / 2;
const CORE_RADIUS = 60;
const WAVE_COUNT = 5;
const MAX_WAVE_RADIUS = 350;

function getStatusColor(status: string): string {
  switch (status) {
    case "active":
      return "#00d4ff"; // bright cyan
    case "done":
      return "#ffc432"; // gold
    case "waiting":
      return "#f59e0b"; // amber
    case "blocked":
      return "#ef4444"; // red
    default:
      return "#64748b"; // gray
  }
}

function getPerturbationPath(
  centerX: number,
  centerY: number,
  baseRadius: number,
  angle: number,
  disturbance: number,
  time: number
): string {
  // Sine wave along the radial line, disturbed by agent activity
  const points: string[] = [];
  const steps = 50;
  const waveAmplitude = 8 + disturbance * 12; // wave height increases with disturbance

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = baseRadius * t;
    const waveOffset = Math.sin(t * Math.PI * 3 + time * 0.05) * waveAmplitude;
    const actualR = r + waveOffset;

    const rad = (angle * Math.PI) / 180;
    const x = centerX + Math.cos(rad) * actualR;
    const y = centerY + Math.sin(rad) * actualR;

    if (i === 0) points.push(`M ${x} ${y}`);
    else points.push(`L ${x} ${y}`);
  }

  return points.join(" ");
}

function drawWaveRings(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  time: number,
  agents: AgentPerturbation[]
): void {
  // Draw concentric wave rings
  for (let wave = 1; wave <= WAVE_COUNT; wave++) {
    const baseRadius = (MAX_WAVE_RADIUS / WAVE_COUNT) * wave;
    const waveIntensity = Math.sin((time * 2 + wave) * 0.05) * 0.5 + 0.5; // 0-1
    const disturbances = agents.filter((a) => a.status === "active").length;
    const overallDisturbance = Math.min(disturbances / 3, 1); // max out at 3 disturbances

    // Main wave ring
    ctx.strokeStyle = `rgba(0, 212, 255, ${0.3 + waveIntensity * 0.3 + overallDisturbance * 0.2})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Perturbed wave (sinusoidal distortion)
    const distortedRadius = baseRadius + Math.sin(time * 0.03 + wave) * 15;
    ctx.strokeStyle = `rgba(0, 212, 255, ${0.15 + overallDisturbance * 0.3})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let angle = 0; angle < Math.PI * 2; angle += 0.05) {
      const r = distortedRadius + Math.sin(angle * 5 + time * 0.02) * (12 * overallDisturbance);
      const x = centerX + Math.cos(angle) * r;
      const y = centerY + Math.sin(angle) * r;
      if (angle === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function drawCoreHeartbeat(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  time: number,
  intensity: number
): void {
  // Central sphere with pulsing glow
  const pulse = Math.sin(time * 0.08) * 0.3 + 0.7; // 0.4 - 1.0
  const glowRadius = CORE_RADIUS * (1 + pulse * 0.3) + intensity * 15;

  // Outer glow
  const gradient = ctx.createRadialGradient(centerX, centerY, CORE_RADIUS, centerX, centerY, glowRadius);
  gradient.addColorStop(0, `rgba(0, 212, 255, ${0.8 * intensity})`);
  gradient.addColorStop(0.5, `rgba(0, 212, 255, ${0.3 * intensity})`);
  gradient.addColorStop(1, "rgba(0, 212, 255, 0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  // Core sphere
  const coreGradient = ctx.createRadialGradient(centerX - 15, centerY - 15, 0, centerX, centerY, CORE_RADIUS);
  coreGradient.addColorStop(0, "#66ffff");
  coreGradient.addColorStop(0.6, "#0099ff");
  coreGradient.addColorStop(1, "#004477");
  ctx.fillStyle = coreGradient;
  ctx.beginPath();
  ctx.arc(centerX, centerY, CORE_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  // Bright highlight
  ctx.fillStyle = `rgba(255, 255, 255, ${0.6 * pulse})`;
  ctx.beginPath();
  ctx.arc(centerX - CORE_RADIUS * 0.3, centerY - CORE_RADIUS * 0.3, CORE_RADIUS * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

function drawDepartmentNodes(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  departments: DepartmentNode[],
  time: number
): void {
  departments.forEach((dept) => {
    const rad = (dept.angle * Math.PI) / 180;
    const nodeRadius = MAX_WAVE_RADIUS * 0.95;
    const x = centerX + Math.cos(rad) * nodeRadius;
    const y = centerY + Math.sin(rad) * nodeRadius;

    const color = getStatusColor(dept.status);
    const isActive = dept.status === "active";
    const pulse = isActive ? Math.sin(time * 0.15) * 0.4 + 0.6 : 0.8; // 0.6-1.0 when active

    // Node glow
    const glowRadius = 16 + (isActive ? 8 : 0);
    const glowGradient = ctx.createRadialGradient(x, y, 8, x, y, glowRadius);
    glowGradient.addColorStop(0, `${color}80`);
    glowGradient.addColorStop(1, `${color}00`);
    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // Node circle
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();

    // Outer ring for active nodes
    if (isActive) {
      ctx.strokeStyle = `${color}${Math.floor(pulse * 255).toString(16).padStart(2, "0")}`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Agent count indicator
    if (dept.agentCount > 0) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(dept.agentCount.toString(), x, y + 20);
    }
  });
}

function drawAgentPerturbations(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  agents: AgentPerturbation[],
  departments: DepartmentNode[],
  time: number
): void {
  agents.forEach((agent) => {
    const dept = departments.find((d) => d.id === agent.deptId);
    if (!dept) return;

    const color = getStatusColor(agent.status);
    const rad = (dept.angle * Math.PI) / 180;

    // Agent moves along the radial line based on progress
    const progressRadius = (MAX_WAVE_RADIUS * 0.95 * agent.progress) / 100;
    const baseRadius = progressRadius + agent.disturbanceIntensity * 30;

    const x = centerX + Math.cos(rad) * baseRadius;
    const y = centerY + Math.sin(rad) * baseRadius;

    // Particle glow
    const glowRadius = 6 + agent.disturbanceIntensity * 4;
    const glowGradient = ctx.createRadialGradient(x, y, 2, x, y, glowRadius);
    glowGradient.addColorStop(0, `${color}cc`);
    glowGradient.addColorStop(1, `${color}00`);
    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // Agent dot
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();

    // Trailing line back to department
    if (agent.status === "active") {
      ctx.strokeStyle = `${color}40`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const deptX = centerX + Math.cos(rad) * (MAX_WAVE_RADIUS * 0.95);
      const deptY = centerY + Math.sin(rad) * (MAX_WAVE_RADIUS * 0.95);
      ctx.moveTo(deptX, deptY);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  });
}

export function CoreRessonanceField({
  departments,
  agents,
  coreIntensity,
  onAgentClick,
}: CoreRessonanceFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [time, setTime] = useState(0);
  const animationFrameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const animate = (_t: DOMHighResTimeStamp) => {
      setTime((t) => t + 1);
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animationFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = "#0a0e27"; // dark navy background
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Draw layers in order
    drawWaveRings(ctx, CENTER_X, CENTER_Y, time, agents);
    drawAgentPerturbations(ctx, CENTER_X, CENTER_Y, agents, departments, time);
    drawDepartmentNodes(ctx, CENTER_X, CENTER_Y, departments, time);
    drawCoreHeartbeat(ctx, CENTER_X, CENTER_Y, time, coreIntensity);

    // Star field background (static)
    if (time === 0) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
      for (let i = 0; i < 200; i++) {
        const x = Math.random() * CANVAS_SIZE;
        const y = Math.random() * CANVAS_SIZE;
        const size = Math.random() * 1.5;
        ctx.fillRect(x, y, size, size);
      }
    }
  }, [time, departments, agents, coreIntensity]);

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-[#0a0e27]">
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        className="max-w-full max-h-full rounded-2xl"
        style={{ filter: "drop-shadow(0 0 40px rgba(0, 212, 255, 0.3))" }}
      />
    </div>
  );
}
