-- ============================================================================
-- MK Connect — 0295: Loonars Connect, one cleaning task per dirty unit
--
-- Bug in 0291 mkc_hosp_sync_room_tasks(): it created a room task (and a chat
-- card) for EVERY pending 'bersih' housekeeping row of a dirty unit. The villa
-- app only closes the latest row when a room is cleaned and leaves older ones
-- pending, so a unit with stale rows got one card per stale row (B2 showed 4,
-- A4 6). Now: at most one open task per unit, tied to its latest pending row.
-- Existing duplicates are cancelled as data (not in this migration).
-- ============================================================================

create or replace function public.mkc_hosp_sync_room_tasks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dept record;
  v_row record;
  v_task_id uuid;
  v_group uuid;
  v_changed integer := 0;
  v_today date;
  v_cleaners uuid[];
begin
  for v_dept in select * from public.mkc_chat_departments where code = 'hospitality' and is_active loop
    v_group := public.mkc_hosp_group_id(v_dept.id);
    v_today := public.mkc_hosp_local_date(v_dept.id);

    -- 1. New: ONE task per dirty unit, for its latest pending 'bersih'
    --    housekeeping row (the one the villa app closes when the room is
    --    cleaned). The villa app leaves older 'bersih' rows pending forever,
    --    so 0291's one-task-per-row created a card for every stale row.
    for v_row in
      select distinct on (h.unit_id) h.id as hk_id, h.unit_id, coalesce(h.unit_nomor, u.nomor) as unit_nomor, h.created_at
      from public.housekeeping h
      join public.units u on u.id = h.unit_id
      where h.status = 'pending' and h.jenis = 'bersih' and h.tgl <= v_today and u.status = 'dirty'
        and not exists (select 1 from public.mkc_hosp_room_tasks t
                        where t.unit_id = h.unit_id and t.status not in ('completed', 'cancelled'))
      order by h.unit_id, h.created_at desc
    loop
      insert into public.mkc_hosp_room_tasks (department_id, housekeeping_id, unit_id, unit_nomor, target_at)
      values (v_dept.id, v_row.hk_id, v_row.unit_id, v_row.unit_nomor,
              now() + make_interval(mins => coalesce((v_dept.settings ->> 'cleaning_target_minutes')::integer, 180)))
      on conflict (housekeeping_id) do nothing
      returning id into v_task_id;
      if v_task_id is not null then
        v_changed := v_changed + 1;
        perform public.mkc_chat_post(v_group, 'task', format('🧹 Unit %s perlu dibersihkan (setelah check-out)', v_row.unit_nomor),
          'room_task', v_task_id, jsonb_build_object('unit_nomor', v_row.unit_nomor, 'status', 'pending'),
          'task_created:' || v_task_id);
        v_cleaners := public.mkc_hosp_members_with_role(v_dept.id, array['cleaning']);
        perform public.mkc_hosp_notify(v_cleaners, format('Unit %s perlu dibersihkan', v_row.unit_nomor),
          'Tugas kebersihan baru di grup Hospitality Loonars', '/chat?c=' || v_group, 'hospitality_task',
          jsonb_build_object('room_task_id', v_task_id));
      end if;
    end loop;

    -- 2. Closed in the villa Front Desk (housekeeping done) without FO
    --    inspection here: close, but say so.
    for v_row in
      select t.id, t.unit_nomor from public.mkc_hosp_room_tasks t
      join public.housekeeping h on h.id = t.housekeeping_id
      where t.department_id = v_dept.id and t.status not in ('completed', 'cancelled') and h.status = 'done'
    loop
      update public.mkc_hosp_room_tasks
         set status = 'completed', completed_at = now(), completion_source = 'villa_app', conflict_note = null
       where id = v_row.id;
      v_changed := v_changed + 1;
      perform public.mkc_chat_post(v_group, 'system',
        format('⚠️ Unit %s ditandai bersih di Front Desk villa tanpa pemeriksaan FO di sini', v_row.unit_nomor),
        'room_task', v_row.id, jsonb_build_object('completion_source', 'villa_app'), 'task_closed_villa:' || v_row.id);
    end loop;

    -- 3. Open tasks whose villa records no longer line up: flag (and clear
    --    the flag once they line up again), never guess a resolution.
    update public.mkc_hosp_room_tasks t
       set conflict_note = c.note
      from (
        select t2.id,
               case
                 when t2.housekeeping_id is null then 'Tugas housekeeping villa sudah dihapus'
                 when u.id is null then 'Unit tidak ditemukan di sistem villa'
                 when u.status <> 'dirty' then format('Status unit di sistem villa sekarang "%s", bukan "dirty"', u.status)
               end as note
        from public.mkc_hosp_room_tasks t2
        left join public.units u on u.id = t2.unit_id
        where t2.department_id = v_dept.id and t2.status not in ('completed', 'cancelled')
      ) c
     where c.id = t.id and t.conflict_note is distinct from c.note;
  end loop;
  return v_changed;
end;
$$;
