// The runtime interface.
//
// The mission domain, persistence, and UI depend on this shape — not on Hermes.
// Any adapter (Hermes today, something else later, the test fake) satisfies it,
// and `assertRuntimeAdapter` fails loudly when one does not.

import { RUNTIME_ERROR_CODES, runtimeError } from "./errors.js";

export const RUNTIME_METHODS = Object.freeze([
  "getCapabilities",
  "health",
  "createRun",
  "getRun",
  "getRunEvents",
  "stopRun",
  "resolveApproval",
  "steerRun",
]);

export function isRuntimeAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") return false;
  return RUNTIME_METHODS.every((method) => typeof adapter[method] === "function");
}

export function assertRuntimeAdapter(adapter) {
  const missing = RUNTIME_METHODS.filter(
    (method) => typeof adapter?.[method] !== "function"
  );

  if (missing.length > 0) {
    throw runtimeError(RUNTIME_ERROR_CODES.notImplemented, {
      message: `The runtime adapter is missing: ${missing.join(", ")}.`,
    });
  }

  return adapter;
}

// Documentation of the boundary, kept next to the code that enforces it.
export const RUNTIME_OWNERSHIP = Object.freeze({
  runtime: [
    "model execution",
    "agent runtime and loop",
    "tool invocation mechanics",
    "subagent execution",
    "retries",
    "runtime lifecycle and cancellation mechanics",
  ],
  controlPlane: [
    "authentication",
    "organisations and workspaces",
    "agent definitions",
    "mission state",
    "permissions and capability grants",
    "approvals",
    "receipts",
    "durable history",
    "the interface",
  ],
});
