import "server-only";

function getConfig() {
  const baseUrl = process.env.HERMES_API_URL?.replace(/\/$/, "");
  const apiKey = process.env.HERMES_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error("Hermes is not configured");
  }

  return { baseUrl, apiKey };
}

async function hermesFetch(path, options = {}) {
  const { baseUrl, apiKey } = getConfig();

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
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
