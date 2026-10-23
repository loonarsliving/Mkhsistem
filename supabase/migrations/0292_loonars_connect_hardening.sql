-- ============================================================================
-- MK Connect — 0292: Loonars Connect hardening (Supabase security advisor
-- findings on 0291, 2026-10-23)
--
-- 1. The read-only helpers used by 0291's RLS policies were executable by
--    `anon` (PUBLIC default). Without a session they only ever return
--    null/false, but nothing anonymous needs them: revoke. `authenticated`
--    keeps EXECUTE because RLS evaluates these as the querying user.
-- 2. Pin search_path on the two checklist helpers (function_search_path_mutable).
--
-- Left as-is on purpose: mkc_chat_retention_runs has RLS and no policy
-- (service role only), and authenticated may execute the 0291 RPCs (each one
-- checks group membership / role itself).
-- ============================================================================

revoke execute on function
  public.mkc_chat_can_read(uuid),
  public.mkc_chat_employee_eligible(uuid),
  public.mkc_chat_my_role(uuid),
  public.mkc_hosp_can_view_department(uuid),
  public.mkc_hosp_feed_id(uuid),
  public.mkc_hosp_group_id(uuid),
  public.mkc_hosp_local_date(uuid, timestamptz),
  public.mkc_hosp_require_role(uuid, text[]),
  public.mkc_hosp_setting(uuid, text),
  public.mkc_hosp_checklist_items(text),
  public.mkc_hosp_validate_items(text, jsonb)
from public, anon;

grant execute on function
  public.mkc_chat_can_read(uuid),
  public.mkc_chat_employee_eligible(uuid),
  public.mkc_chat_my_role(uuid),
  public.mkc_hosp_can_view_department(uuid),
  public.mkc_hosp_feed_id(uuid),
  public.mkc_hosp_group_id(uuid),
  public.mkc_hosp_local_date(uuid, timestamptz),
  public.mkc_hosp_require_role(uuid, text[]),
  public.mkc_hosp_setting(uuid, text),
  public.mkc_hosp_checklist_items(text),
  public.mkc_hosp_validate_items(text, jsonb)
to authenticated;

alter function public.mkc_hosp_checklist_items(text) set search_path = public;
alter function public.mkc_hosp_validate_items(text, jsonb) set search_path = public;
