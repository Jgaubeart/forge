import Link from "next/link";

import {
  formatDateTimeUtc,
  formatDuration,
  formatWhen,
  humanize,
  shortId,
} from "@/lib/forge/format";
import {
  agentState,
  approvalStatusMeta,
  runKindLabel,
  runStatusMeta,
  taskStatusMeta,
} from "@/lib/forge/status";
import { ActionLevel, Dot, Pill } from "./ui";

export function TaskRow({ task, agentName, requesterLabel }) {
  const status = taskStatusMeta(task.status);

  return (
    <Link className="forge-row" href={`/tasks/${task.id}`}>
      <span className="forge-row-main">
        <span className="forge-row-title">{task.title}</span>
        <span className="forge-row-meta">
          <span>{agentName ?? "Unassigned agent"}</span>
          {task.currentStep ? <span>{task.currentStep}</span> : null}
          <span>
            <ActionLevel level={task.action_level} />
          </span>
          {requesterLabel ? <span>{requesterLabel}</span> : null}
        </span>
      </span>
      <span className="forge-row-end">
        <Pill label={status.label} tone={status.tone} live={status.live} />
        <span className="forge-row-time" title={formatDateTimeUtc(task.updated_at)}>
          {formatWhen(task.updated_at)}
        </span>
      </span>
    </Link>
  );
}

// Runs are shown as the structure Hermes produced: a primary run with any
// delegated subagent runs nested underneath it.
export function RunRow({ run, task, agentName, eventCount = 0 }) {
  const status = runStatusMeta(run.status);
  const isSubagent = run.kind === "subagent";
  const duration = formatDuration(run.started_at, run.completed_at);

  return (
    <Link
      className={isSubagent ? "forge-row forge-row--child" : "forge-row"}
      href={task ? `/tasks/${task.id}` : "/runs"}
    >
      <span className="forge-row-main">
        <span className="forge-row-title">
          {isSubagent ? run.actorLabel ?? "Subagent" : agentName ?? "Primary run"}
        </span>
        <span className="forge-row-meta">
          <span>{runKindLabel(run.kind)}</span>
          {task ? <span>{task.title}</span> : null}
          {run.hermes_run_id ? (
            <span className="forge-mono">{shortId(run.hermes_run_id, 12)}</span>
          ) : (
            <span>no Hermes id</span>
          )}
          {duration ? <span>{duration}</span> : null}
          {eventCount > 0 ? <span>{eventCount} events</span> : null}
        </span>
      </span>
      <span className="forge-row-end">
        <Pill label={status.label} tone={status.tone} live={status.live} />
        <span className="forge-row-time" title={formatDateTimeUtc(run.created_at)}>
          {formatWhen(run.created_at)}
        </span>
      </span>
    </Link>
  );
}

// The mission timeline reads the durable event stream rather than inventing
// status copy. Summaries are already sanitized when they are written.
export function MissionTimeline({ events, actorLabels }) {
  if (events.length === 0) return null;

  return (
    <div className="forge-timeline">
      {events.map((event) => (
        <div className="forge-timeline-item" key={event.id}>
          <div className="forge-timeline-time" title={formatDateTimeUtc(event.created_at)}>
            {formatWhen(event.created_at)}
          </div>
          <div className="forge-timeline-rail">
            <Dot tone={eventTone(event.eventType)} live={event.eventType === "run.started"} />
          </div>
          <div className="forge-timeline-body">
            <div className="forge-timeline-event">
              {event.summary ?? humanize(event.eventType)}
            </div>
            <div className="forge-timeline-detail">
              {[
                humanize(event.eventType),
                event.actorLabel,
                actorLabels?.get(event.actor_user_id) ?? null,
                event.metadataSummary?.join(" · ") ?? null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReceiptRow({ receipt, task, agentName }) {
  return (
    <Link
      className="forge-row"
      href={receipt.taskId ? `/tasks/${receipt.taskId}` : "/activity"}
    >
      <Dot tone={receipt.success ? "accent" : "danger"} />
      <span className="forge-row-main">
        <span className="forge-row-title">{receipt.tool}</span>
        <span className="forge-row-meta">
          <span className="forge-mono">{receipt.capability}</span>
          <ActionLevel level={receipt.actionLevel} />
          {agentName ? <span>{agentName}</span> : null}
          {receipt.inputSummary ? (
            <span className="forge-truncate">{receipt.inputSummary}</span>
          ) : null}
        </span>
      </span>
      <span className="forge-row-end">
        <Pill
          label={receipt.success ? "Executed" : "Failed"}
          tone={receipt.success ? "accent" : "danger"}
        />
        <span className="forge-row-time" title={formatDateTimeUtc(receipt.executedAt)}>
          {formatWhen(receipt.executedAt)}
        </span>
      </span>
    </Link>
  );
}

function eventTone(eventType) {
  const type = String(eventType ?? "");
  if (type.includes("failed")) return "danger";
  if (type.includes("denied")) return "warn";
  if (type.includes("approval")) return "warn";
  if (type.includes("cancelled") || type.includes("cancel")) return "muted";
  if (type.includes("delegated")) return "info";
  if (type.includes("executed") || type.includes("completed")) return "accent";
  return "accent";
}

export function AgentLine({ agent, tasks = [], runs = [] }) {
  const state = agentState(tasks, runs);

  return (
    <Link className="forge-row" href={`/agents/${agent.id}`}>
      <Dot tone={state.tone} live={state.live} />
      <span className="forge-row-main">
        <span className="forge-row-title">{agent.name}</span>
        <span className="forge-row-meta">
          <span>{agent.department?.name ?? "No department"}</span>
          {agent.maxActionLevel ? (
            <span>
              max <ActionLevel level={agent.maxActionLevel} />
            </span>
          ) : null}
        </span>
      </span>
      <span className="forge-row-end">
        <span className="forge-row-time">{state.label}</span>
      </span>
    </Link>
  );
}

export function ApprovalCard({ approval, task, agentName, taskTitle: title }) {
  const status = approvalStatusMeta(approval.status);
  const lines = approval.payloadSummary ?? [];
  const stagedArguments = approval.stagedArguments ?? lines;

  return (
    <article className="forge-approval">
      <div className="forge-approval-head">
        <div>
          <div className="forge-approval-title">
            {approval.tool ?? approval.capability}
          </div>
          <div className="forge-approval-sub">
            {agentName ?? "Agent"} is requesting permission
            {" · "}
            {title ? (
              <Link href={`/tasks/${approval.task_id}`}>{title}</Link>
            ) : (
              "Task unavailable"
            )}
            {" · "}
            <span className="forge-mono">{approval.capability}</span>
          </div>
        </div>
        <Pill label={status.label} tone={status.tone} />
      </div>

      <div className="forge-approval-body">
        <div>
          <div className="forge-eyebrow">
            Staged action
            {approval.action_level ? ` · ${String(approval.action_level).toUpperCase()}` : ""}
          </div>
          {stagedArguments.length > 0 ? (
            <pre className="forge-payload">{stagedArguments.join("\n")}</pre>
          ) : (
            <p className="forge-meta-faint">No action payload was recorded.</p>
          )}
        </div>

        <div className="forge-row-meta">
          <span>requested {formatWhen(approval.created_at)}</span>
          {approval.expires_at ? (
            <span>expires {formatWhen(approval.expires_at)}</span>
          ) : (
            <span>no expiration recorded</span>
          )}
          {approval.decided_at ? (
            <span>decided {formatWhen(approval.decided_at)}</span>
          ) : null}
          {approval.requesterLabel ? (
            <span>requested by {approval.requesterLabel}</span>
          ) : null}
          {approval.payload_hash ? (
            <span className="forge-mono" title={approval.payload_hash}>
              staged {approval.payload_hash.slice(0, 10)}
            </span>
          ) : null}
        </div>

        <p className="forge-meta-faint">
          The approved action is this staged snapshot. Arguments cannot change
          after review, and execution is refused if they do.
        </p>
      </div>
    </article>
  );
}
