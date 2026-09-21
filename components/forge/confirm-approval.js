"use client";

import { useActionState } from "react";

// The operator's confirm control, ported from the reference build's confirm
// card: the exact staged action is shown, and the decision happens server-side.
// Approving runs the staged snapshot; denying closes it without executing.
export function ConfirmApproval({ approval, approveAction, denyAction }) {
  const [approveState, approve, approving] = useActionState(approveAction, null);
  const [denyState, deny, denying] = useActionState(denyAction, null);

  const busy = approving || denying;
  const message = approveState?.message ?? denyState?.message ?? null;
  const ok = approveState?.ok ?? denyState?.ok ?? null;

  return (
    <div className="forge-confirm">
      <div className="forge-confirm-head">
        <span className="forge-eyebrow">
          Confirm · {approval.tool ?? approval.capability}
        </span>
        {approval.expires_at ? (
          <span className="forge-meta-faint">
            expires {new Date(approval.expires_at).toISOString().slice(0, 16).replace("T", " ")} UTC
          </span>
        ) : null}
      </div>

      {approval.stagedArguments?.length > 0 ? (
        <pre className="forge-payload">{approval.stagedArguments.join("\n")}</pre>
      ) : null}

      <div className="forge-confirm-actions">
        <form action={approve}>
          <input type="hidden" name="approvalId" value={approval.id} />
          <button className="forge-button forge-button--primary" type="submit" disabled={busy}>
            {approving ? "Confirming…" : "Do it"}
          </button>
        </form>
        <form action={deny}>
          <input type="hidden" name="approvalId" value={approval.id} />
          <button className="forge-button" type="submit" disabled={busy}>
            {denying ? "Declining…" : "No, cancel it"}
          </button>
        </form>
      </div>

      {message ? (
        <p className="forge-notice" data-tone={ok ? "neutral" : "warn"}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
