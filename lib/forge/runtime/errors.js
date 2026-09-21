// Normalized runtime errors.
//
// Every failure the runtime boundary can produce has a Forge-owned code, so the
// mission domain, the persistence layer, and the UI never have to interpret
// Hermes-specific status codes or response bodies. Upstream payloads are never
// forwarded: only a short, safe message survives.

export const RUNTIME_ERROR_CODES = Object.freeze({
  notConfigured: "runtime_not_configured",
  unreachable: "runtime_unreachable",
  unauthorized: "runtime_unauthorized",
  timeout: "runtime_timeout",
  badResponse: "runtime_bad_response",
  runNotFound: "runtime_run_not_found",
  rejected: "runtime_rejected",
  notImplemented: "runtime_not_implemented",
  invalidRequest: "runtime_invalid_request",
});

export class RuntimeError extends Error {
  constructor(code, message, { status = null, detail = null } = {}) {
    super(message);
    this.name = "RuntimeError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

const MESSAGES = Object.freeze({
  [RUNTIME_ERROR_CODES.notConfigured]:
    "The execution runtime is not configured, so nothing can be dispatched.",
  [RUNTIME_ERROR_CODES.unreachable]: "The execution runtime could not be reached.",
  [RUNTIME_ERROR_CODES.unauthorized]:
    "The execution runtime rejected Forge's credentials.",
  [RUNTIME_ERROR_CODES.timeout]: "The execution runtime did not answer in time.",
  [RUNTIME_ERROR_CODES.badResponse]:
    "The execution runtime returned a response Forge could not read.",
  [RUNTIME_ERROR_CODES.runNotFound]: "That run is not known to the execution runtime.",
  [RUNTIME_ERROR_CODES.rejected]: "The execution runtime refused the request.",
});

export function isRuntimeError(error) {
  return error instanceof RuntimeError;
}

export function runtimeError(code, options = {}) {
  return new RuntimeError(code, options.message ?? MESSAGES[code] ?? code, options);
}

// A safe, short string from an upstream body: never the whole payload.
function safeDetail(body) {
  if (!body || typeof body !== "object") {
    return typeof body === "string" ? body.slice(0, 120) : null;
  }
  const candidate = body.message ?? body.error ?? body.detail ?? body.error_description;
  return typeof candidate === "string" ? candidate.slice(0, 200) : null;
}

export function runtimeErrorFromStatus(status, body = null) {
  const options = { status, detail: safeDetail(body) };

  if (status === 401 || status === 403) {
    return runtimeError(RUNTIME_ERROR_CODES.unauthorized, options);
  }
  if (status === 404) {
    return runtimeError(RUNTIME_ERROR_CODES.runNotFound, options);
  }
  if (status === 408 || status === 504) {
    return runtimeError(RUNTIME_ERROR_CODES.timeout, options);
  }
  if (status >= 400 && status < 500) {
    return runtimeError(RUNTIME_ERROR_CODES.rejected, options);
  }
  return runtimeError(RUNTIME_ERROR_CODES.badResponse, options);
}

export function runtimeErrorFromException(error) {
  const name = String(error?.name ?? "");
  const message = String(error?.message ?? "");

  if (name === "AbortError" || name === "TimeoutError" || /timed out/i.test(message)) {
    return runtimeError(RUNTIME_ERROR_CODES.timeout, { detail: message.slice(0, 120) });
  }
  if (name === "TypeError" || /fetch failed|ENOTFOUND|ECONNREFUSED|getaddrinfo/i.test(message)) {
    return runtimeError(RUNTIME_ERROR_CODES.unreachable, { detail: message.slice(0, 120) });
  }
  if (isRuntimeError(error)) return error;

  return runtimeError(RUNTIME_ERROR_CODES.badResponse, { detail: message.slice(0, 120) });
}
