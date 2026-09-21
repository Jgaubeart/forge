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

## Phase 3 — Jarvis agent catalog and Fleet

Seed the named agents (JARVIS, SCOUT, FORGE, SAGE, REAPER, WARROOM, HERALD,
HATERS) and the Fleet (SCOUT + FORGE + SAGE, coordinated by JARVIS) with the
reference prompts adapted to the web. Agents keep their reference identities.

## Phase 4 — mission semantics and structured results

Port mission kinds and their result shapes: research memo, build artifact, fleet
combined result, analytics report, social drafts, comment reply set, subscription
audit. Results render per kind; raw JSON is never shown where the reference has a
result UI.

## Phase 5 — Supabase persistence and first-workspace onboarding

Back the ported UI with durable mission state and add the minimal first-run flow
that creates the authenticated user's first workspace, then lands them in Mission
Bay.

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
