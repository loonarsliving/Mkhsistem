-- ============================================================================
-- MK Connect — 0298: Loonars Connect, cross-team group "Koordinasi Jogja"
--
-- Owner's request (2026-10-24): the chat should also be where the teams talk
-- to each other. Owner's choices: ONE combined group for Jogja (Hospitality,
-- Markom Jogja, Sales Jogja), and the owner is a member.
--
-- A coordination department has no workflow, no owner feed and no report --
-- just the group (text, photos, WhatsApp-style push from 0297). Its members
-- are derived, not maintained by hand: settings.member_of lists the source
-- departments, and everyone who is a member of one of their operational
-- groups is a 'member' here; settings.include_owners adds the owners
-- (hospitality.owner_report). Someone joining or leaving Markom / Sales /
-- Hospitality joins or leaves Koordinasi Jogja on the same membership sync.
-- Derived rows are computed from the source departments' own desired members
-- (assignments + division mappings), not from the live member table, so one
-- sync pass is enough and there is no recursion.
-- ============================================================================

alter table public.mkc_chat_division_roles drop constraint mkc_chat_division_roles_member_role_check;
alter table public.mkc_chat_division_roles add constraint mkc_chat_division_roles_member_role_check
  check (member_role in ('manager', 'front_office', 'cleaning', 'security', 'markom', 'sales', 'room_approver', 'member'));
alter table public.mkc_chat_role_assignments drop constraint mkc_chat_role_assignments_member_role_check;
alter table public.mkc_chat_role_assignments add constraint mkc_chat_role_assignments_member_role_check
  check (member_role in ('manager', 'front_office', 'cleaning', 'security', 'markom', 'sales', 'room_approver', 'member'));
alter table public.mkc_chat_members drop constraint mkc_chat_members_member_role_check;
alter table public.mkc_chat_members add constraint mkc_chat_members_member_role_check
  check (member_role in ('manager', 'front_office', 'cleaning', 'security', 'markom', 'sales', 'room_approver', 'member'));
alter table public.mkc_chat_members drop constraint mkc_chat_members_source_check;
alter table public.mkc_chat_members add constraint mkc_chat_members_source_check
  check (source in ('division', 'assignment', 'department', 'owner'));

create or replace function public.mkc_chat_desired_members()
returns table (conversation_id uuid, employee_id uuid, member_role text, source text)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    -- explicit assignments + branch-scoped division mappings (0291 / 0294)
    select c.id as conversation_id, d.code as department_code, x.employee_id, x.member_role, x.source, x.prio
    from public.mkc_chat_conversations c
    join public.mkc_chat_departments d on d.id = c.department_id and d.is_active
    join lateral (
      select a.employee_id, a.member_role, 'assignment'::text as source, 0 as prio
      from public.mkc_chat_role_assignments a
      where a.department_id = d.id and a.revoked_at is null
      union all
      select e.id, dr.member_role, 'division', 1
      from public.mkc_chat_division_roles dr
      join public.employees e on e.division_id = dr.division_id
      where dr.department_id = d.id
        and (dr.branch_id is null or e.branch_id = dr.branch_id)
    ) x on public.mkc_chat_employee_eligible(x.employee_id)
    where c.kind = 'operational_group'
  ),
  coordination as (
    select c.id as conversation_id, d.settings
    from public.mkc_chat_departments d
    join public.mkc_chat_conversations c on c.department_id = d.id and c.kind = 'operational_group'
    where d.is_active
      and (jsonb_typeof(d.settings -> 'member_of') = 'array' or coalesce((d.settings ->> 'include_owners')::boolean, false))
  ),
  derived as (
    -- (0298) members of the source departments' groups
    select k.conversation_id, b.employee_id, 'member'::text as member_role, 'department'::text as source, 2 as prio
    from coordination k
    join base b on jsonb_typeof(k.settings -> 'member_of') = 'array'
               and b.department_code in (select jsonb_array_elements_text(k.settings -> 'member_of'))
    union all
    -- (0298) the owners
    select k.conversation_id, o, 'member', 'owner', 3
    from coordination k
    cross join lateral unnest(public.mkc_hosp_owner_ids()) as o
    where coalesce((k.settings ->> 'include_owners')::boolean, false)
  )
  select distinct on (r.conversation_id, r.employee_id) r.conversation_id, r.employee_id, r.member_role, r.source
  from (
    select b.conversation_id, b.employee_id, b.member_role, b.source, b.prio from base b
    union all
    select * from derived
  ) r
  order by r.conversation_id, r.employee_id, r.prio
$$;

insert into public.mkc_chat_departments (code, name, branch_id, timezone, settings)
select 'koordinasi_jogja', 'Koordinasi Jogja', b.id, 'Asia/Jakarta', jsonb_build_object(
  'member_of', jsonb_build_array('hospitality', 'markom_jogja', 'sales_jogja'),
  'include_owners', true,
  'retention_days', 30,
  'max_retention_hold_days', 180
)
from public.branches b where b.code = 'JOG'
on conflict (code) do nothing;

insert into public.mkc_chat_conversations (department_id, kind, name, description)
select d.id, 'operational_group', 'Koordinasi Jogja', 'Koordinasi lintas tim: Hospitality, Markom, Sales Jogja dan owner'
from public.mkc_chat_departments d where d.code = 'koordinasi_jogja'
on conflict (department_id, kind) do nothing;

select public.mkc_chat_sync_members();
