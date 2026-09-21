// Context boundary.
//
// Forge decides what an agent is allowed to receive *before* the runtime sees
// the request. This module builds the safe context object and refuses to hand
// over anything that looks like a credential — the check is mechanical, so it
// cannot be forgotten by a caller.

import { RUNTIME_ERROR_CODES, runtimeError } from "./errors.js";

// Anything matching this must never appear in a runtime context.
const FORBIDDEN_KEY =
  /(api[_-]?key|secret|token|authorization|password|credential|service[_-]?role|private[_-]?key)/i;

// Values that look like credentials even under an innocent key name.
const CREDENTIAL_VALUE =
  /\b(bearer\s+[A-Za-z0-9._-]{8,}|eyJ[A-Za-z0-9._-]{20,}|sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{8,})/i;

export const CONTEXT_EXCLUSIONS = Object.freeze([
  "credentials, API keys, and bearer tokens",
  "the Supabase service-role key",
  "OAuth access or refresh tokens",
  "provider secrets and connection credentials",
  "workspace data the operator's mission does not need",
]);

export function buildRuntimeContext({
  operatorBrief,
  agentInstructions = null,
  capabilityGrants = [],
  connectionRefs = [],
  workspace = null,
  policy = {},
  delegation = null,
}) {
  const context = {
    // What the operator asked for.
    operatorBrief: String(operatorBrief ?? "").slice(0, 400),
    // What this agent is.
    agentInstructions: agentInstructions ? String(agentInstructions).slice(0, 8000) : null,
    // What the agent may do, as capability names and ceilings only.
    capabilities: capabilityGrants.map((grant) => ({
      capability: String(grant.capability),
      maxActionLevel: String(grant.maxActionLevel ?? grant.max_action_level ?? "read"),
    })),
    // Connections are references: id, provider, label. Never a credential.
    connections: connectionRefs.map((connection) => ({
      id: connection.id,
      provider: connection.provider ?? null,
      label: connection.label ?? null,
    })),
    // Identity the agent may know about.
    workspace: workspace
      ? { name: workspace.name ?? null, slug: workspace.slug ?? null, kind: workspace.kind ?? null }
      : null,
    // Forge's policy for this mission, decided before dispatch.
    policy: {
      approvalRequiredForExecute: true,
      allowedActionLevel: policy.allowedActionLevel ?? "read",
      workspaceScoped: true,
    },
    delegation: delegation ? { enabled: Boolean(delegation.enabled) } : { enabled: false },
  };

  assertSafeRuntimeContext(context);
  return context;
}

// Throws when a credential-shaped key or value appears anywhere in the context.
export function assertSafeRuntimeContext(context) {
  const offenders = [];

  const walk = (value, path) => {
    if (value === null || value === undefined) return;
    if (typeof value === "string") {
      if (CREDENTIAL_VALUE.test(value)) offenders.push(path);
      return;
    }
    if (typeof value !== "object") return;

    for (const [key, nested] of Object.entries(value)) {
      if (FORBIDDEN_KEY.test(key)) offenders.push(`${path}.${key}`);
      walk(nested, `${path}.${key}`);
    }
  };

  walk(context, "context");

  if (offenders.length > 0) {
    throw runtimeError(RUNTIME_ERROR_CODES.invalidRequest, {
      message: `The runtime context contains something it must not: ${[...new Set(offenders)].join(", ")}.`,
    });
  }

  return context;
}
