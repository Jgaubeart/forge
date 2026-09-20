export default function Home() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "32px" }}>
      <section style={{ maxWidth: "720px", textAlign: "center" }}>
        <div style={{ fontSize: "12px", letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.55 }}>
          Korben OS
        </div>
        <h1 style={{ fontSize: "64px", margin: "12px 0 16px" }}>Forge</h1>
        <p style={{ fontSize: "20px", lineHeight: 1.6, opacity: 0.72, margin: 0 }}>
          Shared AI workforce. Forge is online and ready for the first agent.
        </p>
      </section>
    </main>
  );
}
