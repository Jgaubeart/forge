import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import {
  ACTION_LANGUAGE,
  APPROVAL_STATE,
  MALFORMED_RESULT,
  MISSION_EVENT,
  MISSION_EVENT_TYPES,
  MISSION_KINDS,
  MISSION_KIND_KEYS,
  MISSION_STATUS,
  MISSION_STATUSES,
  actionLanguage,
  allowedTransitions,
  appendMissionEvent,
  assertHonestClaim,
  canTransitionMission,
  cancelMission,
  completeMission,
  composeFleetResult,
  consumeApproval,
  consumeMissionApproval,
  createApproval,
  createMission,
  createMissionEvent,
  decideApproval,
  describeEvent,
  eventTone,
  failMission,
  fleetCoverage,
  isActiveMission,
  isTerminalMission,
  missionKind,
  normalizeResult,
  normalizeEventType,
  requestApproval,
  resolveApproval,
  setMissionStage,
  stagesForKind,
  startMission,
  toolLabel,
  validateAnnounceResult,
  validateBuildResult,
  validateFleetResult,
  validateHatersResult,
  validateReaperResult,
  validateWarroomResult,
} from "../lib/forge/missions/index.js";
import { FIXTURE_MISSIONS } from "../lib/jarvis-fixtures/index.js";

const at = (minutes) => new Date(Date.UTC(2026, 8, 21, 13, minutes)).toISOString();
const read = (relative) =>
  readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

// 1 ---------------------------------------------------------------------------
test("the mission catalog holds the reference mission families", () => {
  assert.deepEqual([...MISSION_KIND_KEYS].sort(), [
    "announce",
    "buildapp",
    "fleet",
    "general",
    "haters",
    "reaper",
    "warroom",
  ]);

  const fleet = missionKind("fleet");
  assert.equal(fleet.title, "THE FLEET");
  assert.equal(fleet.icon, "⚔️");
  assert.equal(fleet.leadAgent, "jarvis");
  assert.equal(fleet.fleet, "the-fleet");
  assert.equal(fleet.brief.required, true);

  // The reference's NEEDS_BRIEF set is preserved; `general` is Forge's
  // open-ended coordination kind and also requires a brief.
  assert.deepEqual(
    MISSION_KINDS.filter((kind) => kind.brief.required).map((kind) => kind.kind).sort(),
    ["announce", "buildapp", "fleet", "general"]
  );
  assert.equal(missionKind("reaper").brief.required, false);
  assert.equal(missionKind("warroom").requiresConfirmation, false);
  assert.equal(missionKind("announce").requiresConfirmation, true);
  assert.equal(missionKind("nonsense"), null);
});

// 2 ---------------------------------------------------------------------------
test("creating a mission initialises the model without side effects", () => {
  const created = createMission({
    id: "m-test",
    kind: "fleet",
    brief: "Launch the workshop",
    at: at(0),
  });

  assert.equal(created.ok, true);
  const mission = created.mission;

  assert.equal(mission.status, MISSION_STATUS.queued);
  assert.equal(mission.currentStage, stagesForKind("fleet")[0]);
  assert.deepEqual(mission.reached, [stagesForKind("fleet")[0]]);
  assert.equal(mission.events.length, 1);
  assert.equal(mission.events[0].type, MISSION_EVENT.missionCreated);
  assert.equal(mission.leadSlug, "jarvis");
  assert.equal(mission.fleet, "the-fleet");
  assert.equal(mission.approval, null);
  assert.equal(mission.result, null);
  assert.equal(mission.team.length, 0);
  assert.equal(mission.title, "THE FLEET — Launch the workshop");

  // Kind and brief are validated.
  assert.equal(createMission({ kind: "teleport" }).reason, "unknown_kind");
  assert.equal(createMission({ kind: "fleet", brief: "  " }).reason, "brief_required");
  assert.equal(
    createMission({ kind: "warroom", brief: "x".repeat(500) }).reason,
    "brief_too_long"
  );
  // Kinds that do not need a brief can still be created without one.
  assert.equal(createMission({ kind: "warroom", at: at(0) }).ok, true);
});

// 3 ---------------------------------------------------------------------------
test("valid lifecycle transitions are allowed", () => {
  const pairs = [
    ["queued", "planning"],
    ["queued", "running"],
    ["planning", "running"],
    ["running", "waiting_approval"],
    ["waiting_approval", "running"],
    ["running", "completed"],
    ["running", "failed"],
    ["queued", "cancelled"],
    ["running", "cancelled"],
    ["waiting_approval", "cancelled"],
  ];

  for (const [from, to] of pairs) {
    assert.equal(canTransitionMission(from, to), true, `${from} → ${to} should be allowed`);
  }
});

// 4 ---------------------------------------------------------------------------
test("nonsensical lifecycle transitions are refused", () => {
  const pairs = [
    ["completed", "running"],
    ["completed", "planning"],
    ["cancelled", "running"],
    ["failed", "running"],
    ["queued", "completed"],
    ["queued", "waiting_approval"],
    ["planning", "completed"],
  ];

  for (const [from, to] of pairs) {
    assert.equal(canTransitionMission(from, to), false, `${from} → ${to} must be refused`);
  }

  assert.equal(canTransitionMission("running", "nonsense"), false);
  assert.equal(canTransitionMission("nonsense", "running"), false);
});

// 5 ---------------------------------------------------------------------------
test("terminal states stay terminal", () => {
  for (const status of MISSION_STATUSES) {
    const terminal = ["completed", "failed", "cancelled"].includes(status);
    assert.equal(isTerminalMission(status), terminal);
    assert.equal(isActiveMission(status), !terminal);
    assert.equal(allowedTransitions(status).length, terminal ? 0 : allowedTransitions(status).length);
  }

  // Reference names still resolve.
  assert.equal(isTerminalMission("done"), true);
  assert.equal(isTerminalMission("error"), true);
  assert.equal(isActiveMission("awaiting_confirm"), true);
});

// 6 ---------------------------------------------------------------------------
test("each mission kind has its own stage sequence", () => {
  assert.deepEqual(stagesForKind("fleet"), [
    "queued",
    "recon",
    "draft",
    "critique",
    "assemble",
    "done",
  ]);
  assert.deepEqual(stagesForKind("buildapp"), ["SCAFFOLD", "CODE", "TEST", "LAUNCH"]);
  assert.deepEqual(stagesForKind("reaper"), [
    "queued",
    "inspect",
    "ledger",
    "confirm",
    "execute",
    "done",
  ]);
  assert.deepEqual(stagesForKind("warroom"), ["queued", "connect", "pull", "report", "done"]);
  assert.deepEqual(stagesForKind("announce"), ["queued", "draft", "confirm", "execute", "done"]);
  assert.deepEqual(stagesForKind("haters"), [
    "queued",
    "read",
    "draft",
    "confirm",
    "execute",
    "done",
  ]);

  const sequences = new Set(
    ["fleet", "buildapp", "reaper", "warroom", "announce", "haters"].map((kind) =>
      stagesForKind(kind).join(">")
    )
  );
  assert.equal(sequences.size, 6, "stage sequences must differ by kind");
});

// 7 ---------------------------------------------------------------------------
test("fleet stages advance in order and cannot be skipped", () => {
  let mission = createMission({ kind: "fleet", brief: "Launch", at: at(0) }).mission;
  mission = startMission(mission, { at: at(1) }).mission;

  assert.equal(setMissionStage(mission, "critique").ok, false, "cannot skip recon/draft");

  mission = setMissionStage(mission, "recon").mission;
  assert.deepEqual(mission.reached, ["queued", "recon"]);

  mission = setMissionStage(mission, "draft").mission;
  mission = setMissionStage(mission, "critique").mission;
  mission = setMissionStage(mission, "assemble").mission;
  mission = setMissionStage(mission, "done").mission;

  assert.equal(mission.currentStage, "done");
  assert.equal(
    mission.events.filter((event) => event.type === MISSION_EVENT.missionStageChanged).length,
    5
  );
});

// 8 ---------------------------------------------------------------------------
test("the event vocabulary is canonical and sanitised", () => {
  for (const type of MISSION_EVENT_TYPES) {
    const created = createMissionEvent({ type, at: at(0), metadata: { tool: "x" } });
    assert.equal(created.ok, true, `${type} should be a known event`);
  }

  // Reference event kinds map onto canonical types.
  assert.equal(normalizeEventType("spawn"), MISSION_EVENT.agentStarted);
  assert.equal(normalizeEventType("stage"), MISSION_EVENT.missionStageChanged);
  assert.equal(normalizeEventType("tool"), MISSION_EVENT.toolRequested);
  assert.equal(normalizeEventType("done"), MISSION_EVENT.agentCompleted);
  assert.equal(normalizeEventType("error"), MISSION_EVENT.missionFailed);
  assert.equal(normalizeEventType("nonsense"), null);
  assert.equal(createMissionEvent({ type: "nonsense" }).ok, false);

  // Nested values never reach an event, so a credential cannot ride along.
  const event = createMissionEvent({
    type: MISSION_EVENT.toolRequested,
    metadata: { tool: "gmail.create_draft", args: { token: "sk-live-x" } },
  }).event;
  assert.equal(event.metadata.args, undefined);
  assert.equal(eventTone(MISSION_EVENT.approvalRequested), "wait");
  assert.equal(eventTone(MISSION_EVENT.missionFailed), "err");
});

test("event labels are deterministic operator language", () => {
  assert.equal(
    describeEvent({ type: MISSION_EVENT.agentStarted, metadata: { work: "recon" } }, { agentName: "SCOUT" }),
    "SCOUT began recon"
  );
  assert.equal(
    describeEvent({ type: MISSION_EVENT.toolRequested, metadata: { tool: "gmail.create_draft" } }, { agentName: "HERALD" }),
    "HERALD drafting…"
  );
  assert.equal(
    describeEvent({ type: MISSION_EVENT.approvalRequested }, { agentName: "JARVIS" }),
    "Awaiting confirmation"
  );
  assert.equal(toolLabel("research.web_search").phrase, "searching");
  assert.equal(toolLabel("social.publish_post").mutating, true);
});

test("events in one mission always have unique ids", () => {
  let mission = createMission({ kind: "fleet", brief: "Launch", at: at(0) }).mission;
  mission = startMission(mission, { at: at(1) }).mission;

  // Same type, same timestamp, three times — the case that produced duplicate
  // React keys before ids were made unique on append.
  for (let i = 0; i < 3; i += 1) {
    mission = appendMissionEvent(
      mission,
      createMissionEvent({ type: MISSION_EVENT.agentAssigned, at: at(2), actorAgent: "scout" })
        .event
    );
  }

  const ids = mission.events.map((event) => event.id);
  assert.equal(new Set(ids).size, ids.length, "event ids must be unique");

  for (const fixture of FIXTURE_MISSIONS) {
    const fixtureIds = fixture.events.map((event) => event.id);
    assert.equal(
      new Set(fixtureIds).size,
      fixtureIds.length,
      `${fixture.id} has duplicate event ids`
    );
  }
});

// 9 ---------------------------------------------------------------------------
test("approval parks the mission in waiting_approval with a staged action", () => {
  const created = createApproval({
    id: "ap-1",
    tool: "social.publish_post",
    capability: "social.publish",
    destination: "twitter",
    requestedBy: "herald",
    expiresAt: at(60),
    args: { platform: "twitter", text: "hello" },
    now: at(0),
  });
  assert.equal(created.ok, true);

  let mission = createMission({ kind: "announce", brief: "Announce it", at: at(0) }).mission;
  mission = startMission(mission, { at: at(1) }).mission;
  mission = requestApproval(mission, { approval: created.approval, at: at(2) }).mission;

  assert.equal(mission.status, MISSION_STATUS.waitingApproval);
  assert.equal(mission.approval.state, APPROVAL_STATE.pending);
  assert.equal(mission.approval.payloadFingerprint, JSON.stringify(mission.approval.args));
  assert.ok(
    mission.events.some((event) => event.type === MISSION_EVENT.approvalRequested)
  );

  // A second staged action cannot be attached while one is pending.
  assert.equal(
    requestApproval(mission, { approval: created.approval, at: at(3) }).reason,
    "approval_already_pending"
  );

  const approved = resolveApproval(mission, "approved", { at: at(4), by: "operator" });
  assert.equal(approved.mission.status, MISSION_STATUS.running);
  assert.equal(approved.mission.approval.state, APPROVAL_STATE.approved);

  const denied = resolveApproval(mission, "denied", { at: at(4), by: "operator" });
  assert.equal(denied.mission.approval.state, APPROVAL_STATE.denied);
  assert.ok(denied.mission.events.some((event) => event.type === MISSION_EVENT.approvalDenied));
});

// 10 --------------------------------------------------------------------------
test("an approval is single-use and cannot be reused", () => {
  const approval = createApproval({
    id: "ap-2",
    tool: "comments.reply",
    capability: "comments.reply",
    requestedBy: "haters",
    expiresAt: at(60),
    args: { comment_id: "UgxK1", reply: "thanks" },
    now: at(0),
  }).approval;

  const approved = decideApproval(approval, "approved", { at: at(1), by: "operator" }).approval;
  const first = consumeApproval(approved, { at: at(2) });
  assert.equal(first.ok, true);
  assert.equal(first.stagedArgs.comment_id, "UgxK1");

  const second = consumeApproval(first.approval, { at: at(3) });
  assert.equal(second.ok, false);
  assert.equal(second.reason, "already_consumed");

  // Pending or denied approvals cannot be consumed at all.
  assert.equal(consumeApproval(approval).reason, "not_approved");
  const denied = decideApproval(approval, "denied", { at: at(1) }).approval;
  assert.equal(consumeApproval(denied).reason, "not_approved");

  // An expired approval cannot be approved either.
  const late = createApproval({
    id: "ap-3",
    tool: "comments.reply",
    capability: "comments.reply",
    expiresAt: at(1),
    args: {},
  }).approval;
  assert.equal(decideApproval(late, "approved", { at: at(30) }).reason, "expired");

  // And the mission-level consumption keeps the same guarantee.
  let mission = createMission({ kind: "haters", at: at(0) }).mission;
  mission = startMission(mission, { at: at(1) }).mission;
  mission = requestApproval(mission, { approval, at: at(2) }).mission;
  mission = resolveApproval(mission, "approved", { at: at(3) }).mission;
  const consumed = consumeMissionApproval(mission, { at: at(4) });
  assert.equal(consumed.ok, true);
  assert.equal(consumeMissionApproval(consumed.mission, { at: at(5) }).reason, "already_consumed");
});

// 11 --------------------------------------------------------------------------
test("cancellation is terminal and preserves prior events and partial work", () => {
  let mission = createMission({ kind: "reaper", at: at(0) }).mission;
  mission = startMission(mission, { at: at(1) }).mission;
  mission = setMissionStage(mission, "inspect").mission;
  const before = mission.events.length;

  const cancelled = cancelMission(mission, { at: at(2), by: "operator", reason: "stop" });
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.mission.status, MISSION_STATUS.cancelled);
  assert.equal(isTerminalMission(cancelled.mission.status), true);
  assert.equal(cancelled.mission.events.length, before + 1);
  assert.ok(
    cancelled.mission.events.some((event) => event.type === MISSION_EVENT.missionCancelled)
  );
  assert.equal(cancelled.mission.cancellation.reason, "stop");

  // Cancelling again, or transitioning out of it, is refused.
  assert.equal(cancelMission(cancelled.mission, { at: at(3) }).reason, "not_active");
  assert.equal(canTransitionMission(cancelled.mission.status, "running"), false);

  // A completed mission cannot be cancelled either.
  const done = createMission({ kind: "warroom", at: at(0) }).mission;
  assert.equal(cancelMission({ ...done, status: "completed" }).reason, "not_active");
});

// 12–16 ----------------------------------------------------------------------
test("result contracts validate each mission kind's real shape", () => {
  const fleet = validateFleetResult({
    summary: "done",
    sections: { scout: "recon", forge: "draft", sage: "critique" },
  });
  assert.equal(fleet.ok, true);
  assert.deepEqual(Object.keys(fleet.value.sections).sort(), ["forge", "sage", "scout"]);

  const build = validateBuildResult({ summary: "A standup timer", artifact: { type: "plan" } });
  assert.equal(build.ok, true);
  assert.equal(build.value.artifact.type, "plan");
  assert.equal(validateBuildResult({}).ok, false);

  const reaper = validateReaperResult({
    subs: [{ name: "Figma", amount_monthly: "15", cadence: "monthly", last_seen: "2026-09-02" }],
  });
  assert.equal(reaper.ok, true);
  assert.equal(reaper.value.subs[0].amount_monthly, 15);
  assert.equal(reaper.value.total_monthly, 15, "total is derived when missing");
  assert.equal(validateReaperResult({ subs: [{ name: "Figma" }] }).ok, false);

  const warroom = validateWarroomResult({
    headline: "Up",
    stats: { views_24h: 10 },
    videos: [{ title: "v", views: 3 }],
    comments: [{ author: "a", text: "hi" }],
  });
  assert.equal(warroom.ok, true);
  assert.equal(warroom.value.stats.views_24h, 10);
  assert.equal(warroom.value.stats.subs, null);
  assert.equal(validateWarroomResult({}).ok, false);

  const announce = validateAnnounceResult({
    posts: [{ platform: "twitter", text: "hi" }],
  });
  assert.equal(announce.ok, true);
  assert.equal(announce.value.posts[0].state, "draft");
  assert.equal(validateAnnounceResult({ posts: [{ platform: "twitter" }] }).ok, false);

  const haters = validateHatersResult({
    items: [{ author: "a", comment: "c", comment_id: "id1", video_id: "v1", reply: "r" }],
  });
  assert.equal(haters.ok, true);
  assert.equal(haters.value.items[0].replyState, "draft");
  assert.equal(validateHatersResult({ items: [{ author: "a" }] }).ok, false);
});

test("a result can never claim provider completion without a receipt", () => {
  const claimed = validateAnnounceResult({
    posts: [{ platform: "twitter", text: "hi", state: "published" }],
  });
  assert.equal(claimed.value.posts[0].state, "draft", "no receipt means draft");

  const withReceipt = validateAnnounceResult({
    posts: [{ platform: "twitter", text: "hi", state: "published", receiptId: "rcpt-1" }],
  });
  assert.equal(withReceipt.value.posts[0].state, "published");

  const replies = validateHatersResult({
    items: [{ comment: "c", reply: "r", replyState: "confirmed" }],
  });
  assert.equal(replies.value.items[0].replyState, "draft");
});

// 17 --------------------------------------------------------------------------
test("malformed results fail safely instead of crashing the UI", () => {
  assert.equal(normalizeResult("fleet", null), MALFORMED_RESULT);
  assert.equal(normalizeResult("reaper", { subs: "not-an-array" }), MALFORMED_RESULT);
  assert.equal(normalizeResult("warroom", { stats: [] }), MALFORMED_RESULT);
  assert.equal(normalizeResult("unknown-type", {}), MALFORMED_RESULT);
  assert.equal(MALFORMED_RESULT.kind, "malformed");
  assert.match(MALFORMED_RESULT.note, /could not be read safely/i);

  // A valid one still passes through untouched.
  assert.equal(normalizeResult("build", { summary: "ok" }).kind, "build");
});

test("fleet composition keeps missing and failed workers visible", () => {
  const partial = composeFleetResult({
    brief: "Launch",
    contributions: { scout: "recon memo", forge: "draft" },
    failures: {},
  });

  assert.equal(partial.ok, true);
  assert.deepEqual(partial.coverage.missing, ["sage"]);
  assert.deepEqual(partial.coverage.failed, []);
  assert.equal(partial.result.sections.sage, undefined, "nothing is fabricated for SAGE");
  assert.equal(partial.result.sections.scout, "recon memo");

  const withFailure = composeFleetResult({
    brief: "Launch",
    contributions: { scout: "recon" },
    failures: { forge: "provider unavailable" },
  });
  assert.deepEqual(withFailure.coverage.failed, ["forge"]);
  assert.equal(withFailure.result.failed[0].reason, "provider unavailable");
  assert.equal(fleetCoverage(withFailure.result).complete, false);

  const complete = composeFleetResult({
    brief: "Launch",
    contributions: { scout: "a", forge: "b", sage: "c" },
  });
  assert.equal(complete.coverage.complete, true);
  assert.equal(fleetCoverage(complete.result).complete, true);
});

test("honest action language is deterministic", () => {
  assert.equal(actionLanguage({ state: "draft" }).text, ACTION_LANGUAGE.prepared);
  assert.equal(actionLanguage({ state: "draft" }).mayClaimCompletion, false);
  assert.equal(actionLanguage({ state: "pending" }).text, ACTION_LANGUAGE.awaiting);
  assert.match(actionLanguage({ state: "accepted" }).text, /check the receipt/i);
  assert.equal(actionLanguage({ state: "accepted", receiptId: "rcpt" }).mayClaimCompletion, true);

  assert.throws(() => assertHonestClaim("Published to Twitter"), /provider receipt/i);
  assert.equal(assertHonestClaim("Draft prepared"), true);
  assert.equal(assertHonestClaim("Published to Twitter", { receiptId: "rcpt-1" }), true);
});

// 18 --------------------------------------------------------------------------
test("fixtures are generated through the mission model", () => {
  const source = read("lib/jarvis-fixtures/missions.js");

  for (const fn of ["createMission", "startMission", "setMissionStage", "requestApproval"]) {
    assert.match(source, new RegExp(fn), `fixtures should use ${fn}`);
  }
  assert.equal(
    /status:\s*"(running|done|error|awaiting_confirm)"/.test(source),
    false,
    "fixtures must not hand-write statuses"
  );
  assert.equal(
    /{ ts:.*kind: "spawn"/.test(source),
    false,
    "fixtures must use the canonical event vocabulary"
  );

  for (const mission of FIXTURE_MISSIONS) {
    assert.equal(typeof mission.currentStage, "string");
    assert.ok(mission.events.every((event) => event.id && event.type && event.at));
  }
});

// 19–20 ----------------------------------------------------------------------
test("the mission domain stays free of Hermes, Supabase, and network work", () => {
  const dir = new URL("../lib/forge/missions/", import.meta.url);
  const sources = readdirSync(dir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => readFileSync(new URL(name, dir), "utf8"))
    .join("\n")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
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
    "insert(",
    "update(",
  ]) {
    assert.equal(
      sources.includes(forbidden),
      false,
      `mission domain must not reference ${forbidden}`
    );
  }
});

test("the mission domain does not touch the database or the filesystem", () => {
  const files = readdirSync(new URL("../lib/forge/missions/", import.meta.url));
  assert.equal(
    files.some((name) => name.includes("migration") || name.includes("sql")),
    false
  );

  const mission = read("lib/forge/missions/mission.js");
  assert.equal(
    /writeFile|appendFile|createWriteStream/.test(mission),
    false,
    "the mission model must not write to disk"
  );
});

test("mission statuses and stages are separate concepts", () => {
  const mission = createMission({ kind: "fleet", brief: "Launch", at: at(0) }).mission;

  assert.ok(MISSION_STATUSES.includes(mission.status), "status comes from the lifecycle");
  assert.ok(stagesForKind("fleet").includes(mission.currentStage), "stage comes from the kind");
  assert.equal(
    stagesForKind("fleet").join(">") === MISSION_STATUSES.join(">"),
    false,
    "a kind's stages are not the lifecycle status list"
  );
  assert.equal(
    MISSION_STATUSES.includes("recon"),
    false,
    "stages like recon are not lifecycle statuses"
  );
  assert.ok(stagesForKind("fleet").includes("recon"));
});
