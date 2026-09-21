// Provider adapters.
//
// An adapter is the only place a provider is actually called, and it runs on the
// server after the gateway has authorized the action. Adapters receive bounded
// arguments and a connection *reference*; the credential itself stays in Forge
// and is never handed to Hermes or returned in a result.
//
// No provider adapter is implemented yet, so every provider tool is declared
// `available: false` in the registry. The internal workspace snapshot adapter
// below is real: it reads through the caller's own permissions.

export function createAdapterRegistry(initial = []) {
  const handlers = new Map();

  const registry = {
    register(adapter) {
      if (!adapter?.toolId || typeof adapter.run !== "function") {
        throw new Error("an adapter needs a toolId and a run function");
      }
      handlers.set(adapter.toolId, adapter);
      return adapter;
    },
    get(toolId) {
      return handlers.get(String(toolId ?? "")) ?? null;
    },
    has(toolId) {
      return handlers.has(String(toolId ?? ""));
    },
    list() {
      return [...handlers.keys()];
    },
  };

  for (const adapter of initial) registry.register(adapter);
  return registry;
}

export function createWorkspaceSnapshotAdapter({ repository }) {
  return {
    toolId: "forge.internal.workspace_snapshot",
    async run({ actor, task }) {
      const snapshot = await repository.getWorkspaceSnapshotForUser({
        userId: actor.userId,
        workspaceId: task.workspaceId,
      });

      if (!snapshot) return null;

      return {
        workspace: {
          name: snapshot.workspace.name,
          slug: snapshot.workspace.slug,
          kind: snapshot.workspace.kind,
        },
        role: snapshot.role,
        agents: snapshot.agentCount,
      };
    },
  };
}
