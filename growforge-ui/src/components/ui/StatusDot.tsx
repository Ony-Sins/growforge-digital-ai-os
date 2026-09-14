import type { AgentStatus } from "@/lib/agents";

const STATUS_STYLES: Record<AgentStatus, { dot: string; ring: string; label: string }> = {
  active: {
    dot: "bg-electric",
    ring: "shadow-[0_0_8px_2px_rgba(0,120,255,0.55)]",
    label: "Active",
  },
  success: {
    dot: "bg-emerald",
    ring: "shadow-[0_0_8px_2px_rgba(16,185,129,0.5)]",
    label: "Success",
  },
  error: {
    dot: "bg-crimson",
    ring: "shadow-[0_0_8px_2px_rgba(225,29,72,0.5)]",
    label: "Error",
  },
  idle: {
    dot: "bg-muted",
    ring: "",
    label: "Idle",
  },
};

export function StatusDot({
  status,
  pulse = false,
}: {
  status: AgentStatus;
  pulse?: boolean;
}) {
  const s = STATUS_STYLES[status];
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      {pulse && status !== "idle" && (
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full ${s.dot} opacity-60`}
        />
      )}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${s.dot} ${s.ring}`} />
    </span>
  );
}

export function statusLabel(status: AgentStatus) {
  return STATUS_STYLES[status].label;
}

export function statusTextClass(status: AgentStatus) {
  switch (status) {
    case "active":
      return "text-electric";
    case "success":
      return "text-emerald";
    case "error":
      return "text-crimson";
    default:
      return "text-muted";
  }
}
