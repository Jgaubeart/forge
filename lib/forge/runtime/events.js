// The Forge event stream.
//
// Events are the durable, human-readable account of what happened to a mission.
// The UI reads this stream instead of inventing status copy, and nothing with
// credentials or raw tool payloads is ever written: summaries and metadata pass
// through sanitize.js first.

import { safeText, redactRecord } from "./sanitize.js";

export const RUN_EVENT_TYPES = Object.freeze({
  taskQueued: "task.queued",
  taskStarted: "task.started",
  taskPlanning: "task.planning",
  taskWaiting: "task.waiting",
  taskCompleted: "task.completed",
  taskFailed: "task.failed",
  taskCancelled: "task.cancelled",
  taskCancelRequested: "task.cancel_requested",
  runStarted: "run.started",
  runCompleted: "run.completed",
  runFailed: "run.failed",
  runCancelled: "run.cancelled",
  runCancelFailed: "run.cancel_failed",
  agentDelegated: "agent.delegated",
  toolRequested: "tool.requested",
  toolExecuted: "tool.executed",
  toolFailed: "tool.failed",
  toolDenied: "tool.denied",
  approvalRequested: "approval.requested",
  approvalResolved: "approval.resolved",
  receiptRecorded: "receipt.recorded",
});

export const RUN_EVENT_TYPE_VALUES = Object.freeze(Object.values(RUN_EVENT_TYPES));

export function createRunEvent({
  taskId,
  workspaceId,
  agentRunId = null,
  type,
  summary = null,
  actorUserId = null,
  actorLabel = null,
  metadata = {},
  at,
}) {
  if (!taskId || !workspaceId || !type) {
    throw new Error("run events require a task, a workspace, and an event type");
  }

  return {
    taskId,
    workspaceId,
    agentRunId,
    eventType: String(type),
    summary: safeText(summary),
    actorUserId,
    actorLabel: safeText(actorLabel, { max: 120 }),
    metadata: redactRecord(metadata),
    createdAt: at ?? new Date(),
  };
}

export function createEventRecorder({ repository, clock = () => new Date() }) {
  return {
    async record(entry) {
      const event = createRunEvent({ ...entry, at: clock() });
      return repository.insertRunEvent(event);
    },
  };
}
