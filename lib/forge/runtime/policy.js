// Mission lifecycle and capability policy.
//
// Pure functions only: no database access, no Hermes calls. This is the single
// place that decides whether a requested capability at a requested action level
// is permitted, and whether a mission can still be cancelled.
//
// The rule that matters: an action is allowed only when BOTH the agent and the
// requesting member hold the capability, at or above the requested level. The
// effective ceiling is the lower of the two.

export const ACTION_LEVELS = Object.freeze(["read", "draft", "execute"]);

export const ACTION_LEVEL_RANK = Object.freeze({
  read: 0,
  draft: 1,
  execute: 2,
});

export const MISSION_STATUSES = Object.freeze([
  "queued",
  "planning",
  "running",
  "waiting",
  "waiting_approval",
  "completed",
  "failed",
  "cancelled",
]);

export const ACTIVE_MISSION_STATUSES = Object.freeze([
  "queued",
  "planning",
  "running",
  "waiting",
  "waiting_approval",
]);

export const TERMINAL_MISSION_STATUSES = Object.freeze([
  "completed",
  "failed",
  "cancelled",
]);

export function normalizeActionLevel(value) {
  const level = String(value ?? "").trim().toLowerCase();
  return level in ACTION_LEVEL_RANK ? level : null;
}

export function isMissionStatus(value) {
  return MISSION_STATUSES.includes(String(value ?? "").trim().toLowerCase());
}

export function isTerminalMission(status) {
  return TERMINAL_MISSION_STATUSES.includes(
    String(status ?? "").trim().toLowerCase()
  );
}

export function canCancelMission(status) {
  const normalized = String(status ?? "").trim().toLowerCase();
  return isMissionStatus(normalized) && !isTerminalMission(normalized);
}

// Hermes reports its own status vocabulary; Forge maps it onto mission states.
export function mapRunStatus(value) {
  const status = String(value ?? "").trim().toLowerCase();

  switch (status) {
    case "queued":
    case "pending":
    case "starting":
      return "queued";
    case "planning":
      return "planning";
    case "waiting":
    case "approval_required":
    case "waiting_approval":
      return "waiting_approval";
    case "completed":
    case "succeeded":
    case "success":
      return "completed";
    case "failed":
    case "error":
      return "failed";
    case "cancelled":
    case "canceled":
    case "stopped":
      return "cancelled";
    case "running":
    case "in_progress":
      return "running";
    default:
      return status || "running";
  }
}

export function highestActionLevel(levels = []) {
  let highest = null;

  for (const candidate of levels) {
    const level = normalizeActionLevel(candidate);
    if (!level) continue;
    if (highest === null || ACTION_LEVEL_RANK[level] > ACTION_LEVEL_RANK[highest]) {
      highest = level;
    }
  }

  return highest;
}

export function actionLevelAllows(requested, allowedMax) {
  const requestedLevel = normalizeActionLevel(requested);
  const allowedLevel = normalizeActionLevel(allowedMax);
  if (!requestedLevel || !allowedLevel) return false;
  return ACTION_LEVEL_RANK[requestedLevel] <= ACTION_LEVEL_RANK[allowedLevel];
}

export function lowerActionLevel(a, b) {
  const left = normalizeActionLevel(a);
  const right = normalizeActionLevel(b);
  if (!left) return right;
  if (!right) return left;
  return ACTION_LEVEL_RANK[left] <= ACTION_LEVEL_RANK[right] ? left : right;
}

function levelFor(capabilities, capability) {
  const match = (capabilities ?? []).find(
    (entry) => String(entry.capability) === String(capability)
  );
  return match ? normalizeActionLevel(match.max_action_level ?? match.action_level) : null;
}

// The single capability decision used by the context builder and the tool
// gateway before anything reaches Hermes or a provider.
export function evaluateCapabilityAccess({
  capability,
  requestedActionLevel,
  agentCapabilities = [],
  membershipCapabilities = [],
}) {
  const requested = normalizeActionLevel(requestedActionLevel);

  if (!capability || !requested) {
    return {
      allowed: false,
      reason: "invalid_request",
      message: "A capability and a valid action level are required.",
      effectiveActionLevel: null,
      agentActionLevel: null,
      memberActionLevel: null,
    };
  }

  const agentLevel = levelFor(agentCapabilities, capability);
  if (!agentLevel) {
    return {
      allowed: false,
      reason: "agent_capability_missing",
      message: `The agent is not permitted to use ${capability}.`,
      effectiveActionLevel: null,
      agentActionLevel: null,
      memberActionLevel: null,
    };
  }

  const memberLevel = levelFor(membershipCapabilities, capability);
  if (!memberLevel) {
    return {
      allowed: false,
      reason: "member_capability_missing",
      message: `Your membership is not permitted to use ${capability}.`,
      effectiveActionLevel: null,
      agentActionLevel: agentLevel,
      memberActionLevel: null,
    };
  }

  const effective = lowerActionLevel(agentLevel, memberLevel);

  if (!actionLevelAllows(requested, effective)) {
    return {
      allowed: false,
      reason:
        ACTION_LEVEL_RANK[requested] > ACTION_LEVEL_RANK[agentLevel]
          ? "action_level_exceeds_agent"
          : "action_level_exceeds_member",
      message: `Requested action level ${requested} exceeds the permitted ceiling ${effective} for ${capability}.`,
      effectiveActionLevel: effective,
      agentActionLevel: agentLevel,
      memberActionLevel: memberLevel,
    };
  }

  return {
    allowed: true,
    reason: "allowed",
    message: `${capability} is permitted at ${requested}.`,
    effectiveActionLevel: effective,
    agentActionLevel: agentLevel,
    memberActionLevel: memberLevel,
  };
}
