// Runtime event → Forge mission event mapping.
//
// Hermes reports its own vocabulary; the mission domain has one of its own. This
// is the only translation point, and it is deliberately conservative: an event
// Forge does not recognise is dropped rather than invented into something the
// runtime never said. The mission's *state* never depends on this mapping —
// `getRun` is the authority for status — so a dropped event can never change
// what a mission claims happened.

import { MISSION_EVENT } from "../missions/events.js";

// Ordered: the first pattern that matches wins, so the specific names come first.
const EVENT_PATTERNS = Object.freeze([
  [/^run\.(queued|accepted|created|pending|starting)$/, MISSION_EVENT.missionStarted],
  [/^run\.(start|started|running)$/, MISSION_EVENT.missionStarted],
  [/^agent\.(start|started|spawned)$/, MISSION_EVENT.agentStarted],
  [/^(subagent|worker|delegate)\.(start|started|spawned)$/, MISSION_EVENT.agentStarted],
  [/^(stage|step|phase)(\.(change|changed|changed_to|start|started|update|updated))?$/, MISSION_EVENT.missionStageChanged],
  [/^tool\.(request|requested|call|calling|start|started|use|used)$/, MISSION_EVENT.toolRequested],
  [/^tool\.(complete|completed|result|finished|done|response|succeeded)$/, MISSION_EVENT.toolCompleted],
  [
    /^(approval|confirmation|confirm)\.(request|requested|required|needed|pending)$/,
    MISSION_EVENT.approvalRequested,
  ],
  [/^(approval|confirmation)\.(approved|granted)$/, MISSION_EVENT.approvalApproved],
  [/^(approval|confirmation)\.(denied|rejected)$/, MISSION_EVENT.approvalDenied],
  [/^agent\.(complete|completed|finished|done)$/, MISSION_EVENT.agentCompleted],
  [/^run\.(complete|completed|succeeded|success|done|finished)$/, MISSION_EVENT.missionCompleted],
  [/^run\.(failed|failure|error)$/, MISSION_EVENT.missionFailed],
  [/^(run\.)?(cancelled|canceled|stopped|stop|aborted|abort)$/, MISSION_EVENT.missionCancelled],
]);

// Hermes status → Forge mission status. This mirrors normalizeRunStatus in
// types.js, with one deliberate difference: a run the runtime has accepted but
// not started is *planning* in Forge, and a run waiting on the operator is
// waiting_approval. Nothing here is invented — every input comes from the run.
const STATUS_MAP = Object.freeze({
  queued: "planning",
  planning: "planning",
  running: "running",
  waiting_approval: "waiting_approval",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
});

export function missionStatusForRuntime(status) {
  return STATUS_MAP[String(status ?? "").trim().toLowerCase()] ?? null;
}

export function missionEventTypeForRuntime(type) {
  const value = String(type ?? "").trim().toLowerCase();
  if (!value) return null;
  const hit = EVENT_PATTERNS.find(([pattern]) => pattern.test(value));
  return hit ? hit[1] : null;
}

// A stable key for one runtime event, so ingesting the same runtime stream twice
// cannot duplicate a durable Forge event. Prefers the runtime's own id and falls
// back to a hash of the fields Forge actually keeps.
export function runtimeEventKey(event) {
  if (event?.id !== undefined && event?.id !== null && String(event.id).length > 0) {
    return `hermes:${String(event.id).slice(0, 120)}`;
  }

  const basis = [
    String(event?.type ?? ""),
    String(event?.at ?? ""),
    String(event?.summary ?? ""),
    stableJson(event?.metadata ?? {}),
  ].join("|");

  return `hermes:${hash(basis)}`;
}

// A runtime event as a Forge mission event spec, or null when Forge has no
// vocabulary for it. Only primitives cross over.
export function mapRuntimeEvent(event) {
  const type = missionEventTypeForRuntime(event?.type);
  if (!type) return null;

  const runtimeKey = runtimeEventKey(event);
  const tool = primitive(event?.metadata?.tool ?? event?.metadata?.tool_name ?? null);
  const stage = primitive(event?.metadata?.stage ?? event?.metadata?.step ?? null);

  return {
    type,
    at: event?.at ?? null,
    actor: { agent: agentSlug(event?.actorLabel) },
    summary: primitive(event?.summary) ?? null,
    metadata: {
      runtimeKey,
      ...(tool ? { tool } : {}),
      ...(stage ? { stage: String(stage) } : {}),
      ...(event?.type ? { runtimeEvent: String(event.type).slice(0, 80) } : {}),
    },
  };
}

// The staged action a runtime approval request describes, in the domain's shape.
// Never a credential: only the tool name, the capability, and primitive args.
export function extractApprovalRequest(event, { fallbackCapability = null } = {}) {
  if (missionEventTypeForRuntime(event?.type) !== MISSION_EVENT.approvalRequested) return null;

  const metadata = event?.metadata ?? {};
  const tool = primitive(metadata.tool ?? metadata.tool_name ?? metadata.action);
  if (!tool) return null;

  const capability = primitive(metadata.capability) ?? fallbackCapability ?? tool;
  const rawArgs = metadata.args ?? metadata.arguments ?? metadata.action_payload ?? {};

  const args = {};
  if (rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)) {
    for (const [key, value] of Object.entries(rawArgs)) {
      if (value === null || value === undefined || typeof value === "object") continue;
      args[key] = typeof value === "string" ? value.slice(0, 200) : value;
    }
  }

  return {
    tool: String(tool).slice(0, 120),
    capability: String(capability).slice(0, 120),
    args,
    destination: primitive(metadata.destination) ?? null,
    expiresAt: primitive(metadata.expires_at ?? metadata.expiresAt) ?? null,
    runtimeKey: runtimeEventKey(event),
  };
}

function agentSlug(label) {
  const value = String(label ?? "").trim().toLowerCase();
  if (!value) return null;
  // Runtime actor labels can carry decoration; the slug is the leading token.
  return value.replace(/[^a-z0-9_-].*$/, "").slice(0, 32) || null;
}

function primitive(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return null;
  const text = String(value);
  return text.length > 0 ? text.slice(0, 200) : null;
}

function stableJson(value) {
  if (!value || typeof value !== "object") return "";
  const keys = Object.keys(value).sort();
  return JSON.stringify(keys.map((key) => [key, String(value[key])]));
}

// FNV-1a: short, deterministic, and good enough to key a dedupe check.
function hash(text) {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value.toString(16).padStart(8, "0");
}
