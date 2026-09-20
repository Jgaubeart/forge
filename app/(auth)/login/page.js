import { login, signup } from "./actions";

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const rawMessage = params?.message;
  const message = Array.isArray(rawMessage) ? rawMessage[0] : rawMessage;

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "32px",
      }}
    >
      <form style={{ width: "min(360px, 100%)", display: "grid", gap: "16px" }}>
        <h1 style={{ textAlign: "center", margin: "0 0 8px" }}>Forge</h1>

        {message ? (
          <p style={{ margin: 0, textAlign: "center", opacity: 0.8 }}>
            {message}
          </p>
        ) : null}

        <label
          htmlFor="email"
          style={{ display: "grid", gap: "6px", fontSize: "14px" }}
        >
          Email
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            style={{
              padding: "10px 12px",
              borderRadius: "6px",
              border: "1px solid #2a2f36",
              background: "#12151a",
              color: "#f5f7fa",
            }}
          />
        </label>

        <label
          htmlFor="password"
          style={{ display: "grid", gap: "6px", fontSize: "14px" }}
        >
          Password
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            style={{
              padding: "10px 12px",
              borderRadius: "6px",
              border: "1px solid #2a2f36",
              background: "#12151a",
              color: "#f5f7fa",
            }}
          />
        </label>

        <button
          type="submit"
          formAction={login}
          style={{
            padding: "10px 12px",
            borderRadius: "6px",
            border: "none",
            background: "#2f6feb",
            color: "#ffffff",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Log in
        </button>

        <button
          type="submit"
          formAction={signup}
          style={{
            padding: "10px 12px",
            borderRadius: "6px",
            border: "1px solid #2a2f36",
            background: "transparent",
            color: "#f5f7fa",
            cursor: "pointer",
          }}
        >
          Sign up
        </button>
      </form>
    </main>
  );
}
