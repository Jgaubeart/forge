import Link from "next/link";

import {
  ActionLevel,
  ChipList,
  Dot,
  EmptyState,
  Notice,
  PageHeader,
  Section,
} from "@/components/forge/ui";
import { requireForgeContext } from "@/lib/forge/context";
import { groupBy } from "@/lib/forge/db";
import { listFleets, loadWork, listAgents } from "@/lib/forge/queries";
import { agentState } from "@/lib/forge/status";

export default async function AgentsPage() {
  const context = await requireForgeContext();
  const supabase = context.supabase;

  const [agentsResult, work, fleetsResult] = await Promise.all([
    listAgents(supabase),
    loadWork(supabase, context.workspace?.id, { limit: 100 }),
    listFleets(supabase),
  ]);

  const agents = agentsResult.agents;
  const tasksByAgent = groupBy(work.tasks, "agent_id");
  const taskById = new Map(work.tasks.map((task) => [task.id, task]));
  const runsByAgent = new Map();
  for (const run of work.runs) {
    const agentId = taskById.get(run.task_id)?.agent_id;
    if (!agentId) continue;
    const bucket = runsByAgent.get(agentId);
    if (bucket) bucket.push(run);
    else runsByAgent.set(agentId, [run]);
  }

  return (
    <>
      <PageHeader
        eyebrow="Workforce"
        title="Agents"
        subtitle="The shared agent catalog. Each agent declares its capabilities and the highest action level it may take."
        meta={`${agents.length} agent${agents.length === 1 ? "" : "s"} visible`}
      />

      <div className="forge-stack forge-stack--pushed">
        {agentsResult.failed || work.failed ? (
          <Notice tone="warn">
            Agent data could not be fully loaded. Showing what is available.
          </Notice>
        ) : null}

        {fleetsResult.fleets.map((fleet) => (
          <Section
            key={fleet.id}
            title={fleet.name}
            meta={`${fleet.members.length} agents`}
          >
            <div className="forge-team">
              {fleet.members.map((member) => (
                <span className="forge-team-chip" key={member.slug}>
                  <Dot tone="accent" />
                  {member.name}
                  <em>{member.role}</em>
                </span>
              ))}
            </div>
            {fleet.description ? (
              <p className="forge-meta-faint forge-pad-top">{fleet.description}</p>
            ) : null}
          </Section>
        ))}

        <Section title="Catalog">
          {agents.length > 0 ? (
            <div className="forge-table-wrap">
              <table className="forge-table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Department</th>
                    <th>Status</th>
                    <th>Capabilities</th>
                    <th>Max action</th>
                    <th>Delegation</th>
                    <th>Active</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent) => {
                    const state = agentState(
                      tasksByAgent.get(agent.id) ?? [],
                      runsByAgent.get(agent.id) ?? []
                    );

                    return (
                      <tr key={agent.id}>
                        <td>
                          <Link
                            className="forge-cell-strong"
                            href={`/agents/${agent.id}`}
                          >
                            {agent.name}
                          </Link>
                          {agent.description ? (
                            <span className="forge-cell-muted forge-truncate">
                              {agent.description}
                            </span>
                          ) : null}
                        </td>
                        <td className="forge-cell-muted">
                          {agent.department?.name ?? "—"}
                        </td>
                        <td>
                          <span className="forge-inline-list">
                            <Dot tone={state.tone} live={state.live} />
                            <span className="forge-cell-muted">{state.label}</span>
                          </span>
                        </td>
                        <td>
                          <ChipList
                            items={agent.capabilities.map(
                              (capability) => capability.capability
                            )}
                            max={2}
                          />
                        </td>
                        <td>
                          <ActionLevel level={agent.maxActionLevel} />
                        </td>
                        <td className="forge-cell-muted">
                          {agent.delegationEnabled ? "Allowed" : "Not allowed"}
                        </td>
                        <td className="forge-cell-muted">
                          {agent.is_active ? "Yes" : "No"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              glyph="spark"
              title="No agents yet"
              text="Agents defined in Forge appear here. The shared catalog is used by every workspace."
            />
          )}
        </Section>

        <p className="forge-meta-faint">
          Agents are read-only in this phase. Only active agents are visible to
          workspace members.
        </p>
      </div>
    </>
  );
}
