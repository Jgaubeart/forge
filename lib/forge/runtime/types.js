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
    // The run's final text, bounded. The mission domain parses it into a result
    // contract and persists only the validated fields — the raw text is never
    // stored or rendered.
    resultText: runResultText(raw),
    error: raw.error
      ? { message: String(raw.error.message ?? raw.error).slice(0, 300) }
      : null,
  };
}

const RESULT_TEXT_LIMIT = 20_000;

function runResultText(raw) {
  const candidate =
    raw.output_text ?? raw.output ?? raw.result ?? raw.final_output ?? raw.response ?? null;

  if (candidate === null || candidate === undefined) return null;

  let text;
  if (typeof candidate === "string") {
    text = candidate;
  } else {
    try {
      text = JSON.stringify(candidate);
    } catch {
      return null;
    }
  }

  return text ? text.slice(0, RESULT_TEXT_LIMIT) : null;
}

export function normalizeEvent(raw) {
  if (!raw || typeof raw !== "object") return null;
  const type = raw.type ?? raw.event_type ?? raw.kind ?? (typeof raw.event === "string" ? raw.event : null);
  if (!type) return null;

  return {
    id: raw.id !== undefined && raw.id !== null ? String(raw.id) : null,
    type: String(type),
    at: normalizeTimestamp(raw.created_at ?? raw.timestamp ?? raw.at ?? null),
    actorLabel: raw.agent ?? raw.actor ?? raw.actor_label ?? null,
    summary: typeof raw.summary === "string" ? raw.summary.slice(0, 300) : null,
    // Metadata is flattened to primitives so nothing nested can carry a
    // credential through the boundary.
    metadata: eventMetadata(raw),
  };
}

// The live stream puts an event's detail at the top level (`tool`, `capability`,
// `stage`), while the REST endpoints nest it under `metadata`. Both are read, and
// the envelope fields an event carries about itself are never mistaken for
// metadata.
const EVENT_ENVELOPE_KEYS = new Set([
  "id",
  "object",
  "event",
  "type",
  "event_type",
  "kind",
  "run_id",
  "runId",
  "session_id",
  "timestamp",
  "created_at",
  "at",
  "agent",
  "actor",
  "actor_label",
  "summary",
  "delta",
  "text",
  "output",
  "usage",
]);

function eventMetadata(raw) {
  const explicit = raw.metadata ?? raw.data;
  const safe =
    explicit && typeof explicit === "object" && !Array.isArray(explicit)
      ? safeMetadata(explicit)
      : {};

  for (const [key, value] of Object.entries(raw)) {
    if (EVENT_ENVELOPE_KEYS.has(key) || key in safe) continue;
    if (value === null || value === undefined || typeof value === "object") continue;
    safe[key] = typeof value === "string" ? value.slice(0, 200) : value;
  }

  return safe;
}

// The live stream timestamps events in epoch seconds, while the REST endpoints
// use ISO strings. Both become the same ISO string so dedupe keys stay stable.
function normalizeTimestamp(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value > 1e12 ? value : value * 1000;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === "string") {
    const asNumber = Number(value);
    if (value.trim() !== "" && Number.isFinite(asNumber) && asNumber > 1e6) {
      return normalizeTimestamp(asNumber);
    }
    return value;
  }
  return null;
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
  const features = Array.isArray(source)
    ? source
        .map((entry) =>
          typeof entry === "string" ? entry : String(entry?.name ?? entry?.id ?? "")
        )
        .filter(Boolean)
    : // The live runtime reports capabilities as a name → flag map rather than a
      // list, so an object is read as its enabled keys.
      Object.entries(source && typeof source === "object" ? source : {})
        .filter(([, value]) => isEnabledFeature(value))
        .map(([name]) => name);

  return {
    agents: Array.isArray(raw?.agents)
      ? raw.agents.map((agent) => String(agent?.slug ?? agent?.name ?? agent)).filter(Boolean)
      : [],
    features,
    raw: Boolean(raw),
  };
}

// A feature entry counts as present when its flag is truthy, and when it is a
// nested descriptor only if that descriptor does not say it is switched off.
function isEnabledFeature(value) {
  if (value === null || value === undefined || value === false || value === 0) {
    return false;
  }
  if (typeof value === "object") {
    return value.enabled !== false && value.supported !== false;
  }
  return true;
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
