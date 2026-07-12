-- ============================================================================
-- MK Connect — 0058: sync_inbound RPC (replaces the sync-inbound Edge
-- Function as the receiving endpoint)
--
-- This repo already hit "Edge Function deployment tooling was unavailable"
-- once before (see 0054_push_route_trigger.sql, which repoints a trigger
-- from an Edge Function to a Vercel API route for the same reason). The
-- same limitation applies to this session's tooling, so the MKH Property
-- sync receiver is implemented as a plain PostgREST-callable RPC function
-- instead of supabase/functions/sync-inbound — no separate deploy step,
-- ships with the migration.
--
-- PostgREST forwards every request header into a Postgres GUC named
-- request.header.<lowercased-name>, so the shared secret sent as
-- `X-Sync-Secret` is readable here via current_setting('request.header.x-sync-secret', true)
-- — same authentication contract as the Edge Function would have used
-- (compare against vault.decrypted_secrets, name = 'mk_sync_shared_secret').
-- EXECUTE is granted to anon/authenticated only so PostgREST will route the
-- request through at all; the actual gate is the secret check inside.
--
-- supabase/functions/sync-inbound/index.ts is kept in the repo as the
-- Edge-Function-based alternative for the day this project's deploy tooling
-- is available (functionally identical to this RPC), but MKH Property's
-- sync_config.peer_sync_url points at this RPC endpoint
-- (…/rest/v1/rpc/sync_inbound), which is what is actually live.
-- ============================================================================

create or replace function public.sync_inbound(p_idempotency_key text, p_event_type text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret text;
  v_provided text;
  v_sync_log_id uuid;
  v_target_ref text;
  v_mkc_payment_id uuid;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'mk_sync_shared_secret';
  -- PostgREST (v10+, current on Supabase) exposes request headers as the
  -- single JSON GUC `request.headers`, not the older per-header
  -- `request.header.<name>` convention; keep both so this degrades
  -- gracefully if that ever changes again.
  v_provided := coalesce(
    current_setting('request.headers', true)::json ->> 'x-sync-secret',
    current_setting('request.header.x-sync-secret', true)
  );
  if v_secret is null or v_provided is distinct from v_secret then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;

  insert into public.sync_log (direction, event_type, source_table, source_id, idempotency_key, payload, status)
  values ('inbound', p_event_type, 'mkh_property', gen_random_uuid(), p_idempotency_key, p_payload, 'sent')
  on conflict (idempotency_key) do nothing
  returning id into v_sync_log_id;

  if v_sync_log_id is null then
    select target_ref into v_target_ref from public.sync_log where idempotency_key = p_idempotency_key;
    return jsonb_build_object('status', 'duplicate', 'target_ref', v_target_ref);
  end if;

  begin
    if p_event_type = 'finance_payment_confirmed' then
      v_mkc_payment_id := (p_payload ->> 'mkc_payment_id')::uuid;

      update public.prospect_payments set
        finance_confirmed_at = coalesce((p_payload ->> 'confirmed_at')::timestamptz, now()),
        finance_confirmed_by = coalesce(p_payload ->> 'confirmed_by', 'mkh_property'),
        finance_reference_no = p_payload ->> 'jurnal_no'
      where id = v_mkc_payment_id;

      if not found then
        raise exception 'prospect_payments % not found', v_mkc_payment_id;
      end if;

      v_target_ref := v_mkc_payment_id::text;
    else
      update public.sync_log set status = 'skipped', last_error = 'Unknown event_type: ' || p_event_type, updated_at = now()
        where id = v_sync_log_id;
      return jsonb_build_object('status', 'skipped');
    end if;

    update public.sync_log set status = 'succeeded', target_ref = v_target_ref, updated_at = now() where id = v_sync_log_id;
    return jsonb_build_object('status', 'ok', 'target_ref', v_target_ref);
  exception when others then
    update public.sync_log set status = 'failed', last_error = left(sqlerrm, 2000), updated_at = now() where id = v_sync_log_id;
    raise;
  end;
end;
$$;

grant execute on function public.sync_inbound(text, text, jsonb) to anon, authenticated;

comment on function public.sync_inbound is
  'PostgREST-callable receiver for MKH Property -> MK Connect sync events (currently only finance_payment_confirmed). Authenticated via X-Sync-Secret header against Supabase Vault, not JWT — see file header.';
