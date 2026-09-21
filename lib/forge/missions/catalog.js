// The Forge mission catalog.
//
// Ported from the reference build's mission kinds. Each kind declares the icon
// and title the operator sees, whether it needs a brief, which agent leads it,
// which capability the lead must hold, and — for gated kinds — what the operator
// is confirming. Hermes performs the work; Forge owns this catalog, the durable
// mission record, and the confirmation discipline.

export const MISSION_KINDS = Object.freeze({
  general: {
    key: "general",
    icon: "🎯",
    name: "GENERAL MISSION",
    ack: "Mission accepted.",
    needsBrief: true,
    leadAgentSlug: "jarvis",
    capability: "mission.coordinate",
    description: "Hand a brief to the coordinating agent and let it assemble the work.",
  },
  fleet: {
    key: "fleet",
    icon: "⚔️",
    name: "THE FLEET",
    ack: "Deploying the fleet.",
    needsBrief: true,
    leadAgentSlug: "jarvis",
    fleetSlug: "the-fleet",
    capability: "mission.coordinate",
    team: ["scout", "forge", "sage"],
    description:
      "Recon, draft, and critique from a coordinated three-agent team, assembled into one result.",
  },
  buildapp: {
    key: "buildapp",
    icon: "🛠️",
    name: "BUILD-ME-AN-APP",
    ack: "Opening the workshop.",
    needsBrief: true,
    leadAgentSlug: "forge",
    capability: "artifact.draft",
    stages: ["SCAFFOLD", "CODE", "TEST", "LAUNCH"],
    description: "A maker agent produces one self-contained deliverable for the brief.",
  },
  reaper: {
    key: "reaper",
    icon: "💰",
    name: "SUBSCRIPTION REAPER",
    ack: "Auditing subscriptions. Read-only until you confirm.",
    needsBrief: false,
    leadAgentSlug: "reaper",
    capability: "subscriptions.read",
    confirmKind: "kill",
    confirmCapability: "email.draft",
    description:
      "A read-only sweep for recurring charges, then gated cancellation drafts you confirm one by one.",
  },
  warroom: {
    key: "warroom",
    icon: "📊",
    name: "CHANNEL WAR ROOM",
    ack: "Assembling the war room.",
    needsBrief: false,
    leadAgentSlug: "warroom",
    capability: "analytics.read",
    description: "A read-only status and momentum report.",
  },
  announce: {
    key: "announce",
    icon: "📣",
    name: "ANNOUNCE-IT-EVERYWHERE",
    ack: "Drafting announcements. Nothing posts without your word.",
    needsBrief: true,
    leadAgentSlug: "herald",
    capability: "social.draft",
    confirmKind: "posts",
    confirmCapability: "social.publish",
    platforms: ["twitter", "linkedin", "instagram", "threads", "facebook"],
    description: "Per-channel drafts, then publishing you approve explicitly.",
  },
  haters: {
    key: "haters",
    icon: "🔥",
    name: "READ-THE-HATERS",
    ack: "Reading the comments. No reply is sent without your approval.",
    needsBrief: false,
    leadAgentSlug: "haters",
    capability: "comments.read",
    confirmKind: "replies",
    confirmCapability: "comments.reply",
    description: "Comment analysis with drafted replies, submitted only when you approve them.",
  },
});

export const MISSION_KIND_KEYS = Object.freeze(Object.keys(MISSION_KINDS));

export function getMissionKind(key) {
  return MISSION_KINDS[String(key ?? "").trim().toLowerCase()] ?? null;
}

export function listMissionKinds() {
  return MISSION_KIND_KEYS.map((key) => MISSION_KINDS[key]);
}

// Ported from the reference build: KIND — truncated brief.
export function missionTitle(kind, brief) {
  const meta = getMissionKind(kind) ?? MISSION_KINDS.general;
  const text = String(brief ?? "").trim();
  if (!text) return meta.name;
  const short = text.length > 48 ? `${text.slice(0, 48)}…` : text;
  return `${meta.name} — ${short}`;
}

export function missionNeedsBrief(kind) {
  return Boolean(getMissionKind(kind)?.needsBrief);
}
