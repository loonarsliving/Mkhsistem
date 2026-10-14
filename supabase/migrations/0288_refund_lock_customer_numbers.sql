-- ============================================================================
-- MK Connect — 0288: Refund WhatsApp numbers are owner-controlled
--
-- Owner's rule (2026-10-14): the refund module's WhatsApp may only reach the
-- refund customers' numbers; beyond that it is only for reminders to the
-- owner and Vando. Chat already sends only to mkc_refund_customers.phone and
-- reminders only to Super Admin + Vando -- but a Refund & CR officer could
-- add a new "customer" or edit a phone number and so message any number.
--
-- From now on only a Super Admin may add a refund customer or change a
-- customer's phone. The officer keeps editing everything else (bank account,
-- notes, amounts) and the termin. Enforced here independently of the app
-- (features/refund/actions/refund.actions.ts checks the same thing).
-- Service-role writes (auth.uid() is null -- direct data loads) are allowed.
-- ============================================================================

create or replace function public.mkc_refund_customers_guard_phone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.app_is_super_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Hanya Super Admin yang bisa menambah customer refund' using errcode = '42501';
  end if;

  if new.phone is distinct from old.phone then
    raise exception 'Hanya Super Admin yang bisa mengubah nomor HP customer refund' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger mkc_refund_customers_guard_phone
  before insert or update on public.mkc_refund_customers
  for each row execute function public.mkc_refund_customers_guard_phone();
