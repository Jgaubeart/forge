// Demo Tool Armory shelf.
//
// The declarations live in `lib/forge/tools/declared.js`; this layer adds the
// demo states the shelf has to demonstrate (connected, ready, waiting on
// sign-in, needs setup, not implemented, unknown remote). Every entry is marked
// `demo`, and only the development preview route renders this, so a real
// workspace never sees a fixture tile presented as live state.

import { DECLARED_TOOLS } from "../forge/tools/declared.js";

export const ARMORY_STATUS = {
  connected: { label: "connected", tone: "connected" },
  available: { label: "available", tone: "available" },
  setup: { label: "setup", tone: "muted" },
  waiting: { label: "waiting", tone: "waiting" },
  unavailable: { label: "unavailable", tone: "muted" },
};

// Which demo state each declared tool illustrates on the shelf.
const DEMO_STATE = {
  "forge.internal.workspace_snapshot": { status: "connected", connection: null },
  "research.web_search": { status: "available", connection: null },
  "artifact.create": { status: "available", connection: null },
  "analytics.channel_report": { status: "setup", connection: "vidIQ (needs setup)" },
  "gmail.list_messages": { status: "connected", connection: "Google" },
  "gmail.create_draft": { status: "waiting", connection: "Google (finishing sign-in)" },
  "gmail.send_message": { status: "available", connection: "Google" },
  "social.publish_post": { status: "available", connection: "Blotato" },
  "comments.reply": { status: "available", connection: "YouTube" },
  "github.create_pr": { status: "unavailable", connection: null },
  "remote.unknown_tool": { status: "available", connection: "Remote MCP server" },
};

export const FIXTURE_TOOLS = DECLARED_TOOLS.map((tool) => {
  const demo = DEMO_STATE[tool.id] ?? { status: "available", connection: null };
  return {
    ...tool,
    status: demo.status,
    connection: demo.connection,
    available: demo.status !== "unavailable",
    unknown: tool.id === "remote.unknown_tool",
    demo: true,
  };
});

export function fixtureTools() {
  return FIXTURE_TOOLS;
}

export function fixtureConnectedCount() {
  return FIXTURE_TOOLS.filter((tool) => tool.status === "connected").length;
}
