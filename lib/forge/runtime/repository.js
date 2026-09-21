// Supabase-backed repository for the Forge runtime.
//
// Two clients, two jobs:
//
//   reads  -> the caller's cookie-scoped client, so RLS decides what exists for
//             this person. Nothing in the runtime reads around RLS.
//   writes -> the service-role client, because mission state, the event stream,
//             staged approvals, and receipts are an authoritative record that a
//             browser session must not be able to forge or edit. This is the
//             trusted server write path, not a read bypass.
//
// The repository also normalizes snake_case rows into the camelCase objects the
// runtime services use, so the service layer stays free of PostgREST details.

import { RUNTIME_ERROR_CODES, RuntimeError } from "./errors.js";

const TASK_COLUMNS =
  "id, workspace_id, agent_id, requested_by, action_level, input, status, current_step, policy, kind, icon, fleet_id, result, created_at, updated_at, started_at, completed_at, cancelled_at, cancel_requested_at, cancel_requested_by";

const RUN_COLUMNS =
  "id, task_id, parent_run_id, kind, actor_label, hermes_run_id, status, error, started_at, completed_at, created_at, updated_at, cancelled_at, tasks ( workspace_id )";

const APPROVAL_COLUMNS =
  "id, task_id, agent_run_id, requested_by, capability, tool, action_level, connection_id, action_payload, payload_hash, decided_payload_hash, status, expires_at, decided_by, decided_at, resumed_at, resume_run_id, created_at";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function toTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    agentId: row.agent_id,
    requestedBy: row.requested_by,
    actionLevel: row.action_level,
    input: row.input ?? {},
    status: row.status,
    currentStep: row.current_step ?? null,
    policy: row.policy ?? {},
    kind: row.kind ?? "general",
    icon: row.icon ?? null,
    fleetId: row.fleet_id ?? null,
    result: row.result ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    cancelledAt: row.cancelled_at ?? null,
    cancelRequestedAt: row.cancel_requested_at ?? null,
    cancelRequestedBy: row.cancel_requested_by ?? null,
  };
}

function toRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.task_id,
    workspaceId: row?.tasks?.workspace_id ?? null,
    parentRunId: row.parent_run_id ?? null,
    kind: row.kind ?? "primary",
    actorLabel: row.actor_label ?? null,
    hermesRunId: row.hermes_run_id ?? null,
    status: row.status,
    error: row.error ?? null,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    cancelledAt: row.cancelled_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

function toEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    taskId: row.task_id,
    agentRunId: row.agent_run_id ?? null,
    eventType: row.event_type,
    actorUserId: row.actor_user_id ?? null,
    actorLabel: row.actor_label ?? null,
    summary: row.summary ?? null,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

function toReceipt(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    taskId: row.task_id ?? null,
    agentRunId: row.agent_run_id ?? null,
    approvalId: row.approval_id ?? null,
    connectionId: row.connection_id ?? null,
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

function toApproval(row) {
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.task_id,
    agentRunId: row.agent_run_id ?? null,
    requestedBy: row.requested_by,
    capability: row.capability,
    tool: row.tool ?? null,
    actionLevel: row.action_level ?? null,
    connectionId: row.connection_id ?? null,
    actionPayload: row.action_payload ?? {},
    payloadHash: row.payload_hash ?? null,
    decidedPayloadHash: row.decided_payload_hash ?? null,
    status: row.status,
    expiresAt: row.expires_at ?? null,
    decidedBy: row.decided_by ?? null,
    decidedAt: row.decided_at ?? null,
    resumedAt: row.resumed_at ?? null,
    resumeRunId: row.resume_run_id ?? null,
    createdAt: row.created_at,
  };
}

function patchToColumns(patch = {}) {
  const map = {
    status: "status",
    currentStep: "current_step",
    startedAt: "started_at",
    completedAt: "completed_at",
    cancelledAt: "cancelled_at",
    cancelRequestedAt: "cancel_requested_at",
    cancelRequestedBy: "cancel_requested_by",
    policy: "policy",
    kind: "kind",
    icon: "icon",
    fleetId: "fleet_id",
    result: "result",
    hermesRunId: "hermes_run_id",
    updatedAt: "updated_at",
    error: "error",
    decidedBy: "decided_by",
    decidedAt: "decided_at",
    decidedPayloadHash: "decided_payload_hash",
    resumedAt: "resumed_at",
    resumeRunId: "resume_run_id",
  };

  const columns = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const column = map[key];
    if (!column) continue;
    columns[column] = value;
  }
  return columns;
}

export function createRuntimeRepository({ userClient, runtimeClient }) {
  function runtime() {
    if (!runtimeClient) {
      throw new RuntimeError(
        RUNTIME_ERROR_CODES.notConfigured,
        "Forge durable writes are not configured. Set SUPABASE_SERVICE_ROLE_KEY so the runtime can record missions."
      );
    }
    return runtimeClient;
  }

  async function readOne(query, label) {
    try {
      const { data, error } = await query;
      if (error) {
        console.error(`[forge:runtime] ${label} failed: ${error.message}`);
        return null;
      }
      return data ?? null;
    } catch (error) {
      console.error(`[forge:runtime] ${label} failed: ${error?.message ?? error}`);
      return null;
    }
  }

  async function readMany(query, label) {
    try {
      const { data, error } = await query;
      if (error) {
        console.error(`[forge:runtime] ${label} failed: ${error.message}`);
        return [];
      }
      return data ?? [];
    } catch (error) {
      console.error(`[forge:runtime] ${label} failed: ${error?.message ?? error}`);
      return [];
    }
  }

  async function write(query, label) {
    try {
      const { data, error } = await query;
      if (error) {
        throw new RuntimeError(
          RUNTIME_ERROR_CODES.adapterFailed,
          `Forge could not record the ${label}: ${error.message}`
        );
      }
      return data ?? null;
    } catch (error) {
      if (error instanceof RuntimeError) throw error;
      throw new RuntimeError(
        RUNTIME_ERROR_CODES.adapterFailed,
        `Forge could not record the ${label}.`
      );
    }
  }

  return {
    // ---------------------------------------------------------------
    // Reads (caller-scoped)
    // ---------------------------------------------------------------

    async getMembershipForUser({ workspaceId, userId }) {
      const row = await readOne(
        userClient
          .from("workspace_memberships")
          .select(
            "id, role, workspace_id, workspaces ( id, name, slug, kind, organization_id )"
          )
          .eq("workspace_id", workspaceId)
          .eq("user_id", userId)
          .maybeSingle(),
        "membership"
      );

      if (!row) return null;

      let organization = null;
      const organizationId = row.workspaces?.organization_id ?? null;
      if (organizationId) {
        const organizationRow = await readOne(
          userClient
            .from("organizations")
            .select("id, name, slug")
            .eq("id", organizationId)
            .maybeSingle(),
          "organization"
        );
        organization = organizationRow ?? null;
      }

      return {
        id: row.id,
        role: row.role,
        workspaceId: row.workspace_id,
        workspace: row.workspaces ?? null,
        organization,
      };
    },

    // RLS decides whether this row exists for the caller; a mission in another
    // workspace simply comes back null.
    async getTaskForUser({ taskId, userId: _userId }) {
      return toTask(
        await readOne(
          userClient
            .from("tasks")
            .select(TASK_COLUMNS)
            .eq("id", taskId)
            .maybeSingle(),
          "task"
        )
      );
    },

    async getAgentById(agentId) {
      const row = await readOne(
        userClient
          .from("agents")
          .select(
            "id, name, slug, description, instructions, is_active, delegation_enabled, department_id"
          )
          .eq("id", agentId)
          .maybeSingle(),
        "agent"
      );

      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description ?? null,
        instructions: row.instructions ?? null,
        isActive: Boolean(row.is_active),
        delegationEnabled: Boolean(row.delegation_enabled),
        departmentId: row.department_id ?? null,
      };
    },

    async getAgentBySlug(slug) {
      const row = await readOne(
        userClient
          .from("agents")
          .select(
            "id, name, slug, description, instructions, is_active, delegation_enabled, department_id"
          )
          .eq("slug", String(slug ?? ""))
          .maybeSingle(),
        "agent by slug"
      );

      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description ?? null,
        instructions: row.instructions ?? null,
        isActive: Boolean(row.is_active),
        delegationEnabled: Boolean(row.delegation_enabled),
        departmentId: row.department_id ?? null,
      };
    },

    // A fleet is a coordinated team. Hermes performs the delegation; Forge
    // records the team, the mission that used it, and the child runs it reports.
    async getFleetBySlug(slug) {
      const fleet = await readOne(
        userClient
          .from("fleets")
          .select("id, name, slug, description, lead_agent_id")
          .eq("slug", String(slug ?? ""))
          .maybeSingle(),
        "fleet"
      );

      if (!fleet) return null;

      const memberRows = await readMany(
        userClient
          .from("fleet_members")
          .select("agent_id, role, position, agents ( id, name, slug )")
          .eq("fleet_id", fleet.id)
          .order("position", { ascending: true }),
        "fleet members"
      );

      return {
        id: fleet.id,
        name: fleet.name,
        slug: fleet.slug,
        description: fleet.description ?? null,
        leadAgentId: fleet.lead_agent_id ?? null,
        members: memberRows.map((row) => ({
          agentId: row.agent_id,
          role: row.role,
          position: row.position,
          agent: row.agents
            ? { id: row.agents.id, name: row.agents.name, slug: row.agents.slug }
            : null,
        })),
      };
    },

    async getAgentCapabilities(agentId) {
      return readMany(
        userClient
          .from("agent_capabilities")
          .select("capability, max_action_level")
          .eq("agent_id", agentId),
        "agent capabilities"
      );
    },

    async getMembershipCapabilities(membershipId) {
      return readMany(
        userClient
          .from("membership_capabilities")
          .select("capability, action_level")
          .eq("workspace_membership_id", membershipId),
        "membership capabilities"
      );
    },

    async getConnectionForUser({ connectionId, userId: _userId }) {
      if (!isUuid(connectionId)) return null;

      const row = await readOne(
        userClient
          .from("connections")
          .select("id, workspace_id, provider, label, status")
          .eq("id", connectionId)
          .maybeSingle(),
        "connection"
      );

      if (!row) return null;
      return {
        id: row.id,
        workspaceId: row.workspace_id,
        provider: row.provider,
        label: row.label,
        status: row.status,
      };
    },

    async listConnectionsForUser({ workspaceId, connectionIds = [] }) {
      let query = userClient
        .from("connections")
        .select("id, workspace_id, provider, label, status")
        .eq("workspace_id", workspaceId)
        .order("provider", { ascending: true });

      if (connectionIds.length > 0) {
        const valid = connectionIds.filter(isUuid);
        if (valid.length === 0) return [];
        query = query.in("id", valid);
      }

      const rows = await readMany(query, "connections");
      return rows.map((row) => ({
        id: row.id,
        workspaceId: row.workspace_id,
        provider: row.provider,
        label: row.label,
        status: row.status,
      }));
    },

    async getWorkspaceSnapshotForUser({ workspaceId }) {
      const workspace = await readOne(
        userClient
          .from("workspaces")
          .select("id, name, slug, kind, organization_id")
          .eq("id", workspaceId)
          .maybeSingle(),
        "workspace"
      );

      if (!workspace) return null;

      const membership = await readOne(
        userClient
          .from("workspace_memberships")
          .select("id, role")
          .eq("workspace_id", workspaceId)
          .eq("user_id", (await userClient.auth.getUser()).data?.user?.id ?? "")
          .maybeSingle(),
        "workspace membership"
      );

      const { count } = await userClient
        .from("agents")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true);

      return {
        workspace: {
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          kind: workspace.kind,
        },
        role: membership?.role ?? null,
        agentCount: count ?? 0,
      };
    },

    async listRunsForTask(taskId) {
      const rows = await readMany(
        userClient
          .from("agent_runs")
          .select(RUN_COLUMNS)
          .eq("task_id", taskId)
          .order("created_at", { ascending: true }),
        "runs"
      );
      return rows.map(toRun);
    },

    async getRunForUser({ runId }) {
      return toRun(
        await readOne(
          userClient
            .from("agent_runs")
            .select(RUN_COLUMNS)
            .eq("id", runId)
            .maybeSingle(),
          "run"
        )
      );
    },

    async getApprovalForUser({ approvalId }) {
      return toApproval(
        await readOne(
          userClient
            .from("approvals")
            .select(APPROVAL_COLUMNS)
            .eq("id", approvalId)
            .maybeSingle(),
          "approval"
        )
      );
    },

    async listRunEvents({ taskId = null, workspaceId = null, limit = 50 }) {
      let query = userClient
        .from("run_events")
        .select(
          "id, workspace_id, task_id, agent_run_id, event_type, actor_user_id, actor_label, summary, metadata, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(limit);

      if (taskId) query = query.eq("task_id", taskId);
      if (workspaceId) query = query.eq("workspace_id", workspaceId);

      const rows = await readMany(query, "run events");
      return rows.map(toEvent);
    },

    async listReceipts({ workspaceId, limit = 50 }) {
      const rows = await readMany(
        userClient
          .from("action_receipts")
          .select(
            "id, workspace_id, task_id, agent_run_id, approval_id, connection_id, tool, capability, action_level, input_summary, result_summary, success, external_ref, executed_at"
          )
          .eq("workspace_id", workspaceId)
          .order("executed_at", { ascending: false })
          .limit(limit),
        "receipts"
      );
      return rows.map(toReceipt);
    },

    // ---------------------------------------------------------------
    // Writes (trusted server path)
    // ---------------------------------------------------------------

    async createTask({
      workspaceId,
      agentId,
      requestedBy,
      actionLevel,
      input = {},
      status = "queued",
      currentStep = null,
      policy = {},
      kind = "general",
      icon = null,
      fleetId = null,
      result = {},
      createdAt = null,
    }) {
      const row = await write(
        runtime()
          .from("tasks")
          .insert({
            workspace_id: workspaceId,
            agent_id: agentId,
            requested_by: requestedBy,
            action_level: actionLevel,
            input,
            status,
            current_step: currentStep,
            policy,
            kind,
            icon,
            fleet_id: fleetId,
            result,
            ...(createdAt ? { created_at: createdAt } : {}),
          })
          .select(TASK_COLUMNS)
          .single(),
        "mission"
      );
      return toTask(row);
    },

    async updateTask(taskId, patch) {
      const row = await write(
        runtime()
          .from("tasks")
          .update({ ...patchToColumns(patch), updated_at: new Date().toISOString() })
          .eq("id", taskId)
          .select(TASK_COLUMNS)
          .maybeSingle(),
        "mission update"
      );
      return toTask(row);
    },

    async createRun({
      taskId,
      parentRunId = null,
      kind = "primary",
      actorLabel = null,
      hermesRunId = null,
      status = "queued",
      startedAt = null,
      createdAt = null,
    }) {
      const row = await write(
        runtime()
          .from("agent_runs")
          .insert({
            task_id: taskId,
            parent_run_id: parentRunId,
            kind,
            actor_label: actorLabel,
            hermes_run_id: hermesRunId,
            status,
            started_at: startedAt,
            ...(createdAt ? { created_at: createdAt } : {}),
          })
          .select(RUN_COLUMNS)
          .single(),
        "run"
      );
      return toRun(row);
    },

    async updateRun(runId, patch) {
      const row = await write(
        runtime()
          .from("agent_runs")
          .update({ ...patchToColumns(patch), updated_at: new Date().toISOString() })
          .eq("id", runId)
          .select(RUN_COLUMNS)
          .maybeSingle(),
        "run update"
      );
      return toRun(row);
    },

    async insertRunEvent(event) {
      const row = await write(
        runtime()
          .from("run_events")
          .insert({
            workspace_id: event.workspaceId,
            task_id: event.taskId,
            agent_run_id: event.agentRunId,
            event_type: event.eventType,
            actor_user_id: event.actorUserId,
            actor_label: event.actorLabel,
            summary: event.summary,
            metadata: event.metadata,
            ...(event.createdAt ? { created_at: event.createdAt } : {}),
          })
          .select(
            "id, workspace_id, task_id, agent_run_id, event_type, actor_user_id, actor_label, summary, metadata, created_at"
          )
          .single(),
        "event"
      );
      return toEvent(row);
    },

    async insertReceipt(receipt) {
      const row = await write(
        runtime()
          .from("action_receipts")
          .insert({
            workspace_id: receipt.workspaceId,
            task_id: receipt.taskId,
            agent_run_id: receipt.agentRunId,
            approval_id: receipt.approvalId,
            connection_id: receipt.connectionId,
            tool: receipt.tool,
            capability: receipt.capability,
            action_level: receipt.actionLevel,
            input_summary: receipt.inputSummary,
            result_summary: receipt.resultSummary,
            success: receipt.success,
            confirmation: receipt.confirmation,
            external_ref: receipt.externalRef,
            ...(receipt.executedAt ? { executed_at: receipt.executedAt } : {}),
          })
          .select(
            "id, workspace_id, task_id, agent_run_id, approval_id, connection_id, tool, capability, action_level, input_summary, result_summary, success, confirmation, external_ref, executed_at"
          )
          .single(),
        "receipt"
      );
      return toReceipt(row);
    },

    async insertApproval(approval) {
      const row = await write(
        runtime()
          .from("approvals")
          .insert({
            task_id: approval.taskId,
            agent_run_id: approval.agentRunId,
            requested_by: approval.requestedBy,
            capability: approval.capability,
            tool: approval.tool,
            action_level: approval.actionLevel,
            connection_id: approval.connectionId,
            action_payload: approval.actionPayload,
            payload_hash: approval.payloadHash,
            status: approval.status,
            expires_at: approval.expiresAt,
            ...(approval.createdAt ? { created_at: approval.createdAt } : {}),
          })
          .select(APPROVAL_COLUMNS)
          .single(),
        "approval"
      );
      return toApproval(row);
    },

    async updateApproval(approvalId, patch) {
      const row = await write(
        runtime()
          .from("approvals")
          .update(patchToColumns(patch))
          .eq("id", approvalId)
          .select(APPROVAL_COLUMNS)
          .maybeSingle(),
        "approval update"
      );
      return toApproval(row);
    },

    async insertAuditLog({ workspaceId, actorUserId, taskId, eventType, metadata = {} }) {
      const row = await write(
        runtime()
          .from("audit_logs")
          .insert({
            workspace_id: workspaceId,
            actor_user_id: actorUserId,
            task_id: taskId,
            event_type: eventType,
            metadata,
          })
          .select("id")
          .single(),
        "audit entry"
      );
      return row;
    },
  };
}
