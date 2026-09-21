"use client";

import { useState } from "react";

import { AgentDot, AgentFeedName } from "./agent-sigil";
import { MissionResult, WorkerRow } from "./results";

// Mission card, ported from the reference mission dock (.jm-card): icon + kind
// title, status LED, agent-coloured event feed, stage chips, inline confirm
// controls, and the result inline in the card.
//
// In this phase the confirm buttons only change local fixture state. Nothing
// leaves the browser, and the card says so.
const LED = {
  running: "run",
  awaiting_confirm: "wait",
  done: "done",
  error: "error",
  cancelled: "idle",
};

const FEED_LIMIT = 8;

export function MissionCard({ mission, expanded = false }) {
  const [approvalState, setApprovalState] = useState(mission.approval?.state ?? null);
  const [showAll, setShowAll] = useState(false);
  const [cancelled, setCancelled] = useState(mission.status === "cancelled");

  const status = cancelled ? "cancelled" : mission.status;
  const feed = showAll ? mission.events : mission.events.slice(-FEED_LIMIT);
  const hasResult = Boolean(mission.result);

  return (
    <article className="jv-mission" data-status={status}>
      <header className="jv-mission-head">
        <span className="ic" aria-hidden="true">
          {mission.kind.icon}
        </span>
        <span className="jv-mission-title">{mission.title}</span>
        <span className="jv-led" data-state={LED[status] ?? "run"} />
      </header>

      <div className="jv-mission-meta">
        <span>{mission.kind.name}</span>
        <span>
          <AgentDot name={mission.lead} live={status === "running"} />
          {mission.lead}
        </span>
        <span>{mission.statusLabel}</span>
      </div>

      {mission.brief ? <p className="jv-mission-brief">“{mission.brief}”</p> : null}

      {mission.team.length > 0 ? (
        <div className="jv-team">
          {mission.team.map((worker) => (
            <WorkerRow key={worker.name} worker={worker} />
          ))}
        </div>
      ) : null}

      {mission.stages?.length ? (
        <div className="jv-stages">
          {mission.stages.map((stage) => (
            <span key={stage} className={mission.reached.includes(stage) ? "on" : undefined}>
              {stage}
            </span>
          ))}
        </div>
      ) : null}

      <ol className="jv-feed">
        {feed.map((event) => (
          <li key={`${event.ts}-${event.label}`}>
            <AgentFeedName name={event.agent} />
            <span className={event.kind === "error" ? "lbl err" : "lbl"}>{event.label}</span>
            <span className="ts">{event.ts.slice(11, 16)}</span>
          </li>
        ))}
      </ol>

      {mission.events.length > FEED_LIMIT && !showAll ? (
        <div className="jv-mission-foot" style={{ borderTop: "none", paddingTop: 0 }}>
          <button className="jv-btn ghost" type="button" onClick={() => setShowAll(true)}>
            Show full feed ({mission.events.length})
          </button>
        </div>
      ) : null}

      {mission.error ? (
        <p className="jv-notice" style={{ marginTop: 9 }}>
          {mission.error}
        </p>
      ) : null}

      {mission.approval && approvalState === "pending" ? (
        <div className="jv-confirm">
          <div className="jv-confirm-head">
            <span>Needs your word · {mission.approval.tool}</span>
            <span>expires {mission.approval.expires}</span>
          </div>
          <div className="jv-confirm-args">{mission.approval.args.join("\n")}</div>
          <div className="jv-confirm-actions">
            <button
              className="jv-btn"
              type="button"
              onClick={() => setApprovalState("approved")}
            >
              Do it
            </button>
            <button
              className="jv-btn ghost"
              type="button"
              onClick={() => setApprovalState("declined")}
            >
              No, cancel it
            </button>
          </div>
          <div className="jv-confirm-note">
            Fixture approval. Confirming changes this card only — no service is
            called in this phase.
          </div>
        </div>
      ) : null}

      {approvalState === "approved" ? (
        <div className="jv-notice" style={{ marginTop: 9 }}>
          Approved in the fixture. Nothing was sent, and no receipt was written.
        </div>
      ) : null}

      {approvalState === "declined" ? (
        <div className="jv-notice" style={{ marginTop: 9 }}>
          Declined. Nothing ran.
        </div>
      ) : null}

      {cancelled && mission.status !== "cancelled" ? (
        <div className="jv-notice" style={{ marginTop: 9 }}>
          Stop requested in the fixture. The mission would be stopped at the
          runtime in a later phase.
        </div>
      ) : null}

      {hasResult && (expanded || mission.status === "done") ? (
        <div className="jv-receipt">
          <div className="jv-eyebrow" style={{ marginBottom: 8 }}>
            Result
          </div>
          <MissionResult mission={mission} />
        </div>
      ) : null}

      <footer className="jv-mission-foot">
        <span className="jv-mono">{mission.kind.key}</span>
        <span style={{ display: "flex", gap: 6 }}>
          {mission.cancelable && !cancelled ? (
            <button
              className="jv-rbtn"
              type="button"
              title="Stop this mission"
              onClick={() => setCancelled(true)}
            >
              ■
            </button>
          ) : null}
        </span>
      </footer>
    </article>
  );
}
