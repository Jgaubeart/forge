import {
  ActionLevel,
  EmptyState,
  PageHeader,
  Section,
} from "@/components/forge/ui";
import { requireForgeContext } from "@/lib/forge/context";
import { formatDate } from "@/lib/forge/format";

export default async function SettingsPage() {
  const context = await requireForgeContext();
  const { user, displayName, workspace, organization, membership, capabilities } =
    context;

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        subtitle="Your account, your workspace, and the capabilities granted to your membership."
      />

      <div className="forge-stack forge-stack--pushed">
        <div className="forge-grid forge-grid--halves">
          <Section title="Account">
            <dl className="forge-kv">
              <div className="forge-kv-row">
                <dt>Name</dt>
                <dd>{displayName}</dd>
              </div>
              <div className="forge-kv-row">
                <dt>Email</dt>
                <dd>{user.email ?? "—"}</dd>
              </div>
              <div className="forge-kv-row">
                <dt>User id</dt>
                <dd className="forge-mono">{user.id}</dd>
              </div>
              <div className="forge-kv-row">
                <dt>Role</dt>
                <dd>{membership?.role ?? "—"}</dd>
              </div>
            </dl>

            <form
              action="/auth/signout"
              method="post"
              className="forge-pad-top"
            >
              <button className="forge-button" type="submit">
                Sign out
              </button>
            </form>
          </Section>

          <Section title="Workspace">
            {workspace ? (
              <dl className="forge-kv">
                <div className="forge-kv-row">
                  <dt>Workspace</dt>
                  <dd>{workspace.name}</dd>
                </div>
                <div className="forge-kv-row">
                  <dt>Slug</dt>
                  <dd className="forge-mono">{workspace.slug}</dd>
                </div>
                <div className="forge-kv-row">
                  <dt>Kind</dt>
                  <dd>{workspace.kind}</dd>
                </div>
                <div className="forge-kv-row">
                  <dt>Organization</dt>
                  <dd>{organization?.name ?? "Not set"}</dd>
                </div>
                <div className="forge-kv-row">
                  <dt>Since</dt>
                  <dd>{formatDate(workspace.created_at)}</dd>
                </div>
              </dl>
            ) : (
              <EmptyState
                title="No workspace yet"
                text="Your account is signed in but is not a member of a workspace. A workspace is created when your organization is set up."
              />
            )}
          </Section>
        </div>

        <Section title="Membership capabilities" meta={capabilities.length}>
          {capabilities.length > 0 ? (
            <div className="forge-table-wrap">
              <table className="forge-table">
                <thead>
                  <tr>
                    <th>Capability</th>
                    <th>Action level</th>
                  </tr>
                </thead>
                <tbody>
                  {capabilities.map((capability) => (
                    <tr key={capability.capability}>
                      <td className="forge-mono">{capability.capability}</td>
                      <td>
                        <ActionLevel level={capability.action_level} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No capability grants recorded"
              text="Capabilities decide which actions your workforce may take on your behalf. They appear here once granted."
            />
          )}
        </Section>

        <p className="forge-meta-faint">
          Settings for billing, connections, and agent creation are not part of
          this release. Workspace identity is managed in Supabase.
        </p>
      </div>
    </>
  );
}
