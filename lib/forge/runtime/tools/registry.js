// Forge tool registry.
//
// Every capability Forge can perform is declared here once: which capability it
// requires, the action level it runs at, whether a human must approve it, its
// argument schema, and whether it may be exposed to Hermes. Agents do not invent
// tool behavior; the registry is the single server-side source of truth.
//
// `available: false` means the declaration exists but no provider adapter is
// implemented. The gateway refuses those tools and never fabricates a result.

import { ACTION_LEVEL_RANK, normalizeActionLevel } from "../policy.js";

const FIELD_TYPES = ["string", "number", "boolean", "object", "array"];

export function defineTool(definition = {}) {
  const {
    id,
    title,
    description,
    provider,
    capability,
    actionLevel,
    requiresApproval = false,
    requiresConnection = false,
    available = false,
    exposeToHermes = true,
    inputSchema = {},
  } = definition;

  if (!id || !/^[a-z0-9_.]+$/.test(id)) {
    throw new Error(`tool id must be lowercase dot-separated: ${id}`);
  }
  if (!title || !description) {
    throw new Error(`tool ${id} needs a title and description`);
  }
  if (!capability) {
    throw new Error(`tool ${id} must declare the capability it requires`);
  }

  const level = normalizeActionLevel(actionLevel);
  if (!level) {
    throw new Error(`tool ${id} has an invalid action level: ${actionLevel}`);
  }

  const schema = {};
  for (const [field, spec] of Object.entries(inputSchema)) {
    if (!spec || !FIELD_TYPES.includes(spec.type)) {
      throw new Error(`tool ${id} field ${field} needs a supported type`);
    }
    schema[field] = Object.freeze({
      type: spec.type,
      required: Boolean(spec.required),
      description: spec.description ?? "",
      maxLength: spec.maxLength ?? 4000,
      maxItems: spec.maxItems ?? 50,
      enum: spec.enum ? Object.freeze([...spec.enum]) : null,
    });
  }

  return Object.freeze({
    id,
    title,
    description,
    provider: provider ?? id.split(".")[0],
    capability,
    actionLevel: level,
    requiresApproval: Boolean(requiresApproval) || level === "execute",
    requiresConnection: Boolean(requiresConnection),
    available: Boolean(available),
    exposeToHermes: Boolean(exposeToHermes),
    inputSchema: Object.freeze(schema),
  });
}

// Strict validation: unknown fields are rejected so a caller cannot smuggle
// extra arguments past the reviewed schema.
export function validateToolArguments(tool, args = {}) {
  const errors = [];
  const value = {};

  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    return { ok: false, errors: ["arguments must be an object"], value: {} };
  }

  const declared = Object.keys(tool.inputSchema);
  for (const key of Object.keys(args)) {
    if (!declared.includes(key)) errors.push(`unexpected argument: ${key}`);
  }

  for (const [field, spec] of Object.entries(tool.inputSchema)) {
    const raw = args[field];

    if (raw === undefined || raw === null) {
      if (spec.required) errors.push(`${field} is required`);
      continue;
    }

    if (spec.type === "string") {
      if (typeof raw !== "string") {
        errors.push(`${field} must be a string`);
        continue;
      }
      if (raw.length > spec.maxLength) {
        errors.push(`${field} exceeds ${spec.maxLength} characters`);
        continue;
      }
    } else if (spec.type === "number") {
      if (typeof raw !== "number" || Number.isNaN(raw)) {
        errors.push(`${field} must be a number`);
        continue;
      }
    } else if (spec.type === "boolean") {
      if (typeof raw !== "boolean") {
        errors.push(`${field} must be a boolean`);
        continue;
      }
    } else if (spec.type === "array") {
      if (!Array.isArray(raw)) {
        errors.push(`${field} must be an array`);
        continue;
      }
      if (raw.length > spec.maxItems) {
        errors.push(`${field} exceeds ${spec.maxItems} items`);
        continue;
      }
    } else if (spec.type === "object") {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        errors.push(`${field} must be an object`);
        continue;
      }
    }

    if (spec.enum && !spec.enum.includes(raw)) {
      errors.push(`${field} must be one of: ${spec.enum.join(", ")}`);
      continue;
    }

    value[field] = raw;
  }

  return { ok: errors.length === 0, errors, value };
}

export const DEFAULT_TOOLS = Object.freeze([
  defineTool({
    id: "forge.internal.workspace_snapshot",
    title: "Workspace snapshot",
    description:
      "Return the caller's workspace identity, role, and agent count. Internal, read-only, and resolved with the caller's own permissions.",
    provider: "forge",
    capability: "workspace.read",
    actionLevel: "read",
    available: true,
    exposeToHermes: true,
    inputSchema: {},
  }),
  defineTool({
    id: "gmail.list_messages",
    title: "List messages",
    description: "List message metadata from a connected mailbox.",
    provider: "gmail",
    capability: "email.read",
    actionLevel: "read",
    requiresConnection: true,
    available: false,
    inputSchema: {
      query: { type: "string", required: true, maxLength: 400 },
      limit: { type: "number" },
    },
  }),
  defineTool({
    id: "gmail.get_thread",
    title: "Get thread",
    description: "Read a single mailbox thread.",
    provider: "gmail",
    capability: "email.read",
    actionLevel: "read",
    requiresConnection: true,
    available: false,
    inputSchema: { thread_id: { type: "string", required: true, maxLength: 200 } },
  }),
  defineTool({
    id: "gmail.create_draft",
    title: "Create draft",
    description: "Stage a reply draft in the connected mailbox. Sending is a separate action.",
    provider: "gmail",
    capability: "email.draft",
    actionLevel: "draft",
    requiresConnection: true,
    available: false,
    inputSchema: {
      thread_id: { type: "string", required: true, maxLength: 200 },
      body: { type: "string", required: true, maxLength: 4000 },
    },
  }),
  defineTool({
    id: "gmail.send_message",
    title: "Send message",
    description: "Send a message from the connected mailbox. Requires human approval.",
    provider: "gmail",
    capability: "email.send",
    actionLevel: "execute",
    requiresApproval: true,
    requiresConnection: true,
    available: false,
    inputSchema: {
      thread_id: { type: "string", required: true, maxLength: 200 },
      body: { type: "string", required: true, maxLength: 4000 },
    },
  }),
  defineTool({
    id: "github.read_file",
    title: "Read file",
    description: "Read a file from a connected repository.",
    provider: "github",
    capability: "repository.read",
    actionLevel: "read",
    requiresConnection: true,
    available: false,
    inputSchema: {
      path: { type: "string", required: true, maxLength: 400 },
    },
  }),
  defineTool({
    id: "github.create_pr",
    title: "Create pull request",
    description: "Open a pull request in a connected repository. Requires human approval.",
    provider: "github",
    capability: "repository.write",
    actionLevel: "execute",
    requiresApproval: true,
    requiresConnection: true,
    available: false,
    inputSchema: {
      title: { type: "string", required: true, maxLength: 200 },
      branch: { type: "string", required: true, maxLength: 200 },
    },
  }),
]);

export function createToolRegistry(tools = DEFAULT_TOOLS) {
  const byId = new Map();

  for (const tool of tools) {
    if (byId.has(tool.id)) throw new Error(`duplicate tool id: ${tool.id}`);
    byId.set(tool.id, tool);
  }

  return {
    get(id) {
      return byId.get(String(id ?? "")) ?? null;
    },

    list({ provider = null, capability = null, availableOnly = false } = {}) {
      return [...byId.values()].filter((tool) => {
        if (provider && tool.provider !== provider) return false;
        if (capability && tool.capability !== capability) return false;
        if (availableOnly && !tool.available) return false;
        return true;
      });
    },

    // The safe surface handed to Hermes: declarations only, never handlers or
    // credentials, and only for capabilities the agent actually holds.
    forHermes({ capabilities = [] } = {}) {
      return [...byId.values()]
        .filter((tool) => tool.available && tool.exposeToHermes)
        .filter((tool) => capabilities.includes(tool.capability))
        .map((tool) => ({
          id: tool.id,
          title: tool.title,
          description: tool.description,
          capability: tool.capability,
          action_level: tool.actionLevel,
          requires_approval: tool.requiresApproval,
          requires_connection: tool.requiresConnection,
          input_schema: Object.fromEntries(
            Object.entries(tool.inputSchema).map(([field, spec]) => [
              field,
              {
                type: spec.type,
                required: spec.required,
                max_length: spec.maxLength,
              },
            ])
          ),
        }));
    },

    // Used by the gateway to compare a tool's level against a ceiling.
    rankOf(tool) {
      return ACTION_LEVEL_RANK[tool.actionLevel];
    },
  };
}

export const toolRegistry = createToolRegistry();
