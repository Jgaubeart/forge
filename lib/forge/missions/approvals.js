// Approval semantics.
//
// An approval is a mission lifecycle boundary, not just a UI card: the mission
// sits in `waiting_approval` until the operator decides, and the staged action is
// immutable and single-use.
//
// This is the reference build's discipline (security.py: one-use, expiring,
// immutable arguments, "confirmation never replans the action") modelled in the
// domain — no cryptography, no storage, no execution.

export const APPROVAL_STATE = Object.freeze({
  pending: "pending",
  approved: "approved",
  denied: "denied",
  expired: "expired",
  consumed: "consumed",
});

export const APPROVAL_STATES = Object.freeze(Object.values(APPROVAL_STATE));

export function createApproval({
  id,
  tool,
  capability,
  args = {},
  destination = null,
  requestedBy = null,
  expiresAt = null,
  now = null,
}) {
  if (!id || !tool || !capability) {
    return { ok: false, reason: "invalid_approval" };
  }

  const stagedArgs = Object.freeze({ ...args });

  return {
    ok: true,
    approval: Object.freeze({
      id,
      tool,
      capability,
      args: stagedArgs,
      destination,
      requestedBy,
      requestedAt: now,
      expiresAt,
      state: APPROVAL_STATE.pending,
      decidedBy: null,
      decidedAt: null,
      consumedAt: null,
      // A stable fingerprint of the staged arguments. Not cryptography: it lets
      // a later phase prove the payload did not change between review and
      // execution, exactly like the reference's payload hash placeholder.
      payloadFingerprint: JSON.stringify(stagedArgs),
    }),
  };
}

export function isExpired(approval, now) {
  if (!approval?.expiresAt || !now) return false;
  return new Date(approval.expiresAt).getTime() <= new Date(now).getTime();
}

export function expireApproval(approval, { now }) {
  if (approval.state !== APPROVAL_STATE.pending) return { ok: false, reason: "not_pending", approval };
  if (!isExpired(approval, now)) return { ok: false, reason: "not_expired", approval };
  return { ok: true, approval: { ...approval, state: APPROVAL_STATE.expired } };
}

export function canDecide(approval, { now } = {}) {
  if (!approval) return { ok: false, reason: "missing_approval" };
  if (approval.state === APPROVAL_STATE.pending) {
    return isExpired(approval, now)
      ? { ok: false, reason: "expired" }
      : { ok: true };
  }
  return { ok: false, reason: `already_${approval.state}` };
}

export function decideApproval(approval, decision, { at = null, by = null } = {}) {
  const allowed = canDecide(approval, { now: at });
  if (!allowed.ok) return { ok: false, reason: allowed.reason, approval };
  if (!["approved", "denied"].includes(decision)) {
    return { ok: false, reason: "invalid_decision", approval };
  }

  return {
    ok: true,
    approval: {
      ...approval,
      state: decision === "approved" ? APPROVAL_STATE.approved : APPROVAL_STATE.denied,
      decidedBy: by,
      decidedAt: at,
    },
  };
}

// Single-use: only an approved action can be consumed, and only once. A second
// attempt is refused rather than silently repeating the action.
export function consumeApproval(approval, { at = null } = {}) {
  if (!approval) return { ok: false, reason: "missing_approval", approval };
  if (approval.state === APPROVAL_STATE.consumed) {
    return { ok: false, reason: "already_consumed", approval };
  }
  if (approval.state !== APPROVAL_STATE.approved) {
    return { ok: false, reason: `not_approved`, approval };
  }
  if (approval.payloadFingerprint !== JSON.stringify(approval.args)) {
    return { ok: false, reason: "payload_changed", approval };
  }

  return {
    ok: true,
    approval: { ...approval, state: APPROVAL_STATE.consumed, consumedAt: at },
    stagedArgs: approval.args,
  };
}

export function approvalSummary(approval) {
  const lines = Object.entries(approval.args ?? {}).map(
    ([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`
  );
  if (approval.destination) lines.unshift(`destination: ${approval.destination}`);
  return lines;
}
