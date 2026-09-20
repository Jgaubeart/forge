-- Forge v1 core schema.
-- The first goal is identity + workspace isolation + shared agents + connection scoping.
-- Do not put provider credentials in agent rows or prompts.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  kind text not null default 'business',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table if not exists public.workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists public.membership_capabilities (
  workspace_membership_id uuid not null references public.workspace_memberships(id) on delete cascade,
  capability text not null,
  action_level text not null check (action_level in ('read', 'draft', 'execute')),
  created_at timestamptz not null default now(),
  primary key (workspace_membership_id, capability)
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments(id) on delete set null,
  name text not null,
  slug text not null unique,
  description text,
  instructions text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_capabilities (
  agent_id uuid not null references public.agents(id) on delete cascade,
  capability text not null,
  max_action_level text not null check (max_action_level in ('read', 'draft', 'execute')),
  primary key (agent_id, capability)
);

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  label text not null,
  external_account_id text,
  secret_ref text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.connection_permissions (
  connection_id uuid not null references public.connections(id) on delete cascade,
  workspace_membership_id uuid not null references public.workspace_memberships(id) on delete cascade,
  can_read boolean not null default false,
  can_draft boolean not null default false,
  can_execute boolean not null default false,
  primary key (connection_id, workspace_membership_id)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid not null references public.agents(id),
  requested_by uuid not null references auth.users(id),
  action_level text not null check (action_level in ('read', 'draft', 'execute')),
  input jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  hermes_run_id text unique,
  status text not null default 'queued',
  output jsonb,
  error jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  agent_run_id uuid references public.agent_runs(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  capability text not null,
  action_payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'expired')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  workspace_id uuid references public.workspaces(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_workspace_member(target_workspace uuid)
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
      and wm.user_id = auth.uid()
  );
$$;

create or replace function public.can_access_connection(target_connection uuid, requested_level text default 'read')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.connections c
    left join public.workspace_memberships wm
      on wm.workspace_id = c.workspace_id
     and wm.user_id = auth.uid()
    left join public.connection_permissions cp
      on cp.connection_id = c.id
     and cp.workspace_membership_id = wm.id
    where c.id = target_connection
      and (
        c.owner_user_id = auth.uid()
        or case requested_level
          when 'execute' then coalesce(cp.can_execute, false)
          when 'draft' then coalesce(cp.can_draft, false) or coalesce(cp.can_execute, false)
          else coalesce(cp.can_read, false) or coalesce(cp.can_draft, false) or coalesce(cp.can_execute, false)
        end
      )
  );
$$;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.membership_capabilities enable row level security;
alter table public.departments enable row level security;
alter table public.agents enable row level security;
alter table public.agent_capabilities enable row level security;
alter table public.connections enable row level security;
alter table public.connection_permissions enable row level security;
alter table public.tasks enable row level security;
alter table public.agent_runs enable row level security;
alter table public.approvals enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles_select_self"
on public.profiles for select
to authenticated
using (id = auth.uid());

create policy "profiles_update_self"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "organizations_select_member"
on public.organizations for select
to authenticated
using (
  exists (
    select 1 from public.organization_memberships om
    where om.organization_id = organizations.id and om.user_id = auth.uid()
  )
);

create policy "organization_memberships_select_related"
on public.organization_memberships for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.organization_memberships mine
    where mine.organization_id = organization_memberships.organization_id
      and mine.user_id = auth.uid()
  )
);

create policy "workspaces_select_member"
on public.workspaces for select
to authenticated
using (public.is_workspace_member(id));

create policy "workspace_memberships_select_related"
on public.workspace_memberships for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_workspace_member(workspace_id)
);

create policy "membership_capabilities_select_self"
on public.membership_capabilities for select
to authenticated
using (
  exists (
    select 1 from public.workspace_memberships wm
    where wm.id = membership_capabilities.workspace_membership_id
      and wm.user_id = auth.uid()
  )
);

create policy "departments_read_authenticated"
on public.departments for select
to authenticated
using (true);

create policy "agents_read_authenticated"
on public.agents for select
to authenticated
using (is_active = true);

create policy "agent_capabilities_read_authenticated"
on public.agent_capabilities for select
to authenticated
using (true);

create policy "connections_select_authorized"
on public.connections for select
to authenticated
using (public.can_access_connection(id, 'read'));

create policy "connection_permissions_select_self"
on public.connection_permissions for select
to authenticated
using (
  exists (
    select 1 from public.workspace_memberships wm
    where wm.id = connection_permissions.workspace_membership_id
      and wm.user_id = auth.uid()
  )
);

create policy "tasks_select_workspace"
on public.tasks for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "tasks_insert_self"
on public.tasks for insert
to authenticated
with check (
  requested_by = auth.uid()
  and public.is_workspace_member(workspace_id)
);

create policy "agent_runs_select_via_task"
on public.agent_runs for select
to authenticated
using (
  exists (
    select 1 from public.tasks t
    where t.id = agent_runs.task_id
      and public.is_workspace_member(t.workspace_id)
  )
);

create policy "approvals_select_workspace"
on public.approvals for select
to authenticated
using (
  exists (
    select 1 from public.tasks t
    where t.id = approvals.task_id
      and public.is_workspace_member(t.workspace_id)
  )
);

create policy "audit_logs_select_workspace"
on public.audit_logs for select
to authenticated
using (
  workspace_id is not null and public.is_workspace_member(workspace_id)
);

insert into public.departments (name, slug)
values ('Administration', 'administration')
on conflict (slug) do nothing;

insert into public.agents (department_id, name, slug, description, instructions)
select d.id,
       'Inbox Triage',
       'inbox-triage',
       'Shared inbox analysis and response-drafting agent.',
       'Analyze only the mailbox data and connections supplied by Forge. Classify, summarize, identify follow-ups, and draft responses. Never send email.'
from public.departments d
where d.slug = 'administration'
on conflict (slug) do nothing;

insert into public.agent_capabilities (agent_id, capability, max_action_level)
select a.id, x.capability, x.max_action_level
from public.agents a
cross join (
  values
    ('email.read', 'read'),
    ('email.draft', 'draft')
) as x(capability, max_action_level)
where a.slug = 'inbox-triage'
on conflict (agent_id, capability) do nothing;
