import {
  getHermesCapabilities,
  getHermesHealth,
  isHermesConfigured,
} from "../../../../lib/hermes/client";

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
      },
      { status: 502 }
    );
  }
}
