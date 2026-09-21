import assert from "node:assert/strict";
import { test } from "node:test";

import { createApprovalService } from "../lib/forge/runtime/approvals.js";
import { createEventRecorder } from "../lib/forge/runtime/events.js";
import { evaluateCapabilityAccess } from "../lib/forge/runtime/policy.js";
import { createReceiptRecorder } from "../lib/forge/runtime/receipts.js";
import { createAdapterRegistry } from "../lib/forge/runtime/tools/adapters.js";
import { createToolGateway } from "../lib/forge/runtime/tools/gateway.js";
import {
  createToolRegistry,
  defineTool,
  validateToolArguments,
} from "../lib/forge/runtime/tools/registry.js";
import { toolLabel } from "../lib/forge/runtime/tools/labels.js";
import { createFakeRepository, createFixture } from "./helpers/fake-repository.js";

function buildGateway({ tools, run }) {
  const repository = createFakeRepository(createFixture());
  const events = createEventRecorder({ repository });
  const receipts = createReceiptRecorder({ repository });
  const approvals = createApprovalService({ repository, events });
  const registry = createToolRegistry(tools);
  const calls = [];
  const adapters = createAdapterRegistry(
    tools.map((tool) => ({
      toolId: tool.id,
      run: async (input) => {
        calls.push(input);
        return run ? run(input) : { ok: true };
      },
    }))
  );
  const gateway = createToolGateway({
    repository,
    registry,
    adapters,
    approvals,
    events,
    receipts,
  });
  return { gateway, repository, calls };
}

test("unknown and remote tools default to operator review", () => {
  const remoteRead = defineTool({
    id: "remote.thing",
    title: "Remote thing",
    description: "A remote tool that claims to be a read.",
    provider: "gmail",
    capability: "email.read",
    actionLevel: "read",
    available: true,
    inputSchema: {},
  });

  assert.equal(remoteRead.trustedRead, false);
  assert.equal(remoteRead.reviewPolicy, "always");
  assert.equal(remoteRead.requiresApproval, true);

  const trusted = defineTool({
    id: "forge.internal.read_only",
    title: "Internal read",
    description: "Internal read-only tool.",
    provider: "forge",
    capability: "workspace.read",
    actionLevel: "read",
    trustedRead: true,
    available: true,
    inputSchema: {},
  });

  assert.equal(trusted.trustedRead, true);
  assert.equal(trusted.reviewPolicy, "auto");
  assert.equal(trusted.requiresApproval, false);
});

test("the registry classifies reads, drafts, and executes correctly", () => {
  const registry = createToolRegistry();

  assert.equal(registry.get("gmail.list_messages").actionLevel, "read");
  assert.equal(registry.get("gmail.list_messages").trustedRead, true);
  assert.equal(registry.get("gmail.create_draft").actionLevel, "draft");
  assert.equal(registry.get("gmail.create_draft").requiresApproval, true);
  assert.equal(registry.get("gmail.send_message").actionLevel, "execute");
  assert.equal(registry.get("gmail.send_message").requiresApproval, true);
  assert.equal(registry.get("comments.reply").actionLevel, "execute");
  assert.equal(registry.get("social.publish_post").actionLevel, "execute");
});

test("READ cannot mutate: an execute request above a read ceiling is denied", () => {
  const access = evaluateCapabilityAccess({
    capability: "email.read",
    requestedActionLevel: "execute",
    agentCapabilities: [{ capability: "email.read", max_action_level: "read" }],
    membershipCapabilities: [{ capability: "email.read", action_level: "read" }],
  });

  assert.equal(access.allowed, false);
  assert.equal(access.reason, "action_level_exceeds_agent");
  assert.equal(access.effectiveActionLevel, "read");
});

test("numeric bounds are enforced by argument validation", () => {
  const tool = defineTool({
    id: "test.bounded",
    title: "Bounded",
    description: "Has bounds.",
    capability: "email.read",
    actionLevel: "read",
    trustedRead: true,
    available: true,
    inputSchema: { limit: { type: "number", minimum: 1, maximum: 10 } },
  });

  assert.equal(validateToolArguments(tool, { limit: 5 }).ok, true);
  assert.equal(validateToolArguments(tool, { limit: 0 }).ok, false);
  assert.equal(validateToolArguments(tool, { limit: 11 }).ok, false);
});

test("tool results are bounded and marked as untrusted data", async () => {
  const big = "x".repeat(20000);
  const tool = defineTool({
    id: "forge.internal.big_read",
    title: "Big read",
    description: "Returns a large payload.",
    provider: "forge",
    capability: "email.read",
    actionLevel: "read",
    trustedRead: true,
    available: true,
    inputSchema: {},
  });

  const { gateway } = buildGateway({ tools: [tool], run: () => big });

  const result = await gateway.requestAction({
    actorUserId: "user-1",
    taskId: "task-1",
    toolId: tool.id,
  });

  assert.equal(result.status, "executed");
  assert.equal(result.result.untrusted, true);
  assert.match(result.result.note, /UNTRUSTED TOOL DATA/);
  assert.match(result.result.data, /\[RESULT TRUNCATED\]$/);
  assert.equal(result.result.data.length < big.length, true);
});

test("receipts distinguish accepted from provider-confirmed", async () => {
  const tool = defineTool({
    id: "forge.internal.publish_thing",
    title: "Publish thing",
    description: "Publishes and returns a reference.",
    provider: "forge",
    capability: "email.read",
    actionLevel: "read",
    trustedRead: true,
    available: true,
    inputSchema: {},
  });

  const accepted = buildGateway({ tools: [tool], run: () => ({ ok: true }) });
  await accepted.gateway.requestAction({
    actorUserId: "user-1",
    taskId: "task-1",
    toolId: tool.id,
  });
  assert.equal(accepted.repository.state.receipts[0].confirmation, "accepted");

  const confirmed = buildGateway({
    tools: [tool],
    run: () => ({ ok: true, externalRef: "provider-123" }),
  });
  await confirmed.gateway.requestAction({
    actorUserId: "user-1",
    taskId: "task-1",
    toolId: tool.id,
  });
  assert.equal(confirmed.repository.state.receipts[0].confirmation, "confirmed");
});

test("tool activity is summarised as plain operator language", () => {
  assert.equal(toolLabel("gmail.list_messages").label, "reading mail…");
  assert.equal(toolLabel("gmail.create_draft").label, "drafting an email…");
  assert.equal(toolLabel("comments.reply").label, "submitting replies…");
  assert.equal(toolLabel("research.web_search").label, "searching…");
  assert.equal(toolLabel("analytics.channel_report").kind, "read");
});

test("denied actions are recorded as events and never as receipts", async () => {
  const tool = defineTool({
    id: "remote.write_thing",
    title: "Remote write",
    description: "A remote mutating tool.",
    provider: "gmail",
    capability: "email.send",
    actionLevel: "execute",
    available: true,
    inputSchema: {},
  });

  const { gateway, repository, calls } = buildGateway({ tools: [tool] });

  await assert.rejects(
    () =>
      gateway.requestAction({
        actorUserId: "user-1",
        taskId: "task-1",
        toolId: tool.id,
      }),
    (error) => error.code === "capability_denied"
  );

  assert.equal(calls.length, 0);
  assert.equal(repository.state.receipts.length, 0);
  assert.equal(
    repository.state.events.some((event) => event.eventType === "tool.denied"),
    true
  );
});
