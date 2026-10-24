-- ============================================================================
-- MK Connect — 0299: Hospitality report villa snapshot no longer times out
--
-- Owner's screenshot (2026-10-24): the Hospitality reports showed "?" for every
-- villa number (total unit, check-in, check-out, siap dijual...). Today's
-- afternoon (14:07 WIB) and end-of-day (21:07 WIB) reports stored
-- villa_units = "canceling statement due to statement timeout": the whole
-- mkc_hosp_report_villa_snapshot() call hit the API role's 8 s
-- statement_timeout, so all four villa sources were marked unavailable (the
-- report correctly showed "?" instead of a made-up zero).
--
-- The slow part is the sync-job freshness lookup. It took the newest
-- cron.job_run_details row per job with ORDER BY start_time, but that table
-- (~220k rows, ~121 MB, shared with the villa app's jobs) only has its runid
-- primary key, so each of the three jobs was a full sequential scan: 7.5 s
-- measured in production. runid is a sequence, so the newest run is the
-- highest runid; walking the primary key backwards measured 0.47 s
-- (2,996 buffers instead of ~41,800). Same result, nothing else changes.
-- ============================================================================

create or replace function public.mkc_hosp_report_villa_snapshot(p_from timestamptz, p_to timestamptz, p_local_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb := '{}'::jsonb;
begin
  begin
    v := v || jsonb_build_object('units', jsonb_build_object('ok', true, 'fetched_at', now(), 'data',
      coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'nomor', u.nomor, 'status', u.status) order by u.nomor) from public.units u), '[]'::jsonb)));
  exception when others then
    v := v || jsonb_build_object('units', jsonb_build_object('ok', false, 'error', sqlerrm));
  end;

  begin
    v := v || jsonb_build_object('maintenance', jsonb_build_object('ok', true, 'fetched_at', now(), 'data',
      coalesce((select jsonb_agg(jsonb_build_object('unit_id', m.unit_id, 'from', m.tutup_mulai, 'to', m.tutup_sampai, 'reason', m.alasan))
                from public.villa_room_maintenance m where m.tutup_mulai <= p_local_date and m.tutup_sampai >= p_local_date), '[]'::jsonb)));
  exception when others then
    v := v || jsonb_build_object('maintenance', jsonb_build_object('ok', false, 'error', sqlerrm));
  end;

  begin
    v := v || jsonb_build_object('bookings', jsonb_build_object('ok', true, 'fetched_at', now(), 'data', jsonb_build_object(
      'in_house_unit_ids', coalesce((select jsonb_agg(distinct b.unit_id) from public.bookings b where b.status = 'checkin' and b.unit_id is not null), '[]'::jsonb),
      'checkins', coalesce((select jsonb_agg(coalesce(b.unit_nomor, '?')) from public.bookings b
                            where b.checkin_at >= p_from and b.checkin_at < p_to and b.status <> 'batal'), '[]'::jsonb),
      'checkouts', coalesce((select jsonb_agg(coalesce(b.unit_nomor, '?')) from public.bookings b
                             where b.checkout_at >= p_from and b.checkout_at < p_to and b.status <> 'batal'), '[]'::jsonb)
    )));
  exception when others then
    v := v || jsonb_build_object('bookings', jsonb_build_object('ok', false, 'error', sqlerrm));
  end;

  -- Freshness of the sync jobs the numbers depend on. (0299) Newest run by
  -- runid, walking the primary-key index backwards: cron.job_run_details has
  -- no index on start_time, so ordering by it scanned the whole table per job.
  begin
    v := v || jsonb_build_object('jobs', jsonb_build_object('ok', true, 'fetched_at', now(), 'data',
      coalesce((select jsonb_object_agg(j.jobname, jsonb_build_object('last_run', r.start_time, 'status', r.status))
                from cron.job j
                left join lateral (select d.start_time, d.status from cron.job_run_details d where d.jobid = j.jobid order by d.runid desc limit 1) r on true
                where j.jobname in ('villa-sync-cloudbeds-reservations', 'hospitality-sync-room-tasks', 'villa-auto-checkout')), '{}'::jsonb)));
  exception when others then
    v := v || jsonb_build_object('jobs', jsonb_build_object('ok', false, 'error', sqlerrm));
  end;

  return v;
end;
$$;
