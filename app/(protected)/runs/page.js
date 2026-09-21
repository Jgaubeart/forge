import Link from "next/link";

import { EmptyState, Notice, PageHeader, Pill, Section } from "@/components/forge/ui";
import { requireForgeContext } from "@/lib/forge/context";
import {
  formatDateTime,
  formatDateTimeUtc,
  formatDuration,
  shortId,
} from "@/lib/forge/format";
import { listAgents, loadWork } from "@/lib/forge/queries";
import { runStatusMeta } from "@/lib/forge/status";

const WORK_WINDOW = 100;

export default async function RunsPage() {
  const context = await requireForgeContext();
  const supabase = context.supabase;

  const [work, agentsResult] = await Promise.all([
    loadWork(supabase, context.workspace?.id, { limit: WORK_WINDOW }),
    listAgents(supabase),
  ]);

  const agentsById = new Map(
    agentsResult.agents.map((agent) => [agent.id, agent])
  );
  const taskById = new Map(work.tasks.map((task) => [task.id, task]));
  const runs = work.runs;

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Runs"
        subtitle="Hermes execution history mirrored by Forge. Each run belongs to a task, and the run timeline lives on the task page."
        meta={
          context.workspace
            ? `${context.workspace.name} · ${runs.length} recent`
            : "No workspace membership yet"
        }
      />

      <div className="forge-stack forge-stack--pushed">
        {work.failed ? (
          <Notice tone="warn">
            Run data could not be fully loaded. Showing what is available.
          </Notice>
        ) : null}

        <Section title="Run history" meta={runs.length}>
          {runs.length > 0 ? (
            <div className="forge-table-wrap">
              <table className="forge-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Task</th>
                    <th>Agent</th>
                    <th>Hermes run</th>
                    <th>Started</th>
                    <th>Finished</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => {
                    const status = runStatusMeta(run.status);
                    const task = taskById.get(run.task_id);
                    const errorLine = run.errorSummary;
                    const duration = formatDuration(run.started_at, run.completed_at);

                    return (
                      <tr key={run.id}>
                        <td>
                          <Pill
                            label={status.label}
                            tone={status.tone}
                            live={status.live}
                          />
                        </td>
                        <td>
                          {task ? (
                            <Link
                              className="forge-cell-strong forge-truncate"
                              href={`/tasks/${task.id}`}
                            >
                              {task.title}
                            </Link>
                          ) : (
                            <span className="forge-cell-muted">—</span>
                          )}
                        </td>
                        <td className="forge-cell-muted">
                          {agentsById.get(task?.agent_id)?.name ?? "—"}
                        </td>
                        <td className="forge-mono">
                          {run.hermes_run_id
                            ? shortId(run.hermes_run_id, 12)
                            : "—"}
                        </td>
                        <td
                          className="forge-cell-time"
                          title={formatDateTimeUtc(run.started_at)}
                        >
                          {run.started_at ? formatDateTime(run.started_at) : "—"}
                        </td>
                        <td
                          className="forge-cell-time"
                          title={
                            duration ? `Duration ${duration}` : undefined
                          }
                        >
                          {run.completed_at
                            ? formatDateTime(run.completed_at)
                            : "—"}
                        </td>
                        <td className="forge-cell-muted forge-truncate">
                          {errorLine ?? "—"}
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
              title="No runs recorded yet"
              text="Once your workforce starts executing tasks, each Hermes run is mirrored here with its status and timing."
            />
          )}
        </Section>
      </div>
    </>
  );
}
