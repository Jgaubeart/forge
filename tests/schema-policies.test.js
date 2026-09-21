import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const MIGRATION = readFileSync(
  new URL("../supabase/migrations/004_forge_runtime.sql", import.meta.url),
  "utf8"
);

const WORKSPACE_SCOPED_TABLES = ["run_events", "action_receipts"];

test("A/G: every new table has RLS enabled and a workspace-scoped select policy", () => {
  for (const table of WORKSPACE_SCOPED_TABLES) {
    assert.match(
      MIGRATION,
      new RegExp(`alter table public\\.${table} enable row level security;`),
      `${table} must enable RLS`
    );

    assert.match(
      MIGRATION,
      new RegExp(
        `create policy "${table}_select_workspace"[\\s\\S]*?to authenticated[\\s\\S]*?private\\.is_workspace_member\\(workspace_id\\)`
      ),
      `${table} must be readable only by workspace members`
    );
  }
});

test("the event stream and receipts cannot be written from a browser session", () => {
  for (const table of WORKSPACE_SCOPED_TABLES) {
    const policies = MIGRATION.match(
      new RegExp(`create policy "[^"]*"\\s*on public\\.${table}[\\s\\S]*?;`, "g")
    );

    assert.ok(policies && policies.length > 0, `${table} needs policies`);

    for (const policy of policies) {
      assert.match(policy, /for select/, `${table} policies must be select-only`);
      assert.doesNotMatch(policy, /for insert|for update|for delete|for all/);
    }
  }
});

test("new tables are granted to authenticated readers only", () => {
  for (const table of WORKSPACE_SCOPED_TABLES) {
    assert.match(MIGRATION, new RegExp(`grant select on public\\.${table} to authenticated;`));
    assert.match(MIGRATION, new RegExp(`revoke all on public\\.${table} from anon;`));
    assert.doesNotMatch(MIGRATION, new RegExp(`grant (insert|update|delete)[^;]*public\\.${table}`));
  }
});

test("foreign keys added by the migration are indexed", () => {
  const expectedIndexes = [
    "agent_runs_parent_run_id_idx",
    "run_events_task_id_created_at_idx",
    "run_events_workspace_id_created_at_idx",
    "run_events_agent_run_id_idx",
    "action_receipts_task_id_idx",
    "action_receipts_agent_run_id_idx",
    "action_receipts_approval_id_idx",
    "action_receipts_connection_id_idx",
    "approvals_connection_id_idx",
    "tasks_cancel_requested_by_idx",
  ];

  for (const index of expectedIndexes) {
    assert.match(
      MIGRATION,
      new RegExp(`create index if not exists ${index}`),
      `${index} is missing`
    );
  }
});

test("constraints are added idempotently", () => {
  assert.doesNotMatch(MIGRATION, /add constraint if not exists/i);
  assert.match(MIGRATION, /pg_constraint/);
});

test("existing policies are not weakened or rewritten", () => {
  assert.doesNotMatch(MIGRATION, /drop policy if exists "tasks_select_workspace"/);
  assert.doesNotMatch(MIGRATION, /drop policy if exists "agents_read_authenticated"/);
  assert.doesNotMatch(MIGRATION, /drop policy if exists "approvals_select_workspace"/);
  assert.doesNotMatch(MIGRATION, /disable row level security/i);
});
