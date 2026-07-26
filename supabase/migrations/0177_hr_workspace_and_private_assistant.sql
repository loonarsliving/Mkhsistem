-- ============================================================================
-- MK Connect — 0177: HR control room + Private Assistant role
--
-- Two people start tomorrow: an HRD and a private assistant to the Super
-- Admin. Both need a landing page that reflects their actual job, and one
-- of them needs a role that does not exist yet.
--
-- Fixes a real permission gap found while scoping this: the `hr` role could
-- create and manage employees, run payroll, and issue SP1 warnings -- but
-- had neither registration.view_all nor registration.manage. Approving a new
-- hire, the most basic HR task there is, was reserved for Direktur
-- Operasional and Kepala Cabang. An HR account literally could not admit
-- anyone into the company.
--
-- The private_assistant role is deliberately visibility-only. Every
-- permission granted below is a *_view / *_view_all; there is no manage,
-- approve, verify, create, or send anywhere in the list. The assistant
-- chases and prepares, the principal decides -- if the assistant could
-- approve, the audit trail would record decisions under a principal who
-- never saw them, and every approval in the system would stop being
-- evidence of anything.
--
-- payroll.view is new for the same reason: the owner wants the assistant to
-- see salary figures, but payroll.manage was the only payroll permission
-- there was, so "see the numbers" and "approve the money" could not be
-- separated. Now they can.
-- ============================================================================

insert into public.permissions (key, description) values
  ('hr_workspace.view', 'View the HR control room (action queue, live attendance, compliance)'),
  ('assistant_workspace.view', 'View the private assistant workspace'),
  ('assistant_followup.manage', 'Create and complete personal follow-up items in the assistant workspace'),
  ('payroll.view', 'View payroll runs and salary figures without the authority to approve a run')
on conflict (key) do nothing;

insert into public.roles (key, name, level, description, is_system) values
  ('private_assistant', 'Asisten Pribadi', 12, 'Private assistant to the Super Admin — company-wide visibility, no approval authority', true)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- hr: the registration gap above, plus the new workspace and payroll read.
-- ----------------------------------------------------------------------------
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'registration.view_all', 'registration.manage',
  'hr_workspace.view',
  'payroll.view'
) where r.key = 'hr'
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- Anyone who may already approve payroll should also be able to read it.
-- ----------------------------------------------------------------------------
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key = 'payroll.view'
where r.key in ('super_admin', 'direktur_operasional', 'finance')
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- super_admin holds every permission by definition.
-- ----------------------------------------------------------------------------
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'hr_workspace.view', 'assistant_workspace.view', 'assistant_followup.manage'
) where r.key = 'super_admin'
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- private_assistant: read-everything, decide-nothing.
--
-- memo.create / announcement.create are deliberately absent even though
-- "drafting on the principal's behalf" is part of the job: memos publish the
-- instant they are created (memos.published_at defaults to now(), there is
-- no draft state), so granting memo.create today would be granting a
-- company-wide publish right, not a drafting one. Adding a real draft state
-- is the prerequisite.
-- ----------------------------------------------------------------------------
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view',
  'assistant_workspace.view', 'assistant_followup.manage',
  'attendance.view_all', 'attendance.export',
  'memo.view', 'announcement.view',
  'employee.view_all',
  'registration.view_all',
  'prospect.view_all',
  'sales_target.view_all',
  'crm_analytics.view_all', 'crm_analytics.view_executive',
  'kpi_task.view_all',
  'sp1_warning.view_all',
  'ad_campaign.view',
  'content_planner.view',
  'promo_template.view',
  'loonars_beauty.view',
  'kos_occupancy.view',
  'payroll.view',
  'system.monitoring_view'
) where r.key = 'private_assistant'
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- assistant_followups: the assistant's own chase list -- the one thing on
-- their page that isn't derived from data the system already holds.
--
-- Scoped per owner rather than global: this is a personal working list, not
-- a shared task board. `assigned_to` records who the assistant is chasing,
-- as free text, because the person being chased is frequently outside the
-- employees table (a vendor, a notary, a bank).
-- ----------------------------------------------------------------------------
create table if not exists public.assistant_followups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.employees(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  notes text,
  assigned_to text,
  due_date date,
  status text not null default 'open' check (status in ('open', 'done')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assistant_followups_owner_status_idx
  on public.assistant_followups (owner_id, status, due_date);

alter table public.assistant_followups enable row level security;

drop policy if exists assistant_followups_select_own on public.assistant_followups;
create policy assistant_followups_select_own on public.assistant_followups
  for select using (owner_id = auth.uid());

drop policy if exists assistant_followups_insert_own on public.assistant_followups;
create policy assistant_followups_insert_own on public.assistant_followups
  for insert with check (owner_id = auth.uid() and public.app_has_permission('assistant_followup.manage'));

drop policy if exists assistant_followups_update_own on public.assistant_followups;
create policy assistant_followups_update_own on public.assistant_followups
  for update using (owner_id = auth.uid() and public.app_has_permission('assistant_followup.manage'));

drop policy if exists assistant_followups_delete_own on public.assistant_followups;
create policy assistant_followups_delete_own on public.assistant_followups
  for delete using (owner_id = auth.uid() and public.app_has_permission('assistant_followup.manage'));

drop trigger if exists assistant_followups_set_updated_at on public.assistant_followups;
create trigger assistant_followups_set_updated_at
  before update on public.assistant_followups
  for each row execute function public.set_updated_at();

comment on table public.assistant_followups is
  'Private assistant''s personal chase list. Per-owner via RLS (owner_id = auth.uid()) -- a working list, not a shared task board.';
