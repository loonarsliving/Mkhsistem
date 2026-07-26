-- ============================================================================
-- MK Connect — 0181: revoke public EXECUTE on the two functions 0179/0180 added
--
-- Postgres grants EXECUTE on a new function to PUBLIC by default. Because
-- these live in the `public` schema, PostgREST exposes them as RPC endpoints,
-- so `friday_enqueue_daily_briefing()` was callable by an unauthenticated
-- request to /rest/v1/rpc/friday_enqueue_daily_briefing. It is SECURITY
-- DEFINER and it enqueues an AI job, which makes "anyone on the internet can
-- burn the company's Gemini quota, one request at a time" a fair description
-- of the gap. Granting execute to service_role (as 0179 did) does not remove
-- the default PUBLIC grant -- it has to be revoked explicitly.
--
-- Only the two functions those migrations introduced are corrected here. The
-- Supabase security advisor reports the same exposure on ~70 pre-existing
-- functions (ai_send_daily_report, ai_send_birthday_wishes, every
-- ai_run_*_dispatch, ...). That is worth fixing and is a bigger, separate
-- change: some functions in that list are called through RPC by the
-- application on purpose (approve_employee_registration is the obvious one),
-- so a blanket revoke would break real flows. It needs to be gone through one
-- function at a time, not swept.
-- ============================================================================

revoke all on function public.friday_enqueue_daily_briefing() from public, anon, authenticated;
grant execute on function public.friday_enqueue_daily_briefing() to service_role;

-- Trigger function: nothing should ever call this directly. Postgres checks
-- EXECUTE on a trigger function when the trigger is created, not each time it
-- fires, so revoking here does not stop kontenai_automation_settings updates
-- from syncing the schedule.
revoke all on function public.kontenai_automation_sync_schedule() from public, anon, authenticated;
