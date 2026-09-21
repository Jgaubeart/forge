// Fixture missions, generated through the canonical mission model.
//
// The fixture layer supplies values only: kinds, briefs, worker output, and
// timestamps. Status, stages, event vocabulary, approvals, cancellation, and
// result shapes all come from `lib/forge/missions`, so a fixture can never
// invent a shape the domain does not understand.
//
// Nothing here executed anything. Approval decisions are local state only.

import { agentBySlug } from "../forge/agents/index.js";
import {
  MISSION_EVENT,
  appendMissionEvent,
  createApproval,
  createMission,
  createMissionEvent,
  assignTeam,
  cancelMission,
  completeMission,
  failMission,
  requestApproval,
  resolveApproval,
  setMissionResult,
  setMissionStage,
  startMission,
} from "../forge/missions/index.js";

export const FIXTURE_NOTICE =
  "Fixture data for the UI port. No runtime is connected in this phase.";

export const BUILD_STAGES = ["SCAFFOLD", "CODE", "TEST", "LAUNCH"];
export const FLEET_STAGES = ["queued", "recon", "draft", "critique", "assemble", "done"];

const at = (minutes) => new Date(Date.UTC(2026, 8, 21, 13, minutes)).toISOString();

// Appends one canonical event; `label` is the operator-facing text the reference
// feed shows.
function pushEvent(mission, { ts, agentSlug, type, label, metadata = {} }) {
  const created = createMissionEvent({
    type,
    at: ts,
    actorAgent: agentSlug,
    summary: label,
    metadata,
  });
  if (!created.ok) throw new Error(`fixture event rejected: ${type}`);
  return appendMissionEvent(mission, created.event);
}

function build({
  id,
  kind,
  brief = "",
  createdAt,
  stages = [],
  team = [],
  events = [],
  approval = null,
  resolution = null,
  result = null,
  failure = null,
  cancel = null,
  resultSummary = null,
}) {
  let mission = createMission({ id, kind, brief, at: createdAt }).mission;

  if (team.length > 0) {
    mission = assignTeam(mission, team, { at: createdAt });
  }

  mission = startMission(mission, { at: at(0) }).mission;

  for (const stage of stages) {
    const advanced = setMissionStage(mission, stage, { at: at(0) });
    if (advanced.ok) mission = advanced.mission;
  }

  for (const event of events) {
    mission = pushEvent(mission, event);
  }

  if (approval) {
    const created = createApproval({ ...approval.approval, now: approval.approval.requestedAt });
    if (!created.ok) throw new Error(`fixture approval rejected: ${id}`);
    mission = requestApproval(mission, { approval: created.approval, at: approval.requestedAt })
      .mission;
  }

  if (resolution) {
    mission = resolveApproval(mission, resolution.decision, {
      at: resolution.at,
      by: resolution.by ?? null,
    }).mission;
  }

  if (result) {
    // A mission paused for approval can already show its staged output, but it
    // is not complete: only the completed path closes it.
    mission = (
      approval
        ? setMissionResult(mission, { result, at: at(14) })
        : completeMission(mission, { result, summary: resultSummary, at: at(30) })
    ).mission;
  }

  if (failure) {
    mission = failMission(mission, { error: failure, at: at(32) }).mission;
  }

  if (cancel) {
    mission = cancelMission(mission, {
      at: at(41),
      by: cancel.by ?? null,
      reason: cancel.reason ?? null,
    }).mission;
  }

  return mission;
}

export const FIXTURE_MISSIONS = [
  build({
    id: "m-fleet-1",
    kind: "fleet",
    brief: "Launch the live workshop and tell me what the market looks like.",
    createdAt: at(0),
    team: ["scout", "forge", "sage"],
    stages: ["recon"],
    events: [
      { ts: at(1), agentSlug: "scout", type: MISSION_EVENT.agentStarted, label: "Researching the landscape", metadata: { work: "recon" } },
      { ts: at(2), agentSlug: "scout", type: MISSION_EVENT.toolRequested, label: "searching the web…", metadata: { tool: "research.web_search" } },
      { ts: at(4), agentSlug: "scout", type: MISSION_EVENT.toolCompleted, label: "source inspected — competitor pricing", metadata: { tool: "research.web_search" } },
      { ts: at(6), agentSlug: "forge", type: MISSION_EVENT.agentAssigned, label: "Draft queued", metadata: { role: "maker" } },
      { ts: at(7), agentSlug: "jarvis", type: MISSION_EVENT.toolRequested, label: "delegating a sub-task…", metadata: { tool: "mission.delegate" } },
    ],
  }),
  build({
    id: "m-approval-1",
    kind: "announce",
    brief: "Announce the workshop opening across the usual channels.",
    createdAt: at(10),
    stages: ["draft"],
    events: [
      { ts: at(11), agentSlug: "herald", type: MISSION_EVENT.agentStarted, label: "Drafting announcements", metadata: { work: "drafting" } },
      { ts: at(12), agentSlug: "herald", type: MISSION_EVENT.agentCompleted, label: "5 drafts ready", metadata: { work: "drafting" } },
    ],
    approval: {
      requestedAt: at(13),
      approval: {
        id: "ap-announce",
        tool: "social.publish_post",
        capability: "social.publish",
        destination: "twitter",
        requestedBy: "herald",
        expiresAt: at(253),
        args: {
          platform: "twitter",
          text: "The workshop is live — 41 minutes of the exact system I use to ship daily.",
        },
      },
    },
    result: {
      posts: [
        { platform: "twitter", text: "The workshop is live — 41 minutes of the exact system I use to ship daily." },
        { platform: "linkedin", text: "I recorded the whole build. The workshop is open." },
        { platform: "instagram", text: "Built it live. Workshop is live. #buildinpublic" },
      ],
    },
  }),
  build({
    id: "m-fleet-done",
    kind: "fleet",
    brief: "Rewrite the pricing page and tell me what I am missing.",
    createdAt: at(20),
    team: ["scout", "forge", "sage"],
    stages: ["recon", "draft", "critique", "assemble", "done"],
    events: [
      { ts: at(21), agentSlug: "scout", type: MISSION_EVENT.agentCompleted, label: "Recon memo ready", metadata: { work: "recon" } },
      { ts: at(24), agentSlug: "forge", type: MISSION_EVENT.agentCompleted, label: "Draft ready", metadata: { work: "drafting" } },
      { ts: at(27), agentSlug: "sage", type: MISSION_EVENT.agentCompleted, label: "Critique and next actions ready", metadata: { work: "critique" } },
    ],
    resultSummary: "The fleet has landed, sir — the report is ready.",
    result: {
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
  }),
  build({
    id: "m-failed-1",
    kind: "warroom",
    createdAt: at(30),
    stages: ["connect"],
    events: [
      { ts: at(31), agentSlug: "warroom", type: MISSION_EVENT.toolRequested, label: "pulling performance numbers…", metadata: { tool: "analytics.channel_report" } },
      { ts: at(32), agentSlug: "warroom", type: MISSION_EVENT.missionFailed, label: "analytics connection is not available" },
    ],
    failure: "The analytics connection is not available, so no report was produced.",
  }),
  build({
    id: "m-cancelled-1",
    kind: "reaper",
    createdAt: at(40),
    stages: ["inspect"],
    events: [
      { ts: at(40), agentSlug: "reaper", type: MISSION_EVENT.agentStarted, label: "Sweeping recurring charges", metadata: { work: "audit" } },
    ],
    cancel: { reason: "operator stopped the audit" },
  }),
  build({
    id: "m-single-1",
    kind: "buildapp",
    brief: "A tiny standup timer I can keep on the second monitor.",
    createdAt: at(50),
    stages: ["SCAFFOLD", "CODE"],
    events: [
      { ts: at(51), agentSlug: "forge", type: MISSION_EVENT.missionStageChanged, label: "SCAFFOLD", metadata: { stage: "SCAFFOLD" } },
      { ts: at(52), agentSlug: "forge", type: MISSION_EVENT.missionStageChanged, label: "CODE — writing app.html", metadata: { stage: "CODE" } },
    ],
  }),
  build({
    id: "m-warroom-done",
    kind: "warroom",
    createdAt: at(60),
    stages: ["connect", "pull", "report", "done"],
    events: [
      { ts: at(62), agentSlug: "warroom", type: MISSION_EVENT.agentCompleted, label: "report ready", metadata: { work: "report" } },
    ],
    resultSummary: "Strong day, sir — one video is carrying the week.",
    result: {
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
  }),
  build({
    id: "m-reaper-done",
    kind: "reaper",
    createdAt: at(70),
    stages: ["inspect", "ledger", "confirm", "execute", "done"],
    events: [
      { ts: at(74), agentSlug: "reaper", type: MISSION_EVENT.agentCompleted, label: "ledger ready — 6 subscriptions", metadata: { work: "audit" } },
    ],
    resultSummary: "6 subscriptions, roughly $214.44 a month, sir.",
    result: {
      total_monthly: 214.44,
      subs: [
        { name: "Figma", amount_monthly: 15, cadence: "monthly", last_seen: "2026-09-02", note: "design" },
        { name: "Blotato", amount_monthly: 29, cadence: "monthly", last_seen: "2026-09-05", note: "posting" },
        { name: "vidIQ", amount_monthly: 49, cadence: "monthly", last_seen: "2026-09-11", note: "analytics" },
        { name: "Adobe", amount_monthly: 59.99, cadence: "annual", last_seen: "2026-08-19", note: "annual plan, divided by 12" },
        { name: "Notion", amount_monthly: 12, cadence: "monthly", last_seen: "2026-09-14", note: "notes" },
        { name: "Hetzner", amount_monthly: 49.45, cadence: "monthly", last_seen: "2026-09-01", note: "server" },
      ],
    },
  }),
  build({
    id: "m-haters-done",
    kind: "haters",
    createdAt: at(80),
    stages: ["read", "draft", "confirm", "done"],
    events: [
      { ts: at(82), agentSlug: "haters", type: MISSION_EVENT.agentCompleted, label: "8 comments read, replies drafted", metadata: { work: "read" } },
    ],
    resultSummary: "Two warm ones and a heckler, sir.",
    result: {
      items: [
        {
          author: "marcusbuilds",
          comment: "Where is the receipts view?",
          comment_id: "UgxK1",
          video_id: "vid_204",
          likes: 12,
          reply: "Top right of every mission — it shows exactly what ran and what was only drafted.",
        },
        {
          author: "grumpydev",
          comment: "Another HUD. Cool.",
          comment_id: "UgxK2",
          video_id: "vid_204",
          likes: 3,
          reply: "Fair. The HUD is the least interesting part — the approvals are where it earns its keep.",
        },
      ],
      read: "One genuine question and one shrug, sir — both worth a reply.",
    },
  }),
];

export function fixtureMissions() {
  return FIXTURE_MISSIONS;
}

export function fixtureMission(id) {
  return FIXTURE_MISSIONS.find((mission) => mission.id === id) ?? null;
}

export function fixtureKindKeys() {
  return [...new Set(FIXTURE_MISSIONS.map((mission) => mission.kind))];
}
