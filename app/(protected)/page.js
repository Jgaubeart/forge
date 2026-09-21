import Link from "next/link";

import { AgentLine, MissionTimeline, RunRow, TaskRow } from "@/components/forge/lists";
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
  listAgents,
  listConnections,
  listRunEvents,
  loadWork,
} from "@/lib/forge/queries";
import {
  connectionStatusMeta,
  isActiveMission,
  isFailedTask,
} from "@/lib/forge/status";

const WORK_WINDOW = 100;
const MISSION_LIMIT = 6;
const RUN_LIMIT = 5;
const ATTENTION_LIMIT = 3;
const EVENT_LIMIT = 8;
const DEPARTMENT_LIMIT = 3;
const AGENTS_PER_DEPARTMENT = 4;

const RUNNING_STATUSES = ["running", "planning"];
const WAITING_STATUSES = ["waiting", "waiting_approval"];
const ACTIVE_RUN_STATUSES = ["queued", "planning", "running", "waiting_approval"];

export default async function OverviewPage() {
  const context = await requireForgeContext();
  const { supabase, user, workspace, membership } = context;

  const [agentsResult, work, eventsResult, connectionsResult] = await Promise.all([
    listAgents(supabase),
    loadWork(supabase, workspace?.id, { limit: WORK_WINDOW }),
    listRunEvents(supabase, { workspaceId: workspace?.id, limit: EVENT_LIMIT }),
    listConnections(supabase, workspace?.id, membership?.id),
  ]);

  const agents = agentsResult.agents;
  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
  const missions = work.tasks;
  const taskById = new Map(missions.map((task) => [task.id, task]));
  const taskTitles = new Map(missions.map((task) => [task.id, task.title]));

  const tasksByAgent = groupBy(missions, "agent_id");
  const runsByAgent = new Map();
  for (const run of work.runs) {
    const agentId = taskById.get(run.task_id)?.agent_id;
    if (!agentId) continue;
    const bucket = runsByAgent.get(agentId);
    if (bucket) bucket.push(run);
    else runsByAgent.set(agentId, [run]);
  }

  const statusOf = (task) => String(task.status ?? "").toLowerCase();
  const activeMissions = missions.filter((task) => isActiveMission(task.status));
  const runningMissions = missions.filter((task) =>
    RUNNING_STATUSES.includes(statusOf(task))
  );
  const waitingMissions = missions.filter((task) =>
    WAITING_STATUSES.includes(statusOf(task))
  );
  const failedMissions = missions.filter((task) => isFailedTask(task.status));
  const activeRuns = work.runs.filter((run) =>
    ACTIVE_RUN_STATUSES.includes(String(run.status ?? "").toLowerCase())
  );
  const failedRuns = work.runs.filter(
    (run) => String(run.status ?? "").toLowerCase() === "failed"
  );
  const pendingApprovals = work.approvals.filter(
    (approval) => approval.status === "pending"
  );
  const problemConnections = connectionsResult.connections.filter(
    (connection) =>
      !["active", "connected", "healthy"].includes(
        String(connection.status ?? "").toLowerCase()
      )
  );

  const attentionCount =
    pendingApprovals.length + failedMissions.length + failedRuns.length + problemConnections.length;

  const departmentGroups = groupAgentsByDepartment(agents).slice(0, DEPARTMENT_LIMIT);

  const partial =
    agentsResult.failed ||
    work.failed ||
    eventsResult.failed ||
    connectionsResult.failed;

  return (
    <>
      <PageHeader
        eyebrow="Command center"
        title="Overview"
        subtitle="Durable missions, the runs working them, what needs you, and what just happened."
        meta={
          workspace
            ? `${workspace.name} · ${activeMissions.length} active mission${
                activeMissions.length === 1 ? "" : "s"
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
                  label: "Active missions",
                  value: activeMissions.length,
                  hint: "Durable, independent of this page",
                },
                {
                  label: "Running now",
                  value: runningMissions.length,
                  hint: "Planning or executing",
                },
                {
                  label: "Waiting for approval",
                  value: waitingMissions.length,
                  hint: "Blocked on a human decision",
                },
                {
                  label: "Failed work",
                  value: failedMissions.length + failedRuns.length,
                  hint: "Missions and runs",
                },
              ]}
            />

            <div className="forge-grid forge-grid--split">
              <Section
                title="Current missions"
                action={
                  missions.length > 0 ? (
                    <Link className="forge-section-link" href="/tasks">
                      All missions
                    </Link>
                  ) : null
                }
              >
                {missions.length > 0 ? (
                  <div className="forge-rows">
                    {missions.slice(0, MISSION_LIMIT).map((mission) => (
                      <TaskRow
                        key={mission.id}
                        task={mission}
                        agentName={agentsById.get(mission.agent_id)?.name ?? null}
                        requesterLabel={actorLabel(mission.requested_by, user.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    glyph="spark"
                    title="No missions yet"
                    text="Missions submitted to your workforce appear here as durable records, with their state and current step."
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
                            {approval.tool ?? approval.capability} needs approval
                          </span>
                          <span className="forge-row-meta">
                            <span className="forge-mono">{approval.capability}</span>
                            <span>{taskTitles.get(approval.task_id) ?? "Mission"}</span>
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

                    {failedMissions.slice(0, ATTENTION_LIMIT).map((mission) => (
                      <Link
                        className="forge-row"
                        href={`/tasks/${mission.id}`}
                        key={`mission-${mission.id}`}
                      >
                        <Dot tone="danger" />
                        <span className="forge-row-main">
                          <span className="forge-row-title">{mission.title}</span>
                          <span className="forge-row-meta">
                            <span>{mission.currentStep ?? "Mission failed"}</span>
                            <span>
                              <ActionLevel level={mission.action_level} />
                            </span>
                          </span>
                        </span>
                        <span className="forge-row-end">
                          <span className="forge-row-time">
                            {formatWhen(mission.updated_at)}
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

            <div className="forge-grid forge-grid--split">
              <Section
                title="Active runs"
                action={
                  work.runs.length > 0 ? (
                    <Link className="forge-section-link" href="/runs">
                      All runs
                    </Link>
                  ) : null
                }
              >
                {activeRuns.length > 0 ? (
                  <div className="forge-rows">
                    {activeRuns.slice(0, RUN_LIMIT).map((run) => {
                      const mission = taskById.get(run.task_id);
                      return (
                        <RunRow
                          key={run.id}
                          run={run}
                          task={mission ?? null}
                          agentName={
                            agentsById.get(mission?.agent_id)?.name ?? null
                          }
                        />
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    title="No runs in flight"
                    text="Runs appear here while Hermes is planning or executing a mission."
                  />
                )}
              </Section>

              <Section
                title="Recent events"
                action={
                  eventsResult.events.length > 0 ? (
                    <Link className="forge-section-link" href="/activity">
                      Full history
                    </Link>
                  ) : null
                }
              >
                {eventsResult.events.length > 0 ? (
                  <div className="forge-pad-top">
                    <MissionTimeline
                      events={eventsResult.events}
                      actorLabels={new Map([[user.id, "You"]])}
                    />
                  </div>
                ) : (
                  <EmptyState
                    title="Nothing recorded yet"
                    text="Mission, run, approval, and tool events are recorded here as your workforce works."
                  />
                )}
              </Section>
            </div>
          </>
        ) : (
          <EmptyState
            title="No workspace yet"
            text="Forge shows workspace missions once your account belongs to a workspace. The shared agent catalog below is already available."
          />
        )}

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
                  <div className="forge-eyebrow forge-dept-label">{department}</div>
                  {departmentAgents.slice(0, AGENTS_PER_DEPARTMENT).map((agent) => (
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
      </div>
    </>
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
