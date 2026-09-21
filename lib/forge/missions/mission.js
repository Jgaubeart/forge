// The runtime-neutral mission model.
//
// This is the domain object the fixtures, the UI, and (later) the persistence
// layer share. Nothing here writes to a database, calls a network, or imports
// Hermes: a mission is created, advanced, paused for approval, completed,
// failed, or cancelled entirely in memory.

import { FLEET_SLUG, agentBySlug } from "../agents/index.js";
import {
  MISSION_STATUS,
  isActiveMission as isActiveStatus,
  isTerminalMission as isTerminalStatus,
  transitionMission,
} from "./lifecycle.js";
import { MISSION_EVENT, appendMissionEvent, createMissionEvent } from "./events.js";
import { advanceStage, stagesForKind } from "./stages.js";
import { missionKind, missionTitle } from "./kinds.js";
import { consumeApproval, decideApproval } from "./approvals.js";
import { normalizeResult } from "./results.js";

export function createMission({
  id,
  kind,
  brief = "",
  at = null,
  requestedBy = null,
  leadAgent = null,
  fleet = null,
}) {
  const definition = missionKind(kind);
  if (!definition) return { ok: false, reason: "unknown_kind", mission: null };

  const text = String(brief ?? "").trim();
  if (definition.brief.required && !text) {
    return { ok: false, reason: "brief_required", mission: null };
  }
  if (text.length > definition.brief.maxLength) {
    return { ok: false, reason: "brief_too_long", mission: null };
  }

  const stages = stagesForKind(definition.kind);
  const created = at ?? new Date(0).toISOString();
  const lead = leadAgent ?? definition.leadAgent;

  const mission = {
    id: id ?? `${definition.kind}-${created}`,
    kind: definition.kind,
    title: missionTitle(definition.kind, text),
    icon: definition.icon,
    kindTitle: definition.title,
    brief: text,
    status: MISSION_STATUS.queued,
    leadSlug: lead,
    leadName: agentBySlug(lead)?.name ?? String(lead).toUpperCase(),
    fleet: fleet ?? definition.fleet ?? null,
    capability: definition.capability,
    currentStage: stages[0],
    reached: [stages[0]],
    team: [],
    events: [],
    approval: null,
    result: null,
    error: null,
    resultType: definition.resultType,
    cancellationAllowed: definition.cancellationAllowed,
    requestedBy,
    createdAt: created,
    updatedAt: created,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    cancelledAt: null,
    cancellation: null,
  };

  return {
    ok: true,
    mission: withEvent(mission, {
      type: MISSION_EVENT.missionCreated,
      at: created,
      actorAgent: lead,
      metadata: { kind: definition.kind, fleet: mission.fleet ?? "" },
    }),
  };
}

export function assignTeam(mission, slugs, { at = null, roles = {} } = {}) {
  const members = slugs.map((slug) => ({
    slug,
    name: agentBySlug(slug)?.name ?? String(slug).toUpperCase(),
    role: roles[slug] ?? agentBySlug(slug)?.role.toLowerCase() ?? "worker",
    state: "assigned",
  }));

  let next = { ...mission, team: members, updatedAt: at ?? mission.updatedAt };
  for (const member of members) {
    next = withEvent(next, {
      type: MISSION_EVENT.agentAssigned,
      at,
      actorAgent: member.slug,
      metadata: { role: member.role },
    });
  }
  return next;
}

export function startMission(mission, { at = null, work = null } = {}) {
  const transition = transitionMission(mission, MISSION_STATUS.running, { at });
  if (!transition.ok) return { ok: false, reason: transition.reason, mission };

  const started = withEvent(transition.mission, {
    type: MISSION_EVENT.missionStarted,
    at,
    actorAgent: transition.mission.leadSlug,
  });

  return {
    ok: true,
    mission: work
      ? withEvent(started, {
          type: MISSION_EVENT.agentStarted,
          at,
          actorAgent: transition.mission.leadSlug,
          metadata: { work },
        })
      : started,
  };
}

export function setMissionStage(mission, stage, { at = null } = {}) {
  const advanced = advanceStage(mission, stage);
  if (!advanced.ok) return advanced;

  return {
    ok: true,
    mission: withEvent(advanced.mission, {
      type: MISSION_EVENT.missionStageChanged,
      at,
      actorAgent: mission.leadSlug,
      metadata: { stage },
    }),
  };
}

// Approval is a lifecycle boundary: the mission parks in waiting_approval with
// the staged action attached, and nothing proceeds until the operator decides.
export function requestApproval(mission, { approval, at = null }) {
  if (!approval) return { ok: false, reason: "missing_approval", mission };
  if (mission.approval && mission.approval.state === "pending") {
    return { ok: false, reason: "approval_already_pending", mission };
  }

  const transition = transitionMission(mission, MISSION_STATUS.waitingApproval, { at });
  if (!transition.ok) return { ok: false, reason: transition.reason, mission };

  return {
    ok: true,
    mission: withEvent({ ...transition.mission, approval }, {
      type: MISSION_EVENT.approvalRequested,
      at,
      actorAgent: mission.leadSlug,
      metadata: {
        tool: approval.tool,
        capability: approval.capability,
        expiresAt: approval.expiresAt ?? "",
      },
    }),
  };
}

export function resolveApproval(mission, decision, { at = null, by = null } = {}) {
  const current = mission.approval;
  if (!current) return { ok: false, reason: "no_approval", mission };

  const decided = decideApproval(current, decision, { at, by });
  if (!decided.ok) return { ok: false, reason: decided.reason, mission };

  const event =
    decision === "approved" ? MISSION_EVENT.approvalApproved : MISSION_EVENT.approvalDenied;

  const resumed =
    decision === "approved"
      ? transitionMission({ ...mission, approval: decided.approval }, MISSION_STATUS.running, {
          at,
        })
      : { ok: true, mission: { ...mission, approval: decided.approval } };

  return {
    ok: true,
    mission: withEvent({ ...resumed.mission, approval: decided.approval }, {
      type: event,
      at,
      metadata: { tool: current.tool },
    }),
  };
}

export function consumeMissionApproval(mission, { at = null } = {}) {
  const consumed = consumeApproval(mission.approval, { at });
  if (!consumed.ok) return { ok: false, reason: consumed.reason, mission };
  return { ok: true, mission: { ...mission, approval: consumed.approval } };
}

export function completeMission(mission, { result = null, summary = null, at = null } = {}) {
  const normalized = result ? normalizeResult(mission.resultType, result) : null;

  const transition = transitionMission(mission, MISSION_STATUS.completed, { at, summary });
  if (!transition.ok) return { ok: false, reason: transition.reason, mission };

  let next = transition.mission;
  if (normalized) {
    next = withEvent({ ...next, result: normalized }, {
      type: MISSION_EVENT.resultUpdated,
      at,
      metadata: { resultType: normalized.kind },
    });
  }

  const lastStage = stagesForKind(mission.kind).at(-1);
  const staged = next.currentStage === lastStage ? next : { ...next, currentStage: lastStage, reached: stagesForKind(mission.kind) };

  return {
    ok: true,
    mission: withEvent(staged, { type: MISSION_EVENT.missionCompleted, at, summary }),
  };
}

// Attaches a validated result without finishing the mission — used when a
// mission is paused for approval but its draft already exists, and by the
// runtime when a result arrives before the mission is closed.
export function setMissionResult(mission, { result, at = null } = {}) {
  if (!result) return { ok: false, reason: "missing_result", mission };

  const normalized = normalizeResult(mission.resultType, result);
  if (normalized.kind === "malformed") {
    return { ok: false, reason: "malformed_result", mission };
  }

  return {
    ok: true,
    mission: withEvent({ ...mission, result: normalized }, {
      type: MISSION_EVENT.resultUpdated,
      at,
      metadata: { resultType: normalized.kind },
    }),
  };
}

export function failMission(mission, { error, at = null } = {}) {
  const transition = transitionMission(mission, MISSION_STATUS.failed, { at });
  if (!transition.ok) return { ok: false, reason: transition.reason, mission };

  return {
    ok: true,
    mission: withEvent(
      { ...transition.mission, error: String(error ?? "Mission stopped").slice(0, 400) },
      { type: MISSION_EVENT.missionFailed, at, summary: error ?? null }
    ),
  };
}

// Cancellation stops future progression, keeps every prior event, keeps any
// partial result, records the cancellation, and is terminal. Nothing is deleted.
export function cancelMission(mission, { at = null, by = null, reason = null } = {}) {
  if (!mission.cancellationAllowed) {
    return { ok: false, reason: "cancellation_not_allowed", mission };
  }
  if (!isActiveStatus(mission.status)) {
    return { ok: false, reason: "not_active", mission };
  }

  const transition = transitionMission(mission, MISSION_STATUS.cancelled, {
    at,
    summary: reason,
  });
  if (!transition.ok) return { ok: false, reason: transition.reason, mission };

  return {
    ok: true,
    mission: withEvent(transition.mission, {
      type: MISSION_EVENT.missionCancelled,
      at,
      actorUser: by,
      summary: reason,
      metadata: { partialResult: Boolean(mission.result) },
    }),
  };
}

export const missionIsTerminal = isTerminalStatus;
export const missionIsActive = isActiveStatus;

function withEvent(mission, spec) {
  const created = createMissionEvent(spec);
  if (!created.ok) return mission;
  return appendMissionEvent(mission, created.event);
}
