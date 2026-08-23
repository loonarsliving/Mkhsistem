-- ============================================================================
-- MK Connect — 0248: material alias resolution + contractor-sourced purchase
-- requests (punch list item #4 from "Peta Celah Stok Kontraktor").
--
-- Schema + resolution only -- NOT the WhatsApp AI recognition pipeline
-- itself. That's a genuinely separate build (new Gemini prompt, webhook
-- routing, testing against Anang's real phone flow, same shape as
-- lib/ai/domains/contractor-fund-request-recognition.ts) that deserves its
-- own dedicated pass, not something to bolt on silently inside this
-- migration set. What this DOES do: give cm_purchase_requests a way to
-- record who asked when the asker isn't an employee (source +
-- requested_by_contractor_id, mirroring contractor_wa_senders -- 0237),
-- and a lookup a future webhook handler can call to turn "semen" or
-- "matrial" into a real cm_materials row, the same way
-- contractor-fund-request-recognition.ts already resolves free text today.
--
-- Writes from a WhatsApp path go through the service-role admin client
-- (same posture as contractor_wa_senders/contractor_expense_reports, 0237)
-- and bypass RLS entirely -- they do NOT call cm_submit_purchase_request
-- (that RPC is auth.uid()-gated for employees only, unchanged here).
-- ============================================================================

create table public.cm_material_aliases (
  id uuid primary key default gen_random_uuid(),
  alias text not null,
  material_id uuid not null references public.cm_materials(id) on delete cascade,
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  unique (alias)
);
create index cm_material_aliases_material_idx on public.cm_material_aliases (material_id);

comment on table public.cm_material_aliases is
  'Free-text names (WA messages, handwritten nota) mapped to a real cm_materials row -- "matrial", "semen 3 roda" -> the catalog item. Populated by hand today via cm_submit_material_alias; an unmatched term is simply not resolved, never guessed.';

alter table public.cm_material_aliases enable row level security;
create policy cm_material_aliases_select on public.cm_material_aliases for select to authenticated using (true);

create or replace function public.cm_submit_material_alias(p_alias text, p_material_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if p_alias is null or trim(p_alias) = '' then
    raise exception 'Alias wajib diisi';
  end if;
  if not exists (select 1 from public.cm_materials where id = p_material_id) then
    raise exception 'Material tidak ditemukan';
  end if;

  insert into public.cm_material_aliases (alias, material_id, created_by)
  values (lower(trim(p_alias)), p_material_id, auth.uid())
  on conflict (alias) do update set material_id = excluded.material_id
  returning id into v_id;

  return v_id;
end;
$$;

-- Read-only lookup: exact alias match first, then a loose match against the
-- catalog's own name -- deliberately conservative (no fuzzy/similarity
-- scoring), returns null rather than guess when nothing matches.
create or replace function public.cm_resolve_material_alias(p_text text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select material_id from public.cm_material_aliases where alias = lower(trim(p_text)) limit 1),
    (select id from public.cm_materials where is_active = true and name ilike trim(p_text) limit 1)
  );
$$;

alter table public.cm_purchase_requests
  add column source text not null default 'app' check (source in ('app', 'whatsapp')),
  add column requested_by_contractor_id uuid references public.contractor_wa_senders(id);

comment on column public.cm_purchase_requests.source is
  'app = submitted in-app via cm_submit_purchase_request (employees only, existing path, unchanged). whatsapp = submitted by a non-employee contractor via the service-role admin client, requested_by_contractor_id identifies who.';

alter table public.cm_purchase_requests
  add constraint cm_purchase_requests_requester_check
  check (requested_by is not null or requested_by_contractor_id is not null);
