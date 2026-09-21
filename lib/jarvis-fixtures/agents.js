// Fixture-era aliases over the real catalog.
//
// Phase 2 hardcoded agent metadata here. Phase 3 made `lib/forge/agents` the
// canonical definition, so these exports now derive from it. No agent name,
// role, or colour is duplicated anywhere in the UI layer.

import {
  AGENTS as CATALOG_AGENTS,
  FLEET as CATALOG_FLEET,
  agentBySlug,
  agentColor,
} from "../forge/agents/index.js";

export const AGENTS = CATALOG_AGENTS;

export const AGENT_COLORS = Object.fromEntries(
  CATALOG_AGENTS.map((agent) => [agent.name, agent.color])
);

export const FLEET = {
  slug: CATALOG_FLEET.slug,
  name: CATALOG_FLEET.name,
  description: CATALOG_FLEET.description,
  leadSlug: CATALOG_FLEET.lead,
  coordinator: agentBySlug("jarvis")?.name ?? "JARVIS",
  members: CATALOG_FLEET.members.map((member) => ({
    slug: member.slug,
    name: agentBySlugName(member.slug),
    role: member.role,
    order: member.order,
  })),
};

function agentBySlugName(slug) {
  return CATALOG_AGENTS.find((agent) => agent.slug === slug)?.name ?? slug.toUpperCase();
}

export { agentBySlug, agentColor };

export function agentByName(name) {
  return CATALOG_AGENTS.find((agent) => agent.name === name) ?? null;
}
