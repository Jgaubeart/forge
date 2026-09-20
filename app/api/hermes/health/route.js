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
      message: "Forge is ready for Hermes, but HERMES_API_URL and HERMES_API_KEY are not configured.",
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
      health,
      capabilities,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        configured: true,
        error: "Forge could not reach the configured Hermes runtime.",
        status: error?.status || null,
      },
      { status: 502 }
    );
  }
}
