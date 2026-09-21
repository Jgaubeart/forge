import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getMissionKind,
  listMissionKinds,
  missionNeedsBrief,
  missionTitle,
} from "../lib/forge/missions/catalog.js";
import {
  FLEET_CREW,
  HATERS_PROMPT,
  HERALD_PROMPT,
  REAPER_PROMPT,
  workerPromptFor,
} from "../lib/forge/missions/prompts.js";

test("the mission catalog keeps the reference kinds and their discipline", () => {
  const kinds = listMissionKinds().map((kind) => kind.key);

  for (const key of ["fleet", "buildapp", "reaper", "warroom", "announce", "haters"]) {
    assert.ok(kinds.includes(key), `${key} mission kind is missing`);
  }

  assert.equal(getMissionKind("fleet").icon, "⚔️");
  assert.equal(getMissionKind("fleet").name, "THE FLEET");
  assert.equal(getMissionKind("reaper").needsBrief, false);
  assert.equal(missionNeedsBrief("announce"), true);
  assert.equal(missionNeedsBrief("warroom"), false);
});

test("mission titles follow the reference naming", () => {
  assert.equal(missionTitle("fleet", ""), "THE FLEET");
  assert.equal(
    missionTitle("fleet", "Launch the workshop"),
    "THE FLEET — Launch the workshop"
  );

  const long = "x".repeat(80);
  assert.equal(missionTitle("reaper", long).endsWith("…"), true);
  assert.equal(missionTitle("nonsense", "brief"), "GENERAL MISSION — brief");
});

test("the fleet crew is SCOUT, FORGE, and SAGE with their roles", () => {
  assert.deepEqual(
    FLEET_CREW.map((entry) => entry.slug),
    ["scout", "forge", "sage"]
  );
  assert.deepEqual(
    FLEET_CREW.map((entry) => entry.role),
    ["recon", "maker", "critic"]
  );

  for (const member of FLEET_CREW) {
    const prompt = member.prompt("Ship the new landing page");
    assert.match(prompt, /Ship the new landing page/);
    assert.match(prompt, /credentials/i);
    assert.match(prompt, /never claim an external action/i);
  }
});

test("worker prompts force read-only work until approval", () => {
  assert.match(REAPER_PROMPT(""), /READ ONLY/i);
  assert.match(HATERS_PROMPT(""), /never invent ids/i);
  assert.match(HERALD_PROMPT("Launch", { platforms: ["twitter"] }), /twitter/);
  assert.match(HERALD_PROMPT("Launch"), /final message is ONLY a ```json fence/i);

  assert.match(workerPromptFor("scout", "brief"), /SCOUT/);
  assert.match(workerPromptFor("forge", "brief"), /FORGE/);
  assert.match(workerPromptFor("sage", "brief"), /NEXT ACTIONS/);
  assert.match(workerPromptFor("unknown-agent", "brief"), /coordinating agent/);
});
