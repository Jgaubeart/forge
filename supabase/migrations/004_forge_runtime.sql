-- Forge runtime architecture: durable missions, run events, subagent runs,
-- staged approvals, and execution receipts.
--
-- Hermes stays the execution runtime (model calls, planning, agent loop, tool
-- calling, subagent delegation, run lifecycle, retries, stop/cancel). These
-- tables are Forge's durable record around it: mission state, the event stream,
-- parent/child run structure, staged approvals, and proof of executed actions.
--
-- RLS: every new table is workspace scoped and readable only by members of that
-- workspace through private.is_workspace_member. There are deliberately no
-- INSERT/UPDATE/DELETE policies for authenticated clients on run_events or
-- action_receipts: those rows are written by Forge server code, so the audit
-- trail cannot be forged or edited from a browser session.

-- 1. tasks become durable missions -----------------------------------------

alter table public.tasks
  add column if not exists current_step text,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_requested_at timestamptz,
  add column if not exists cancel_requested_by uuid references auth.users(id) on delete set null,
  add column if not exists policy jsonb not null default '{}'::jsonb;

comment on column public.tasks.status is
  'Mission lifecycle: queued | planning | running | waiting | waiting_approval | completed | failed | cancelled';
comment on column public.tasks.current_step is
  'Safe, human-readable description of the current step. Displayed directly.';
comment on column public.tasks.policy is
  'Resolved policy snapshot captured at submission: action-level ceiling, capability grants, and authorized connection ids.';

create index if not exists tasks_status_idx
  on public.tasks (status);
create index if not exists tasks_workspace_id_status_idx
  on public.tasks (workspace_id, status);
create index if not exists tasks_cancel_requested_by_idx
  on public.tasks (cancel_requested_by);

-- 2. agents declare whether delegation is permitted -------------------------

alter table public.agents
  add column if not exists delegation_enabled boolean not null default false;

comment on column public.agents.delegation_enabled is
  'Whether Hermes may delegate this agent''s work to subagents. Forge records the resulting child runs.';

-- 3. agent_runs carry parent/child structure -------------------------------

alter table public.agent_runs
  add column if not exists parent_run_id uuid references public.agent_runs(id) on delete cascade,
  add column if not exists kind text not null default 'primary',
  add column if not exists actor_label text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists cancelled_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'agent_runs_kind_check'
      and conrelid = 'public.agent_runs'::regclass
  ) then
    alter table public.agent_runs
      add constraint agent_runs_kind_check check (kind in ('primary', 'subagent'));
  end if;
end $$;

comment on column public.agent_runs.kind is
  'primary for the mission run, subagent for work delegated by Hermes.';
comment on column public.agent_runs.parent_run_id is
  'Parent run when Hermes delegated this run to a subagent.';
comment on column public.agent_runs.actor_label is
  'Safe label of the agent or subagent that performed the work, as reported by Hermes.';

create index if not exists agent_runs_parent_run_id_idx
  on public.agent_runs (parent_run_id);
create index if not exists agent_runs_status_idx
  on public.agent_runs (status);

-- 4. approvals become a staged-action boundary ------------------------------

alter table public.approvals
  add column if not exists tool text,
  add column if not exists action_level text,
  add column if not exists connection_id uuid references public.connections(id) on delete set null,
  add column if not exists payload_hash text,
  add column if not exists decided_payload_hash text,
  add column if not exists resumed_at timestamptz,
  add column if not exists resume_run_id uuid references public.agent_runs(id) on delete set null;

comment on column public.approvals.action_payload is
  'Snapshot of the sanitized, validated arguments that were staged for review. Approved execution runs from this snapshot, never from later model output.';
comment on column public.approvals.payload_hash is
  'SHA-256 of the canonical staged payload, recorded at staging time.';
comment on column public.approvals.decided_payload_hash is
  'The staged payload hash verified at decision time. Execution refuses to run when it differs from payload_hash.';

create index if not exists approvals_status_idx
  on public.approvals (status);
create index if not exists approvals_connection_id_idx
  on public.approvals (connection_id);
create index if not exists approvals_resume_run_id_idx
  on public.approvals (resume_run_id);

-- 5. run_events: the durable event stream -----------------------------------

create table if not exists public.run_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  agent_run_id uuid references public.agent_runs(id) on delete cascade,
  event_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_label text,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.run_events is
  'Forge event stream for missions and runs. Summaries and metadata are sanitized before insert; no prompts, credentials, or raw tool payloads are stored.';

alter table public.run_events enable row level security;

drop policy if exists "run_events_select_workspace" on public.run_events;
create policy "run_events_select_workspace"
on public.run_events for select
to authenticated
using ((select private.is_workspace_member(workspace_id)));

create index if not exists run_events_task_id_created_at_idx
  on public.run_events (task_id, created_at desc);
create index if not exists run_events_workspace_id_created_at_idx
  on public.run_events (workspace_id, created_at desc);
create index if not exists run_events_agent_run_id_idx
  on public.run_events (agent_run_id);
create index if not exists run_events_actor_user_id_idx
  on public.run_events (actor_user_id);

-- 6. action_receipts: proof of what Forge actually executed -----------------

create table if not exists public.action_receipts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  approval_id uuid references public.approvals(id) on delete set null,
  connection_id uuid references public.connections(id) on delete set null,
  tool text not null,
  capability text not null,
  action_level text not null,
  input_summary text,
  result_summary text,
  success boolean not null,
  external_ref text,
  executed_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'action_receipts_action_level_check'
      and conrelid = 'public.action_receipts'::regclass
  ) then
    alter table public.action_receipts
      add constraint action_receipts_action_level_check
      check (action_level in ('read', 'draft', 'execute'));
  end if;
end $$;

comment on table public.action_receipts is
  'Immutable record of an executed Forge action: what tool ran, under which capability and connection, and a safe summary of input and result. Never stores credentials.';

alter table public.action_receipts enable row level security;

drop policy if exists "action_receipts_select_workspace" on public.action_receipts;
create policy "action_receipts_select_workspace"
on public.action_receipts for select
to authenticated
using ((select private.is_workspace_member(workspace_id)));

create index if not exists action_receipts_workspace_id_executed_at_idx
  on public.action_receipts (workspace_id, executed_at desc);
create index if not exists action_receipts_task_id_idx
  on public.action_receipts (task_id);
create index if not exists action_receipts_agent_run_id_idx
  on public.action_receipts (agent_run_id);
create index if not exists action_receipts_approval_id_idx
  on public.action_receipts (approval_id);
create index if not exists action_receipts_connection_id_idx
  on public.action_receipts (connection_id);

-- 7. Data API access --------------------------------------------------------
--
-- RLS decides which rows are visible; these grants decide whether the table is
-- reachable through the Data API at all. Read-only, authenticated only.

grant select on public.run_events to authenticated;
grant select on public.action_receipts to authenticated;

revoke all on public.run_events from anon;
revoke all on public.action_receipts from anon;
