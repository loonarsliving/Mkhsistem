-- ============================================================================
-- MK Connect — 0249: Auto-send salary transfer summaries (fixes real
-- Makassar incident: Edy submitted 2 gaji entries on 1 Sept but never
-- pressed the manual "Kirim Ringkasan" button from 0190, so Super Admin's
-- WhatsApp never got pinged and the transfers sat unnoticed for hours).
--
-- 0190 replaced the old per-employee WhatsApp ping with an explicit,
-- Kepala-Cabang-pressed "send summary" action -- correct call to stop
-- spamming Super Admin with 7 separate messages for one payroll batch, but
-- it also means the WhatsApp side is now 100% dependent on a human
-- remembering to press a button after finishing. This adds a debounced
-- auto-send as a safety net UNDERNEATH that manual action (which still
-- works exactly as before, and still marks summary_sent_at so this
-- function skips anything already sent): every 15 minutes, for any branch
-- whose newest not-yet-summarized submission is at least 20 minutes old
-- (a hopefully-finished-inputting debounce, same idea as
-- PENDING_CLARIFICATION_MAX_AGE_MS elsewhere in this app), send the exact
-- same consolidated summary automatically.
-- ============================================================================

create or replace function public.auto_send_pending_salary_transfer_summaries()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch record;
  v_row record;
  v_lines text;
  v_total numeric(14, 2);
  v_count int;
  v_ids uuid[];
  v_admin record;
begin
  for v_branch in
    select s.branch_id, b.name as branch_name, max(s.created_at) as newest_unsent
    from public.employee_salary_submissions s
    join public.branches b on b.id = s.branch_id
    where s.status = 'pending_transfer' and s.summary_sent_at is null
    group by s.branch_id, b.name
    having max(s.created_at) <= now() - interval '20 minutes'
  loop
    v_lines := '';
    v_total := 0;
    v_count := 0;
    v_ids := '{}';

    for v_row in
      select s.id, s.amount, s.bank_name, s.bank_account_number, s.bank_account_holder, e.full_name
      from public.employee_salary_submissions s
      join public.employees e on e.id = s.employee_id
      where s.branch_id = v_branch.branch_id and s.status = 'pending_transfer' and s.summary_sent_at is null
      order by s.created_at
    loop
      v_count := v_count + 1;
      v_total := v_total + v_row.amount;
      v_ids := v_ids || v_row.id;
      v_lines := v_lines || E'\n' || v_count || '. ' || v_row.full_name
        || ' — Rp ' || to_char(v_row.amount, 'FM999,999,999,999')
        || E'\n   ' || coalesce(nullif(trim(v_row.bank_name), ''), '-') || ' ' || v_row.bank_account_number
        || case when coalesce(trim(v_row.bank_account_holder), '') <> '' then ' a.n. ' || trim(v_row.bank_account_holder) else '' end;
    end loop;

    if v_count = 0 then
      continue;
    end if;

    for v_admin in
      select em.id from public.employees em
      join public.roles r on r.id = em.role_id
      where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
    loop
      insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
      values (
        v_admin.id, 'system', 'salary_transfer_summary',
        'Ringkasan Transfer Gaji — ' || coalesce(v_branch.branch_name, '-') || ' (' || v_count || ' karyawan)',
        'Total: Rp ' || to_char(v_total, 'FM999,999,999,999') || v_lines
          || E'\n\n(dikirim otomatis -- Kepala Cabang belum menekan Kirim Ringkasan dalam 20 menit terakhir)',
        '/hr/salary',
        jsonb_build_object('branch_id', v_branch.branch_id, 'submission_ids', to_jsonb(v_ids), 'count', v_count, 'auto_sent', true)
      );
    end loop;

    update public.employee_salary_submissions set summary_sent_at = now() where id = any (v_ids);
  end loop;
end;
$$;

comment on function public.auto_send_pending_salary_transfer_summaries is
  'Every 15 min: catches any branch''s salary submissions that have sat unsent for 20+ minutes (Kepala Cabang forgot to press Kirim Ringkasan) and sends the same consolidated WhatsApp summary automatically -- a safety net under the manual 0190 action, not a replacement for it.';

select cron.schedule('salary-transfer-summary-auto-send', '*/15 * * * *', $$select public.auto_send_pending_salary_transfer_summaries();$$);
