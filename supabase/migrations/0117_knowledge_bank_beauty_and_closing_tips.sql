-- ============================================================================
-- MK Connect — 0117: Separate Loonars Beauty's own knowledge bank +
-- one-off Sunday sales closing-tips broadcast (per sales rep's real product)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ai_knowledge_bank gains product_line so property and beauty content
--    are never mixed (getKnowledgeBankContext filters by it). Existing 5
--    rows are all property.
-- ----------------------------------------------------------------------------
alter table public.ai_knowledge_bank add column product_line text not null default 'property';
alter table public.ai_knowledge_bank add constraint ai_knowledge_bank_product_line_check check (product_line in ('property', 'beauty'));
alter table public.ai_knowledge_bank alter column product_line drop default;

create or replace function public.ai_run_knowledge_bank_dispatch()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topic text;
  v_topics text[] := array[
    'villa_leasehold_market', 'subsidized_housing_market', 'property_sales_closing_technique',
    'meta_ads_property_ctwa', 'instagram_tiktok_property_content',
    -- Loonars Beauty (this migration) -- own topics, own product_line, never mixed with property.
    'beauty_market_indonesia', 'beauty_social_commerce_strategy', 'beauty_content_strategy', 'beauty_sales_closing_technique'
  ];
begin
  foreach v_topic in array v_topics loop
    insert into public.ai_job_queue (job_type, payload)
    values ('knowledge_bank_refresh', jsonb_build_object('topic', v_topic));
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. One-off Sunday closing-tips broadcast: one job per active sales
--    employee, product_type precomputed here (their single most-common
--    project_type across their own prospects) so the TS handler stays
--    simple. 'unknown' when a sales rep has no prospect linked to a real
--    crm_projects row (e.g. Makassar currently has no active project in
--    the system) -- their tip falls back to generic property closing
--    technique rather than guessing a product.
-- ----------------------------------------------------------------------------
alter table public.ai_job_queue drop constraint ai_job_queue_job_type_check;
alter table public.ai_job_queue add constraint ai_job_queue_job_type_check
  check (job_type in (
    'whatsapp_ai_reply', 'crm_sp1_draft', 'markom_checklist_draft',
    'meta_ads_launch', 'meta_ads_research', 'social_weekly_evaluation', 'crm_sales_coaching',
    'loonars_beauty_weekly_evaluation', 'knowledge_bank_refresh',
    -- This migration
    'sales_closing_tips_broadcast'
  ));

create or replace function public.crm_dispatch_sales_closing_tips()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sales record;
  v_product_type text;
begin
  for v_sales in
    select e.id, e.full_name, e.phone, b.name as branch_name
    from public.employees e
    join public.roles r on r.id = e.role_id
    join public.branches b on b.id = e.branch_id
    where e.deleted_at is null and e.employment_status = 'active' and r.key = 'sales' and e.phone is not null
  loop
    select cp.project_type into v_product_type
    from public.prospects p
    join public.crm_projects cp on cp.id = p.project_id
    where p.sales_id = v_sales.id and p.deleted_at is null and cp.project_type is not null
    group by cp.project_type
    order by count(*) desc
    limit 1;

    insert into public.ai_job_queue (job_type, payload)
    values ('sales_closing_tips_broadcast', jsonb_build_object(
      'sales_id', v_sales.id,
      'sales_name', v_sales.full_name,
      'sales_phone', v_sales.phone,
      'branch_name', v_sales.branch_name,
      'product_type', coalesce(v_product_type, 'unknown')
    ));
  end loop;
end;
$$;

comment on function public.crm_dispatch_sales_closing_tips is
  'One-off (called manually, no cron) dispatch of a personalized closing tip per active sales employee, product_type derived from their own prospects'' crm_projects.project_type -- not a recurring feature, just callable again on demand.';
