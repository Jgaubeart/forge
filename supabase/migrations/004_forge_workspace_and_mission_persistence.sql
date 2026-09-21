-- Phase 5: durable workspace, mission, event, and approval persistence.
--
-- RECONCILIATION NOTE
-- The live Forge database is not a clean replay of this repository's migration
-- files. It already carries the PR #4-era objects (run_events, action_receipts,
-- fleets, fleet_members, the runtime columns on tasks/agent_runs/approvals) and
-- its migration history reads forge_core / harden_forge_rls / forge_fleet rather
-- than this repo's 001-003 names. This migration is therefore written to be
-- additive and idempotent: every statement is safe whether the object already
-- exists (as on the live database) or not (a database built only from 001-003).
--
-- It contains no DROP TABLE, no DROP COLUMN, and no data deletion. The only
-- DROP statements are `drop policy if exists` immediately before recreating the
-- same policy with the intended definition.
--
-- NOT APPLIED. This file is written for review; it must be applied only to the
-- Forge project (ref orxprwiqjtnpgrrheylr) by someone with access to it.

-- ---------------------------------------------------------------- helpers ---
-- The harden-RLS migration keeps its membership helper in the private schema.
-- Recreated here only if a database is missing it.

create schema if not exists private;

create or replace function private.is_forge_workspace_member(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_memberships wm
    where wm.workspace_id = target_workspace
      and wm.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_forge_workspace_member(uuid) from public, anon;
grant execute on function private.is_forge_workspace_member(uuid) to authenticated;

-- ---------------------------------------------------------------- fleets ----

create table if not exists public.fleets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  lead_agent_id uuid references public.agents(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.fleet_members (
  fleet_id uuid not null references public.fleets(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  role text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (fleet_id, agent_id)
);

alter table public.fleets
  add column if not exists lead_agent_id uuid references public.agents(id) on delete set null;
alter table public.fleet_members
  add column if not exists position integer not null default 0;

create index if not exists fleets_lead_agent_id_idx on public.fleets (lead_agent_id);
create index if not exists fleet_members_agent_id_idx on public.fleet_members (agent_id);

alter table public.fleets enable row level security;
alter table public.fleet_members enable row level security;

-- Fleets are a shared catalogue, like agents and departments: readable by any
-- signed-in member, never writable from a browser session.
drop policy if exists "fleets_select_authenticated" on public.fleets;
create policy "fleets_select_authenticated"
on public.fleets for select to authenticated using (true);

drop policy if exists "fleet_members_select_authenticated" on public.fleet_members;
create policy "fleet_members_select_authenticated"
on public.fleet_members for select to authenticated using (true);

grant select on public.fleets to authenticated;
grant select on public.fleet_members to authenticated;
revoke insert, update, delete on public.fleets from authenticated, anon;
revoke insert, update, delete on public.fleet_members from authenticated, anon;

-- The Fleet definition itself is canonical in code (lib/forge/agents/fleet.js).
-- The rows below exist only so missions can hold durable references; they are
-- created from agent slugs and never restate behaviour.
insert into public.agents (department_id, name, slug, description, instructions)
select d.id, v.name, v.slug, v.description, v.instructions
from (
  values
    ('administration', 'JARVIS', 'jarvis',
     'Coordinating agent: decomposes missions, chooses workers, assembles results.',
     'See lib/forge/agents/catalog.js for the canonical system instructions.'),
    ('research', 'SCOUT', 'scout',
     'Reconnaissance agent: landscape, facts, numbers, constraints, risks.',
     'See lib/forge/agents/catalog.js for the canonical system instructions.'),
    ('production', 'FORGE', 'forge',
     'Maker agent: produces the deliverable the brief calls for.',
     'See lib/forge/agents/catalog.js for the canonical system instructions.'),
    ('strategy', 'SAGE', 'sage',
     'Strategist agent: objections, what people get wrong, risks, next actions.',
     'See lib/forge/agents/catalog.js for the canonical system instructions.'),
    ('finance', 'REAPER', 'reaper',
     'Subscription audit agent: read-only ledger, then gated cancellation drafts.',
     'See lib/forge/agents/catalog.js for the canonical system instructions.'),
    ('analytics', 'WARROOM', 'warroom',
     'Analytics agent: status and momentum reporting.',
     'See lib/forge/agents/catalog.js for the canonical system instructions.'),
    ('marketing', 'HERALD', 'herald',
     'Announcement agent: per-channel drafts, published only after approval.',
     'See lib/forge/agents/catalog.js for the canonical system instructions.'),
    ('community', 'HATERS', 'haters',
     'Community agent: reads comments, drafts replies, claims nothing without a receipt.',
     'See lib/forge/agents/catalog.js for the canonical system instructions.')
) as v(department_slug, name, slug, description, instructions)
join public.departments d on d.slug = v.department_slug
on conflict (slug) do nothing;

insert into public.fleets (name, slug, description, lead_agent_id)
select 'The Fleet', 'the-fleet',
       'Recon, draft, and critique from a coordinated three-agent team, assembled by JARVIS.',
       (select id from public.agents where slug = 'jarvis')
on conflict (slug) do update
  set description = excluded.description,
      lead_agent_id = coalesce(public.fleets.lead_agent_id, excluded.lead_agent_id);

insert into public.fleet_members (fleet_id, agent_id, role, position)
select f.id, a.id, v.role, v.position
from public.fleets f
join (
  values ('scout', 'recon', 1), ('forge', 'maker', 2), ('sage', 'critic', 3)
) as v(slug, role, position) on true
join public.agents a on a.slug = v.slug
where f.slug = 'the-fleet'
on conflict (fleet_id, agent_id) do update
  set role = excluded.role, position = excluded.position;

-- ------------------------------------------------------- missions on tasks ---

alter table public.tasks
  add column if not exists kind text not null default 'general',
  add column if not exists icon text,
  add column if not exists fleet_id uuid references public.fleets(id) on delete set null,
  add column if not exists current_stage text,
  add column if not exists reached_stages jsonb not null default '[]'::jsonb,
  add column if not exists result jsonb not null default '{}'::jsonb,
  add column if not exists error jsonb,
  add column if not exists current_step text,
  add column if not exists policy jsonb not null default '{}'::jsonb,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_requested_at timestamptz,
  add column if not exists cancel_requested_by uuid references auth.users(id) on delete set null;

comment on column public.tasks.kind is
  'Canonical mission kind from lib/forge/missions/kinds.js.';
comment on column public.tasks.current_stage is
  'Stage within the kind''s sequence (see lib/forge/missions/stages.js). Separate from status.';
comment on column public.tasks.reached_stages is
  'Stages reached so far, in order, so the chip row reconstructs without inference.';
comment on column public.tasks.result is
  'Structured result, validated through the Phase 4 contracts before it is written and again on read.';

create index if not exists tasks_fleet_id_idx on public.tasks (fleet_id);
create index if not exists tasks_kind_idx on public.tasks (kind);
create index if not exists tasks_status_idx on public.tasks (status);
create index if not exists tasks_workspace_id_status_idx on public.tasks (workspace_id, status);
create index if not exists tasks_cancel_requested_by_idx on public.tasks (cancel_requested_by);

-- Members read their workspace's missions; a mission may only be created by the
-- person requesting it, inside a workspace they belong to.
drop policy if exists "tasks_select_workspace" on public.tasks;
create policy "tasks_select_workspace"
on public.tasks for select to authenticated
using (private.is_forge_workspace_member(workspace_id));

drop policy if exists "tasks_insert_self" on public.tasks;
create policy "tasks_insert_self"
on public.tasks for insert to authenticated
with check (
  requested_by = (select auth.uid())
  and private.is_forge_workspace_member(workspace_id)
);

drop policy if exists "tasks_update_requester" on public.tasks;
create policy "tasks_update_requester"
on public.tasks for update to authenticated
using (
  requested_by = (select auth.uid())
  and private.is_forge_workspace_member(workspace_id)
)
with check (
  requested_by = (select auth.uid())
  and private.is_forge_workspace_member(workspace_id)
);

-- ------------------------------------------------------------- run_events ----

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

alter table public.run_events
  add column if not exists actor_label text,
  add column if not exists summary text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists run_events_task_id_created_at_idx
  on public.run_events (task_id, created_at desc);
create index if not exists run_events_workspace_id_created_at_idx
  on public.run_events (workspace_id, created_at desc);
create index if not exists run_events_agent_run_id_idx on public.run_events (agent_run_id);
create index if not exists run_events_actor_user_id_idx on public.run_events (actor_user_id);

alter table public.run_events enable row level security;

drop policy if exists "run_events_select_workspace" on public.run_events;
create policy "run_events_select_workspace"
on public.run_events for select to authenticated
using (private.is_forge_workspace_member(workspace_id));

-- The event stream is append-only from server code. A signed-in browser session
-- cannot write it: any policy that would allow that is removed, and the
-- privileges are revoked. This is what makes "no forged events" true rather than
-- aspirational.
drop policy if exists "run_events_insert_authenticated" on public.run_events;
drop policy if exists "run_events_insert_workspace" on public.run_events;
drop policy if exists "run_events_update_authenticated" on public.run_events;
drop policy if exists "run_events_delete_authenticated" on public.run_events;

revoke insert, update, delete on public.run_events from authenticated, anon;
grant select on public.run_events to authenticated;
revoke select on public.run_events from anon;

-- -------------------------------------------------------------- approvals ----

alter table public.approvals
  add column if not exists tool text,
  add column if not exists action_level text,
  add column if not exists connection_id uuid references public.connections(id) on delete set null,
  add column if not exists destination text,
  add column if not exists payload_fingerprint text,
  add column if not exists payload_hash text,
  add column if not exists decided_payload_hash text,
  add column if not exists resumed_at timestamptz,
  add column if not exists consumed_at timestamptz,
  add column if not exists resume_run_id uuid references public.agent_runs(id) on delete set null;

comment on column public.approvals.payload_fingerprint is
  'Fingerprint of the frozen staged arguments. A later phase can replace this with a hash without changing the shape.';
comment on column public.approvals.destination is
  'Human-readable destination for the staged action, when the tool has one.';

-- Approval states, including consumption (single use).
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'approvals_status_check'
      and conrelid = 'public.approvals'::regclass
  ) then
    alter table public.approvals drop constraint approvals_status_check;
  end if;

  alter table public.approvals
    add constraint approvals_status_check
    check (status in ('pending', 'approved', 'denied', 'expired', 'consumed'));
end $$;

create index if not exists approvals_status_idx on public.approvals (status);
create index if not exists approvals_connection_id_idx on public.approvals (connection_id);

alter table public.approvals enable row level security;

drop policy if exists "approvals_select_workspace" on public.approvals;
create policy "approvals_select_workspace"
on public.approvals for select to authenticated
using (
  exists (
    select 1 from public.tasks t
    where t.id = approvals.task_id
      and private.is_forge_workspace_member(t.workspace_id)
  )
);

-- Approvals are staged and decided by server code, so the browser cannot write
-- them directly. The operator's decision travels through a server action.
drop policy if exists "approvals_insert_authenticated" on public.approvals;
drop policy if exists "approvals_update_authenticated" on public.approvals;
revoke insert, update, delete on public.approvals from authenticated, anon;
grant select on public.approvals to authenticated;

-- ---------------------------------------------------------- action_receipts --

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
  confirmation text not null default 'accepted',
  external_ref text,
  executed_at timestamptz not null default now()
);

alter table public.action_receipts
  add column if not exists confirmation text not null default 'accepted';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'action_receipts_confirmation_check'
      and conrelid = 'public.action_receipts'::regclass
  ) then
    alter table public.action_receipts
      add constraint action_receipts_confirmation_check
      check (confirmation in ('accepted', 'confirmed', 'failed'));
  end if;
end $$;

alter table public.action_receipts enable row level security;

drop policy if exists "action_receipts_select_workspace" on public.action_receipts;
create policy "action_receipts_select_workspace"
on public.action_receipts for select to authenticated
using (private.is_forge_workspace_member(workspace_id));

revoke insert, update, delete on public.action_receipts from authenticated, anon;
grant select on public.action_receipts to authenticated;

-- ------------------------------------------- onboarding: first workspace -----
-- Narrow, self-owned insert policies. A signed-in person may create their own
-- organisation, workspace, and memberships; nothing here lets one user create a
-- row for another, and no policy grants ownership of an existing workspace.

alter table public.organizations enable row level security;
drop policy if exists "organizations_insert_self" on public.organizations;
create policy "organizations_insert_self"
on public.organizations for insert to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists "organization_memberships_insert_self" on public.organization_memberships;
create policy "organization_memberships_insert_self"
on public.organization_memberships for insert to authenticated
with check (user_id = (select auth.uid()));

alter table public.workspaces enable row level security;
drop policy if exists "workspaces_insert_self" on public.workspaces;
create policy "workspaces_insert_self"
on public.workspaces for insert to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists "workspace_memberships_insert_self" on public.workspace_memberships;
create policy "workspace_memberships_insert_self"
on public.workspace_memberships for insert to authenticated
with check (user_id = (select auth.uid()));

alter table public.membership_capabilities enable row level security;
drop policy if exists "membership_capabilities_insert_self" on public.membership_capabilities;
create policy "membership_capabilities_insert_self"
on public.membership_capabilities for insert to authenticated
with check (
  exists (
    select 1 from public.workspace_memberships wm
    where wm.id = membership_capabilities.workspace_membership_id
      and wm.user_id = (select auth.uid())
  )
);

-- ------------------------------------------------------------- connections ---
-- Connections stay owner/permission scoped. This only makes the existing intent
-- explicit and keeps the table out of reach of anonymous visitors.

alter table public.connections enable row level security;
alter table public.connection_permissions enable row level security;

revoke all on public.connections from anon;
revoke all on public.connection_permissions from anon;
