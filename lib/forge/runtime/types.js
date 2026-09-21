// Forge-owned runtime shapes.
//
// The adapter normalizes everything at the boundary, so the rest of the
// application only ever sees these objects — never a raw Hermes payload.

export const RUNTIME_HEALTH = Object.freeze({
  healthy: "healthy",
  degraded: "degraded",
  unavailable: "unavailable",
  notConfigured: "not_configured",
});

// A run as Forge understands it. Hermes status vocabulary is mapped onto the
// mission vocabulary the rest of Forge already uses.
const RUN_STATUS = Object.freeze({
  queued: "queued",
  pending: "queued",
  starting: "queued",
  planning: "planning",
  running: "running",
  in_progress: "running",
  waiting: "waiting_approval",
  approval_required: "waiting_approval",
  completed: "completed",
  succeeded: "completed",
  success: "completed",
  failed: "failed",
  error: "failed",
  cancelled: "cancelled",
  canceled: "cancelled",
  stopped: "cancelled",
});

export function normalizeRunStatus(status) {
  const value = String(status ?? "").trim().toLowerCase();
  return RUN_STATUS[value] ?? "running";
}

export function normalizeRun(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = raw.id ?? raw.run_id ?? null;
  if (!id) return null;

  return {
    id: String(id),
    status: normalizeRunStatus(raw.status),
    statusRaw: raw.status ? String(raw.status) : null,
    createdAt: raw.created_at ?? null,
    startedAt: raw.started_at ?? null,
    completedAt: raw.completed_at ?? null,
    // A bounded, safe summary only: never the full model output.
    summary: typeof raw.summary === "string" ? raw.summary.slice(0, 400) : null,
    error: raw.error
      ? { message: String(raw.error.message ?? raw.error).slice(0, 300) }
      : null,
  };
}

export function normalizeEvent(raw) {
  if (!raw || typeof raw !== "object") return null;
  const type = raw.type ?? raw.event_type ?? raw.kind ?? null;
  if (!type) return null;

  return {
    id: raw.id !== undefined && raw.id !== null ? String(raw.id) : null,
    type: String(type),
    at: raw.created_at ?? raw.timestamp ?? raw.at ?? null,
    actorLabel: raw.agent ?? raw.actor ?? raw.actor_label ?? null,
    summary: typeof raw.summary === "string" ? raw.summary.slice(0, 300) : null,
    // Metadata is flattened to primitives so nothing nested can carry a
    // credential through the boundary.
    metadata: safeMetadata(raw.metadata ?? raw.data ?? {}),
  };
}

function safeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const safe = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "object") continue;
    safe[key] = typeof value === "string" ? value.slice(0, 200) : value;
  }
  return safe;
}

export function normalizeHealth(raw) {
  if (!raw || typeof raw !== "object") {
    return { state: RUNTIME_HEALTH.unavailable, status: null, detail: null };
  }

  const status = raw.status ?? (raw.ok === true ? "ok" : null);
  const healthy = ["ok", "healthy", "up", "ready"].includes(
    String(status ?? "").toLowerCase()
  );

  return {
    state: healthy ? RUNTIME_HEALTH.healthy : RUNTIME_HEALTH.degraded,
    status: status ? String(status) : null,
    detail: typeof raw.version === "string" ? { version: raw.version } : null,
    checkedAt: new Date().toISOString(),
  };
}

export function normalizeCapabilities(raw) {
  if (!raw) return { agents: [], features: [], raw: false };

  const source = Array.isArray(raw) ? raw : (raw.capabilities ?? raw.features ?? []);
  const features = (Array.isArray(source) ? source : []).map((entry) =>
    typeof entry === "string" ? entry : String(entry?.name ?? entry?.id ?? "")
  ).filter(Boolean);

  return {
    agents: Array.isArray(raw?.agents)
      ? raw.agents.map((agent) => String(agent?.slug ?? agent?.name ?? agent)).filter(Boolean)
      : [],
    features,
    raw: Boolean(raw),
  };
}

// The future launch contract. It is built and validated here in Phase 6, but
// nothing dispatches it yet.
export function buildRuntimeCreateRequest({
  missionId,
  workspaceId,
  agentSlug,
  fleetId = null,
  missionKind,
  brief,
  context,
  capabilities = [],
  policy = {},
  correlation = {},
}) {
  return {
    missionId,
    workspaceId,
    agentSlug,
    fleetId,
    missionKind,
    brief: String(brief ?? "").slice(0, 400),
    context: context ?? {},
    capabilities: [...capabilities],
    policy: { ...policy },
    correlation: { ...correlation },
    requestedAt: null,
  };
}

export function normalizeApprovalDecision(choice) {
  const value = String(choice ?? "").toLowerCase();
  if (!["once", "always", "deny"].includes(value)) {
    return null;
  }
  return { choice: value };
}
