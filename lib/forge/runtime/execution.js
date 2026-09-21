// Single-agent mission execution.
//
// The domain side of the runtime boundary: it decides what is eligible to run,
// builds the authorized request, calls the runtime interface, and folds the
// runtime's answer back into mission state and events. It never touches Hermes
// HTTP, never reads a configuration value, and never sees a row — the runtime
// adapter and the persistence store are both injected.
//
// Phase 7 runs exactly one specialist per mission. Fleet composition and tool
// execution arrive in later phases, and the allowlist below says so out loud
// rather than leaving it implied.

import { MISSION_EVENT } from "../missions/events.js";
import {
  MISSION_STATUS,
  canTransitionMission,
  createApproval,
  isTerminalMission,
  normalizeResult,
  stagesForKind,
} from "../missions/index.js";
import { buildRuntimeContext } from "./context.js";
import { RUNTIME_ERROR_CODES, isRuntimeError } from "./errors.js";
import {
  extractApprovalRequest,
  mapRuntimeEvent,
  missionStatusForRuntime,
  runtimeEventKey,
} from "./event-map.js";
import { buildRuntimeCreateRequest } from "./types.js";

// Mission kinds this phase may dispatch: one specialist agent, read-only, no
// external connection required. `warroom` is the reference's read-only status
// report, and it is the only kind wired end to end today. Fleet kinds need
// delegation (Phase 8) and the publish/subscription kinds need real tools
// (Phase 9+), so they are refused with a plain reason instead of half-running.
export const RUNTIME_ELIGIBLE_KINDS = Object.freeze(["warroom"]);

// Max runtime events folded in per reconciliation, so one oversized stream can
// never turn into an unbounded write.
const MAX_EVENTS_PER_SYNC = 200;

// Events that close a mission are written by reconciliation, once, from the
// run's own status — never twice from a stream that also reported them.
const CLOSING_MISSION_EVENTS = new Set([
  MISSION_EVENT.missionCompleted,
  MISSION_EVENT.missionFailed,
  MISSION_EVENT.missionCancelled,
]);

// A deterministic key derived from the Forge mission identity. Hermes reports
// durable idempotency support, so a repeated create for the same mission returns
// the same run rather than starting a second one.
export function idempotencyKeyFor(taskId) {
  return `forge.mission.${taskId}.single-agent.v1`;
}

export function isRuntimeEligible(mission) {
  return RUNTIME_ELIGIBLE_KINDS.includes(String(mission?.kind ?? ""));
}

// The authorized request Forge is willing to send for this mission. Capability
// is the mission's own route capability at read level; connections, credentials,
// and unrelated workspace data are structurally absent.
export function buildMissionRuntimeRequest({
  mission,
  agent,
  workspace = null,
  allowedActionLevel = "read",
}) {
  const context = buildRuntimeContext({
    operatorBrief: mission.brief || mission.title || "",
    agentInstructions: agent?.instructions ?? null,
    capabilityGrants: mission.capability
      ? [{ capability: mission.capability, maxActionLevel: allowedActionLevel }]
      : [],
    connectionRefs: [],
    workspace: workspace
      ? { name: workspace.name ?? null, slug: workspace.slug ?? null, kind: workspace.kind ?? null }
      : null,
    policy: { allowedActionLevel },
    delegation: { enabled: false },
  });

  return buildRuntimeCreateRequest({
    missionId: mission.id,
    workspaceId: mission.workspaceId ?? workspace?.id ?? null,
    agentSlug: mission.leadSlug,
    fleetId: null,
    missionKind: mission.kind,
    brief: mission.brief || mission.title || "",
    context,
    capabilities: mission.capability ? [mission.capability] : [],
    policy: {
      allowedActionLevel,
      approvalRequiredForExecute: true,
      workspaceScoped: true,
      fleet: false,
    },
    correlation: {
      taskId: mission.id,
      idempotencyKey: idempotencyKeyFor(mission.id),
    },
  });
}

// ------------------------------------------------------------------ dispatch --

// Starts exactly one runtime run for one persisted mission.
export async function startSingleAgentMission({
  runtime,
  store,
  mission,
  agent,
  workspace = null,
  actorUserId = null,
  at = null,
  liveEventsMaxMs = 8000,
}) {
  const now = at ?? new Date().toISOString();

  if (!mission) return failure("mission_not_found", "That mission is not available to you.");

  if (mission.status !== MISSION_STATUS.queued) {
    return failure(
      "mission_not_queued",
      `This mission is ${mission.status}, so it cannot be started again.`
    );
  }

  if (!isRuntimeEligible(mission)) {
    return failure(
      "mission_kind_not_executable",
      `${String(mission.kind).toUpperCase()} missions are not executed through the runtime yet. Phase 7 runs single read-only missions, starting with WAR ROOM.`
    );
  }

  if (!store?.hasTrustedWrites) {
    return failure(
      "trusted_writes_not_configured",
      "Run records and mission events need SUPABASE_SERVICE_ROLE_KEY on the server, so nothing was dispatched."
    );
  }

  const existing = await store.findRun({ taskId: mission.id });
  if (existing?.hermesRunId) {
    return {
      ok: true,
      alreadyStarted: true,
      run: existing,
      message: "This mission already has a runtime run, so nothing new was started.",
    };
  }

  const request = buildMissionRuntimeRequest({
    mission: { ...mission, requestedBy: actorUserId },
    agent,
    workspace,
  });

  let created;
  try {
    created = await runtime.createRun(request);
  } catch (error) {
    const code = isRuntimeError(error) ? error.code : RUNTIME_ERROR_CODES.badResponse;
    return failure(code, dispatchMessage(code));
  }

  if (!created?.id) {
    return failure(RUNTIME_ERROR_CODES.badResponse, dispatchMessage(RUNTIME_ERROR_CODES.badResponse));
  }

  const run = await store.createRun({
    workspaceId: mission.workspaceId ?? workspace?.id ?? null,
    taskId: mission.id,
    agentId: mission.agentId ?? agent?.id ?? null,
    hermesRunId: String(created.id),
    status: created.status ?? "running",
    startedAt: now,
  });

  const stage = stageForStatus(mission.kind, "running", mission.currentStage);

  await store.updateMission({
    taskId: mission.id,
    patch: {
      status: MISSION_STATUS.running,
      current_stage: stage.current,
      reached_stages: stage.reached,
      started_at: now,
      updated_at: now,
      current_step: "Runtime started",
    },
  });

  const appended = await store.appendEvents({
    workspaceId: mission.workspaceId,
    taskId: mission.id,
    agentRunId: run?.id ?? null,
    events: [
      {
        type: MISSION_EVENT.missionStarted,
        at: now,
        actor: { agent: mission.leadSlug },
        metadata: { runtimeKey: "forge:dispatch", runtimeRun: String(created.id).slice(0, 80) },
      },
      {
        type: MISSION_EVENT.agentStarted,
        at: now,
        actor: { agent: mission.leadSlug },
        metadata: { runtimeKey: "forge:agent-started", work: "the mission" },
      },
    ],
  });

  // The runtime serves a run's events only while the run is live, so the events
  // that arrive in the moments after dispatch are folded in here, on a bounded
  // read. Everything else is picked up by reconciliation from the run's status
  // and output, which stay durable.
  let runtimeEventsReceived = 0;
  if (runtime.streamsEvents !== false) {
    const collected = await collectRuntimeEvents({
      runtime,
      mission: { ...mission, events: [...(mission.events ?? []), ...(appended ?? [])] },
      run,
      live: true,
      maxMs: liveEventsMaxMs,
      skipTerminal: true,
    });
    runtimeEventsReceived = collected.received;
    if (collected.fresh.length > 0) {
      await store.appendEvents({
        workspaceId: mission.workspaceId,
        taskId: mission.id,
        agentRunId: run?.id ?? null,
        events: collected.fresh,
      });
    }
  }

  return {
    ok: true,
    run,
    appendedEvents: appended?.length ?? 0,
    runtimeEventsReceived,
    message: `${mission.leadName ?? String(mission.leadSlug).toUpperCase()} is working the mission through the runtime.`,
  };
}

// ------------------------------------------------------------------ reconcile --

// Folds new runtime state into the mission: status, stage, events, result.
// Safe to call repeatedly — it appends only events Forge has not already stored
// and refuses to move a mission that has already finished.
export async function reconcileMissionRun({ runtime, store, mission, run, at = null }) {
  const now = at ?? new Date().toISOString();

  if (!mission || !run?.hermesRunId) {
    return failure("no_runtime_run", "This mission has no runtime run to reconcile with.");
  }

  let runState;
  try {
    runState = await runtime.getRun(run.hermesRunId);
  } catch (error) {
    const code = isRuntimeError(error) ? error.code : RUNTIME_ERROR_CODES.badResponse;
    return failure(code, reconcileMessage(code, run.hermesRunId));
  }

  // While the run is live the runtime streams its events; once it has finished
  // there is nothing left to read, so the run's own status and output carry the
  // outcome and no event is invented to fill the gap.
  const { fresh, approvalRequests, known, received } = await collectRuntimeEvents({
    runtime,
    mission,
    run,
    live: !["completed", "failed", "cancelled"].includes(String(runState?.status ?? "")),
    maxMs: 6000,
  });

  const target = isTerminalMission(mission.status)
    ? mission.status
    : approvalRequests.length > 0
      ? MISSION_STATUS.waitingApproval
      : missionStatusForRuntime(runState?.status);

  const status = target && canTransitionMission(mission.status, target) ? target : mission.status;

  let result = null;
  let error = null;
  let resultUnreadable = false;

  if (status === MISSION_STATUS.completed) {
    const parsed = parseRuntimeResult(runState?.resultText, mission.resultType);
    result = parsed.result;
    resultUnreadable = parsed.malformed;
    if (resultUnreadable) {
      error = "The runtime finished, but its result could not be read safely.";
    }
  } else if (status === MISSION_STATUS.failed) {
    error = runState?.error?.message
      ? String(runState.error.message).slice(0, 300)
      : "The runtime reported that the mission failed.";
  }

  const finalStatus = resultUnreadable ? MISSION_STATUS.failed : status;
  const stage = stageForStatus(mission.kind, finalStatus, mission.currentStage);

  const patch = {
    status: finalStatus,
    current_stage: stage.current,
    reached_stages: stage.reached,
    updated_at: now,
    ...(finalStatus === MISSION_STATUS.completed
      ? { completed_at: now, current_step: "Complete" }
      : {}),
    ...(finalStatus === MISSION_STATUS.failed ? { error: { message: error } } : {}),
    ...(finalStatus === MISSION_STATUS.cancelled ? { cancelled_at: now } : {}),
    ...(result ? { result } : {}),
  };

  if (finalStatus !== mission.status || result) {
    await store.updateMission({ taskId: mission.id, patch });
  }

  // Closing events carry their own keys, so a second reconciliation of the same
  // runtime state cannot append them twice.
  const closing = [];
  // An unreadable result is recorded as the safe fallback on the mission, but it
  // is not announced as a result update: the failure event tells the truth.
  if (result && !resultUnreadable && !known.has("forge:result")) {
    closing.push({
      type: MISSION_EVENT.resultUpdated,
      at: now,
      actor: { agent: mission.leadSlug },
      metadata: { runtimeKey: "forge:result", resultType: result.kind },
    });
  }

  if (finalStatus === MISSION_STATUS.failed && !known.has("forge:state:failed")) {
    closing.push({
      type: MISSION_EVENT.missionFailed,
      at: now,
      actor: { agent: mission.leadSlug },
      metadata: { runtimeKey: "forge:state:failed" },
      summary: error,
    });
  } else if (finalStatus === MISSION_STATUS.completed && !known.has("forge:state:completed")) {
    closing.push({
      type: MISSION_EVENT.missionCompleted,
      at: now,
      metadata: { runtimeKey: "forge:state:completed" },
    });
  } else if (finalStatus === MISSION_STATUS.cancelled && !known.has("forge:state:cancelled")) {
    closing.push({
      type: MISSION_EVENT.missionCancelled,
      at: now,
      metadata: { runtimeKey: "forge:state:cancelled" },
    });
  }

  const events = [...fresh, ...closing];

  if (events.length > 0) {
    await store.appendEvents({
      workspaceId: mission.workspaceId,
      taskId: mission.id,
      agentRunId: run.id ?? null,
      events,
    });
  }

  for (const request of approvalRequests) {
    await stageApprovalFromRuntime({ store, mission, run, request, at: now });
  }

  await store.updateRun({
    runId: run.id,
    status: finalStatus,
    output: result ?? null,
    error: error ? { message: error } : null,
    completedAt: isTerminalMission(finalStatus) ? now : null,
  });

  return {
    ok: true,
    status: finalStatus,
    runtimeStatus: runState?.status ?? null,
    runtimeEventsReceived: received,
    appendedEvents: events.length,
    resultApplied: Boolean(result),
    resultUnreadable,
    approvalsStaged: approvalRequests.length,
    message: statusMessage(finalStatus, resultUnreadable, events.length),
  };
}

// ----------------------------------------------------------------------- stop --

// Cancels a mission and asks the runtime to stop its run. Repeating it is safe:
// a mission that has already finished is reported as closed without another
// runtime call.
export async function stopMissionRun({
  runtime,
  store,
  mission,
  run = null,
  actorUserId = null,
  reason = null,
  at = null,
}) {
  const now = at ?? new Date().toISOString();

  if (isTerminalMission(mission?.status)) {
    return {
      ok: true,
      alreadyStopped: true,
      message: `This mission is already ${mission.status}. Nothing was sent to the runtime again.`,
    };
  }

  let runtimeStopped = false;
  let runtimeProblem = null;

  if (run?.hermesRunId) {
    try {
      await runtime.stopRun(run.hermesRunId);
      runtimeStopped = true;
    } catch (error) {
      const code = isRuntimeError(error) ? error.code : RUNTIME_ERROR_CODES.badResponse;
      // A run the runtime no longer knows about is already over; anything else
      // means Forge could not confirm the stop, and the operator is told so.
      runtimeStopped = code === RUNTIME_ERROR_CODES.runNotFound;
      runtimeProblem = runtimeStopped ? null : code;
    }
  }

  await store.updateMission({
    taskId: mission.id,
    patch: {
      status: MISSION_STATUS.cancelled,
      cancelled_at: now,
      cancel_requested_at: now,
      cancel_requested_by: actorUserId,
      updated_at: now,
      current_step: reason ?? "Cancelled",
    },
  });

  await store.appendEvents({
    workspaceId: mission.workspaceId,
    taskId: mission.id,
    agentRunId: run?.id ?? null,
    events: [
      {
        type: MISSION_EVENT.missionCancelled,
        at: now,
        actor: { user: actorUserId },
        summary: reason,
        metadata: {
          runtimeKey: "forge:state:cancelled",
          partialResult: Boolean(mission.result),
          ...(runtimeProblem ? { runtimeStop: runtimeProblem } : {}),
        },
      },
    ],
  });

  if (run?.id) {
    await store.updateRun({
      runId: run.id,
      status: MISSION_STATUS.cancelled,
      completedAt: now,
    });
  }

  return {
    ok: true,
    runtimeStopped,
    runtimeProblem,
    message: runtimeProblem
      ? "Cancelled. Forge could not reach the runtime, so its work may not have stopped."
      : "Cancelled. History and partial work are preserved.",
  };
}

// ----------------------------------------------------------------- helpers ---

// Reads whatever the runtime can give for this run, maps the events Forge has
// vocabulary for, and drops the ones it has already stored. Token-level events
// (`message.delta`) and anything else Forge does not recognise are ignored by
// the mapping rather than turned into noise, and a stream Forge cannot read is
// never treated as a mission failure.
async function collectRuntimeEvents({
  runtime,
  mission,
  run,
  live = false,
  maxMs = 8000,
  skipTerminal = false,
}) {
  let runtimeEvents = [];
  try {
    runtimeEvents = await runtime.getRunEvents(run.hermesRunId, { live, maxMs });
  } catch {
    runtimeEvents = [];
  }

  if (!Array.isArray(runtimeEvents)) runtimeEvents = [];
  if (runtimeEvents.length > MAX_EVENTS_PER_SYNC) {
    runtimeEvents = runtimeEvents.slice(-MAX_EVENTS_PER_SYNC);
  }

  const known = new Set(
    (mission.events ?? []).map((event) => event.metadata?.runtimeKey).filter(Boolean)
  );
  const fresh = [];
  const approvalRequests = [];

  for (const event of runtimeEvents) {
    const mapped = mapRuntimeEvent(event);
    if (!mapped) continue;
    // Reconciliation is the single writer of a mission's closing state, so a
    // terminal event read during dispatch is left for it rather than recorded
    // out of order.
    if (skipTerminal && CLOSING_MISSION_EVENTS.has(mapped.type)) continue;
    const key = mapped.metadata.runtimeKey;
    if (!key || known.has(key)) continue;
    known.add(key);
    fresh.push(mapped);

    const approval = extractApprovalRequest(event, { fallbackCapability: mission.capability });
    if (approval) approvalRequests.push(approval);
  }

  return { fresh, approvalRequests, known, received: runtimeEvents.length };
}

async function stageApprovalFromRuntime({ store, mission, run, request, at }) {
  const created = createApproval({
    id: `runtime-${String(request.runtimeKey).slice(-48)}`,
    tool: request.tool,
    capability: request.capability,
    args: request.args,
    destination: request.destination,
    requestedBy: mission.requestedBy ?? null,
    expiresAt: request.expiresAt,
    now: at,
  });

  if (!created.ok) return null;
  return store.stageApproval({
    approval: created.approval,
    taskId: mission.id,
    agentRunId: run.id ?? null,
  });
}

// The run's final text is parsed as JSON and validated against the mission's own
// result contract. Anything unreadable becomes the safe fallback: Forge never
// claims a result it could not validate.
export function parseRuntimeResult(text, resultType) {
  const raw = unwrap(extractJson(text));
  if (raw === null) {
    return { result: normalizeResult(resultType, null), malformed: true };
  }
  const normalized = normalizeResult(resultType, raw);
  return { result: normalized, malformed: normalized.kind === "malformed" };
}

function extractJson(text) {
  if (typeof text !== "string" || text.trim().length === 0) return null;

  const source = text.trim();
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : source;

  try {
    return JSON.parse(candidate);
  } catch {
    // The last resort: the first balanced object in the text.
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

// A runtime may hand back {"result": {...}} or {"output": {...}} around the
// contract. One level is unwrapped, and only when the wrapper adds nothing.
function unwrap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  for (const key of ["result", "output", "data", "final"]) {
    const nested = value[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) return nested;
  }
  return value;
}

// Stage moves forward only: a mission never reports a stage it has not reached.
function stageForStatus(kind, status, current) {
  const stages = stagesForKind(kind);
  const indexOf = (stage) => stages.indexOf(stage);
  const first = stages[0] ?? "queued";

  if (status === MISSION_STATUS.completed) {
    return { current: stages.at(-1) ?? first, reached: [...stages] };
  }

  let target = current ?? first;
  if (status === MISSION_STATUS.waitingApproval) {
    target = stages.includes("confirm") ? "confirm" : stages[1] ?? target;
  } else if (status === MISSION_STATUS.running || status === MISSION_STATUS.planning) {
    target = stages[1] ?? target;
  }

  const currentStage = indexOf(target) > indexOf(current ?? first) && indexOf(target) > 0
    ? target
    : current ?? first;
  const reachedIndex = Math.max(indexOf(currentStage), 0);

  return { current: currentStage, reached: stages.slice(0, reachedIndex + 1) };
}

function failure(code, message, extra = {}) {
  return { ok: false, code, message, ...extra };
}

function dispatchMessage(code) {
  switch (code) {
    case RUNTIME_ERROR_CODES.notConfigured:
      return "No execution runtime is configured, so the mission is still queued.";
    case RUNTIME_ERROR_CODES.unauthorized:
      return "The runtime rejected Forge's credentials, so the mission is still queued.";
    case RUNTIME_ERROR_CODES.unreachable:
      return "The runtime could not be reached, so the mission is still queued.";
    case RUNTIME_ERROR_CODES.timeout:
      return "The runtime did not answer in time, so the mission is still queued.";
    case RUNTIME_ERROR_CODES.rejected:
      return "The runtime refused to start this mission.";
    default:
      return "The runtime did not accept the mission, so it is still queued.";
  }
}

function reconcileMessage(code, runId) {
  switch (code) {
    case RUNTIME_ERROR_CODES.runNotFound:
      return "The runtime does not know that run any more, so nothing was updated.";
    case RUNTIME_ERROR_CODES.notConfigured:
      return "No execution runtime is configured, so the mission could not be reconciled.";
    case RUNTIME_ERROR_CODES.unauthorized:
      return "The runtime rejected Forge's credentials, so the mission could not be reconciled.";
    case RUNTIME_ERROR_CODES.unreachable:
      return "The runtime could not be reached, so the mission was left as it is.";
    case RUNTIME_ERROR_CODES.timeout:
      return "The runtime did not answer in time, so the mission was left as it is.";
    default:
      return `The runtime did not report on run ${String(runId).slice(0, 24)}.`;
  }
}

function statusMessage(status, unreadable, appended) {
  if (unreadable) {
    return "The runtime finished, but its result could not be read safely. Nothing was claimed.";
  }
  const tail = appended > 0 ? ` ${appended} new event${appended === 1 ? "" : "s"} recorded.` : "";
  switch (status) {
    case MISSION_STATUS.completed:
      return `Mission complete.${tail}`;
    case MISSION_STATUS.failed:
      return `The runtime reported a failure.${tail}`;
    case MISSION_STATUS.cancelled:
      return `The runtime reported the mission as stopped.${tail}`;
    case MISSION_STATUS.waitingApproval:
      return `The runtime is waiting for your decision.${tail}`;
    default:
      return tail.trim() || "Nothing new from the runtime yet.";
  }
}
