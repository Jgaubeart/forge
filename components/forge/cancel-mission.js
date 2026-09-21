"use client";

import { useActionState } from "react";

// Cancel is the one mission control that exists in this phase. It calls a
// server action, which authorizes the caller and stops the Hermes run through
// the run controller. The browser never talks to Hermes.
export function CancelMission({ taskId, action }) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form className="forge-cancel" action={formAction}>
      <input type="hidden" name="taskId" value={taskId} />
      <input
        className="forge-input"
        name="reason"
        placeholder="Reason (optional)"
        maxLength={200}
        aria-label="Cancellation reason"
      />
      <button className="forge-button" type="submit" disabled={pending}>
        {pending ? "Cancelling…" : "Cancel mission"}
      </button>
      {state?.message ? (
        <p className="forge-notice" data-tone={state.ok ? "neutral" : "warn"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
