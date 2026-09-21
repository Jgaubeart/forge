import assert from "node:assert/strict";
import { test } from "node:test";

import { createContextBuilder } from "../lib/forge/runtime/context-builder.js";
import { createEventRecorder } from "../lib/forge/runtime/events.js";
import { createRunController } from "../lib/forge/runtime/run-controller.js";
import { createToolRegistry } from "../lib/forge/runtime/tools/registry.js";
import { createFakeRepository, createFixture } from "./helpers/fake-repository.js";

function build({ seed = createFixture(), hermes } = {}) {
  const repository = createFakeRepository(seed);
  const events = createEventRecorder({ repository });
  const registry = createToolRegistry();
  const contextBuilder = createContextBuilder({ repository, registry });
  const calls = { create: [], stop: [] };

  const adapter = hermes ?? {
    async createRun(args) {
      calls.create.push(args);
      return { id: "hermes-fleet-1" };
    },
    async stopRun(runId) {
      calls.stop.push(runId);
    },
    async getRun() {
      return { status: "succeeded" };
    },
  };

  const runController = createRunController({
    repository,
    hermes: adapter,
    contextBuilder,
    events,
  });

  return { runController, repository, calls };
}

const startFleet = (runController, brief = "Launch the workshop") =>
  runController.startCatalogMission({
    actorUserId: "user-1",
    workspaceId: "ws-1",
    kind: "fleet",
    brief,
  });

test("a fleet mission is durable and records its team without faking child work", async () => {
  const { runController, repository, calls } = build();

  const result = await startFleet(runController);

  assert.equal(result.status, "running");
  assert.equal(result.kind, "fleet");
  assert.equal(result.icon, "⚔️");
  assert.deepEqual(
    result.team.map((member) => member.slug),
    ["scout", "forge", "sage"]
  );

  const mission = repository.state.tasks.at(-1);
  assert.equal(mission.kind, "fleet");
  assert.equal(mission.fleetId, "fleet-1");
  assert.equal(mission.status, "running");
  assert.equal(mission.policy.mission_kind, "fleet");
  assert.deepEqual(mission.policy.team, ["scout", "forge", "sage"]);

  // The mission exists in durable storage independently of any request.
  assert.equal(
    repository.state.tasks.filter((task) => task.id === mission.id).length,
    1
  );

  // The team is assigned, but no subagent run is invented before Hermes reports.
  const types = repository.state.events.map((event) => event.eventType);
  assert.equal(types.filter((type) => type === "agent.assigned").length, 3);
  assert.equal(repository.state.runs.filter((run) => run.kind === "subagent").length, 0);

  // Hermes receives the brief plus the ported crew instructions.
  assert.equal(calls.create.length, 1);
  assert.equal(calls.create[0].input, "Launch the workshop");
  const instruction = calls.create[0].instructions;
  assert.match(instruction, /SCOUT/);
  assert.match(instruction, /FORGE/);
  assert.match(instruction, /SAGE/);
  assert.match(instruction, /Launch the workshop/);
  assert.match(instruction, /Delegat/i);
});

test("child worker runs are recorded only when Hermes reports them", async () => {
  const { runController, repository } = build();
  await startFleet(runController);

  const parent = repository.state.runs.at(-1);
  const { run, agent } = await runController.registerFleetWork({
    actorUserId: "user-1",
    parentRunId: parent.id,
    agentSlug: "scout",
    role: "recon",
    hermesRunId: "hermes-child-1",
  });

  assert.equal(run.parentRunId, parent.id);
  assert.equal(run.kind, "subagent");
  assert.equal(run.actorLabel, "SCOUT");
  assert.equal(agent.slug, "scout");

  const types = repository.state.events.map((event) => event.eventType);
  assert.ok(types.includes("agent.delegated"));
  assert.ok(types.includes("worker.spawned"));
});

test("worker stages, results, and failures are durable events", async () => {
  const { runController, repository } = build();
  await startFleet(runController);

  const parent = repository.state.runs.at(-1);
  await runController.recordWorkerStage({
    actorUserId: "user-1",
    runId: parent.id,
    stage: "CODE",
  });

  const mission = repository.state.tasks.at(-1);
  await runController.completeMission({
    actorUserId: "user-1",
    taskId: mission.id,
    result: { sections: { scout: "recon", forge: "draft", sage: "critique" } },
    summary: "The fleet has landed.",
  });

  const updated = repository.state.tasks.find((task) => task.id === mission.id);
  assert.equal(updated.status, "completed");
  assert.equal(updated.result.sections.sage, "critique");

  const types = repository.state.events.map((event) => event.eventType);
  assert.ok(types.includes("worker.stage"));
  assert.ok(types.includes("mission.completed"));
});

test("mission start refuses incomplete or unknown input honestly", async () => {
  const { runController, calls } = build();

  await assert.rejects(
    () =>
      runController.startCatalogMission({
        actorUserId: "user-1",
        workspaceId: "ws-1",
        kind: "announce",
        brief: "   ",
      }),
    (error) => error.code === "invalid_request"
  );

  await assert.rejects(
    () =>
      runController.startCatalogMission({
        actorUserId: "user-1",
        workspaceId: "ws-1",
        kind: "teleport",
        brief: "go",
      }),
    (error) => error.code === "invalid_request"
  );

  const fixture = createFixture();
  const withoutJarvis = {
    ...fixture,
    agents: fixture.agents.filter((agent) => agent.slug !== "jarvis"),
  };
  const built = build({ seed: withoutJarvis });

  await assert.rejects(
    () => startFleet(built.runController),
    (error) => error.code === "not_found"
  );

  assert.equal(calls.create.length, 0);
});

test("a capability the member lacks stops the mission before Hermes is called", async () => {
  const fixture = createFixture();
  const withoutCoordinator = {
    ...fixture,
    membershipCapabilities: {
      ...fixture.membershipCapabilities,
      "mem-1": fixture.membershipCapabilities["mem-1"].filter(
        (entry) => entry.capability !== "mission.coordinate"
      ),
    },
  };

  const { runController, repository, calls } = build({ seed: withoutCoordinator });

  await assert.rejects(
    () => startFleet(runController),
    (error) => error.code === "capability_denied"
  );

  assert.equal(calls.create.length, 0);
  assert.equal(
    repository.state.tasks.filter((task) => task.kind === "fleet").length,
    0
  );
});

test("a Hermes submission failure leaves a failed mission with its history intact", async () => {
  const { runController, repository } = build({
    hermes: {
      async createRun() {
        throw new Error("connect ECONNREFUSED 127.0.0.1:8080");
      },
      async stopRun() {},
      async getRun() {
        return { status: "failed" };
      },
    },
  });

  const result = await startFleet(runController, "Launch the workshop");

  assert.equal(result.status, "failed");

  const mission = repository.state.tasks.at(-1);
  assert.equal(mission.status, "failed");
  assert.ok(mission.currentStep.startsWith("Submission failed:"));

  const types = repository.state.events.map((event) => event.eventType);
  assert.ok(types.includes("run.failed"));
  assert.equal(repository.state.runs.at(-1).status, "failed");
});
