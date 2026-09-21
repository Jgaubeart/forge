import { AGENTS, agentBySlug } from "../agents/index.js";

// Durable agent state.
//
// Identity and behaviour stay canonical in code (`lib/forge/agents`). The
// database supplies only the durable bits a workspace cares about — that the row
// exists, whether it is active, and whether delegation is allowed — and a remote
// row can never silently override a built-in agent's identity.
export async function listDurableAgents(userClient) {
  const { data, error } = await userClient
    .from("agents")
    .select("id, slug, name, is_active, delegation_enabled, department_id")
    .order("name", { ascending: true });

  if (error) {
    console.error(`[forge:persistence] agent read failed: ${error.message}`);
    return [];
  }

  return (data ?? []).map((row) => {
    const catalog = agentBySlug(row.slug);
    return {
      id: row.id,
      slug: row.slug,
      // The catalog wins on identity; the row only reports durable state.
      name: catalog?.name ?? row.name,
      role: catalog?.role ?? null,
      isBuiltIn: Boolean(catalog),
      isActive: Boolean(row.is_active),
      delegationAllowed: Boolean(row.delegation_enabled),
    };
  });
}

export function catalogAgentSlugs() {
  return AGENTS.map((agent) => agent.slug);
}
