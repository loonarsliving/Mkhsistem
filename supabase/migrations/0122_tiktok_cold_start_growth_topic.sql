-- ============================================================================
-- MK Connect — 0122: TikTok cold-start growth knowledge topic
--
-- @loonarsprivateliving (Jogja's TikTok, connected via Zernio) is a
-- genuinely brand-new account (0 followers, 0 posts synced) -- owner asked
-- for help maximizing it, not just generic TikTok content strategy. New
-- knowledge_bank topic (tiktok_cold_start_growth, knowledge-bank.ts) covers
-- 0-1000-follower growth tactics specifically. markom.ts's checklist
-- context builder already flags cold-start explicitly (followersCount <
-- 1000) using the real Zernio-captured follower count, so this topic feeds
-- straight into checklist generation without further wiring.
-- ============================================================================

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
    'meta_ads_property_ctwa', 'instagram_tiktok_property_content', 'tiktok_cold_start_growth',
    'beauty_market_indonesia', 'beauty_social_commerce_strategy', 'beauty_content_strategy', 'beauty_sales_closing_technique'
  ];
begin
  foreach v_topic in array v_topics loop
    insert into public.ai_job_queue (job_type, payload)
    values ('knowledge_bank_refresh', jsonb_build_object('topic', v_topic));
  end loop;
end;
$$;
