import assert from "node:assert/strict";
import { test } from "node:test";

import { createContextBuilder } from "../lib/forge/runtime/context-builder.js";
import { createEventRecorder } from "../lib/forge/runtime/events.js";
import { createRunController } from "../lib/forge/runtime/run-controller.js";
import { createToolRegistry } from "../lib/forge/runtime/tools/registry.js";
import { createFakeRepository, createFixture } from "./helpers/fake-repository.js";

function buildController({ hermes } = {}) {
  const repository = createFakeRepository(createFixture());
  const events = createEventRecorder({ repository });
  const registry = createToolRegistry();
  const contextBuilder = createContextBuilder({ repository, registry });

  const calls = { create: [], stop: [], get: [] };
  const hermesAdapter = hermes ?? {
    async createRun(args) {
      calls.create.push(args);
      return { id: "hermes-run-new" };
    },
    async stopRun(runId) {
      calls.stop.push(runId);
      return { stopped: true };
    },
    async getRun(runId) {
      calls.get.push(runId);
      return { status: "succeeded" };
    },
  };

  const runController = createRunController({
    repository,
    hermes: hermesAdapter,
    contextBuilder,
    events,
  });

  return { runController, repository, calls };
}

test("a mission is durable: task, run, policy snapshot, and events", async () => {
  const { runController, repository, calls } = buildController();

  const result = await runController.startMission({
    actorUserId: "user-1",
    workspaceId: "ws-1",
    agentId: "agent-1",
    capability: "email.read",
    requestedActionLevel: "read",
    goal: "Triage the shared inbox",
  });

  assert.equal(result.status, "running");
  assert.equal(calls.create.length, 1);

  const mission = repository.state.tasks.at(-1);
  assert.equal(mission.status, "running");
  assert.equal(mission.currentStep, "Running in Hermes");
  assert.equal(mission.policy.effective_action_level, "read");

  const run = repository.state.runs.at(-1);
  assert.equal(run.hermesRunId, "hermes-run-new");
  assert.equal(run.kind, "primary");

  const types = repository.state.events.map((event) => event.eventType);
  assert.deepEqual(types, ["task.queued", "run.started"]);
});

test("submission is refused before any Hermes call when the capability is denied", async () => {
  const { runController, repository, calls } = buildController();

  await assert.rejects(
    () =>
      runController.startMission({
        actorUserId: "user-1",
        workspaceId: "ws-1",
        agentId: "agent-1",
        capability: "email.send",
        requestedActionLevel: "execute",
        goal: "Send everything",
      }),
    (error) => error.code === "capability_denied"
  );

  assert.equal(calls.create.length, 0);
  assert.equal(repository.state.tasks.length, 1);
});

test("a Hermes submission failure is recorded, not hidden", async () => {
  const { runController, repository } = buildController({
    hermes: {
      async createRun() {
        throw new Error("connect ECONNREFUSED 127.0.0.1:8080");
      },
      async stopRun() {},
      async getRun() {},
    },
  });

  const result = await runController.startMission({
    actorUserId: "user-1",
    workspaceId: "ws-1",
    agentId: "agent-1",
    capability: "email.read",
    requestedActionLevel: "read",
    goal: "Triage the shared inbox",
  });

  assert.equal(result.status, "failed");

  const mission = repository.state.tasks.at(-1);
  assert.equal(mission.status, "failed");
  assert.ok(mission.currentStep.startsWith("Submission failed:"));

  const run = repository.state.runs.at(-1);
  assert.equal(run.status, "failed");
  assert.ok(run.error);

  const failed = repository.state.events.find(
    (event) => event.eventType === "run.failed"
  );
  assert.ok(failed);
});

test("F: cancelling a mission stops the Hermes run when one exists", async () => {
  const { runController, repository, calls } = buildController();

  const result = await runController.cancelMission({
    actorUserId: "user-1",
    taskId: "task-1",
    reason: "No longer needed",
  });

  assert.equal(result.cancelled, true);
  assert.equal(result.hermesStopped, true);
  assert.deepEqual(calls.stop, ["hermes-run-1"]);

  const mission = repository.state.tasks.find((task) => task.id === "task-1");
  assert.equal(mission.status, "cancelled");
  assert.ok(mission.cancelledAt);

  const run = repository.state.runs.find((entry) => entry.id === "run-1");
  assert.equal(run.status, "cancelled");

  // History is preserved: nothing is deleted.
  assert.equal(repository.state.tasks.length, 1);
  assert.equal(repository.state.runs.length, 1);

  const types = repository.state.events.map((event) => event.eventType);
  assert.deepEqual(types, ["task.cancel_requested", "run.cancelled"]);
});

test("cancellation reports a failed Hermes stop instead of lying about it", async () => {
  const { runController, repository } = buildController({
    hermes: {
      async createRun() {
        return { id: "hermes-run-new" };
      },
      async stopRun() {
        throw new Error("Hermes stop is unavailable");
      },
      async getRun() {
        return { status: "running" };
      },
    },
  });

  await assert.rejects(
    () =>
      runController.cancelMission({ actorUserId: "user-1", taskId: "task-1" }),
    (error) => error.code === "hermes_unavailable"
  );

  const mission = repository.state.tasks.find((task) => task.id === "task-1");
  assert.equal(mission.status, "running");
  assert.match(mission.currentStep, /stop call failed/);

  const failed = repository.state.events.find(
    (event) => event.eventType === "run.cancel_failed"
  );
  assert.ok(failed);
});

test("cancelling a mission with no Hermes run still finalizes cleanly", async () => {
  const fixture = createFixture({
    runs: [
      {
        id: "run-1",
        taskId: "task-1",
        parentRunId: null,
        kind: "primary",
        actorLabel: "Inbox Triage",
        hermesRunId: null,
        status: "queued",
      },
    ],
  });

  const repository = createFakeRepository(fixture);
  const events = createEventRecorder({ repository });
  const calls = [];
  const runController = createRunController({
    repository,
    hermes: {
      async createRun() {
        return { id: "unused" };
      },
      async stopRun(runId) {
        calls.push(runId);
      },
      async getRun() {
        return { status: "running" };
      },
    },
    contextBuilder: createContextBuilder({ repository, registry: createToolRegistry() }),
    events,
  });

  const result = await runController.cancelMission({
    actorUserId: "user-1",
    taskId: "task-1",
  });

  assert.equal(result.cancelled, true);
  assert.equal(result.hermesStopped, false);
  assert.equal(calls.length, 0);
});

test("terminal missions and other workspaces cannot be cancelled", async () => {
  const { runController } = buildController();

  await assert.rejects(
    () =>
      runController.cancelMission({
        actorUserId: "user-2",
        taskId: "task-1",
      }),
    (error) => error.code === "not_found"
  );

  await runController.cancelMission({ actorUserId: "user-1", taskId: "task-1" });

  await assert.rejects(
    () =>
      runController.cancelMission({ actorUserId: "user-1", taskId: "task-1" }),
    (error) => error.code === "conflict"
  );
});

test("H: parent/child runs are represented for delegated work", async () => {
  const { runController, repository } = buildController();

  const { run } = await runController.registerSubagentRun({
    actorUserId: "user-1",
    parentRunId: "run-1",
    agentLabel: "inbox-triage/subagent-research",
    hermesRunId: "hermes-run-child",
  });

  assert.equal(run.parentRunId, "run-1");
  assert.equal(run.kind, "subagent");
  assert.equal(run.status, "running");

  const children = repository.state.runs.filter(
    (entry) => entry.parentRunId === "run-1"
  );
  assert.equal(children.length, 1);

  const delegated = repository.state.events.find(
    (event) => event.eventType === "agent.delegated"
  );
  assert.equal(delegated.metadata.parent_run_id, "run-1");
});

test("run status is mirrored from Hermes onto mission and run", async () => {
  const { runController, repository, calls } = buildController();

  await runController.syncRun({ actorUserId: "user-1", runId: "run-1" });

  assert.deepEqual(calls.get, ["hermes-run-1"]);

  const run = repository.state.runs.find((entry) => entry.id === "run-1");
  assert.equal(run.status, "completed");

  const mission = repository.state.tasks.find((task) => task.id === "task-1");
  assert.equal(mission.status, "completed");
});
