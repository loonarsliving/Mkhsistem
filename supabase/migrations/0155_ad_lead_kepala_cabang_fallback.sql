-- ============================================================================
-- MK Connect — 0155: Ad lead fallback to Kepala Cabang when a branch has no
-- Sales/freelance yet
--
-- Owner's ask: Management Property branch currently has only its Kepala
-- Cabang (Ayu) and no Sales employees at all. Before this fix,
-- crm_pick_round_robin_sales_or_freelance (0136) returned no candidate for
-- that branch, so routeAdDrivenLead (ad-lead-routing.ts) hit
-- "no_sales_available" and the lead was silently dropped -- no prospect
-- created, no WhatsApp notification sent to anyone.
--
-- Fix: when a branch has zero active Sales/freelance candidates, fall back
-- to that branch's active Kepala Cabang so the lead still reaches someone.
-- Returned as recipient_type 'sales' (not a new type) so the existing
-- prospects.sales_id insert + WhatsApp notify path in routeAdDrivenLead needs
-- no changes -- her leads just won't be picked up by the sales-only
-- escalation/monitoring functions (0104/0110/0119/0120), which is correct
-- since there's no one else in the branch to escalate to.
-- ============================================================================

create or replace function public.crm_pick_round_robin_sales_or_freelance(p_branch_id uuid, p_project_id uuid)
returns table(recipient_type text, recipient_id uuid, full_name text, phone text)
language sql
stable
security definer
set search_path = public
as $$
  with candidates as (
    select
      'sales'::text as recipient_type,
      e.id as recipient_id,
      e.full_name,
      e.phone,
      (
        select max(p.created_at) from public.prospects p
        where p.sales_id = e.id and p.lead_source = 'facebook_ads' and p.deleted_at is null
      ) as last_served_at
    from public.employees e
    join public.roles r on r.id = e.role_id
    where e.branch_id = p_branch_id
      and r.key = 'sales'
      and e.deleted_at is null
      and e.employment_status = 'active'
      and not e.ads_lead_routing_paused

    union all

    select
      'freelance'::text,
      f.id,
      f.full_name,
      f.phone,
      f.last_lead_sent_at
    from public.freelance_lead_recipients f
    where f.branch_id = p_branch_id
      and f.active
      and (f.project_id is null or f.project_id = p_project_id)
  ),
  fallback as (
    select
      'sales'::text as recipient_type,
      e.id as recipient_id,
      e.full_name,
      e.phone,
      (
        select max(p.created_at) from public.prospects p
        where p.sales_id = e.id and p.lead_source = 'facebook_ads' and p.deleted_at is null
      ) as last_served_at
    from public.employees e
    join public.roles r on r.id = e.role_id
    where e.branch_id = p_branch_id
      and r.key = 'kepala_cabang'
      and e.deleted_at is null
      and e.employment_status = 'active'
      and not exists (select 1 from candidates)
  )
  select recipient_type, recipient_id, full_name, phone
  from (select * from candidates union all select * from fallback) merged
  order by last_served_at asc nulls first
  limit 1;
$$;

comment on function public.crm_pick_round_robin_sales_or_freelance is
  'Least-recently-served fairness across Sales + freelance recipients (0092/0136) for a branch/project. Falls back to the branch''s active Kepala Cabang (returned as recipient_type=sales) when the branch has no active Sales or freelance recipient at all -- e.g. a newly opened branch like Management Property that only has a Kepala Cabang so far -- so ad leads never get silently dropped.';
