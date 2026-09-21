// Fixture agent identities, ported from the Jarvis viewer.
//
// Colours come from viewer/missions.js (AGENT_COLOR) and the mission dock feed
// treatment; labels and roles come from missions.py (FLEET_CREW and the per-kind
// worker prompts). These are UI fixtures: no runtime is attached in this phase.

export const AGENT_COLORS = {
  JARVIS: "#34d399",
  SCOUT: "#62dbff",
  FORGE: "#f4a93a",
  SAGE: "#b58cff",
  REAPER: "#f4a93a",
  WARROOM: "#62dbff",
  HERALD: "#f4a93a",
  HATERS: "#ff7d6b",
};

export const AGENTS = [
  {
    id: "jarvis",
    name: "JARVIS",
    role: "Coordination",
    summary: "Owns mission-level coordination and talks to the operator.",
    capability: "mission.coordinate",
    level: "read",
    delegation: true,
  },
  {
    id: "scout",
    name: "SCOUT",
    role: "Reconnaissance",
    summary: "Researches the landscape, facts, numbers, and risks.",
    capability: "research.read",
    level: "read",
    delegation: false,
  },
  {
    id: "forge",
    name: "FORGE",
    role: "Maker",
    summary: "Produces the draft, artifact, or working deliverable.",
    capability: "artifact.draft",
    level: "draft",
    delegation: false,
  },
  {
    id: "sage",
    name: "SAGE",
    role: "Strategy",
    summary: "Stress-tests the work and names the next actions.",
    capability: "artifact.review",
    level: "read",
    delegation: false,
  },
  {
    id: "reaper",
    name: "REAPER",
    role: "Finance",
    summary: "Audits recurring charges, then drafts cancellations for approval.",
    capability: "subscriptions.read",
    level: "read",
    delegation: false,
  },
  {
    id: "warroom",
    name: "WARROOM",
    role: "Analytics",
    summary: "Builds the status and momentum report.",
    capability: "analytics.read",
    level: "read",
    delegation: false,
  },
  {
    id: "herald",
    name: "HERALD",
    role: "Announcements",
    summary: "Drafts per-channel announcements; nothing posts without approval.",
    capability: "social.draft",
    level: "draft",
    delegation: false,
  },
  {
    id: "haters",
    name: "HATERS",
    role: "Community",
    summary: "Reads the comments and drafts replies for approval.",
    capability: "comments.read",
    level: "read",
    delegation: false,
  },
];

// The Fleet, as the reference defines it: SCOUT + FORGE + SAGE, coordinated by
// JARVIS.
export const FLEET = {
  name: "THE FLEET",
  coordinator: "JARVIS",
  members: [
    { name: "SCOUT", role: "recon" },
    { name: "FORGE", role: "maker" },
    { name: "SAGE", role: "critic" },
  ],
};

export function agentByName(name) {
  return AGENTS.find((agent) => agent.name === name) ?? null;
}

export function agentColor(name) {
  return AGENT_COLORS[name] ?? "#7fa89a";
}
