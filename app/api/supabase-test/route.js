export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return Response.json(
      {
        ok: false,
        configured: false,
        error: "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
      },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return Response.json(
        {
          ok: false,
          configured: true,
          reachable: true,
          status: response.status,
          error: "Supabase rejected the configured credentials",
        },
        { status: 502 }
      );
    }

    return Response.json({
      ok: true,
      configured: true,
      reachable: true,
      message: "Forge is connected to Supabase",
    });
  } catch {
    return Response.json(
      {
        ok: false,
        configured: true,
        reachable: false,
        error: "Could not reach Supabase",
      },
      { status: 502 }
    );
  }
}
