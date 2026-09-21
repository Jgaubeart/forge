"use client";

import { useActionState, useState } from "react";

// Bottom command bar, ported from the reference #hud pill.
//
// Dispatching creates a durable mission record through a server action. It does
// not start work: no runtime is connected in this phase, and the bar says so
// rather than implying progress.
export function JarvisHud({ kinds, counts, startAction }) {
  const [state, submit, pending] = useActionState(startAction, null);
  const [brief, setBrief] = useState("");
  const [kind, setKind] = useState(kinds[0]?.key ?? "fleet");

  return (
    <form className="jv-hud" action={submit}>
      <span className="count">
        {counts.missions} active · {counts.awaiting} awaiting
      </span>

      <input type="hidden" name="kind" value={kind} />
      <select
        className="jv-btn ghost"
        value={kind}
        onChange={(event) => setKind(event.target.value)}
        aria-label="Mission kind"
      >
        {kinds.map((entry) => (
          <option key={entry.key} value={entry.key}>
            {entry.icon} {entry.name}
          </option>
        ))}
      </select>

      <input
        name="brief"
        value={brief}
        onChange={(event) => setBrief(event.target.value)}
        placeholder="Say what you want done…"
        aria-label="Mission brief"
      />

      <button className="live" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Deploy"}
      </button>

      <span className="jv-hud-note">
        {state?.message ??
          "Records the mission as queued. No runtime is connected yet, so nothing executes."}
      </span>
    </form>
  );
}
