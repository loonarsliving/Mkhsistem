-- ============================================================================
-- MK Connect — 0125: AI auto-discovers competitors, not just manual entry
--
-- Owner's explicit ask: the system should find its own reference competitors
-- for all three product lines (leasehold sales, villa occupancy, Loonars
-- Beauty body lotion) via Google Search grounding, instead of relying on a
-- human to register them one by one (social_competitor_accounts previously
-- had zero manual logs after weeks of the feature existing -- confirmed the
-- manual-entry-first design wasn't working).
--
-- social_competitor_accounts now serves all three product lines (not just
-- leasehold) via content_focus, gated by the right permission per row:
-- content_planner.* for leasehold_sales/occupancy, loonars_beauty.* for
-- beauty (same product-line separation already enforced for the knowledge
-- bank, migration 0117). Manual "Tambah Kompetitor" stays available as a
-- human override/correction, but auto-discovery is now the primary path --
-- runs weekly (all 3 foci) and on demand per tab.
-- ============================================================================

alter table public.social_competitor_accounts
  add column content_focus text not null default 'leasehold_sales'
    check (content_focus in ('leasehold_sales', 'occupancy', 'beauty'));

alter table public.social_competitor_accounts
  add column source text not null default 'manual'
    check (source in ('manual', 'ai_discovered'));

drop policy social_competitor_accounts_select on public.social_competitor_accounts;
drop policy social_competitor_accounts_write on public.social_competitor_accounts;

create policy social_competitor_accounts_select on public.social_competitor_accounts for select to authenticated
  using (
    (content_focus = 'beauty' and public.app_has_permission('loonars_beauty.view'))
    or (content_focus <> 'beauty' and public.app_has_permission('content_planner.view'))
  );
create policy social_competitor_accounts_write on public.social_competitor_accounts for all to authenticated
  using (
    (content_focus = 'beauty' and public.app_has_permission('loonars_beauty.manage'))
    or (content_focus <> 'beauty' and public.app_has_permission('content_planner.manage'))
  )
  with check (
    (content_focus = 'beauty' and public.app_has_permission('loonars_beauty.manage'))
    or (content_focus <> 'beauty' and public.app_has_permission('content_planner.manage'))
  );

drop policy social_competitor_content_logs_select on public.social_competitor_content_logs;
drop policy social_competitor_content_logs_write on public.social_competitor_content_logs;

create policy social_competitor_content_logs_select on public.social_competitor_content_logs for select to authenticated
  using (
    exists (
      select 1 from public.social_competitor_accounts a
      where a.id = competitor_account_id
        and ((a.content_focus = 'beauty' and public.app_has_permission('loonars_beauty.view'))
          or (a.content_focus <> 'beauty' and public.app_has_permission('content_planner.view')))
    )
  );
create policy social_competitor_content_logs_write on public.social_competitor_content_logs for all to authenticated
  using (
    exists (
      select 1 from public.social_competitor_accounts a
      where a.id = competitor_account_id
        and ((a.content_focus = 'beauty' and public.app_has_permission('loonars_beauty.manage'))
          or (a.content_focus <> 'beauty' and public.app_has_permission('content_planner.manage')))
    )
  )
  with check (
    exists (
      select 1 from public.social_competitor_accounts a
      where a.id = competitor_account_id
        and ((a.content_focus = 'beauty' and public.app_has_permission('loonars_beauty.manage'))
          or (a.content_focus <> 'beauty' and public.app_has_permission('content_planner.manage')))
    )
  );

alter table public.ai_job_queue drop constraint ai_job_queue_job_type_check;
alter table public.ai_job_queue add constraint ai_job_queue_job_type_check
  check (job_type in (
    'whatsapp_ai_reply', 'crm_sp1_draft', 'markom_checklist_draft',
    'meta_ads_launch', 'meta_ads_research', 'social_weekly_evaluation', 'crm_sales_coaching',
    'loonars_beauty_weekly_evaluation', 'knowledge_bank_refresh', 'sales_closing_tips_broadcast',
    'leasehold_competitor_comparison', 'competitor_discovery'
  ));

-- Automatic weekly dispatch, all 3 foci -- Sunday 00:30 UTC (08:30 WITA),
-- ahead of Monday's audit/comparison cycle so freshly-discovered
-- competitors are already available for that run.
create or replace function public.social_run_competitor_discovery_dispatch()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_focus text;
begin
  foreach v_focus in array array['leasehold_sales', 'occupancy', 'beauty'] loop
    insert into public.ai_job_queue (job_type, payload) values ('competitor_discovery', jsonb_build_object('focus', v_focus));
  end loop;
end;
$$;

select cron.schedule('competitor-discovery-dispatch', '30 0 * * 0', $$select public.social_run_competitor_discovery_dispatch();$$);

-- Manual trigger (per-tab "Cari Kompetitor Otomatis" button) -- same
-- SECURITY DEFINER wrapper pattern as markom_request_leasehold_competitor_comparison (0124).
create or replace function public.markom_request_competitor_discovery(p_focus text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_focus not in ('leasehold_sales', 'occupancy', 'beauty') then
    raise exception 'invalid focus: %', p_focus;
  end if;

  if p_focus = 'beauty' then
    if not public.app_has_permission('loonars_beauty.manage') then
      raise exception 'permission denied';
    end if;
  else
    if not public.app_has_permission('content_planner.manage') then
      raise exception 'permission denied';
    end if;
  end if;

  insert into public.ai_job_queue (job_type, payload) values ('competitor_discovery', jsonb_build_object('focus', p_focus));
end;
$$;

grant execute on function public.markom_request_competitor_discovery(text) to authenticated;
