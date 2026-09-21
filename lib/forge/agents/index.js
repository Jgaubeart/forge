// Canonical Forge workforce model: agents, the Fleet, and mission routing.
//
// Consumed by the UI today (Phase 2 surfaces) and by the runtime adapter later.
// Nothing here touches Supabase, Hermes, the network, or the filesystem.

export {
  ACTION_CEILING,
  AGENTS,
  AGENT_SLUGS,
  CAPABILITY_STATE,
  DEPARTMENTS,
  agentByName,
  agentBySlug,
  agentColor,
  agentNames,
  agentsByDepartment,
  agentsForMissionKind,
} from "./catalog.js";

export {
  FLEET,
  FLEET_BEHAVIOR_CONTRACT,
  FLEET_SLUG,
  fleetMemberSlugs,
} from "./fleet.js";

export {
  MISSION_ROUTES,
  WORK_ROUTES,
  missionKinds,
  routeForMissionKind,
  routeForWork,
} from "./routing.js";

// A single place the UI can ask "what state is this workforce actually in?".
export const WORKFORCE_STATE = Object.freeze({
  capabilityState: "defined",
  runtimeState: "not-connected",
  note: "The workforce model is defined. No runtime, tool, or integration is connected yet.",
});
