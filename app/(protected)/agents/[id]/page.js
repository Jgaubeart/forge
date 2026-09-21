import Link from "next/link";
import { notFound } from "next/navigation";

import { TaskRow } from "@/components/forge/lists";
import {
  ActionLevel,
  EmptyState,
  Notice,
  PageHeader,
  Pill,
  Section,
} from "@/components/forge/ui";
import { requireForgeContext } from "@/lib/forge/context";
import { actorLabel, formatDateTime, formatWhen } from "@/lib/forge/format";
import {
  getAgent,
  listConnections,
  listTasksForAgent,
  loadWork,
} from "@/lib/forge/queries";
import { runStatusMeta } from "@/lib/forge/status";

export default async function AgentDetailPage({ params }) {
  const { id } = await params;
  const context = await requireForgeContext();
  const supabase = context.supabase;

  const agentResult = await getAgent(supabase, id);
  if (!agentResult.agent) notFound();

  const agent = agentResult.agent;

  const [tasksResult, work, connectionsResult] = await Promise.all([
    listTasksForAgent(supabase, agent.id, { limit: 8 }),
    loadWork(supabase, context.workspace?.id, { limit: 200 }),
    listConnections(supabase, context.workspace?.id, context.membership?.id),
  ]);

  const agentTaskIds = new Set([
    ...tasksResult.tasks.map((task) => task.id),
    ...work.tasks.filter((task) => task.agent_id === agent.id).map((task) => task.id),
  ]);
  const runs = work.runs
    .filter((run) => agentTaskIds.has(run.task_id))
    .slice(0, 8);
  const taskById = new Map(
    [...tasksResult.tasks, ...work.tasks].map((task) => [task.id, task])
  );

  return (
    <>
      <PageHeader
        eyebrow="Agent"
        title={agent.name}
        subtitle={agent.description ?? "No description recorded for this agent."}
        meta={`${agent.department?.name ?? "No department"} · slug ${agent.slug}`}
        actions={
          <Link className="forge-button" href="/agents">
            All agents
          </Link>
        }
      />

      <div className="forge-stack forge-stack--pushed">
        {agentResult.failed || tasksResult.failed || work.failed ? (
          <Notice tone="warn">
            Part of this agent could not be loaded. Showing what is available.
          </Notice>
        ) : null}

        <div className="forge-grid forge-grid--halves">
          <Section title="Purpose">
            {agent.instructions ? (
              <p className="forge-prose">{agent.instructions}</p>
            ) : (
              <p className="forge-meta">No instructions recorded for this agent.</p>
            )}
          </Section>

          <Section title="Capabilities" meta={agentResult.capabilities.length}>
            {agentResult.capabilities.length > 0 ? (
              <div className="forge-table-wrap">
                <table className="forge-table">
                  <thead>
                    <tr>
                      <th>Capability</th>
                      <th>Max action level</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentResult.capabilities.map((capability) => (
                      <tr key={capability.capability}>
                        <td className="forge-mono">{capability.capability}</td>
                        <td>
                          <ActionLevel level={capability.max_action_level} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No capabilities granted"
                text="An agent without capabilities cannot act. Grants appear here once they are recorded."
              />
            )}
          </Section>
        </div>

        <Section
          title="Recent tasks"
          meta={tasksResult.tasks.length}
          action={
            tasksResult.tasks.length > 0 ? (
              <Link className="forge-section-link" href="/tasks">
                All tasks
              </Link>
            ) : null
          }
        >
          {tasksResult.tasks.length > 0 ? (
            <div className="forge-rows">
              {tasksResult.tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  agentName={agent.name}
                  requesterLabel={actorLabel(task.requested_by, context.user.id)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              glyph="spark"
              title="No tasks yet"
              text="Work assigned to this agent appears here with its status."
            />
          )}
        </Section>

        <Section title="Recent runs" meta={runs.length}>
          {runs.length > 0 ? (
            <div className="forge-rows">
              {runs.map((run) => {
                const status = runStatusMeta(run.status);
                const task = taskById.get(run.task_id);

                return (
                  <Link
                    className="forge-row"
                    href={`/tasks/${run.task_id}`}
                    key={run.id}
                  >
                    <span className="forge-row-main">
                      <span className="forge-row-title">
                        {task ? task.title : "Task unavailable"}
                      </span>
                      <span className="forge-row-meta">
                        <span>
                          {run.started_at
                            ? `started ${formatDateTime(run.started_at)}`
                            : `created ${formatDateTime(run.created_at)}`}
                        </span>
                        {run.hermes_run_id ? (
                          <span className="forge-mono">
                            {run.hermes_run_id.slice(0, 12)}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="forge-row-end">
                      <Pill label={status.label} tone={status.tone} live={status.live} />
                      <span
                        className="forge-row-time"
                        title={formatDateTime(run.created_at)}
                      >
                        {formatWhen(run.created_at)}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState
              glyph="spark"
              title="No runs yet"
              text="Hermes execution history for this agent appears here."
            />
          )}
        </Section>

        <Section title="Connections available" meta={connectionsResult.connections.length}>
          {connectionsResult.connections.length > 0 ? (
            <div className="forge-rows">
              {connectionsResult.connections.map((connection) => (
                <div className="forge-row" key={connection.id}>
                  <span className="forge-row-main">
                    <span className="forge-row-title">
                      {connection.label || connection.provider}
                    </span>
                    <span className="forge-row-meta">
                      <span>{connection.provider}</span>
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              glyph="plug"
              title="No connections available"
              text="Connect services to give this agent access to the data it needs."
            />
          )}

          <p className="forge-meta-faint forge-pad-top">
            Per-agent connection grants are not modeled yet. Forge supplies only
            the connections the signed-in person is authorized to use.
          </p>
        </Section>
      </div>
    </>
  );
}
