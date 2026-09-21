// Workspace context builder.
//
// Assembles the bounded context for a mission: workspace identity, the selected
// agent's instructions, the capability ceiling that both the agent and the
// member agree on, and references to the connections the caller may use.
//
// It returns only what the authenticated user and the task are allowed to see.
// Credentials are never part of this object: connections are referenced by id,
// provider, and label, and the tool surface is declarations only.

import { RUNTIME_ERROR_CODES, RuntimeError } from "./errors.js";
import { evaluateCapabilityAccess } from "./policy.js";

export function createContextBuilder({ repository, registry }) {
  return {
    async build({
      actorUserId,
      workspaceId,
      agentId,
      capability,
      requestedActionLevel,
      connectionIds = [],
    }) {
      if (!actorUserId) {
        throw new RuntimeError(
          RUNTIME_ERROR_CODES.unauthorized,
          "A signed-in user is required."
        );
      }
      if (!workspaceId || !agentId || !capability) {
        throw new RuntimeError(
          RUNTIME_ERROR_CODES.invalidRequest,
          "A workspace, agent, and capability are required."
        );
      }

      const membership = await repository.getMembershipForUser({
        workspaceId,
        userId: actorUserId,
      });
      if (!membership) {
        throw new RuntimeError(
          RUNTIME_ERROR_CODES.unauthorized,
          "You do not have access to this workspace."
        );
      }

      const agent = await repository.getAgentById(agentId);
      if (!agent || !agent.isActive) {
        throw new RuntimeError(
          RUNTIME_ERROR_CODES.notFound,
          "That agent is not available."
        );
      }

      const [agentCapabilities, membershipCapabilities] = await Promise.all([
        repository.getAgentCapabilities(agent.id),
        repository.getMembershipCapabilities(membership.id),
      ]);

      const access = evaluateCapabilityAccess({
        capability,
        requestedActionLevel,
        agentCapabilities,
        membershipCapabilities,
      });

      if (!access.allowed) {
        throw new RuntimeError(
          RUNTIME_ERROR_CODES.capabilityDenied,
          access.message,
          { reason: access.reason }
        );
      }

      // Only capabilities both sides hold can be offered to the runtime.
      const memberCapabilityNames = new Set(
        membershipCapabilities.map((entry) => entry.capability)
      );
      const permittedCapabilities = [
        ...new Set(
          agentCapabilities
            .map((entry) => entry.capability)
            .filter((name) => memberCapabilityNames.has(name))
        ),
      ].sort();

      const connections = await repository.listConnectionsForUser({
        workspaceId,
        userId: actorUserId,
        connectionIds,
      });

      const activeConnections = connections.filter(
        (connection) => String(connection.status).toLowerCase() === "active"
      );

      return {
        allowed: true,
        workspace: membership.workspace,
        organization: membership.organization ?? null,
        membership: { id: membership.id, role: membership.role },
        agent: {
          id: agent.id,
          name: agent.name,
          slug: agent.slug,
          instructions: agent.instructions,
          delegationEnabled: Boolean(agent.delegationEnabled),
        },
        access,
        connections,
        permittedCapabilities,
        // Durable policy snapshot: what was authorized when this mission was
        // submitted, stored on the task and used as the ceiling for tool calls.
        policySnapshot: {
          capability,
          requested_action_level: access.effectiveActionLevel,
          effective_action_level: access.effectiveActionLevel,
          agent_action_level: access.agentActionLevel,
          member_action_level: access.memberActionLevel,
          capabilities: permittedCapabilities,
          connection_ids: connections.map((connection) => connection.id),
          delegation_enabled: Boolean(agent.delegationEnabled),
        },
        // Bounded context for the runtime. No credentials, no secret_ref, and
        // connection references only.
        hermesContext: {
          workspace: {
            name: membership.workspace?.name ?? null,
            slug: membership.workspace?.slug ?? null,
            kind: membership.workspace?.kind ?? null,
          },
          agent: {
            name: agent.name,
            instructions: agent.instructions,
            delegation: { enabled: Boolean(agent.delegationEnabled) },
          },
          access: {
            action_level_ceiling: access.effectiveActionLevel,
            capabilities: permittedCapabilities,
          },
          connections: activeConnections.map((connection) => ({
            id: connection.id,
            provider: connection.provider,
            label: connection.label,
            status: connection.status,
          })),
          tools: registry.forHermes({ capabilities: permittedCapabilities }),
          policy: {
            requires_approval_for_execute: true,
            credentials_shared_with_runtime: false,
          },
        },
      };
    },
  };
}
