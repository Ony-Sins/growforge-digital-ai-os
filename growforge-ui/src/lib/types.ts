/**
 * Shared client-safe types for the growforge-ui API.
 *
 * Kept separate from agentStore.ts (which touches node:fs) so client
 * components can import these types without pulling a server-only module
 * into the browser bundle.
 */

export type LogLevel = "info" | "success" | "error";

export interface LogEntry {
  id: number;
  timestamp: string;
  agentId: string | null;
  level: LogLevel;
  message: string;
}
