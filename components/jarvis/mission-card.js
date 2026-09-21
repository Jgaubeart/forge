"use client";

import { useActionState, useState } from "react";

import { AgentDot, AgentFeedName } from "./agent-sigil";
import { MissionResult, WorkerRow } from "./results";
import { clockOf, expiryWord, feedLine, ledState, stageChips, statusWord } from "./mission-view";
import { APPROVAL_STATE, actionLanguage } from "@/lib/forge/missions";

// Mission card, ported from the reference dock (.jm-card): icon and kind title,
// status LED, agent-coloured feed, stage chips, inline confirmation, and the
// result inside the card.
//
// The card renders a validated domain mission. Start and Sync are server actions:
// starting dispatches one runtime run, syncing folds the runtime's own report
// back in. The confirm buttons still only change local state — approval
// execution is a later phase, and the card says so.
const FEED_LIMIT = 8;

// Hooks must be called unconditionally, so a card without a server action still
// gets a function. It is never submitted: without an action the card renders the
// local fixture button instead of a form.
async function noAction() {
  return null;
}

export function MissionCard({
  mission,
  cancelAction = null,
  dispatchAction = null,
  refreshAction = null,
  runtimeReady = false,
}) {
  // With a server action the cancel is durable; without one (the fixture preview
  // route) the button only changes this card, which is what a fixture can do.
  const [cancelState, cancel, cancelling] = useActionState(
    cancelAction ?? noAction,
    null
  );
  const [dispatchState, dispatch, dispatching] = useActionState(dispatchAction ?? noAction, null);
  const [syncState, sync, syncing] = useActionState(refreshAction ?? noAction, null);
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
            Confirming changes this card only. Approval execution arrives in a
            later phase: nothing is sent, and no receipt is written.
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
          Stop requested here. Prior events and any partial result stay on the
          mission. The preview route has no runtime to stop.
        </div>
      ) : null}

      {cancelState?.message ? (
        <div
          className="jv-notice"
          data-tone={cancelState.ok ? undefined : "wait"}
          style={{ marginTop: 9 }}
        >
          {cancelState.message}
        </div>
      ) : null}

      {dispatchState?.message ? (
        <div
          className="jv-notice"
          data-tone={dispatchState.ok ? undefined : "wait"}
          style={{ marginTop: 9 }}
        >
          {dispatchState.message}
        </div>
      ) : null}

      {syncState?.message ? (
        <div
          className="jv-notice"
          data-tone={syncState.ok ? undefined : "wait"}
          style={{ marginTop: 9 }}
        >
          {syncState.message}
        </div>
      ) : null}

      {mission.status === "cancelled" || cancelState?.ok ? (
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
        {dispatchAction && mission.status === "queued" ? (
          <form action={dispatch}>
            <input type="hidden" name="missionId" value={mission.id} />
            <button
              className="jv-btn ghost"
              type="submit"
              disabled={dispatching || !runtimeReady}
              title={
                runtimeReady
                  ? "Run this mission through the runtime"
                  : "The execution runtime is not connected"
              }
            >
              {dispatching ? "Starting…" : "Start"}
            </button>
          </form>
        ) : null}
        {refreshAction && !stopped && status !== "completed" && status !== "cancelled" ? (
          <form action={sync}>
            <input type="hidden" name="missionId" value={mission.id} />
            <button
              className="jv-btn ghost"
              type="submit"
              disabled={syncing}
              title="Ask the runtime what happened"
            >
              {syncing ? "Syncing…" : "Sync"}
            </button>
          </form>
        ) : null}
        {mission.cancellationAllowed && !stopped && status !== "completed" ? (
          cancelAction ? (
            <form action={cancel}>
              <input type="hidden" name="missionId" value={mission.id} />
              <button
                className="jv-rbtn"
                type="submit"
                title="Stop this mission"
                disabled={cancelling}
              >
                ■
              </button>
            </form>
          ) : (
            <button
              className="jv-rbtn"
              type="button"
              title="Stop this mission"
              onClick={() => setStopped(true)}
            >
              ■
            </button>
          )
        ) : null}
      </footer>
    </article>
  );
}
