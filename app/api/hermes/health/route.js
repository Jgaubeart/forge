import {
  getHermesCapabilities,
  getHermesHealth,
  isHermesConfigured,
} from "../../../../lib/hermes/client";

// Temporary debugging helper: returns a safe subset of an error's cause so the
// response never leaks secrets, headers, or the Hermes API key.
function sanitizeCause(cause) {
  if (cause === undefined || cause === null) {
    return null;
  }

  if (typeof cause !== "object") {
    return String(cause);
  }

  const sensitive = /authorization|header|token|secret|api[_-]?key|cookie|password/i;
  const safe = {};

  for (const key of ["name", "message", "code"]) {
    const value = cause[key];
    if (typeof value === "string" || typeof value === "number") {
      safe[key] = value;
    }
  }

  for (const [key, value] of Object.entries(cause)) {
    if (sensitive.test(key)) {
      continue;
    }
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      safe[key] = value;
    } else if (value !== undefined) {
      safe[key] = String(value);
    }
  }

  return safe;
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
