import assert from "node:assert/strict";
import { test } from "node:test";

import { createRunEvent } from "../lib/forge/runtime/events.js";
import { redactRecord, safeSummary } from "../lib/forge/runtime/sanitize.js";
import { summarizePayloadLines } from "../lib/forge/summaries.js";

const TOKEN = "sk-live-abcdefghijklmnopqrstuvwxyz";

test("redactRecord masks sensitive keys and secret-shaped values", () => {
  const redacted = redactRecord({
    to: "billing@example.com",
    api_key: TOKEN,
    note: `use Bearer ${TOKEN} when calling`,
    nested: { authorization: `Bearer ${TOKEN}` },
  });

  const serialized = JSON.stringify(redacted);
  assert.equal(serialized.includes(TOKEN), false);
  assert.equal(redacted.api_key, "[redacted]");
  assert.equal(redacted.to, "billing@example.com");
  assert.equal(redacted.nested.authorization, "[redacted]");
});

test("redactRecord bounds field count and string length", () => {
  const wide = Object.fromEntries(
    Array.from({ length: 20 }, (_, index) => [`field_${index}`, "x".repeat(500)])
  );
  const redacted = redactRecord(wide);

  assert.equal(Object.keys(redacted).length, 13);
  assert.equal(redacted.__truncated_fields, 8);
  assert.equal(redacted.field_0.length <= 240, true);
});

test("event metadata is sanitized before it is stored", () => {
  const event = createRunEvent({
    taskId: "task-1",
    workspaceId: "ws-1",
    type: "tool.requested",
    summary: `Calling provider with ${TOKEN}`,
    metadata: { tool: "gmail.send_message", token: TOKEN, body: `Bearer ${TOKEN}` },
  });

  const serialized = JSON.stringify(event);
  assert.equal(serialized.includes(TOKEN), false);
  assert.equal(event.metadata.token, "[redacted]");
  assert.equal(event.summary.includes(TOKEN), false);
});

test("receipt summaries never carry raw credentials", () => {
  const summary = safeSummary({ access_token: TOKEN, to: "billing@example.com" });
  assert.equal(String(summary).includes(TOKEN), false);
});

test("the dashboard summarizer masks sensitive keys", () => {
  const lines = summarizePayloadLines({ to: "billing@example.com", api_key: TOKEN });
  const serialized = lines.join(" ");

  assert.equal(serialized.includes(TOKEN), false);
  assert.equal(serialized.includes("••••"), true);
});
