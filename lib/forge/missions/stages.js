// Stage sequences per mission kind.
//
// Stage is not status: status is the mission's life, stage is the work currently
// happening. Every kind gets its own sequence — one generic list would lose the
// meaning the reference build puts in its chips.
//
// Where the reference already has labels they are used verbatim: the build kind
// shows SCAFFOLD → CODE → TEST → LAUNCH (viewer/missions.js STAGES). Where the
// reference only names the work in prose (missions.py prompts), the phases below
// follow that prose, so reaper reads inspect → ledger → confirm → execute and the
// announce/haters workflows read draft → confirm → execute because publication is
// gated.

export const STAGE_SETS = Object.freeze({
  general: Object.freeze(["queued", "plan", "run", "done"]),
  fleet: Object.freeze(["queued", "recon", "draft", "critique", "assemble", "done"]),
  buildapp: Object.freeze(["SCAFFOLD", "CODE", "TEST", "LAUNCH"]),
  reaper: Object.freeze(["queued", "inspect", "ledger", "confirm", "execute", "done"]),
  warroom: Object.freeze(["queued", "connect", "pull", "report", "done"]),
  announce: Object.freeze(["queued", "draft", "confirm", "execute", "done"]),
  haters: Object.freeze(["queued", "read", "draft", "confirm", "execute", "done"]),
});

export const STAGE_LABELS = Object.freeze({
  queued: "queued",
  plan: "planning",
  planning: "planning",
  run: "running",
  recon: "recon",
  draft: "draft",
  critique: "critique",
  assemble: "assemble",
  inspect: "inspect",
  ledger: "ledger",
  confirm: "confirm",
  execute: "execute",
  connect: "connect",
  pull: "pull",
  report: "report",
  read: "read",
  done: "done",
  SCAFFOLD: "scaffold",
  CODE: "code",
  TEST: "test",
  LAUNCH: "launch",
});

export function stagesForKind(kind) {
  return [...(STAGE_SETS[String(kind ?? "")] ?? STAGE_SETS.general)];
}

export function stageLabel(stage) {
  return STAGE_LABELS[stage] ?? String(stage ?? "").toLowerCase();
}

export function isKnownStage(kind, stage) {
  return stagesForKind(kind).includes(stage);
}

// Progression is monotonic within a mission: stages are reached in order, and a
// mission can never be reported as being in a stage it has not reached.
export function reachedStages(kind, currentStage) {
  const stages = stagesForKind(kind);
  const index = stages.indexOf(currentStage);
  return index < 0 ? [] : stages.slice(0, index + 1);
}

export function canAdvanceStage(kind, from, to) {
  const stages = stagesForKind(kind);
  const fromIndex = stages.indexOf(from);
  const toIndex = stages.indexOf(to);
  if (toIndex < 0) return false;
  if (fromIndex < 0) return toIndex === 0;
  return toIndex === fromIndex + 1;
}

export function advanceStage(mission, to) {
  if (!canAdvanceStage(mission.kind, mission.currentStage, to)) {
    return { ok: false, reason: "invalid_stage", mission };
  }
  return {
    ok: true,
    mission: {
      ...mission,
      currentStage: to,
      reached: reachedStages(mission.kind, to),
    },
  };
}
