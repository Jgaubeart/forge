import assert from "node:assert/strict";
import { test } from "node:test";

import {
  actionLevelAllows,
  canCancelMission,
  evaluateCapabilityAccess,
  highestActionLevel,
  isTerminalMission,
  lowerActionLevel,
  mapRunStatus,
  normalizeActionLevel,
} from "../lib/forge/runtime/policy.js";

const agentCaps = [
  { capability: "email.read", max_action_level: "read" },
  { capability: "email.draft", max_action_level: "draft" },
];

const memberCaps = [
  { capability: "email.read", action_level: "read" },
  { capability: "email.draft", action_level: "draft" },
];

test("capability is denied when the agent lacks it", () => {
  const result = evaluateCapabilityAccess({
    capability: "email.send",
    requestedActionLevel: "execute",
    agentCapabilities: agentCaps,
    membershipCapabilities: memberCaps,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "agent_capability_missing");
});

test("capability is denied when the member lacks it", () => {
  const result = evaluateCapabilityAccess({
    capability: "email.draft",
    requestedActionLevel: "draft",
    agentCapabilities: agentCaps,
    membershipCapabilities: [{ capability: "email.read", action_level: "read" }],
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "member_capability_missing");
});

test("requested action level cannot exceed the agent ceiling", () => {
  const result = evaluateCapabilityAccess({
    capability: "email.draft",
    requestedActionLevel: "execute",
    agentCapabilities: agentCaps,
    membershipCapabilities: [
      { capability: "email.draft", action_level: "execute" },
    ],
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "action_level_exceeds_agent");
  assert.equal(result.effectiveActionLevel, "draft");
});

test("effective ceiling is the lower of agent and member grants", () => {
  const result = evaluateCapabilityAccess({
    capability: "email.draft",
    requestedActionLevel: "draft",
    agentCapabilities: agentCaps,
    membershipCapabilities: [
      { capability: "email.draft", action_level: "execute" },
    ],
  });

  assert.equal(result.allowed, true);
  assert.equal(result.effectiveActionLevel, "draft");
  assert.equal(result.agentActionLevel, "draft");
  assert.equal(result.memberActionLevel, "execute");
});

test("action level helpers order read < draft < execute", () => {
  assert.equal(actionLevelAllows("read", "execute"), true);
  assert.equal(actionLevelAllows("execute", "draft"), false);
  assert.equal(lowerActionLevel("execute", "draft"), "draft");
  assert.equal(highestActionLevel(["read", "execute", "draft"]), "execute");
  assert.equal(normalizeActionLevel("EXECUTE"), "execute");
  assert.equal(normalizeActionLevel("shipit"), null);
});

test("mission cancellation is refused once a mission is terminal", () => {
  assert.equal(canCancelMission("running"), true);
  assert.equal(canCancelMission("waiting_approval"), true);
  assert.equal(canCancelMission("completed"), false);
  assert.equal(isTerminalMission("cancelled"), true);
});

test("hermes statuses map onto mission states", () => {
  assert.equal(mapRunStatus("succeeded"), "completed");
  assert.equal(mapRunStatus("in_progress"), "running");
  assert.equal(mapRunStatus("stopped"), "cancelled");
  assert.equal(mapRunStatus("approval_required"), "waiting_approval");
});
