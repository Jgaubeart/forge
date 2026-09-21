import {
  getHermesCapabilities,
  getHermesHealth,
  isHermesConfigured,
} from "../../../../lib/hermes/client";

// Temporary debugging helper. This endpoint is public, so only these fields are
// ever returned: arbitrary properties (which can hold request config, headers,
// or the Hermes API key) are never copied.
const CAUSE_FIELDS = ["name", "message", "code"];
const CAUSE_DEPTH_LIMIT = 3;

function sanitizeCause(cause, depth = 0) {
  if (cause === undefined || cause === null || depth > CAUSE_DEPTH_LIMIT) {
    return null;
  }

  if (typeof cause === "string" || typeof cause === "number") {
    return cause;
  }

  if (typeof cause !== "object") {
    return null;
  }

  if (Array.isArray(cause)) {
    return cause.map((entry) => sanitizeCause(entry, depth + 1));
  }

  const safe = {};

  for (const key of CAUSE_FIELDS) {
    const value = cause[key];
    if (typeof value === "string" || typeof value === "number") {
      safe[key] = value;
    }
  }

  // Follow nested causes (e.g. AggregateError.errors) so the underlying network
  // failure is still visible, applying the same allowlist at each level.
  for (const key of ["cause", "errors"]) {
    const nested = cause[key];
    if (nested !== undefined && nested !== null) {
      safe[key] = sanitizeCause(nested, depth + 1);
    }
  }

  return Object.keys(safe).length > 0 ? safe : null;
}

export async function GET() {
  if (!isHermesConfigured()) {
    return Response.json({
      ok: false,
      configured: false,
      message: "Hermes runtime is not configured.",
    });
  }

  try {
    const [health, capabilities] = await Promise.all([
      getHermesHealth(),
      getHermesCapabilities(),
    ]);

    return Response.json({
      ok: true,
      configured: true,
      status: health?.status || health?.ok || "reachable",
      runsApiAvailable: Boolean(capabilities),
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        configured: true,
        error: "Configured Hermes runtime is unreachable.",
        status: error?.status || null,
        name: error?.name || null,
        message: error?.message || null,
        cause: sanitizeCause(error?.cause),
      },
      { status: 502 }
    );
  }
}
