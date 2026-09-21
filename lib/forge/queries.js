import "server-only";

import { groupBy, read, readOne } from "./db";
import {
  summarizePayloadLines,
  summarizeRecordLine,
  taskTitle,
} from "./summaries";
import { redactRecord, safeText } from "./runtime/sanitize.js";

const ACTION_LEVEL_RANK = { read: 0, draft: 1, execute: 2 };

// ---------------------------------------------------------------
// Row shaping
//
// jsonb columns (task input, approval payloads, run errors, audit metadata) can
// hold tokens, message bodies, and credentials. Server components serialize
// their props into the RSC payload that is sent to the browser, so a raw jsonb
// value passed down as a prop reaches the client even when the visible markup is
// redacted. Every raw jsonb value is therefore reduced to redacted, truncated
// summary text here and never travels any further.
// ---------------------------------------------------------------

function shapeTask(row) {
  const { input, ...rest } = row;
  return {
    ...rest,
    currentStep: row.current_step ?? null,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    cancelledAt: row.cancelled_at ?? null,
    cancelRequestedAt: row.cancel_requested_at ?? null,
    kind: row.kind ?? "general",
    icon: row.icon ?? null,
    fleetId: row.fleet_id ?? null,
    // Mission results come from the runtime, so they are sanitized before they
    // ever reach a component prop.
    result: redactRecord(row.result ?? {}, { maxFields: 24, maxLength: 2000 }),
    resultSummary: safeText((row.result ?? {}).summary, { max: 240 }),
    title: taskTitle(input),
    inputSummary: summarizePayloadLines(input, { max: 8 }),
  };
}

function shapeRun(row) {
  const { error, ...rest } = row;
  return {
    ...rest,
    parentRunId: row.parent_run_id ?? null,
    kind: row.kind ?? "primary",
    actorLabel: row.actor_label ?? null,
    cancelledAt: row.cancelled_at ?? null,
    errorSummary: summarizeRecordLine(error, { max: 3 }),
  };
}

function shapeApproval(row) {
  const { action_payload, ...rest } = row;
  return {
    ...rest,
    tool: row.tool ?? null,
    actionLevel: row.action_level ?? null,
    connectionId: row.connection_id ?? null,
    payloadHash: row.payload_hash ?? null,
    decidedPayloadHash: row.decided_payload_hash ?? null,
    resumedAt: row.resumed_at ?? null,
    payloadSummary: summarizePayloadLines(action_payload, { max: 6 }),
  };
}

function shapeEvent(row) {
  const { metadata, ...rest } = row;
  return {
    ...rest,
    eventType: row.event_type,
    actorLabel: row.actor_label ?? null,
    summary: row.summary ?? null,
    agentRunId: row.agent_run_id ?? null,
    taskId: row.task_id,
    metadataSummary: summarizePayloadLines(metadata, { max: 3 }),
  };
}

function shapeReceipt(row) {
  return {
    id: row.id,
    taskId: row.task_id ?? null,
    agentRunId: row.agent_run_id ?? null,
    approvalId: row.approval_id ?? null,
    tool: row.tool,
    capability: row.capability,
    actionLevel: row.action_level,
    inputSummary: row.input_summary ?? null,
    resultSummary: row.result_summary ?? null,
    success: row.success,
    confirmation: row.confirmation ?? (row.success ? "accepted" : "failed"),
    externalRef: row.external_ref ?? null,
    executedAt: row.executed_at,
  };
}

function highestActionLevel(capabilities = []) {
  let level = null;

  for (const capability of capabilities) {
    const candidate = String(capability?.max_action_level ?? "").toLowerCase();
    if (!(candidate in ACTION_LEVEL_RANK)) continue;
    if (level === null || ACTION_LEVEL_RANK[candidate] > ACTION_LEVEL_RANK[level]) {
      level = candidate;
    }
  }

  return level;
}

// ---------------------------------------------------------------
// Agent catalog
// ---------------------------------------------------------------

// Shared agent definitions with their capabilities. RLS only exposes active
// agents to signed-in users, so agents the viewer cannot see never appear here.
export async function listAgents(supabase) {
  const agentsResult = await read(
    supabase
      .from("agents")
      .select(
        "id, name, slug, description, instructions, is_active, delegation_enabled, department_id, created_at, departments ( id, name, slug )"
      )
      .order("name", { ascending: true }),
    "agents"
  );

  const agentIds = agentsResult.rows.map((agent) => agent.id);

  const capabilitiesResult = agentIds.length
    ? await read(
        supabase
          .from("agent_capabilities")
          .select("agent_id, capability, max_action_level")
          .in("agent_id", agentIds)
          .order("capability", { ascending: true }),
        "agent capabilities"
      )
    : { rows: [], failed: false };

  const capabilitiesByAgent = groupBy(capabilitiesResult.rows, "agent_id");

  const agents = agentsResult.rows.map((agent) => {
    const capabilities = capabilitiesByAgent.get(agent.id) ?? [];

    return {
      ...agent,
      delegationEnabled: Boolean(agent.delegation_enabled),
      department: agent.departments ?? null,
      capabilities,
      maxActionLevel: highestActionLevel(capabilities),
    };
  });

  return {
    agents,
    failed: agentsResult.failed || capabilitiesResult.failed,
  };
}

export async function listDepartments(supabase) {
  const result = await read(
    supabase
      .from("departments")
      .select("id, name, slug, created_at")
      .order("name", { ascending: true }),
    "departments"
  );

  return { departments: result.rows, failed: result.failed };
}

// Coordinated teams: who is in a fleet, their role, and the lead agent.
export async function listFleets(supabase) {
  const fleetsResult = await read(
    supabase
      .from("fleets")
      .select("id, name, slug, description, lead_agent_id")
      .order("name", { ascending: true }),
    "fleets"
  );

  const fleetIds = fleetsResult.rows.map((fleet) => fleet.id);

  const membersResult = fleetIds.length
    ? await read(
        supabase
          .from("fleet_members")
          .select("fleet_id, agent_id, role, position, agents ( id, name, slug )")
          .in("fleet_id", fleetIds)
          .order("position", { ascending: true }),
        "fleet members"
      )
    : { rows: [], failed: false };

  const membersByFleet = groupBy(membersResult.rows, "fleet_id");

  const fleets = fleetsResult.rows.map((fleet) => ({
    id: fleet.id,
    name: fleet.name,
    slug: fleet.slug,
    description: fleet.description ?? null,
    leadAgentId: fleet.lead_agent_id ?? null,
    members: (membersByFleet.get(fleet.id) ?? []).map((member) => ({
      agentId: member.agent_id,
      role: member.role,
      position: member.position,
      name: member.agents?.name ?? null,
      slug: member.agents?.slug ?? null,
    })),
  }));

  return { fleets, failed: fleetsResult.failed || membersResult.failed };
}

// ---------------------------------------------------------------
// Work: tasks, runs, approvals
// ---------------------------------------------------------------

// Reads a recent window of the workspace's work and the runs/approvals attached
// to it. This phase deliberately uses a bounded window instead of pagination.
export async function loadWork(supabase, workspaceId, { limit = 100 } = {}) {
  if (!workspaceId) {
    return { tasks: [], runs: [], approvals: [], failed: false };
  }

  const tasksResult = await read(
    supabase
      .from("tasks")
      .select(
        "id, workspace_id, agent_id, status, action_level, input, created_at, updated_at, requested_by, current_step, started_at, completed_at, cancelled_at, cancel_requested_at, kind, icon, fleet_id, result"
      )
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .limit(limit),
    "tasks"
  );

  const taskIds = tasksResult.rows.map((task) => task.id);

  const runsResult = taskIds.length
    ? await read(
        supabase
          .from("agent_runs")
          .select(
            "id, task_id, parent_run_id, kind, actor_label, hermes_run_id, status, started_at, completed_at, created_at, cancelled_at, error"
          )
          .in("task_id", taskIds)
          .order("created_at", { ascending: false }),
        "agent runs"
      )
    : { rows: [], failed: false };

  const approvalsResult = taskIds.length
    ? await read(
        supabase
          .from("approvals")
          .select(
            "id, task_id, agent_run_id, requested_by, capability, tool, action_level, connection_id, action_payload, payload_hash, decided_payload_hash, status, expires_at, decided_at, resumed_at, created_at"
          )
          .in("task_id", taskIds)
          .order("created_at", { ascending: false }),
        "approvals"
      )
    : { rows: [], failed: false };

  return {
    tasks: tasksResult.rows.map(shapeTask),
    runs: runsResult.rows.map(shapeRun),
    approvals: approvalsResult.rows.map(shapeApproval),
    failed: tasksResult.failed || runsResult.failed || approvalsResult.failed,
  };
}

export async function getTask(supabase, taskId) {
  const result = await readOne(
    supabase
      .from("tasks")
      .select(
        "id, workspace_id, agent_id, status, action_level, input, created_at, updated_at, requested_by, current_step, started_at, completed_at, cancelled_at, cancel_requested_at, kind, icon, fleet_id, result"
      )
      .eq("id", taskId)
      .maybeSingle(),
    "task"
  );

  return { task: result.row ? shapeTask(result.row) : null, failed: result.failed };
}

export async function getAgent(supabase, agentId) {
  const result = await readOne(
    supabase
      .from("agents")
      .select(
        "id, name, slug, description, instructions, is_active, delegation_enabled, department_id, created_at, departments ( id, name, slug )"
      )
      .eq("id", agentId)
      .maybeSingle(),
    "agent"
  );

  if (!result.row) return { agent: null, capabilities: [], failed: result.failed };

  const capabilitiesResult = await read(
    supabase
      .from("agent_capabilities")
      .select("agent_id, capability, max_action_level")
      .eq("agent_id", agentId)
      .order("capability", { ascending: true }),
    "agent capabilities"
  );

  return {
    agent: {
      ...result.row,
      delegationEnabled: Boolean(result.row.delegation_enabled),
      department: result.row.departments ?? null,
    },
    capabilities: capabilitiesResult.rows,
    failed: result.failed || capabilitiesResult.failed,
  };
}

export async function listTasksForAgent(supabase, agentId, { limit = 8 } = {}) {
  const result = await read(
    supabase
      .from("tasks")
      .select(
        "id, workspace_id, agent_id, status, action_level, input, created_at, updated_at, requested_by, current_step, started_at, completed_at, cancelled_at, cancel_requested_at, kind, icon, fleet_id, result"
      )
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false })
      .limit(limit),
    "agent tasks"
  );

  return { tasks: result.rows.map(shapeTask), failed: result.failed };
}

export async function listRunsForTask(supabase, taskId) {
  const result = await read(
    supabase
      .from("agent_runs")
      .select(
        "id, task_id, parent_run_id, kind, actor_label, hermes_run_id, status, started_at, completed_at, created_at, cancelled_at, error"
      )
      .eq("task_id", taskId)
      .order("created_at", { ascending: false }),
    "task runs"
  );

  return { runs: result.rows.map(shapeRun), failed: result.failed };
}

// ---------------------------------------------------------------
// Events and receipts
// ---------------------------------------------------------------

export async function listRunEvents(
  supabase,
  { taskId = null, workspaceId = null, limit = 60 } = {}
) {
  let query = supabase
    .from("run_events")
    .select(
      "id, workspace_id, task_id, agent_run_id, event_type, actor_user_id, actor_label, summary, metadata, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (taskId) query = query.eq("task_id", taskId);
  if (workspaceId) query = query.eq("workspace_id", workspaceId);

  const result = await read(query, "run events");
  return { events: result.rows.map(shapeEvent), failed: result.failed };
}

export async function listReceipts(supabase, { workspaceId, limit = 40 } = {}) {
  if (!workspaceId) return { receipts: [], failed: false };

  const result = await read(
    supabase
      .from("action_receipts")
      .select(
        "id, task_id, agent_run_id, approval_id, tool, capability, action_level, input_summary, result_summary, success, external_ref, executed_at"
      )
      .eq("workspace_id", workspaceId)
      .order("executed_at", { ascending: false })
      .limit(limit),
    "receipts"
  );

  return { receipts: result.rows.map(shapeReceipt), failed: result.failed };
}

export async function listApprovalsForTask(supabase, taskId) {
  const result = await read(
    supabase
      .from("approvals")
      .select(
        "id, task_id, agent_run_id, requested_by, capability, tool, action_level, connection_id, action_payload, payload_hash, decided_payload_hash, status, expires_at, decided_at, resumed_at, created_at"
      )
      .eq("task_id", taskId)
      .order("created_at", { ascending: false }),
    "task approvals"
  );

  return { approvals: result.rows.map(shapeApproval), failed: result.failed };
}

// Counts pending approvals in the workspace without loading every row. Returns
// 0 when the count cannot be resolved so the shell still renders.
export async function countPendingApprovals(supabase, workspaceId) {
  if (!workspaceId) return 0;

  try {
    const { count, error } = await supabase
      .from("approvals")
      .select("id, tasks!inner(workspace_id)", { count: "exact", head: true })
      .eq("tasks.workspace_id", workspaceId)
      .eq("status", "pending");

    if (error) {
      console.error(`[forge] pending approval count failed: ${error.message}`);
      return 0;
    }

    return count ?? 0;
  } catch (error) {
    console.error(
      `[forge] pending approval count failed: ${error?.message ?? error}`
    );
    return 0;
  }
}

// ---------------------------------------------------------------
// Connections
// ---------------------------------------------------------------

export async function listConnections(supabase, workspaceId, membershipId) {
  if (!workspaceId) {
    return { connections: [], permissions: new Map(), failed: false };
  }

  const connectionsResult = await read(
    supabase
      .from("connections")
      .select("id, provider, label, status, owner_user_id, created_at")
      .eq("workspace_id", workspaceId)
      .order("provider", { ascending: true })
      .order("label", { ascending: true }),
    "connections"
  );

  const permissionsResult = membershipId
    ? await read(
        supabase
          .from("connection_permissions")
          .select("connection_id, can_read, can_draft, can_execute")
          .eq("workspace_membership_id", membershipId),
        "connection permissions"
      )
    : { rows: [], failed: false };

  return {
    connections: connectionsResult.rows,
    permissions: new Map(
      permissionsResult.rows.map((permission) => [permission.connection_id, permission])
    ),
    failed: connectionsResult.failed || permissionsResult.failed,
  };
}

// ---------------------------------------------------------------
// Activity
// ---------------------------------------------------------------

export async function listActivity(supabase, workspaceId, { limit = 40 } = {}) {
  if (!workspaceId) {
    return { events: [], failed: false };
  }

  const result = await read(
    supabase
      .from("audit_logs")
      .select("id, event_type, actor_user_id, task_id, metadata, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(limit),
    "audit logs"
  );

  return { events: result.rows.map(shapeEvent), failed: result.failed };
}
