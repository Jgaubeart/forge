import assert from "node:assert/strict";
import { test } from "node:test";

import { createApprovalService } from "../lib/forge/runtime/approvals.js";
import { createEventRecorder } from "../lib/forge/runtime/events.js";
import { createToolRegistry, defineTool } from "../lib/forge/runtime/tools/registry.js";
import { createFakeRepository, createFixture } from "./helpers/fake-repository.js";

const SEND_TOOL = defineTool({
  id: "test.send_now",
  title: "Send now",
  description: "An execute-level tool.",
  capability: "email.send",
  actionLevel: "execute",
  available: true,
  inputSchema: {
    to: { type: "string", required: true, maxLength: 200 },
    body: { type: "string", required: true, maxLength: 2000 },
  },
});

function build({ now = new Date("2026-09-21T12:00:00.000Z") } = {}) {
  const repository = createFakeRepository(createFixture());
  const events = createEventRecorder({ repository });
  const approvals = createApprovalService({
    repository,
    events,
    clock: () => now,
  });
  const task = repository.state.tasks[0];

  return { repository, approvals, events, task, registry: createToolRegistry() };
}

test("a staged approval keeps the exact arguments that were reviewed", async () => {
  const { approvals, repository, task } = build();

  const approval = await approvals.stage({
    task,
    tool: SEND_TOOL,
    requestedBy: "user-1",
    args: { to: "billing@example.com", body: "Please cancel." },
  });

  assert.equal(approval.status, "pending");
  assert.ok(approval.payloadHash);

  await approvals.decide({
    approvalId: approval.id,
    actorUserId: "user-1",
    decision: "approved",
  });

  const claimed = await approvals.claim({
    approvalId: approval.id,
    actorUserId: "user-1",
  });

  assert.deepEqual(claimed.stagedArguments, {
    to: "billing@example.com",
    body: "Please cancel.",
  });

  const stored = repository.state.approvals.find((entry) => entry.id === approval.id);
  assert.equal(stored.decidedPayloadHash, stored.payloadHash);
});

test("an approval cannot be reused", async () => {
  const { approvals, task } = build();

  const approval = await approvals.stage({
    task,
    tool: SEND_TOOL,
    requestedBy: "user-1",
    args: { to: "a@example.com", body: "one" },
  });

  await approvals.decide({ approvalId: approval.id, actorUserId: "user-1", decision: "approved" });
  await approvals.claim({ approvalId: approval.id, actorUserId: "user-1" });

  await assert.rejects(
    () => approvals.claim({ approvalId: approval.id, actorUserId: "user-1" }),
    (error) => error.code === "approval_conflict"
  );
});

test("an approval expires instead of executing later", async () => {
  const { approvals, repository, task } = build();

  const approval = await approvals.stage({
    task,
    tool: SEND_TOOL,
    requestedBy: "user-1",
    args: { to: "a@example.com", body: "one" },
    expiresAt: new Date("2026-09-21T11:00:00.000Z"),
  });

  await assert.rejects(
    () =>
      approvals.decide({
        approvalId: approval.id,
        actorUserId: "user-1",
        decision: "approved",
      }),
    (error) => error.code === "approval_conflict"
  );

  const stored = repository.state.approvals.find((entry) => entry.id === approval.id);
  assert.equal(stored.status, "expired");

  await assert.rejects(
    () => approvals.claim({ approvalId: approval.id, actorUserId: "user-1" }),
    (error) => error.code === "approval_conflict"
  );
});

test("a denied approval never executes", async () => {
  const { approvals, task } = build();

  const approval = await approvals.stage({
    task,
    tool: SEND_TOOL,
    requestedBy: "user-1",
    args: { to: "a@example.com", body: "one" },
  });

  await approvals.decide({
    approvalId: approval.id,
    actorUserId: "user-1",
    decision: "denied",
  });

  await assert.rejects(
    () => approvals.claim({ approvalId: approval.id, actorUserId: "user-1" }),
    (error) => error.code === "approval_conflict"
  );
});

test("another workspace cannot decide someone else's approval", async () => {
  const { approvals, task } = build();

  const approval = await approvals.stage({
    task,
    tool: SEND_TOOL,
    requestedBy: "user-1",
    args: { to: "a@example.com", body: "one" },
  });

  await assert.rejects(
    () =>
      approvals.decide({
        approvalId: approval.id,
        actorUserId: "user-2",
        decision: "approved",
      }),
    (error) => error.code === "not_found"
  );
});
