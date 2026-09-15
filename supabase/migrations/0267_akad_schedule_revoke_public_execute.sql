-- ============================================================================
-- MK Connect — 0267: revoke default PUBLIC/anon EXECUTE on the two 0266 RPCs
--
-- Postgres grants EXECUTE to PUBLIC by default on every new function, and
-- 0266 only explicitly granted it to `authenticated` -- same gap 0181 fixed
-- for two other functions. The security advisor flagged both
-- loonars_akad_schedule_request and loonars_akad_schedule_confirm as
-- reachable by `anon` via PostgREST. Both already reject an unauthenticated
-- caller internally (auth.uid() is null for anon, so the ownership/
-- siteplan.manage check always fails), so this isn't an active data leak --
-- but there's no reason an anonymous caller should be able to invoke a
-- notary-scheduling RPC at all, so the default grant is revoked outright.
-- ============================================================================

revoke all on function public.loonars_akad_schedule_request(uuid, text, text, text, text, text, date, text) from public, anon;
revoke all on function public.loonars_akad_schedule_confirm(uuid, date) from public, anon;
