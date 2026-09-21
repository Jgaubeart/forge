import Link from "next/link";

import { ActivityTimeline, AgentLine, TaskRow } from "@/components/forge/lists";
import {
  ActionLevel,
  Dot,
  EmptyState,
  MetricRow,
  Notice,
  PageHeader,
  Pill,
  Section,
} from "@/components/forge/ui";
import { requireForgeContext } from "@/lib/forge/context";
import { groupBy } from "@/lib/forge/db";
import { actorLabel, formatWhen } from "@/lib/forge/format";
import {
  listActivity,
  listAgents,
  listConnections,
  loadWork,
} from "@/lib/forge/queries";
import {
  connectionStatusMeta,
  isFailedTask,
  isRunningTask,
  isWaitingTask,
} from "@/lib/forge/status";

const WORK_WINDOW = 100;
const CURRENT_WORK_LIMIT = 6;
const ATTENTION_LIMIT = 3;
const ACTIVITY_LIMIT = 8;
const DEPARTMENT_LIMIT = 3;
const AGENTS_PER_DEPARTMENT = 4;

export default async function OverviewPage() {
  const context = await requireForgeContext();
  const { supabase, user, workspace, membership } = context;

  const [agentsResult, work, connectionsResult, activityResult] =
    await Promise.all([
      listAgents(supabase),
      loadWork(supabase, workspace?.id, { limit: WORK_WINDOW }),
      listConnections(supabase, workspace?.id, membership?.id),
      listActivity(supabase, workspace?.id, { limit: ACTIVITY_LIMIT }),
    ]);

  const agents = agentsResult.agents;
  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
  const tasks = work.tasks;
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const taskTitles = new Map(
    tasks.map((task) => [task.id, task.title])
  );

  const tasksByAgent = groupBy(tasks, "agent_id");
  const runsByAgent = new Map();
  for (const run of work.runs) {
    const agentId = taskById.get(run.task_id)?.agent_id;
    if (!agentId) continue;
    const bucket = runsByAgent.get(agentId);
    if (bucket) bucket.push(run);
    else runsByAgent.set(agentId, [run]);
  }

  const workingAgents = new Set(
    tasks
      .filter((task) => isRunningTask(task.status))
      .map((task) => task.agent_id)
  );
  const waitingAgents = new Set(
    tasks
      .filter((task) => isWaitingTask(task.status))
      .map((task) => task.agent_id)
  );
  const errorAgents = new Set(
    tasks.filter((task) => isFailedTask(task.status)).map((task) => task.agent_id)
  );
  for (const run of work.runs) {
    if (!isFailedRun(run)) continue;
    const agentId = taskById.get(run.task_id)?.agent_id;
    if (agentId) errorAgents.add(agentId);
  }

  const pendingApprovals = work.approvals.filter(
    (approval) => approval.status === "pending"
  );
  const failedTasks = tasks.filter((task) => isFailedTask(task.status));
  const failedRuns = work.runs.filter(isFailedRun);
  const problemConnections = connectionsResult.connections.filter(
    (connection) => !isHealthyConnection(connection.status)
  );
  const attentionCount =
    pendingApprovals.length +
    failedTasks.length +
    failedRuns.length +
    problemConnections.length;

  const departmentGroups = groupAgentsByDepartment(agents).slice(
    0,
    DEPARTMENT_LIMIT
  );

  const partial =
    agentsResult.failed ||
    work.failed ||
    connectionsResult.failed ||
    activityResult.failed;

  return (
    <>
      <PageHeader
        eyebrow="Command center"
        title="Overview"
        subtitle="What your workforce is doing, what needs you, and what happened recently."
        meta={
          workspace
            ? `${workspace.name} · ${agents.length} agent${
                agents.length === 1 ? "" : "s"
              }${attentionCount > 0 ? ` · ${attentionCount} need attention` : ""}`
            : "No workspace membership yet"
        }
      />

      <div className="forge-stack forge-stack--pushed">
        {partial ? (
          <Notice tone="warn">
            Some Forge data could not be loaded. Showing what is available.
          </Notice>
        ) : null}

        {workspace ? (
          <>
            <MetricRow
              items={[
                {
                  label: "Active agents",
                  value: agents.length,
                  hint: "Shared catalog",
                },
                {
                  label: "Working now",
                  value: workingAgents.size,
                  hint: "Running tasks",
                },
                {
                  label: "Waiting",
                  value: waitingAgents.size,
                  hint: "Blocked or approval needed",
                },
                {
                  label: "With errors",
                  value: errorAgents.size,
                  hint: "Failed work",
                },
              ]}
            />

            <div className="forge-grid forge-grid--split">
              <Section
                title="Current work"
                action={
                  tasks.length > 0 ? (
                    <Link className="forge-section-link" href="/tasks">
                      All tasks
                    </Link>
                  ) : null
                }
              >
                {tasks.length > 0 ? (
                  <div className="forge-rows">
                    {tasks.slice(0, CURRENT_WORK_LIMIT).map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        agentName={agentsById.get(task.agent_id)?.name ?? null}
                        requesterLabel={actorLabel(task.requested_by, user.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    glyph="spark"
                    title="No work yet"
                    text="Tasks assigned to your workforce appear here with their status and action level."
                  />
                )}
              </Section>

              <Section
                title="Needs attention"
                meta={attentionCount > 0 ? attentionCount : null}
              >
                {attentionCount === 0 ? (
                  <EmptyState
                    title="All clear"
                    text="No approvals, failures, or connection problems need you right now."
                  />
                ) : (
                  <div className="forge-rows">
                    {pendingApprovals.slice(0, ATTENTION_LIMIT).map((approval) => (
                      <Link
                        className="forge-row"
                        href="/approvals"
                        key={`approval-${approval.id}`}
                      >
                        <Dot tone="warn" />
                        <span className="forge-row-main">
                          <span className="forge-row-title">
                            {agentsById.get(taskById.get(approval.task_id)?.agent_id)
                              ?.name ?? "An agent"}{" "}
                            needs approval
                          </span>
                          <span className="forge-row-meta">
                            <span className="forge-mono">
                              {approval.capability}
                            </span>
                            <span>
                              {taskTitles.get(approval.task_id) ?? "Task"}
                            </span>
                          </span>
                        </span>
                        <span className="forge-row-end">
                          <span className="forge-row-time">
                            {approval.expires_at
                              ? `expires ${formatWhen(approval.expires_at)}`
                              : "pending"}
                          </span>
                        </span>
                      </Link>
                    ))}

                    {failedTasks.slice(0, ATTENTION_LIMIT).map((task) => (
                      <Link
                        className="forge-row"
                        href={`/tasks/${task.id}`}
                        key={`task-${task.id}`}
                      >
                        <Dot tone="danger" />
                        <span className="forge-row-main">
                          <span className="forge-row-title">
                            {task.title}
                          </span>
                          <span className="forge-row-meta">
                            <span>Task failed</span>
                            <span>
                              <ActionLevel level={task.action_level} />
                            </span>
                          </span>
                        </span>
                        <span className="forge-row-end">
                          <span className="forge-row-time">
                            {formatWhen(task.updated_at)}
                          </span>
                        </span>
                      </Link>
                    ))}

                    {failedRuns
                      .filter(
                        (run) => !failedTasks.some((task) => task.id === run.task_id)
                      )
                      .slice(0, ATTENTION_LIMIT)
                      .map((run) => (
                        <Link
                          className="forge-row"
                          href={`/tasks/${run.task_id}`}
                          key={`run-${run.id}`}
                        >
                          <Dot tone="danger" />
                          <span className="forge-row-main">
                            <span className="forge-row-title">Run failed</span>
                          <span className="forge-row-meta">
                            <span>{taskTitles.get(run.task_id) ?? "Task"}</span>
                            </span>
                          </span>
                          <span className="forge-row-end">
                            <span className="forge-row-time">
                              {formatWhen(run.created_at)}
                            </span>
                          </span>
                        </Link>
                      ))}

                    {problemConnections.slice(0, ATTENTION_LIMIT).map((connection) => {
                      const status = connectionStatusMeta(connection.status);
                      return (
                        <Link
                          className="forge-row"
                          href="/connections"
                          key={`connection-${connection.id}`}
                        >
                          <Dot tone={status.tone} />
                          <span className="forge-row-main">
                            <span className="forge-row-title">
                              {connection.label || connection.provider}
                            </span>
                            <span className="forge-row-meta">
                              <span>{connection.provider}</span>
                            </span>
                          </span>
                          <span className="forge-row-end">
                            <Pill label={status.label} tone={status.tone} />
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </Section>
            </div>
          </>
        ) : (
          <EmptyState
            title="No workspace yet"
            text="Forge shows workspace work once your account belongs to a workspace. The shared agent catalog below is already available."
          />
        )}

        <div className="forge-grid forge-grid--halves">
          <Section
            title="Agents"
            action={
              agents.length > 0 ? (
                <Link className="forge-section-link" href="/agents">
                  All agents
                </Link>
              ) : null
            }
          >
            {departmentGroups.length > 0 ? (
              <div className="forge-rows">
                {departmentGroups.map(([department, departmentAgents]) => (
                  <div key={department}>
                    <div className="forge-eyebrow forge-dept-label">
                      {department}
                    </div>
                    {departmentAgents
                      .slice(0, AGENTS_PER_DEPARTMENT)
                      .map((agent) => (
                        <AgentLine
                          key={agent.id}
                          agent={agent}
                          tasks={tasksByAgent.get(agent.id) ?? []}
                          runs={runsByAgent.get(agent.id) ?? []}
                        />
                      ))}
                    {departmentAgents.length > AGENTS_PER_DEPARTMENT ? (
                      <div className="forge-meta-faint forge-dept-more">
                        +{departmentAgents.length - AGENTS_PER_DEPARTMENT} more
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No agents yet"
                text="Agents defined in Forge appear here, grouped by department."
              />
            )}
          </Section>

          <Section
            title="Recent activity"
            action={
              activityResult.events.length > 0 ? (
                <Link className="forge-section-link" href="/activity">
                  Full history
                </Link>
              ) : null
            }
          >
            {activityResult.events.length > 0 ? (
              <div className="forge-pad-top">
                <ActivityTimeline
                  events={activityResult.events}
                  taskTitles={taskTitles}
                  actorLabels={new Map([[user.id, "You"]])}
                />
              </div>
            ) : (
              <EmptyState
                title="Nothing recorded yet"
                text="Approvals, runs, and decisions appear here as your workforce starts working."
              />
            )}
          </Section>
        </div>
      </div>
    </>
  );
}

function isFailedRun(run) {
  return ["failed", "error"].includes(String(run.status ?? "").toLowerCase());
}

function isHealthyConnection(status) {
  return ["active", "connected", "healthy"].includes(
    String(status ?? "").toLowerCase()
  );
}

function groupAgentsByDepartment(agents) {
  const groups = new Map();

  for (const agent of agents) {
    const key = agent.department?.name ?? "Unassigned";
    const bucket = groups.get(key);
    if (bucket) bucket.push(agent);
    else groups.set(key, [agent]);
  }

  return [...groups.entries()];
}
