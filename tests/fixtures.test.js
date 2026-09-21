import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AGENT_COLORS,
  AGENTS,
  FIXTURE_MISSIONS,
  FIXTURE_NOTICE,
  FIXTURE_TOOLS,
  FLEET,
} from "../lib/jarvis-fixtures/index.js";
import { agentBySlug } from "../lib/forge/agents/index.js";
import {
  MISSION_KIND_KEYS,
  isKnownEventType,
  isValidStatus,
  stageChipsFrom,
  stagesForKind,
} from "./helpers/mission-fixtures.js";

test("the fixture set covers every mission state the dock has to show", () => {
  const statuses = new Set(FIXTURE_MISSIONS.map((mission) => mission.status));

  for (const status of [
    "running",
    "waiting_approval",
    "completed",
    "failed",
    "cancelled",
  ]) {
    assert.ok(statuses.has(status), `no fixture mission in state ${status}`);
  }
});

test("the running fleet fixture shows a coordinated three-agent team", () => {
  const fleet = FIXTURE_MISSIONS.find(
    (mission) => mission.kind === "fleet" && mission.status === "running"
  );

  assert.ok(fleet, "no running fleet mission");
  assert.equal(fleet.leadSlug, "jarvis");
  assert.deepEqual(
    fleet.team.map((worker) => worker.slug),
    ["scout", "forge", "sage"]
  );
  assert.ok(fleet.events.length >= 4, "fleet fixture needs a real feed");
  assert.ok(fleet.reached.includes("recon"));
});

test("a single-agent mission fixture exists alongside the fleet", () => {
  const single = FIXTURE_MISSIONS.find(
    (mission) => mission.team.length === 0 && mission.status === "running"
  );
  assert.ok(single, "no single-agent mission fixture");
  assert.equal(single.kind, "buildapp");
  assert.deepEqual(stagesForKind(single.kind), ["SCAFFOLD", "CODE", "TEST", "LAUNCH"]);
});

test("the confirmation fixture carries the exact staged action", () => {
  const pending = FIXTURE_MISSIONS.find(
    (mission) => mission.approval?.state === "pending"
  );

  assert.ok(pending, "no awaiting-approval fixture");
  assert.equal(pending.status, "waiting_approval");
  assert.equal(pending.approval.tool, "social.publish_post");
  assert.equal(pending.approval.destination, "twitter");
  assert.match(pending.approval.args.text, /workshop is live/i);
  assert.ok(pending.approval.expiresAt);
  assert.ok(pending.approval.payloadFingerprint);
  assert.equal(Object.isFrozen(pending.approval.args), true);
});

test("structured results exist for the reference result kinds", () => {
  const kinds = new Set(
    FIXTURE_MISSIONS.filter((mission) => mission.result).map(
      (mission) => mission.result.kind
    )
  );

  for (const kind of ["fleet", "warroom", "reaper", "announce", "haters"]) {
    assert.ok(kinds.has(kind), `no structured result fixture for ${kind}`);
  }

  const fleet = FIXTURE_MISSIONS.find((mission) => mission.result?.kind === "fleet");
  assert.ok(fleet.result.sections.scout);
  assert.ok(fleet.result.sections.forge);
  assert.ok(fleet.result.sections.sage);
  assert.deepEqual(fleet.result.missing, []);
  assert.deepEqual(fleet.result.failed, []);
});

test("the failed and cancelled fixtures explain themselves without claiming success", () => {
  const failed = FIXTURE_MISSIONS.find((mission) => mission.status === "failed");
  assert.ok(failed.error, "a failed mission must carry an honest error line");
  assert.equal(failed.result, null);
  assert.ok(failed.events.some((event) => event.type === "mission.failed"));

  const cancelled = FIXTURE_MISSIONS.find((mission) => mission.status === "cancelled");
  assert.equal(cancelled.result, null);
  assert.ok(cancelled.cancellation, "cancellation is recorded on the mission");
  assert.ok(cancelled.events.some((event) => event.type === "mission.cancelled"));
});

test("every fixture mission is well formed against the domain model", () => {
  for (const mission of FIXTURE_MISSIONS) {
    assert.ok(MISSION_KIND_KEYS.includes(mission.kind), `${mission.id} kind is not canonical`);
    assert.ok(isValidStatus(mission.status), `${mission.id} status is not canonical`);
    assert.ok(agentBySlug(mission.leadSlug), `${mission.id} lead is not in the catalog`);

    const stages = stagesForKind(mission.kind);
    assert.ok(stages.includes(mission.currentStage), `${mission.id} stage is off-sequence`);
    for (const reached of mission.reached) {
      assert.ok(stages.includes(reached), `${mission.id} reached an unknown stage`);
    }

    for (const event of mission.events) {
      assert.ok(isKnownEventType(event.type), `${mission.id} uses an unknown event type`);
      assert.ok(agentBySlug(event.actor?.agent ?? mission.leadSlug));
    }

    assert.equal(
      stageChipsFrom(mission).filter((chip) => chip.on).length,
      mission.reached.length
    );
  }
});

test("agent identities keep the reference colours", () => {
  assert.equal(Object.keys(AGENT_COLORS).length, 8);

  for (const agent of AGENTS) {
    assert.ok(AGENT_COLORS[agent.name], `${agent.name} has no colour`);
    assert.ok(agent.capabilities.required.length > 0);
    assert.ok(agent.actionCeiling && agent.role && agent.slug);
  }

  assert.equal(FLEET.coordinator, "JARVIS");
  assert.deepEqual(
    FLEET.members.map((member) => member.slug),
    ["scout", "forge", "sage"]
  );
});

test("the armory fixture covers every tool state the shelf must show", () => {
  const byId = new Map(FIXTURE_TOOLS.map((tool) => [tool.id, tool]));

  assert.equal(byId.get("forge.internal.workspace_snapshot").status, "connected");
  assert.equal(byId.get("forge.internal.workspace_snapshot").review, "trusted read");
  assert.equal(byId.get("research.web_search").level, "read");
  assert.equal(byId.get("artifact.create").level, "draft");
  assert.equal(byId.get("social.publish_post").level, "execute");
  assert.equal(byId.get("social.publish_post").review, "operator confirmation");
  assert.equal(byId.get("gmail.create_draft").status, "waiting");
  assert.equal(byId.get("analytics.channel_report").status, "setup");
  assert.equal(byId.get("github.create_pr").status, "unavailable");
  assert.equal(byId.get("remote.unknown_tool").review, "always reviewed");
});

test("fixtures are labelled as fixtures", () => {
  assert.match(FIXTURE_NOTICE, /fixture/i);
  assert.match(FIXTURE_NOTICE, /no runtime/i);
});
