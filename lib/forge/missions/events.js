// Mission event vocabulary and operator-readable labelling.
//
// Events describe operator-visible activity. The reference build emits a small
// set (spawn, stage, tool, done, error) with a human label; this is the same idea
// with a canonical, runtime-neutral vocabulary the future event stream and the
// UI both use.
//
// Labelling is deterministic — no model, no guessing. `toolLabel` is the ported
// vocabulary from the reference's tool_label helper.

export const MISSION_EVENT = Object.freeze({
  missionCreated: "mission.created",
  missionStarted: "mission.started",
  missionStageChanged: "mission.stage_changed",
  agentAssigned: "agent.assigned",
  agentStarted: "agent.started",
  agentCompleted: "agent.completed",
  toolRequested: "tool.requested",
  toolCompleted: "tool.completed",
  approvalRequested: "approval.requested",
  approvalApproved: "approval.approved",
  approvalDenied: "approval.denied",
  approvalExpired: "approval.expired",
  resultUpdated: "result.updated",
  missionCompleted: "mission.completed",
  missionFailed: "mission.failed",
  missionCancelled: "mission.cancelled",
});

export const MISSION_EVENT_TYPES = Object.freeze(Object.values(MISSION_EVENT));

// Reference event kinds map onto the canonical vocabulary.
export const REFERENCE_EVENT_ALIASES = Object.freeze({
  spawn: MISSION_EVENT.agentStarted,
  stage: MISSION_EVENT.missionStageChanged,
  tool: MISSION_EVENT.toolRequested,
  done: MISSION_EVENT.agentCompleted,
  error: MISSION_EVENT.missionFailed,
});

const EVENT_TONES = Object.freeze({
  [MISSION_EVENT.missionFailed]: "err",
  [MISSION_EVENT.approvalDenied]: "err",
  [MISSION_EVENT.approvalExpired]: "muted",
  [MISSION_EVENT.approvalRequested]: "wait",
  [MISSION_EVENT.missionCancelled]: "muted",
  [MISSION_EVENT.missionCompleted]: "accent",
  [MISSION_EVENT.agentCompleted]: "accent",
  [MISSION_EVENT.toolCompleted]: "accent",
});

export function isKnownEventType(type) {
  return MISSION_EVENT_TYPES.includes(String(type ?? ""));
}

export function normalizeEventType(type) {
  const value = String(type ?? "");
  if (MISSION_EVENT_TYPES.includes(value)) return value;
  return REFERENCE_EVENT_ALIASES[value] ?? null;
}

export function createMissionEvent({
  id,
  type,
  at,
  actorAgent = null,
  actorUser = null,
  summary = null,
  metadata = {},
}) {
  const normalized = normalizeEventType(type);
  if (!normalized) {
    return { ok: false, reason: "unknown_event_type", event: null };
  }

  return {
    ok: true,
    event: {
      id: id ?? `${normalized}:${at ?? ""}`,
      type: normalized,
      at: at ?? null,
      actor: actorAgent ? { agent: actorAgent } : actorUser ? { user: actorUser } : null,
      summary: summary === null ? null : String(summary),
      metadata: sanitizeMetadata(metadata),
    },
  };
}

// Metadata is only ever primitive values, so nothing nested (and nothing that
// could hold a credential) can leak into an event.
function sanitizeMetadata(metadata) {
  const safe = {};
  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (value === null || value === undefined) continue;
    if (typeof value === "object") continue;
    safe[key] = typeof value === "string" ? value.slice(0, 200) : value;
  }
  return safe;
}

export function appendMissionEvent(mission, event) {
  const id = uniqueEventId(event.id, mission.events);
  return {
    ...mission,
    events: [...mission.events, id === event.id ? event : { ...event, id }],
  };
}

// Two events can share a type and a timestamp (three workers assigned in the
// same second, for example). Appending guarantees a stable unique id so the
// event stream stays a proper sequence.
function uniqueEventId(id, existing) {
  let candidate = id;
  let suffix = 1;
  while (existing.some((event) => event.id === candidate)) {
    suffix += 1;
    candidate = `${id}#${suffix}`;
  }
  return candidate;
}

export function eventTone(type) {
  return EVENT_TONES[normalizeEventType(type) ?? ""] ?? "muted";
}

// Ported from the reference's tool_label: a tool identifier becomes a short
// operator phrase, and the verb tells the operator whether anything mutated.
const TOOL_VOCABULARY = [
  { match: /gmail.*send|social.*publish|comments\.reply/, label: "sending", mutating: true },
  { match: /draft/, label: "drafting", mutating: true },
  { match: /create|write|update|deploy/, label: "preparing", mutating: true },
  { match: /gmail|mail/, label: "reading mail", mutating: false },
  { match: /comment/, label: "reading comments", mutating: false },
  { match: /social|post/, label: "preparing posts", mutating: true },
  { match: /analytics|channel|report/, label: "pulling numbers", mutating: false },
  { match: /subscription/, label: "sweeping recurring charges", mutating: false },
  { match: /search|research/, label: "searching", mutating: false },
  { match: /artifact|buildapp|app/, label: "building", mutating: true },
];

export function toolLabel(toolId) {
  const id = String(toolId ?? "").toLowerCase();
  const hit = TOOL_VOCABULARY.find((entry) => entry.match.test(id));
  if (hit) return { phrase: hit.label, mutating: hit.mutating };
  return { phrase: `using ${id || "a tool"}`, mutating: false };
}

// Deterministic operator-facing text for an event. No model is involved.
export function describeEvent(event, { agentName = null, missionTitle = null } = {}) {
  const type = normalizeEventType(event?.type) ?? event?.type;
  const who = agentName ?? (event?.actor?.agent ? String(event.actor.agent).toUpperCase() : "JARVIS");
  const tool = event?.metadata?.tool ? toolLabel(event.metadata.tool) : null;

  switch (type) {
    case MISSION_EVENT.missionCreated:
      return `${missionTitle ?? "Mission"} created`;
    case MISSION_EVENT.missionStarted:
      return `${who} started the mission`;
    case MISSION_EVENT.missionStageChanged:
      return event?.metadata?.stage
        ? `stage: ${String(event.metadata.stage).toLowerCase()}`
        : "stage changed";
    case MISSION_EVENT.agentAssigned:
      return `${who} assigned${event?.metadata?.role ? ` as ${event.metadata.role}` : ""}`;
    case MISSION_EVENT.agentStarted:
      return `${who} began ${event?.metadata?.work ?? "work"}`;
    case MISSION_EVENT.agentCompleted:
      return `${who} finished${event?.metadata?.work ? ` ${event.metadata.work}` : ""}`;
    case MISSION_EVENT.toolRequested:
      return tool ? `${who} ${tool.phrase}…` : `${who} requested a tool`;
    case MISSION_EVENT.toolCompleted:
      return tool
        ? `${who} finished ${tool.phrase}${tool.mutating ? " (draft step)" : ""}`
        : `${who} finished a tool step`;
    case MISSION_EVENT.approvalRequested:
      return "Awaiting confirmation";
    case MISSION_EVENT.approvalApproved:
      return "Approved by the operator";
    case MISSION_EVENT.approvalDenied:
      return "Declined by the operator";
    case MISSION_EVENT.approvalExpired:
      return "Confirmation expired — no action taken";
    case MISSION_EVENT.resultUpdated:
      return "Result updated";
    case MISSION_EVENT.missionCompleted:
      return "Mission complete";
    case MISSION_EVENT.missionFailed:
      return event?.summary ? String(event.summary) : "Mission stopped";
    case MISSION_EVENT.missionCancelled:
      return "Mission cancelled";
    default:
      return event?.summary ? String(event.summary) : String(type ?? "event");
  }
}
