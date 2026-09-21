"use client";

import { useState } from "react";

// Bottom command bar, ported from the reference #hud pill: a count, a text
// input, and buttons. In this phase dispatching only produces an honest note —
// there is no runtime behind it yet.
export function JarvisHud({ kinds, counts }) {
  const [brief, setBrief] = useState("");
  const [kind, setKind] = useState(kinds[0]?.key ?? "fleet");
  const [note, setNote] = useState(null);

  return (
    <form
      className="jv-hud"
      onSubmit={(event) => {
        event.preventDefault();
        setNote(
          brief.trim()
            ? `“${brief.trim()}” — ${kinds.find((k) => k.key === kind)?.name}. Fixture only: no runtime is connected in this phase, so nothing was dispatched.`
            : "Give the mission a brief first. Fixture only: nothing is dispatched in this phase."
        );
      }}
    >
      <span className="count">
        {counts.missions} active · {counts.awaiting} awaiting
      </span>

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
        value={brief}
        onChange={(event) => setBrief(event.target.value)}
        placeholder="Say what you want done…"
        aria-label="Mission brief"
      />

      <button className="live" type="submit">
        Deploy
      </button>

      {note ? <span className="jv-hud-note">{note}</span> : null}
    </form>
  );
}
