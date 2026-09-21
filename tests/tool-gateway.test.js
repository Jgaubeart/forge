import assert from "node:assert/strict";
import { test } from "node:test";

import { createApprovalService } from "../lib/forge/runtime/approvals.js";
import { createEventRecorder } from "../lib/forge/runtime/events.js";
import { createReceiptRecorder } from "../lib/forge/runtime/receipts.js";
import { createAdapterRegistry } from "../lib/forge/runtime/tools/adapters.js";
import { createToolGateway } from "../lib/forge/runtime/tools/gateway.js";
import { createToolRegistry, defineTool } from "../lib/forge/runtime/tools/registry.js";
import { createFakeRepository, createFixture } from "./helpers/fake-repository.js";

const TOKEN = "sk-live-abcdefghijklmnopqrstuvwxyz";

const READ_TOOL = defineTool({
  id: "test.read_thing",
  title: "Read thing",
  description: "Read a thing.",
  capability: "email.read",
  actionLevel: "read",
  available: true,
  inputSchema: { query: { type: "string", required: true, maxLength: 60 } },
});

const EXECUTE_TOOL = defineTool({
  id: "test.send_thing",
  title: "Send thing",
  description: "Send a thing.",
  capability: "email.send",
  actionLevel: "execute",
  requiresApproval: true,
  requiresConnection: true,
  available: true,
  inputSchema: {
    body: { type: "string", required: true, maxLength: 200 },
  },
});

function buildGateway({ tools = [READ_TOOL], run } = {}) {
  const base = createFixture();
  const fixture = {
    ...base,
    // This workspace genuinely permits sending at execute level, so the tests
    // exercise the approval and connection gates rather than the ceiling.
    agentCapabilities: {
      "agent-1": [
        ...base.agentCapabilities["agent-1"],
        { capability: "email.send", max_action_level: "execute" },
      ],
    },
    membershipCapabilities: {
      ...base.membershipCapabilities,
      "mem-1": [
        ...base.membershipCapabilities["mem-1"],
        { capability: "email.send", action_level: "execute" },
      ],
    },
    tasks: [
      ...base.tasks,
      {
        id: "task-other",
        workspaceId: "ws-2",
        agentId: "agent-1",
        requestedBy: "user-2",
        actionLevel: "read",
        input: { goal: "Another workspace's mission" },
        status: "running",
        currentStep: null,
        policy: {},
      },
    ],
  };

  const repository = createFakeRepository(fixture);
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

  return { gateway, repository, approvals, calls, registry };
}

test("A: a mission in another workspace is not reachable", async () => {
  const { gateway, repository } = buildGateway();

  await assert.rejects(
    () =>
      gateway.requestAction({
        actorUserId: "user-1",
        taskId: "task-other",
        toolId: READ_TOOL.id,
        args: { query: "inbox" },
      }),
    (error) => error.code === "not_found"
  );

  // Nothing was executed and nothing was recorded for a task it cannot see.
  assert.equal(repository.state.receipts.length, 0);
  assert.equal(repository.state.events.length, 0);
});

test("B: a capability the agent lacks is denied and recorded as an event", async () => {
  // The fixture agent holds email.read/email.draft, so this tool asks for a
  // capability neither the agent nor the member holds.
  const sendTool = defineTool({
    id: "test.email_send",
    title: "Send email",
    description: "Send email.",
    capability: "payments.transfer",
    actionLevel: "execute",
    available: true,
    inputSchema: { body: { type: "string", required: true } },
  });
  const { gateway, repository } = buildGateway({ tools: [sendTool] });

  await assert.rejects(
    () =>
      gateway.requestAction({
        actorUserId: "user-1",
        taskId: "task-1",
        toolId: sendTool.id,
        args: { body: "hello" },
      }),
    (error) => error.code === "capability_denied"
  );

  const denial = repository.state.events.find(
    (event) => event.eventType === "tool.denied"
  );
  assert.ok(denial);
  assert.equal(denial.metadata.reason, "agent_capability_missing");
  assert.equal(repository.state.receipts.length, 0);
});

test("C: EXECUTE cannot happen without an approval", async () => {
  const { gateway, repository, calls } = buildGateway({ tools: [EXECUTE_TOOL] });

  const result = await gateway.requestAction({
    actorUserId: "user-1",
    taskId: "task-1",
    toolId: EXECUTE_TOOL.id,
    args: { body: "A draft that would be sent" },
    connectionId: "conn-1",
  });

  assert.equal(result.status, "approval_required");
  assert.equal(calls.length, 0);
  assert.equal(repository.state.receipts.length, 0);

  const approval = repository.state.approvals[0];
  assert.equal(approval.status, "pending");
  assert.equal(approval.actionLevel, "execute");
  assert.ok(approval.payloadHash);

  const task = repository.state.tasks.find((entry) => entry.id === "task-1");
  assert.equal(task.status, "waiting_approval");

  const requested = repository.state.events.find(
    (event) => event.eventType === "approval.requested"
  );
  assert.ok(requested);
});

test("D: approved execution runs the staged arguments, not later input", async () => {
  const { gateway, repository, approvals, calls } = buildGateway({
    tools: [EXECUTE_TOOL],
    run: () => ({ sent: true }),
  });

  // Undeclared arguments are rejected at staging time.
  await assert.rejects(
    () =>
      gateway.requestAction({
        actorUserId: "user-1",
        taskId: "task-1",
        toolId: EXECUTE_TOOL.id,
        args: { body: "Staged body", unexpected: "should be rejected" },
        connectionId: "conn-1",
      }),
    (error) => error.code === "validation_failed"
  );

  const accepted = await gateway.requestAction({
    actorUserId: "user-1",
    taskId: "task-1",
    toolId: EXECUTE_TOOL.id,
    args: { body: "Staged body" },
    connectionId: "conn-1",
  });

  await approvals.decide({
    approvalId: accepted.approvalId,
    actorUserId: "user-1",
    decision: "approved",
  });

  const executed = await gateway.executeApprovedAction({
    actorUserId: "user-1",
    approvalId: accepted.approvalId,
  });

  assert.equal(executed.status, "executed");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, { body: "Staged body" });

  // Tampering with the staged payload after review blocks execution.
  const { gateway: tampered, repository: tamperedRepo, approvals: tamperedApprovals } =
    buildGateway({ tools: [EXECUTE_TOOL] });

  const second = await tampered.requestAction({
    actorUserId: "user-1",
    taskId: "task-1",
    toolId: EXECUTE_TOOL.id,
    args: { body: "Reviewed body" },
    connectionId: "conn-1",
  });

  await tamperedApprovals.decide({
    approvalId: second.approvalId,
    actorUserId: "user-1",
    decision: "approved",
  });

  const stored = tamperedRepo.state.approvals.find(
    (entry) => entry.id === second.approvalId
  );
  stored.payloadHash = "deadbeef";

  await assert.rejects(
    () =>
      tampered.executeApprovedAction({
        actorUserId: "user-1",
        approvalId: second.approvalId,
      }),
    (error) => error.code === "approval_conflict"
  );

  // An approval can only be resumed once.
  await assert.rejects(
    () =>
      gateway.executeApprovedAction({
        actorUserId: "user-1",
        approvalId: accepted.approvalId,
      }),
    (error) => error.code === "approval_conflict"
  );

  assert.equal(repository.state.receipts.length, 1);
});

test("E: another person's connection cannot be used", async () => {
  const { gateway } = buildGateway({ tools: [EXECUTE_TOOL] });

  await assert.rejects(
    () =>
      gateway.requestAction({
        actorUserId: "user-1",
        taskId: "task-1",
        toolId: EXECUTE_TOOL.id,
        args: { body: "hello" },
        connectionId: "conn-2",
      }),
    (error) => error.code === "connection_denied"
  );
});

test("G: secrets never reach receipts, events, or audit entries", async () => {
  const { gateway, repository } = buildGateway({
    tools: [READ_TOOL],
    run: () => ({ result: `Authorization: Bearer ${TOKEN}` }),
  });

  await gateway.requestAction({
    actorUserId: "user-1",
    taskId: "task-1",
    toolId: READ_TOOL.id,
    args: { query: `search ${TOKEN}` },
  });

  const serialized = JSON.stringify({
    receipts: repository.state.receipts,
    events: repository.state.events,
    audit: repository.state.auditLogs,
  });

  assert.equal(serialized.includes(TOKEN), false);
  assert.equal(repository.state.receipts.length, 1);
  assert.equal(repository.state.auditLogs.length, 1);
});
