// Fixture missions for the UI.
//
// Phase 3 rule: fixtures reference agent *slugs* and mission kinds only. Names,
// roles, and colours resolve from `lib/forge/agents` at render time, so the
// workforce has exactly one definition.
//
// Shapes follow the reference viewer: a mission has a kind (icon + title), a
// status of running | awaiting_confirm | done | error | cancelled, a lead agent
// slug, an optional team of worker slugs, a chronological event feed (viewer
// emit() shape: ts, agent, kind, label), an optional staged approval, and a
// structured result.
//
// These are UI fixtures. Nothing here executed anything.

import { routeForMissionKind } from "../forge/agents/routing.js";

export const FIXTURE_NOTICE =
  "Fixture data for the UI port. No runtime is connected in this phase.";

// Reference stage model: viewer/missions.js only shows chips for the build kind
// (SCAFFOLD/CODE/TEST/LAUNCH). The same chip component carries the fleet's
// mission phases here so one mission card can show progression either way.
export const BUILD_STAGES = ["SCAFFOLD", "CODE", "TEST", "LAUNCH"];
export const FLEET_STAGES = ["QUEUED", "RECON", "DRAFT", "CRITIQUE", "DONE"];

const t = (minutes) => new Date(Date.UTC(2026, 8, 21, 13, minutes)).toISOString();

const kind = (key) => {
  const route = routeForMissionKind(key);
  return { key, icon: route.icon, name: route.label };
};

export const FIXTURE_MISSIONS = [
  {
    id: "m-fleet-1",
    kind: kind("fleet"),
    title: "THE FLEET — Launch the workshop",
    brief: "Launch the live workshop and tell me what the market looks like.",
    status: "running",
    statusLabel: "running",
    leadSlug: "jarvis",
    stages: FLEET_STAGES,
    reached: ["QUEUED", "RECON"],
    team: [
      { slug: "scout", state: "active" },
      { slug: "forge", state: "queued" },
      { slug: "sage", state: "pending" },
    ],
    events: [
      { ts: t(0), agentSlug: "jarvis", kind: "spawn", label: "Mission accepted" },
      { ts: t(1), agentSlug: "scout", kind: "spawn", label: "Researching the landscape" },
      { ts: t(2), agentSlug: "scout", kind: "tool", label: "searching the web…" },
      { ts: t(4), agentSlug: "scout", kind: "tool", label: "source inspected — competitor pricing" },
      { ts: t(6), agentSlug: "forge", kind: "stage", label: "Draft queued" },
      { ts: t(7), agentSlug: "jarvis", kind: "tool", label: "delegating a sub-task…" },
    ],
    approval: null,
    result: null,
    cancelable: true,
  },
  {
    id: "m-approval-1",
    kind: kind("announce"),
    title: "ANNOUNCE-IT-EVERYWHERE — The workshop is live",
    brief: "Announce the workshop opening across the usual channels.",
    status: "awaiting_confirm",
    statusLabel: "awaiting your word",
    leadSlug: "herald",
    stages: ["DRAFTED", "CONFIRM", "POST"],
    reached: ["DRAFTED", "CONFIRM"],
    team: [],
    events: [
      { ts: t(10), agentSlug: "herald", kind: "spawn", label: "Drafting announcements" },
      { ts: t(12), agentSlug: "herald", kind: "done", label: "5 drafts ready" },
      { ts: t(13), agentSlug: "jarvis", kind: "tool", label: "waiting for confirmation" },
    ],
    approval: {
      id: "ap-announce",
      tool: "social.publish_post",
      capability: "social.publish",
      summary: "Publish the approved post to Twitter",
      args: [
        "platform: twitter",
        "text: The workshop is live — 41 minutes of the exact system I use to ship daily.",
      ],
      expires: "17:20",
      state: "pending",
      fixture: true,
    },
    result: {
      kind: "announce",
      posts: [
        { platform: "twitter", text: "The workshop is live — 41 minutes of the exact system I use to ship daily." },
        { platform: "linkedin", text: "I recorded the whole build. The workshop is open." },
        { platform: "instagram", text: "Built it live. Workshop is live. #buildinpublic" },
      ],
    },
    cancelable: true,
  },
  {
    id: "m-fleet-done",
    kind: kind("fleet"),
    title: "THE FLEET — Pricing page rewrite",
    brief: "Rewrite the pricing page and tell me what I am missing.",
    status: "done",
    statusLabel: "complete",
    leadSlug: "jarvis",
    stages: FLEET_STAGES,
    reached: FLEET_STAGES,
    team: [
      { slug: "scout", state: "done" },
      { slug: "forge", state: "done" },
      { slug: "sage", state: "done" },
    ],
    events: [
      { ts: t(20), agentSlug: "jarvis", kind: "spawn", label: "Mission accepted" },
      { ts: t(21), agentSlug: "scout", kind: "done", label: "Recon memo ready" },
      { ts: t(24), agentSlug: "forge", kind: "done", label: "Draft ready" },
      { ts: t(27), agentSlug: "sage", kind: "done", label: "Critique and next actions ready" },
      { ts: t(28), agentSlug: "jarvis", kind: "done", label: "mission complete" },
    ],
    approval: null,
    result: {
      kind: "fleet",
      summary: "The fleet has landed, sir — the report is ready.",
      sections: {
        scout:
          "Landscape: three direct competitors, two of them priced below us. Hard numbers: median entry price $29/mo; ours $39.\nRisks: the mid tier is where buyers stall.",
        forge:
          "Draft headline: \"Ship daily. Stay small. Charge properly.\"\nDraft body: three tiers, the middle one carries the outcome, the top tier is the anchor.",
        sage:
          "Objections: the price jump reads as a tax, not a tier.\nNext actions:\n1. Rename the middle tier around the outcome.\n2. Add a one-line guarantee above the fold.\n3. Move the comparison table up.\n4. Test $34 for a week.\n5. Cut the free tier to a trial.",
      },
    },
    cancelable: false,
  },
  {
    id: "m-failed-1",
    kind: kind("warroom"),
    title: "CHANNEL WAR ROOM — Weekly momentum",
    brief: "",
    status: "error",
    statusLabel: "error",
    leadSlug: "warroom",
    stages: ["CONNECT", "PULL", "REPORT"],
    reached: ["CONNECT"],
    team: [],
    events: [
      { ts: t(30), agentSlug: "warroom", kind: "spawn", label: "Assembling the war room" },
      { ts: t(31), agentSlug: "warroom", kind: "tool", label: "pulling performance numbers…" },
      { ts: t(32), agentSlug: "warroom", kind: "error", label: "analytics connection is not available" },
      { ts: t(32), agentSlug: "jarvis", kind: "error", label: "mission stopped — nothing was reported" },
    ],
    approval: null,
    result: null,
    error: "The analytics connection is not available, so no report was produced.",
    cancelable: false,
  },
  {
    id: "m-cancelled-1",
    kind: kind("reaper"),
    title: "SUBSCRIPTION REAPER",
    brief: "",
    status: "cancelled",
    statusLabel: "cancelled",
    leadSlug: "reaper",
    stages: ["SCAN", "LEDGER", "CONFIRM"],
    reached: ["SCAN"],
    team: [],
    events: [
      { ts: t(40), agentSlug: "reaper", kind: "spawn", label: "Sweeping recurring charges" },
      { ts: t(41), agentSlug: "jarvis", kind: "error", label: "mission cancelled — no drafts written" },
    ],
    approval: null,
    result: null,
    cancelable: false,
  },
  {
    id: "m-single-1",
    kind: kind("buildapp"),
    title: "BUILD-ME-AN-APP — Standup timer",
    brief: "A tiny standup timer I can keep on the second monitor.",
    status: "running",
    statusLabel: "running",
    leadSlug: "forge",
    stages: BUILD_STAGES,
    reached: ["SCAFFOLD", "CODE"],
    team: [],
    events: [
      { ts: t(50), agentSlug: "forge", kind: "spawn", label: "Opening the workshop" },
      { ts: t(51), agentSlug: "forge", kind: "stage", label: "SCAFFOLD" },
      { ts: t(52), agentSlug: "forge", kind: "stage", label: "CODE — writing app.html" },
    ],
    approval: null,
    result: null,
    cancelable: true,
  },
  {
    id: "m-warroom-done",
    kind: kind("warroom"),
    title: "CHANNEL WAR ROOM — Last 24 hours",
    brief: "",
    status: "done",
    statusLabel: "complete",
    leadSlug: "warroom",
    stages: ["CONNECT", "PULL", "REPORT"],
    reached: ["CONNECT", "PULL", "REPORT"],
    team: [],
    events: [
      { ts: t(60), agentSlug: "warroom", kind: "spawn", label: "Assembling the war room" },
      { ts: t(62), agentSlug: "warroom", kind: "done", label: "report ready" },
    ],
    approval: null,
    result: {
      kind: "warroom",
      headline: "Momentum is up, but the median is moving too.",
      stats: { views_24h: 4820, median_delta: "+40% vs median", subs: 12840, watch_hours: 312 },
      videos: [
        { title: "Build a Jarvis-style HUD", views: 2140, published: "Sep 20" },
        { title: "Why I stopped using dashboards", views: 1580, published: "Sep 18" },
        { title: "Ship daily, stay small", views: 1100, published: "Sep 16" },
      ],
      comments: [
        { author: "marcusbuilds", text: "This is the only channel that shows receipts.", likes: 41 },
        { author: "lena.k", text: "Can you do the approvals flow next?", likes: 18 },
        { author: "grumpydev", text: "Another HUD. Cool.", likes: 3 },
      ],
      read: "Strong day, sir — one video is carrying the week, and the comment section is unusually warm.",
    },
    cancelable: false,
  },
  {
    id: "m-reaper-done",
    kind: kind("reaper"),
    title: "SUBSCRIPTION REAPER — Last 12 months",
    brief: "",
    status: "done",
    statusLabel: "complete",
    leadSlug: "reaper",
    stages: ["SCAN", "LEDGER", "CONFIRM"],
    reached: ["SCAN", "LEDGER", "CONFIRM"],
    team: [],
    events: [
      { ts: t(70), agentSlug: "reaper", kind: "spawn", label: "Sweeping recurring charges" },
      { ts: t(74), agentSlug: "reaper", kind: "done", label: "ledger ready — 6 subscriptions" },
    ],
    approval: null,
    result: {
      kind: "reaper",
      total_monthly: 214.44,
      subs: [
        { name: "Figma", amount_monthly: 15, cadence: "monthly", last_seen: "2026-09-02", note: "design" },
        { name: "Blotato", amount_monthly: 29, cadence: "monthly", last_seen: "2026-09-05", note: "posting" },
        { name: "vidIQ", amount_monthly: 49, cadence: "monthly", last_seen: "2026-09-11", note: "analytics" },
        { name: "Adobe", amount_monthly: 59.99, cadence: "annual", last_seen: "2026-08-19", note: "annual plan, divided by 12" },
        { name: "Notion", amount_monthly: 12, cadence: "monthly", last_seen: "2026-09-14", note: "notes" },
        { name: "Hetzner", amount_monthly: 49.45, cadence: "monthly", last_seen: "2026-09-01", note: "server" },
      ],
      summary: "6 subscriptions, roughly $214.44 a month, sir.",
    },
    cancelable: false,
  },
];

export function fixtureMissions() {
  return FIXTURE_MISSIONS;
}

export function fixtureMission(id) {
  return FIXTURE_MISSIONS.find((mission) => mission.id === id) ?? null;
}

export function fixtureKindKeys() {
  return [...new Set(FIXTURE_MISSIONS.map((mission) => mission.kind.key))];
}
