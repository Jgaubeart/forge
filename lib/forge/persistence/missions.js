import { assignTeam, createMission, missionKind, stagesForKind } from "../missions/index.js";
import { MISSION_EVENT } from "../missions/events.js";
import { PersistenceError } from "./errors.js";
import {
  eventDomainToRow,
  eventRowToDomain,
  missionDomainToRow,
  missionRowToDomain,
  approvalRowToDomain,
} from "./map.js";

const MISSION_COLUMNS =
  "id, workspace_id, agent_id, requested_by, action_level, input, status, kind, icon, fleet_id, current_stage, reached_stages, result, error, policy, created_at, updated_at, started_at, completed_at, cancelled_at, cancel_requested_at, current_step";

const EVENT_COLUMNS =
  "id, workspace_id, task_id, agent_run_id, event_type, actor_user_id, actor_label, summary, metadata, created_at";

const APPROVAL_COLUMNS =
  "id, task_id, agent_run_id, requested_by, capability, tool, destination, action_payload, payload_fingerprint, status, expires_at, decided_by, decided_at, consumed_at, created_at";

// Creating a mission writes the durable record with the caller's own client (RLS
// requires them to be a workspace member and the requester), and the first
// events through the trusted path, because no browser session may write the
// event stream. If the trusted path is unavailable the mission is still created
// and the caller is told plainly that its event history could not be recorded.
export async function createMissionRecord(
  { userClient, trustedClient },
  { workspaceId, actorUserId, kind, brief, agentId, fleetId = null }
) {
  const built = createMission({ kind, brief, at: new Date().toISOString(), requestedBy: actorUserId });
  if (!built.ok) {
    throw new PersistenceError(built.reason, `Mission could not be created: ${built.reason}.`);
  }

  let mission = built.mission;
  if (mission.fleet) {
    const fleetSlugs = ["scout", "forge", "sage"];
    mission = assignTeam(mission, fleetSlugs, { at: mission.createdAt });
  }

  const { data: row, error } = await userClient
    .from("tasks")
    .insert(missionDomainToRow(mission, { workspaceId, agentId, fleetId }))
    .select(MISSION_COLUMNS)
    .single();

  if (error) throw new PersistenceError("mission_insert_failed", error.message);

  const events = await appendMissionEvents(
    { trustedClient },
    { workspaceId, taskId: row.id, events: mission.events }
  );

  return {
    mission: missionRowToDomain(row, { events, team: mission.team }),
    eventsRecorded: events.length,
    warning: events.length === 0
      ? "The mission was saved, but its event history needs SUPABASE_SERVICE_ROLE_KEY to be recorded."
      : null,
  };
}

export async function appendMissionEvents({ trustedClient }, { workspaceId, taskId, events }) {
  if (!trustedClient || events.length === 0) return [];

  const rows = events
    .map((event) => eventDomainToRow(event, { workspaceId, taskId }))
    .filter(Boolean);

  const { data, error } = await trustedClient
    .from("run_events")
    .insert(rows)
    .select(EVENT_COLUMNS);

  if (error) {
    console.error(`[forge:persistence] event append failed: ${error.message}`);
    return [];
  }
  return (data ?? []).map(eventRowToDomain);
}

export async function listMissions({ userClient }, { workspaceId, limit = 50 }) {
  const { data: rows, error } = await userClient
    .from("tasks")
    .select(MISSION_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw new PersistenceError("mission_list_failed", error.message);
  if (!rows || rows.length === 0) return [];

  const taskIds = rows.map((row) => row.id);
  const [events, approvals] = await Promise.all([
    loadEvents({ userClient }, taskIds),
    loadApprovals({ userClient }, taskIds),
  ]);

  return rows.map((row) =>
    missionRowToDomain(row, {
      events: events.filter((event) => event.task_id === row.id),
      approvals: approvals.filter((approval) => approval.taskId === row.id),
    })
  );
}

export async function getMission({ userClient }, missionId) {
  const { data: row, error } = await userClient
    .from("tasks")
    .select(MISSION_COLUMNS)
    .eq("id", missionId)
    .maybeSingle();

  if (error) throw new PersistenceError("mission_read_failed", error.message);
  if (!row) return null;

  const [events, approvals] = await Promise.all([
    loadEvents({ userClient }, [row.id]),
    loadApprovals({ userClient }, [row.id]),
  ]);

  return missionRowToDomain(row, {
    events: events.filter((event) => event.task_id === row.id),
    approvals: approvals.filter((approval) => approval.taskId === row.id),
  });
}

// Cancellation keeps every prior event and any partial result; it only moves the
// mission to a terminal state and appends the cancellation event.
export async function cancelMissionRecord(
  { userClient, trustedClient },
  { missionId, workspaceId, actorUserId, reason = null }
) {
  const now = new Date().toISOString();

  const { data: row, error } = await userClient
    .from("tasks")
    .update({
      status: "cancelled",
      cancelled_at: now,
      cancel_requested_at: now,
      cancel_requested_by: actorUserId,
      current_step: reason ?? "Cancelled",
    })
    .eq("id", missionId)
    .select(MISSION_COLUMNS)
    .maybeSingle();

  if (error) throw new PersistenceError("mission_cancel_failed", error.message);
  if (!row) throw new PersistenceError("mission_not_found", "That mission is not available to you.");

  const events = await appendMissionEvents(
    { trustedClient },
    {
      workspaceId,
      taskId: missionId,
      events: [
        {
          type: MISSION_EVENT.missionCancelled,
          at: now,
          actor: { user: actorUserId },
          summary: reason,
          metadata: { partialResult: Boolean(row.result && Object.keys(row.result).length > 0) },
        },
      ],
    }
  );

  return { mission: missionRowToDomain(row, { events }) };
}

async function loadEvents({ userClient }, taskIds) {
  const { data, error } = await userClient
    .from("run_events")
    .select(EVENT_COLUMNS)
    .in("task_id", taskIds)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(`[forge:persistence] event read failed: ${error.message}`);
    return [];
  }
  return data ?? [];
}

async function loadApprovals({ userClient }, taskIds) {
  const { data, error } = await userClient
    .from("approvals")
    .select(APPROVAL_COLUMNS)
    .in("task_id", taskIds)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(`[forge:persistence] approval read failed: ${error.message}`);
    return [];
  }
  return (data ?? []).map(approvalRowToDomain);
}

export function missionStages(kind) {
  return stagesForKind(missionKind(kind)?.kind ?? "general");
}
