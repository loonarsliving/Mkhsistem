-- ============================================================================
-- MK Connect — 0116: Refocus knowledge bank on PT Maha Karya Haluoleo's
-- actual products (rumah subsidi/komersial, villa leasehold)
--
-- 0115's topic list (meta_ads_strategy, instagram_strategy, tiktok_strategy,
-- digital_marketing_general) was generic platform trivia -- made WhatsApp
-- AI answers feel disconnected from what employees actually discuss
-- (leasehold vs freehold objections, FLPP financing, property-specific
-- closing technique). Replaced with 5 property/sales-specific topics
-- (knowledge-bank.ts's new KNOWLEDGE_TOPICS). Old rows deleted so stale
-- generic content doesn't linger alongside the new property-focused ones.
-- ============================================================================

delete from public.ai_knowledge_bank
where topic in ('meta_ads_strategy', 'instagram_strategy', 'tiktok_strategy', 'digital_marketing_general');

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
    'meta_ads_property_ctwa', 'instagram_tiktok_property_content'
  ];
begin
  foreach v_topic in array v_topics loop
    insert into public.ai_job_queue (job_type, payload)
    values ('knowledge_bank_refresh', jsonb_build_object('topic', v_topic));
  end loop;
end;
$$;
