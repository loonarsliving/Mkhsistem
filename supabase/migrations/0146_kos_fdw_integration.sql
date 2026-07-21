-- ============================================================================
-- Kos Occupancy module, part 2: connect Kos at the database level via
-- postgres_fdw instead of calling its kos-api Edge Function per request.
--
-- Kos and MKH Property share one Supabase project (gluoioiimapyhchdasfl),
-- separate from this one (svcmybsziaelwwdrnzcv). This migration creates a
-- foreign server pointing at that project's Postgres instance and imports
-- its operational Kos tables into a local `kos_remote` schema, so queries
-- here run as ordinary local SQL against foreign tables -- no HTTP call, no
-- app-level API token.
--
-- Excluded on purpose: kos_users (holds password_hash -- auth credentials
-- have no reason to leave the Kos project).
--
-- SECURITY NOTE -- the reader role's password is NOT committed here (same
-- convention as sync_config's mk_sync_shared_secret, which also never lives
-- in a migration file). The password below is a placeholder; an operator
-- must set the real one with:
--   alter user mapping for authenticated server kos_server
--     options (set password '<the real password>');
--   alter user mapping for postgres server kos_server
--     options (set password '<the real password>');
-- The real credential (role `mkhsistem_reader`, granted SELECT + a
-- permissive RLS policy on the listed tables in the Kos project) was
-- created directly via SQL against both projects when this module shipped.
-- ============================================================================

create extension if not exists postgres_fdw;

create server if not exists kos_server
  foreign data wrapper postgres_fdw
  options (host 'db.gluoioiimapyhchdasfl.supabase.co', port '5432', dbname 'postgres', sslmode 'require');

create user mapping if not exists for authenticated
  server kos_server
  options (user 'mkhsistem_reader', password 'CHANGE_ME');

create user mapping if not exists for postgres
  server kos_server
  options (user 'mkhsistem_reader', password 'CHANGE_ME');

create schema if not exists kos_remote;
grant usage on schema kos_remote to authenticated, service_role;

import foreign schema public
  limit to (kos_properties, kos_rooms, kos_guests, kos_bookings, kos_transactions, kos_housekeeping, kos_notifications, kos_monthly_reports, kos_shift_log)
  from server kos_server into kos_remote;

-- ----------------------------------------------------------------------------
-- get_kos_occupancy: the only thing the /kos-occupancy page reads -- per
-- active property, how many rooms are filled ("terisi", status <> 'available')
-- vs empty ("kosong", status = 'available'). Gated the same way every other
-- RPC in this app is (public.app_has_permission), even though the page also
-- checks kos_occupancy.view server-side -- defense in depth, same pattern as
-- loonars_beauty_request_weekly_evaluation (0112).
-- ----------------------------------------------------------------------------
create or replace function public.get_kos_occupancy()
returns table (property_id uuid, property_name text, total integer, terisi integer, kosong integer)
language plpgsql
security definer
stable
set search_path = public, kos_remote
as $$
begin
  if not public.app_has_permission('kos_occupancy.view') then
    raise exception 'permission denied';
  end if;

  return query
    select
      p.id,
      p.nama,
      count(r.id)::integer as total,
      count(r.id) filter (where r.status <> 'available')::integer as terisi,
      count(r.id) filter (where r.status = 'available')::integer as kosong
    from kos_remote.kos_properties p
    left join kos_remote.kos_rooms r on r.property_id = p.id
    where p.is_active
    group by p.id, p.nama
    order by p.nama;
end;
$$;

grant execute on function public.get_kos_occupancy() to authenticated;
