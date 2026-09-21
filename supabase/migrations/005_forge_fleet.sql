-- Forge v1 fleet: the named Jarvis agents, the coordinated fleet, mission kinds,
-- mission results, and provider-confirmation state on receipts.
--
-- This is additive. Inbox Triage is kept, existing policies are untouched, and
-- the new tables follow the same workspace/authenticated read model as the rest
-- of Forge.

-- 1. Departments for the workforce ------------------------------------------

insert into public.departments (name, slug)
values
  ('Research', 'research'),
  ('Production', 'production'),
  ('Strategy', 'strategy'),
  ('Finance', 'finance'),
  ('Analytics', 'analytics'),
  ('Marketing', 'marketing'),
  ('Community', 'community')
on conflict (slug) do nothing;

-- 2. The named agents -------------------------------------------------------
--
-- Instructions are ported from the reference build's agent prompts with the
-- desktop-only directives removed: no local filesystem access, no local vault,
-- no shell, no native launchers.

insert into public.agents (department_id, name, slug, description, instructions, delegation_enabled)
select d.id, x.name, x.slug, x.description, x.instructions, x.delegation_enabled
from (
  values
    (
      'administration',
      'JARVIS',
      'jarvis',
      'Coordinating agent. Owns mission-level coordination, team assembly, and operator communication.',
      'You are JARVIS, the coordinating agent of this workspace''s AI workforce. You own mission-level coordination: read the brief, decompose it into work, assign that work to the right agents, keep the operator informed in short plain lines, and assemble the final result from what the workers actually produced. You do not perform external actions yourself. Anything that mutates an external service is staged for the operator to confirm, and you never claim an action happened without a service receipt. Report blockers honestly and stop rather than inventing progress.',
      true
    ),
    (
      'research',
      'SCOUT',
      'scout',
      'Reconnaissance agent. Researches landscape, facts, numbers, sources, and constraints.',
      'You are SCOUT, the reconnaissance agent of the user''s AI fleet. Research the mission brief now using your own knowledge plus any READ-ONLY connected tools available to you. You have no access to local notes or files, so work from knowledge and live tool results only. Your final message is a tight markdown recon memo: the landscape, hard facts and numbers, opportunities, and risks. No preamble, no questions back.',
      false
    ),
    (
      'production',
      'FORGE',
      'forge',
      'Maker agent. Produces drafts, artifacts, and working deliverables.',
      'You are FORGE, the maker agent of the user''s AI fleet. Draft the actual deliverable the brief calls for - a plan, script, page copy, outline, implementation outline, or artifact - as polished markdown. You cannot write files: your final message IS the artifact, so make it complete and ready to use. No preamble, no questions back.',
      false
    ),
    (
      'strategy',
      'SAGE',
      'sage',
      'Strategist and critic. Stress-tests work and recommends next actions.',
      'You are SAGE, the strategist agent of the user''s AI fleet. Stress-test the mission as a sharp, honest advisor: the strongest objections, what most people get wrong, and the risks worth respecting. Close with the five highest-leverage NEXT ACTIONS as a numbered list. Markdown, no preamble.',
      false
    ),
    (
      'finance',
      'REAPER',
      'reaper',
      'Subscription audit agent. Read-first ledger, then gated cancellation drafting.',
      'You are the SUBSCRIPTION REAPER, hunting recurring charges for the user. Using ONLY read-only tools, sweep roughly the last twelve months of connected records for receipts, renewals, invoices, and subscription charges. Dedupe by service; for annual plans set amount_monthly to the annual price divided by twelve and say so in the note. You are STRICTLY READ ONLY: never send, reply, archive, or change anything, and never draft during the audit. Your final message is only a JSON block with subs (name, amount_monthly, cadence, last_seen, note) and total_monthly. Cancellation drafts happen later, only after the operator confirms, one confirmed service at a time.',
      false
    ),
    (
      'analytics',
      'WARROOM',
      'warroom',
      'Analytics agent. Builds status and performance reporting.',
      'You are the CHANNEL WAR ROOM analyst. Using connected read-only analytics tools, build a status report on the user''s latest work and overall momentum: recent performance, how it compares with the median, audience or subscriber totals, watch or engagement hours, the most recent items with their numbers, and the most notable recent comments. READ ONLY: post nothing, reply to nothing. Your final message is only a JSON block with headline, stats, videos, comments, and a short spoken-read summary.',
      false
    ),
    (
      'marketing',
      'HERALD',
      'herald',
      'Content drafting agent. Prepares per-channel announcements for approval.',
      'You are HERALD, the social-media drafting agent. Draft one post per requested platform announcing the brief. Write only in the workspace brand voice. Rules: the money or outcome angle comes first in every post, plain high-energy language beats polished corporate, the reader is the protagonist, keep hashtags minimal (at most five, and only where the platform expects them), and use only the call-to-action the operator configured. During drafting you do not use any tool and nothing is posted. Your final message is only a JSON block with posts (platform, text). Publication happens later, only after the operator approves, and only from the exact approved text.',
      false
    ),
    (
      'community',
      'HATERS',
      'haters',
      'Community agent. Reads audience comments and drafts (or posts, when approved) replies.',
      'You are the comment concierge for the user''s audience. Using connected read-only tools, pull the most notable recent comments - the spiciest criticism, the warmest praise, and the best questions, up to eight. For each, draft a reply in the creator''s voice: witty but warm, never punching down, confident, genuinely helpful with questions, one to three sentences. Include the exact comment_id and video_id from tool results and never invent identifiers. During the read pass you post nothing. Your final message is only a JSON block with items (author, comment, comment_id, video_id, likes, reply) and a short spoken-read summary. Replies are submitted only after the operator approves the specific ones, and you never claim a reply was published without a service receipt.',
      false
    )
) as x(department_slug, name, slug, description, instructions, delegation_enabled)
join public.departments d on d.slug = x.department_slug
on conflict (slug) do update
  set name = excluded.name,
      description = excluded.description,
      instructions = excluded.instructions,
      delegation_enabled = excluded.delegation_enabled,
      department_id = excluded.department_id;

-- Capability grants. A capability is only usable at or below the level granted
-- here, and only when the requesting member holds it too.
insert into public.agent_capabilities (agent_id, capability, max_action_level)
select a.id, x.capability, x.max_action_level
from public.agents a
join (
  values
    ('jarvis', 'workspace.read', 'read'),
    ('jarvis', 'mission.coordinate', 'read'),
    ('scout', 'research.read', 'read'),
    ('forge', 'artifact.draft', 'draft'),
    ('sage', 'artifact.review', 'read'),
    ('reaper', 'subscriptions.read', 'read'),
    ('reaper', 'email.draft', 'draft'),
    ('warroom', 'analytics.read', 'read'),
    ('herald', 'social.draft', 'draft'),
    ('haters', 'comments.read', 'read'),
    ('haters', 'comments.reply', 'execute')
) as x(slug, capability, max_action_level) on a.slug = x.slug
on conflict (agent_id, capability) do update
  set max_action_level = excluded.max_action_level;

-- 3. The fleet ---------------------------------------------------------------

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

comment on table public.fleets is
  'A coordinated team of agents used for a mission. Hermes performs the delegation; Forge records the team, the missions it works, and the resulting child runs.';
comment on column public.fleet_members.role is
  'The part this agent plays in the team: recon, maker, critic, and so on.';

alter table public.fleets enable row level security;
alter table public.fleet_members enable row level security;

drop policy if exists "fleets_read_authenticated" on public.fleets;
create policy "fleets_read_authenticated"
on public.fleets for select
to authenticated
using (true);

drop policy if exists "fleet_members_read_authenticated" on public.fleet_members;
create policy "fleet_members_read_authenticated"
on public.fleet_members for select
to authenticated
using (true);

create index if not exists fleets_lead_agent_id_idx
  on public.fleets (lead_agent_id);
create index if not exists fleet_members_agent_id_idx
  on public.fleet_members (agent_id);

grant select on public.fleets to authenticated;
grant select on public.fleet_members to authenticated;
revoke all on public.fleets from anon;
revoke all on public.fleet_members from anon;

insert into public.fleets (name, slug, description, lead_agent_id)
select 'The Fleet', 'the-fleet',
       'A coordinated three-agent team: recon, the draft, and the critique.',
       (select id from public.agents where slug = 'jarvis')
on conflict (slug) do update
  set description = excluded.description,
      lead_agent_id = excluded.lead_agent_id;

insert into public.fleet_members (fleet_id, agent_id, role, position)
select f.id, a.id, x.role, x.position
from public.fleets f
join (
  values
    ('scout', 'recon', 1),
    ('forge', 'maker', 2),
    ('sage', 'critic', 3)
) as x(slug, role, position) on true
join public.agents a on a.slug = x.slug
where f.slug = 'the-fleet'
on conflict (fleet_id, agent_id) do update
  set role = excluded.role, position = excluded.position;

-- 4. Mission kinds, teams, and results ---------------------------------------

alter table public.tasks
  add column if not exists kind text not null default 'general',
  add column if not exists icon text,
  add column if not exists fleet_id uuid references public.fleets(id) on delete set null,
  add column if not exists result jsonb not null default '{}'::jsonb;

comment on column public.tasks.kind is
  'Mission kind from the Forge mission catalog: fleet, buildapp, reaper, warroom, announce, haters, general.';
comment on column public.tasks.result is
  'Final mission result, shaped by kind. Sanitized before it is stored; never contains credentials.';
comment on column public.tasks.fleet_id is
  'The team assigned to this mission, when it runs as a coordinated fleet.';

create index if not exists tasks_fleet_id_idx
  on public.tasks (fleet_id);
create index if not exists tasks_kind_idx
  on public.tasks (kind);

-- 5. Receipt confidence ------------------------------------------------------
--
-- "accepted" means a tool call returned without error. "confirmed" means the
-- provider returned a durable reference. Nothing in the UI may claim more than
-- the receipt supports.

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

comment on column public.action_receipts.confirmation is
  'accepted: the provider call returned without error. confirmed: the provider returned a durable reference. failed: the call failed.';
