-- ============================================================================
-- MK Connect — 0264: Loonars 2 unit prices are genuinely uneditable
--
-- Owner's explicit follow-up: "buat harga tidak bisa diedit, karna posisi
-- skrng harga masih bisa diedit" -- 0263 set BANYU/AVARA's harga to the
-- confirmed 420jt/520jt figures, but "kunci" there only meant "a real,
-- settled number" -- the /siteplan/admin unit form could still change it
-- like any other field. This migration makes it an actual lock: a genuine
-- database-enforced restriction, not just a UI convention.
--
-- Design:
--   * loonars_units.price_locked (new column, default false) -- per-unit,
--     not per-project, so a future project (or even a future Loonars 2
--     unit added later) is editable by default; only the 20 rows this
--     migration marks are locked.
--   * A BEFORE UPDATE trigger raises if a locked row's harga is actually
--     changing (NEW.harga IS DISTINCT FROM OLD.harga) -- tipe/luas/status/
--     blok on the same row stay freely editable, only harga is frozen.
--   * Deliberately NO siteplan.manage bypass, unlike 0262's branch checks.
--     The owner's instruction was unconditional ("tidak bisa diedit"), and
--     a price that is supposed to be final should not have an admin-role
--     backdoor in the app -- a genuine future price change belongs in its
--     own numbered migration (matching how 0263 itself set the price, and
--     how this project already treats other "final, owner-confirmed"
--     figures like the Loonars Coffee RAB in 0256), not a form submit.
--   * The trigger fires for every role (RLS-independent), so this holds
--     even if a future code path bypasses the existing RLS update policy.
-- ============================================================================

alter table public.loonars_units
  add column price_locked boolean not null default false;

comment on column public.loonars_units.price_locked is
  'When true, loonars_units_price_lock_guard rejects any UPDATE that changes harga on this row -- tipe/luas/status/blok remain editable. Set only via migration (see 0264), never through the admin UI; there is no unlock path in the app on purpose. A genuine price change belongs in a new numbered migration.';

update public.loonars_units u
set price_locked = true
from public.loonars_projects p
where u.project_id = p.id
  and p.kode = 'LNR2';

create or replace function public.loonars_units_price_lock_guard()
returns trigger
language plpgsql
as $$
begin
  if old.price_locked and new.harga is distinct from old.harga then
    raise exception 'Harga unit % terkunci dan tidak dapat diubah' , old.blok using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function public.loonars_units_price_lock_guard is
  'Rejects any UPDATE that changes harga on a loonars_units row with price_locked = true. Runs for every role, including siteplan.manage -- there is deliberately no bypass (0264).';

drop trigger if exists loonars_units_price_lock on public.loonars_units;
create trigger loonars_units_price_lock
  before update on public.loonars_units
  for each row execute function public.loonars_units_price_lock_guard();
