-- ============================================================================
-- MK Connect — 0066: fix prospects_update RLS blocking payment approval
--
-- crm_approve_payment (0024/0052/0061) updates public.prospects (bumps
-- total_collection/total_commission, flips status to 'closing') as the
-- Finance approver. The 'finance' role only holds prospect.finance_verify
-- (+ prospect.view_all, crm_analytics.view_all) -- never prospect.manage --
-- and Finance is never the prospect's sales_id, so the prospects_update
-- policy from 0023_crm_rls.sql (sales_id = auth.uid() + prospect.create, OR
-- prospect.manage) matched neither branch. Approving a payment that closes
-- a prospect therefore failed with "new row violates row-level security
-- policy for table prospects". Add prospect.finance_verify as a third
-- allowed condition, matching crm_approve_payment's own permission check.
-- ============================================================================

drop policy prospects_update on public.prospects;

create policy prospects_update on public.prospects for update to authenticated
  using (
    (sales_id = auth.uid() and public.app_has_permission('prospect.create'))
    or public.app_has_permission('prospect.manage')
    or public.app_has_permission('prospect.finance_verify')
  )
  with check (
    (sales_id = auth.uid() and public.app_has_permission('prospect.create'))
    or public.app_has_permission('prospect.manage')
    or public.app_has_permission('prospect.finance_verify')
  );
