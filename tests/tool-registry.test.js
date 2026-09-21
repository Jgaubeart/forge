import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createToolRegistry,
  defineTool,
  validateToolArguments,
} from "../lib/forge/runtime/tools/registry.js";

test("registry definitions carry the required metadata", () => {
  const registry = createToolRegistry();
  const tools = registry.list();

  assert.ok(tools.length > 0);

  const ids = new Set();
  for (const tool of tools) {
    assert.equal(ids.has(tool.id), false, `duplicate tool id ${tool.id}`);
    ids.add(tool.id);
    assert.ok(tool.capability, `${tool.id} needs a capability`);
    assert.ok(["read", "draft", "execute"].includes(tool.actionLevel));
    assert.equal(typeof tool.available, "boolean");
  }
});

test("every execute tool requires approval", () => {
  const registry = createToolRegistry();
  const executeTools = registry.list().filter((tool) => tool.actionLevel === "execute");

  assert.ok(executeTools.length > 0);
  for (const tool of executeTools) {
    assert.equal(tool.requiresApproval, true, `${tool.id} must require approval`);
  }
});

test("defineTool rejects malformed definitions", () => {
  assert.throws(() => defineTool({ id: "BadId", title: "x", description: "y", capability: "c", actionLevel: "read" }));
  assert.throws(() => defineTool({ id: "ok.tool", title: "x", description: "y", actionLevel: "read" }));
  assert.throws(() => defineTool({ id: "ok.tool", title: "x", description: "y", capability: "c", actionLevel: "ship" }));
});

test("argument validation is strict about unknown fields", () => {
  const tool = defineTool({
    id: "test.tool",
    title: "Test",
    description: "Test tool",
    capability: "email.draft",
    actionLevel: "draft",
    available: true,
    inputSchema: {
      body: { type: "string", required: true, maxLength: 10 },
      count: { type: "number" },
      mode: { type: "string", enum: ["quick", "full"] },
    },
  });

  assert.equal(validateToolArguments(tool, { body: "hello" }).ok, true);
  assert.equal(validateToolArguments(tool, {}).ok, false);
  assert.equal(validateToolArguments(tool, { body: "hello", extra: 1 }).ok, false);
  assert.equal(validateToolArguments(tool, { body: "x".repeat(11) }).ok, false);
  assert.equal(validateToolArguments(tool, { body: "hi", mode: "nope" }).ok, false);
  assert.equal(validateToolArguments(tool, { body: 5 }).ok, false);

  const result = validateToolArguments(tool, { body: "hi", count: 2, extra: 1 });
  assert.deepEqual(result.errors, ["unexpected argument: extra"]);
});

test("the Hermes exposure list contains declarations only", () => {
  const registry = createToolRegistry();
  const exposed = registry.forHermes({ capabilities: ["workspace.read", "email.read"] });

  assert.ok(exposed.length > 0);

  for (const entry of exposed) {
    assert.equal(typeof entry.id, "string");
    assert.equal(typeof entry.description, "string");
    assert.equal(typeof entry.requires_approval, "boolean");
    assert.equal("run" in entry, false);
    assert.equal("handler" in entry, false);
  }

  // Unimplemented provider tools are never offered to the runtime.
  assert.equal(
    exposed.some((entry) => entry.id.startsWith("gmail.")),
    false
  );
  // Capabilities the caller does not hold are never offered either.
  const withoutCapability = registry.forHermes({ capabilities: ["email.read"] });
  assert.equal(
    withoutCapability.some((entry) => entry.id === "forge.internal.workspace_snapshot"),
    false
  );
});
