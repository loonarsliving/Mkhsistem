-- Lets a branch's ad-driven leads be routed to a single fixed employee
-- instead of the normal round-robin among that branch's Sales team.
-- Requested for Makassar: ads should go to Muhammad Syafiq, not the round
-- robin Sales pool, until this is cleared again (set back to null).
alter table public.branches
  add column ad_lead_override_employee_id uuid references public.employees(id);

comment on column public.branches.ad_lead_override_employee_id is
  'When set, routeAdDrivenLead() sends every NEW ad lead for this branch to this employee directly, bypassing the crm_pick_round_robin_sales_or_freelance round robin. Existing prospects / prior freelance deliveries are unaffected (they keep going to whoever already owns them). Set to null to restore normal round-robin routing.';

update public.branches
  set ad_lead_override_employee_id = '910fdec7-626f-4836-ab65-2ea69c8436b0' -- Muhammad Syafiq
  where id = '40cdf547-d9cb-4d59-aba3-265a2ba04da8'; -- Makassar
