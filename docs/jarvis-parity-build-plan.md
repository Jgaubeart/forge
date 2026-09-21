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

## Phase 5 — Supabase persistence and first-workspace onboarding

Status: **migrations 004 and 005 are applied to the real Forge project**
(`forge`, ref `orxprwiqjtnpgrrheylr`). Its migration history reads `forge_core`,
`harden_forge_rls`, `forge_fleet`, `forge_workspace_and_mission_persistence`,
`revoke_handle_new_user_execute`. Live counts after applying: organisations 0,
workspaces 0, workspace memberships 0, tasks 0, run_events 0, approvals 0,
agents 9, fleets 1, fleet_members 3 — a clean, empty Forge with the workforce
seeded and no test data. Nothing in the unrelated `portal` project was touched.

**Final live verification pass: attempted, blocked on credentials.** This
environment holds no Forge API keys — only a Supabase access token scoped to a
different organisation, which returns 403 for the Forge project ref — so sign-in,
onboarding, mission persistence, History reads, approval persistence, and
cross-workspace RLS could not be exercised against the real project from here.
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

## Phase 6 — runtime adapter boundary

Define the server-side boundary the UI calls: authorize, build context, create
mission records, submit, mirror status, append events. No React component talks
to Hermes.

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
