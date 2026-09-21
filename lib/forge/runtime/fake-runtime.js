// Fake runtime adapter for tests only.
//
// Implements the same interface as the Hermes adapter so the mission domain and
// the UI can be exercised without a runtime. It is never wired into a production
// code path: `lib/forge/runtime/index.js` only ever builds the Hermes adapter.

import { assertRuntimeAdapter } from "./contract.js";
import { RUNTIME_ERROR_CODES, runtimeError } from "./errors.js";
import {
  RUNTIME_HEALTH,
  normalizeCapabilities,
  normalizeEvent,
  normalizeRun,
} from "./types.js";

export function createFakeRuntimeAdapter({
  mode = "healthy",
  capabilities = { features: ["runs", "approvals", "steering"] },
  runs = [],
  events = [],
} = {}) {
  const calls = [];
  const known = new Map(
    runs.map((run) => [String(run.id ?? run.run_id), normalizeRun(run)])
  );

  const unavailable = () => {
    throw runtimeError(
      mode === "notConfigured"
        ? RUNTIME_ERROR_CODES.notConfigured
        : RUNTIME_ERROR_CODES.unreachable
    );
  };

  const adapter = {
    name: "fake",
    configured: mode !== "notConfigured",
    calls,

    async health() {
      calls.push("health");
      if (mode !== "healthy") unavailable();
      return { state: RUNTIME_HEALTH.healthy, status: "ok", detail: null };
    },

    async getCapabilities() {
      calls.push("getCapabilities");
      if (mode === "unavailable" || mode === "notConfigured") unavailable();
      return normalizeCapabilities(capabilities);
    },

    async createRun() {
      calls.push("createRun");
      unavailable();
    },

    async getRun(runId) {
      calls.push(`getRun:${runId}`);
      const run = known.get(String(runId));
      if (!run) throw runtimeError(RUNTIME_ERROR_CODES.runNotFound);
      return run;
    },

    async getRunEvents(runId) {
      calls.push(`getRunEvents:${runId}`);
      return events
        .filter((event) => String(event.run_id ?? event.runId) === String(runId))
        .map(normalizeEvent)
        .filter(Boolean);
    },

    async stopRun(runId) {
      calls.push(`stopRun:${runId}`);
      return { id: String(runId), status: "cancelled" };
    },

    async resolveApproval(runId, decision = {}) {
      calls.push(`resolveApproval:${runId}`);
      if (!["once", "always", "deny"].includes(String(decision.choice))) {
        throw runtimeError(RUNTIME_ERROR_CODES.invalidRequest);
      }
      return { runId: String(runId), choice: String(decision.choice) };
    },

    async steerRun(runId, { instruction } = {}) {
      calls.push(`steerRun:${runId}`);
      return { runId: String(runId), accepted: Boolean(instruction) };
    },
  };

  return assertRuntimeAdapter(adapter);
}
