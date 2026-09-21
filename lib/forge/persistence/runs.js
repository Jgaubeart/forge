import { PersistenceError } from "./errors.js";
import { appendMissionEvents } from "./missions.js";
import { stageApprovalRecord } from "./approvals.js";

const RUN_COLUMNS =
  "id, task_id, hermes_run_id, status, output, error, started_at, completed_at, created_at";

// The durable link between a Forge mission and its runtime run.
//
// `agent_runs.hermes_run_id` already exists and is unique, so no schema change is
// needed for correlation: one row per Forge mission, one runtime run id on it.
// Reads go through the signed-in client (RLS only exposes runs whose task the
// caller may see); writes go through the trusted client, because no browser
// session may create or update a run record.
export function runRowToDomain(row) {
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.task_id,
    hermesRunId: row.hermes_run_id ?? null,
    status: row.status ?? null,
    output: row.output ?? null,
    error: row.error ?? null,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    createdAt: row.created_at ?? null,
  };
}

export async function findRunForTask({ userClient }, taskId) {
  const { data, error } = await userClient
    .from("agent_runs")
    .select(RUN_COLUMNS)
    .eq("task_id", taskId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(`[forge:persistence] run read failed: ${error.message}`);
    return null;
  }
  return runRowToDomain(data);
}

export async function createAgentRun(
  { trustedClient },
  { taskId, hermesRunId, status = "queued", startedAt = null }
) {
  requireTrusted(trustedClient, "Run records");

  // Only columns the migrations guarantee: `agent_runs` relates to its agent
  // through the task, and carries no workspace/agent column of its own.
  const { data, error } = await trustedClient
    .from("agent_runs")
    .insert({
      task_id: taskId,
      hermes_run_id: hermesRunId,
      status,
      started_at: startedAt,
    })
    .select(RUN_COLUMNS)
    .single();

  if (error) {
    // A duplicate runtime id means this mission is already linked — return the
    // existing row rather than starting a second run for it.
    if (String(error.code) === "23505" || /duplicate/i.test(error.message ?? "")) {
      const existing = await trustedClient
        .from("agent_runs")
        .select(RUN_COLUMNS)
        .eq("hermes_run_id", hermesRunId)
        .maybeSingle();
      if (existing.data) return runRowToDomain(existing.data);
    }
    throw new PersistenceError("run_insert_failed", error.message);
  }

  return runRowToDomain(data);
}

export async function updateAgentRun(
  { trustedClient },
  { runId, status, output = null, error = null, completedAt = null }
) {
  if (!runId) return null;
  requireTrusted(trustedClient, "Run records");

  const { data, error: updateError } = await trustedClient
    .from("agent_runs")
    .update({
      status,
      ...(output ? { output } : {}),
      ...(error ? { error } : {}),
      ...(completedAt ? { completed_at: completedAt } : {}),
    })
    .eq("id", runId)
    .select(RUN_COLUMNS)
    .maybeSingle();

  if (updateError) {
    console.error(`[forge:persistence] run update failed: ${updateError.message}`);
    return null;
  }
  return runRowToDomain(data);
}

// Runtime-driven mission state. The browser may update its own mission row, but
// lifecycle changes that come from the runtime are trusted writes, so a stuck or
// hostile session cannot move a mission's state on its own.
export async function updateMissionState({ trustedClient }, { taskId, patch }) {
  requireTrusted(trustedClient, "Mission state changes");

  const { data, error } = await trustedClient
    .from("tasks")
    .update(patch)
    .eq("id", taskId)
    .select("id")
    .maybeSingle();

  if (error) throw new PersistenceError("mission_update_failed", error.message);
  if (!data) throw new PersistenceError("mission_not_found", "That mission is no longer available.");
  return data.id;
}

// One object with everything the execution layer needs, so the domain never
// learns which client does what.
export function createAgentRunStore({ userClient, trustedClient }) {
  return {
    hasTrustedWrites: Boolean(trustedClient),
    findRun: ({ taskId }) => findRunForTask({ userClient }, taskId),
    createRun: (input) => createAgentRun({ trustedClient }, input),
    updateRun: (input) => updateAgentRun({ trustedClient }, input),
    updateMission: (input) => updateMissionState({ trustedClient }, input),
    appendEvents: (input) => appendMissionEvents({ trustedClient }, input),
    stageApproval: (input) => stageApprovalRecord({ trustedClient }, input),
  };
}

function requireTrusted(trustedClient, what) {
  if (!trustedClient) {
    throw new PersistenceError(
      "trusted_writes_not_configured",
      `${what} need SUPABASE_SERVICE_ROLE_KEY to be written.`
    );
  }
}
