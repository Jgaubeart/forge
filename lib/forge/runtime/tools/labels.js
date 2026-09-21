// Safe, human event labels for tool activity.
//
// Ported from the reference build's tool_label: the operator sees "reading
// Gmail…" or "drafting an email…" rather than a raw tool name, and a tool is
// classified as read or mutating. Nothing here reveals arguments or results.

const READ_HINTS = [
  "read",
  "grep",
  "glob",
  "search",
  "find",
  "get",
  "list",
  "fetch",
  "watch",
  "stats",
  "analytics",
  "history",
  "poll",
  "transcript",
  "report",
  "scan",
];

export function classifyTool(toolId) {
  const id = String(toolId ?? "tool").toLowerCase();
  return READ_HINTS.some((hint) => id.includes(hint)) ? "read" : "tool";
}

export function toolLabel(toolId, { provider = null } = {}) {
  const id = String(toolId ?? "tool");
  const lower = id.toLowerCase();
  const vendor = provider ?? lower.split(/[._]/)[0];

  if (lower.includes("gmail") || lower.includes("email")) {
    if (lower.includes("send")) return { kind: "tool", label: "sending an email…" };
    if (lower.includes("draft")) return { kind: "tool", label: "drafting an email…" };
    return { kind: "read", label: "reading mail…" };
  }
  if (lower.includes("comment")) {
    if (lower.includes("reply")) return { kind: "tool", label: "submitting replies…" };
    return { kind: "read", label: "reading comments…" };
  }
  if (lower.includes("social") || lower.includes("post")) {
    if (lower.includes("publish") || lower.includes("create_post")) {
      return { kind: "tool", label: "posting…" };
    }
    return { kind: "tool", label: "drafting posts…" };
  }
  if (lower.includes("analytics") || lower.includes("channel")) {
    return { kind: "read", label: "pulling performance numbers…" };
  }
  if (lower.includes("subscription")) {
    return { kind: "read", label: "sweeping recurring charges…" };
  }
  if (lower.includes("search") || lower.includes("research")) {
    return { kind: "read", label: "searching…" };
  }
  if (lower.includes("repository") || lower.includes("github")) {
    return lower.includes("read")
      ? { kind: "read", label: "reading the repository…" }
      : { kind: "tool", label: "updating the repository…" };
  }
  if (lower.includes("delegat")) {
    return { kind: "tool", label: "delegating a sub-task…" };
  }

  const short = lower.split(/[._]/).pop().replace(/_/g, " ");
  return { kind: classifyTool(id), label: `${short}…` };
}
