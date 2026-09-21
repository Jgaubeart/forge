import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AGENTS,
  AGENT_COLORS,
  FLEET,
  FIXTURE_MISSIONS,
  FIXTURE_NOTICE,
  FIXTURE_TOOLS,
} from "../lib/jarvis-fixtures/index.js";

test("the fixture set covers every mission state the dock has to show", () => {
  const statuses = new Set(FIXTURE_MISSIONS.map((mission) => mission.status));

  for (const status of ["running", "awaiting_confirm", "done", "error", "cancelled"]) {
    assert.ok(statuses.has(status), `no fixture mission in state ${status}`);
  }
});

test("the running fleet fixture shows a coordinated three-agent team", () => {
  const fleet = FIXTURE_MISSIONS.find(
    (mission) => mission.kind.key === "fleet" && mission.status === "running"
  );

  assert.ok(fleet, "no running fleet mission");
  assert.equal(fleet.lead, "JARVIS");
  assert.deepEqual(
    fleet.team.map((worker) => worker.name),
    ["SCOUT", "FORGE", "SAGE"]
  );
  assert.ok(fleet.events.length >= 4, "fleet fixture needs a real feed");
  assert.ok(
    fleet.team.filter((worker) => worker.state === "active").length >= 1,
    "at least one worker should be active"
  );
  assert.ok(
    fleet.team.some((worker) => worker.state !== "active"),
    "idle workers must stay idle rather than all reading as running"
  );
});

test("a single-agent mission fixture exists alongside the fleet", () => {
  const single = FIXTURE_MISSIONS.find((mission) => mission.team.length === 0 && mission.status === "running");
  assert.ok(single, "no single-agent mission fixture");
  assert.equal(single.kind.key, "buildapp");
  assert.deepEqual(single.stages, ["SCAFFOLD", "CODE", "TEST", "LAUNCH"]);
});

test("the confirmation fixture carries the exact staged action", () => {
  const pending = FIXTURE_MISSIONS.find((mission) => mission.status === "awaiting_confirm");

  assert.ok(pending?.approval, "no awaiting_confirm fixture");
  assert.equal(pending.approval.state, "pending");
  assert.equal(pending.approval.fixture, true);
  assert.ok(pending.approval.args.length >= 2, "staged arguments must be visible");
  assert.match(pending.approval.args.join(" "), /platform: twitter/);
  assert.ok(pending.approval.expires);
});

test("structured results exist for the reference result kinds", () => {
  const kinds = new Set(
    FIXTURE_MISSIONS.filter((mission) => mission.result).map(
      (mission) => mission.result.kind
    )
  );

  for (const kind of ["fleet", "warroom", "reaper", "announce"]) {
    assert.ok(kinds.has(kind), `no structured result fixture for ${kind}`);
  }

  const fleet = FIXTURE_MISSIONS.find((mission) => mission.result?.kind === "fleet");
  assert.ok(fleet.result.sections.scout);
  assert.ok(fleet.result.sections.forge);
  assert.ok(fleet.result.sections.sage);
});

test("the failed and cancelled fixtures explain themselves without claiming success", () => {
  const failed = FIXTURE_MISSIONS.find((mission) => mission.status === "error");
  assert.ok(failed.error, "a failed mission must carry an honest error line");
  assert.equal(failed.result, null);
  assert.ok(
    failed.events.some((event) => event.kind === "error"),
    "a failed mission must show the error event"
  );

  const cancelled = FIXTURE_MISSIONS.find((mission) => mission.status === "cancelled");
  assert.equal(cancelled.result, null);
  assert.equal(cancelled.cancelable, false);
});

test("agent identities keep the reference colours", () => {
  assert.deepEqual(Object.keys(AGENT_COLORS).sort(), [
    "FORGE",
    "HATERS",
    "HERALD",
    "JARVIS",
    "REAPER",
    "SAGE",
    "SCOUT",
    "WARROOM",
  ]);

  for (const agent of AGENTS) {
    assert.ok(AGENT_COLORS[agent.name], `${agent.name} has no colour`);
    assert.ok(agent.capability && agent.level && agent.role);
  }

  assert.equal(FLEET.coordinator, "JARVIS");
  assert.deepEqual(
    FLEET.members.map((member) => member.name),
    ["SCOUT", "FORGE", "SAGE"]
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
  assert.equal(byId.get("github.create_pr").available, false);
  assert.equal(byId.get("remote.unknown_tool").review, "always reviewed");
});

test("fixtures are labelled as fixtures", () => {
  assert.match(FIXTURE_NOTICE, /fixture/i);
  assert.match(FIXTURE_NOTICE, /no runtime/i);
});
