/**
 * MISSIONS layer visual tokens.
 *
 * MISSIONS is an operational REGION of the one persistent universe, not a chart drawn over it.
 * The composition is derived from the selected mission's own recorded structure — its real stages
 * and the departments that genuinely ran inside them — so there is no symmetrical wheel and no
 * second graph system. Everything tunable lives here, alongside ../brain/semanticStyle.ts.
 */

/** Operational state of one department on the current job. Mirrors CoreZoomTier's `hubStatus`. */
export type MissionHubStatus = "unassigned" | "pending" | "active" | "done" | "error";

/** State of one recorded pipeline stage. Mirrors CoreZoomTier's `StageState`. */
export type MissionStageState = "idle" | "queued" | "active" | "done" | "error";

export const MISSION_HUB_COLOR: Record<MissionHubStatus, [number, number, number]> = {
  unassigned: [0.17, 0.21, 0.28], // slate — department was not needed for this mission
  pending: [0.13, 0.83, 0.93], // cyan — assigned, not started
  active: [0.0, 1.0, 0.53], // green — a step is genuinely running right now
  done: [0.06, 0.66, 0.48], // emerald — finished
  error: [0.94, 0.27, 0.27], // red — failed
};

export const MISSION_STAGE_COLOR: Record<MissionStageState, [number, number, number]> = {
  idle: [0.16, 0.2, 0.27],
  queued: [0.22, 0.42, 0.55],
  active: [0.0, 1.0, 0.53],
  done: [0.1, 0.72, 0.85],
  error: [0.94, 0.27, 0.27],
};

/** Stage waypoints are the spine of the mission: bigger and brighter than a single department. */
export const MISSION_STAGE_SIZE: Record<MissionStageState, number> = {
  idle: 9.0,
  queued: 12.0,
  active: 19.0,
  done: 15.0,
  error: 17.0,
};

export const MISSION_HUB_SIZE: Record<MissionHubStatus, number> = {
  unassigned: 4.2,
  pending: 7.5,
  active: 11.0,
  done: 8.5,
  error: 10.0,
};

export const MISSION_LINK_OPACITY: Record<MissionHubStatus, number> = {
  unassigned: 0.08,
  pending: 0.3,
  active: 0.62,
  done: 0.42,
  error: 0.5,
};

/** Spine segment brightness. A finished corridor stays lit but calm — never "busy". */
export const MISSION_SPINE_OPACITY: Record<MissionStageState, number> = {
  idle: 0.1,
  queued: 0.26,
  active: 0.8,
  done: 0.62,
  error: 0.66,
};

export const MISSION_HUB_OPACITY: Record<MissionHubStatus, number> = {
  unassigned: 0.3,
  pending: 0.85,
  active: 1.0,
  done: 0.8,
  error: 0.95,
};

/**
 * Corridor geometry, in CSS pixels on screen. The corridor's world size is solved per frame from
 * these targets so it holds a readable scale at any camera distance.
 *
 * An earlier revision placed departments on an evenly-spaced ring around the nucleus. It was
 * rejected on sight: a symmetrical eight-spoke dial is a generic radial diagram, and it carried no
 * information — every department sat at the same distance whatever it had actually done. The
 * corridor below is laid out from the mission's real stage sequence instead.
 */
// The run EMANATES FROM the core: the first stage sits just off the nucleus and the corridor
// sweeps outward and away. An earlier revision spanned -330..+430 with a 96px rise, which put the
// whole structure above and to the side of the nucleus - it read as rays floating near the core
// rather than work flowing out of it.
export const MISSION_SPINE_START_PX = -150; // first stage, just off the nucleus
export const MISSION_SPINE_END_PX = 355; // final stage, out to the right
export const MISSION_SPINE_RISE_PX = 62; // gentle arc so the corridor is not a straight rule
export const MISSION_SPINE_DEPTH_PX = 165; // recession toward the camera across the run
/** Departments scatter around the stage they actually ran in, seeded by id (never a ring). */
export const MISSION_DEPT_SPREAD_PX = 124;
export const MISSION_DEPT_MIN_PX = 46;
/** Unassigned departments drift further out and stay faint: present, but clearly not involved. */
export const MISSION_DEPT_UNASSIGNED_PUSH = 1.62;

/** Slow breathing drift of the whole corridor. Instrumentation, not decoration. */
export const MISSION_DRIFT_SPEED = 0.085;
export const MISSION_DRIFT_PX = 7;

/** Selected / hovered emphasis. */
export const MISSION_HUB_SELECTED_SCALE = 1.75;
export const MISSION_HUB_HOVER_SCALE = 1.35;

/**
 * Travelling pulse. It runs ONLY along a spine segment whose stage is genuinely `active`, or into
 * a department whose own step is genuinely `active`. A completed mission shows a lit, still
 * corridor — never invented traffic.
 */
export const MISSION_PULSE_PERIOD_SEC = 1.6;
export const MISSION_PULSE_SIZE = 7.0;

/** Screen-space grab radius for picking a department or stage, in CSS pixels (BRAIN-04A pattern). */
export const MISSION_PICK_RADIUS_PX = 22;

/**
 * How far the core's glare is pulled back on the MISSIONS surface.
 *
 * These were originally much heavier, because a node-link corridor had to stay readable in front
 * of the core. That corridor is gone: at depth the core IS the subject, so the damping now only
 * has to stop the envelope collapsing into a flat white disc, not hold it back for something else. At this camera distance the
 * nucleus otherwise blows out the corridor in front of it (requirement 7): the object must stay
 * coherent and luminous while the operational detail around it survives.
 */
export const MISSION_CORONA_DAMP = 0.34;
export const MISSION_NUCLEUS_DAMP = 0.1;
/**
 * Global tone-mapping relief on the MISSIONS surface. The membrane's own exposure is handled in
 * the shader (uMissionCalm); this is the last stop that recovers overall midtone range so the
 * corridor and the core belong to the same image.
 */
export const MISSION_EXPOSURE_DAMP = 0.12;
