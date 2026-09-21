import Link from "next/link";

import { AgentLine } from "@/components/forge/lists";
import { EmptyState, Notice, PageHeader, Section } from "@/components/forge/ui";
import { requireForgeContext } from "@/lib/forge/context";
import { groupBy } from "@/lib/forge/db";
import { listAgents, listDepartments, loadWork } from "@/lib/forge/queries";

export default async function DepartmentsPage() {
  const context = await requireForgeContext();
  const supabase = context.supabase;

  const [departmentsResult, agentsResult, work] = await Promise.all([
    listDepartments(supabase),
    listAgents(supabase),
    loadWork(supabase, context.workspace?.id, { limit: 100 }),
  ]);

  const agentsByDepartment = groupBy(agentsResult.agents, "department_id");
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

  const unassigned = agentsResult.agents.filter(
    (agent) => !agent.department_id
  );

  return (
    <>
      <PageHeader
        eyebrow="Workforce"
        title="Departments"
        subtitle="Departments group your workforce. New departments appear here automatically as the organization grows."
        meta={`${departmentsResult.departments.length} department${
          departmentsResult.departments.length === 1 ? "" : "s"
        }`}
      />

      <div className="forge-stack forge-stack--pushed">
        {departmentsResult.failed || agentsResult.failed ? (
          <Notice tone="warn">
            Department data could not be fully loaded. Showing what is available.
          </Notice>
        ) : null}

        {departmentsResult.departments.length === 0 ? (
          <EmptyState
            glyph="spark"
            title="No departments yet"
            text="Departments such as Finance, Marketing, or Operations will appear here as the workforce grows."
          />
        ) : (
          departmentsResult.departments.map((department) => {
            const departmentAgents =
              agentsByDepartment.get(department.id) ?? [];

            return (
              <Section
                key={department.id}
                title={department.name}
                meta={`${departmentAgents.length} agent${
                  departmentAgents.length === 1 ? "" : "s"
                }`}
              >
                {departmentAgents.length > 0 ? (
                  <div className="forge-rows">
                    {departmentAgents.map((agent) => (
                      <AgentLine
                        key={agent.id}
                        agent={agent}
                        tasks={tasksByAgent.get(agent.id) ?? []}
                        runs={runsByAgent.get(agent.id) ?? []}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No agents in this department"
                    text="When an agent is assigned to this department it will be listed here."
                  />
                )}
              </Section>
            );
          })
        )}

        {unassigned.length > 0 ? (
          <Section title="Unassigned" meta={`${unassigned.length}`}>
            <div className="forge-rows">
              {unassigned.map((agent) => (
                <AgentLine
                  key={agent.id}
                  agent={agent}
                  tasks={tasksByAgent.get(agent.id) ?? []}
                  runs={runsByAgent.get(agent.id) ?? []}
                />
              ))}
            </div>
          </Section>
        ) : null}

        <p className="forge-meta-faint">
          Looking for a single agent? <Link href="/agents">Browse the agent catalog</Link>.
        </p>
      </div>
    </>
  );
}
