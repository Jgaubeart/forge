import Link from "next/link";
import { notFound } from "next/navigation";

import { CancelMission } from "@/components/forge/cancel-mission";
import { ConfirmApproval } from "@/components/forge/confirm-approval";
import { MissionTimeline, ReceiptRow, RunRow } from "@/components/forge/lists";
import { MissionResult } from "@/components/forge/result-panel";
import {
  ActionLevel,
  Dot,
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
import { getMissionKind } from "@/lib/forge/missions/catalog.js";
import {
  getTask,
  listAgents,
  listApprovalsForTask,
  listReceipts,
  listRunEvents,
  listRunsForTask,
} from "@/lib/forge/queries";
import { canCancelMission } from "@/lib/forge/runtime/policy.js";
import { taskStatusMeta } from "@/lib/forge/status";
import {
  approveApprovalAction,
  cancelMissionAction,
  denyApprovalAction,
} from "../actions";

const EVENT_LIMIT = 120;

export default async function MissionDetailPage({ params }) {
  const { id } = await params;
  const context = await requireForgeContext();
  const supabase = context.supabase;

  const taskResult = await getTask(supabase, id);
  if (!taskResult.task) notFound();

  const mission = taskResult.task;
  const kind = getMissionKind(mission.kind) ?? getMissionKind("general");

  const [agentsResult, runsResult, approvalsResult, eventsResult, receiptsResult] =
    await Promise.all([
      listAgents(supabase),
      listRunsForTask(supabase, mission.id),
      listApprovalsForTask(supabase, mission.id),
      listRunEvents(supabase, { taskId: mission.id, limit: EVENT_LIMIT }),
      mission.workspace_id
        ? listReceipts(supabase, { workspaceId: mission.workspace_id, limit: 40 })
        : Promise.resolve({ receipts: [], failed: false }),
    ]);

  const agent =
    agentsResult.agents.find((item) => item.id === mission.agent_id) ?? null;
  const status = taskStatusMeta(mission.status);
  const cancellable = canCancelMission(mission.status);

  const receipts = receiptsResult.receipts.filter(
    (receipt) => receipt.taskId === mission.id
  );
  const pendingApprovals = approvalsResult.approvals.filter(
    (approval) => approval.status === "pending"
  );
  const decidedApprovals = approvalsResult.approvals.filter(
    (approval) => approval.status !== "pending"
  );

  const primaryRuns = runsResult.runs.filter((run) => run.kind !== "subagent");
  const childRuns = runsResult.runs.filter((run) => run.kind === "subagent");
  const childrenByParent = new Map();
  for (const child of childRuns) {
    const bucket = childrenByParent.get(child.parentRunId);
    if (bucket) bucket.push(child);
    else childrenByParent.set(child.parentRunId, [child]);
  }

  const eventCountFor = (runId) =>
    eventsResult.events.filter((event) => event.agentRunId === runId).length;

  const teamSlugs = Array.isArray(mission.policy?.team) ? mission.policy.team : [];
  const team = teamSlugs.map((slug) => {
    const member = agentsResult.agents.find((entry) => entry.slug === slug);
    const childRun = childRuns.find((run) => run.actorLabel === member?.name);
    const childStatus = String(childRun?.status ?? "").toLowerCase();
    return {
      slug,
      name: member?.name ?? slug.toUpperCase(),
      role: null,
      tone: childRun ? (childStatus === "failed" ? "danger" : "accent") : "muted",
      live: childStatus === "running" || childStatus === "queued",
    };
  });

  return (
    <>
      <PageHeader
        eyebrow={`${kind.icon} ${kind.name}`}
        title={mission.title}
        subtitle={`${agent ? `${agent.name} · ` : ""}created by ${actorLabel(
          mission.requested_by,
          context.user.id
        )}`}
        meta={`${status.label}${mission.current_step ? ` · ${mission.current_step}` : ""}`}
        actions={
          <Link className="forge-button" href="/missions">
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

        {pendingApprovals.length > 0 ? (
          <Section title="Waiting for your confirmation" meta={pendingApprovals.length}>
            {pendingApprovals.map((approval) => (
              <ConfirmApproval
                key={approval.id}
                approval={{
                  ...approval,
                  stagedArguments: approval.payloadSummary ?? [],
                }}
                approveAction={approveApprovalAction}
                denyAction={denyApprovalAction}
              />
            ))}
          </Section>
        ) : null}

        {Object.keys(mission.result ?? {}).length > 0 ? (
          <Section title="Result">
            <MissionResult mission={mission} receipts={receipts} />
          </Section>
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
                <dt>Kind</dt>
                <dd>
                  {kind.icon} {kind.name}
                </dd>
              </div>
              <div className="forge-kv-row">
                <dt>Current step</dt>
                <dd>{mission.current_step ?? "—"}</dd>
              </div>
              <div className="forge-kv-row">
                <dt>Lead agent</dt>
                <dd>
                  {agent ? (
                    <Link href={`/agents/${agent.id}`}>{agent.name}</Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="forge-kv-row">
                <dt>Action level</dt>
                <dd>
                  <ActionLevel level={mission.action_level} />
                </dd>
              </div>
              <div className="forge-kv-row">
                <dt>Started</dt>
                <dd>{mission.started_at ? formatDateTime(mission.started_at) : "—"}</dd>
              </div>
              <div className="forge-kv-row">
                <dt>Closed</dt>
                <dd>
                  {mission.completed_at
                    ? `${formatDateTime(mission.completed_at)}${
                        mission.started_at
                          ? ` · ${formatDuration(mission.started_at, mission.completed_at)}`
                          : ""
                      }`
                    : mission.cancelled_at
                      ? formatDateTime(mission.cancelled_at)
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
            {team.length > 0 ? (
              <Section title="Team" meta={`${team.length} agents`}>
                <div className="forge-team">
                  {team.map((member) => (
                    <span className="forge-team-chip" key={member.slug}>
                      <Dot tone={member.tone} live={member.live} />
                      {member.name}
                    </span>
                  ))}
                </div>
                <p className="forge-meta-faint forge-pad-top">
                  Hermes performs the delegation. Each worker appears here as soon
                  as Hermes reports its child run.
                </p>
              </Section>
            ) : null}

            <Section title="Brief">
              {(mission.inputSummary ?? []).length > 0 ? (
                <pre className="forge-payload">{mission.inputSummary.join("\n")}</pre>
              ) : (
                <p className="forge-meta">No brief recorded for this mission.</p>
              )}
            </Section>

            <Section title="Control">
              {cancellable ? (
                <>
                  <CancelMission taskId={mission.id} action={cancelMissionAction} />
                  <p className="forge-meta-faint forge-pad-top">
                    Cancelling authorizes you, asks Hermes to stop the run when one
                    exists, and keeps every prior event and receipt.
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

        <Section title="Workers and runs" meta={runsResult.runs.length}>
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
              title="No runs recorded"
              text="When this mission is submitted, Forge records the run and mirrors what Hermes reports."
            />
          )}
        </Section>

        <Section title="Mission events" meta={eventsResult.events.length}>
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
              text="Mission, worker, tool, and approval events are written as they happen."
            />
          )}
        </Section>

        <Section title="Receipts" meta={receipts.length}>
          {receipts.length > 0 ? (
            <div className="forge-rows">
              {receipts.map((receipt) => (
                <ReceiptRow
                  key={receipt.id}
                  receipt={receipt}
                  task={mission}
                  agentName={agent?.name ?? null}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Nothing executed yet"
              text="A receipt is written only when Forge actually runs an action. A tool being accepted is not proof the provider published anything."
            />
          )}
        </Section>

        {decidedApprovals.length > 0 ? (
          <Section title="Decided approvals" meta={decidedApprovals.length}>
            <div className="forge-rows">
              {decidedApprovals.map((approval) => (
                <div className="forge-row" key={approval.id}>
                  <span className="forge-row-main">
                    <span className="forge-row-title">
                      {approval.tool ?? approval.capability}
                    </span>
                    <span className="forge-row-meta">
                      <span className="forge-mono">{approval.capability}</span>
                      <span>{approval.decided_at ? formatDateTime(approval.decided_at) : ""}</span>
                    </span>
                  </span>
                  <span className="forge-row-end">
                    <Pill
                      label={approval.status}
                      tone={approval.status === "approved" ? "accent" : "muted"}
                    />
                  </span>
                </div>
              ))}
            </div>
          </Section>
        ) : null}
      </div>
    </>
  );
}
