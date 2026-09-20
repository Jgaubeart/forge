-- Harden Forge RLS helpers and add indexes for the first multi-tenant slice.

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated;

create or replace function private.is_workspace_member(target_workspace uuid)
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

create or replace function private.can_access_connection(
  target_connection uuid,
  requested_level text default 'read'
)
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
     and wm.user_id = (select auth.uid())
    left join public.connection_permissions cp
      on cp.connection_id = c.id
     and cp.workspace_membership_id = wm.id
    where c.id = target_connection
      and (
        c.owner_user_id = (select auth.uid())
        or case requested_level
          when 'execute' then coalesce(cp.can_execute, false)
          when 'draft' then coalesce(cp.can_draft, false) or coalesce(cp.can_execute, false)
          else coalesce(cp.can_read, false) or coalesce(cp.can_draft, false) or coalesce(cp.can_execute, false)
        end
      )
  );
$$;

revoke all on function private.is_workspace_member(uuid) from public, anon;
revoke all on function private.can_access_connection(uuid, text) from public, anon;
grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.can_access_connection(uuid, text) to authenticated;

drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self"
on public.profiles for select
to authenticated
using (id = (select auth.uid()));

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
on public.profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists "organizations_select_member" on public.organizations;
create policy "organizations_select_member"
on public.organizations for select
to authenticated
using (
  exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = organizations.id
      and om.user_id = (select auth.uid())
  )
);

drop policy if exists "organization_memberships_select_related" on public.organization_memberships;
create policy "organization_memberships_select_related"
on public.organization_memberships for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.organization_memberships mine
    where mine.organization_id = organization_memberships.organization_id
      and mine.user_id = (select auth.uid())
  )
);

drop policy if exists "workspaces_select_member" on public.workspaces;
create policy "workspaces_select_member"
on public.workspaces for select
to authenticated
using (private.is_workspace_member(id));

drop policy if exists "workspace_memberships_select_related" on public.workspace_memberships;
create policy "workspace_memberships_select_related"
on public.workspace_memberships for select
to authenticated
using (
  user_id = (select auth.uid())
  or private.is_workspace_member(workspace_id)
);

drop policy if exists "membership_capabilities_select_self" on public.membership_capabilities;
create policy "membership_capabilities_select_self"
on public.membership_capabilities for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_memberships wm
    where wm.id = membership_capabilities.workspace_membership_id
      and wm.user_id = (select auth.uid())
  )
);

drop policy if exists "connections_select_authorized" on public.connections;
create policy "connections_select_authorized"
on public.connections for select
to authenticated
using (private.can_access_connection(id, 'read'));

drop policy if exists "connection_permissions_select_self" on public.connection_permissions;
create policy "connection_permissions_select_self"
on public.connection_permissions for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_memberships wm
    where wm.id = connection_permissions.workspace_membership_id
      and wm.user_id = (select auth.uid())
  )
);

drop policy if exists "tasks_select_workspace" on public.tasks;
create policy "tasks_select_workspace"
on public.tasks for select
to authenticated
using (private.is_workspace_member(workspace_id));

drop policy if exists "tasks_insert_self" on public.tasks;
create policy "tasks_insert_self"
on public.tasks for insert
to authenticated
with check (
  requested_by = (select auth.uid())
  and private.is_workspace_member(workspace_id)
);

drop policy if exists "agent_runs_select_via_task" on public.agent_runs;
create policy "agent_runs_select_via_task"
on public.agent_runs for select
to authenticated
using (
  exists (
    select 1
    from public.tasks t
    where t.id = agent_runs.task_id
      and private.is_workspace_member(t.workspace_id)
  )
);

drop policy if exists "approvals_select_workspace" on public.approvals;
create policy "approvals_select_workspace"
on public.approvals for select
to authenticated
using (
  exists (
    select 1
    from public.tasks t
    where t.id = approvals.task_id
      and private.is_workspace_member(t.workspace_id)
  )
);

drop policy if exists "audit_logs_select_workspace" on public.audit_logs;
create policy "audit_logs_select_workspace"
on public.audit_logs for select
to authenticated
using (
  workspace_id is not null
  and private.is_workspace_member(workspace_id)
);

drop function if exists public.can_access_connection(uuid, text);
drop function if exists public.is_workspace_member(uuid);

create index if not exists organizations_created_by_idx
  on public.organizations(created_by);
create index if not exists organization_memberships_user_id_idx
  on public.organization_memberships(user_id);
create index if not exists workspaces_created_by_idx
  on public.workspaces(created_by);
create index if not exists workspace_memberships_user_id_idx
  on public.workspace_memberships(user_id);
create index if not exists agents_department_id_idx
  on public.agents(department_id);
create index if not exists connections_workspace_id_idx
  on public.connections(workspace_id);
create index if not exists connections_owner_user_id_idx
  on public.connections(owner_user_id);
create index if not exists connection_permissions_workspace_membership_id_idx
  on public.connection_permissions(workspace_membership_id);
create index if not exists tasks_workspace_id_idx
  on public.tasks(workspace_id);
create index if not exists tasks_agent_id_idx
  on public.tasks(agent_id);
create index if not exists tasks_requested_by_idx
  on public.tasks(requested_by);
create index if not exists agent_runs_task_id_idx
  on public.agent_runs(task_id);
create index if not exists approvals_task_id_idx
  on public.approvals(task_id);
create index if not exists approvals_agent_run_id_idx
  on public.approvals(agent_run_id);
create index if not exists approvals_requested_by_idx
  on public.approvals(requested_by);
create index if not exists approvals_decided_by_idx
  on public.approvals(decided_by);
create index if not exists audit_logs_workspace_id_idx
  on public.audit_logs(workspace_id);
create index if not exists audit_logs_actor_user_id_idx
  on public.audit_logs(actor_user_id);
create index if not exists audit_logs_task_id_idx
  on public.audit_logs(task_id);
