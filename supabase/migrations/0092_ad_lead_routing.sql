-- ============================================================================
-- MK Connect — 0092: Round-robin sales picker for ad-driven WhatsApp leads
--
-- Supports the new ad-click -> prospect -> sales routing pipeline
-- (lib/ai/domains/ad-lead-routing.ts). Stateless round robin: no rotating
-- pointer table needed -- always pick the active sales rep in the branch
-- whose most recent ad-sourced prospect is oldest (or who has never
-- received one, which sorts first via nulls first). Self-balancing even if
-- a rep is added/removed or a run is missed.
-- ============================================================================

create or replace function public.crm_pick_round_robin_sales(p_branch_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.id
  from public.employees e
  join public.roles r on r.id = e.role_id
  where e.branch_id = p_branch_id
    and r.key = 'sales'
    and e.deleted_at is null
    and e.employment_status = 'active'
  order by (
    select max(p.created_at) from public.prospects p
    where p.sales_id = e.id and p.lead_source = 'facebook_ads' and p.deleted_at is null
  ) asc nulls first
  limit 1;
$$;
