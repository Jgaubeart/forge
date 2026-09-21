import Link from "next/link";

import { ConfirmApproval } from "./confirm-approval";
import { ActionLevel, Dot, Pill } from "./ui";
import { getMissionKind } from "@/lib/forge/missions/catalog.js";
import { formatDateTimeUtc, formatWhen } from "@/lib/forge/format";
import { taskStatusMeta } from "@/lib/forge/status";

// The Mission Bay card. Ported from the reference build's mission dock: icon,
// title, status LED, the recent event feed, stage chips while a build runs, and
// the confirm control when a gated action is waiting on the operator.
export function MissionCard({
  mission,
  agentName,
  team = [],
  events = [],
  approvals = [],
  approveAction,
  denyAction,
  compact = false,
}) {
  const status = taskStatusMeta(mission.status);
  const kind = getMissionKind(mission.kind) ?? getMissionKind("general");
  const stages = stageProgress(kind, events);
  const feed = events.slice(-8);

  return (
    <article className="forge-mission">
      <header className="forge-mission-head">
        <span className="forge-mission-icon" aria-hidden="true">
          {mission.icon ?? kind.icon}
        </span>
        <span className="forge-mission-title">{mission.title}</span>
        <span className="forge-led" data-status={ledState(mission.status)} />
        <Pill label={status.label} tone={status.tone} live={status.live} />
      </header>

      <div className="forge-mission-meta">
        <span>{kind.name}</span>
        <span>{agentName ?? "Unassigned agent"}</span>
        <span>
          <ActionLevel level={mission.action_level} />
        </span>
        {mission.current_step ? <span>{mission.current_step}</span> : null}
      </div>

      {team.length > 0 ? (
        <div className="forge-team">
          {team.map((member) => (
            <span className="forge-team-chip" key={member.slug ?? member.name}>
              <Dot tone={member.tone ?? "muted"} live={member.live} />
              {member.name}
              {member.role ? <em>{member.role}</em> : null}
            </span>
          ))}
        </div>
      ) : null}

      {stages ? (
        <div className="forge-stages">
          {stages.map((stage) => (
            <span key={stage.name} className={stage.on ? "on" : undefined}>
              {stage.name}
            </span>
          ))}
        </div>
      ) : null}

      {feed.length > 0 ? (
        <ol className="forge-feed">
          {feed.map((event) => (
            <li key={`${event.id}`}>
              <b data-agent={String(event.actorLabel ?? "SYSTEM").toUpperCase()}>
                {event.actorLabel ?? "System"}
              </b>{" "}
              {event.summary ?? event.eventType}
              <span className="forge-feed-time" title={formatDateTimeUtc(event.created_at)}>
                {formatWhen(event.created_at)}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="forge-meta-faint">No activity recorded yet.</p>
      )}

      {approvals.length > 0 ? (
        <div className="forge-mission-confirm">
          {approvals.map((approval) => (
            <ConfirmApproval
              key={approval.id}
              approval={approval}
              approveAction={approveAction}
              denyAction={denyAction}
            />
          ))}
        </div>
      ) : null}

      {!compact ? (
        <footer className="forge-mission-foot">
          <Link className="forge-section-link" href={`/missions/${mission.id}`}>
            Open mission
          </Link>
          {mission.completed_at || mission.cancelled_at ? (
            <span className="forge-meta-faint">
              closed {formatWhen(mission.completed_at ?? mission.cancelled_at)}
            </span>
          ) : null}
        </footer>
      ) : null}
    </article>
  );
}

function ledState(status) {
  const value = String(status ?? "").toLowerCase();
  if (value === "completed") return "done";
  if (value === "failed") return "error";
  if (value === "cancelled") return "idle";
  if (value === "waiting" || value === "waiting_approval") return "wait";
  return "run";
}

function stageProgress(kind, events) {
  const stages = kind?.stages;
  if (!stages || stages.length === 0) return null;

  const reached = new Set(
    events
      .filter((event) => event.eventType === "worker.stage")
      .map((event) => String(event.metadata?.stage ?? "").toUpperCase())
  );

  let last = -1;
  stages.forEach((name, index) => {
    if (reached.has(name)) last = Math.max(last, index);
  });

  return stages.map((name, index) => ({ name, on: index <= last }));
}
