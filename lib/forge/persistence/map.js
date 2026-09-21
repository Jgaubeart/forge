import {
  MISSION_STATUS,
  approvalSummary,
  createApproval,
  createMissionEvent,
  missionKind,
  missionTitle,
  normalizeResult,
  normalizeStatus,
  stagesForKind,
} from "../missions/index.js";

// Domain object  <->  database row.
//
// Mapping is explicit and lives here only: the UI never sees a row, and the
// domain never sees a column. Results are validated on the way in *and* on the
// way out, so a malformed persisted result degrades to the safe fallback rather
// than reaching a renderer.

// --------------------------------------------------------------- missions ----

export function missionRowToDomain(row, { events = [], approvals = [], team = [] } = {}) {
  if (!row) return null;

  const kind = missionKind(row.kind ?? "general");
  const stages = stagesForKind(row.kind ?? "general");
  const reached = Array.isArray(row.reached_stages) ? row.reached_stages : [];
  const pendingApproval = approvals.find((approval) => approval.state === "pending") ?? null;

  return {
    id: row.id,
    kind: row.kind ?? "general",
    kindTitle: kind?.title ?? "MISSION",
    icon: row.icon ?? kind?.icon ?? "🎯",
    title: row.input?.title ?? missionTitle(row.kind ?? "general", row.input?.brief ?? ""),
    brief: row.input?.brief ?? "",
    status: normalizeStatus(row.status) ?? MISSION_STATUS.queued,
    leadSlug: row.policy?.lead_agent ?? "jarvis",
    leadName: row.policy?.lead_name ?? String(row.policy?.lead_agent ?? "jarvis").toUpperCase(),
    fleet: row.policy?.fleet ?? null,
    capability: row.policy?.capability ?? null,
    currentStage: row.current_stage ?? stages[0],
    reached: reached.length > 0 ? reached : [stages[0]],
    team: team.length > 0 ? team : (row.policy?.team ?? []).map((slug) => ({ slug, state: "assigned" })),
    events: events.map(eventRowToDomain),
    // Approval domains are built by approvalRowToDomain; a raw row is never
    // handed to the UI.
    approval: pendingApproval ?? approvals[0] ?? null,
    approvals: approvals.map((approval) => approval),
    result: row.result && Object.keys(row.result).length > 0
      ? normalizeResult(kind?.resultType ?? "build", row.result)
      : null,
    error: row.error?.message ?? (typeof row.error === "string" ? row.error : null),
    resultType: kind?.resultType ?? "build",
    cancellationAllowed: kind?.cancellationAllowed ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    cancelledAt: row.cancelled_at ?? null,
    cancellation: row.cancel_requested_at
      ? { at: row.cancel_requested_at, reason: row.current_step ?? null }
      : null,
    workspaceId: row.workspace_id,
    requestedBy: row.requested_by,
    agentId: row.agent_id,
    fleetId: row.fleet_id ?? null,
  };
}

// The insert payload for a freshly created mission. Status, stage, and stages
// reached come from the Phase 4 factory rather than being recomputed here.
export function missionDomainToRow(mission, { workspaceId, agentId, fleetId = null }) {
  return {
    workspace_id: workspaceId,
    agent_id: agentId,
    requested_by: mission.requestedBy,
    action_level: "read",
    input: { title: mission.title, brief: mission.brief },
    status: mission.status,
    kind: mission.kind,
    icon: mission.icon,
    fleet_id: fleetId,
    current_stage: mission.currentStage,
    reached_stages: mission.reached,
    current_step: null,
    policy: {
      capability: mission.capability,
      lead_agent: mission.leadSlug,
      fleet: mission.fleet,
      team: mission.team.map((member) => member.slug ?? member),
    },
    result: {},
  };
}

// ----------------------------------------------------------------- events ----

export function eventRowToDomain(row) {
  return {
    id: String(row.id),
    type: row.event_type,
    at: row.created_at,
    actor: row.actor_label
      ? { agent: row.actor_label, user: row.actor_user_id ?? null }
      : row.actor_user_id
        ? { user: row.actor_user_id }
        : null,
    summary: row.summary ?? null,
    metadata: row.metadata ?? {},
  };
}

export function eventDomainToRow(event, { workspaceId, taskId, agentRunId = null }) {
  const created = createMissionEvent({
    id: event.id,
    type: event.type,
    at: event.at,
    actorAgent: event.actor?.agent ?? null,
    actorUser: event.actor?.user ?? null,
    summary: event.summary,
    metadata: event.metadata,
  });

  if (!created.ok) return null;

  return {
    workspace_id: workspaceId,
    task_id: taskId,
    agent_run_id: agentRunId,
    event_type: created.event.type,
    actor_user_id: created.event.actor?.user ?? null,
    actor_label: created.event.actor?.agent ?? null,
    summary: created.event.summary,
    metadata: created.event.metadata,
    created_at: created.event.at ?? undefined,
  };
}

// -------------------------------------------------------------- approvals ----

const APPROVAL_STATE_FROM_ROW = {
  pending: "pending",
  approved: "approved",
  denied: "denied",
  expired: "expired",
  consumed: "consumed",
};

export function approvalRowToDomain(row) {
  if (!row) return null;

  const created = createApproval({
    id: row.id,
    tool: row.tool ?? row.capability,
    capability: row.capability,
    args: row.action_payload ?? {},
    destination: row.destination ?? null,
    requestedBy: row.requested_by ?? null,
    expiresAt: row.expires_at ?? null,
    now: row.created_at ?? null,
  });

  const base = created.ok ? created.approval : { id: row.id, tool: row.tool, capability: row.capability, args: row.action_payload ?? {} };

  return {
    ...base,
    state: APPROVAL_STATE_FROM_ROW[row.status] ?? "pending",
    requestedAt: row.created_at ?? null,
    decidedBy: row.decided_by ?? null,
    decidedAt: row.decided_at ?? null,
    consumedAt: row.consumed_at ?? null,
    payloadFingerprint: row.payload_fingerprint ?? base.payloadFingerprint ?? null,
    taskId: row.task_id,
    agentRunId: row.agent_run_id ?? null,
    lines: approvalSummary(base),
  };
}

export function approvalDomainToRow(approval, { taskId, agentRunId = null }) {
  return {
    task_id: taskId,
    agent_run_id: agentRunId,
    requested_by: approval.requestedBy,
    capability: approval.capability,
    tool: approval.tool,
    action_level: null,
    destination: approval.destination ?? null,
    action_payload: approval.args,
    payload_fingerprint: approval.payloadFingerprint,
    status: approval.state,
    expires_at: approval.expiresAt ?? null,
  };
}
