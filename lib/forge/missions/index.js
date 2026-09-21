// Canonical Forge mission model.
//
// Kinds, lifecycle, stages, events, approvals, cancellation, result contracts,
// Fleet composition, and the mission factory — all runtime-neutral. The UI reads
// this layer; persistence and the runtime adapter will adapt to it later.

export {
  ACTIVE_STATUSES,
  MISSION_STATUS,
  MISSION_STATUSES,
  REFERENCE_STATUS_ALIASES,
  TERMINAL_STATUSES,
  allowedTransitions,
  canTransitionMission,
  isActiveMission,
  isTerminalMission,
  isValidStatus,
  normalizeStatus,
  transitionMission,
} from "./lifecycle.js";

export {
  MISSION_KINDS,
  MISSION_KIND_KEYS,
  isKnownMissionKind,
  missionKind,
  missionKindsForFleet,
  missionTitle,
} from "./kinds.js";

export {
  STAGE_LABELS,
  STAGE_SETS,
  advanceStage,
  canAdvanceStage,
  isKnownStage,
  reachedStages,
  stageLabel,
  stagesForKind,
} from "./stages.js";

export {
  MISSION_EVENT,
  MISSION_EVENT_TYPES,
  REFERENCE_EVENT_ALIASES,
  appendMissionEvent,
  createMissionEvent,
  describeEvent,
  eventTone,
  isKnownEventType,
  normalizeEventType,
  toolLabel,
} from "./events.js";

export {
  ACTION_LANGUAGE,
  PROVIDER_VERBS,
  actionLanguage,
  assertHonestClaim,
  isHonestClaim,
  requiresReceipt,
} from "./language.js";

export {
  APPROVAL_STATE,
  APPROVAL_STATES,
  approvalSummary,
  canDecide,
  consumeApproval,
  createApproval,
  decideApproval,
  expireApproval,
  isExpired,
} from "./approvals.js";

export {
  MALFORMED_RESULT,
  RESULT_TYPES,
  isResultType,
  normalizeResult,
  validateAnnounceResult,
  validateBuildResult,
  validateFleetResult,
  validateHatersResult,
  validateReaperResult,
  validateResult,
  validateWarroomResult,
} from "./results.js";

export {
  FLEET_WORKER_SECTIONS,
  composeFleetResult,
  fleetCoverage,
  fleetWorkerSlugs,
} from "./fleet-composition.js";

export {
  assignTeam,
  cancelMission,
  completeMission,
  consumeMissionApproval,
  createMission,
  failMission,
  missionIsActive,
  missionIsTerminal,
  requestApproval,
  resolveApproval,
  setMissionResult,
  setMissionStage,
  startMission,
} from "./mission.js";
