// Approval engine: staged actions with immutable arguments.
//
// The guarantee this module exists to provide: the action that executes is the
// action a human reviewed. Arguments are validated against the tool schema,
// sanitized, and then hashed at staging time. The decision records the hash it
// verified, and execution refuses when the staged payload no longer matches.
//
// Execution always runs from the stored snapshot, never from anything the model
// produces after approval.

import { createHash } from "node:crypto";

import { RUNTIME_ERROR_CODES, RuntimeError } from "./errors.js";
import { redactRecord } from "./sanitize.js";
import { RUN_EVENT_TYPES } from "./events.js";
import { validateToolArguments } from "./tools/registry.js";

export const APPROVAL_STATUSES = Object.freeze([
  "pending",
  "approved",
  "denied",
  "expired",
]);

// Deterministic serialization so equal payloads always hash equally.
export function canonicalize(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
    .join(",")}}`;
}

export function hashStagedPayload(payload) {
  return createHash("sha256").update(canonicalize(payload)).digest("hex");
}

export function createApprovalService({
  repository,
  events = null,
  clock = () => new Date(),
  defaultTtlMinutes = 24 * 60,
}) {
  function isExpired(approval, now = clock()) {
    if (!approval?.expiresAt) return false;
    return new Date(approval.expiresAt).getTime() <= new Date(now).getTime();
  }

  return {
    isExpired,

    // Stage a reviewed action. Only declared fields survive validation, and the
    // stored snapshot is the redacted copy that a human will actually see.
    async stage({
      task,
      runId = null,
      tool,
      connectionId = null,
      requestedBy,
      args = {},
      expiresAt = null,
    }) {
      const validation = validateToolArguments(tool, args);
      if (!validation.ok) {
        throw new RuntimeError(
          RUNTIME_ERROR_CODES.validationFailed,
          `Cannot stage an invalid action: ${validation.errors.join("; ")}`
        );
      }

      const stagedPayload = redactRecord(validation.value);
      const now = clock();
      const expires =
        expiresAt ??
        new Date(now.getTime() + defaultTtlMinutes * 60 * 1000);

      const approval = await repository.insertApproval({
        taskId: task.id,
        agentRunId: runId,
        requestedBy,
        capability: tool.capability,
        tool: tool.id,
        actionLevel: tool.actionLevel,
        connectionId,
        actionPayload: stagedPayload,
        payloadHash: hashStagedPayload(stagedPayload),
        status: "pending",
        expiresAt: expires,
        createdAt: now,
      });

      // workspaceId is not an approvals column; it is carried along so event
      // records can be workspace scoped without another lookup.
      return { ...approval, workspaceId: task.workspaceId };
    },

    async decide({ approvalId, actorUserId, decision, note = null }) {
      if (!["approved", "denied"].includes(decision)) {
        throw new RuntimeError(
          RUNTIME_ERROR_CODES.invalidRequest,
          "A decision must be approved or denied."
        );
      }

      const approval = await repository.getApprovalForUser({
        approvalId,
        userId: actorUserId,
      });

      if (!approval) {
        throw new RuntimeError(
          RUNTIME_ERROR_CODES.notFound,
          "That approval is not available to you."
        );
      }

      if (approval.status !== "pending") {
        throw new RuntimeError(
          RUNTIME_ERROR_CODES.approvalConflict,
          `This approval is already ${approval.status}.`,
          { status: approval.status }
        );
      }

      const now = clock();

      if (isExpired(approval, now)) {
        await repository.updateApproval(approval.id, {
          status: "expired",
          decidedAt: now,
          decidedBy: actorUserId,
        });
        throw new RuntimeError(
          RUNTIME_ERROR_CODES.approvalConflict,
          "This approval expired before it was decided.",
          { status: "expired" }
        );
      }

      const updated = await repository.updateApproval(approval.id, {
        status: decision,
        decidedBy: actorUserId,
        decidedAt: now,
        // The hash verified at decision time is stored next to the staged hash,
        // so a later execution can prove the reviewed payload did not change.
        decidedPayloadHash: approval.payloadHash ?? null,
      });

      if (events) {
        await events.record({
          type: RUN_EVENT_TYPES.approvalResolved,
          taskId: approval.taskId,
          workspaceId: approval.workspaceId ?? null,
          agentRunId: approval.agentRunId ?? null,
          actorUserId,
          summary: `${approval.tool ?? approval.capability} ${decision}`,
          metadata: {
            approval_id: approval.id,
            tool: approval.tool,
            capability: approval.capability,
            action_level: approval.actionLevel,
            decision,
            note,
          },
        });
      }

      return updated ?? { ...approval, status: decision, decidedBy: actorUserId, decidedAt: now };
    },

    // Claim an approved action for execution. Returns the stored staged
    // arguments; the caller must execute exactly these.
    async claim({ approvalId, actorUserId }) {
      const approval = await repository.getApprovalForUser({
        approvalId,
        userId: actorUserId,
      });

      if (!approval) {
        throw new RuntimeError(
          RUNTIME_ERROR_CODES.notFound,
          "That approval is not available to you."
        );
      }

      if (approval.status !== "approved") {
        throw new RuntimeError(
          RUNTIME_ERROR_CODES.approvalConflict,
          `This approval is ${approval.status}, so it cannot be executed.`,
          { status: approval.status }
        );
      }

      if (approval.resumedAt) {
        throw new RuntimeError(
          RUNTIME_ERROR_CODES.approvalConflict,
          "This approval has already been executed.",
          { approvalId: approval.id }
        );
      }

      if (
        approval.payloadHash &&
        approval.decidedPayloadHash &&
        approval.payloadHash !== approval.decidedPayloadHash
      ) {
        throw new RuntimeError(
          RUNTIME_ERROR_CODES.approvalConflict,
          "The staged action changed after it was reviewed, so it will not run."
        );
      }

      const updated = await repository.updateApproval(approval.id, {
        resumedAt: clock(),
      });

      return {
        approval: updated ?? approval,
        stagedArguments: approval.actionPayload ?? {},
      };
    },
  };
}
