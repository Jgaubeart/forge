import assert from "node:assert/strict";
import { test } from "node:test";

import { createContextBuilder } from "../lib/forge/runtime/context-builder.js";
import { createToolRegistry } from "../lib/forge/runtime/tools/registry.js";
import { createFakeRepository, createFixture } from "./helpers/fake-repository.js";

function build() {
  const repository = createFakeRepository(createFixture());
  const registry = createToolRegistry();
  return { repository, builder: createContextBuilder({ repository, registry }) };
}

test("context is refused for a workspace the caller does not belong to", async () => {
  const { builder } = build();

  await assert.rejects(
    () =>
      builder.build({
        actorUserId: "user-1",
        workspaceId: "ws-2",
        agentId: "agent-1",
        capability: "email.read",
        requestedActionLevel: "read",
      }),
    (error) => error.code === "unauthorized"
  );
});

test("context is refused when either side lacks the capability", async () => {
  const { builder } = build();

  await assert.rejects(
    () =>
      builder.build({
        actorUserId: "user-1",
        workspaceId: "ws-1",
        agentId: "agent-1",
        capability: "email.send",
        requestedActionLevel: "execute",
      }),
    (error) => error.code === "capability_denied"
  );
});

test("the runtime context carries references, never credentials", async () => {
  const { builder } = build();

  const context = await builder.build({
    actorUserId: "user-1",
    workspaceId: "ws-1",
    agentId: "agent-1",
    capability: "email.read",
    requestedActionLevel: "read",
  });

  const serialized = JSON.stringify(context.hermesContext);
  assert.equal(serialized.includes("secret_ref"), false);
  assert.equal(serialized.includes("token"), false);
  assert.equal(serialized.includes("HERMES_API_KEY"), false);

  // Only connections the caller may use are listed, and only as references.
  assert.deepEqual(
    context.hermesContext.connections.map((connection) => connection.id),
    ["conn-1"]
  );
  assert.equal(context.hermesContext.policy.credentials_shared_with_runtime, false);

  // The policy snapshot is what the mission record stores.
  assert.deepEqual(context.policySnapshot.connection_ids, ["conn-1"]);
  assert.ok(context.policySnapshot.capabilities.includes("email.read"));

  // Only implemented tools are offered to the runtime.
  assert.deepEqual(
    context.hermesContext.tools.map((tool) => tool.id),
    ["forge.internal.workspace_snapshot"]
  );
});

test("connections in another workspace are never included", async () => {
  const { builder } = build();

  const context = await builder.build({
    actorUserId: "user-1",
    workspaceId: "ws-1",
    agentId: "agent-1",
    capability: "email.read",
    requestedActionLevel: "read",
    connectionIds: ["conn-9-does-not-exist"],
  });

  assert.deepEqual(context.connections, []);
});
