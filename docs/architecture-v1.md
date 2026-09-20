# Forge v1 architecture

> Forge is a shared, permission-aware AI workforce and organizational brain. Hermes runs the workers. Forge supplies the identities, contexts, knowledge, tools, permissions, workflows, history, and interface that make those workers useful across many people and businesses.

## Boundary

### Hermes owns

- model execution and agent loop
- planning and tool calling
- subagent delegation
- retries and agent lifecycle
- browser, terminal, file, web, and other Hermes toolsets
- run lifecycle and progress events
- stop/cancel support
- Hermes-native dangerous-action approvals
- scheduled/background Hermes jobs when Forge elects to use them

Hermes is treated as an external runtime behind a stable adapter. Forge does not import Hermes internals.

### Forge owns

- authenticated people
- organizations and workspaces
- memberships
- capability grants
- shared agent catalog
- user/workspace connections
- connection visibility
- tasks and agent-run history
- product-level READ / DRAFT / EXECUTE policy
- business approvals and audit logs
- organization knowledge and memory boundaries
- the Forge UI
- future Korben-facing APIs

## Deployment

Forge Web and API run in the existing Next.js application on Vercel.

Hermes runs as a persistent service outside Vercel. Its authenticated API is called only from Forge server code. Browser clients never receive the Hermes API key.

Required server-only environment variables when Hermes is deployed:

- HERMES_API_URL
- HERMES_API_KEY

## Request path

1. User authenticates with Supabase Auth.
2. Forge resolves the user's workspace membership.
3. Forge resolves the shared agent definition.
4. Forge intersects:
   - user capabilities
   - agent capabilities
   - connection permissions
   - requested action level
5. Forge retrieves only authorized context and connections.
6. Forge creates a task and agent_run record.
7. Forge submits the bounded request to Hermes through the adapter.
8. Forge stores the Hermes run id and mirrors status/events.
9. External EXECUTE actions remain blocked unless the capability and approval policy allow them.

Authorization happens before protected context is sent to Hermes.

## First agent: Inbox Triage

Shared agent slug: `inbox-triage`

Initial capabilities:

- email.read
- email.draft

Not granted initially:

- email.send

The same agent definition is used for every user. Forge supplies only the current user's authorized connection ids and workspace context.

## Vertical-slice acceptance test

User A and User B each connect a different mailbox. Both invoke the same `inbox-triage` agent. Forge must prove that each request can resolve only the connections visible to the authenticated user.

The first implementation should test isolation at the database policy layer before any email body is sent to Hermes.

## Korben later

Korben will call Forge APIs as another authenticated client. Korben should not call Hermes directly for organizational work. Forge remains the permission, context, history, and audit boundary.
