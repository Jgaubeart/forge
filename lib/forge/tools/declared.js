// Declared tools.
//
// What Forge intends to offer, stated once: identifiers, providers, the
// capability each tool needs, its action level, and its review policy. No
// provider adapter exists yet, so `available` is false for every entry and the
// authenticated Tool Armory reports them all as not connected.
//
// The demo shelf with connected/waiting/needs-setup states lives in the fixture
// layer and is reachable only from the development preview route.

export const DECLARED_TOOLS = Object.freeze([
  {
    id: "forge.internal.workspace_snapshot",
    name: "Workspace snapshot",
    provider: "forge",
    slug: "forge",
    level: "read",
    review: "trusted read",
    requiresConnection: false,
    blurb: "Internal read-only workspace identity, role, and agent count.",
  },
  {
    id: "research.web_search",
    name: "Web research",
    provider: "research",
    slug: "search",
    level: "read",
    review: "trusted read",
    requiresConnection: false,
    blurb: "Search public sources and return findings with citations.",
  },
  {
    id: "artifact.create",
    name: "Draft artifact",
    provider: "forge",
    slug: "artifact",
    level: "draft",
    review: "operator confirmation",
    requiresConnection: false,
    blurb: "Produce a draft deliverable for review. Nothing is published.",
  },
  {
    id: "analytics.channel_report",
    name: "Channel analytics",
    provider: "vidiq",
    slug: "vidiq",
    level: "read",
    review: "trusted read",
    requiresConnection: true,
    blurb: "Views, watch hours, and momentum for the channel.",
  },
  {
    id: "gmail.list_messages",
    name: "Gmail",
    provider: "google",
    slug: "gmail",
    level: "read",
    review: "trusted read",
    requiresConnection: true,
    blurb: "Unread, search, and read messages from the connected mailbox.",
  },
  {
    id: "gmail.create_draft",
    name: "Gmail drafts",
    provider: "google",
    slug: "gmail",
    level: "draft",
    review: "operator confirmation",
    requiresConnection: true,
    blurb: "Write a cancellation or reply draft. Sending stays separate.",
  },
  {
    id: "gmail.send_message",
    name: "Gmail send",
    provider: "google",
    slug: "gmail",
    level: "execute",
    review: "operator confirmation",
    requiresConnection: true,
    blurb: "Send a message. Never available without an approval.",
  },
  {
    id: "social.publish_post",
    name: "Publish post",
    provider: "social",
    slug: "blotato",
    level: "execute",
    review: "operator confirmation",
    requiresConnection: true,
    blurb: "Publish the exact approved post to one platform.",
  },
  {
    id: "comments.reply",
    name: "Reply to comments",
    provider: "youtube",
    slug: "youtube",
    level: "execute",
    review: "operator confirmation",
    requiresConnection: true,
    blurb: "Submit an approved reply to one exact comment id.",
  },
  {
    id: "github.create_pr",
    name: "GitHub",
    provider: "github",
    slug: "github",
    level: "execute",
    review: "operator confirmation",
    requiresConnection: true,
    blurb: "Open a pull request. No adapter exists yet, so Forge refuses it.",
  },
  {
    id: "remote.unknown_tool",
    name: "Unknown remote tool",
    provider: "mcp",
    slug: "mcp",
    level: "execute",
    review: "always reviewed",
    requiresConnection: true,
    blurb:
      "A remote server's tool. It cannot self-declare as a safe read, so every call is reviewed.",
  },
]);

export function declaredTool(id) {
  return DECLARED_TOOLS.find((tool) => tool.id === String(id ?? "")) ?? null;
}

export function declaredTools() {
  return DECLARED_TOOLS.map((tool) => ({ ...tool, available: false }));
}
