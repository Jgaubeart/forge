import "server-only";

const DEFAULT_TIMEOUT_MS = 10_000;

function getConfig() {
  const baseUrl = process.env.HERMES_API_URL?.replace(/\/$/, "");
  const apiKey = process.env.HERMES_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error("Hermes is not configured");
  }

  return { baseUrl, apiKey };
}

// Central configuration state, without throwing: the runtime boundary turns this
// into a `runtime_not_configured` result rather than an opaque crash.
export function hermesConfigState() {
  const baseUrl = process.env.HERMES_API_URL?.replace(/\/$/, "") ?? null;
  const hasKey = Boolean(process.env.HERMES_API_KEY);
  return { configured: Boolean(baseUrl && hasKey), baseUrl, hasKey };
}

async function hermesFetch(path, options = {}) {
  const { baseUrl, apiKey } = getConfig();
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = options;

  const response = await fetch(`${baseUrl}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
    signal: options.signal ?? AbortSignal.timeout(timeoutMs),
  });

  const text = await response.text();
  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  if (!response.ok) {
    const error = new Error(`Hermes request failed with HTTP ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}

export function isHermesConfigured() {
  return Boolean(process.env.HERMES_API_URL && process.env.HERMES_API_KEY);
}

export function getHermesCapabilities() {
  return hermesFetch("/v1/capabilities", { method: "GET" });
}

export function getHermesHealth() {
  return hermesFetch("/health/detailed", { method: "GET" });
}

export function createHermesRun({
  input,
  sessionId,
  sessionKey,
  instructions,
  conversationHistory,
  previousResponseId,
  idempotencyKey,
}) {
  if (!input || typeof input !== "string") {
    throw new Error("Hermes run input is required");
  }

  const body = {
    input,
    ...(sessionId ? { session_id: sessionId } : {}),
    ...(instructions ? { instructions } : {}),
    ...(conversationHistory ? { conversation_history: conversationHistory } : {}),
    ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
  };

  return hermesFetch("/v1/runs", {
    method: "POST",
    headers: {
      ...(sessionKey ? { "X-Hermes-Session-Key": sessionKey } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

export function getHermesRun(runId) {
  if (!runId) throw new Error("Hermes run id is required");
  return hermesFetch(`/v1/runs/${encodeURIComponent(runId)}`, { method: "GET" });
}

export function getHermesRunEvents(runId, { since = null } = {}) {
  if (!runId) throw new Error("Hermes run id is required");
  const query = since === null ? "" : `?since=${encodeURIComponent(String(since))}`;
  return hermesFetch(`/v1/runs/${encodeURIComponent(runId)}/events${query}`, {
    method: "GET",
  });
}

// The live event stream.
//
// The runtime serves a run's events as server-sent events while the run is live
// and stops serving them once it finishes, so this read is deliberately bounded:
// it stops at the first terminal event, at the event cap, or when the time
// budget runs out, whichever comes first. Anything it misses is not invented —
// the run's own status and output remain the authority for the outcome.
export async function streamHermesRunEvents(runId, { maxMs = 10_000, maxEvents = 250 } = {}) {
  if (!runId) throw new Error("Hermes run id is required");

  const { baseUrl, apiKey } = getConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), maxMs);
  const events = [];

  try {
    const response = await fetch(`${baseUrl}/v1/runs/${encodeURIComponent(runId)}/events`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "text/event-stream" },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      const error = new Error(`Hermes request failed with HTTP ${response.status}`);
      error.status = response.status;
      error.body = safeJson(text);
      throw error;
    }
    if (!response.body) return events;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (events.length < maxEvents) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        const parsed = safeJson(payload);
        if (!parsed || typeof parsed !== "object") continue;
        events.push(parsed);
        if (TERMINAL_RUNTIME_EVENTS.has(String(parsed.event ?? parsed.type ?? ""))) {
          controller.abort();
          return events;
        }
        if (events.length >= maxEvents) break;
      }
    }

    return events;
  } catch (error) {
    // An abort is the budget expiring, not a failure: the events collected so far
    // are still worth keeping.
    if (error?.name === "AbortError" && events.length > 0) return events;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const TERMINAL_RUNTIME_EVENTS = new Set([
  "run.completed",
  "run.failed",
  "run.cancelled",
  "run.canceled",
  "run.stopped",
]);

function safeJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: String(text).slice(0, 400) };
  }
}

export function steerHermesRun(runId, { instruction, requestId = null }) {
  if (!runId) throw new Error("Hermes run id is required");
  if (!instruction || typeof instruction !== "string") {
    throw new Error("A steering instruction is required");
  }
  return hermesFetch(`/v1/runs/${encodeURIComponent(runId)}/steer`, {
    method: "POST",
    body: JSON.stringify({
      instruction: instruction.slice(0, 2000),
      ...(requestId ? { request_id: requestId } : {}),
    }),
  });
}

export function stopHermesRun(runId) {
  if (!runId) throw new Error("Hermes run id is required");
  return hermesFetch(`/v1/runs/${encodeURIComponent(runId)}/stop`, {
    method: "POST",
  });
}

export function resolveHermesApproval(
  runId,
  { choice, requestId, resolveAll = false }
) {
  if (!runId) throw new Error("Hermes run id is required");
  if (!["once", "always", "deny"].includes(choice)) {
    throw new Error("Hermes approval choice must be once, always, or deny");
  }

  return hermesFetch(`/v1/runs/${encodeURIComponent(runId)}/approval`, {
    method: "POST",
    body: JSON.stringify({
      choice,
      ...(requestId ? { request_id: requestId } : {}),
      ...(resolveAll ? { resolve_all: true } : {}),
    }),
  });
}
