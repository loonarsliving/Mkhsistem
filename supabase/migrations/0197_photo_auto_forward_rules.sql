-- ============================================================================
-- MK Connect — 0197: Automatic WhatsApp photo forwarding rules
--
-- Owner's ask: when Endy sends a photo to the system's WhatsApp number, it
-- should automatically be forwarded to Vando and every Super Admin -- no
-- "kirim ke Vando dan Super Admin" instruction needed, since these photos
-- are his justification for ordering material (bahan) and the recipients
-- need to see them immediately.
--
-- Generalized as a small rules table (not hardcoded to Endy) so the same
-- mechanism covers any future "auto-forward this person's photos" request
-- without another code change -- just insert rows. Mirrors the pattern
-- already used for construction photo reports (0193's
-- tryRouteConstructionPhotoReport), but table-driven instead of derived
-- from construction_projects, and supports both a specific recipient and a
-- role-wide recipient (e.g. "every Super Admin").
-- ============================================================================

create table public.photo_auto_forward_rules (
  id uuid primary key default gen_random_uuid(),
  sender_employee_id uuid not null references public.employees(id) on delete cascade,
  -- Exactly one of these two is set per row.
  recipient_employee_id uuid references public.employees(id),
  recipient_role text,
  note text,
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  check (
    (recipient_employee_id is not null and recipient_role is null)
    or (recipient_employee_id is null and recipient_role is not null)
  )
);
create index photo_auto_forward_rules_sender_idx on public.photo_auto_forward_rules (sender_employee_id);

alter table public.photo_auto_forward_rules enable row level security;
-- No policies for anon/authenticated -- service-role only (read by the
-- WhatsApp webhook handler's admin client), same posture as
-- wa_pending_media_relay (0113).

comment on table public.photo_auto_forward_rules is
  'Standing rules: every photo a given employee sends via WhatsApp is auto-forwarded to the listed recipients (a specific employee, or every active holder of a role), no relay instruction needed from the sender. Service-role only.';

-- ----------------------------------------------------------------------------
-- Seed: Endy's building-material purchase justification photos -> Vando +
-- every Super Admin.
-- ----------------------------------------------------------------------------
do $$
declare
  v_endy_id uuid;
  v_vando_id uuid;
begin
  select id into v_endy_id from public.employees where email = 'endy@haluoleo.id';
  select id into v_vando_id from public.employees where email = 'vando@haluoleo.id';
  if v_endy_id is null or v_vando_id is null then
    raise exception 'Endy or Vando employee row not found';
  end if;

  insert into public.photo_auto_forward_rules (sender_employee_id, recipient_employee_id, note)
  values (v_endy_id, v_vando_id, 'Bukti foto sebagai alasan pemesanan bahan bangunan');

  insert into public.photo_auto_forward_rules (sender_employee_id, recipient_role, note)
  values (v_endy_id, 'super_admin', 'Bukti foto sebagai alasan pemesanan bahan bangunan');
end $$;
