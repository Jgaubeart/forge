import Link from "next/link";

import {
  formatDateTimeUtc,
  formatWhen,
  humanize,
} from "@/lib/forge/format";
import {
  agentState,
  approvalStatusMeta,
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

export function ActivityTimeline({ events, taskTitles, actorLabels }) {
  return (
    <div className="forge-timeline">
      {events.map((event) => {
        const summary = (event.metadataSummary ?? []).join(" · ") || null;

        return (
          <div className="forge-timeline-item" key={event.id}>
            <div
              className="forge-timeline-time"
              title={formatDateTimeUtc(event.created_at)}
            >
              {formatWhen(event.created_at)}
            </div>
            <div className="forge-timeline-rail">
              <Dot tone={event.task_id ? "accent" : "muted"} />
            </div>
            <div className="forge-timeline-body">
              <div className="forge-timeline-event">{humanize(event.event_type)}</div>
              <div className="forge-timeline-detail">
                {[
                  actorLabels?.get(event.actor_user_id) ?? "Workspace member",
                  entryTaskLabel(event.task_id, taskTitles),
                  summary,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function RunTimeline({ run }) {
  const entries = [
    { label: "Run created", at: run.created_at },
    { label: "Execution started", at: run.started_at },
    { label: "Execution finished", at: run.completed_at },
  ].filter((entry) => entry.at);

  const status = runStatusMeta(run.status);

  return (
    <div className="forge-timeline">
      {entries.map((entry) => (
        <div className="forge-timeline-item" key={entry.label}>
          <div className="forge-timeline-time" title={formatDateTimeUtc(entry.at)}>
            {formatWhen(entry.at)}
          </div>
          <div className="forge-timeline-rail">
            <Dot tone={status.tone} live={status.live && entry.label !== "Execution finished"} />
          </div>
          <div className="forge-timeline-body">
            <div className="forge-timeline-event">{entry.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ApprovalCard({ approval, task, agentName, taskTitle: title }) {
  const status = approvalStatusMeta(approval.status);
  const lines = approval.payloadSummary ?? [];

  return (
    <article className="forge-approval">
      <div className="forge-approval-head">
        <div>
          <div className="forge-approval-title">
            {agentName ?? "Agent"} is requesting permission
          </div>
          <div className="forge-approval-sub">
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
          <div className="forge-eyebrow">Proposed action</div>
          {lines.length > 0 ? (
            <pre className="forge-payload">{lines.join("\n")}</pre>
          ) : (
            <p className="forge-meta-faint">No action payload was recorded.</p>
          )}
        </div>

        <div className="forge-row-meta">
          <span>
            requested {formatWhen(approval.created_at)}
          </span>
          {approval.expires_at ? (
            <span>
              expires {formatWhen(approval.expires_at)}
            </span>
          ) : (
            <span>no expiration recorded</span>
          )}
          {approval.decided_at ? (
            <span>decided {formatWhen(approval.decided_at)}</span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function entryTaskLabel(taskId, taskTitles) {
  if (!taskId) return null;
  const title = taskTitles?.get(taskId);
  return title ? `Task: ${title}` : "Task recorded";
}
