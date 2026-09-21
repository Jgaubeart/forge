// Canonical mission catalog.
//
// Ported from the reference build's KINDS map (missions.py) and the mission cards
// in viewer/missions.js: same families, same icons, same titles, same
// brief requirements. Routing metadata comes from the Phase 3 agent catalog, so
// the lead agent and team are never restated here.

import { FLEET_SLUG, routeForMissionKind } from "../agents/index.js";
import { stagesForKind } from "./stages.js";

// resultType values match the validators in results.js; rendererKey is the key
// the UI switches on, which is also the result type for every kind today.
const KINDS = [
  {
    kind: "general",
    title: "GENERAL MISSION",
    icon: "🎯",
    description:
      "Hand a brief to the coordinating agent and let it decide what the work needs.",
    requiresConfirmation: false,
    resultType: "build",
    brief: { required: true, maxLength: 400 },
    cancellationAllowed: true,
  },
  {
    kind: "fleet",
    title: "THE FLEET",
    icon: "⚔️",
    description:
      "Recon, draft, and critique from a coordinated three-agent team, assembled into one result.",
    requiresConfirmation: false,
    resultType: "fleet",
    brief: { required: true, maxLength: 400 },
    cancellationAllowed: true,
  },
  {
    kind: "buildapp",
    title: "BUILD-ME-AN-APP",
    icon: "🛠️",
    description: "A maker agent produces one self-contained deliverable for the brief.",
    requiresConfirmation: false,
    resultType: "build",
    brief: { required: true, maxLength: 400 },
    cancellationAllowed: true,
  },
  {
    kind: "reaper",
    title: "SUBSCRIPTION REAPER",
    icon: "💰",
    description:
      "A read-only sweep for recurring charges, then gated cancellation drafts you confirm one by one.",
    requiresConfirmation: true,
    resultType: "reaper",
    brief: { required: false, maxLength: 400 },
    cancellationAllowed: true,
  },
  {
    kind: "warroom",
    title: "CHANNEL WAR ROOM",
    icon: "📊",
    description: "A read-only status and momentum report.",
    requiresConfirmation: false,
    resultType: "warroom",
    brief: { required: false, maxLength: 400 },
    cancellationAllowed: true,
  },
  {
    kind: "announce",
    title: "ANNOUNCE-IT-EVERYWHERE",
    icon: "📣",
    description: "Per-channel drafts, then publishing you approve explicitly.",
    requiresConfirmation: true,
    resultType: "announce",
    brief: { required: true, maxLength: 400 },
    cancellationAllowed: true,
  },
  {
    kind: "haters",
    title: "READ-THE-HATERS",
    icon: "🔥",
    description:
      "Comment analysis with drafted replies, submitted only when you approve them.",
    requiresConfirmation: true,
    resultType: "haters",
    brief: { required: false, maxLength: 400 },
    cancellationAllowed: true,
  },
];

// Route metadata is resolved from the Phase 3 catalog rather than duplicated.
export const MISSION_KINDS = Object.freeze(
  KINDS.map((definition) => {
    const route = routeForMissionKind(definition.kind);
    return Object.freeze({
      ...definition,
      stages: Object.freeze(stagesForKind(definition.kind)),
      leadAgent: route.agent,
      fleet: route.fleet ?? null,
      capability: route.capability,
      intent: route.intent,
      rendererKey: definition.resultType,
      // A kind that gates publication always needs confirmation; the flag above
      // records whether confirmation is part of the reference workflow itself.
      approvalBoundary: Boolean(route.fleet && route.fleet === FLEET_SLUG)
        ? "assembled"
        : "staged_action",
    });
  })
);

export const MISSION_KIND_KEYS = Object.freeze(MISSION_KINDS.map((kind) => kind.kind));

export function missionKind(kind) {
  return MISSION_KINDS.find((definition) => definition.kind === String(kind ?? "")) ?? null;
}

export function isKnownMissionKind(kind) {
  return missionKind(kind) !== null;
}

export function missionTitle(kind, brief = "") {
  const definition = missionKind(kind);
  if (!definition) return String(brief ?? "").trim() || "Mission";
  const text = String(brief ?? "").trim();
  if (!text) return definition.title;
  const short = text.length > 48 ? `${text.slice(0, 48)}…` : text;
  return `${definition.title} — ${short}`;
}

export function missionKindsForFleet() {
  return MISSION_KINDS.filter((kind) => kind.fleet === FLEET_SLUG);
}
