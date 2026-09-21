import { EmptyState, Notice, PageHeader, Pill, Section } from "@/components/forge/ui";
import { requireForgeContext } from "@/lib/forge/context";
import { actorLabel } from "@/lib/forge/format";
import { listConnections } from "@/lib/forge/queries";
import { connectionStatusMeta, permissionLevel } from "@/lib/forge/status";
import { createToolRegistry } from "@/lib/forge/runtime/tools/registry.js";

// The Tool Armory, ported from the reference build: one server-side registry of
// everything Forge can do, with the capability, action level, and review policy
// for each tool, next to the connections those tools would use.
export default async function ToolsPage() {
  const context = await requireForgeContext();
  const registry = createToolRegistry();
  const tools = registry.list();

  const { connections, permissions, failed } = await listConnections(
    context.supabase,
    context.workspace?.id,
    context.membership?.id
  );

  const available = tools.filter((tool) => tool.available);
  const planned = tools.filter((tool) => !tool.available);

  return (
    <>
      <PageHeader
        eyebrow="Tool armory"
        title="Tools"
        subtitle="What Forge can do, the capability each tool needs, and the review policy that gates it."
        meta={`${available.length} active · ${planned.length} declared · ${connections.length} connections`}
      />

      <div className="forge-stack forge-stack--pushed">
        {failed ? (
          <Notice tone="warn">
            Connection data could not be fully loaded. Showing what is available.
          </Notice>
        ) : null}

        <Section title="Active tools" meta={available.length}>
          {available.length > 0 ? (
            <ToolGrid tools={available} />
          ) : (
            <EmptyState
              title="No active tools"
              text="Every provider integration is declared but not implemented yet."
            />
          )}
        </Section>

        <Section title="Declared tools" meta={planned.length}>
          <ToolGrid tools={planned} />
          <p className="forge-meta-faint forge-pad-top">
            A declared tool has no provider adapter yet. Hermes can see the
            declaration, but Forge refuses to execute it and never fabricates a
            result. Nothing here is implied to work.
          </p>
        </Section>

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
                    return (
                      <tr key={connection.id}>
                        <td className="forge-cell-strong">{connection.provider}</td>
                        <td className="forge-cell-muted">{connection.label || "—"}</td>
                        <td className="forge-cell-muted">
                          {actorLabel(connection.owner_user_id, context.user.id)}
                        </td>
                        <td>
                          <Pill label={status.label} tone={status.tone} />
                        </td>
                        <td className="forge-cell-muted">
                          {isOwner ? "Owner" : permissionLevel(permissions.get(connection.id))}
                        </td>
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
          Credentials never leave Forge. The runtime asks the tool gateway to act,
          Forge resolves the connection server-side with your permissions, and
          only a bounded result goes back.
        </p>
      </div>
    </>
  );
}

function ToolGrid({ tools }) {
  return (
    <div className="forge-armory">
      {tools.map((tool) => (
        <article className="forge-tool" key={tool.id} data-available={String(tool.available)}>
          <div className="forge-tool-head">
            <span className="forge-tool-name">{tool.title}</span>
            <Pill
              label={tool.actionLevel.toUpperCase()}
              tone={tool.actionLevel === "execute" ? "warn" : tool.actionLevel === "draft" ? "info" : "muted"}
            />
          </div>
          <div className="forge-tool-id">{tool.id}</div>
          <p className="forge-meta-faint">{tool.description}</p>
          <div className="forge-tool-meta">
            <span className="forge-mono">{tool.capability}</span>
            <span>
              {tool.requiresApproval ? "operator confirmation" : "trusted read"}
            </span>
            {tool.requiresConnection ? <span>needs a connection</span> : null}
            <span>{tool.available ? "active" : "declared, not implemented"}</span>
          </div>
        </article>
      ))}
    </div>
  );
}
