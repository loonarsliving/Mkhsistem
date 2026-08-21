-- ============================================================================
-- MK Connect — 0237: Contractor (non-employee) WhatsApp nota reports
--
-- Owner's ask: Anang (external contractor, not an employees row) receives a
-- Rp 5.000.000 advance per pengajuan (Endy submits it, Vando approves,
-- Owner transfers -- the existing bahan/tukang pipeline, already complete
-- once transferred). Anang should now be able to send a photo of what he
-- actually bought with that advance straight to the WhatsApp number; AI
-- reads it and sends Vando a "laporan belanja Anang" to check against the
-- advance. This is accountability documentation ONLY -- the advance's
-- expense was already posted to the ledger when it was approved/paid, so
-- Vando's decision here must NEVER create a new pengajuan, jurnal entry, or
-- transfer request. Deliberately kept entirely inside MK Connect (no sync
-- to mkh-properti at all) so there is no way this accidentally pays Anang
-- twice.
--
-- contractor_wa_senders is a small allowlist (separate from `employees`,
-- which is for internal staff) so this webhook path never grants a
-- non-employee phone number access to the internal AI assistant, HR data,
-- or any other employee-gated command -- only this one narrow report flow.
-- ============================================================================

create table public.contractor_wa_senders (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null unique,
  note text,
  created_at timestamptz not null default now()
);

alter table public.contractor_wa_senders enable row level security;
-- No policies for anon/authenticated -- service-role only (read by the
-- WhatsApp webhook handler's admin client), same posture as
-- photo_auto_forward_rules (0197).

comment on table public.contractor_wa_senders is
  'Allowlist of external (non-employee) phone numbers permitted to use the contractor nota-report WhatsApp flow (0237). Deliberately separate from employees -- these are not staff and must not gain access to any other employee-gated command.';

create table public.contractor_expense_reports (
  id bigint generated always as identity primary key,
  contractor_id uuid not null references public.contractor_wa_senders(id),
  contractor_name text not null,
  contractor_phone text not null,
  item text not null,
  nominal numeric not null,
  tanggal text,
  supplier text,
  ai_notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.employees(id),
  reviewed_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now()
);
create index contractor_expense_reports_status_idx on public.contractor_expense_reports (status) where status = 'pending';

alter table public.contractor_expense_reports enable row level security;
-- Service-role only, same posture as contractor_wa_senders above.

comment on table public.contractor_expense_reports is
  'Nota photos contractors (currently: Anang) send on WhatsApp as spending accountability against an advance already paid via the normal pengajuan pipeline. Vando approving/rejecting here is documentation only -- it never posts to mkh-properti or moves money again.';

-- ----------------------------------------------------------------------------
-- Seed: Anang, per owner's request. Stored as given (087839333399) --
-- matching is done in application code by comparing the last 9 digits
-- (findContractorByPhone, same tolerant approach as findEmployeeByPhone),
-- so the exact leading-0-vs-62 format stored here doesn't matter.
-- ----------------------------------------------------------------------------
insert into public.contractor_wa_senders (full_name, phone, note)
values ('Anang', '087839333399', 'Kontraktor Loonars Living -- laporan belanja atas uang muka yang sudah ditransfer');
