// Status vocabulary shared by every Forge view.
//
// Task and run statuses are free-form text in the database, so unknown values
// fall back to a neutral, humanized label rather than breaking the layout.

const TASK_STATUS_META = {
  queued: { label: "Queued", tone: "muted" },
  pending: { label: "Queued", tone: "muted" },
  running: { label: "Running", tone: "accent", live: true },
  in_progress: { label: "Running", tone: "accent", live: true },
  waiting: { label: "Waiting", tone: "warn" },
  approval_required: { label: "Approval required", tone: "warn" },
  awaiting_approval: { label: "Approval required", tone: "warn" },
  blocked: { label: "Blocked", tone: "warn" },
  completed: { label: "Completed", tone: "accent" },
  succeeded: { label: "Completed", tone: "accent" },
  failed: { label: "Failed", tone: "danger" },
  error: { label: "Failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "muted" },
  canceled: { label: "Cancelled", tone: "muted" },
};

const RUN_STATUS_META = {
  queued: { label: "Queued", tone: "muted" },
  pending: { label: "Queued", tone: "muted" },
  starting: { label: "Starting", tone: "accent", live: true },
  running: { label: "Running", tone: "accent", live: true },
  in_progress: { label: "Running", tone: "accent", live: true },
  waiting: { label: "Waiting", tone: "warn" },
  approval_required: { label: "Approval required", tone: "warn" },
  completed: { label: "Completed", tone: "accent" },
  succeeded: { label: "Completed", tone: "accent" },
  failed: { label: "Failed", tone: "danger" },
  error: { label: "Failed", tone: "danger" },
  stopped: { label: "Stopped", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "muted" },
  canceled: { label: "Cancelled", tone: "muted" },
};

const CONNECTION_STATUS_META = {
  active: { label: "Connected", tone: "accent" },
  connected: { label: "Connected", tone: "accent" },
  healthy: { label: "Connected", tone: "accent" },
  pending: { label: "Pending", tone: "info" },
  expired: { label: "Expired", tone: "warn" },
  degraded: { label: "Degraded", tone: "warn" },
  error: { label: "Error", tone: "danger" },
  failed: { label: "Error", tone: "danger" },
  disconnected: { label: "Disconnected", tone: "danger" },
  revoked: { label: "Revoked", tone: "danger" },
};

const APPROVAL_STATUS_META = {
  pending: { label: "Pending", tone: "warn" },
  approved: { label: "Approved", tone: "accent" },
  denied: { label: "Denied", tone: "danger" },
  expired: { label: "Expired", tone: "muted" },
};

export const WAITING_TASK_STATUSES = [
  "waiting",
  "approval_required",
  "awaiting_approval",
  "blocked",
];

export const FAILED_TASK_STATUSES = ["failed", "error"];

const WAITING = new Set(WAITING_TASK_STATUSES);
const FAILED = new Set(FAILED_TASK_STATUSES);

function fallbackMeta(status) {
  const label = status ? String(status).replace(/[._-]+/g, " ") : "Unknown";
  return {
    label: label.charAt(0).toUpperCase() + label.slice(1),
    tone: "muted",
  };
}

function metaFor(table, status) {
  const key = String(status ?? "").toLowerCase();
  return table[key] ?? fallbackMeta(key);
}

export const taskStatusMeta = (status) => metaFor(TASK_STATUS_META, status);
export const runStatusMeta = (status) => metaFor(RUN_STATUS_META, status);
export const connectionStatusMeta = (status) =>
  metaFor(CONNECTION_STATUS_META, status);
export const approvalStatusMeta = (status) =>
  metaFor(APPROVAL_STATUS_META, status);

export const isWaitingTask = (status) => WAITING.has(String(status ?? "").toLowerCase());
export const isFailedTask = (status) => FAILED.has(String(status ?? "").toLowerCase());
export const isRunningTask = (status) =>
  ["running", "in_progress"].includes(String(status ?? "").toLowerCase());

// A single status for an agent, derived from the work it is attached to.
// Priority puts failures first so a problem is never hidden by other activity.
export function agentState(tasks = [], runs = []) {
  const runFailed = runs.some((run) =>
    ["failed", "error"].includes(String(run.status ?? "").toLowerCase())
  );
  const taskFailed = tasks.some((task) => isFailedTask(task.status));
  if (runFailed || taskFailed) return { key: "error", label: "Error", tone: "danger" };

  if (tasks.some((task) => isRunningTask(task.status))) {
    return { key: "working", label: "Working", tone: "accent", live: true };
  }

  if (tasks.some((task) => isWaitingTask(task.status))) {
    return { key: "waiting", label: "Waiting", tone: "warn" };
  }

  return { key: "idle", label: "Idle", tone: "muted" };
}

// Connections are shown by the strongest permission the viewer holds.
export function permissionLevel(permission) {
  if (!permission) return "None";
  if (permission.can_execute) return "Execute";
  if (permission.can_draft) return "Draft";
  if (permission.can_read) return "Read";
  return "None";
}
