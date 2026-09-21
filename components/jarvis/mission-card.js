"use client";

import { useState } from "react";

import { AgentDot, AgentFeedName } from "./agent-sigil";
import { MissionResult, WorkerRow } from "./results";
import { clockOf, expiryWord, feedLine, ledState, stageChips, statusWord } from "./mission-view";
import { APPROVAL_STATE, actionLanguage } from "@/lib/forge/missions";

// Mission card, ported from the reference dock (.jm-card): icon and kind title,
// status LED, agent-coloured feed, stage chips, inline confirmation, and the
// result inside the card.
//
// The card renders a validated domain mission. In this phase the confirm buttons
// only change local state — no runtime, no service, and the card says so.
const FEED_LIMIT = 8;

export function MissionCard({ mission }) {
  const [approval, setApproval] = useState(mission.approval ?? null);
  const [showAll, setShowAll] = useState(false);
  const [stopped, setStopped] = useState(mission.status === "cancelled");

  const status = stopped ? "cancelled" : mission.status;
  const feed = showAll ? mission.events : mission.events.slice(-FEED_LIMIT);
  const chips = stageChips(mission);
  const approvalLine = approval ? actionLanguage({ state: approval.state }) : null;

  return (
    <article className="jv-mission" data-status={status}>
      <header className="jv-mission-head">
        <span className="ic" aria-hidden="true">
          {mission.icon}
        </span>
        <span className="jv-mission-title">{mission.title}</span>
        <span className="jv-led" data-state={ledState(status)} />
      </header>

      <div className="jv-mission-meta">
        <span>{mission.kindTitle}</span>
        <span>
          <AgentDot slug={mission.leadSlug} live={status === "running"} />
          {mission.leadName}
        </span>
        <span>{statusWord(status)}</span>
        {mission.currentStage ? <span>stage: {mission.currentStage.toLowerCase()}</span> : null}
      </div>

      {mission.brief ? <p className="jv-mission-brief">“{mission.brief}”</p> : null}

      {mission.team.length > 0 ? (
        <div className="jv-team">
          {mission.team.map((worker) => (
            <WorkerRow key={worker.slug} worker={worker} />
          ))}
        </div>
      ) : null}

      {chips.length > 0 ? (
        <div className="jv-stages">
          {chips.map((chip) => (
            <span key={chip.stage} className={chip.on ? "on" : undefined}>
              {chip.stage}
            </span>
          ))}
        </div>
      ) : null}

      <ol className="jv-feed">
        {feed.map((event) => {
          const line = feedLine(event, mission);
          return (
            <li key={event.id}>
              <AgentFeedName slug={line.agentSlug} />
              <span className={line.tone === "err" ? "lbl err" : "lbl"}>{line.text}</span>
              <span className="ts">{clockOf(line.at)}</span>
            </li>
          );
        })}
      </ol>

      {mission.events.length > FEED_LIMIT && !showAll ? (
        <button className="jv-btn ghost" type="button" onClick={() => setShowAll(true)}>
          Show full feed ({mission.events.length})
        </button>
      ) : null}

      {mission.error ? (
        <p className="jv-notice" style={{ marginTop: 9 }}>
          {mission.error}
        </p>
      ) : null}

      {approval && approval.state === APPROVAL_STATE.pending ? (
        <div className="jv-confirm">
          <div className="jv-confirm-head">
            <span>Needs your word · {approval.tool}</span>
            <span>expires {expiryWord(approval.expiresAt)}</span>
          </div>
          <div className="jv-confirm-args">
            {Object.entries(approval.args)
              .map(([key, value]) => `${key}: ${value}`)
              .join("\n")}
          </div>
          <div className="jv-confirm-actions">
            <button
              className="jv-btn"
              type="button"
              onClick={() => setApproval({ ...approval, state: APPROVAL_STATE.approved })}
            >
              Do it
            </button>
            <button
              className="jv-btn ghost"
              type="button"
              onClick={() => setApproval({ ...approval, state: APPROVAL_STATE.denied })}
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

      {approvalLine && approval.state !== APPROVAL_STATE.pending ? (
        <div className="jv-notice" style={{ marginTop: 9 }}>
          {approvalLine.text}
          {approval.state === APPROVAL_STATE.approved
            ? " Nothing was sent, and no receipt was written."
            : ""}
        </div>
      ) : null}

      {stopped && mission.status !== "cancelled" ? (
        <div className="jv-notice" style={{ marginTop: 9 }}>
          Stop requested in the fixture. Prior events and any partial result stay
          on the mission, and the runtime stop call arrives in a later phase.
        </div>
      ) : null}

      {mission.status === "cancelled" ? (
        <div className="jv-notice" style={{ marginTop: 9 }}>
          Cancelled. History and partial work are preserved.
        </div>
      ) : null}

      {mission.result ? (
        <details className="jv-receipt" open={mission.status === "completed"}>
          <summary>Result</summary>
          <MissionResult result={mission.result} />
        </details>
      ) : null}

      <footer className="jv-mission-foot">
        <span className="jv-mono">{mission.kind}</span>
        {mission.cancellationAllowed && !stopped && status !== "completed" ? (
          <button
            className="jv-rbtn"
            type="button"
            title="Stop this mission"
            onClick={() => setStopped(true)}
          >
            ■
          </button>
        ) : null}
      </footer>
    </article>
  );
}
