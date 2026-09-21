"use client";

import { useActionState, useState } from "react";

// Start a mission the way the reference build does: pick the kind, give the
// brief, and submit. The server action authorizes, records the durable mission,
// and hands the work to Hermes.
export function StartMission({ kinds, action }) {
  const [state, submit, pending] = useActionState(action, null);
  const [kind, setKind] = useState(kinds[0]?.key ?? "general");
  const selected = kinds.find((entry) => entry.key === kind) ?? kinds[0];

  return (
    <form className="forge-start" action={submit}>
      <div className="forge-start-kinds">
        {kinds.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className="forge-kind"
            data-active={entry.key === kind ? "true" : "false"}
            onClick={() => setKind(entry.key)}
          >
            <span aria-hidden="true">{entry.icon}</span>
            {entry.name}
          </button>
        ))}
      </div>

      <input type="hidden" name="kind" value={kind} />

      <label className="forge-field" htmlFor="brief">
        Brief
        <input
          className="forge-input"
          id="brief"
          name="brief"
          maxLength={400}
          placeholder={
            selected?.needsBrief
              ? `${selected.name} needs a brief`
              : `${selected?.name ?? "Mission"} works without one, but a brief helps`
          }
        />
      </label>

      <div className="forge-start-foot">
        <button className="forge-button forge-button--primary" type="submit" disabled={pending}>
          {pending ? "Dispatching…" : "Dispatch mission"}
        </button>
        <span className="forge-meta-faint">{selected?.description}</span>
      </div>

      {state?.message ? (
        <p className="forge-notice" data-tone={state.ok ? "neutral" : "warn"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
