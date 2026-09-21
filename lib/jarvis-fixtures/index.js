// Fixture layer for the Phase 2 UI port.
//
// Everything the ported Jarvis interface renders in this phase comes from here:
// nothing reads Supabase missions, workspace data, or Hermes. The fixtures are
// deliberately marked so the UI can say plainly that no runtime is connected.

export { AGENTS, AGENT_COLORS, FLEET, agentByName, agentColor } from "./agents.js";
export {
  ARMORY_STATUS,
  FIXTURE_TOOLS,
  fixtureConnectedCount,
  fixtureTools,
} from "./tools.js";
export {
  BUILD_STAGES,
  FIXTURE_MISSIONS,
  FIXTURE_NOTICE,
  FLEET_STAGES,
  fixtureKindKeys,
  fixtureMission,
  fixtureMissions,
} from "./missions.js";
