import Link from "next/link";

import {
  ActionLevel,
  EmptyState,
  FilterChips,
  Notice,
  PageHeader,
  Pill,
  Section,
} from "@/components/forge/ui";
import { requireForgeContext } from "@/lib/forge/context";
import { actorLabel, formatDateTimeUtc, formatWhen } from "@/lib/forge/format";
import { listAgents, loadWork } from "@/lib/forge/queries";
import { taskStatusMeta } from "@/lib/forge/status";

const WORK_WINDOW = 200;

// The durable mission lifecycle. Filters mirror the states the runtime writes.
const FILTERS = [
  { key: "all", label: "All", test: () => true },
  { key: "queued", label: "Queued", test: (status) => status === "queued" },
  { key: "planning", label: "Planning", test: (status) => status === "planning" },
  { key: "running", label: "Running", test: (status) => status === "running" },
  {
    key: "waiting",
    label: "Waiting",
    test: (status) => status === "waiting" || status === "waiting_approval",
  },
  {
    key: "completed",
    label: "Completed",
    test: (status) => ["completed", "succeeded"].includes(status),
  },
  { key: "failed", label: "Failed", test: (status) => ["failed", "error"].includes(status) },
  {
    key: "cancelled",
    label: "Cancelled",
    test: (status) => ["cancelled", "canceled"].includes(status),
  },
];

export default async function TasksPage({ searchParams }) {
  const context = await requireForgeContext();
  const supabase = context.supabase;
  const params = await searchParams;
  const rawStatus = Array.isArray(params?.status) ? params.status[0] : params?.status;
  const activeFilter = FILTERS.find((filter) => filter.key === rawStatus) ?? FILTERS[0];

  const [work, agentsResult] = await Promise.all([
    loadWork(supabase, context.workspace?.id, { limit: WORK_WINDOW }),
    listAgents(supabase),
  ]);

  const agentsById = new Map(agentsResult.agents.map((agent) => [agent.id, agent]));
  const runsByTask = new Map();
  for (const run of work.runs) {
    const bucket = runsByTask.get(run.task_id);
    if (bucket) bucket.push(run);
    else runsByTask.set(run.task_id, [run]);
  }

  const counts = new Map(
    FILTERS.map((filter) => [
      filter.key,
      work.tasks.filter((task) =>
        filter.test(String(task.status ?? "").toLowerCase())
      ).length,
    ])
  );

  const visibleMissions = work.tasks.filter((task) =>
    activeFilter.test(String(task.status ?? "").toLowerCase())
  );

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Missions"
        subtitle="Durable missions owned by Forge, with the agent, the action ceiling, and the run state Hermes reported."
        meta={
          context.workspace
            ? `${context.workspace.name} · ${work.tasks.length} recent`
            : "No workspace membership yet"
        }
      />

      <div className="forge-stack forge-stack--pushed">
        {work.failed ? (
          <Notice tone="warn">
            Mission data could not be fully loaded. Showing what is available.
          </Notice>
        ) : null}

        <FilterChips
          options={FILTERS.map((filter) => ({
            label: filter.label,
            href: filter.key === "all" ? "/tasks" : `/tasks?status=${filter.key}`,
            count: counts.get(filter.key) ?? 0,
            active: filter.key === activeFilter.key,
          }))}
        />

        <Section
          title={activeFilter.key === "all" ? "All missions" : `${activeFilter.label} missions`}
          meta={visibleMissions.length}
        >
          {visibleMissions.length > 0 ? (
            <div className="forge-table-wrap">
              <table className="forge-table">
                <thead>
                  <tr>
                    <th>Mission</th>
                    <th>Agent</th>
                    <th>Action</th>
                    <th>State</th>
                    <th>Runs</th>
                    <th>Requested by</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleMissions.map((mission) => {
                    const status = taskStatusMeta(mission.status);
                    const runs = runsByTask.get(mission.id) ?? [];
                    const children = runs.filter((run) => run.kind === "subagent");

                    return (
                      <tr key={mission.id}>
                        <td>
                          <Link
                            className="forge-cell-strong forge-truncate"
                            href={`/tasks/${mission.id}`}
                          >
                            {mission.title}
                          </Link>
                          {mission.currentStep ? (
                            <span className="forge-cell-muted forge-truncate">
                              {mission.currentStep}
                            </span>
                          ) : null}
                        </td>
                        <td className="forge-cell-muted">
                          {agentsById.get(mission.agent_id)?.name ?? "—"}
                        </td>
                        <td>
                          <ActionLevel level={mission.action_level} />
                        </td>
                        <td>
                          <Pill
                            label={status.label}
                            tone={status.tone}
                            live={status.live}
                          />
                        </td>
                        <td className="forge-cell-num forge-cell-muted">
                          {runs.length}
                          {children.length > 0 ? ` (${children.length} subagent)` : ""}
                        </td>
                        <td className="forge-cell-muted">
                          {actorLabel(mission.requested_by, context.user.id)}
                        </td>
                        <td
                          className="forge-cell-time"
                          title={formatDateTimeUtc(mission.updated_at)}
                        >
                          {formatWhen(mission.updated_at)}
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
              title={
                work.tasks.length === 0 ? "No missions yet" : "No missions in this state"
              }
              text={
                work.tasks.length === 0
                  ? "Missions are created through the Forge run controller, which authorizes the request, scopes the context, and submits the run to Hermes."
                  : "Try another state filter to see the rest of the recent work."
              }
            />
          )}
        </Section>
      </div>
    </>
  );
}
