import Link from "next/link";
import { notFound } from "next/navigation";

import { ApprovalCard, RunTimeline } from "@/components/forge/lists";
import {
  ActionLevel,
  EmptyState,
  Notice,
  PageHeader,
  Pill,
  Section,
} from "@/components/forge/ui";
import { requireForgeContext } from "@/lib/forge/context";
import {
  actorLabel,
  formatDateTime,
  formatDateTimeUtc,
  formatDuration,
  shortId,
} from "@/lib/forge/format";
import {
  getTask,
  listAgents,
  listApprovalsForTask,
  listRunsForTask,
} from "@/lib/forge/queries";
import { runStatusMeta, taskStatusMeta } from "@/lib/forge/status";

export default async function TaskDetailPage({ params }) {
  const { id } = await params;
  const context = await requireForgeContext();
  const supabase = context.supabase;

  const taskResult = await getTask(supabase, id);
  if (!taskResult.task) notFound();

  const task = taskResult.task;

  const [agentsResult, runsResult, approvalsResult] = await Promise.all([
    listAgents(supabase),
    listRunsForTask(supabase, task.id),
    listApprovalsForTask(supabase, task.id),
  ]);

  const agent = agentsResult.agents.find((item) => item.id === task.agent_id) ?? null;
  const status = taskStatusMeta(task.status);
  const inputLines = task.inputSummary ?? [];
  const title = task.title;

  return (
    <>
      <PageHeader
        eyebrow="Task"
        title={title}
        subtitle={`${agent ? `${agent.name} · ` : ""}action level ${String(
          task.action_level ?? "read"
        ).toUpperCase()}`}
        meta={`Created ${formatDateTime(task.created_at)} · Updated ${formatDateTime(
          task.updated_at
        )} · ${actorLabel(task.requested_by, context.user.id)}`}
        actions={
          <Link className="forge-button" href="/tasks">
            All tasks
          </Link>
        }
      />

      <div className="forge-stack forge-stack--pushed">
        {taskResult.failed || runsResult.failed || approvalsResult.failed ? (
          <Notice tone="warn">
            Part of this task could not be loaded. Showing what is available.
          </Notice>
        ) : null}

        <div className="forge-grid forge-grid--halves">
          <Section title="Request">
            <dl className="forge-kv">
              <div className="forge-kv-row">
                <dt>Status</dt>
                <dd>
                  <Pill label={status.label} tone={status.tone} live={status.live} />
                </dd>
              </div>
              <div className="forge-kv-row">
                <dt>Action level</dt>
                <dd>
                  <ActionLevel level={task.action_level} />
                </dd>
              </div>
              <div className="forge-kv-row">
                <dt>Agent</dt>
                <dd>
                  {agent ? (
                    <Link href={`/agents/${agent.id}`}>{agent.name}</Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="forge-kv-row">
                <dt>Requested by</dt>
                <dd>{actorLabel(task.requested_by, context.user.id)}</dd>
              </div>
              <div className="forge-kv-row">
                <dt>Task id</dt>
                <dd className="forge-mono">{shortId(task.id, 14)}</dd>
              </div>
            </dl>
          </Section>

          <Section title="Input">
            {inputLines.length > 0 ? (
              <>
                <pre className="forge-payload">{inputLines.join("\n")}</pre>
                <p className="forge-meta-faint forge-pad-top">
                  Values are summarized by shape. Sensitive fields are hidden.
                </p>
              </>
            ) : (
              <p className="forge-meta">No input recorded for this task.</p>
            )}
          </Section>
        </div>

        <Section title="Runs" meta={runsResult.runs.length}>
          {runsResult.runs.length > 0 ? (
            <div className="forge-rows">
              {runsResult.runs.map((run) => {
                const runStatus = runStatusMeta(run.status);
                const duration = formatDuration(run.started_at, run.completed_at);
                const errorLine = run.errorSummary;

                return (
                  <div key={run.id} className="forge-run">
                    <div className="forge-run-head">
                      <Pill
                        label={runStatus.label}
                        tone={runStatus.tone}
                        live={runStatus.live}
                      />
                      <span className="forge-mono forge-cell-muted">
                        {run.hermes_run_id ? shortId(run.hermes_run_id, 16) : "no Hermes id"}
                      </span>
                      {duration ? (
                        <span className="forge-meta-faint">{duration}</span>
                      ) : null}
                      <span
                        className="forge-row-time"
                        title={formatDateTimeUtc(run.created_at)}
                      >
                        {formatDateTime(run.created_at)}
                      </span>
                    </div>

                    <RunTimeline run={run} />

                    {errorLine ? (
                      <p className="forge-notice" data-tone="warn">
                        {errorLine}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              glyph="spark"
              title="No runs yet"
              text="When this task is submitted to Hermes, the run and its timeline appear here."
            />
          )}
        </Section>

        <Section title="Approvals" meta={approvalsResult.approvals.length}>
          {approvalsResult.approvals.length > 0 ? (
            approvalsResult.approvals.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                task={task}
                agentName={agent?.name ?? null}
                taskTitle={title}
              />
            ))
          ) : (
            <EmptyState
              title="No approvals requested"
              text="Approvals appear here when this task needs a human decision before acting."
            />
          )}
        </Section>
      </div>
    </>
  );
}
