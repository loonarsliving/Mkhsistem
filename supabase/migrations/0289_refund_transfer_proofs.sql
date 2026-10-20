-- ============================================================================
-- MK Connect — 0289: Refund transfer proofs (bukti transfer refund)
--
-- Owner's ask (2026-10-20): a refund transfer proof must be stored (so it
-- can be checked in the system later) and forwarded to the refund customer.
-- Two entry points, one processing path (lib/refund/transfer-proof.ts):
--   - WhatsApp: the owner (or a Refund & CR officer) sends the photo to the
--     company number captioned "REFUND <nama customer / no urut> [bulan]",
--     same habit as the villa dividend proof ("A2").
--   - Dashboard: "Upload Bukti" on a customer card in /refund.
-- Either way, automatically: the termin is ticked paid, the proof is sent to
-- the customer's WhatsApp, recorded in the customer's chat, and logged here.
--
-- Files live in a PRIVATE bucket (transfer proofs show bank accounts); the
-- app reads them through short-lived signed URLs only.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('refund-transfer-proofs', 'refund-transfer-proofs', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- Dashboard uploads go straight from the browser (Vercel caps request
-- bodies at 4.5MB, so files never pass through a Server Action). Path is
-- "<customer_id>/<timestamp>-<file>"; the Server Action then validates it.
create policy refund_transfer_proofs_bucket_select on storage.objects for select to authenticated
  using (bucket_id = 'refund-transfer-proofs'
         and (public.app_has_permission('refund.view') or public.app_has_permission('refund.manage')));
create policy refund_transfer_proofs_bucket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'refund-transfer-proofs' and public.app_has_permission('refund.manage'));

create table public.mkc_refund_transfer_proofs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.mkc_refund_customers(id) on delete cascade,
  -- The termin this proof paid; null when the customer had no unpaid termin
  -- left (the proof is still stored and forwarded).
  installment_id uuid references public.mkc_refund_installments(id) on delete set null,
  storage_path text not null,
  content_type text not null default 'image/jpeg',
  source text not null check (source in ('whatsapp', 'dashboard')),
  uploaded_by uuid references public.employees(id),
  forward_status text not null default 'pending' check (forward_status in ('pending', 'sent', 'failed')),
  forward_error text,
  forwarded_at timestamptz,
  created_at timestamptz not null default now()
);

create index mkc_refund_transfer_proofs_customer_idx on public.mkc_refund_transfer_proofs (customer_id, created_at desc);
create index mkc_refund_transfer_proofs_installment_idx on public.mkc_refund_transfer_proofs (installment_id);

alter table public.mkc_refund_transfer_proofs enable row level security;

create policy mkc_refund_transfer_proofs_select on public.mkc_refund_transfer_proofs for select
  using (public.app_has_permission('refund.view') or public.app_has_permission('refund.manage'));
-- No insert/update policy: written only server-side (service role) by
-- lib/refund/transfer-proof.ts after its own permission check.
