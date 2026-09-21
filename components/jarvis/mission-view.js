// Presentation helpers for the ported Mission Bay UI.
//
// These map the domain model onto the reference's visual vocabulary (LED states,
// status words, stage chips). No business logic lives here: status, stages, and
// events already arrive validated from `lib/forge/missions`.

import { describeEvent, eventTone, stagesForKind } from "@/lib/forge/missions";

const STATUS_WORDS = {
  queued: "queued",
  planning: "planning",
  running: "running",
  waiting_approval: "awaiting your word",
  completed: "complete",
  failed: "error",
  cancelled: "cancelled",
};

const LED_STATES = {
  queued: "idle",
  planning: "run",
  running: "run",
  waiting_approval: "wait",
  completed: "done",
  failed: "error",
  cancelled: "idle",
};

export function statusWord(status) {
  return STATUS_WORDS[status] ?? String(status ?? "");
}

export function ledState(status) {
  return LED_STATES[status] ?? "idle";
}

export function stageChips(mission) {
  return stagesForKind(mission.kind).map((stage) => ({
    stage,
    on: (mission.reached ?? []).includes(stage),
    current: mission.currentStage === stage,
  }));
}

export function feedLine(event, mission) {
  return {
    id: event.id,
    at: event.at,
    agentSlug: event.actor?.agent ?? mission.leadSlug,
    text: describeEvent(event, { agentName: null }),
    tone: eventTone(event.type),
  };
}

export function clockOf(iso) {
  if (!iso) return "";
  const match = String(iso).match(/T(\d{2}:\d{2})/);
  return match ? match[1] : "";
}

export function expiryWord(iso) {
  return clockOf(iso);
}
