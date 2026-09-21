import { PersistenceError } from "./errors.js";
import { approvalDomainToRow, approvalRowToDomain } from "./map.js";

const APPROVAL_COLUMNS =
  "id, task_id, agent_run_id, requested_by, capability, tool, destination, action_payload, payload_fingerprint, status, expires_at, decided_by, decided_at, consumed_at, created_at";

// Approval persistence. Staging and deciding are server-side writes through the
// trusted client, because the migration grants no INSERT/UPDATE policy on
// approvals: a browser cannot stage its own action or approve one.
export async function stageApprovalRecord(
  { trustedClient },
  { approval, taskId, agentRunId = null }
) {
  if (!trustedClient) {
    throw new PersistenceError(
      "trusted_writes_not_configured",
      "Approvals need SUPABASE_SERVICE_ROLE_KEY to be recorded."
    );
  }

  const { data, error } = await trustedClient
    .from("approvals")
    .insert(approvalDomainToRow(approval, { taskId, agentRunId }))
    .select(APPROVAL_COLUMNS)
    .single();

  if (error) throw new PersistenceError("approval_stage_failed", error.message);
  return approvalRowToDomain(data);
}

export async function decideApprovalRecord(
  { trustedClient },
  { approvalId, decision, actorUserId, at = null }
) {
  if (!trustedClient) {
    throw new PersistenceError(
      "trusted_writes_not_configured",
      "Approval decisions need SUPABASE_SERVICE_ROLE_KEY to be recorded."
    );
  }
  if (!["approved", "denied"].includes(decision)) {
    throw new PersistenceError("invalid_decision", "A decision must be approved or denied.");
  }

  const timestamp = at ?? new Date().toISOString();
  const { data, error } = await trustedClient
    .from("approvals")
    .update({
      status: decision,
      decided_by: actorUserId,
      decided_at: timestamp,
      decided_payload_hash: null,
    })
    .eq("id", approvalId)
    .eq("status", "pending")
    .select(APPROVAL_COLUMNS)
    .maybeSingle();

  if (error) throw new PersistenceError("approval_decide_failed", error.message);
  if (!data) {
    throw new PersistenceError(
      "approval_not_pending",
      "That approval is no longer pending, so it cannot be decided."
    );
  }
  return approvalRowToDomain(data);
}

// Consumption is single use: the update only matches a row that is still
// approved, so a second attempt changes nothing and is reported as such.
export async function consumeApprovalRecord({ trustedClient }, { approvalId, at = null }) {
  if (!trustedClient) {
    throw new PersistenceError(
      "trusted_writes_not_configured",
      "Approval consumption needs SUPABASE_SERVICE_ROLE_KEY to be recorded."
    );
  }

  const timestamp = at ?? new Date().toISOString();
  const { data, error } = await trustedClient
    .from("approvals")
    .update({ status: "consumed", consumed_at: timestamp })
    .eq("id", approvalId)
    .eq("status", "approved")
    .select(APPROVAL_COLUMNS)
    .maybeSingle();

  if (error) throw new PersistenceError("approval_consume_failed", error.message);
  if (!data) {
    throw new PersistenceError(
      "approval_already_consumed",
      "That approval has already been used, so it cannot run again."
    );
  }
  return approvalRowToDomain(data);
}
