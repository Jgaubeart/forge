// Thin re-exports so the fixture tests read the mission model the UI reads.
export {
  MISSION_KIND_KEYS,
  MISSION_STATUSES,
  isKnownEventType,
  isValidStatus,
  stagesForKind,
} from "../../lib/forge/missions/index.js";

import { stagesForKind } from "../../lib/forge/missions/index.js";

export function stageChipsFrom(mission) {
  return stagesForKind(mission.kind).map((stage) => ({
    stage,
    on: mission.reached.includes(stage),
  }));
}
