import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import {
  AGENTS,
  AGENT_SLUGS,
  CAPABILITY_STATE,
  FLEET,
  FLEET_BEHAVIOR_CONTRACT,
  MISSION_ROUTES,
  WORK_ROUTES,
  agentBySlug,
  agentsForMissionKind,
  missionKinds,
  routeForMissionKind,
  routeForWork,
} from "../lib/forge/agents/index.js";

const read = (relative) =>
  readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

const REFERENCE_AGENTS = [
  "JARVIS",
  "SCOUT",
  "FORGE",
  "SAGE",
  "REAPER",
  "WARROOM",
  "HERALD",
  "HATERS",
];

const REFERENCE_COLORS = {
  jarvis: "#34d399",
  scout: "#62dbff",
  forge: "#f4a93a",
  sage: "#b58cff",
  reaper: "#f4a93a",
  warroom: "#62dbff",
  herald: "#f4a93a",
  haters: "#ff7d6b",
};

test("exactly the expected Jarvis agents are defined", () => {
  assert.deepEqual(
    AGENTS.map((agent) => agent.name).sort(),
    [...REFERENCE_AGENTS].sort()
  );
});

test("slugs are stable, unique, and lowercase", () => {
  assert.equal(new Set(AGENT_SLUGS).size, AGENT_SLUGS.length);
  for (const slug of AGENT_SLUGS) {
    assert.match(slug, /^[a-z][a-z0-9-]*$/);
    assert.ok(agentBySlug(slug), `agentBySlug cannot resolve ${slug}`);
  }
});

test("every agent carries the required fields", () => {
  for (const agent of AGENTS) {
    for (const field of [
      "slug",
      "name",
      "role",
      "department",
      "glyph",
      "color",
      "summary",
      "instructions",
      "actionCeiling",
      "missionKinds",
      "capabilityState",
      "capabilityNote",
    ]) {
      assert.ok(agent[field], `${agent.slug} is missing ${field}`);
    }

    assert.equal(typeof agent.delegationAllowed, "boolean");
    assert.ok(["read", "draft", "execute"].includes(agent.actionCeiling));
    assert.ok(agent.capabilities.required.length > 0);
    assert.ok(agent.instructions.length > 300, `${agent.slug} prompt looks thin`);
    assert.ok(
      Object.values(CAPABILITY_STATE).includes(agent.capabilityState),
      `${agent.slug} has an unknown capability state`
    );
  }
});

test("agent colours match the reference identity system", () => {
  for (const agent of AGENTS) {
    assert.equal(
      agent.color.toLowerCase(),
      REFERENCE_COLORS[agent.slug],
      `${agent.slug} colour drifted from the reference`
    );
  }
});

test("the Fleet is SCOUT + FORGE + SAGE, led by JARVIS, in order", () => {
  assert.equal(FLEET.lead, "jarvis");
  assert.deepEqual(
    FLEET.members.map((member) => member.slug),
    ["scout", "forge", "sage"]
  );
  assert.deepEqual(
    FLEET.members.map((member) => member.role),
    ["recon", "maker", "critic"]
  );
  assert.deepEqual(
    FLEET.members.map((member) => member.order),
    [1, 2, 3]
  );
  for (const member of FLEET.members) {
    assert.ok(agentBySlug(member.slug), `${member.slug} is not in the catalog`);
  }
  assert.ok(FLEET_BEHAVIOR_CONTRACT.steps.length >= 6);
  assert.match(FLEET_BEHAVIOR_CONTRACT.rules.join(" "), /subset/);
});

test("mission routing resolves to agents that exist", () => {
  for (const route of MISSION_ROUTES) {
    assert.ok(agentBySlug(route.agent), `${route.kind} routes to an unknown agent`);
    if (route.fleet) assert.equal(route.fleet, FLEET.slug);
    assert.equal(routeForMissionKind(route.kind).agent, route.agent);
  }

  assert.equal(routeForMissionKind("fleet").fleet, "the-fleet");
  assert.equal(routeForMissionKind("buildapp").agent, "forge");
  assert.equal(routeForMissionKind("reaper").agent, "reaper");
  assert.equal(routeForMissionKind("warroom").agent, "warroom");
  assert.equal(routeForMissionKind("announce").agent, "herald");
  assert.equal(routeForMissionKind("haters").agent, "haters");
  assert.equal(routeForMissionKind("general").agent, "jarvis");
  assert.equal(routeForMissionKind("nonsense"), null);

  assert.equal(routeForWork("research").agent, "scout");
  assert.equal(routeForWork("build").agent, "forge");
  assert.equal(routeForWork("review").agent, "sage");
  for (const route of WORK_ROUTES) {
    assert.ok(agentBySlug(route.agent));
  }

  assert.deepEqual(agentsForMissionKind("fleet").map((a) => a.slug), [
    "jarvis",
    "scout",
    "forge",
    "sage",
  ]);
  assert.ok(missionKinds().includes("fleet"));
});

test("the reference boundaries survive in the ported instructions", () => {
  const byslug = Object.fromEntries(AGENTS.map((agent) => [agent.slug, agent.instructions]));

  assert.match(byslug.jarvis, /never claim an action happened/i);
  assert.match(byslug.jarvis, /credentials/i);
  assert.match(byslug.scout, /read-only/i);
  assert.match(byslug.forge, /final message IS the artifact/i);
  assert.match(byslug.sage, /NEXT ACTIONS/);
  assert.match(byslug.reaper, /read-only/i);
  assert.match(byslug.reaper, /confirm/i);
  assert.match(byslug.warroom, /read-only/i);
  assert.match(byslug.herald, /approval|approve/i);
  assert.match(byslug.haters, /receipt/i);

  for (const instructions of Object.values(byslug)) {
    for (const forbidden of ["local filesystem", "shell", "codex", "launch script"]) {
      assert.equal(
        instructions.toLowerCase().includes(forbidden),
        false,
        `instructions still reference desktop-only detail: ${forbidden}`
      );
    }
  }
});

test("fixtures reference catalog slugs instead of duplicating agent metadata", async () => {
  const fixtureDir = new URL("../lib/jarvis-fixtures/", import.meta.url);
  const sources = readdirSync(fixtureDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => readFileSync(new URL(name, fixtureDir), "utf8"))
    .join("\n");

  // No hardcoded colours in the fixture layer — colours come from the catalog.
  assert.equal(/#[0-9a-f]{6}/i.test(sources), false, "fixtures duplicate agent colours");

  // Mission fixtures resolve their lead, team, and feed actors through slugs.
  const missions = read("lib/jarvis-fixtures/missions.js");
  assert.match(missions, /leadSlug:/);
  assert.match(missions, /agentSlug:/);
  assert.equal(/lead:\s*"/.test(missions), false, "fixtures still hardcode a lead name");
  assert.equal(/\{ name: "SCOUT"/.test(missions), false, "fixtures still hardcode worker names");

  const { FIXTURE_MISSIONS } = await import("../lib/jarvis-fixtures/missions.js");
  for (const mission of FIXTURE_MISSIONS) {
    assert.ok(agentBySlug(mission.leadSlug), `${mission.id} has an unknown lead slug`);
    for (const worker of mission.team) {
      assert.ok(agentBySlug(worker.slug), `${mission.id} has an unknown worker slug`);
    }
    for (const event of mission.events) {
      assert.ok(agentBySlug(event.agentSlug), `${mission.id} has an unknown event agent`);
    }
  }
});

test("the catalog stays free of runtime, database, and network references", () => {
  // Comments may talk about Hermes and Supabase (they explain what comes later);
  // what matters is that no code imports or calls them.
  const sources = ["catalog.js", "fleet.js", "routing.js", "index.js"]
    .map((name) => read(`lib/forge/agents/${name}`))
    .map((source) =>
      source
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n")
    )
    .join("\n")
    .toLowerCase();

  for (const forbidden of [
    "supabase",
    "hermes",
    "createclient",
    "fetch(",
    "process.env",
    "node:fs",
    "require(",
  ]) {
    assert.equal(
      sources.includes(forbidden),
      false,
      `agent catalog must not reference ${forbidden}`
    );
  }
});

test("the UI reads agent identity from the catalog", () => {
  const sigil = read("components/jarvis/agent-sigil.js");
  assert.match(sigil, /from "@\/lib\/forge\/agents"/);

  const fixtures = read("lib/jarvis-fixtures/agents.js");
  assert.match(fixtures, /from "\.\.\/forge\/agents\/index\.js"/);
  assert.equal(
    /#[0-9a-f]{6}/i.test(fixtures),
    false,
    "the fixture alias layer must not restate agent colours"
  );
});
