# Forge v1 architecture

> Forge is a shared, permission-aware AI workforce and organizational brain. Hermes runs the workers. Forge supplies the identities, contexts, knowledge, tools, permissions, workflows, history, and interface that make those workers useful across many people and businesses.

## This is a port, not a new product

Forge is the web/Supabase/Vercel port of the Jarvis control architecture, with Hermes replacing Jarvis's custom Codex worker runtime. The product behaviour is preserved; only the runtime underneath changed.

| Jarvis concept | Forge equivalent |
| --- | --- |
| Mission Bay | Durable mission record (`tasks`) plus the Mission Bay surface at `/` |
| Mission kinds (FLEET, BUILD-ME-AN-APP, REAPER, WAR ROOM, ANNOUNCE, HATERS) | `lib/forge/missions/catalog.js` |
| Jarvis workers running Codex | Hermes runs; Forge agents are the catalog (`JARVIS`, `SCOUT`, `FORGE`, `SAGE`, `REAPER`, `WARROOM`, `HERALD`, `HATERS`) |
| The Fleet (SCOUT + FORGE + SAGE) | `fleets` + `fleet_members`, child runs under the mission's primary run |
| Mission events (`spawn`, `stage`, `tool`, `done`, `error`) | `run_events`, including `worker.spawned`, `worker.stage`, `agent.delegated`, `tool.*`, `approval.*` |
| Confirm cards / `APPROVALS.stage` | `approvals` with a hashed, immutable staged payload |
| Tool Armory (`tools.py` registry) | `lib/forge/runtime/tools/registry.js` |
| Connected tools / OAuth state | `connections` + the tool gateway, which resolves credentials server-side |
| Tool receipts | `action_receipts`, with `accepted` vs `confirmed` |
| Mission cancel | `runController.cancelMission` calling the Hermes stop endpoint |
| `exec_deny` / draft-safe workers | Capability ceilings per agent plus the gateway's action-level check |
| Desktop-only surfaces (HOLO, EYES, Hue, phone calls, local vault) | Not ported. The ideas that matter — explicit consent, controlled tools, operator visibility, receipts — are. |

Mission kinds, the seeded agents, and the fleet are ported from the reference build's own definitions; the agent instructions in `005_forge_fleet.sql` are its prompts with desktop-only directives removed.

## Request path

```
User / Korben
    |
    v
Forge Mission (tasks)                      durable, Forge-owned state
    |
    v
Context builder                            capabilities, connections, policy snapshot
    |
    v
Run controller                             lib/forge/runtime/run-controller.js
    |
    v
Hermes parent agent  ---------------->  Hermes subagents (delegation)
    |                                          |
    | tool request                             | run metadata
    v                                          v
Forge tool gateway  <---- tool registry (capability, action level, approval)
    |
    v
Permission + approval layer                staged action, immutable arguments
    |
    v
Connected service                          provider adapter; Forge holds the credential
    |
    v
Receipt + event stream + audit log
    |
    v
Forge UI                                   read-only views, mission cancel
```

Authorization and context scoping happen in Forge before any protected data or credential reaches Hermes.

## Boundary

### Hermes owns

- model execution and agent loop
- planning and tool calling
- subagent delegation
- retries and agent lifecycle
- browser, terminal, file, web, and other Hermes toolsets
- run lifecycle and progress events
- stop/cancel at the runtime layer
- Hermes-native dangerous-action approvals
- scheduled/background Hermes jobs when Forge elects to use them

Hermes is an external runtime behind a stable adapter (`lib/hermes/client.js`, wrapped for the runtime in `lib/forge/runtime/index.js`). Forge does not import Hermes internals.

### Forge owns

- authenticated people, organizations, workspaces, memberships
- capability grants and the READ / DRAFT / EXECUTE policy ceiling
- the shared agent catalog and its delegation permission
- connections and connection permissions
- **durable missions** (`tasks`), runs, events, approvals, receipts, and audit
- the tool registry and the tool gateway
- the Forge UI and future Korben-facing APIs

Hermes is never the source of truth for users, workspaces, permissions, connections, business approvals, audit, or durable task state.

## Durable missions

`tasks` is the mission record: it survives independently of any page request. A mission carries the workspace, the requesting user, the primary agent, the requested action level, the goal/input, the current status, the current step, created/started/completed timestamps, cancellation state, and the resolved policy snapshot.

Lifecycle:

```
queued -> planning -> running -> waiting -> waiting_approval -> completed
                          |            \-> failed
                          \-> cancelled
```

The status vocabulary lives in `lib/forge/runtime/policy.js` (`MISSION_STATUSES`) and is enforced by the runtime rather than by a database check constraint, so an existing row with an unexpected value can never break a migration.

Related runs, approvals, and events hang off the mission. Nothing is deleted on cancel.

## Run controller

`lib/forge/runtime/run-controller.js` is the only place that submits work to Hermes. It:

1. validates the requesting user, workspace, and agent through the context builder
2. resolves user and agent capabilities and takes the lower ceiling
3. resolves the caller's authorized connections
4. creates the durable mission and run records with the policy snapshot
5. submits through the existing Hermes adapter
6. stores `hermes_run_id` and mirrors status
7. stops runs on cancel
8. registers delegated subagent runs
9. appends events for every step

React components never call Hermes, and the Hermes API key never leaves server code.

## Event stream

`run_events` is the durable, human-readable account of what happened to a mission. Event types include `task.queued`, `task.cancel_requested`, `run.started`, `agent.delegated`, `tool.requested`, `tool.denied`, `tool.executed`, `tool.failed`, `approval.requested`, `approval.resolved`, `run.cancelled`, `run.cancel_failed`, `run.failed`, `run.completed`.

Summaries and metadata are sanitized before insert (`lib/forge/runtime/sanitize.js`): sensitive key names are masked, credential-shaped values are masked even under innocuous keys, and everything is truncated. Prompts, credentials, and raw tool payloads are never stored, and the UI timeline reads this stream instead of inventing status text.

## Parent and subagent runs

Hermes performs delegation; Forge records the resulting structure. `agent_runs.parent_run_id` and `agent_runs.kind` (`primary` | `subagent`) express the tree, and `actor_label` carries the safe agent/subagent label Hermes reports. The run controller exposes `registerSubagentRun`, which writes the child run and an `agent.delegated` event. Runs and Missions views render the hierarchy. Forge does not implement a second delegation engine.

## Tool registry

`lib/forge/runtime/tools/registry.js` is the single server-side definition of every capability Forge can perform. Each entry declares:

- `id`, `title`, `description`, `provider`
- `capability` required (for example `email.read`)
- `actionLevel`: read / draft / execute
- `requiresApproval` (forced true for every execute tool)
- `requiresConnection`
- strict `inputSchema` (unknown arguments are rejected)
- `available` — false until a provider adapter exists
- `exposeToHermes` — whether the declaration may be offered to the runtime

`registry.forHermes({ capabilities })` produces the runtime-facing surface: declarations only, filtered to capabilities the agent actually holds, and never handlers or credentials.

## Tool gateway

`lib/forge/runtime/tools/gateway.js` is the boundary where Hermes asks Forge to act and Forge decides. The order is the architecture, and each step is a hard gate:

```
task/run -> workspace membership -> tool exists -> argument validation
         -> agent capability -> member capability -> action-level ceiling
         -> connection permission -> approval (if required)
         -> provider adapter -> receipt + event + audit -> bounded result
```

Denials are written as `tool.denied` events (refusals stay auditable) and never produce a receipt, because nothing executed. Results returned to the runtime are bounded.

Two boundaries are deliberately not invented yet:

- **Provider adapters**: no external integration is implemented. Every provider tool is declared `available: false` and the gateway refuses it rather than faking a result. The one implemented adapter is the internal, read-only `forge.internal.workspace_snapshot`, which resolves through the caller's own permissions.
- **Inbound Hermes channel**: the gateway is called in-process today. A Hermes-to-Forge tool request over HTTP needs an inbound credential that does not exist yet, so no public endpoint is exposed. Adding one unauthenticated would be worse than waiting.

## Approval lifecycle

`approvals` is a staged-action boundary, managed by `lib/forge/runtime/approvals.js`:

1. **Stage** — arguments are validated against the tool schema, sanitized, hashed (SHA-256 over canonical JSON), and stored with the requester, capability, tool, action level, connection, and expiry. The mission moves to `waiting_approval` and `approval.requested` is recorded.
2. **Decide** — an authorized member approves or denies. The decision records the payload hash it verified. Expired approvals are marked `expired` rather than silently accepted.
3. **Claim** — execution refuses when the approval is not approved, when it was already resumed, or when the staged hash no longer matches the decided hash. It returns the stored snapshot.

The approved action is therefore the same action a human reviewed; the model cannot alter arguments afterwards, because execution runs from the stored snapshot rather than from later output.

The decision UI is not wired yet; the service layer already implements the staged, decided, and resume paths.

## Execution receipts

`action_receipts` is the proof of what Forge actually did: mission, run, approval, tool, capability, action level, connection, a bounded input summary, a bounded result summary, success/failure, and an external reference when the provider returns one. Receipts are written only on execution or explicit adapter failure, never for denials, and never contain credentials.

## Cancel and stop

`runController.cancelMission` authorizes the caller against the mission, marks the cancellation intent, and calls the Hermes stop endpoint when the mission has a Hermes run id. On success the run and mission are marked `cancelled` with `cancelled_at`, and `run.cancelled` is recorded. When Hermes refuses to stop, the mission is **not** reported as cancelled: `run.cancel_failed` is recorded, the current step says the stop call failed, and the caller receives an error. History is preserved in every path.

## Workspace context builder

`lib/forge/runtime/context-builder.js` assembles the bounded context: workspace identity, the selected agent's instructions and delegation permission, the capability ceiling both sides agree on, references to the connections the caller may use, and the runtime tool surface. It returns only what the authenticated user and mission are allowed to see; credentials are never part of the object, and connection references carry id, provider, label, and status only.

The resolved snapshot is stored on the mission (`tasks.policy`) so the ceiling that applied at submission time is durable.

## Security boundaries

- **Reads** use the cookie-scoped Supabase client, so RLS decides visibility. RLS is never bypassed for dashboard reads.
- **Writes** use the service-role client on the server, because mission state, the event stream, staged approvals, and receipts are an authoritative record that a browser session must not be able to forge or edit. `run_events` and `action_receipts` have no insert/update/delete policies for `authenticated` and are not granted to `anon`.
- **Identity** always comes from the server session; `requireForgeContext()` redirects when there is no session, because Next renders a layout and its page concurrently.
- **Payloads** are redacted in the data layer before becoming component props: server components serialize props into the RSC payload, so jsonb values are summarized server-side rather than filtered in markup.
- **jsonb writes** (events, receipts, staged approvals) pass through the same sanitizer, so credentials cannot be persisted even when a caller sends them.

## Deployment

Forge Web and API run in the existing Next.js application on Vercel. Hermes runs as a persistent service outside Vercel; its authenticated API is called only from Forge server code.

Required server-only environment variables:

- `HERMES_API_URL`, `HERMES_API_KEY` — Hermes adapter
- `SUPABASE_SERVICE_ROLE_KEY` — durable mission writes from the runtime

## First agent: Inbox Triage

Shared agent slug: `inbox-triage`. Initial capabilities: `email.read`, `email.draft`. Not granted initially: `email.send`. The same agent definition is used for every user; Forge supplies only the current user's authorized connection ids and workspace context.

## Vertical-slice acceptance test

User A and User B each connect a different mailbox. Both invoke the same `inbox-triage` agent. Forge must prove that each request can resolve only the connections visible to the authenticated user. Isolation is tested at the database policy layer before any message body is sent to Hermes; `tests/tool-gateway.test.js` and `tests/context-builder.test.js` cover the same rule at the service layer.

## Korben later

Korben will call Forge APIs as another authenticated client. Korben should not call Hermes directly for organizational work. Forge remains the permission, context, history, and audit boundary.
