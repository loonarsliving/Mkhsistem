-- ============================================================================
-- MK Connect — 0123: Real content_focus column on kpi_tasks
--
-- The Content Planner's 3-tab restructure (Leasehold / Occupancy / Beauty)
-- needs to reliably tell which product a checklist item belongs to.
-- Previously this was only encoded as a human-readable marker string buried
-- inside kpi_tasks.description (CHECKLIST_AI_MARKER, process-job/route.ts)
-- -- fine for a person reading the task, useless for a UI filter/tab. This
-- adds a real column so the planner page can query by focus directly.
--
-- 'general' is the default/catch-all for the many kpi_tasks rows that
-- aren't about Instagram/TikTok content at all (a Branch Manager can assign
-- any team task through kpi_assign_tasks, e.g. "Rapat mingguan") -- those
-- correctly stay off the Content Planner's 3 tabs and keep showing,
-- undifferentiated, on /markom's own checklist/review pages.
-- ============================================================================

alter table public.kpi_tasks
  add column content_focus text not null default 'general'
    check (content_focus in ('leasehold_sales', 'occupancy', 'general'));

-- Backfill existing AI-generated rows from their description marker so
-- history already dispatched under 0121 lands in the right tab too.
update public.kpi_tasks
set content_focus = 'leasehold_sales'
where description ilike '%fokus PENJUALAN LEASEHOLD%';

update public.kpi_tasks
set content_focus = 'occupancy'
where description ilike '%fokus OCCUPANCY/booking tamu%';

-- kpi_assign_tasks: Branch Manager's manual checklist form now lets each
-- item optionally be tagged leasehold_sales/occupancy so hand-written
-- content tasks also surface in the right Content Planner tab, not just
-- AI-drafted ones. Unrecognized/omitted values fall back to 'general',
-- same as the column default.
create or replace function public.kpi_assign_tasks(
  p_branch_id uuid,
  p_period_year smallint,
  p_period_month smallint,
  p_period_week smallint,
  p_items jsonb,
  p_division_id uuid default null
)
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_division_id uuid := coalesce(p_division_id, (select id from public.divisions where name = 'Marketing & Komunikasi'));
  v_item jsonb;
  v_task_id uuid;
  v_member record;
  v_content_focus text;
begin
  if not public.app_has_permission('kpi_task.assign') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  if not (public.app_has_permission('kpi_task.view_all') or p_branch_id = public.app_current_branch_id()) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  if not exists (select 1 from public.branches where id = p_branch_id) then
    raise exception 'Branch not found';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one checklist item is required';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if coalesce(trim(v_item->>'title'), '') = '' then
      raise exception 'Every checklist item needs a title';
    end if;

    v_content_focus := case
      when v_item->>'content_focus' in ('leasehold_sales', 'occupancy') then v_item->>'content_focus'
      else 'general'
    end;

    insert into public.kpi_tasks (
      division_id, branch_id, title, description,
      period_year, period_month, period_week, due_date, content_focus, created_by, updated_by
    ) values (
      v_division_id, p_branch_id,
      v_item->>'title', nullif(v_item->>'description', ''),
      p_period_year, p_period_month, p_period_week,
      nullif(v_item->>'due_date', '')::date,
      v_content_focus,
      v_user_id, v_user_id
    )
    returning id into v_task_id;

    return next v_task_id;
  end loop;

  for v_member in
    select e.id from public.employees e
    where e.branch_id = p_branch_id and e.division_id = v_division_id
      and e.deleted_at is null and e.employment_status = 'active'
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link)
    values (
      v_member.id,
      'kpi_task',
      'markom_new_task',
      'Checklist minggu baru untuk tim',
      jsonb_array_length(p_items) || ' task baru untuk Minggu ' || p_period_week || ' ditambahkan ke checklist tim Anda.',
      '/markom'
    );
  end loop;

  return;
end;
$$;
