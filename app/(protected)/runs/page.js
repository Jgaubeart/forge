import { RunRow } from "@/components/forge/lists";
import { EmptyState, Notice, PageHeader, Section } from "@/components/forge/ui";
import { requireForgeContext } from "@/lib/forge/context";
import { listAgents, listRunEvents, loadWork } from "@/lib/forge/queries";

const WORK_WINDOW = 150;
const EVENT_WINDOW = 300;

export default async function RunsPage() {
  const context = await requireForgeContext();
  const supabase = context.supabase;

  const [work, agentsResult, eventsResult] = await Promise.all([
    loadWork(supabase, context.workspace?.id, { limit: WORK_WINDOW }),
    listAgents(supabase),
    listRunEvents(supabase, {
      workspaceId: context.workspace?.id,
      limit: EVENT_WINDOW,
    }),
  ]);

  const agentsById = new Map(agentsResult.agents.map((agent) => [agent.id, agent]));
  const taskById = new Map(work.tasks.map((task) => [task.id, task]));

  const eventCounts = new Map();
  for (const event of eventsResult.events) {
    if (!event.agentRunId) continue;
    eventCounts.set(event.agentRunId, (eventCounts.get(event.agentRunId) ?? 0) + 1);
  }

  // Runs are grouped by mission so the primary run and any delegated subagent
  // runs read as the structure Hermes produced.
  const runsByTask = new Map();
  for (const run of work.runs) {
    const bucket = runsByTask.get(run.task_id);
    if (bucket) bucket.push(run);
    else runsByTask.set(run.task_id, [run]);
  }

  const missionsWithRuns = [...runsByTask.entries()].sort((a, b) => {
    const left = taskById.get(a[0])?.updated_at ?? "";
    const right = taskById.get(b[0])?.updated_at ?? "";
    return String(right).localeCompare(String(left));
  });

  const subagentCount = work.runs.filter((run) => run.kind === "subagent").length;

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Runs"
        subtitle="Hermes execution history mirrored by Forge, including delegated subagent runs. Hermes owns the run lifecycle; Forge records it."
        meta={
          context.workspace
            ? `${work.runs.length} runs · ${subagentCount} subagent${
                subagentCount === 1 ? "" : "s"
              }`
            : "No workspace membership yet"
        }
      />

      <div className="forge-stack forge-stack--pushed">
        {work.failed || eventsResult.failed ? (
          <Notice tone="warn">
            Run data could not be fully loaded. Showing what is available.
          </Notice>
        ) : null}

        {missionsWithRuns.length > 0 ? (
          missionsWithRuns.map(([taskId, runs]) => {
            const mission = taskById.get(taskId) ?? null;
            const primary = runs.filter((run) => run.kind !== "subagent");
            const children = runs.filter((run) => run.kind === "subagent");
            const childrenByParent = new Map();
            for (const child of children) {
              const bucket = childrenByParent.get(child.parent_run_id ?? child.parentRunId);
              if (bucket) bucket.push(child);
              else childrenByParent.set(child.parent_run_id ?? child.parentRunId, [child]);
            }

            return (
              <Section
                key={taskId}
                title={mission?.title ?? "Mission"}
                meta={`${runs.length} run${runs.length === 1 ? "" : "s"}`}
              >
                <div className="forge-rows">
                  {primary.map((run) => (
                    <div key={run.id}>
                      <RunRow
                        run={run}
                        task={mission}
                        agentName={
                          agentsById.get(mission?.agent_id)?.name ?? run.actorLabel
                        }
                        eventCount={eventCounts.get(run.id) ?? 0}
                      />
                      {(childrenByParent.get(run.id) ?? []).map((child) => (
                        <RunRow
                          key={child.id}
                          run={child}
                          task={mission}
                          agentName={child.actorLabel}
                          eventCount={eventCounts.get(child.id) ?? 0}
                        />
                      ))}
                    </div>
                  ))}

                  {primary.length === 0
                    ? children.map((child) => (
                        <RunRow
                          key={child.id}
                          run={child}
                          task={mission}
                          agentName={child.actorLabel}
                          eventCount={eventCounts.get(child.id) ?? 0}
                        />
                      ))
                    : null}
                </div>
              </Section>
            );
          })
        ) : (
          <Section title="Run history">
            <EmptyState
              glyph="spark"
              title="No runs recorded yet"
              text="When a mission is submitted, Forge records the run, mirrors its status, and keeps the delegated subagent structure Hermes reports."
            />
          </Section>
        )}

        <p className="forge-meta-faint">
          Run events are recorded per mission and shown on the mission page, so
          the timeline reflects what was actually written rather than a guess
          from timestamps.
        </p>
      </div>
    </>
  );
}
