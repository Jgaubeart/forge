// Fleet composition.
//
// A pure helper that turns worker contributions into the canonical Fleet result.
// No models, no orchestration: JARVIS's model-driven assembly comes later through
// the runtime, and this defines the structure it must fill.
//
// Rules that matter: a worker with no output stays visibly missing, a worker that
// failed stays visibly failed, nothing is fabricated, and no worker is silently
// substituted for another.

import { FLEET, agentBySlug } from "../agents/index.js";
import { validateFleetResult } from "./results.js";

export const FLEET_WORKER_SECTIONS = Object.freeze({
  scout: "scout",
  forge: "forge",
  sage: "sage",
});

export function fleetWorkerSlugs() {
  return FLEET.members.map((member) => member.slug);
}

export function composeFleetResult({
  brief = "",
  contributions = {},
  failures = {},
  summary = null,
  assembledSummary = null,
} = {}) {
  const sections = {};
  const missing = [];
  const failed = [];

  for (const member of FLEET.members) {
    const section = FLEET_WORKER_SECTIONS[member.slug];
    const failure = failures?.[member.slug];
    const output = contributions?.[member.slug];

    if (failure) {
      failed.push({
        worker: member.slug,
        reason: typeof failure === "string" ? failure : (failure.reason ?? "worker failed"),
      });
      continue;
    }

    if (typeof output === "string" && output.trim()) {
      sections[section] = output.trim();
    } else {
      missing.push(member.slug);
    }
  }

  const result = {
    kind: "fleet",
    summary: summary ?? null,
    sections,
    missing,
    failed,
    assembled: assembledSummary ? { summary: assembledSummary } : null,
  };

  const validation = validateFleetResult(result);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, result: null };
  }

  return {
    ok: true,
    errors: [],
    // The brief is carried alongside so the operator-facing card can show what
    // was asked even when part of the team came back empty.
    result: { ...validation.value, brief: String(brief ?? "").slice(0, 400) },
    coverage: {
      complete: missing.length === 0 && failed.length === 0,
      missing,
      failed: failed.map((entry) => entry.worker),
    },
  };
}

export function fleetCoverage(result) {
  const missing = result?.missing ?? [];
  const failed = result?.failed?.map((entry) => entry.worker) ?? [];
  return {
    complete: missing.length === 0 && failed.length === 0,
    missing,
    failed,
    workerNames: [...missing, ...failed].map(
      (slug) => agentBySlug(slug)?.name ?? String(slug).toUpperCase()
    ),
  };
}
