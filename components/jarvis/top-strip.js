import { AGENT_COLORS, FLEET } from "@/lib/jarvis-fixtures";

// Legend-style strip (reference #legend) plus the account menu the web build
// needs. The agent dots are the reference's identity cue.
export function JarvisTopStrip({ user, context }) {
  const workspaceName = context?.workspace?.name ?? null;

  return (
    <div className="jv-top">
      <div className="jv-top-start">
        <span className="jv-pill accent">{workspaceName ?? "fixture workspace"}</span>
        <span className="jv-meta">{FLEET.name} · SCOUT + FORGE + SAGE</span>
      </div>

      <div className="jv-top-end">
        <div className="jv-legend">
          {Object.entries(AGENT_COLORS)
            .slice(0, 5)
            .map(([name, color]) => (
              <span key={name}>
                <span
                  className="jv-dot lg on"
                  style={{ background: color, color }}
                  aria-hidden="true"
                />
                {name}
              </span>
            ))}
        </div>

        <details className="jv-menu">
          <summary className="jv-btn ghost">{user?.email ?? "signed in"}</summary>
          <div className="jv-card" style={{ marginTop: 8, minWidth: 210 }}>
            <div className="jv-mono" style={{ color: "#f1f5f9" }}>
              {user?.email ?? "—"}
            </div>
            <form action="/auth/signout" method="post" style={{ marginTop: 8 }}>
              <button className="jv-btn ghost" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </details>
      </div>
    </div>
  );
}
