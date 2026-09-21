// Fixture Tool Armory shelf, ported from the viewer's tile model.
//
// viewer/tools.js renders tiles with a status pill, brand chip, blurb, action
// bar and an explicit connected count, and its palette is deliberately graphite
// + gold rather than the emerald HUD. Each fixture below covers one state the
// shelf has to communicate.

export const ARMORY_STATUS = {
  connected: { label: "connected", tone: "connected" },
  available: { label: "available", tone: "available" },
  setup: { label: "setup", tone: "muted" },
  waiting: { label: "waiting", tone: "waiting" },
  unavailable: { label: "unavailable", tone: "muted" },
};

export const FIXTURE_TOOLS = [
  {
    id: "forge.internal.workspace_snapshot",
    name: "Workspace snapshot",
    provider: "forge",
    slug: "forge",
    status: "connected",
    level: "read",
    review: "trusted read",
    blurb: "Internal read-only workspace identity, role, and agent count.",
    connection: null,
    available: true,
  },
  {
    id: "research.web_search",
    name: "Web research",
    provider: "research",
    slug: "search",
    status: "available",
    level: "read",
    review: "trusted read",
    blurb: "Search public sources and return findings with citations.",
    connection: null,
    available: true,
  },
  {
    id: "artifact.create",
    name: "Draft artifact",
    provider: "forge",
    slug: "artifact",
    status: "available",
    level: "draft",
    review: "operator confirmation",
    blurb: "Produce a draft deliverable for review. Nothing is published.",
    connection: null,
    available: true,
  },
  {
    id: "social.publish_post",
    name: "Publish post",
    provider: "social",
    slug: "blotato",
    status: "available",
    level: "execute",
    review: "operator confirmation",
    blurb: "Publish the exact approved post to one platform.",
    connection: "Blotato",
    available: true,
  },
  {
    id: "gmail.list_messages",
    name: "Gmail",
    provider: "google",
    slug: "gmail",
    status: "connected",
    level: "read",
    review: "trusted read",
    blurb: "Unread, search, and read messages from the connected mailbox.",
    connection: "Google",
    available: true,
  },
  {
    id: "gmail.create_draft",
    name: "Gmail drafts",
    provider: "google",
    slug: "gmail",
    status: "waiting",
    level: "draft",
    review: "operator confirmation",
    blurb: "Write a cancellation or reply draft. Sending stays separate.",
    connection: "Google (finishing sign-in)",
    available: true,
  },
  {
    id: "analytics.channel_report",
    name: "Channel analytics",
    provider: "vidiq",
    slug: "vidiq",
    status: "setup",
    level: "read",
    review: "trusted read",
    blurb: "Views, watch hours, and momentum for the channel.",
    connection: "vidIQ (needs setup)",
    available: true,
  },
  {
    id: "comments.reply",
    name: "Reply to comments",
    provider: "youtube",
    slug: "youtube",
    status: "available",
    level: "execute",
    review: "operator confirmation",
    blurb: "Submit an approved reply to one exact comment id.",
    connection: "YouTube",
    available: true,
  },
  {
    id: "remote.unknown_tool",
    name: "Unknown remote tool",
    provider: "mcp",
    slug: "mcp",
    status: "available",
    level: "execute",
    review: "always reviewed",
    blurb:
      "A remote server's tool. It cannot self-declare as a safe read, so every call is reviewed.",
    connection: "Remote MCP server",
    available: true,
    unknown: true,
  },
  {
    id: "github.create_pr",
    name: "GitHub",
    provider: "github",
    slug: "github",
    status: "unavailable",
    level: "execute",
    review: "operator confirmation",
    blurb: "Open a pull request. No adapter exists yet, so Forge refuses it.",
    connection: null,
    available: false,
  },
];

export function fixtureTools() {
  return FIXTURE_TOOLS;
}

export function fixtureConnectedCount() {
  return FIXTURE_TOOLS.filter((tool) => tool.status === "connected").length;
}
