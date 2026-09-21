// Honest action language.
//
// The reference build's receipt rule, encoded: a mission may say a draft exists
// or that an action was requested, but it may not say something was sent,
// published, cancelled, or created unless a provider receipt says so.
//
// Deterministic helpers only — no model, no heuristics beyond an explicit list.

export const ACTION_LANGUAGE = Object.freeze({
  requested: "Action requested",
  prepared: "Draft prepared",
  awaiting: "Awaiting confirmation",
  declined: "Declined — nothing was sent",
  failed: "Attempt failed",
  sent: "Sent",
  published: "Published",
  cancelled: "Cancelled",
  created: "Created",
});

// Verbs that assert an external action actually happened.
export const PROVIDER_VERBS = Object.freeze(["sent", "published", "cancelled", "created"]);

const PHRASES = Object.freeze({
  requested: /\b(sent|published|cancelled|canceled|created|posted|delivered|scheduled)\b/i,
  prepared: /\b(draft|prepared|ready|queued|requested|awaiting|staged)\b/i,
});

export function requiresReceipt(text) {
  return PHRASES.requested.test(String(text ?? ""));
}

export function isHonestClaim(text, { receiptId = null } = {}) {
  if (!requiresReceipt(text)) return true;
  return Boolean(receiptId);
}

// Throws only when a caller is about to make a claim the evidence does not
// support; everything else returns a labelled result.
export function assertHonestClaim(text, { receiptId = null } = {}) {
  if (!isHonestClaim(text, { receiptId })) {
    throw new Error(
      `Refusing to claim "${text}" without a provider receipt. Use draft/prepared language until a receipt exists.`
    );
  }
  return true;
}

// The single place the UI asks "what may I say about this action?".
export function actionLanguage({ state, receiptId = null } = {}) {
  const hasReceipt = Boolean(receiptId);

  switch (String(state ?? "requested")) {
    case "draft":
    case "prepared":
      return { text: ACTION_LANGUAGE.prepared, honest: true, mayClaimCompletion: hasReceipt };
    case "awaiting":
    case "pending":
      return { text: ACTION_LANGUAGE.awaiting, honest: true, mayClaimCompletion: false };
    case "declined":
    case "denied":
      return { text: ACTION_LANGUAGE.declined, honest: true, mayClaimCompletion: false };
    case "failed":
      return { text: ACTION_LANGUAGE.failed, honest: true, mayClaimCompletion: false };
    case "accepted":
    case "submitted":
      return hasReceipt
        ? { text: "Accepted by the provider", honest: true, mayClaimCompletion: true }
        : {
            text: "Accepted by the tool — check the receipt before treating it as done",
            honest: true,
            mayClaimCompletion: false,
          };
    case "completed":
      return hasReceipt
        ? { text: "Confirmed by the provider", honest: true, mayClaimCompletion: true }
        : {
            text: ACTION_LANGUAGE.prepared,
            honest: true,
            mayClaimCompletion: false,
          };
    default:
      return { text: ACTION_LANGUAGE.requested, honest: true, mayClaimCompletion: hasReceipt };
  }
}
