// Mission routing metadata.
//
// Declarative only: which agent or team a mission kind defaults to. There is no
// AI routing here — this is the metadata a runtime will consult later, and what
// the UI uses to explain who will do the work.

export const MISSION_ROUTES = Object.freeze([
  Object.freeze({
    kind: "general",
    label: "General mission",
    icon: "🎯",
    agent: "jarvis",
    fleet: null,
    capability: "mission.coordinate",
    needsBrief: true,
    intent: "Open-ended coordination: JARVIS decides what the work needs.",
  }),
  Object.freeze({
    kind: "fleet",
    label: "THE FLEET",
    icon: "⚔️",
    agent: "jarvis",
    fleet: "the-fleet",
    capability: "mission.coordinate",
    needsBrief: true,
    intent:
      "Coordinated research, making, and critique, assembled into one result.",
  }),
  Object.freeze({
    kind: "buildapp",
    label: "BUILD-ME-AN-APP",
    icon: "🛠️",
    agent: "forge",
    fleet: null,
    capability: "artifact.draft",
    needsBrief: true,
    intent: "One maker produces the deliverable.",
  }),
  Object.freeze({
    kind: "reaper",
    label: "SUBSCRIPTION REAPER",
    icon: "💰",
    agent: "reaper",
    fleet: null,
    capability: "subscriptions.read",
    needsBrief: false,
    intent:
      "Read-only recurring-charge audit, then per-service cancellation drafts after confirmation.",
  }),
  Object.freeze({
    kind: "warroom",
    label: "CHANNEL WAR ROOM",
    icon: "📊",
    agent: "warroom",
    fleet: null,
    capability: "analytics.read",
    needsBrief: false,
    intent: "Read-only status and momentum report.",
  }),
  Object.freeze({
    kind: "announce",
    label: "ANNOUNCE-IT-EVERYWHERE",
    icon: "📣",
    agent: "herald",
    fleet: null,
    capability: "social.draft",
    needsBrief: true,
    intent: "Per-channel drafts; publication only after explicit approval.",
  }),
  Object.freeze({
    kind: "haters",
    label: "READ-THE-HATERS",
    icon: "🔥",
    agent: "haters",
    fleet: null,
    capability: "comments.read",
    needsBrief: false,
    intent: "Comment analysis and drafted replies; submission only on approval.",
  }),
]);

// Individual work routes JARVIS can compose into a custom team.
export const WORK_ROUTES = Object.freeze([
  Object.freeze({ work: "coordination", agent: "jarvis", capability: "mission.coordinate" }),
  Object.freeze({ work: "research", agent: "scout", capability: "research.read" }),
  Object.freeze({ work: "build", agent: "forge", capability: "artifact.draft" }),
  Object.freeze({ work: "draft", agent: "forge", capability: "artifact.draft" }),
  Object.freeze({ work: "review", agent: "sage", capability: "artifact.review" }),
  Object.freeze({ work: "critique", agent: "sage", capability: "artifact.review" }),
  Object.freeze({ work: "subscription_audit", agent: "reaper", capability: "subscriptions.read" }),
  Object.freeze({ work: "analytics", agent: "warroom", capability: "analytics.read" }),
  Object.freeze({ work: "content_draft", agent: "herald", capability: "social.draft" }),
  Object.freeze({ work: "comment_replies", agent: "haters", capability: "comments.read" }),
]);

export function routeForMissionKind(kind) {
  return MISSION_ROUTES.find((route) => route.kind === String(kind ?? "")) ?? null;
}

export function routeForWork(work) {
  return WORK_ROUTES.find((route) => route.work === String(work ?? "")) ?? null;
}

export function missionKinds() {
  return MISSION_ROUTES.map((route) => route.kind);
}
