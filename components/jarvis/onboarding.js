"use client";

import { useActionState } from "react";

// One-step onboarding in the Jarvis visual language: a single question, one
// primary action, no wizard. The wider flow — organisation, membership,
// workspace, capability bootstrap — happens server-side.
export function JarvisOnboarding({ action }) {
  const [state, submit, pending] = useActionState(action, null);

  return (
    <div className="jv-onboard">
      <div className="jv-eyebrow">First run</div>
      <h1 className="jv-title">Welcome to Forge</h1>
      <p className="jv-sub">
        Mission Bay keeps missions, approvals, and history in a workspace. One
        step and you are in.
      </p>

      <form className="jv-onboard-form" action={submit}>
        <label className="jv-field" htmlFor="name">
          What should we call this workspace?
          <input
            className="jv-input"
            id="name"
            name="name"
            required
            maxLength={80}
            placeholder="Korben HQ"
            autoComplete="organization"
          />
        </label>

        <label className="jv-field" htmlFor="organization">
          Organisation (optional)
          <input
            className="jv-input"
            id="organization"
            name="organization"
            maxLength={80}
            placeholder="Defaults to the workspace name"
          />
        </label>

        <button className="jv-btn" type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create workspace"}
        </button>
      </form>

      {state?.message ? (
        <p className="jv-notice" data-tone={state.ok ? undefined : "wait"} style={{ marginTop: 10 }}>
          {state.message}
        </p>
      ) : null}

      <p className="jv-confirm-note">
        You become the owner. Forge grants internal workspace access only — no
        email, publishing, or provider permissions are switched on by owning a
        workspace.
      </p>
    </div>
  );
}
