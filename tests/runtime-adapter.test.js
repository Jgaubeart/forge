import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import {
  RUNTIME_ERROR_CODES,
  isRuntimeError,
  runtimeErrorFromException,
  runtimeErrorFromStatus,
} from "../lib/forge/runtime/errors.js";
import { RUNTIME_METHODS, assertRuntimeAdapter } from "../lib/forge/runtime/contract.js";
import {
  assertSafeRuntimeContext,
  buildRuntimeContext,
} from "../lib/forge/runtime/context.js";
import { createFakeRuntimeAdapter } from "../lib/forge/runtime/fake-runtime.js";
import { createHermesRuntimeAdapter } from "../lib/forge/runtime/hermes-adapter.js";
import {
  buildRuntimeCreateRequest,
  normalizeCapabilities,
  normalizeEvent,
  normalizeHealth,
  normalizeRun,
  normalizeRunStatus,
} from "../lib/forge/runtime/types.js";

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

// A stand-in for the Hermes client, so the adapter is exercised without network.
function fakeClient(overrides = {}) {
  return {
    hermesConfigState: () => ({ configured: true, baseUrl: "https://runtime.test", hasKey: true }),
    getHermesHealth: async () => ({ status: "ok", version: "8.1.0" }),
    getHermesCapabilities: async () => ({ features: ["runs", "steering"], agents: ["jarvis"] }),
    createHermesRun: async () => ({ id: "run-1", status: "queued" }),
    getHermesRun: async () => ({ id: "run-1", status: "running" }),
    getHermesRunEvents: async () => [{ id: 1, type: "run.started", created_at: "2026-09-21T13:00:00.000Z" }],
    stopHermesRun: async () => ({ id: "run-1", status: "cancelled" }),
    resolveHermesApproval: async () => ({ ok: true }),
    steerHermesRun: async () => ({ ok: true }),
    ...overrides,
  };
}

const httpError = (status, body = null) =>
  Object.assign(new Error(`Hermes request failed with HTTP ${status}`), { status, body });

// 1 ------------------------------------------------------------------------
test("both adapters satisfy the runtime interface", () => {
  const hermes = createHermesRuntimeAdapter({ client: fakeClient() });
  const fake = createFakeRuntimeAdapter();

  for (const adapter of [hermes, fake]) {
    for (const method of RUNTIME_METHODS) {
      assert.equal(typeof adapter[method], "function", `${adapter.name} is missing ${method}`);
    }
    assert.equal(assertRuntimeAdapter(adapter), adapter);
  }

  assert.throws(
    () => assertRuntimeAdapter({ health: async () => ({}) }),
    (error) => error.code === RUNTIME_ERROR_CODES.notImplemented
  );
});

// 2 ------------------------------------------------------------------------
test("Hermes payloads normalize into Forge shapes", () => {
  const run = normalizeRun({ run_id: "abc", status: "succeeded", completed_at: "x", output: "not forwarded" });
  assert.deepEqual(Object.keys(run).sort(), [
    "completedAt",
    "createdAt",
    "error",
    "id",
    "startedAt",
    "status",
    "statusRaw",
    "summary",
  ]);
  assert.equal(run.status, "completed");
  assert.equal(run.summary, null, "raw model output is never carried across");

  assert.equal(normalizeRunStatus("in_progress"), "running");
  assert.equal(normalizeRunStatus("approval_required"), "waiting_approval");
  assert.equal(normalizeRunStatus("stopped"), "cancelled");
  assert.equal(normalizeRun(null), null);
  assert.equal(normalizeRun({ status: "running" }), null, "a run without an id is not a run");

  const event = normalizeEvent({
    event_type: "tool.requested",
    timestamp: "2026-09-21T13:05:00.000Z",
    agent: "scout",
    metadata: { tool: "research.web_search", nested: { token: "sk-live-x" } },
  });
  assert.equal(event.type, "tool.requested");
  assert.equal(event.actorLabel, "scout");
  assert.deepEqual(event.metadata, { tool: "research.web_search" }, "nested metadata is dropped");
  assert.equal(normalizeEvent({}), null);

  assert.equal(normalizeHealth({ status: "ok", version: "8.1.0" }).state, "healthy");
  assert.equal(normalizeHealth({ status: "starting" }).state, "degraded");
  assert.equal(normalizeHealth(null).state, "unavailable");

  assert.deepEqual(normalizeCapabilities({ features: ["runs", "approvals"] }).features, [
    "runs",
    "approvals",
  ]);
  assert.deepEqual(normalizeCapabilities(null).features, []);
});

// 3/4 ----------------------------------------------------------------------
test("health and capabilities come back normalized through the adapter", async () => {
  const runtime = createHermesRuntimeAdapter({ client: fakeClient() });

  const health = await runtime.health();
  assert.equal(health.state, "healthy");
  assert.equal(health.status, "ok");

  const capabilities = await runtime.getCapabilities();
  assert.deepEqual(capabilities.features, ["runs", "steering"]);
  assert.deepEqual(capabilities.agents, ["jarvis"]);
});

test("the adapter maps run, events, stop, approval, and steering calls", async () => {
  const runtime = createHermesRuntimeAdapter({ client: fakeClient() });

  const run = await runtime.getRun("run-1");
  assert.equal(run.status, "running");

  const events = await runtime.getRunEvents("run-1");
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "run.started");

  const stopped = await runtime.stopRun("run-1");
  assert.equal(stopped.status, "cancelled");

  const approval = await runtime.resolveApproval("run-1", { choice: "once" });
  assert.deepEqual(approval, { ok: true });

  const steered = await runtime.steerRun("run-1", { instruction: "narrow the scope" });
  assert.deepEqual(steered, { ok: true });

  await assert.rejects(
    () => runtime.resolveApproval("run-1", { choice: "maybe" }),
    (error) => error.code === RUNTIME_ERROR_CODES.invalidRequest
  );
  await assert.rejects(
    () => runtime.steerRun("run-1", {}),
    (error) => error.code === RUNTIME_ERROR_CODES.invalidRequest
  );
});

// 5 ------------------------------------------------------------------------
test("missing configuration reports runtime_not_configured, not a crash", async () => {
  const runtime = createHermesRuntimeAdapter({
    client: fakeClient({ hermesConfigState: () => ({ configured: false, baseUrl: null, hasKey: false }) }),
  });

  assert.equal(runtime.configured, false);
  await assert.rejects(
    () => runtime.health(),
    (error) => error.code === RUNTIME_ERROR_CODES.notConfigured
  );
  await assert.rejects(
    () => runtime.getCapabilities(),
    (error) => error.code === RUNTIME_ERROR_CODES.notConfigured
  );
});

// 6 ------------------------------------------------------------------------
test("runtime failures normalize into the documented error codes", async () => {
  const withHealth = (thrown) =>
    createHermesRuntimeAdapter({ client: fakeClient({ getHermesHealth: async () => { throw thrown; } }) });

  await assert.rejects(
    () => withHealth(httpError(401, { message: "invalid api key" })).health(),
    (error) => error.code === RUNTIME_ERROR_CODES.unauthorized && error.status === 401
  );
  await assert.rejects(
    () => withHealth(new TypeError("fetch failed")).health(),
    (error) => error.code === RUNTIME_ERROR_CODES.unreachable
  );
  await assert.rejects(
    () => withHealth(Object.assign(new Error("timed out"), { name: "AbortError" })).health(),
    (error) => error.code === RUNTIME_ERROR_CODES.timeout
  );
  await assert.rejects(
    () => withHealth(httpError(500, { message: "boom" })).health(),
    (error) => error.code === RUNTIME_ERROR_CODES.badResponse
  );
  await assert.rejects(
    () => withHealth(httpError(404, { message: "no such run" })).health(),
    (error) => error.code === RUNTIME_ERROR_CODES.runNotFound
  );

  // Malformed bodies: the adapter refuses rather than passing junk along.
  const malformed = createHermesRuntimeAdapter({
    client: fakeClient({ getHermesRun: async () => ({ status: "running" }) }),
  });
  await assert.rejects(
    () => malformed.getRun("run-1"),
    (error) => error.code === RUNTIME_ERROR_CODES.badResponse
  );

  const rejected = runtimeErrorFromStatus(422, { message: "brief rejected", secret: "sk-live-leak" });
  assert.equal(rejected.code, RUNTIME_ERROR_CODES.rejected);
  assert.equal(rejected.detail, "brief rejected");
  assert.equal(JSON.stringify(rejected.detail).includes("sk-live"), false);
  assert.equal(
    runtimeErrorFromException(new Error("socket hang up")).code,
    RUNTIME_ERROR_CODES.badResponse
  );
  assert.equal(isRuntimeError(rejected), true);
});

test("the adapter enforces its own deadline, not the client's default", async () => {
  const runtime = createHermesRuntimeAdapter({
    // A runtime that accepts the connection and then never answers.
    client: fakeClient({ getHermesHealth: () => new Promise(() => {}) }),
    timeoutMs: 25,
  });

  const started = Date.now();
  await assert.rejects(
    () => runtime.health(),
    (error) => error.code === RUNTIME_ERROR_CODES.timeout
  );
  assert.ok(Date.now() - started < 5000, "the configured deadline bounds the wait");
});

// 7 ------------------------------------------------------------------------
test("the runtime context excludes credentials by construction and by check", () => {
  const context = buildRuntimeContext({
    operatorBrief: "Launch the workshop",
    agentInstructions: "You are SCOUT.",
    capabilityGrants: [{ capability: "research.read", maxActionLevel: "read" }],
    connectionRefs: [{ id: "conn-1", provider: "google", label: "support@example.com", secret_ref: "vault/1" }],
    workspace: { name: "Korben HQ", slug: "korben-hq", kind: "business" },
    policy: { allowedActionLevel: "read" },
    delegation: { enabled: false },
  });

  const serialized = JSON.stringify(context);
  for (const forbidden of ["secret_ref", "HERMES_API_KEY", "service_role", "refresh_token"]) {
    assert.equal(serialized.includes(forbidden), false, `context must not carry ${forbidden}`);
  }
  assert.deepEqual(Object.keys(context.connections[0]).sort(), ["id", "label", "provider"]);
  assert.equal(context.policy.approvalRequiredForExecute, true);

  assert.throws(
    () => assertSafeRuntimeContext({ workspace: { name: "x" }, token: "abc" }),
    (error) => error.code === RUNTIME_ERROR_CODES.invalidRequest
  );
  assert.throws(
    () => assertSafeRuntimeContext({ note: "use Bearer sk-live-abcdefghijklmnop" }),
    (error) => error.code === RUNTIME_ERROR_CODES.invalidRequest
  );
});

test("the launch request contract carries no credentials", () => {
  const context = buildRuntimeContext({
    operatorBrief: "Launch the workshop",
    agentInstructions: "You are SCOUT.",
    capabilityGrants: [{ capability: "research.read", maxActionLevel: "read" }],
    connectionRefs: [{ id: "conn-1", provider: "google", label: "support@example.com" }],
    workspace: { name: "Korben HQ", slug: "korben-hq", kind: "business" },
  });

  const request = buildRuntimeCreateRequest({
    missionId: "mission-1",
    workspaceId: "workspace-1",
    agentSlug: "scout",
    fleetId: null,
    missionKind: "recon",
    brief: "Research the launch venue.",
    context,
    capabilities: ["research.read"],
    policy: { allowedActionLevel: "read" },
    correlation: { idempotencyKey: "idem-1" },
  });

  assert.deepEqual(Object.keys(request).sort(), [
    "agentSlug",
    "brief",
    "capabilities",
    "context",
    "correlation",
    "fleetId",
    "missionId",
    "missionKind",
    "policy",
    "requestedAt",
    "workspaceId",
  ]);
  assert.equal(request.workspaceId, "workspace-1");
  assert.equal(request.agentSlug, "scout");
  assert.equal(request.requestedAt, null, "the request is built, never dispatched");

  const serialized = JSON.stringify(request).toLowerCase();
  for (const forbidden of [
    "api_key",
    "apikey",
    "secret",
    "token",
    "authorization",
    "password",
    "credential",
    "service_role",
  ]) {
    assert.equal(serialized.includes(forbidden), false, `the request must not carry ${forbidden}`);
  }

  // The context builder's own guard accepts the context it produced here.
  assert.equal(assertSafeRuntimeContext(request.context), request.context);
});

// 8 ------------------------------------------------------------------------
test("the fake runtime covers healthy, unavailable, runs, events, and stop", async () => {
  const healthy = createFakeRuntimeAdapter({
    runs: [{ id: "run-9", status: "running" }],
    events: [{ run_id: "run-9", type: "run.started" }],
  });

  assert.equal((await healthy.health()).state, "healthy");
  assert.deepEqual((await healthy.getCapabilities()).features, ["runs", "approvals", "steering"]);
  assert.equal((await healthy.getRun("run-9")).status, "running");
  assert.equal((await healthy.getRunEvents("run-9")).length, 1);
  assert.equal((await healthy.stopRun("run-9")).status, "cancelled");
  await assert.rejects(
    () => healthy.getRun("missing"),
    (error) => error.code === RUNTIME_ERROR_CODES.runNotFound
  );
  await assert.rejects(
    () => healthy.createRun({ brief: "x" }),
    (error) => error.code === RUNTIME_ERROR_CODES.unreachable
  );

  const down = createFakeRuntimeAdapter({ mode: "unavailable" });
  await assert.rejects(
    () => down.health(),
    (error) => error.code === RUNTIME_ERROR_CODES.unreachable
  );

  const unconfigured = createFakeRuntimeAdapter({ mode: "notConfigured" });
  assert.equal(unconfigured.configured, false);
  await assert.rejects(
    () => unconfigured.health(),
    (error) => error.code === RUNTIME_ERROR_CODES.notConfigured
  );
});

// 9–10 ---------------------------------------------------------------------
test("the Hermes credential never reaches the browser", () => {
  const walk = (url, found = []) => {
    for (const entry of readdirSync(url, { withFileTypes: true })) {
      const next = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, url);
      if (entry.isDirectory()) walk(next, found);
      else if (entry.name.endsWith(".js")) found.push(next);
    }
    return found;
  };

  const browserSurfaces = [
    ...walk(new URL("../app/", import.meta.url)),
    ...walk(new URL("../components/", import.meta.url)),
  ];

  for (const file of browserSurfaces) {
    const source = readFileSync(file, "utf8");
    const name = file.pathname.split("/").slice(-3).join("/");
    // Route handlers under app/api/ are server-side by definition; every other
    // application surface must reach Hermes through the runtime boundary.
    const isServerRouteHandler = file.pathname.includes("/app/api/");

    assert.equal(source.includes("NEXT_PUBLIC_HERMES"), false, `${name} exposes a public Hermes var`);
    assert.equal(source.includes("HERMES_API_KEY"), false, `${name} references the Hermes key`);
    assert.equal(
      isServerRouteHandler || !source.includes("lib/hermes/client"),
      true,
      `${name} imports Hermes directly`
    );

    // Client components must not import the server-only runtime either.
    if (source.includes('"use client"') || source.includes("'use client'")) {
      assert.equal(
        source.includes("lib/forge/runtime"),
        false,
        `${name} is a client component importing the server runtime`
      );
    }
  }

  // The runtime entry point is server-only, and the wire client stays server-only.
  assert.match(read("lib/forge/runtime/index.js"), /^import "server-only";/);
  assert.match(read("lib/hermes/client.js"), /^import "server-only";/);
});

test("the mission and persistence layers do not import Hermes directly", () => {
  const surfaces = [
    "lib/forge/persistence/missions.js",
    "lib/forge/persistence/index.js",
    "lib/forge/persistence/workspaces.js",
    "lib/forge/missions/mission.js",
    "app/(protected)/missions/actions.js",
  ];

  for (const surface of surfaces) {
    const source = read(surface);
    assert.equal(source.includes("lib/hermes"), false, `${surface} imports Hermes directly`);
    assert.equal(source.includes("HERMES_API"), false, `${surface} reads Hermes configuration`);
  }
});
