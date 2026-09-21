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
import { isWaitingTask, taskStatusMeta } from "@/lib/forge/status";

const WORK_WINDOW = 200;

const FILTERS = [
  { key: "all", label: "All", test: () => true },
  {
    key: "queued",
    label: "Queued",
    test: (status) => ["queued", "pending"].includes(status),
  },
  {
    key: "running",
    label: "Running",
    test: (status) => ["running", "in_progress"].includes(status),
  },
  { key: "waiting", label: "Waiting", test: (status) => isWaitingTask(status) },
  {
    key: "completed",
    label: "Completed",
    test: (status) => ["completed", "succeeded"].includes(status),
  },
  {
    key: "failed",
    label: "Failed",
    test: (status) => ["failed", "error"].includes(status),
  },
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
  const activeFilter =
    FILTERS.find((filter) => filter.key === rawStatus) ?? FILTERS[0];

  const [work, agentsResult] = await Promise.all([
    loadWork(supabase, context.workspace?.id, { limit: WORK_WINDOW }),
    listAgents(supabase),
  ]);

  const agentsById = new Map(
    agentsResult.agents.map((agent) => [agent.id, agent])
  );

  const counts = new Map(
    FILTERS.map((filter) => [
      filter.key,
      work.tasks.filter((task) =>
        filter.test(String(task.status ?? "").toLowerCase())
      ).length,
    ])
  );

  const visibleTasks = work.tasks.filter((task) =>
    activeFilter.test(String(task.status ?? "").toLowerCase())
  );

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Tasks"
        subtitle="Every request your workforce has been given, with its action level and current state."
        meta={
          context.workspace
            ? `${context.workspace.name} · ${work.tasks.length} recent`
            : "No workspace membership yet"
        }
      />

      <div className="forge-stack forge-stack--pushed">
        {work.failed ? (
          <Notice tone="warn">
            Task data could not be fully loaded. Showing what is available.
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
          title={activeFilter.key === "all" ? "All tasks" : `${activeFilter.label} tasks`}
          meta={visibleTasks.length}
        >
          {visibleTasks.length > 0 ? (
            <div className="forge-table-wrap">
              <table className="forge-table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Agent</th>
                    <th>Action</th>
                    <th>Status</th>
                    <th>Requested by</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTasks.map((task) => {
                    const status = taskStatusMeta(task.status);

                    return (
                      <tr key={task.id}>
                        <td>
                          <Link
                            className="forge-cell-strong forge-truncate"
                            href={`/tasks/${task.id}`}
                          >
                            {task.title}
                          </Link>
                        </td>
                        <td className="forge-cell-muted">
                          {agentsById.get(task.agent_id)?.name ?? "—"}
                        </td>
                        <td>
                          <ActionLevel level={task.action_level} />
                        </td>
                        <td>
                          <Pill
                            label={status.label}
                            tone={status.tone}
                            live={status.live}
                          />
                        </td>
                        <td className="forge-cell-muted">
                          {actorLabel(task.requested_by, context.user.id)}
                        </td>
                        <td
                          className="forge-cell-time"
                          title={formatDateTimeUtc(task.updated_at)}
                        >
                          {formatWhen(task.updated_at)}
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
                work.tasks.length === 0 ? "No tasks yet" : "No tasks in this state"
              }
              text={
                work.tasks.length === 0
                  ? "Tasks your workforce is given appear here with their status, action level, and related runs."
                  : "Try another status filter to see the rest of the recent work."
              }
            />
          )}
        </Section>
      </div>
    </>
  );
}
