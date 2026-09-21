// Execution receipts: proof of what Forge actually did.
//
// A receipt is written only when a provider adapter ran or explicitly failed,
// never for a denied request. Inputs and results are stored as bounded, redacted
// summaries so a receipt can be shown to a human without leaking credentials.

import { redactRecord, safeSummary } from "./sanitize.js";

export function createReceiptRecorder({ repository, clock = () => new Date() }) {
  return {
    async record({
      workspaceId,
      taskId,
      agentRunId = null,
      approvalId = null,
      connectionId = null,
      tool,
      capability,
      actionLevel,
      input = null,
      result = null,
      success,
      externalRef = null,
    }) {
      if (!workspaceId || !tool || !capability || !actionLevel) {
        throw new Error("receipts require a workspace, tool, capability, and action level");
      }

      const receipt = {
        workspaceId,
        taskId,
        agentRunId,
        approvalId,
        connectionId,
        tool,
        capability,
        actionLevel,
        inputSummary: safeSummary(input),
        resultSummary: safeSummary(result),
        success: Boolean(success),
        externalRef: safeSummary(externalRef, { max: 200 }),
        executedAt: clock(),
      };

      return repository.insertReceipt(receipt);
    },

    // Exposed for tests and diagnostics: a receipt body never carries raw input.
    describeInput(input) {
      return redactRecord(input);
    },
  };
}
