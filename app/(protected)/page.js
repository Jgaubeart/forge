import { getCurrentUser } from "@/lib/auth";

export default async function ForgeHome() {
  const user = await getCurrentUser();

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "32px",
      }}
    >
      <section style={{ maxWidth: "720px", textAlign: "center" }}>
        <div
          style={{
            fontSize: "12px",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            opacity: 0.55,
          }}
        >
          Korben OS
        </div>
        <h1 style={{ fontSize: "64px", margin: "12px 0 16px" }}>Forge</h1>
        <p style={{ fontSize: "20px", lineHeight: 1.6, opacity: 0.72, margin: 0 }}>
          Shared AI workforce. Forge is online and ready for the first agent.
        </p>

        {user ? (
          <p style={{ marginTop: "24px", opacity: 0.85 }}>
            Signed in as {user.email} ({user.id})
          </p>
        ) : null}

        <form action="/auth/signout" method="post" style={{ marginTop: "24px" }}>
          <button
            type="submit"
            style={{
              padding: "10px 18px",
              borderRadius: "6px",
              border: "1px solid #2a2f36",
              background: "transparent",
              color: "#f5f7fa",
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </form>
      </section>
    </main>
  );
}
