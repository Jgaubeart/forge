// Typed errors for the Forge runtime boundary.
//
// Every denial the runtime can produce has a code, so callers (server actions,
// UI, tests) can branch on the reason without parsing messages. Messages are
// written to be safe to display: they never include credentials or raw payloads.

export const RUNTIME_ERROR_CODES = Object.freeze({
  unauthorized: "unauthorized",
  notFound: "not_found",
  invalidRequest: "invalid_request",
  validationFailed: "validation_failed",
  capabilityDenied: "capability_denied",
  connectionDenied: "connection_denied",
  connectionNotFound: "connection_not_found",
  approvalRequired: "approval_required",
  approvalConflict: "approval_conflict",
  toolUnavailable: "tool_unavailable",
  notConfigured: "not_configured",
  conflict: "conflict",
  hermesUnavailable: "hermes_unavailable",
  adapterFailed: "adapter_failed",
});

export class RuntimeError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "RuntimeError";
    this.code = code;
    this.details = details;
  }
}

export function isRuntimeError(error) {
  return error instanceof RuntimeError;
}

// Reduces any thrown value to something safe to persist, log, or display.
// Stack traces and raw payloads never cross this boundary.
export function toSafeError(error) {
  if (isRuntimeError(error)) {
    return {
      code: error.code,
      message: String(error.message ?? "").slice(0, 300),
      details: error.details ?? {},
    };
  }

  const name = String(error?.name ?? "Error").slice(0, 60);
  const message = String(error?.message ?? "Unknown error").slice(0, 300);
  return { code: RUNTIME_ERROR_CODES.adapterFailed, message, details: {} };
}
