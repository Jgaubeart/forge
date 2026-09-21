// In-memory runtime repository for tests.
//
// It implements the same interface as lib/forge/runtime/repository.js and models
// the RLS behaviour the real client relies on: a row is only returned when the
// caller is a member of the workspace it belongs to. That lets the tests prove
// the runtime refuses cross-workspace access on its own, not merely that a
// database would have hidden the row.

export function createFakeRepository(seed = {}) {
  // Generated ids never collide with seed ids, so an update can only ever hit
  // the row the runtime created.
  let sequence = 0;
  const nextId = (prefix) => `${prefix}-generated-${(sequence += 1)}`;

  const state = {
    workspaces: seed.workspaces ?? [],
    organizations: seed.organizations ?? [],
    memberships: seed.memberships ?? [],
    agents: seed.agents ?? [],
    agentCapabilities: seed.agentCapabilities ?? {},
    membershipCapabilities: seed.membershipCapabilities ?? {},
    connections: seed.connections ?? [],
    connectionPermissions: seed.connectionPermissions ?? {},
    tasks: (seed.tasks ?? []).map((task) => ({ ...task })),
    runs: (seed.runs ?? []).map((run) => ({ ...run })),
    approvals: (seed.approvals ?? []).map((approval) => ({ ...approval })),
    events: [],
    receipts: [],
    auditLogs: [],
  };

  const memberOf = (userId, workspaceId) =>
    state.memberships.some(
      (membership) =>
        membership.userId === userId && membership.workspaceId === workspaceId
    );

  const taskById = (taskId) => state.tasks.find((task) => task.id === taskId) ?? null;

  const visibleTask = (taskId, userId) => {
    const task = taskById(taskId);
    if (!task) return null;
    return memberOf(userId, task.workspaceId) ? task : null;
  };

  const canUseConnection = (connection, userId) => {
    if (connection.ownerUserId === userId) return true;
    const permission = state.connectionPermissions[connection.id];
    if (!permission) return false;
    return Boolean(permission.canRead || permission.canDraft || permission.canExecute);
  };

  return {
    state,

    // ---- reads -------------------------------------------------------------

    async getMembershipForUser({ workspaceId, userId }) {
      const membership = state.memberships.find(
        (entry) => entry.userId === userId && entry.workspaceId === workspaceId
      );
      if (!membership) return null;

      const workspace =
        state.workspaces.find((entry) => entry.id === workspaceId) ?? null;
      const organization = workspace?.organizationId
        ? state.organizations.find((entry) => entry.id === workspace.organizationId) ??
          null
        : null;

      return {
        id: membership.id,
        role: membership.role,
        workspaceId,
        workspace,
        organization,
      };
    },

    async getTaskForUser({ taskId, userId }) {
      return visibleTask(taskId, userId);
    },

    async getAgentById(agentId) {
      return state.agents.find((agent) => agent.id === agentId) ?? null;
    },

    async getAgentCapabilities(agentId) {
      return state.agentCapabilities[agentId] ?? [];
    },

    async getMembershipCapabilities(membershipId) {
      return state.membershipCapabilities[membershipId] ?? [];
    },

    async getConnectionForUser({ connectionId, userId }) {
      const connection =
        state.connections.find((entry) => entry.id === connectionId) ?? null;
      if (!connection) return null;
      if (!memberOf(userId, connection.workspaceId)) return null;
      return canUseConnection(connection, userId) ? connection : null;
    },

    async listConnectionsForUser({ workspaceId, userId, connectionIds = [] }) {
      return state.connections.filter((connection) => {
        if (connection.workspaceId !== workspaceId) return false;
        if (!memberOf(userId, workspaceId)) return false;
        if (!canUseConnection(connection, userId)) return false;
        if (connectionIds.length > 0 && !connectionIds.includes(connection.id)) {
          return false;
        }
        return true;
      });
    },

    async getWorkspaceSnapshotForUser({ workspaceId, userId }) {
      const workspace =
        state.workspaces.find((entry) => entry.id === workspaceId) ?? null;
      if (!workspace) return null;
      if (!memberOf(userId, workspaceId)) return null;

      const membership =
        state.memberships.find(
          (entry) => entry.userId === userId && entry.workspaceId === workspaceId
        ) ?? null;

      return {
        workspace,
        role: membership?.role ?? null,
        agentCount: state.agents.filter((agent) => agent.isActive).length,
      };
    },

    async listRunsForTask(taskId) {
      return state.runs.filter((run) => run.taskId === taskId);
    },

    async getRunForUser({ runId, userId }) {
      const run = state.runs.find((entry) => entry.id === runId) ?? null;
      if (!run) return null;
      const task = visibleTask(run.taskId, userId);
      if (!task) return null;
      return { ...run, workspaceId: task.workspaceId };
    },

    async getApprovalForUser({ approvalId, userId }) {
      const approval =
        state.approvals.find((entry) => entry.id === approvalId) ?? null;
      if (!approval) return null;
      const task = visibleTask(approval.taskId, userId);
      if (!task) return null;
      return { ...approval, workspaceId: task.workspaceId };
    },

    async listRunEvents({ taskId = null, workspaceId = null, limit = 50 }) {
      return state.events
        .filter((event) => (taskId ? event.taskId === taskId : true))
        .filter((event) => (workspaceId ? event.workspaceId === workspaceId : true))
        .slice(0, limit);
    },

    async listReceipts({ workspaceId, limit = 50 }) {
      return state.receipts
        .filter((receipt) => receipt.workspaceId === workspaceId)
        .slice(0, limit);
    },

    // ---- writes ------------------------------------------------------------

    async createTask(fields) {
      const task = {
        id: nextId("task"),
        status: "queued",
        currentStep: null,
        policy: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        startedAt: null,
        completedAt: null,
        cancelledAt: null,
        cancelRequestedAt: null,
        cancelRequestedBy: null,
        ...fields,
      };
      state.tasks.push(task);
      return task;
    },

    async updateTask(taskId, patch) {
      const task = taskById(taskId);
      if (!task) return null;
      Object.assign(task, patch, { updatedAt: new Date() });
      return task;
    },

    async createRun(fields) {
      const run = {
        id: nextId("run"),
        parentRunId: null,
        kind: "primary",
        actorLabel: null,
        hermesRunId: null,
        status: "queued",
        error: null,
        startedAt: null,
        completedAt: null,
        cancelledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...fields,
      };
      state.runs.push(run);
      return run;
    },

    async updateRun(runId, patch) {
      const run = state.runs.find((entry) => entry.id === runId) ?? null;
      if (!run) return null;
      Object.assign(run, patch, { updatedAt: new Date() });
      return run;
    },

    async insertRunEvent(event) {
      const stored = { id: nextId("event"), ...event };
      state.events.push(stored);
      return stored;
    },

    async insertReceipt(receipt) {
      const stored = { id: nextId("receipt"), ...receipt };
      state.receipts.push(stored);
      return stored;
    },

    async insertApproval(approval) {
      const stored = {
        id: nextId("approval"),
        status: "pending",
        decidedBy: null,
        decidedAt: null,
        decidedPayloadHash: null,
        resumedAt: null,
        resumeRunId: null,
        ...approval,
      };
      state.approvals.push(stored);
      return stored;
    },

    async updateApproval(approvalId, patch) {
      const approval =
        state.approvals.find((entry) => entry.id === approvalId) ?? null;
      if (!approval) return null;
      Object.assign(approval, patch);
      return approval;
    },

    async insertAuditLog(entry) {
      const stored = { id: nextId("audit"), ...entry };
      state.auditLogs.push(stored);
      return stored;
    },
  };
}

// Builds the standard fixture: two workspaces, one agent with email.read +
// email.draft, one member with the same grants, one connection, one mission.
export function createFixture(overrides = {}) {
  const fixture = {
    workspaces: [
      { id: "ws-1", name: "Korben HQ", slug: "korben-hq", kind: "business", organizationId: "org-1" },
      { id: "ws-2", name: "Other Co", slug: "other-co", kind: "business", organizationId: null },
    ],
    organizations: [{ id: "org-1", name: "Korben", slug: "korben" }],
    memberships: [
      { id: "mem-1", workspaceId: "ws-1", userId: "user-1", role: "owner" },
      { id: "mem-2", workspaceId: "ws-2", userId: "user-2", role: "owner" },
    ],
    agents: [
      {
        id: "agent-1",
        name: "Inbox Triage",
        slug: "inbox-triage",
        instructions: "Classify and draft. Never send.",
        isActive: true,
        delegationEnabled: false,
      },
    ],
    agentCapabilities: {
      "agent-1": [
        { capability: "email.read", max_action_level: "read" },
        { capability: "email.draft", max_action_level: "draft" },
        { capability: "workspace.read", max_action_level: "read" },
      ],
    },
    membershipCapabilities: {
      "mem-1": [
        { capability: "email.read", action_level: "read" },
        { capability: "email.draft", action_level: "draft" },
        { capability: "workspace.read", action_level: "read" },
      ],
      "mem-2": [
        { capability: "email.read", action_level: "read" },
        { capability: "email.draft", action_level: "draft" },
        { capability: "workspace.read", action_level: "read" },
      ],
    },
    connections: [
      {
        id: "conn-1",
        workspaceId: "ws-1",
        provider: "google",
        label: "support@korben.example",
        status: "active",
        ownerUserId: "user-1",
      },
      {
        id: "conn-2",
        workspaceId: "ws-1",
        provider: "google",
        label: "finance@korben.example",
        status: "active",
        ownerUserId: "user-9",
      },
    ],
    tasks: [
      {
        id: "task-1",
        workspaceId: "ws-1",
        agentId: "agent-1",
        requestedBy: "user-1",
        actionLevel: "read",
        input: { goal: "Triage the shared inbox" },
        status: "running",
        currentStep: "Running in Hermes",
        policy: {},
      },
    ],
    runs: [
      {
        id: "run-1",
        taskId: "task-1",
        parentRunId: null,
        kind: "primary",
        actorLabel: "Inbox Triage",
        hermesRunId: "hermes-run-1",
        status: "running",
      },
    ],
    approvals: [],
  };

  return { ...fixture, ...overrides };
}
