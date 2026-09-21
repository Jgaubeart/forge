import {
  EmptyState,
  Notice,
  PageHeader,
  Pill,
  Section,
} from "@/components/forge/ui";
import { requireForgeContext } from "@/lib/forge/context";
import { actorLabel } from "@/lib/forge/format";
import { listConnections } from "@/lib/forge/queries";
import { connectionStatusMeta, permissionLevel } from "@/lib/forge/status";

export default async function ConnectionsPage() {
  const context = await requireForgeContext();
  const { connections, permissions, failed } = await listConnections(
    context.supabase,
    context.workspace?.id,
    context.membership?.id
  );

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Connections"
        subtitle="The services your workforce is allowed to reach, and the access each one carries."
        meta={
          context.workspace
            ? `${connections.length} connection${
                connections.length === 1 ? "" : "s"
              }`
            : "No workspace membership yet"
        }
      />

      <div className="forge-stack forge-stack--pushed">
        {failed ? (
          <Notice tone="warn">
            Connection data could not be fully loaded. Showing what is available.
          </Notice>
        ) : null}

        <Section title="Connected services" meta={connections.length}>
          {connections.length > 0 ? (
            <div className="forge-table-wrap">
              <table className="forge-table">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Account</th>
                    <th>Owner</th>
                    <th>Status</th>
                    <th>Your access</th>
                  </tr>
                </thead>
                <tbody>
                  {connections.map((connection) => {
                    const status = connectionStatusMeta(connection.status);
                    const isOwner = connection.owner_user_id === context.user.id;
                    const access = isOwner
                      ? "Owner"
                      : permissionLevel(permissions.get(connection.id));

                    return (
                      <tr key={connection.id}>
                        <td className="forge-cell-strong">
                          {connection.provider}
                        </td>
                        <td className="forge-cell-muted">
                          {connection.label || "—"}
                        </td>
                        <td className="forge-cell-muted">
                          {actorLabel(connection.owner_user_id, context.user.id)}
                        </td>
                        <td>
                          <Pill label={status.label} tone={status.tone} />
                        </td>
                        <td className="forge-cell-muted">{access}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              glyph="plug"
              title="No connections yet"
              text="Connect services to give your workforce access to the tools and information they need."
            />
          )}
        </Section>

        <p className="forge-meta-faint">
          Connection credentials are never shown in Forge. Managing connections —
          including Gmail — arrives in a later release.
        </p>
      </div>
    </>
  );
}
