// Hermes adapter.
//
// The only place Hermes-specific HTTP details live. It maps Forge runtime calls
// onto the existing server-side Hermes client, maps responses back to normalized
// runtime objects, applies a timeout, and converts every failure into a
// Forge-owned runtime error. No agent business logic lives here.

import { assertRuntimeAdapter } from "./contract.js";
import {
  RUNTIME_ERROR_CODES,
  isRuntimeError,
  runtimeError,
  runtimeErrorFromException,
  runtimeErrorFromStatus,
} from "./errors.js";
import {
  normalizeApprovalDecision,
  normalizeCapabilities,
  normalizeEvent,
  normalizeHealth,
  normalizeRun,
} from "./types.js";

export function createHermesRuntimeAdapter({ client, config = null, timeoutMs = 10_000 }) {
  const state = config ?? client.hermesConfigState?.() ?? { configured: false };

  async function guard(operation) {
    if (!state.configured) {
      throw runtimeError(RUNTIME_ERROR_CODES.notConfigured);
    }

    let timer = null;
    try {
      // The adapter owns the deadline, so a slow runtime cannot hang a request
      // even if the underlying client's own default is longer.
      return await Promise.race([
        operation(),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            reject(
              runtimeError(RUNTIME_ERROR_CODES.timeout, {
                message: `The runtime did not answer within ${timeoutMs}ms.`,
              })
            );
          }, timeoutMs);
          timer.unref?.();
        }),
      ]);
    } catch (error) {
      if (isRuntimeError(error)) throw error;
      // The Hermes client attaches the HTTP status to failures it raises.
      if (typeof error?.status === "number") {
        throw runtimeErrorFromStatus(error.status, error.body ?? null);
      }
      throw runtimeErrorFromException(error);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  const adapter = {
    name: "hermes",
    configured: Boolean(state.configured),
    // The live runtime serves a run's events only while the run is running, as
    // server-sent events; the domain asks for a live read when that is useful.
    streamsEvents: true,

    // Every method is async so a rejected configuration or request surfaces as a
    // rejected promise, never as a synchronous throw the caller can miss.

    // ---- inspection (the only calls Phase 6 makes) -------------------------
    async health() {
      return guard(async () => normalizeHealth(await client.getHermesHealth()));
    },

    async getCapabilities() {
      return guard(async () => normalizeCapabilities(await client.getHermesCapabilities()));
    },

    // ---- runs -------------------------------------------------------------
    // Defined by the interface so the boundary is complete. Phase 6 never calls
    // it: no mission is dispatched to the runtime in this phase.
    async createRun(request) {
      if (!request?.brief || typeof request.brief !== "string") {
        throw runtimeError(RUNTIME_ERROR_CODES.invalidRequest, {
          message: "A runtime run request needs a brief.",
        });
      }

      return guard(async () => {
        const run = normalizeRun(
          await client.createHermesRun({
            input: request.brief,
            instructions: request.context?.agentInstructions ?? null,
            idempotencyKey: request.correlation?.idempotencyKey ?? null,
          })
        );
        if (!run) throw runtimeError(RUNTIME_ERROR_CODES.badResponse);
        return run;
      });
    },

    async getRun(runId) {
      if (!runId) {
        throw runtimeError(RUNTIME_ERROR_CODES.invalidRequest, {
          message: "A run id is required.",
        });
      }
      return guard(async () => {
        const run = normalizeRun(await client.getHermesRun(runId));
        if (!run) throw runtimeError(RUNTIME_ERROR_CODES.badResponse);
        return run;
      });
    },

    async getRunEvents(runId, { since = null, live = false, maxMs = 8_000 } = {}) {
      if (!runId) {
        throw runtimeError(RUNTIME_ERROR_CODES.invalidRequest, {
          message: "A run id is required.",
        });
      }
      return guard(async () => {
        const payload = live
          ? await client.streamHermesRunEvents(runId, { maxMs })
          : await client.getHermesRunEvents(runId, { since });
        const list = Array.isArray(payload) ? payload : (payload?.events ?? []);
        if (!Array.isArray(list)) throw runtimeError(RUNTIME_ERROR_CODES.badResponse);
        return list.map(normalizeEvent).filter(Boolean);
      });
    },

    async stopRun(runId) {
      if (!runId) {
        throw runtimeError(RUNTIME_ERROR_CODES.invalidRequest, {
          message: "A run id is required.",
        });
      }
      return guard(async () => {
        const payload = await client.stopHermesRun(runId);
        return normalizeRun(payload) ?? { id: runId, status: "cancelled" };
      });
    },

    async resolveApproval(runId, decision = {}) {
      const normalized = normalizeApprovalDecision(decision.choice ?? decision);
      if (!runId || !normalized) {
        throw runtimeError(RUNTIME_ERROR_CODES.invalidRequest, {
          message: "Approval resolution needs a run id and a choice of once, always, or deny.",
        });
      }
      return guard(async () =>
        client.resolveHermesApproval(runId, {
          choice: normalized.choice,
          requestId: decision.requestId ?? null,
          resolveAll: Boolean(decision.resolveAll),
        })
      );
    },

    async steerRun(runId, { instruction, requestId = null } = {}) {
      if (!runId || !instruction) {
        throw runtimeError(RUNTIME_ERROR_CODES.invalidRequest, {
          message: "Steering needs a run id and an instruction.",
        });
      }
      return guard(async () => client.steerHermesRun(runId, { instruction, requestId }));
    },
  };

  return assertRuntimeAdapter(adapter);
}
