import Link from "next/link";

import { initials } from "@/lib/forge/format";

export function ForgeTopbar({ context }) {
  const { displayName, user, workspace, organization, membership } = context;

  return (
    <header className="forge-topbar">
      <div className="forge-topbar-start">
        <span className="forge-wordmark">Forge</span>
        <span className="forge-workspace" title={workspace ? workspace.name : "No workspace"}>
          <span className="forge-workspace-glyph" />
          {workspace ? (
            <>
              <strong>{workspace.name}</strong>
              {organization ? <span>· {organization.name}</span> : null}
            </>
          ) : (
            <span>No workspace yet</span>
          )}
        </span>
      </div>

      <div className="forge-topbar-end">
        <details className="forge-menu">
          <summary className="forge-menu-trigger">
            <span className="forge-avatar" aria-hidden="true">
              {initials(displayName)}
            </span>
            <span>{displayName}</span>
          </summary>

          <div className="forge-menu-panel">
            <div className="forge-menu-identity">
              <div className="forge-menu-name">{displayName}</div>
              {user.email ? (
                <div className="forge-menu-email">{user.email}</div>
              ) : null}
              <div className="forge-meta-faint">
                {membership
                  ? `${membership.role}${workspace ? ` · ${workspace.name}` : ""}`
                  : "No workspace membership"}
              </div>
            </div>

            <Link className="forge-menu-item" href="/settings">
              Settings
            </Link>

            <form action="/auth/signout" method="post">
              <button className="forge-menu-item" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </details>
      </div>
    </header>
  );
}
