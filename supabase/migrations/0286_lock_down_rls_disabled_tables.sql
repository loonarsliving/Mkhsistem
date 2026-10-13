-- ============================================================================
-- MK Connect — 0286: enable RLS on the five public tables that had none
--
-- Supabase security advisor (rls_disabled_in_public, critical, emailed
-- 2026-10-11): these tables sat in `public` with RLS off and full
-- anon/authenticated grants, so anyone holding the project URL + anon key
-- could read, edit or delete them through PostgREST:
--   contractor_fund_request_pending        (0242; holds rekening, nominal)
--   pending_expense_approval_notifications (0244)
--   pengajuan_verification_reminders       (0252)
--   istri_daily_tips
--   zz_claude_probe_ddl                    (empty leftover probe table)
--
-- No app code reads them as anon/authenticated: the app uses the service
-- role (createAdminClient) and postgres-owned SECURITY DEFINER functions
-- (release_pending_expense_approval_notifications,
-- remind_stale_pengajuan_verification, istri_send_daily_tip, sync_inbound),
-- all of which bypass RLS. So RLS-on with no policies plus revoked grants
-- is the intended state: server-only tables.
-- ============================================================================

alter table public.contractor_fund_request_pending        enable row level security;
alter table public.pending_expense_approval_notifications enable row level security;
alter table public.pengajuan_verification_reminders       enable row level security;
alter table public.istri_daily_tips                       enable row level security;
alter table public.zz_claude_probe_ddl                    enable row level security;

revoke all on public.contractor_fund_request_pending        from anon, authenticated;
revoke all on public.pending_expense_approval_notifications from anon, authenticated;
revoke all on public.pengajuan_verification_reminders       from anon, authenticated;
revoke all on public.istri_daily_tips                       from anon, authenticated;
revoke all on public.zz_claude_probe_ddl                    from anon, authenticated;
