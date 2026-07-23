-- ============================================================================
-- MK Connect — 0107: Ad-lead reminder includes a reply code
--
-- Sales can now clear the hourly "belum di-follow up" reminder by simply
-- replying "SUDAH <4 digit terakhir nomor pelanggan>" on WhatsApp instead of
-- opening Menu Prospek -- see tryConfirmAdLeadFollowUp,
-- lib/ai/domains/ad-lead-routing.ts, wired into the webhook handler. This
-- migration only changes the reminder message text to tell Sales the code.
-- ============================================================================

create or replace function public.crm_run_ad_lead_monitoring()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead record;
  v_hours_since_created numeric;
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
      and p.deleted_at is null
      and p.status not in ('closing', 'inactive')
      and p.last_follow_up_at is null
      and p.created_at >= '2026-07-17T04:47:44Z'::timestamptz
  loop
    v_hours_since_created := extract(epoch from (now() - v_lead.created_at)) / 3600;

    if v_hours_since_created >= 1
       and (v_lead.last_reminder_sent_at is null or now() - v_lead.last_reminder_sent_at >= interval '1 hour')
    then
      insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
      values (
        v_lead.sales_id, 'crm', 'ad_lead_followup_reminder',
        'Lead dari iklan belum di-follow up',
        'Anda memiliki lead dari iklan (' || coalesce(v_lead.customer_name, 'Tidak diketahui') || ', ' || v_lead.phone
          || ') yang belum di-follow up. Balas *SUDAH ' || right(coalesce(v_lead.phone_normalized, ''), 4)
          || '* di sini kalau sudah dihubungi, atau input manual di Menu Prospek.',
        '/crm/' || v_lead.id,
        jsonb_build_object('prospect_id', v_lead.id, 'kind', 'sales_reminder')
      );
      update public.prospects set last_reminder_sent_at = now() where id = v_lead.id;
    end if;

    if v_hours_since_created >= 12 and not exists (
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
          'Lead belum ditindaklanjuti 12+ jam',
          'MK Connect telah memberikan lead kepada Sales ' || v_lead.sales_name || ' (' || coalesce(v_lead.customer_name, 'lead dari iklan')
            || ', ' || v_lead.phone || '), namun hingga saat ini belum ada follow up. Mohon dilakukan pengecekan.',
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
