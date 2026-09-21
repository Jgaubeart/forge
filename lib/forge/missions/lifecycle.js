// Mission lifecycle: statuses, allowed transitions, and the helpers the domain
// layer and UI share.
//
// Status means "where the mission is in its life". Stage (see stages.js) means
// "what work is happening right now". They are deliberately separate.
//
// Runtime-neutral: no persistence, no network, no Hermes. Persistence will adapt
// to this model later rather than the UI learning database rows.

export const MISSION_STATUS = Object.freeze({
  queued: "queued",
  planning: "planning",
  running: "running",
  waitingApproval: "waiting_approval",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
});

export const MISSION_STATUSES = Object.freeze(Object.values(MISSION_STATUS));

export const TERMINAL_STATUSES = Object.freeze([
  MISSION_STATUS.completed,
  MISSION_STATUS.failed,
  MISSION_STATUS.cancelled,
]);

export const ACTIVE_STATUSES = Object.freeze([
  MISSION_STATUS.queued,
  MISSION_STATUS.planning,
  MISSION_STATUS.running,
  MISSION_STATUS.waitingApproval,
]);

// Reference names from the Jarvis build map onto these canonical ones.
export const REFERENCE_STATUS_ALIASES = Object.freeze({
  running: MISSION_STATUS.running,
  awaiting_confirm: MISSION_STATUS.waitingApproval,
  done: MISSION_STATUS.completed,
  error: MISSION_STATUS.failed,
});

const TRANSITIONS = Object.freeze({
  [MISSION_STATUS.queued]: [
    MISSION_STATUS.planning,
    MISSION_STATUS.running,
    MISSION_STATUS.cancelled,
  ],
  [MISSION_STATUS.planning]: [
    MISSION_STATUS.running,
    MISSION_STATUS.waitingApproval,
    MISSION_STATUS.failed,
    MISSION_STATUS.cancelled,
  ],
  [MISSION_STATUS.running]: [
    MISSION_STATUS.planning,
    MISSION_STATUS.waitingApproval,
    MISSION_STATUS.completed,
    MISSION_STATUS.failed,
    MISSION_STATUS.cancelled,
  ],
  [MISSION_STATUS.waitingApproval]: [
    MISSION_STATUS.running,
    MISSION_STATUS.completed,
    MISSION_STATUS.failed,
    MISSION_STATUS.cancelled,
  ],
  [MISSION_STATUS.completed]: [],
  [MISSION_STATUS.failed]: [],
  [MISSION_STATUS.cancelled]: [],
});

export function normalizeStatus(status) {
  const value = String(status ?? "").trim().toLowerCase();
  if (!value) return null;
  if (MISSION_STATUSES.includes(value)) return value;
  return REFERENCE_STATUS_ALIASES[value] ?? null;
}

export function isValidStatus(status) {
  return normalizeStatus(status) !== null;
}

export function isTerminalMission(status) {
  const value = normalizeStatus(status);
  return value !== null && TERMINAL_STATUSES.includes(value);
}

export function isActiveMission(status) {
  const value = normalizeStatus(status);
  return value !== null && ACTIVE_STATUSES.includes(value);
}

export function allowedTransitions(status) {
  const value = normalizeStatus(status);
  return value ? [...TRANSITIONS[value]] : [];
}

export function canTransitionMission(from, to) {
  const source = normalizeStatus(from);
  const target = normalizeStatus(to);
  if (!source || !target) return false;
  return TRANSITIONS[source].includes(target);
}

export function transitionMission(mission, to, { at = null, summary = null } = {}) {
  const target = normalizeStatus(to);

  if (!target) {
    return { ok: false, reason: "unknown_status", mission };
  }
  if (!canTransitionMission(mission.status, target)) {
    return {
      ok: false,
      reason: isTerminalMission(mission.status) ? "terminal" : "invalid_transition",
      from: normalizeStatus(mission.status),
      to: target,
      mission,
    };
  }

  const timestamp = at ?? new Date(0).toISOString();

  return {
    ok: true,
    mission: {
      ...mission,
      status: target,
      updatedAt: timestamp,
      ...(target === MISSION_STATUS.completed ? { completedAt: timestamp } : {}),
      ...(target === MISSION_STATUS.failed ? { failedAt: timestamp } : {}),
      ...(target === MISSION_STATUS.cancelled
        ? { cancelledAt: timestamp, cancellation: { at: timestamp, reason: summary } }
        : {}),
      ...(target === MISSION_STATUS.running && !mission.startedAt
        ? { startedAt: timestamp }
        : {}),
    },
  };
}
