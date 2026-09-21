import "server-only";

import { getHermesRun, createHermesRun, stopHermesRun } from "@/lib/hermes/client";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

import { createApprovalService } from "./approvals.js";
import { createContextBuilder } from "./context-builder.js";
import { createEventRecorder } from "./events.js";
import { createReceiptRecorder } from "./receipts.js";
import { createRuntimeRepository } from "./repository.js";
import { createRunController } from "./run-controller.js";
import { createAdapterRegistry, createWorkspaceSnapshotAdapter } from "./tools/adapters.js";
import { createToolGateway } from "./tools/gateway.js";
import { createToolRegistry } from "./tools/registry.js";

// The Hermes adapter the runtime talks to. All three calls go through the
// existing server-only client, so the Hermes API key never leaves this process.
export const hermesRuntimeAdapter = {
  createRun({ input, instructions, idempotencyKey }) {
    return createHermesRun({ input, instructions, idempotencyKey });
  },
  getRun(runId) {
    return getHermesRun(runId);
  },
  stopRun(runId) {
    return stopHermesRun(runId);
  },
};

// Builds the runtime for the current request: caller-scoped reads, trusted
// server writes, and the tool gateway wired to the registry and adapters.
export async function getForgeRuntime({
  userClient = null,
  runtimeClient = null,
  hermes = hermesRuntimeAdapter,
} = {}) {
  const readClient = userClient ?? (await createClient());
  const writeClient = runtimeClient ?? createAdminClient();

  const repository = createRuntimeRepository({
    userClient: readClient,
    runtimeClient: writeClient,
  });

  const events = createEventRecorder({ repository });
  const receipts = createReceiptRecorder({ repository });
  const approvals = createApprovalService({ repository, events });
  const registry = createToolRegistry();
  const adapters = createAdapterRegistry([
    createWorkspaceSnapshotAdapter({ repository }),
  ]);
  const contextBuilder = createContextBuilder({ repository, registry });
  const runController = createRunController({
    repository,
    hermes,
    contextBuilder,
    events,
  });
  const toolGateway = createToolGateway({
    repository,
    registry,
    adapters,
    approvals,
    events,
    receipts,
  });

  return {
    repository,
    events,
    receipts,
    approvals,
    registry,
    adapters,
    contextBuilder,
    runController,
    toolGateway,
    hermes,
  };
}
