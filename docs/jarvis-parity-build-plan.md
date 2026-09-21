# Jarvis parity build plan

## The architectural rule

> **Jarvis is the product reference implementation.**
> **Forge is the web/control-plane implementation.**
> **Hermes is the execution runtime.**

> **Do not redesign Jarvis while porting it.**

The browser build follows the Jarvis viewer for structure, interaction, and visual
language. Forge supplies identity, workspaces, durable state, permissions, and
audit. Hermes runs the work. When the reference and Forge disagree, the reference
wins and the difference is documented rather than smoothed over.

## Phase 1 — clean branch, frozen reference state (this phase)

- `main` is the starting point. No PR #4 implementation is copied, cherry-picked,
  rebased, or merged in.
- PR #4 (`codex/forge-shell-dashboard`) stays open and unmerged as historical
  reference work. It is not modified.
- This branch is created directly from `main` and contains exactly `main` plus
  this document.
- No UI, Supabase, Hermes, or deployment changes.

Reference state at the time of this commit:

| Item | Value |
| --- | --- |
| `main` | `8a7a0f0` (merge of PR #3) |
| PR #4 branch | `codex/forge-shell-dashboard` at `dbf14ad`, open, unmerged |
| PR #4 commits not in `main` | `dbe555e`, `613fd96`, `dbf14ad` |
| New branch | `feature/jarvis-parity-port`, created from `main` |

## Phase 2 — faithful Jarvis viewer/UI port, fixture data

Port the viewer's structure and styling first, against fixtures: panel hierarchy,
the dock-style mission cards, status LEDs, stage chips, the live event feed,
agent colour identity, inline confirm controls, result rendering, the Tool
Armory tile grid, density, and the navigation shape. No backend work in this
phase.

## Phase 3 — Jarvis agent catalog and Fleet (complete)

The workforce is now a real code model in `lib/forge/agents`, and the Phase 2 UI
reads from it instead of carrying its own copies.

**Agent catalog** — `lib/forge/agents/catalog.js` is the canonical definition of
the eight reference agents: JARVIS (coordination), SCOUT (recon), FORGE (maker),
SAGE (critic), REAPER (subscription audit), WARROOM (analytics), HERALD
(announcements), HATERS (community). Each entry carries a stable slug, name,
role, department, glyph, reference colour, summary, real system instructions
ported from the package prompts, action ceiling (read / draft / execute),
delegation permission, the mission kinds it serves, required and optional
capabilities, and an honest capability state (`defined`, `fixture-only`,
`not-connected`, `future`) with a plain-language note. Prompts keep the
reference's tone and boundaries — read-only where the reference is read-only,
no fake progress, no claims without a receipt, credentials never requested — and
carry no desktop-only detail.

**Fleet definition** — `lib/forge/agents/fleet.js` defines `the-fleet`: display
name, description, lead (JARVIS), ordered members with roles (SCOUT recon,
FORGE maker, SAGE critic), what each produces, and a behaviour contract
(JARVIS decomposes, workers produce, JARVIS assembles; a subset is allowed; the
canonical order stands; workers stay idle until work is actually delegated).

**Mission routing metadata** — `lib/forge/agents/routing.js` is declarative
only: general → JARVIS, fleet → The Fleet, buildapp → FORGE, reaper → REAPER,
warroom → WARROOM, announce → HERALD, haters → HATERS, plus individual work
routes (research → SCOUT, build/draft → FORGE, review/critique → SAGE) that
JARVIS can compose later. There is no AI routing and no execution.

The UI consumes all of this: agent names, colours, roles, fleet membership, and
mission kinds come from the catalog, and the fixture layer now references agent
slugs rather than restating identity. The `/agents` surface renders departments,
capability state, fleet membership, and routing, with full system instructions
available only behind a disclosure.

## Phase 4 — mission semantics and structured results (complete)

The mission model lives in `lib/forge/missions` and is runtime-neutral: no
database, no network, no Hermes. Fixtures and the UI are generated from it, so a
mission can only exist in a shape the domain understands.

**Mission kinds** — `kinds.js` holds the reference families with their icons and
titles (THE FLEET ⚔️, BUILD-ME-AN-APP 🛠️, SUBSCRIPTION REAPER 💰, CHANNEL WAR ROOM
📊, ANNOUNCE-IT-EVERYWHERE 📣, READ-THE-HATERS 🔥) plus a general coordination
kind. Each declares its description, lead agent and fleet (resolved from the
Phase 3 catalog, never restated), expected stages, whether confirmation is part of
the workflow, brief requirements, cancellation, and its result type.

**Lifecycle** — `lifecycle.js` defines statuses `queued → planning → running →
waiting_approval → completed | failed | cancelled` with explicit transitions.
`canTransitionMission`, `transitionMission`, `isTerminalMission`, and
`isActiveMission` refuse nonsense such as `completed → running`; the reference's
own names (`awaiting_confirm`, `done`, `error`) still resolve.

**Status vs stage** — status is the mission's life; stage is the work happening
now, and every kind has its own sequence. The build kind keeps the reference
chips (SCAFFOLD, CODE, TEST, LAUNCH); scout-derived work uses recon → draft →
critique → assemble; gated kinds read inspect → ledger → confirm → execute. Stages
advance one step at a time and cannot be skipped.

**Events** — `events.js` defines the canonical vocabulary (mission.created,
mission.stage_changed, agent.assigned/started/completed, tool.requested/completed,
approval.requested/approved/denied/expired, result.updated, mission.completed/
failed/cancelled), maps the reference's spawn/stage/tool/done/error onto it,
sanitises metadata to primitives, and guarantees unique ids per mission.
`describeEvent` and `toolLabel` produce deterministic operator language — no
model is involved.

**Approvals** — an approval is a lifecycle boundary, not a card: the mission
parks in `waiting_approval` with a staged action whose arguments are frozen and
fingerprinted. States are pending, approved, denied, expired, consumed; an
approval is single-use, cannot be approved after expiry, and cannot be consumed
unless approved. Deciding resumes the mission; nothing external runs.

**Cancellation** — allowed only while a mission is active, terminal afterwards,
and it preserves every prior event and any partial result. Nothing is deleted.

**Result contracts** — `results.js` validates one contract per kind: fleet
worker sections, build artifact, reaper ledger (with derived monthly total),
war-room stats, per-platform drafts, and comment reply sets. Announce and haters
results can never claim more than `draft` without a provider receipt. Malformed
results fail validation and render a safe fallback instead of crashing.
`fleet-composition.js` assembles worker output with missing and failed workers
left visible — nothing is fabricated or silently substituted.

**Honest language** — `language.js` encodes the receipt rule: "Draft prepared"
and "Awaiting confirmation" are always available, while "Sent", "Published", or
"Cancelled" require a receipt id, and `assertHonestClaim` refuses the claim
otherwise.

The ported UI renders these validated domain objects — History and Mission Bay
read the canonical event stream, and the result renderers contain no inference.

## Phase 5 — Supabase persistence and first-workspace onboarding (complete)

**Phase 5 is complete.** Live verification passed against the real Forge project,
all verification data and accounts were cleaned up, the test suite and build are
green, and the only remaining Supabase warning is leaked-password protection
being disabled — an Auth dashboard setting, not an application or schema blocker
for this phase (recorded below as an open project-setting item).

Status: **migrations 004 and 005 are applied to the real Forge project**
(`forge`, ref `orxprwiqjtnpgrrheylr`). Its migration history reads `forge_core`,
`harden_forge_rls`, `forge_fleet`, `forge_workspace_and_mission_persistence`,
`revoke_handle_new_user_execute`. Live counts after applying: organisations 0,
workspaces 0, workspace memberships 0, tasks 0, run_events 0, approvals 0,
agents 9, fleets 1, fleet_members 3 — a clean, empty Forge with the workforce
seeded and no test data. Nothing in the unrelated `portal` project was touched.

**Final live verification pass: complete and passing.**

Run against the real Forge project (`orxprwiqjtnpgrrheylr`) with the dev server
running outside the sandbox (a sandboxed server cannot reach Supabase, which is
what made earlier attempts look like auth failures):

- **Auth:** signing in through the app works; a first-run user lands on the
  one-step onboarding.
- **Onboarding:** completes and lands in Mission Bay. The organisation, its
  membership, the workspace, its membership, and the two read-level capability
  grants are all created, and `created_by` / `user_id` are the session's user.
- **Mission:** dispatching from the command bar records one mission (`kind`
  warroom, `status` queued, `stage` queued, `reached_stages ["queued"]`,
  `requested_by` = the signed-in user) and it survives a refresh, with one card
  rendered afterwards.
- **History/events:** the persisted `mission.created` event appears with an
  operator-readable label and the actor set.
- **Forged events:** a signed-in browser inserting into `run_events` is refused
  (401); event writes only happen through the trusted server path.
- **Approvals:** staging a pending approval succeeds, reading it back reflects the
  domain model, a first consumption marks it consumed, and a second consumption
  matches zero rows — single-use holds. No external action is executed.
- **Cross-workspace RLS:** user B reads nothing of user A's workspace, tasks,
  events, approvals, or receipts, and an attempted mutation of A's task leaves it
  unchanged.
- **Agents/Fleet:** 9 agents with unique slugs; The Fleet still has JARVIS as lead
  with SCOUT, FORGE, and SAGE as its three members.
- **Visual:** authenticated Mission Bay at 1440×1000, 1280×800, and 414×900 — no
  horizontal overflow, no console errors.

Two defects were found and fixed live. The database one — recursive RLS on
`organization_memberships`, which made every `organizations` insert fail — was
fixed by the `fix_onboarding_rls_recursion` migration applied from outside this
environment. The application one was the insert/read ordering: an `INSERT …
RETURNING` must also satisfy the table's SELECT policy, so onboarding now inserts
the organisation and workspace plainly, then reads them back after the matching
membership exists (the organisation read-back uses the server's trusted client,
because the creator cannot see their own organisation until the membership row
lands).

Verification data was removed afterwards: all rows created for the run (tasks,
run_events, approvals, workspaces, memberships, organisations) and the 10
temporary auth users, returning the database to organisations 0, workspaces 0,
tasks 0, run_events 0, approvals 0 with 9 agents, 1 fleet, and 3 fleet members.

What *was* checked against Forge with the publishable key only (read-only):
`/auth/v1/settings` answers 200 and reports `disable_signup: false` with
`mailer_autoconfirm: false`, so a new account needs a confirmation click before it
can sign in; an anonymous read of `agents`, `workspaces`, `tasks`, `approvals`, and
`membership_capabilities` returns `[]` (RLS filtering), while `run_events`,
`action_receipts`, `fleets`, `fleet_members`, and `connections` return
`401 permission denied` — the migration's explicit `revoke … from anon` is in
effect; and an anonymous insert into `run_events` is refused. That confirms the
applied policies and grants behave as intended for unauthenticated callers, and
that no test rows were created (`agents` still reads empty to anon, which is the
R​LS boundary, not a count).

Two things are needed to finish live verification, and neither can come from this
environment: a **confirmed test account** (or two, for the cross-workspace check)
— accounts created through signup would need an email confirmation click, since
`mailer_autoconfirm` is false — and **`SUPABASE_SERVICE_ROLE_KEY`**, which the
deployed app needs regardless, because mission events and approvals are written
only through the trusted server path by design. With those two, the sequence
below can run end to end.
Verified in code and tests instead: the persistence boundary maps domain objects
to rows in both directions with results validated on read; mission events can only
be written through the trusted path (a browser session cannot forge `run_events`,
and approvals have no insert or update policy at all); approvals are single-use;
cross-workspace reads return nothing for a non-member; the agent catalog stays
canonical over durable rows; and onboarding derives ownership from the session
rather than the submitted form. Phase 5 is therefore **not marked complete**.

It completes when the app runs against Forge with `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` set, and this
sequence passes live: sign in; land on the one-step onboarding; create a
workspace; confirm the organisation, both memberships, and the two read-level
capability grants; dispatch a mission; refresh and confirm it persists with its
stage intact; confirm History shows the `mission.created` event with an
operator-readable label; and confirm a second account cannot read the first
workspace's missions, events, or approvals.

Security follow-up (same phase): the advisor flagged
`public.handle_new_user()` as a SECURITY DEFINER function callable by `anon` and
`authenticated`. It is the signup trigger function, so migration
`005_revoke_handle_new_user_execute.sql` revokes direct EXECUTE from `public`,
`anon`, and `authenticated` without changing the function: PostgreSQL checks
EXECUTE when a trigger is created rather than when it fires, and the owner keeps
its own privileges, so signup is unaffected. Outstanding **project setting**
(not schema): Supabase's leaked-password protection is disabled — that is an Auth
setting in the dashboard, recorded here rather than solved in SQL.

**Remote reconciliation.** The Supabase project reachable from this environment
is a different product (`portal`, ref `kziwwyiybxvzshojdzet`) and was not touched;
the Forge project (`orxprwiqjtnpgrrheylr`) is in another organisation and is not
connected here. The migration was therefore written against the *described*
Forge state — the PR #4-era objects already applied by hand (`run_events`,
`action_receipts`, `fleets`, `fleet_members`, the runtime columns), 9 agents,
8 departments, 13 agent capabilities, 1 fleet, 3 fleet members, 0 workspaces —
and is additive and idempotent so it is safe whether an object already exists or
not. It contains no `drop table`, no `drop column`, and no data deletion; the only
drops are `drop policy if exists` immediately before recreating that policy.

**Migration** — `supabase/migrations/004_forge_workspace_and_mission_persistence.sql`:
mission columns on `tasks` (`kind`, `icon`, `fleet_id`, `current_stage`,
`reached_stages`, `result`, `error`, timestamps), the `run_events` stream with
membership-scoped reads and **no** write path for browser sessions, approval
columns including `destination`, `payload_fingerprint`, `consumed_at` and the
consumed state, `action_receipts` confirmation, self-owned onboarding insert
policies for organisations/workspaces/memberships/capabilities, and the Fleet
seed keyed on agent slugs (idempotent, never duplicating the eight built-ins).

**Persistence boundary** — `lib/forge/persistence/`: `client.js` (session client
for reads and user-owned writes; service-role client for the two records a
browser must not write), `map.js` (explicit domain ↔ row mapping, results
validated on the way in *and* on the way out), `missions.js`, `approvals.js`,
`workspaces.js`, `agents.js`, and `index.js` as the single boundary the server
components and actions use. The UI never sees a row.

**Onboarding** — one step, Jarvis-styled: the browser submits a name, and the
server derives ownership from the verified session, creating organisation →
organisation membership → workspace → workspace membership → internal capability
grants (`workspace.read`, `mission.coordinate` at read level only). A failure
part-way through removes what it just created, so no organisation is left without
an owner. No external capability is granted for owning a workspace.

**Mission Bay / History** — both read durable state, with three honest states
kept distinct: database unreachable, no workspace (onboarding), and workspace
with missions. Dispatching a mission records a queued mission through the Phase 4
factory; it does not start work, and the command bar says so. Fixtures remain for
tests and for the development-only `/preview` route.

**Fix made during the final pass** (the only code change): the authenticated Tool
Armory and Settings pages still imported the fixture module. The declarations now
live in `lib/forge/tools/declared.js` (product intent), while the demo shelf with
connected/waiting/setup states stayed in the fixture layer, marked `demo` and
reachable only from the development preview. Every tile on the authenticated
armory reports not connected, and a test fails if any production route imports
fixture data again.

**Environment variables** for the Forge deployment: `NEXT_PUBLIC_SUPABASE_URL`
and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for the app, and
`SUPABASE_SERVICE_ROLE_KEY` for the trusted writes (mission events, approvals).
Without the service-role key missions still save and the UI says their history
cannot be recorded.

## Phase 6 — runtime adapter boundary (complete)

**Architecture this phase establishes.** Nothing above the runtime interface
knows how work is executed, and nothing below it knows about Forge's people,
workspaces, or permissions.

```
KORBEN                      the operator's front door
  ↓
JARVIS                      the orchestrator
  ↓
Forge web / control layer   auth · workspaces · agents · mission state ·
  ↓                         permissions · approvals · receipts · history · UI
Runtime interface           lib/forge/runtime — Forge-owned, runtime-neutral
  ↓
Hermes                      the execution runtime
  ↓
specialist execution        model calls, tools, subagents, retries, lifecycle
```

**Naming rule, restated because it is easy to get wrong.** `forge.korbenos.com`
is the web application. JARVIS is the orchestrator. **FORGE remains the
maker/builder specialist agent** in the Fleet — it is not a second orchestrator
and not the web app. Hermes is the execution harness.

**Runtime interface** — `lib/forge/runtime/contract.js` defines the eight methods
the rest of Forge may use — `getCapabilities`, `health`, `createRun`, `getRun`,
`getRunEvents`, `stopRun`, `resolveApproval`, `steerRun` — together with
`assertRuntimeAdapter`, which fails loudly when an adapter is incomplete. Any
adapter that satisfies the interface is interchangeable: Hermes today, the test
fake in CI, something else later.

**Normalized types** — `lib/forge/runtime/types.js` converts runtime payloads
into Forge shapes at the boundary: `RuntimeHealth`, `RuntimeCapabilities`,
`RuntimeRun`, `RuntimeEvent`, `RuntimeCreateRequest`, `RuntimeApprovalDecision`.
Hermes's status vocabulary is mapped onto the mission vocabulary Forge already
uses (`succeeded` → `completed`, `approval_required` → `waiting_approval`,
`stopped` → `cancelled`), run output is reduced to a bounded summary, and event
metadata is flattened to primitives so a nested object can never smuggle a
credential across.

**Hermes adapter** — `lib/forge/runtime/hermes-adapter.js` is the only place
Hermes HTTP detail lives. It authenticates server-side, maps Forge calls onto the
existing `lib/hermes/client.js` (reused, extended additively with run-events and
steering), maps responses back to normalized objects, enforces its own deadline,
and converts every failure into a Forge-owned error. It holds no agent business
logic. `lib/forge/runtime/index.js` is the single server-only entry point
(`getForgeRuntime()`), and `runtimeStatus()` feeds one honest status line into the
Mission Bay legend.

**Configuration** — `HERMES_API_URL` and `HERMES_API_KEY`, server-only, never
`NEXT_PUBLIC_`. `hermesConfigState()` reads them without throwing, and an
unconfigured deployment gets a plain `runtime_not_configured` state and the
legend reads "Runtime not configured" — no crash, no invented success.

**Credential boundary** — the browser never calls Hermes and never receives the
key. A test walks every file under `app/` and `components/` and fails if any of
them mentions `NEXT_PUBLIC_HERMES` or `HERMES_API_KEY`, imports `lib/hermes/client`
(server route handlers under `app/api/` excepted), or — for client components —
imports the server runtime at all. The adapter itself exposes no key-shaped
property, which the live check confirms.

**Context and policy boundary** — `lib/forge/runtime/context.js` builds the safe
mission context (operator brief, agent instructions, capability grants with their
ceilings, connection *references*, workspace identity, policy, delegation flag)
and refuses credential-shaped keys or values (`api_key`, `secret`, `token`,
bearer strings, `eyJ…` JWTs, service-role tokens) by mechanical check rather than
by convention. The rule is encoded, not just written down: **Forge decides what
an agent may receive before Hermes sees the request.** Workspace access, business
data, connection credentials, and dangerous-action authorization are control-plane
decisions; Hermes does not make them. `buildRuntimeCreateRequest` defines the
future launch shape (mission id, workspace id, agent slug, fleet id, mission kind,
brief, context, capabilities, policy, correlation) and nothing dispatches it.

**Error model** — `lib/forge/runtime/errors.js` gives every failure a Forge code:
`runtime_not_configured`, `runtime_unreachable`, `runtime_unauthorized`,
`runtime_timeout`, `runtime_bad_response`, `runtime_run_not_found`,
`runtime_rejected`, plus `runtime_not_implemented` and `runtime_invalid_request`.
Only a short, safe detail survives normalization; full upstream payloads are never
forwarded.

**Fake runtime** — `lib/forge/runtime/fake-runtime.js` implements the same
interface for tests: healthy, unavailable, and not-configured modes, plus fake
runs, events, stop, approval, and steering responses. It is never wired into a
production path — `lib/forge/runtime/index.js` only ever builds the Hermes
adapter — and the Mission Bay UI never reads it.

### Live verification against `https://hermes.forge.korbenos.com`

Every check below ran through the real client and the real adapter, over the
network, with the deployment's own `HERMES_API_URL` / `HERMES_API_KEY`. No run
was created: the phase proves the boundary and the two safe inspection calls.

| Check | Result |
| --- | --- |
| Authenticated `health()` through the adapter | healthy — `{state: "healthy", status: "ok", detail: {version: "0.21.2"}}` |
| Authenticated `getCapabilities()` through the adapter | 22 normalized feature names, led by `run_submission`, `run_status`, `run_events_sse`, `run_stop`, `run_steer`, `run_approval_response` |
| `RuntimeHealth` normalization | exactly `state` / `status` / `detail` / `checkedAt`, no raw payload |
| `RuntimeCapabilities` normalization | exactly `agents` / `features` / `raw`; the payload's `platform`, `model`, `auth`, `runtime`, and `endpoints` fields do not cross the boundary |
| Adapter with no key | `runtime_not_configured`, no crash, no key-shaped property on the adapter |
| Adapter with a rejected key | `401` → `runtime_unauthorized`, safe message, `detail: null`, key never echoed |
| Adapter against an unresolvable host and a closed port | `runtime_unreachable` |
| Adapter against a blackholed host with an 800 ms budget | `runtime_timeout` after 811 ms |
| Anonymous `GET /health/detailed`, `GET /v1/capabilities`, `POST /v1/runs` | `401` `gateway_auth_failed` — the gateway is genuinely keyed, so the browser can never reach the runtime directly |
| Credential scan of `app/`, `components/`, `lib/`, `tests/`, `docs/`, `supabase/`, `.next/static`, `.next/server` | the key value appears in zero files; no `NEXT_PUBLIC_HERMES*` variable exists |
| `npm test` | 76 passing, 0 failing |
| `npm run build` | clean |

**Fixes made during this phase** — two real defects, both found by the live pass
rather than assumed away:

1. The adapter accepted a `timeoutMs` that nothing enforced, so a hung runtime
   was bounded only by the HTTP client's own 10 s default — the blackhole probe
   waited the full 10 s against an 800 ms budget. The adapter now owns the
   deadline through its own race, and a test holds it there.
2. The live runtime reports capabilities as a **name → flag map**, not a list.
   The normalizer read it as an array and silently returned nothing, which would
   have made a fully capable runtime look featureless. It now reads the map,
   keeps the enabled keys, and drops entries whose descriptor says they are
   switched off. A test pins the live shape.

The first live attempt also failed authentication because the key that had been
placed in the local environment file was not the one the running gateway holds;
the gateway answered the byte-identical generic `401` for every transport
(bearer, raw, `X-API-Key`, query parameter, Basic, cookie) until the correct
`API_SERVER_KEY` was supplied. The credential was neither created nor rotated
during this work.

## Phase 7 — Hermes single-agent execution

One agent, one mission, one Hermes run: submit, persist the Hermes run id, mirror
status, and record events.

## Phase 8 — Hermes Fleet / subagent delegation

Record child runs as Hermes reports them so the Fleet reads as a real team.
Workers stay idle/pending until the runtime says otherwise; nothing is simulated.

## Phase 9 — Tool Armory runtime

Turn the armory from declarations into a working registry: capability, action
level, review policy, connection requirement, availability.

## Phase 10 — Forge tool gateway

Hermes asks Forge to act; Forge validates workspace, agent capability, member
capability, action level, and connection permission, then executes server-side
and returns only a bounded result. The runtime never holds connector credentials.

## Phase 11 — real approval execution

Staged, hashed, one-use, expiring approvals that execute exactly the reviewed
arguments, inline in the mission where the reference puts them.

## Phase 12 — action receipts

Immutable evidence for executed actions, distinguishing accepted from
provider-confirmed, so the UI never claims more than a receipt supports.

## Phase 13 — development tools

GitHub, Vercel, Supabase, sandboxed code execution, and browser
inspection/testing wired through the gateway as the first real tool set.

## Phase 14 — Software Factory workflow

The build-me-an-app style mission: brief, scaffold, code, test, launch, with the
stage chips the reference shows and an artifact the operator can open.

## Phase 15 — expanded engineering workforce

Additional engineering agents and their capabilities, still expressed through the
same mission, fleet, approval, and receipt model.

## Phase 16 — business integrations

Revenue, marketing, and operations connectors on the same gateway, with the same
approval and receipt discipline.

## Guardrails for every phase

- Start from the reference. Port before inventing.
- Keep Phase N independent: no phase begins before the previous one is verified.
- Never fake mission activity, tool execution, receipts, or subagent work.
- Keep approvals, receipts, and audit as the only proof that something happened.
- Preserve Supabase auth, RLS, the Hermes adapter, and secure env handling.
- Update the PR in place; no new PRs, and no merging without an explicit request.
