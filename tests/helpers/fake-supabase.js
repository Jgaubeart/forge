// A small in-memory stand-in for the parts of the Supabase client the
// persistence adapters use: from().select/insert/update/delete with eq/in/order/
// limit and single/maybeSingle. It also models the two things that matter for
// this phase: workspace-scoped reads are filtered to the caller's memberships,
// and the event/approval tables reject writes from the user client.

let sequence = 0;
const id = (prefix) => `${prefix}-${(sequence += 1).toString().padStart(4, "0")}`;

// The tables object carries the shared database, so several clients built from
// the same fixture observe each other's writes the way one real database does.
const SHARED = Symbol("shared-db");

export function createFakeSupabase({ userId = null, memberships = [], tables = {}, trusted = false } = {}) {
  const defaults = {
    organizations: [],
    organization_memberships: [],
    workspaces: [],
    workspace_memberships: [],
    membership_capabilities: [],
    tasks: [],
    agent_runs: [],
    run_events: [],
    approvals: [],
    agents: [],
  };

  const db = tables[SHARED] ?? (tables[SHARED] = { ...defaults, ...tables });

  const workspaceIds = new Set(
    memberships.filter((m) => !userId || m.user_id === userId).map((m) => m.workspace_id)
  );
  const canWriteEvents = trusted;
  const canWriteApprovals = trusted;
  const canWriteRuns = trusted;

  const scoped = (table, row) => {
    if (trusted) return true;
    if (table === "tasks" || table === "run_events") return workspaceIds.has(row.workspace_id);
    // agent_runs select goes through the task's workspace, like the real policy
    // `agent_runs_select_via_task`.
    if (table === "agent_runs") {
      const task = db.tasks.find((t) => t.id === row.task_id);
      return Boolean(task) && workspaceIds.has(task.workspace_id);
    }
    if (table === "approvals") {
      const task = db.tasks.find((t) => t.id === row.task_id);
      return Boolean(task) && workspaceIds.has(task.workspace_id);
    }
    if (table === "workspace_memberships") return row.user_id === userId;
    if (table === "organization_memberships") return row.user_id === userId;
    // Mirrors workspaces_select_member after fix_onboarding_rls_recursion: a
    // member can read a workspace, and so can the person who created it — which
    // is what lets onboarding read back the row it just inserted, before the
    // membership exists.
    if (table === "workspaces") return workspaceIds.has(row.id) || row.created_by === userId;
    if (table === "organizations") {
      return db.organization_memberships.some(
        (m) => m.organization_id === row.id && m.user_id === userId
      );
    }
    if (table === "agents") return true;
    return true;
  };

  function query(table) {
    const filters = [];
    let limitCount = null;
    let orderSpec = null;

    const api = {
      select() {
        return api;
      },
      insert(values) {
        const rows = Array.isArray(values) ? values : [values];
        const blocked =
          (table === "run_events" && !canWriteEvents) ||
          (table === "approvals" && !canWriteApprovals) ||
          (table === "agent_runs" && !canWriteRuns);

        if (blocked) {
          api._error = { message: `permission denied for table ${table}` };
          return api;
        }

        // The runtime run id is unique in the real schema; the double enforces it
        // so a repeated dispatch cannot quietly create a second run row.
        if (table === "agent_runs") {
          const clash = rows.find((row) =>
            db.agent_runs.some((existing) => existing.hermes_run_id === row.hermes_run_id)
          );
          if (clash) {
            api._error = {
              code: "23505",
              message: `duplicate key value violates unique constraint "agent_runs_hermes_run_id_key"`,
            };
            return api;
          }
        }

        const inserted = rows.map((row) => ({
          id: row.id ?? id(table.slice(0, 3)),
          created_at: row.created_at ?? new Date(0).toISOString(),
          ...row,
        }));
        db[table].push(...inserted);
        api._data = Array.isArray(values) ? inserted : inserted[0];
        return api;
      },
      update(patch) {
        api._patch = patch;
        return api;
      },
      delete() {
        api._delete = true;
        return api;
      },
      eq(column, value) {
        filters.push((row) => row[column] === value);
        return api;
      },
      in(column, values) {
        filters.push((row) => values.includes(row[column]));
        return api;
      },
      order(column, { ascending = true } = {}) {
        orderSpec = { column, ascending };
        return api;
      },
      limit(count) {
        limitCount = count;
        return api;
      },
      async maybeSingle() {
        const rows = await resolveRows();
        return { data: rows[0] ?? null, error: api._error ?? null };
      },
      async single() {
        const rows = await resolveRows();
        if (!rows[0]) return { data: null, error: api._error ?? { message: "no rows" } };
        return { data: rows[0], error: null };
      },
      then(resolve, reject) {
        return resolveRows().then(
          (rows) => resolve({ data: api._data ?? rows, error: api._error ?? null }),
          reject
        );
      },
    };

    async function resolveRows() {
      if (api._error) return [];
      if (api._data) return [api._data];

      let rows = db[table].filter((row) => scoped(table, row));

      if (api._delete) {
        const doomed = rows.filter((row) => filters.every((f) => f(row)));
        db[table] = db[table].filter((row) => !doomed.includes(row));
        return [];
      }

      if (api._patch) {
        const updated = [];
        for (const row of db[table]) {
          if (!filters.every((f) => f(row))) continue;
          Object.assign(row, api._patch);
          updated.push(row);
        }
        return updated;
      }

      rows = rows.filter((row) => filters.every((f) => f(row)));

      // Minimal embedding for the one relationship the adapters select.
      if (table === "workspace_memberships") {
        rows = rows.map((row) => ({
          ...row,
          workspaces: db.workspaces.find((w) => w.id === row.workspace_id) ?? null,
        }));
      }

      if (orderSpec) {
        rows = [...rows].sort((a, b) => {
          const left = a[orderSpec.column] ?? "";
          const right = b[orderSpec.column] ?? "";
          return orderSpec.ascending
            ? String(left).localeCompare(String(right))
            : String(right).localeCompare(String(left));
        });
      }
      if (limitCount !== null) rows = rows.slice(0, limitCount);
      return rows;
    }

    return api;
  }

  return { from: query, _db: db };
}
