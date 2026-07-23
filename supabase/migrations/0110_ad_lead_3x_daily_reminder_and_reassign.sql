-- ============================================================================
-- MK Connect — 0110: Cap ad-lead reminders at 3x/day, let Kepala Cabang
-- reassign a stuck lead to another Sales via WhatsApp reply
--
-- Previously Sales got an hourly nag for every unfollowed ad lead. Per
-- owner's request: only remind 3x a day (roughly every ~6-8 working hours);
-- once all 3 reminders have gone out and the lead is still not followed up,
-- escalate to Kepala Cabang immediately (instead of a fixed 12h timer) and
-- tell them exactly what to reply to reassign the lead to another Sales in
-- their branch. The 24h Direktur Operasional escalation stays as the final
-- safety net if Kepala Cabang doesn't act either.
-- ============================================================================

create or replace function public.crm_pick_round_robin_sales_excluding(p_branch_id uuid, p_exclude_sales_id uuid)
returns uuid
language sql
stable security definer
set search_path = public
as $$
  select e.id
  from public.employees e
  join public.roles r on r.id = e.role_id
  where e.branch_id = p_branch_id
    and r.key = 'sales'
    and e.deleted_at is null
    and e.employment_status = 'active'
    and e.id <> p_exclude_sales_id
  order by (
    select max(p.created_at) from public.prospects p
    where p.sales_id = e.id and p.lead_source = 'facebook_ads' and p.deleted_at is null
  ) asc nulls first
  limit 1;
$$;

create or replace function public.crm_run_ad_lead_monitoring()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead record;
  v_hours_since_created numeric;
  v_reminder_count int;
  v_reminder_offsets int[] := array[2, 8, 16];
  v_next_offset int;
  v_manager record;
  v_dirops record;
begin
  for v_lead in
    select
      p.id, p.customer_name, p.phone, p.phone_normalized, p.sales_id, p.branch_id, p.created_at, p.last_reminder_sent_at,
      e.full_name as sales_name, b.name as branch_name
    from public.prospects p
    join public.employees e on e.id = p.sales_id
    join public.branches b on b.id = p.branch_id
    where p.lead_source = 'facebook_ads'
      and p.created_by is null
      and p.deleted_at is null
      and p.status not in ('closing', 'inactive')
      and p.last_follow_up_at is null
      and p.created_at >= '2026-07-17T04:47:44Z'::timestamptz
  loop
    v_hours_since_created := extract(epoch from (now() - v_lead.created_at)) / 3600;

    v_reminder_count := (
      select count(*) from public.mkc_notifications
      where category = 'ad_lead_followup_reminder' and (metadata ->> 'prospect_id') = v_lead.id::text
    );

    if v_reminder_count < 3 then
      v_next_offset := v_reminder_offsets[v_reminder_count + 1];
      if v_hours_since_created >= v_next_offset
         and (v_lead.last_reminder_sent_at is null or now() - v_lead.last_reminder_sent_at >= interval '30 minutes')
      then
        insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
        values (
          v_lead.sales_id, 'crm', 'ad_lead_followup_reminder',
          'Lead dari iklan belum di-follow up (pengingat ' || (v_reminder_count + 1) || '/3)',
          'Anda memiliki lead dari iklan (' || coalesce(v_lead.customer_name, 'Tidak diketahui') || ', ' || v_lead.phone
            || ') yang belum di-follow up. Kalau sudah dihubungi, cukup balas pesan ini dan sebutkan 4 digit terakhir nomornya ('
            || right(coalesce(v_lead.phone_normalized, ''), 4) || ') -- misalnya "sudah ' || right(coalesce(v_lead.phone_normalized, ''), 4)
            || '". Atau input manual di Menu Prospek.'
            || case when v_reminder_count + 1 >= 3 then ' Ini pengingat terakhir -- jika belum di-follow up juga, lead ini akan dilaporkan ke Kepala Cabang.' else '' end,
          '/crm/' || v_lead.id,
          jsonb_build_object('prospect_id', v_lead.id, 'kind', 'sales_reminder')
        );
        update public.prospects set last_reminder_sent_at = now() where id = v_lead.id;
        v_reminder_count := v_reminder_count + 1;
      end if;
    end if;

    if v_reminder_count >= 3 and not exists (
      select 1 from public.mkc_notifications
      where category = 'ad_lead_escalation_branch' and (metadata ->> 'prospect_id') = v_lead.id::text
    ) then
      for v_manager in
        select em.id from public.employees em
        join public.roles r on r.id = em.role_id
        where em.branch_id = v_lead.branch_id and em.deleted_at is null and em.employment_status = 'active' and r.key = 'kepala_cabang'
      loop
        insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
        values (
          v_manager.id, 'crm', 'ad_lead_escalation_branch',
          'Lead belum ditindaklanjuti setelah 3x diingatkan',
          'MK Connect telah mengingatkan Sales ' || v_lead.sales_name || ' 3x tentang lead dari iklan ('
            || coalesce(v_lead.customer_name, '-') || ', ' || v_lead.phone || '), namun hingga saat ini belum ada follow up. '
            || 'Jika Anda ingin mengalihkan lead ini ke Sales lain di cabang Anda, balas pesan ini dengan "LEMPAR '
            || right(coalesce(v_lead.phone_normalized, ''), 4) || '" -- sistem akan otomatis memindahkan lead ini ke Sales lain secara adil (round robin) dan memberi tahu mereka.',
          '/crm/' || v_lead.id,
          jsonb_build_object('prospect_id', v_lead.id, 'kind', 'branch_escalation')
        );
      end loop;
    end if;

    if v_hours_since_created >= 24 and not exists (
      select 1 from public.mkc_notifications
      where category = 'ad_lead_escalation_director' and (metadata ->> 'prospect_id') = v_lead.id::text
    ) then
      for v_dirops in
        select em.id from public.employees em
        join public.roles r on r.id = em.role_id
        where em.deleted_at is null and em.employment_status = 'active' and r.key = 'direktur_operasional'
      loop
        insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
        values (
          v_dirops.id, 'crm', 'ad_lead_escalation_director',
          'Lead belum ditindaklanjuti 24+ jam',
          'Lead dari iklan untuk cabang ' || v_lead.branch_name || ' (Sales: ' || v_lead.sales_name || ', '
            || coalesce(v_lead.customer_name, '-') || ', ' || v_lead.phone || ') masih belum di-follow up setelah 24 jam. Mohon perhatian.',
          '/crm/' || v_lead.id,
          jsonb_build_object('prospect_id', v_lead.id, 'kind', 'director_escalation')
        );
      end loop;
    end if;
  end loop;
end;
$$;
