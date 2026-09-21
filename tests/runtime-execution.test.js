import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import { assertSafeRuntimeContext } from "../lib/forge/runtime/context.js";
import { RUNTIME_ERROR_CODES, runtimeError } from "../lib/forge/runtime/errors.js";
import {
  extractApprovalRequest,
  mapRuntimeEvent,
  missionEventTypeForRuntime,
  missionStatusForRuntime,
  runtimeEventKey,
} from "../lib/forge/runtime/event-map.js";
import {
  RUNTIME_ELIGIBLE_KINDS,
  buildMissionRuntimeRequest,
  idempotencyKeyFor,
  isRuntimeEligible,
  parseRuntimeResult,
  reconcileMissionRun,
  startSingleAgentMission,
  stopMissionRun,
} from "../lib/forge/runtime/execution.js";
import { createFakeRuntimeAdapter } from "../lib/forge/runtime/fake-runtime.js";
import { createHermesRuntimeAdapter } from "../lib/forge/runtime/hermes-adapter.js";
import { MALFORMED_RESULT, MISSION_EVENT, MISSION_STATUSES } from "../lib/forge/missions/index.js";
import { createAgentRunStore, findRunForTask } from "../lib/forge/persistence/runs.js";
import { createFakeSupabase } from "./helpers/fake-supabase.js";

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

const WARROOM_AGENT = {
  slug: "warroom",
  name: "WARROOM",
  instructions: "You are WARROOM. Read-only status reporting. Do not call external tools.",
};

function warroomMission(overrides = {}) {
  return {
    id: "mission-1",
    kind: "warroom",
    kindTitle: "CHANNEL WAR ROOM",
    title: "CHANNEL WAR ROOM — status",
    brief: "Return a concise operational status summary for this test mission. Do not call external tools.",
    status: "queued",
    leadSlug: "warroom",
    leadName: "WARROOM",
    capability: "analytics.read",
    currentStage: "queued",
    reached: ["queued"],
    team: [],
    events: [],
    approval: null,
    result: null,
    resultType: "warroom",
    cancellationAllowed: true,
    workspaceId: "ws-a",
    requestedBy: "user-a",
    agentId: "agent-warroom",
    ...overrides,
  };
}

const WARROOM_RESULT = {
  headline: "Quiet week, nothing on fire",
  stats: { views_24h: 128, median_delta: "+4%", subs: 3 },
  videos: [],
  comments: [],
  read: "Steady.",
};

// The store interface the execution layer is written against. In production this
// is the Supabase-backed store (lib/forge/persistence/runs.js); here it is an
// in-memory stand-in so the domain logic is exercised on its own.
function memoryStore({ hasTrustedWrites = true } = {}) {
  const state = { runs: [], tasks: new Map(), events: [], approvals: [] };

  return {
    hasTrustedWrites,
    _state: state,
    async findRun({ taskId }) {
      if (!hasTrustedWrites) return null;
      return state.runs.find((run) => run.taskId === taskId) ?? null;
    },
    async createRun(input) {
      const run = {
        id: `run-row-${state.runs.length + 1}`,
        taskId: input.taskId,
        hermesRunId: input.hermesRunId,
        status: input.status ?? "queued",
      };
      state.runs.push(run);
      return run;
    },
    async updateRun({ runId, status, output = null, error = null, completedAt = null }) {
      const run = state.runs.find((entry) => entry.id === runId);
      if (!run) return null;
      Object.assign(run, { status, output, error, completedAt });
      return run;
    },
    async updateMission({ taskId, patch }) {
      state.tasks.set(taskId, { ...(state.tasks.get(taskId) ?? {}), ...patch });
      return taskId;
    },
    async appendEvents({ taskId, agentRunId = null, events }) {
      const rows = events.map((event, index) => ({
        id: `event-${state.events.length + index + 1}`,
        taskId,
        agentRunId,
        ...event,
      }));
      state.events.push(...rows);
      return rows;
    },
    async stageApproval({ approval, taskId, agentRunId = null }) {
      state.approvals.push({ ...approval, taskId, agentRunId });
      return approval;
    },
  };
}

// The mission as the domain sees it after a write: persisted events are read
// back, so dedupe runs against real stored keys rather than in-memory guesses.
function missionWithStoredEvents(mission, store) {
  return {
    ...mission,
    events: store._state.events
      .filter((event) => event.taskId === mission.id)
      .map((event) => ({ id: event.id, type: event.type, at: event.at, metadata: event.metadata })),
  };
}

// 1 — dispatch ---------------------------------------------------------------
test("one persisted warroom mission starts exactly one runtime run", async () => {
  const store = memoryStore();
  const runtime = createFakeRuntimeAdapter({
    createRun: { id: "hermes-run-1", status: "running" },
  });

  const result = await startSingleAgentMission({
    runtime,
    store,
    mission: warroomMission(),
    agent: WARROOM_AGENT,
    workspace: { id: "ws-a", name: "Korben HQ", slug: "korben-hq", kind: "business" },
    actorUserId: "user-a",
    at: "2026-09-21T20:00:00.000Z",
  });

  assert.equal(result.ok, true);
  assert.equal(store._state.runs.length, 1, "exactly one run row");
  assert.equal(store._state.runs[0].hermesRunId, "hermes-run-1", "the runtime id is persisted");
  assert.equal(store._state.tasks.get("mission-1").status, "running");
  assert.equal(store._state.tasks.get("mission-1").started_at, "2026-09-21T20:00:00.000Z");
  assert.equal(store._state.tasks.get("mission-1").current_stage, "connect");
  assert.deepEqual(
    store._state.events.map((event) => event.type),
    [MISSION_EVENT.missionStarted, MISSION_EVENT.agentStarted]
  );
  assert.equal(runtime.calls.filter((call) => call === "createRun").length, 1);

  // The request Forge sent is the authorized one: read level, no connections, no
  // fleet, and a deterministic correlation key.
  const request = runtime.createRequests[0];
  assert.equal(request.missionId, "mission-1");
  assert.equal(request.workspaceId, "ws-a");
  assert.equal(request.agentSlug, "warroom");
  assert.equal(request.fleetId, null);
  assert.equal(request.policy.allowedActionLevel, "read");
  assert.deepEqual(request.context.connections, []);
  assert.equal(request.correlation.idempotencyKey, "forge.mission.mission-1.single-agent.v1");
});

test("the idempotency key is deterministic and follows the mission, not the clock", () => {
  assert.equal(idempotencyKeyFor("mission-1"), idempotencyKeyFor("mission-1"));
  assert.notEqual(idempotencyKeyFor("mission-1"), idempotencyKeyFor("mission-2"));
  assert.equal(idempotencyKeyFor("mission-1"), "forge.mission.mission-1.single-agent.v1");
});

test("dispatching the same mission twice does not create a second runtime run", async () => {
  const store = memoryStore();
  const runtime = createFakeRuntimeAdapter({
    createRun: { id: "hermes-run-1", status: "running" },
  });
  const mission = warroomMission();
  const args = { runtime, store, mission, agent: WARROOM_AGENT, actorUserId: "user-a" };

  const first = await startSingleAgentMission(args);
  const second = await startSingleAgentMission({
    ...args,
    // Even if the caller's view of the mission is stale, the stored run decides.
    mission: { ...mission },
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.alreadyStarted, true);
  assert.equal(runtime.calls.filter((call) => call === "createRun").length, 1);
  assert.equal(store._state.runs.length, 1);
  assert.equal(store._state.events.length, 2, "no duplicate start events");
});

// 2–5 — refusals -------------------------------------------------------------
test("a mission the caller cannot see is never dispatched", async () => {
  const store = memoryStore();
  const runtime = createFakeRuntimeAdapter({ createRun: { id: "hermes-run-1" } });

  const missing = await startSingleAgentMission({
    runtime,
    store,
    mission: null,
    agent: WARROOM_AGENT,
  });

  assert.equal(missing.ok, false);
  assert.equal(missing.code, "mission_not_found");
  assert.equal(runtime.calls.length, 0, "nothing reached the runtime");
});

test("the dispatch path authorizes before it builds or sends anything", () => {
  const actions = read("app/(protected)/missions/actions.js");

  assert.match(actions, /requireUser\(\)/);
  assert.match(actions, /membershipForUser\(user\.id\)/);
  assert.match(actions, /mission\.workspaceId !== membership\.workspace\.id/);
  assert.match(actions, /getForgeRuntime\(\)/);
  assert.equal(/from "@\/lib\/hermes/.test(actions), false, "no direct Hermes import");
  assert.equal(/HERMES_API/.test(actions), false, "no runtime configuration in the action");

  // The authorization check runs before the runtime call in every action body.
  const dispatch = actions.slice(actions.indexOf("export async function dispatchMissionAction"));
  assert.ok(
    dispatch.indexOf("authorizeMission") < dispatch.indexOf("startSingleAgentMission"),
    "authorization must come first"
  );
});

test("a runtime that is not configured, unauthorized, or broken leaves the mission queued", async () => {
  for (const [failure, expected] of [
    [RUNTIME_ERROR_CODES.notConfigured, "runtime_not_configured"],
    [RUNTIME_ERROR_CODES.unauthorized, "runtime_unauthorized"],
    [RUNTIME_ERROR_CODES.badResponse, "runtime_bad_response"],
    [RUNTIME_ERROR_CODES.unreachable, "runtime_unreachable"],
  ]) {
    const store = memoryStore();
    const runtime = createFakeRuntimeAdapter({ createRun: { failure } });

    const result = await startSingleAgentMission({
      runtime,
      store,
      mission: warroomMission(),
      agent: WARROOM_AGENT,
    });

    assert.equal(result.ok, false, `${failure} must not report success`);
    assert.equal(result.code, expected);
    assert.equal(store._state.runs.length, 0, "no run row for a failed dispatch");
    assert.equal(store._state.events.length, 0, "no events invented for a failed dispatch");
    assert.equal(store._state.tasks.size, 0, "the mission is left exactly as it was");
    assert.match(result.message, /queued|refused/);
  }
});

test("missions that need Fleet or real tools are refused with a plain reason", async () => {
  const store = memoryStore();
  const runtime = createFakeRuntimeAdapter({ createRun: { id: "hermes-run-1" } });

  for (const kind of ["fleet", "announce", "buildapp", "haters"]) {
    const result = await startSingleAgentMission({
      runtime,
      store,
      mission: warroomMission({ id: `mission-${kind}`, kind }),
      agent: WARROOM_AGENT,
    });
    assert.equal(result.ok, false, `${kind} must not run in this phase`);
    assert.equal(result.code, "mission_kind_not_executable");
  }

  assert.deepEqual(RUNTIME_ELIGIBLE_KINDS, ["warroom"]);
  assert.equal(isRuntimeEligible(warroomMission()), true);
  assert.equal(isRuntimeEligible(warroomMission({ kind: "fleet" })), false);
  assert.equal(runtime.calls.length, 0);
});

test("a mission that is already running is not restarted", async () => {
  const store = memoryStore();
  const runtime = createFakeRuntimeAdapter({ createRun: { id: "hermes-run-1" } });

  const result = await startSingleAgentMission({
    runtime,
    store,
    mission: warroomMission({ status: "running" }),
    agent: WARROOM_AGENT,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "mission_not_queued");
  assert.equal(runtime.calls.length, 0);
});

test("without the trusted path nothing is dispatched, and the reason is explicit", async () => {
  const store = memoryStore({ hasTrustedWrites: false });
  const runtime = createFakeRuntimeAdapter({ createRun: { id: "hermes-run-1" } });

  const result = await startSingleAgentMission({
    runtime,
    store,
    mission: warroomMission(),
    agent: WARROOM_AGENT,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "trusted_writes_not_configured");
  assert.equal(runtime.calls.length, 0);
});

// 6–9 — runtime state and events --------------------------------------------
test("runtime status maps onto the existing Forge lifecycle, with no second model", () => {
  assert.equal(missionStatusForRuntime("queued"), "planning");
  assert.equal(missionStatusForRuntime("planning"), "planning");
  assert.equal(missionStatusForRuntime("running"), "running");
  assert.equal(missionStatusForRuntime("waiting_approval"), "waiting_approval");
  assert.equal(missionStatusForRuntime("completed"), "completed");
  assert.equal(missionStatusForRuntime("failed"), "failed");
  assert.equal(missionStatusForRuntime("cancelled"), "cancelled");
  assert.equal(missionStatusForRuntime("something-else"), null);

  // The statuses are the Phase 4 vocabulary itself, not a parallel set.
  assert.deepEqual([...MISSION_STATUSES], [
    "queued",
    "planning",
    "running",
    "waiting_approval",
    "completed",
    "failed",
    "cancelled",
  ]);
});

test("runtime events map onto the Forge event vocabulary, and unknown ones are dropped", () => {
  const cases = [
    ["run.accepted", MISSION_EVENT.missionStarted],
    ["run.started", MISSION_EVENT.missionStarted],
    ["agent.started", MISSION_EVENT.agentStarted],
    ["agent.spawned", MISSION_EVENT.agentStarted],
    ["stage.changed", MISSION_EVENT.missionStageChanged],
    ["tool.requested", MISSION_EVENT.toolRequested],
    ["tool.completed", MISSION_EVENT.toolCompleted],
    ["approval.requested", MISSION_EVENT.approvalRequested],
    ["approval.required", MISSION_EVENT.approvalRequested],
    ["agent.completed", MISSION_EVENT.agentCompleted],
    ["run.completed", MISSION_EVENT.missionCompleted],
    ["run.failed", MISSION_EVENT.missionFailed],
    ["run.stopped", MISSION_EVENT.missionCancelled],
  ];

  for (const [runtimeType, forgeType] of cases) {
    assert.equal(missionEventTypeForRuntime(runtimeType), forgeType, runtimeType);
  }

  // Nothing Forge has no vocabulary for is invented into an event.
  assert.equal(missionEventTypeForRuntime("model.thinking"), null);
  assert.equal(mapRuntimeEvent({ type: "model.thinking", at: "now" }), null);

  const mapped = mapRuntimeEvent({
    id: 4211,
    type: "tool.requested",
    at: "2026-09-21T20:01:00.000Z",
    actorLabel: "warroom",
    summary: "pulling numbers",
    metadata: { tool: "analytics.read", nested: { token: "sk-live-x" } },
  });
  assert.equal(mapped.type, MISSION_EVENT.toolRequested);
  assert.deepEqual(mapped.actor, { agent: "warroom" });
  assert.equal(mapped.metadata.tool, "analytics.read");
  assert.equal(mapped.metadata.runtimeKey, "hermes:4211");
  assert.equal(JSON.stringify(mapped).includes("sk-live"), false, "nested metadata never crosses");
});

test("runtime event keys are stable, so the same event can never be stored twice", () => {
  const byId = { id: "evt-9", type: "run.started" };
  assert.equal(runtimeEventKey(byId), "hermes:evt-9");
  assert.equal(runtimeEventKey(byId), runtimeEventKey({ ...byId }));

  const withoutId = { type: "tool.completed", at: "2026-09-21T20:02:00.000Z", metadata: { tool: "x" } };
  assert.equal(runtimeEventKey(withoutId), runtimeEventKey({ ...withoutId }));
  assert.notEqual(runtimeEventKey(withoutId), runtimeEventKey({ ...withoutId, at: "2026-09-21T20:03:00.000Z" }));
});

test("the live runtime stream is ingested, and token-level noise is not", async () => {
  const store = memoryStore();
  // The shapes the live runtime actually emits, captured from the real gateway.
  const liveStream = [
    { event: "message.delta", run_id: "hermes-run-1", timestamp: 1790019589.043, delta: "WAR" },
    { event: "message.delta", run_id: "hermes-run-1", timestamp: 1790019589.085, delta: "ROOM" },
    { event: "reasoning.available", run_id: "hermes-run-1", timestamp: 1790019589.1, text: "thinking" },
    { event: "tool.requested", run_id: "hermes-run-1", timestamp: 1790019589.2, tool: "analytics.read" },
    { event: "run.completed", run_id: "hermes-run-1", timestamp: 1790019589.5, output: "{}" },
  ];
  let liveReads = 0;

  // The real adapter over a stubbed runtime client, so normalization, mapping,
  // and persistence are all exercised the way they run in production.
  let streamed = true;
  const runtime = createHermesRuntimeAdapter({
    client: {
      hermesConfigState: () => ({ configured: true, baseUrl: "https://runtime.test", hasKey: true }),
      createHermesRun: async () => ({ run_id: "hermes-run-1", status: "running" }),
      getHermesRun: async () => ({ run_id: "hermes-run-1", status: "running" }),
      getHermesRunEvents: async () => ({ error: "only served while a run is live" }),
      streamHermesRunEvents: async () => {
        liveReads += 1;
        if (!streamed) return [];
        streamed = false;
        return liveStream;
      },
    },
  });

  const dispatched = await startSingleAgentMission({
    runtime,
    store,
    mission: warroomMission(),
    agent: WARROOM_AGENT,
  });

  assert.equal(dispatched.ok, true);
  assert.equal(liveReads, 1, "the live stream was opened exactly once");
  assert.equal(dispatched.runtimeEventsReceived, 5, "the live stream was read");
  assert.deepEqual(
    store._state.events.map((event) => event.type),
    [MISSION_EVENT.missionStarted, MISSION_EVENT.agentStarted, MISSION_EVENT.toolRequested],
    "the tool event is stored; token deltas, reasoning text, and the closing event are not"
  );

  const toolEvent = store._state.events.at(-1);
  assert.equal(toolEvent.at, new Date(1790019589.2 * 1000).toISOString());
  assert.equal(toolEvent.metadata.tool, "analytics.read", "top-level detail is carried through");
  assert.equal(toolEvent.metadata.runtimeEvent, "tool.requested");

  // Reading the same live stream again stores nothing new.
  const runRow = store._state.runs[0];
  const again = await reconcileMissionRun({
    runtime: {
      ...runtime,
      async getRun() {
        return { id: "hermes-run-1", status: "running" };
      },
      async getRunEvents() {
        return liveStream;
      },
    },
    store,
    mission: missionWithStoredEvents({ ...warroomMission({ status: "running" }), events: store._state.events }, store),
    run: runRow,
  });
  assert.equal(again.appendedEvents, 0, "the same runtime events are never stored twice");
  assert.equal(store._state.events.length, 3);
});

test("an approval request from the runtime becomes a staged approval the operator owns", () => {
  const approval = extractApprovalRequest({
    id: 77,
    type: "approval.requested",
    at: "2026-09-21T20:04:00.000Z",
    metadata: {
      tool: "social.publish",
      capability: "social.publish",
      args: { channel: "x", text: "hello", nested: { key: "sk-live" } },
      expires_at: "2026-09-21T21:00:00.000Z",
    },
  });

  assert.equal(approval.tool, "social.publish");
  assert.equal(approval.capability, "social.publish");
  assert.deepEqual(approval.args, { channel: "x", text: "hello" });
  assert.equal(approval.expiresAt, "2026-09-21T21:00:00.000Z");

  assert.equal(extractApprovalRequest({ type: "tool.requested", metadata: { tool: "x" } }), null);
});

// 10 — reconciliation --------------------------------------------------------
test("a completed run becomes a validated mission result, once", async () => {
  const store = memoryStore();
  const runtime = createFakeRuntimeAdapter({
    runs: [
      {
        id: "hermes-run-1",
        status: "completed",
        completed_at: "2026-09-21T20:05:00.000Z",
        output_text: JSON.stringify(WARROOM_RESULT),
      },
    ],
    events: [
      { id: 1, run_id: "hermes-run-1", type: "run.started", created_at: "2026-09-21T20:00:05.000Z" },
      { id: 2, run_id: "hermes-run-1", type: "agent.completed", created_at: "2026-09-21T20:05:00.000Z" },
    ],
  });

  const run = { id: "run-row-1", hermesRunId: "hermes-run-1", status: "running" };
  store._state.runs.push({ ...run, taskId: "mission-1" });
  const mission = warroomMission({ status: "running", currentStage: "connect", reached: ["queued", "connect"] });

  const first = await reconcileMissionRun({ runtime, store, mission, run, at: "2026-09-21T20:06:00.000Z" });

  assert.equal(first.ok, true);
  assert.equal(first.status, "completed");
  assert.equal(first.resultApplied, true);
  assert.equal(store._state.tasks.get("mission-1").status, "completed");
  assert.equal(store._state.tasks.get("mission-1").completed_at, "2026-09-21T20:06:00.000Z");
  assert.equal(store._state.tasks.get("mission-1").result.kind, "warroom");
  assert.equal(store._state.tasks.get("mission-1").result.headline, WARROOM_RESULT.headline);
  assert.equal(store._state.runs[0].status, "completed");
  assert.deepEqual(store._state.runs[0].output.kind, "warroom");

  const types = store._state.events.map((event) => event.type);
  assert.deepEqual(types, [
    MISSION_EVENT.missionStarted,
    MISSION_EVENT.agentCompleted,
    MISSION_EVENT.resultUpdated,
    MISSION_EVENT.missionCompleted,
  ]);

  // The same runtime report reconciled a second time changes nothing.
  const second = await reconcileMissionRun({
    runtime,
    store,
    mission: missionWithStoredEvents(
      { ...mission, status: "completed", currentStage: "done" },
      store
    ),
    run,
  });
  assert.equal(second.appendedEvents, 0, "no duplicate events on a second sync");
  assert.equal(store._state.events.length, 4);
  assert.equal(store._state.tasks.get("mission-1").status, "completed");
});

test("a result Forge cannot read is never reported as success", async () => {
  const store = memoryStore();
  const runtime = createFakeRuntimeAdapter({
    runs: [{ id: "hermes-run-1", status: "completed", output_text: "not json at all" }],
  });

  const result = await reconcileMissionRun({
    runtime,
    store,
    mission: warroomMission({ status: "running" }),
    run: { id: "run-row-1", hermesRunId: "hermes-run-1" },
  });

  assert.equal(result.resultUnreadable, true);
  assert.equal(result.status, "failed", "a malformed result fails the mission rather than completing it");
  assert.equal(store._state.tasks.get("mission-1").status, "failed");
  assert.deepEqual(
    store._state.tasks.get("mission-1").result,
    MALFORMED_RESULT,
    "the safe fallback is recorded instead of a fabricated result"
  );
  assert.match(store._state.tasks.get("mission-1").error.message, /could not be read safely/);
  assert.deepEqual(
    store._state.events.map((event) => event.type),
    [MISSION_EVENT.missionFailed]
  );
  assert.deepEqual(parseRuntimeResult("```json\n{\"headline\":\"ok\"}\n```", "warroom").result.kind, "warroom");
  assert.deepEqual(parseRuntimeResult("{ not json", "warroom").result, MALFORMED_RESULT);
});

test("a failed run fails the mission with a bounded error", async () => {
  const store = memoryStore();
  const runtime = createFakeRuntimeAdapter({
    runs: [
      {
        id: "hermes-run-1",
        status: "failed",
        error: { message: "provider exploded", secret: "sk-live-do-not-share" },
      },
    ],
  });

  const result = await reconcileMissionRun({
    runtime,
    store,
    mission: warroomMission({ status: "running" }),
    run: { id: "run-row-1", hermesRunId: "hermes-run-1" },
  });

  assert.equal(result.status, "failed");
  assert.equal(store._state.tasks.get("mission-1").error.message, "provider exploded");
  assert.equal(JSON.stringify(store._state.tasks.get("mission-1")).includes("sk-live"), false);
  assert.deepEqual(store._state.events.map((event) => event.type), [MISSION_EVENT.missionFailed]);
});

test("a reconciliation that cannot reach the runtime leaves the mission alone", async () => {
  const store = memoryStore();
  const runtime = {
    async getRun() {
      throw runtimeError(RUNTIME_ERROR_CODES.unreachable);
    },
    async getRunEvents() {
      return [];
    },
  };

  const result = await reconcileMissionRun({
    runtime,
    store,
    mission: warroomMission({ status: "running" }),
    run: { id: "run-row-1", hermesRunId: "hermes-run-1" },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, RUNTIME_ERROR_CODES.unreachable);
  assert.equal(store._state.events.length, 0);
  assert.equal(store._state.tasks.size, 0);
});

test("a runtime approval request parks the mission and stages the approval, without approving it", async () => {
  const store = memoryStore();
  const runtime = createFakeRuntimeAdapter({
    runs: [{ id: "hermes-run-1", status: "waiting_approval" }],
    events: [
      {
        id: 31,
        run_id: "hermes-run-1",
        type: "approval.requested",
        created_at: "2026-09-21T20:07:00.000Z",
        metadata: { tool: "social.publish", capability: "social.publish", args: { channel: "x" } },
      },
    ],
  });

  const run = { id: "run-row-1", hermesRunId: "hermes-run-1" };
  const mission = warroomMission({ status: "running" });

  const first = await reconcileMissionRun({ runtime, store, mission, run });

  assert.equal(first.status, "waiting_approval");
  assert.equal(first.approvalsStaged, 1);
  assert.equal(store._state.tasks.get("mission-1").status, "waiting_approval");
  assert.equal(store._state.approvals.length, 1);
  assert.equal(store._state.approvals[0].state, "pending", "nothing is auto-approved");
  assert.equal(store._state.approvals[0].tool, "social.publish");
  assert.equal(store._state.approvals[0].taskId, "mission-1");
  assert.deepEqual(
    store._state.events.map((event) => event.type),
    [MISSION_EVENT.approvalRequested]
  );

  // Reconciling again stages nothing new and never flips the approval.
  const second = await reconcileMissionRun({
    runtime,
    store,
    mission: missionWithStoredEvents({ ...mission, status: "waiting_approval" }, store),
    run,
  });
  assert.equal(second.approvalsStaged, 0);
  assert.equal(store._state.approvals.length, 1);
  assert.equal(store._state.approvals[0].state, "pending");
});

// 11–13 — cancellation -------------------------------------------------------
test("cancelling a running mission stops the runtime run and keeps the record", async () => {
  const store = memoryStore();
  const runtime = createFakeRuntimeAdapter({ runs: [{ id: "hermes-run-1", status: "running" }] });
  const mission = warroomMission({ status: "running", currentStage: "connect" });
  const run = { id: "run-row-1", hermesRunId: "hermes-run-1" };
  store._state.runs.push({ ...run, taskId: "mission-1" });

  const result = await stopMissionRun({
    runtime,
    store,
    mission,
    run,
    actorUserId: "user-a",
    reason: "operator stopped it",
    at: "2026-09-21T20:08:00.000Z",
  });

  assert.equal(result.ok, true);
  assert.equal(result.runtimeStopped, true);
  assert.equal(runtime.calls.includes("stopRun:hermes-run-1"), true);
  assert.equal(store._state.tasks.get("mission-1").status, "cancelled");
  assert.equal(store._state.tasks.get("mission-1").cancel_requested_by, "user-a");
  assert.equal(store._state.runs[0].status, "cancelled");
  assert.deepEqual(store._state.events.map((event) => event.type), [MISSION_EVENT.missionCancelled]);
  assert.equal(store._state.events[0].metadata.runtimeStop, undefined);

  // Stopping again is a no-op: no second runtime call, no second event.
  const again = await stopMissionRun({
    runtime,
    store,
    mission: { ...mission, status: "cancelled" },
    run,
    actorUserId: "user-a",
  });
  assert.equal(again.alreadyStopped, true);
  assert.equal(runtime.calls.filter((call) => String(call).startsWith("stopRun")).length, 1);
  assert.equal(store._state.events.length, 1);
});

test("a stop Forge cannot confirm still cancels, and says so honestly", async () => {
  const store = memoryStore();
  const runtime = {
    async stopRun() {
      throw runtimeError(RUNTIME_ERROR_CODES.unreachable);
    },
  };

  const result = await stopMissionRun({
    runtime,
    store,
    mission: warroomMission({ status: "running" }),
    run: { id: "run-row-1", hermesRunId: "hermes-run-1" },
    actorUserId: "user-a",
  });

  assert.equal(result.ok, true);
  assert.equal(result.runtimeStopped, false);
  assert.equal(result.runtimeProblem, RUNTIME_ERROR_CODES.unreachable);
  assert.match(result.message, /may not have stopped/);
  assert.equal(store._state.tasks.get("mission-1").status, "cancelled");
  assert.equal(store._state.events[0].metadata.runtimeStop, RUNTIME_ERROR_CODES.unreachable);
});

test("a run the runtime no longer knows about counts as stopped", async () => {
  const store = memoryStore();
  const runtime = {
    async stopRun() {
      throw runtimeError(RUNTIME_ERROR_CODES.runNotFound);
    },
  };

  const result = await stopMissionRun({
    runtime,
    store,
    mission: warroomMission({ status: "running" }),
    run: { id: "run-row-1", hermesRunId: "hermes-run-1" },
  });

  assert.equal(result.runtimeStopped, true);
  assert.equal(result.runtimeProblem, null);
  assert.doesNotMatch(result.message, /may not have stopped/);
});

// 14–15 — the boundary itself ------------------------------------------------
test("the execution layer never reaches for Hermes or for configuration", () => {
  const execution = read("lib/forge/runtime/execution.js");
  assert.equal(/lib\/hermes/.test(execution), false, "no Hermes client import");
  assert.equal(/process\.env/.test(execution), false, "no configuration access");
  assert.equal(/fetch\(/.test(execution), false, "no HTTP of its own");
  assert.equal(/hermes\.forge/.test(execution), false, "no runtime host");
  assert.match(execution, /RUNTIME_ELIGIBLE_KINDS/);

  // The mission domain still knows nothing about the runtime either.
  const domain = readdirSync(new URL("../lib/forge/missions/", import.meta.url))
    .filter((name) => name.endsWith(".js"))
    .map((name) => readFileSync(new URL(`../lib/forge/missions/${name}`, import.meta.url), "utf8"))
    .join("\n")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  assert.equal(/runtime|hermes/i.test(domain), false, "the domain stays runtime-neutral");
});

test("the runtime context for a mission carries authorization, not credentials", () => {
  const request = buildMissionRuntimeRequest({
    mission: warroomMission({ requestedBy: "user-a" }),
    agent: WARROOM_AGENT,
    workspace: { id: "ws-a", name: "Korben HQ", slug: "korben-hq", kind: "business" },
  });

  assert.equal(assertSafeRuntimeContext(request.context), request.context);
  assert.deepEqual(request.context.connections, []);
  assert.equal(request.context.policy.allowedActionLevel, "read");
  assert.equal(request.context.policy.workspaceScoped, true);
  assert.equal(request.context.delegation.enabled, false);
  assert.equal(request.context.agentInstructions, WARROOM_AGENT.instructions);

  const serialized = JSON.stringify(request).toLowerCase();
  for (const forbidden of ["api_key", "apikey", "secret", "token", "authorization", "service_role", "password", "credential"]) {
    assert.equal(serialized.includes(forbidden), false, `the request must not carry ${forbidden}`);
  }

  // Another workspace's mission cannot be smuggled in: the request only ever
  // names the mission's own workspace.
  assert.equal(request.workspaceId, "ws-a");
});

// 16–18 — persistence and isolation -----------------------------------------
function runTables() {
  return {
    workspaces: [
      { id: "ws-a", name: "Korben HQ", slug: "korben-hq", kind: "business", organization_id: null },
      { id: "ws-b", name: "Other Co", slug: "other-co", kind: "business", organization_id: null },
    ],
    agents: [{ id: "agent-warroom", slug: "warroom", name: "WARROOM", is_active: true }],
    tasks: [
      {
        id: "mission-1",
        workspace_id: "ws-a",
        agent_id: "agent-warroom",
        requested_by: "user-a",
        status: "queued",
        kind: "warroom",
        current_stage: "queued",
        reached_stages: ["queued"],
        policy: { lead_agent: "warroom", capability: "analytics.read" },
        result: {},
      },
    ],
  };
}

test("the Supabase-backed store links the mission to its runtime run, once", async () => {
  const tables = runTables();
  const userA = createFakeSupabase({
    userId: "user-a",
    memberships: [{ workspace_id: "ws-a", user_id: "user-a" }],
    tables,
  });
  const userB = createFakeSupabase({
    userId: "user-b",
    memberships: [{ workspace_id: "ws-b", user_id: "user-b" }],
    tables,
  });
  const trusted = createFakeSupabase({ userId: "service", tables, trusted: true });

  const store = createAgentRunStore({ userClient: userA, trustedClient: trusted });
  const runtime = createFakeRuntimeAdapter({ createRun: { id: "hermes-run-1", status: "running" } });

  const result = await startSingleAgentMission({
    runtime,
    store,
    mission: warroomMission(),
    agent: WARROOM_AGENT,
    workspace: { id: "ws-a", name: "Korben HQ" },
    actorUserId: "user-a",
    at: "2026-09-21T20:00:00.000Z",
  });

  assert.equal(result.ok, true);
  assert.equal(trusted._db.agent_runs.length, 1);
  assert.equal(trusted._db.agent_runs[0].hermes_run_id, "hermes-run-1");
  assert.equal(trusted._db.tasks[0].status, "running");
  assert.equal(trusted._db.tasks[0].started_at, "2026-09-21T20:00:00.000Z");
  assert.equal(trusted._db.run_events.length, 2, "the start events are durable");

  const runRowId = trusted._db.agent_runs[0].id;
  for (const event of trusted._db.run_events) {
    assert.equal(event.agent_run_id, runRowId, "events point at the run they belong to");
  }

  // The member reads it back; the other workspace cannot even see that it exists.
  const seen = await findRunForTask({ userClient: userA }, "mission-1");
  assert.equal(seen.hermesRunId, "hermes-run-1");
  assert.equal(await findRunForTask({ userClient: userB }, "mission-1"), null);

  // The runtime id is unique, so the same run cannot be linked twice.
  const duplicate = await store.createRun({ taskId: "mission-1", hermesRunId: "hermes-run-1" });
  assert.equal(duplicate.hermesRunId, "hermes-run-1");
  assert.equal(trusted._db.agent_runs.length, 1, "no second run row for the same runtime run");
});

test("a browser session cannot create a run row or write the event stream", async () => {
  const tables = runTables();
  const userA = createFakeSupabase({
    userId: "user-a",
    memberships: [{ workspace_id: "ws-a", user_id: "user-a" }],
    tables,
  });

  const browserStore = createAgentRunStore({ userClient: userA, trustedClient: null });
  assert.equal(browserStore.hasTrustedWrites, false);
  await assert.rejects(
    () => browserStore.createRun({ taskId: "mission-1", hermesRunId: "hermes-run-1" }),
    /SUPABASE_SERVICE_ROLE_KEY/
  );

  const direct = await userA
    .from("agent_runs")
    .insert({ task_id: "mission-1", hermes_run_id: "hermes-run-1", status: "running" })
    .select("id")
    .single();
  assert.equal(Boolean(direct.error), true, "the browser client cannot insert a run");
  assert.equal(userA._db.agent_runs.length, 0);

  const event = await userA
    .from("run_events")
    .insert({ workspace_id: "ws-a", task_id: "mission-1", event_type: "mission.completed" });
  assert.equal(Boolean(event.error), true, "the browser client cannot forge events");
});

test("a run row belonging to another workspace is invisible, not merely filtered", async () => {
  const tables = runTables();
  tables.agent_runs = [
    { id: "run-row-1", task_id: "mission-1", hermes_run_id: "hermes-run-1", status: "running" },
  ];

  const userA = createFakeSupabase({
    userId: "user-a",
    memberships: [{ workspace_id: "ws-a", user_id: "user-a" }],
    tables,
  });
  const userB = createFakeSupabase({
    userId: "user-b",
    memberships: [{ workspace_id: "ws-b", user_id: "user-b" }],
    tables,
  });

  assert.equal((await findRunForTask({ userClient: userA }, "mission-1")).hermesRunId, "hermes-run-1");
  assert.equal(await findRunForTask({ userClient: userB }, "mission-1"), null);
});
