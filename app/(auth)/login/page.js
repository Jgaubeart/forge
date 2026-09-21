import { login, signup } from "./actions";

export const metadata = {
  title: "Sign in · Forge",
};

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const rawMessage = params?.message;
  const message = Array.isArray(rawMessage) ? rawMessage[0] : rawMessage;

  return (
    <main className="forge-auth">
      <div className="forge-auth-card">
        <div className="forge-auth-mark">
          <span className="forge-auth-glyph" aria-hidden="true">
            F
          </span>
          <span className="forge-wordmark">Forge</span>
        </div>

        <h1 className="forge-auth-title">Sign in</h1>
        <p className="forge-auth-sub">Shared AI workforce for Korben OS.</p>

        {message ? <p className="forge-auth-message">{message}</p> : null}

        <form className="forge-auth-form">
          <label className="forge-field" htmlFor="email">
            Email
            <input
              className="forge-input"
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
            />
          </label>

          <label className="forge-field" htmlFor="password">
            Password
            <input
              className="forge-input"
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </label>

          <button
            className="forge-button forge-button--primary"
            type="submit"
            formAction={login}
          >
            Log in
          </button>

          <button className="forge-button" type="submit" formAction={signup}>
            Sign up
          </button>
        </form>

        <p className="forge-meta-faint forge-auth-note">
          Access is managed through Supabase Auth. Signing up sends a
          confirmation email when email confirmation is enabled.
        </p>
      </div>
    </main>
  );
}
