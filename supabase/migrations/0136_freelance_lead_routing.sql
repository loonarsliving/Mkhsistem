-- ============================================================================
-- MK Connect — 0136: Route ad leads to a freelance sales agent via WhatsApp,
-- without giving them any system login
--
-- Freelance agents work entirely outside MK Connect (no employees row, no
-- auth account, no CRM access) -- they just get a WhatsApp message with the
-- lead's name/phone/ad source and follow up on their own. Ads themselves
-- stay fully managed by internal Markom/Direktur (ad_campaign.manage is
-- never granted to a freelancer, and there is no login for them to use it
-- with anyway).
--
-- freelance_lead_recipients / freelance_lead_deliveries are deliberately
-- NOT wired into prospects/sales_id -- that FK chain (CRM dashboards,
-- targets, commission, SP1 warnings, follow-up escalation) assumes a real
-- employees row with a role and login, which a freelancer explicitly
-- shouldn't have. deliveries is just a lightweight log so the company can
-- still see which leads went to the freelancer (ad-performance visibility),
-- without pulling them into the employee/CRM machinery.
--
-- crm_pick_round_robin_sales_or_freelance extends the existing "whoever's
-- least-recently-served" fairness (0092/0119) with freelance candidates in
-- the same ordering, so leads split evenly between internal Sales and the
-- freelancer instead of freelance getting a separate, uncoordinated stream.
-- ============================================================================

create table public.freelance_lead_recipients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  branch_id uuid not null references public.branches(id),
  project_id uuid references public.crm_projects(id),
  active boolean not null default true,
  last_lead_sent_at timestamptz,
  notes text,
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now()
);
alter table public.freelance_lead_recipients enable row level security;
comment on table public.freelance_lead_recipients is
  'External freelance sales agents who receive ad leads via WhatsApp only -- no employees row, no login, no CRM access. project_id null means the freelancer covers every project in that branch. Managed by super_admin directly (no self-service UI yet).';

create table public.freelance_lead_deliveries (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.freelance_lead_recipients(id),
  customer_name text,
  phone text not null,
  phone_normalized text generated always as (regexp_replace(phone, '[^0-9]', '', 'g')) stored,
  campaign_id uuid references public.meta_ad_campaigns(id),
  sent_at timestamptz not null default now()
);
create index freelance_lead_deliveries_phone_idx on public.freelance_lead_deliveries (phone_normalized);
alter table public.freelance_lead_deliveries enable row level security;
comment on table public.freelance_lead_deliveries is
  'Log-only record of ad leads routed to a freelance recipient (0136) -- lets a repeat click from the same number re-notify the same freelancer instead of being mistaken for a brand new lead, and gives the company visibility into freelance-routed lead volume for ad-performance reporting. Never read by the freelancer themselves -- they have no login.';

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
  )
  select recipient_type, recipient_id, full_name, phone
  from candidates
  order by last_served_at asc nulls first
  limit 1;
$$;

comment on function public.crm_pick_round_robin_sales_or_freelance is
  'Same least-recently-served fairness as crm_pick_round_robin_sales (0092), extended with freelance_lead_recipients as equal-weight candidates -- called from routeAdDrivenLead (ad-lead-routing.ts) instead of the sales-only version whenever any active freelance recipient exists for the branch/project.';
