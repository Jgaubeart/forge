import Link from "next/link";
import { notFound } from "next/navigation";

import { CancelMission } from "@/components/forge/cancel-mission";
import { ApprovalCard, MissionTimeline, RunRow } from "@/components/forge/lists";
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
  formatDuration,
  shortId,
} from "@/lib/forge/format";
import {
  getTask,
  listAgents,
  listApprovalsForTask,
  listRunEvents,
  listRunsForTask,
} from "@/lib/forge/queries";
import { canCancelMission } from "@/lib/forge/runtime/policy.js";
import { taskStatusMeta } from "@/lib/forge/status";
import { cancelMissionAction } from "./actions";

export default async function TaskDetailPage({ params }) {
  const { id } = await params;
  const context = await requireForgeContext();
  const supabase = context.supabase;

  const taskResult = await getTask(supabase, id);
  if (!taskResult.task) notFound();

  const mission = taskResult.task;

  const [agentsResult, runsResult, approvalsResult, eventsResult] = await Promise.all([
    listAgents(supabase),
    listRunsForTask(supabase, mission.id),
    listApprovalsForTask(supabase, mission.id),
    listRunEvents(supabase, { taskId: mission.id, limit: 60 }),
  ]);

  const agent =
    agentsResult.agents.find((item) => item.id === mission.agent_id) ?? null;
  const status = taskStatusMeta(mission.status);
  const inputLines = mission.inputSummary ?? [];
  const cancellable = canCancelMission(mission.status);

  const eventCountFor = (runId) =>
    eventsResult.events.filter((event) => event.agentRunId === runId).length;

  const primaryRuns = runsResult.runs.filter((run) => run.kind !== "subagent");
  const childRuns = runsResult.runs.filter((run) => run.kind === "subagent");
  const childrenByParent = new Map();
  for (const child of childRuns) {
    const bucket = childrenByParent.get(child.parentRunId);
    if (bucket) bucket.push(child);
    else childrenByParent.set(child.parentRunId, [child]);
  }

  return (
    <>
      <PageHeader
        eyebrow="Mission"
        title={mission.title}
        subtitle={`${agent ? `${agent.name} · ` : ""}action level ${String(
          mission.action_level ?? "read"
        ).toUpperCase()}${mission.current_step ? ` · ${mission.current_step}` : ""}`}
        meta={`Created ${formatDateTime(mission.created_at)} · Updated ${formatDateTime(
          mission.updated_at
        )} · ${actorLabel(mission.requested_by, context.user.id)}`}
        actions={
          <Link className="forge-button" href="/tasks">
            All missions
          </Link>
        }
      />

      <div className="forge-stack forge-stack--pushed">
        {taskResult.failed ||
        runsResult.failed ||
        approvalsResult.failed ||
        eventsResult.failed ? (
          <Notice tone="warn">
            Part of this mission could not be loaded. Showing what is available.
          </Notice>
        ) : null}

        <div className="forge-grid forge-grid--halves">
          <Section title="Mission">
            <dl className="forge-kv">
              <div className="forge-kv-row">
                <dt>State</dt>
                <dd>
                  <Pill label={status.label} tone={status.tone} live={status.live} />
                </dd>
              </div>
              <div className="forge-kv-row">
                <dt>Current step</dt>
                <dd>{mission.current_step ?? "—"}</dd>
              </div>
              <div className="forge-kv-row">
                <dt>Action level</dt>
                <dd>
                  <ActionLevel level={mission.action_level} />
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
                <dd>{actorLabel(mission.requested_by, context.user.id)}</dd>
              </div>
              <div className="forge-kv-row">
                <dt>Started</dt>
                <dd>{mission.started_at ? formatDateTime(mission.started_at) : "—"}</dd>
              </div>
              <div className="forge-kv-row">
                <dt>Completed</dt>
                <dd>
                  {mission.completed_at
                    ? `${formatDateTime(mission.completed_at)}${
                        mission.started_at
                          ? ` · ${formatDuration(mission.started_at, mission.completed_at)}`
                          : ""
                      }`
                    : "—"}
                </dd>
              </div>
              <div className="forge-kv-row">
                <dt>Mission id</dt>
                <dd className="forge-mono">{shortId(mission.id, 14)}</dd>
              </div>
            </dl>
          </Section>

          <div className="forge-stack">
            <Section title="Input">
              {inputLines.length > 0 ? (
                <>
                  <pre className="forge-payload">{inputLines.join("\n")}</pre>
                  <p className="forge-meta-faint forge-pad-top">
                    Values are summarized by shape. Sensitive fields are hidden.
                  </p>
                </>
              ) : (
                <p className="forge-meta">No input recorded for this mission.</p>
              )}
            </Section>

            <Section title="Control">
              {cancellable ? (
                <>
                  <CancelMission taskId={mission.id} action={cancelMissionAction} />
                  <p className="forge-meta-faint forge-pad-top">
                    Cancelling authorizes you, asks Hermes to stop the run when one
                    exists, and keeps the mission history intact.
                  </p>
                </>
              ) : (
                <p className="forge-meta">
                  This mission is {status.label.toLowerCase()}. Cancellation is only
                  available while it is active, and history is never deleted.
                </p>
              )}
            </Section>
          </div>
        </div>

        <Section title="Runs" meta={runsResult.runs.length}>
          {runsResult.runs.length > 0 ? (
            <div className="forge-rows">
              {primaryRuns.map((run) => (
                <div key={run.id}>
                  <RunRow
                    run={run}
                    task={mission}
                    agentName={agent?.name ?? run.actorLabel}
                    eventCount={eventCountFor(run.id)}
                  />
                  {(childrenByParent.get(run.id) ?? []).map((child) => (
                    <RunRow
                      key={child.id}
                      run={child}
                      task={mission}
                      agentName={child.actorLabel}
                      eventCount={eventCountFor(child.id)}
                    />
                  ))}
                </div>
              ))}

              {primaryRuns.length === 0
                ? childRuns.map((child) => (
                    <RunRow
                      key={child.id}
                      run={child}
                      task={mission}
                      agentName={child.actorLabel}
                      eventCount={eventCountFor(child.id)}
                    />
                  ))
                : null}
            </div>
          ) : (
            <EmptyState
              glyph="spark"
              title="No runs yet"
              text="When this mission is submitted, Forge records the run and mirrors the status Hermes reports."
            />
          )}
        </Section>

        <Section title="Timeline" meta={eventsResult.events.length}>
          {eventsResult.events.length > 0 ? (
            <div className="forge-pad-top">
              <MissionTimeline
                events={eventsResult.events}
                actorLabels={new Map([[context.user.id, "You"]])}
              />
            </div>
          ) : (
            <EmptyState
              title="No events recorded"
              text="Mission, run, approval, and tool events are written to the Forge event stream as they happen."
            />
          )}
        </Section>

        <Section title="Approvals" meta={approvalsResult.approvals.length}>
          {approvalsResult.approvals.length > 0 ? (
            approvalsResult.approvals.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                task={mission}
                agentName={agent?.name ?? null}
                taskTitle={mission.title}
              />
            ))
          ) : (
            <EmptyState
              title="No approvals requested"
              text="Approvals appear here when a mission stages an action that needs a human decision."
            />
          )}
        </Section>
      </div>
    </>
  );
}
