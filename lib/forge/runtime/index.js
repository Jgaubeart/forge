import "server-only";

import * as hermesClient from "@/lib/hermes/client";

import { createHermesRuntimeAdapter } from "./hermes-adapter.js";

// The mission domain reaches the runtime through these, never through Hermes.
export {
  RUNTIME_ELIGIBLE_KINDS,
  buildMissionRuntimeRequest,
  idempotencyKeyFor,
  isRuntimeEligible,
  parseRuntimeResult,
  reconcileMissionRun,
  startSingleAgentMission,
  stopMissionRun,
} from "./execution.js";

export {
  extractApprovalRequest,
  mapRuntimeEvent,
  missionEventTypeForRuntime,
  missionStatusForRuntime,
  runtimeEventKey,
} from "./event-map.js";

// The single entry point the rest of Forge uses. Server-only: it reads
// HERMES_API_URL and HERMES_API_KEY, and nothing here may be imported by a client
// component. When the runtime is not configured the adapter reports that state
// instead of throwing from a getter.
export function getForgeRuntime() {
  return createHermesRuntimeAdapter({ client: hermesClient });
}

// A small, honest status for the interface. It performs a real health call when
// the runtime is configured, and never invents a positive state.
export async function runtimeStatus() {
  const runtime = getForgeRuntime();

  if (!runtime.configured) {
    return { state: "not_configured", label: "Runtime not configured", tone: "muted" };
  }

  try {
    const health = await runtime.health();
    return health.state === "healthy"
      ? { state: health.state, label: "Connected", tone: "accent" }
      : { state: health.state, label: "Degraded", tone: "warn" };
  } catch (error) {
    return {
      state: error?.code ?? "runtime_unreachable",
      label:
        error?.code === "runtime_unauthorized" ? "Runtime credentials rejected" : "Runtime unavailable",
      tone: "warn",
    };
  }
}
