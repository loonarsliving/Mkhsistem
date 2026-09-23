-- ============================================================================
-- MK Connect — 0279: fee decision notifies the marketing rep over WhatsApp
--
-- Owner's finding: approving a fee claim in Pengajuan Fee Siteplan only ever
-- inserted an IN-APP notification (category 'approved'/'rejected') for the
-- marketing rep -- never forwarded to WhatsApp, since those categories were
-- never in mkc_notifications_whatsapp_trigger's allowlist (unlike
-- loonars_fee_alert, fixed for the *request* side in 0276). A rep who
-- doesn't have MK Connect open never finds out their fee was decided.
--
-- Fix: reuse the already-whitelisted loonars_fee_alert category (same
-- category the historical MKH-Property/loonars-sales integration used for
-- this exact purpose in 0185's loonars_fee_decided handling) and give the
-- body enough context (unit, buyer, amount) to stand alone as a payout
-- confirmation, not just a status flip.
--
-- Also revoke public/anon EXECUTE, a pre-existing gap from 0202 (harmless in
-- practice since app_has_permission() safely returns false for a null
-- auth.uid(), but inconsistent with this project's convention of an
-- explicit revoke on every siteplan RPC).
-- ============================================================================

create or replace function public.loonars_unit_fee_decide(p_id uuid, p_approve boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.loonars_unit_fee_requests%rowtype;
  v_unit public.loonars_units%rowtype;
  v_project_nama text;
  v_purchase public.loonars_unit_purchases%rowtype;
  v_new_status text := case when p_approve then 'approved' else 'rejected' end;
begin
  if not public.app_has_permission('siteplan.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_row from public.loonars_unit_fee_requests where id = p_id for update;
  if not found then
    raise exception 'Fee request not found';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'Fee request sudah diputuskan';
  end if;

  update public.loonars_unit_fee_requests set
    status = v_new_status, decided_by = v_user_id, decided_at = now(), reject_reason = p_reason, updated_at = now()
  where id = p_id;

  select * into v_unit from public.loonars_units where id = v_row.unit_id;
  select nama into v_project_nama from public.loonars_projects where id = v_unit.project_id;
  select * into v_purchase from public.loonars_unit_purchases where id = v_row.purchase_id;

  insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
  values (
    v_row.marketing_employee_id, 'system', 'loonars_fee_alert',
    (case when p_approve then 'Fee Disetujui' else 'Fee Ditolak' end) || ' — Unit ' || coalesce(v_unit.blok, '-'),
    'Fee Anda sebesar Rp ' || to_char(v_row.fee_amount, 'FM999,999,999,999')
      || ' untuk unit ' || coalesce(v_unit.blok, '-') || ' (' || coalesce(v_project_nama, '-') || ')'
      || ' telah ' || (case when p_approve then 'disetujui dan akan segera ditransfer' else 'ditolak' end)
      || case when not p_approve and p_reason is not null and p_reason <> '' then '. Alasan: ' || p_reason else '.' end
      || E'\nPembeli: ' || coalesce(v_purchase.buyer_name, '-'),
    '/dashboard',
    jsonb_build_object('loonars_unit_fee_request_id', p_id, 'unit_id', v_row.unit_id)
  );
end;
$$;

comment on function public.loonars_unit_fee_decide is
  'A siteplan.manage holder approves/rejects a pending fee request. Notifies the requesting marketing employee via the loonars_fee_alert category (0279) so the decision -- approved/paid or rejected -- reaches them over WhatsApp, not just in-app.';

revoke all on function public.loonars_unit_fee_decide(uuid, boolean, text) from public, anon;
