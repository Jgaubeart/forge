import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import { MALFORMED_RESULT, MISSION_EVENT } from "../lib/forge/missions/index.js";
import { approvalRowToDomain, eventDomainToRow, eventRowToDomain, missionDomainToRow, missionRowToDomain } from "../lib/forge/persistence/map.js";
import { createMissionRecord, listMissions } from "../lib/forge/persistence/missions.js";
import { consumeApprovalRecord, decideApprovalRecord, stageApprovalRecord } from "../lib/forge/persistence/approvals.js";
import { createWorkspaceForUser, getMembershipForUser, OWNER_BOOTSTRAP_CAPABILITIES } from "../lib/forge/persistence/workspaces.js";
import { listDurableAgents } from "../lib/forge/persistence/agents.js";
import { createFakeSupabase } from "./helpers/fake-supabase.js";

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

const workspaceRow = (idValue, name = "Korben HQ") => ({
  id: idValue,
  name,
  slug: `${name.toLowerCase().replace(/\s+/g, "-")}-abc123`,
  kind: "business",
  organization_id: null,
});

function twoWorkspaces() {
  const tables = {
    workspaces: [workspaceRow("ws-a"), workspaceRow("ws-b", "Other Co")],
    agents: [
      { id: "agent-jarvis", slug: "jarvis", name: "JARVIS", is_active: true, delegation_enabled: true },
    ],
  };

  return {
    userA: createFakeSupabase({
      userId: "user-a",
      memberships: [{ workspace_id: "ws-a", user_id: "user-a" }],
      tables,
    }),
    userB: createFakeSupabase({
      userId: "user-b",
      memberships: [{ workspace_id: "ws-b", user_id: "user-b" }],
      tables,
    }),
    trusted: createFakeSupabase({ userId: "service", tables, trusted: true }),
  };
}

// 1–4 ------------------------------------------------------------------------
test("a first user can create a workspace, with both memberships and safe capabilities", async () => {
  const tables = {};
  const client = createFakeSupabase({ userId: "user-a", tables });
  // Onboarding always runs with the server's trusted client available, which is
  // what performs the organisation read-back; the double mirrors that.
  const trusted = createFakeSupabase({ userId: "service", tables, trusted: true });

  const created = await createWorkspaceForUser(client, {
    userId: "user-a",
    name: "Korben HQ",
    organizationName: "Korben",
    trustedClient: trusted,
  });

  assert.equal(created.organization.name, "Korben");
  assert.equal(created.workspace.name, "Korben HQ");
  assert.equal(client._db.organization_memberships.length, 1);
  assert.equal(client._db.organization_memberships[0].user_id, "user-a");
  assert.equal(client._db.workspace_memberships.length, 1);
  assert.equal(client._db.workspace_memberships[0].role, "owner");
  assert.equal(created.capabilitiesGranted, true);

  const granted = client._db.membership_capabilities.map((row) => row.capability).sort();
  assert.deepEqual(granted, ["mission.coordinate", "workspace.read"]);

  // Nothing dangerous is granted just for owning a workspace.
  for (const row of client._db.membership_capabilities) {
    assert.equal(row.action_level, "read");
    assert.equal(/send|publish|delete|execute|provider/.test(row.capability), false);
  }
  assert.equal(OWNER_BOOTSTRAP_CAPABILITIES.length, 2);
});

test("onboarding takes identity from the session, never from the submitted form", () => {
  const actions = read("app/(protected)/onboarding/actions.js");

  assert.match(actions, /requireUser\(\)/);
  assert.match(actions, /userId: user\.id/);
  assert.equal(/formData\.get\("user/.test(actions), false, "a submitted user id must never be read");
  assert.equal(/createdBy|created_by:/.test(actions), false, "ownership is decided by the adapter");

  // The adapter writes the id it is given, and only that id.
  const workspaces = read("lib/forge/persistence/workspaces.js");
  assert.match(workspaces, /created_by: userId/);
  assert.match(workspaces, /user_id: userId/);
});

test("a partially created organisation is cleaned up if the workspace fails", async () => {
  const tables = {};
  const client = createFakeSupabase({ userId: "user-a", tables });
  // The organisation read-back runs on the trusted client, exactly as it does in
  // production, because the creator cannot see it until the membership exists.
  const trusted = createFakeSupabase({ userId: "service", tables, trusted: true });
  const failing = {
    from(table) {
      const api = client.from(table);
      if (table !== "workspaces") return api;
      return {
        ...api,
        insert() {
          // The adapters insert plainly now, so the failure is returned directly.
          return { error: { message: "workspace insert failed" } };
        },
      };
    },
    _db: client._db,
  };

  await assert.rejects(
    () =>
      createWorkspaceForUser(failing, {
        userId: "user-a",
        name: "Korben HQ",
        trustedClient: trusted,
      }),
    /workspace insert failed/
  );

  assert.equal(
    client._db.organizations.length,
    0,
    "the organisation must not be left behind without its workspace"
  );
});

// 5–8 ------------------------------------------------------------------------
test("missions map between the domain model and rows in both directions", () => {
  const mission = {
    id: "m-1",
    kind: "fleet",
    title: "THE FLEET — Launch",
    icon: "⚔️",
    brief: "Launch it",
    status: "queued",
    leadSlug: "jarvis",
    fleet: "the-fleet",
    capability: "mission.coordinate",
    currentStage: "queued",
    reached: ["queued"],
    team: [{ slug: "scout" }, { slug: "forge" }, { slug: "sage" }],
    requestedBy: "user-a",
  };

  const row = missionDomainToRow(mission, { workspaceId: "ws-a", agentId: "agent-jarvis" });
  assert.equal(row.current_stage, "queued");
  assert.deepEqual(row.reached_stages, ["queued"]);
  assert.deepEqual(row.policy.team, ["scout", "forge", "sage"]);
  assert.equal(row.requested_by, "user-a");

  const domain = missionRowToDomain({
    id: "m-1",
    workspace_id: "ws-a",
    agent_id: "agent-jarvis",
    requested_by: "user-a",
    status: "waiting_approval",
    kind: "fleet",
    icon: "⚔️",
    input: { title: "THE FLEET — Launch", brief: "Launch it" },
    current_stage: "draft",
    reached_stages: ["queued", "recon", "draft"],
    policy: { lead_agent: "jarvis", fleet: "the-fleet", team: ["scout", "forge", "sage"] },
    result: {},
    created_at: "2026-09-21T13:00:00.000Z",
  });

  assert.equal(domain.status, "waiting_approval");
  assert.equal(domain.currentStage, "draft");
  assert.deepEqual(domain.reached, ["queued", "recon", "draft"]);
  assert.equal(domain.kindTitle, "THE FLEET");
  assert.equal(domain.team.length, 3);
  assert.equal(domain.result, null);
});

test("a malformed persisted result degrades to the safe fallback on read", () => {
  const domain = missionRowToDomain({
    id: "m-2",
    workspace_id: "ws-a",
    status: "completed",
    kind: "reaper",
    input: {},
    reached_stages: [],
    policy: {},
    result: { subs: "not-an-array" },
    created_at: "2026-09-21T13:00:00.000Z",
  });

  assert.equal(domain.result, MALFORMED_RESULT);
  assert.equal(domain.result.kind, "malformed");
});

test("events map in both directions and reject unknown types", () => {
  const row = eventDomainToRow(
    {
      type: MISSION_EVENT.agentStarted,
      at: "2026-09-21T13:05:00.000Z",
      actor: { agent: "scout" },
      summary: "SCOUT began recon",
      metadata: { work: "recon" },
    },
    { workspaceId: "ws-a", taskId: "m-1" }
  );

  assert.equal(row.event_type, "agent.started");
  assert.equal(row.actor_label, "scout");
  assert.equal(row.workspace_id, "ws-a");

  const back = eventRowToDomain({
    id: 7,
    event_type: row.event_type,
    actor_label: row.actor_label,
    actor_user_id: null,
    summary: row.summary,
    metadata: row.metadata,
    created_at: "2026-09-21T13:05:00.000Z",
  });
  assert.equal(back.type, MISSION_EVENT.agentStarted);
  assert.equal(back.actor.agent, "scout");
  assert.equal(back.id, "7");

  assert.equal(
    eventDomainToRow({ type: "nonsense.type" }, { workspaceId: "ws-a", taskId: "m-1" }),
    null,
    "unknown event types are refused before they reach the database"
  );
});

test("approvals map in both directions, including the consumed state", () => {
  const approval = approvalRowToDomain({
    id: "ap-1",
    task_id: "m-1",
    capability: "social.publish",
    tool: "social.publish_post",
    destination: "twitter",
    action_payload: { platform: "twitter", text: "hello" },
    payload_fingerprint: '{"platform":"twitter","text":"hello"}',
    status: "consumed",
    expires_at: "2026-09-21T15:00:00.000Z",
    created_at: "2026-09-21T13:00:00.000Z",
    consumed_at: "2026-09-21T13:30:00.000Z",
  });

  assert.equal(approval.state, "consumed");
  assert.equal(approval.destination, "twitter");
  assert.equal(approval.payloadFingerprint, '{"platform":"twitter","text":"hello"}');
  assert.deepEqual(approval.args, { platform: "twitter", text: "hello" });
  assert.ok(approval.lines.some((line) => line.startsWith("destination: twitter")));
});

// 9–11 -----------------------------------------------------------------------
test("cross-workspace mission, event, and approval reads are denied", async () => {
  const { userA, userB, trusted } = twoWorkspaces();

  await createMissionRecord(
    { userClient: userA, trustedClient: trusted },
    { workspaceId: "ws-a", actorUserId: "user-a", kind: "warroom", brief: "", agentId: "agent-jarvis" }
  );

  const mine = await listMissions({ userClient: userA }, { workspaceId: "ws-a" });
  assert.equal(mine.length, 1);
  assert.equal(mine[0].events.length, 1, "the mission's first event is recorded");

  const theirs = await listMissions({ userClient: userB }, { workspaceId: "ws-b" });
  assert.deepEqual(theirs, [], "another workspace sees nothing");

  const leaked = await listMissions({ userClient: userB }, { workspaceId: "ws-a" });
  assert.deepEqual(leaked, [], "asking for someone else's workspace returns nothing");

  const theirApprovals = await userB.from("approvals").select("*");
  assert.deepEqual(theirApprovals._data ?? (await theirApprovals), { data: [], error: null });
});

// 12 -------------------------------------------------------------------------
test("a browser session cannot write the event stream or stage approvals", async () => {
  const { userA, trusted } = twoWorkspaces();

  const forged = userA.from("run_events").insert({
    workspace_id: "ws-a",
    task_id: "m-1",
    event_type: "mission.completed",
  });
  const forgedResult = await forged;
  assert.match(forgedResult.error.message, /permission denied/i);

  const staged = userA.from("approvals").insert({ task_id: "m-1", capability: "social.publish" });
  const stagedResult = await staged;
  assert.match(stagedResult.error.message, /permission denied/i);

  // The trusted path still works.
  const ok = await trusted.from("run_events").insert({
    workspace_id: "ws-a",
    task_id: "m-1",
    event_type: "mission.created",
  });
  assert.equal((await ok).error, null);
});

// 7–9 (adapters) -------------------------------------------------------------
test("approval staging, deciding, and consumption travel through the trusted path once", async () => {
  const { userA, trusted } = twoWorkspaces();

  await createMissionRecord(
    { userClient: userA, trustedClient: trusted },
    { workspaceId: "ws-a", actorUserId: "user-a", kind: "announce", brief: "Announce it", agentId: "agent-jarvis" }
  );
  const taskId = userA._db.tasks[0].id;

  const approval = await stageApprovalRecord(
    { trustedClient: trusted },
    {
      taskId,
      approval: {
        capability: "social.publish",
        tool: "social.publish_post",
        destination: "twitter",
        requestedBy: "user-a",
        args: { platform: "twitter", text: "hello" },
        payloadFingerprint: '{"platform":"twitter","text":"hello"}',
        state: "pending",
        expiresAt: "2026-09-21T15:00:00.000Z",
      },
    }
  );
  assert.equal(approval.state, "pending");

  await assert.rejects(
    () => consumeApprovalRecord({ trustedClient: trusted }, { approvalId: approval.id }),
    /already been used|cannot run again/i,
    "a pending approval cannot be consumed"
  );

  const decided = await decideApprovalRecord(
    { trustedClient: trusted },
    { approvalId: approval.id, decision: "approved", actorUserId: "user-a" }
  );
  assert.equal(decided.state, "approved");

  await assert.rejects(
    () => decideApprovalRecord({ trustedClient: trusted }, { approvalId: approval.id, decision: "denied", actorUserId: "user-a" }),
    /no longer pending/i
  );

  const consumed = await consumeApprovalRecord({ trustedClient: trusted }, { approvalId: approval.id });
  assert.equal(consumed.state, "consumed");

  await assert.rejects(
    () => consumeApprovalRecord({ trustedClient: trusted }, { approvalId: approval.id }),
    /already been used/i
  );
});

test("mission creation records its event history through the trusted path only", async () => {
  const { userA, trusted } = twoWorkspaces();

  const { mission, eventsRecorded, warning } = await createMissionRecord(
    { userClient: userA, trustedClient: trusted },
    { workspaceId: "ws-a", actorUserId: "user-a", kind: "fleet", brief: "Launch it", agentId: "agent-jarvis" }
  );

  assert.equal(mission.kind, "fleet");
  assert.equal(mission.status, "queued");
  assert.equal(eventsRecorded >= 1, true);
  assert.equal(warning, null);
  assert.equal(userA._db.run_events.length >= 1, true);

  // Without a trusted client the mission still saves, and the caller is told.
  const second = await createMissionRecord(
    { userClient: userA, trustedClient: null },
    { workspaceId: "ws-a", actorUserId: "user-a", kind: "warroom", brief: "", agentId: "agent-jarvis" }
  );
  assert.equal(second.eventsRecorded, 0);
  assert.match(second.warning, /service_role_key/i);
});

// 13 -------------------------------------------------------------------------
test("the built-in agent catalog stays canonical over durable rows", async () => {
  const client = createFakeSupabase({
    userId: "user-a",
    tables: {
      agents: [
        // A row that tries to contradict the catalog.
        { id: "a1", slug: "jarvis", name: "Not Jarvis", is_active: true, delegation_enabled: false },
        { id: "a2", slug: "inbox-triage", name: "Inbox Triage", is_active: true, delegation_enabled: false },
      ],
    },
  });

  const durable = await listDurableAgents(client);
  const jarvis = durable.find((row) => row.slug === "jarvis");
  assert.equal(jarvis.name, "JARVIS", "the catalog wins on identity");
  assert.equal(jarvis.isBuiltIn, true);
  assert.equal(durable.find((row) => row.slug === "inbox-triage").isBuiltIn, false);
});

test("workspace membership reads are scoped to the signed-in person", async () => {
  const client = createFakeSupabase({
    userId: "user-a",
    memberships: [{ id: "mem-a", workspace_id: "ws-a", user_id: "user-a", role: "owner" }],
    tables: {
      workspace_memberships: [
        { id: "mem-a", workspace_id: "ws-a", user_id: "user-a", role: "owner", created_at: "1" },
        { id: "mem-b", workspace_id: "ws-b", user_id: "user-b", role: "owner", created_at: "2" },
      ],
      workspaces: [workspaceRow("ws-a"), workspaceRow("ws-b", "Other Co")],
    },
  });

  const membership = await getMembershipForUser(client, "user-a");
  assert.equal(membership.workspace.id, "ws-a");

  const other = await getMembershipForUser(client, "user-b");
  assert.equal(other, null, "another person's membership is not readable");
});

// 14–16 ----------------------------------------------------------------------
test("the persistence layer never calls Hermes, a provider, or the network", () => {
  const dir = new URL("../lib/forge/persistence/", import.meta.url);
  const sources = readdirSync(dir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => readFileSync(new URL(name, dir), "utf8"))
    .join("\n")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n")
    .toLowerCase();

  for (const forbidden of ["hermes", "fetch(", "oauth", "http://", "https://", "gmail", "github", "vapi", "retell"]) {
    assert.equal(sources.includes(forbidden), false, `persistence must not reference ${forbidden}`);
  }

  // And the auth foundation is still the only identity source.
  assert.match(read("app/(protected)/layout.js"), /requireUser/);
  assert.match(read("app/(protected)/missions/actions.js"), /requireUser/);
});

test("authenticated routes never fall back to fixtures, and the preview stays development-only", () => {
  const dir = new URL("../app/(protected)/", import.meta.url);

  const walk = (url, found = []) => {
    for (const entry of readdirSync(url, { withFileTypes: true })) {
      const next = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, url);
      if (entry.isDirectory()) walk(next, found);
      else if (entry.name.endsWith(".js")) found.push(next);
    }
    return found;
  };

  const offenders = walk(dir)
    .filter((file) => readFileSync(file, "utf8").includes("lib/jarvis-fixtures"))
    .map((file) => file.pathname.split("/app/")[1]);

  assert.deepEqual(
    offenders,
    [],
    "production routes must read persistence or the catalog, never fixture data"
  );

  // The fixture preview exists, and it refuses to render in production.
  const preview = read("app/preview/page.js");
  assert.match(preview, /NODE_ENV === "production"/);
  assert.match(preview, /notFound\(\)/);

  // Mission Bay and History render an honest state when the database is unreachable.
  for (const page of ["app/(protected)/page.js", "app/(protected)/history/page.js"]) {
    const source = read(page);
    assert.match(source, /loadMissionBayState/);
    assert.match(source, /!state\.ok/);
    assert.match(source, /could not reach its database|needs the Forge database/);
  }
});

test("the migration is additive, RLS-scoped, and does not let browsers write events", () => {
  const sql = read("supabase/migrations/004_forge_workspace_and_mission_persistence.sql")
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  // Additive / idempotent.
  assert.match(sql, /add column if not exists/i);
  assert.match(sql, /create table if not exists/i);
  assert.match(sql, /create index if not exists/i);
  assert.equal(/drop table/i.test(sql), false, "no table may be dropped");
  assert.equal(/drop column/i.test(sql), false, "no column may be dropped");
  assert.equal(/truncate|delete from/i.test(sql), false, "no data may be deleted");

  // Workspace-scoped RLS, never a blanket authenticated read.
  for (const table of ["tasks", "run_events", "approvals", "action_receipts"]) {
    const policy = sql.slice(sql.indexOf(`create policy "${table}_`));
    assert.match(policy, /is_forge_workspace_member|exists \(/i, `${table} policy needs a membership predicate`);
  }

  // `using (true)` is only acceptable for the shared catalogue tables.
  const policyBlocks = sql.match(/create policy[\s\S]*?using \([\s\S]*?\);/gi) ?? [];
  for (const block of policyBlocks) {
    if (!/using \(true\)/i.test(block)) continue;
    assert.match(
      block,
      /on public\.(fleets|fleet_members)\b/i,
      "only the shared catalogue may be readable with USING (true)"
    );
  }

  // The event stream and approvals cannot be written from a browser session.
  assert.match(sql, /revoke insert, update, delete on public\.run_events from authenticated, anon/i);
  assert.match(sql, /revoke insert, update, delete on public\.approvals from authenticated, anon/i);
  assert.equal(/create policy "run_events_insert/i.test(sql), false);
  assert.equal(/create policy "approvals_insert/i.test(sql), false);

  // Approval states include consumption, and onboarding policies are self-owned.
  assert.match(sql, /'pending', 'approved', 'denied', 'expired', 'consumed'/);
  assert.match(sql, /with check \(created_by = \(select auth\.uid\(\)\)\)/);
  assert.match(sql, /with check \(user_id = \(select auth\.uid\(\)\)\)/);
});

test("the security follow-up revokes direct execution of the signup trigger only", () => {
  const sql = read("supabase/migrations/005_revoke_handle_new_user_execute.sql")
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  for (const role of ["public", "anon", "authenticated"]) {
    assert.match(
      sql,
      new RegExp(`revoke execute on function public\\.handle_new_user\\(\\) from ${role};`),
      `handle_new_user should not be executable by ${role}`
    );
  }

  // The function itself is untouched, and no other object is affected.
  assert.equal(/create or replace function/i.test(sql), false, "behaviour must not change");
  assert.equal(/alter function/i.test(sql), false);
  assert.equal(/drop function/i.test(sql), false);
  assert.equal(/revoke .* on table/i.test(sql), false);
  assert.equal(
    (sql.match(/revoke execute/g) ?? []).length,
    3,
    "exactly three revokes, one per role"
  );
});
