-- ============================================================================
-- MK Connect — 0120: Automatic sales-conduct monitoring, Kepala Cabang
-- decides on bulk reassignment
--
-- Owner asked to repeat the manual "tegur sales tidak responsif + alihkan
-- leadnya" action (done for Ayu/Jogja) automatically going forward -- but
-- with the reassignment decision left to Kepala Cabang, not auto-executed.
--
-- crm_run_sales_conduct_monitoring() (hourly): flags any active sales rep
-- with 5+ ad leads that have sat completely unfollowed (last_follow_up_at
-- null) for 2+ hours -- a pattern of neglect, not just one slow lead
-- (crm_run_ad_lead_monitoring, 0119, already covers the single-lead 30min
-- case). Sends the sales rep a firm warning AND their Kepala Cabang a full
-- list of the stuck leads (name + phone) with an explicit choice: reply
-- "LEMPAR SEMUA <nama sales>" to reassign everything round-robin, or do
-- nothing. Deduped 24h per sales rep so it doesn't repeat every hour.
-- ============================================================================

create or replace function public.crm_run_sales_conduct_monitoring()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sales record;
  v_lead record;
  v_lead_list text;
  v_manager record;
begin
  for v_sales in
    select p.sales_id, e.full_name as sales_name, e.branch_id, b.name as branch_name, count(*) as unfollowed_count
    from public.prospects p
    join public.employees e on e.id = p.sales_id
    join public.branches b on b.id = e.branch_id
    where p.lead_source = 'facebook_ads'
      and p.created_by is null
      and p.deleted_at is null
      and p.status not in ('closing', 'inactive')
      and p.last_follow_up_at is null
      and p.created_at <= now() - interval '2 hours'
      and e.deleted_at is null and e.employment_status = 'active'
    group by p.sales_id, e.full_name, e.branch_id, b.name
    having count(*) >= 5
  loop
    if exists (
      select 1 from public.mkc_notifications
      where category = 'sales_conduct_warning' and user_id = v_sales.sales_id and created_at >= now() - interval '24 hours'
    ) then
      continue;
    end if;

    insert into public.mkc_notifications (user_id, type, category, title, body, link)
    values (
      v_sales.sales_id, 'crm', 'sales_conduct_warning',
      '⚠️ TEGURAN: Lead Tidak Di-follow Up',
      'Anda memiliki ' || v_sales.unfollowed_count || ' lead dari iklan yang belum di-follow up sama sekali (sudah lebih dari 2 jam sejak masuk). Ini pelanggaran kewajiban follow-up yang wajib dilakukan setiap sales. Segera hubungi Kepala Cabang Anda -- lead-lead ini berisiko dialihkan ke sales lain jika tidak segera ditindaklanjuti.',
      '/crm'
    );

    v_lead_list := '';
    for v_lead in
      select p.customer_name, p.phone
      from public.prospects p
      where p.sales_id = v_sales.sales_id
        and p.lead_source = 'facebook_ads'
        and p.created_by is null
        and p.deleted_at is null
        and p.status not in ('closing', 'inactive')
        and p.last_follow_up_at is null
        and p.created_at <= now() - interval '2 hours'
      order by p.created_at
    loop
      v_lead_list := v_lead_list || E'\n- ' || coalesce(v_lead.customer_name, '-') || ' (' || coalesce(v_lead.phone, '-') || ')';
    end loop;

    for v_manager in
      select em.id from public.employees em
      join public.roles r on r.id = em.role_id
      where em.branch_id = v_sales.branch_id and em.deleted_at is null and em.employment_status = 'active' and r.key = 'kepala_cabang'
    loop
      insert into public.mkc_notifications (user_id, type, category, title, body, link)
      values (
        v_manager.id, 'crm', 'sales_conduct_warning',
        'Sales Tidak Responsif: ' || v_sales.sales_name,
        'Sales ' || v_sales.sales_name || ' memiliki ' || v_sales.unfollowed_count
          || ' lead dari iklan yang belum di-follow up sama sekali (lebih dari 2 jam). Sistem sudah mengirim teguran ke sales ini. Daftar lead:' || v_lead_list
          || E'\n\nKeputusan ada di tangan Anda: balas "LEMPAR SEMUA ' || v_sales.sales_name
          || '" jika ingin SEMUA lead ini dialihkan ke sales lain di cabang Anda secara adil (round robin), atau biarkan dulu jika masih ingin memberi kesempatan.',
        '/crm'
      );
    end loop;
  end loop;
end;
$$;

select cron.schedule('crm-sales-conduct-monitoring-hourly', '0 * * * *', $$select public.crm_run_sales_conduct_monitoring();$$);
