import type { OverviewSnapshot } from "@/lib/overviewSnapshot";
import type { MissionRowState } from "./missionStates";

/**
 * What the Mission Nucleus may claim about liveness. A persisted `running` job is not proof that anything
 * is executing: only `confirmed` (an executor reports the mission) may be presented as live.
 */
export type LiveEvidence = "confirmed" | "unconfirmed" | "unverifiable" | "not-applicable";

type ExecutorFacts = Pick<OverviewSnapshot, "executingNow"> | null | undefined;

/** Executor confirmation applies only to a recorded-running mission; every other state is a recorded outcome. */
export function missionLiveEvidence(state: MissionRowState, missionId: string, snapshot: ExecutorFacts): LiveEvidence {
  if (state !== "running") return "not-applicable";
  // The id list is only meaningful when the executor could actually be checked.
  if (!snapshot || !snapshot.executingNow.confirmable) return "unverifiable";
  return snapshot.executingNow.missionIds.includes(missionId) ? "confirmed" : "unconfirmed";
}
