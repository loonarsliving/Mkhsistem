-- ============================================================================
-- MK Connect — 0303: Loonars Connect, WhatsApp ad leads answered from Chat
--
-- Owner's request (2026-10-25): people who click a Meta ad land on the
-- company WhatsApp number; until now Sales took the number and chatted from
-- their own phone, so nothing was visible in the system. From now on, for
-- the Jogja branch, the conversation lives in Loonars Connect:
--
--   * the lead is handed out in turn to the Jogja ad-lead sales (owner's
--     choice: Ayu, Wahyuda, Fety -- the 'sales' role assignments of the
--     department below), least recently served first;
--   * the customer's WhatsApp messages land in that sales person's chat,
--     and what Sales types goes back to the customer's WhatsApp from the
--     company number (sent by the app through Whacenter);
--   * the first contact gets one greeting from the system (owner's text);
--   * the AI nurture bot does not answer these leads (owner's choice);
--   * the owner and Vando (owner-report permission / 'manager' role
--     assignment below) can read every lead conversation and move a lead
--     to another sales person, but do not answer the customer;
--   * no reply after 15 min -> reminder to the sales person; after 30 min ->
--     the owner and Vando are told. The lead stays where it is.
--
-- Model: one technical department 'lead_wa_jogja' (scope + rotation + texts
-- in settings, people in mkc_chat_role_assignments), one mkc_wa_leads row and
-- one conversation per lead. The conversation reuses kind 'direct' (a
-- private conversation with explicit members, source 'direct', which the
-- membership sync never touches) with direct_key 'wa:<lead id>'; this keeps
-- the existing constraints and indexes as they are. The customer's messages
-- are text messages without a sender (payload.wa = 'in'); Sales' messages
-- carry payload.wa = 'out' and the WhatsApp delivery status.
-- Each lead is also a CRM prospect (lead_source facebook_ads, ai_mode
-- standby), and a sales reply counts as its follow-up (last_follow_up_at).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Department + lead table
-- ----------------------------------------------------------------------------
insert into public.mkc_chat_departments (code, name, branch_id, timezone, settings)
select 'lead_wa_jogja', 'Lead WA Jogja', b.id, 'Asia/Jakarta', jsonb_build_object(
  'kind', 'wa_lead',
  'campaign_branch_codes', jsonb_build_array('JOG'),
  'monitor_owners', true,
  'alert_sales_minutes', 15,
  'alert_monitor_minutes', 30,
  'greeting', 'Terima kasih telah menghubungi Loonars, sales terbaik kami akan segera menghubungi Anda.',
  'retention_days', 30
)
from public.branches b where b.code = 'JOG'
on conflict (code) do nothing;

create table public.mkc_wa_leads (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.mkc_chat_departments(id) on delete cascade,
  conversation_id uuid not null unique references public.mkc_chat_conversations(id) on delete cascade,
  phone text not null check (phone ~ '^[0-9]{8,16}$'),
  customer_name text,
  prospect_id uuid references public.prospects(id) on delete set null,
  campaign_id uuid references public.meta_ad_campaigns(id) on delete set null,
  source_label text,
  assigned_sales_id uuid not null references public.employees(id),
  assigned_at timestamptz not null default now(),
  greeted_at timestamptz,
  last_inbound_at timestamptz,
  -- first customer message not yet answered by Sales (null = nothing pending)
  waiting_since timestamptz,
  last_sales_reply_at timestamptz,
  first_response_at timestamptz,
  -- the waiting_since value each alert was sent for (one alert per wait)
  alert_sales_for timestamptz,
  alert_monitor_for timestamptz,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);
create unique index mkc_wa_leads_open_phone_uidx on public.mkc_wa_leads (phone) where status = 'open';
create index mkc_wa_leads_sales_idx on public.mkc_wa_leads (department_id, assigned_sales_id, assigned_at desc);
create index mkc_wa_leads_waiting_idx on public.mkc_wa_leads (waiting_since) where waiting_since is not null and status = 'open';

-- ----------------------------------------------------------------------------
-- Access
-- ----------------------------------------------------------------------------
-- Owner (when settings.monitor_owners) or an active 'manager' assignment.
create or replace function public.mkc_wa_lead_is_monitor(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.mkc_chat_departments d
    where d.id = p_department_id and d.settings ->> 'kind' = 'wa_lead' and d.is_active
      and (
        (coalesce((d.settings ->> 'monitor_owners')::boolean, false) and public.app_has_permission('hospitality.owner_report'))
        or exists (
          select 1 from public.mkc_chat_role_assignments a
          where a.department_id = d.id and a.employee_id = auth.uid() and a.revoked_at is null
            and a.member_role = 'manager' and public.mkc_chat_employee_eligible(auth.uid())
        )
      )
  )
$$;

-- 0300 + monitors read lead conversations.
create or replace function public.mkc_chat_can_read(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.mkc_chat_conversations c
    where c.id = p_conversation_id
      and (
        (c.kind in ('operational_group', 'direct') and public.mkc_chat_my_role(c.id) is not null)
        or (c.kind = 'owner_feed' and public.app_has_permission('hospitality.owner_report'))
        or exists (select 1 from public.mkc_wa_leads l where l.conversation_id = c.id and public.mkc_wa_lead_is_monitor(l.department_id))
      )
  )
$$;

alter table public.mkc_wa_leads enable row level security;
create policy mkc_wa_leads_select on public.mkc_wa_leads for select using (public.mkc_chat_can_read(conversation_id));

-- Next sales person in turn: active 'sales' assignment, least recently given a lead.
create or replace function public.mkc_wa_lead_pick_sales(p_department_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.employee_id
  from public.mkc_chat_role_assignments a
  where a.department_id = p_department_id and a.member_role = 'sales' and a.revoked_at is null
    and public.mkc_chat_employee_eligible(a.employee_id)
  order by (select max(l.assigned_at) from public.mkc_wa_leads l
            where l.department_id = p_department_id and l.assigned_sales_id = a.employee_id) asc nulls first,
           a.created_at, a.employee_id
  limit 1
$$;

create or replace function public.mkc_wa_lead_in_rotation(p_department_id uuid, p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.mkc_chat_role_assignments a
    where a.department_id = p_department_id and a.employee_id = p_employee_id and a.member_role = 'sales'
      and a.revoked_at is null and public.mkc_chat_employee_eligible(p_employee_id)
  )
$$;

-- Monitors to alert: owners (if enabled) + active 'manager' assignments.
create or replace function public.mkc_wa_lead_monitor_ids(p_department_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct x), '{}')
  from (
    select unnest(case when coalesce((d.settings ->> 'monitor_owners')::boolean, false) then public.mkc_hosp_owner_ids() else '{}'::uuid[] end)
    from public.mkc_chat_departments d where d.id = p_department_id
    union all
    select a.employee_id from public.mkc_chat_role_assignments a
    where a.department_id = p_department_id and a.member_role = 'manager' and a.revoked_at is null
      and public.mkc_chat_employee_eligible(a.employee_id)
  ) s(x)
$$;

-- ----------------------------------------------------------------------------
-- Inbound (service role, called by the WhatsApp webhook)
-- ----------------------------------------------------------------------------
-- Stores a customer message in its open lead, or -- for a Meta ad (or an ad
-- whose project the customer named) of a branch in scope -- opens a new lead.
-- Returns {handled false} for anything else, so the caller's existing flow
-- (nurture bot, villa, ...) continues untouched.
create or replace function public.mkc_wa_lead_inbound(
  p_phone text, p_name text, p_body text, p_media_url text default null,
  p_ad_source_id text default null, p_project_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_name text := nullif(left(trim(coalesce(p_name, '')), 120), '');
  v_body text := left(coalesce(nullif(trim(coalesce(p_body, '')), ''), case when p_media_url is not null then '📷 Foto' else '(pesan)' end), 4000);
  v_lead public.mkc_wa_leads%rowtype;
  v_campaign record;
  v_campaign_id uuid;
  v_project record;
  v_branch_code text;
  v_dept public.mkc_chat_departments%rowtype;
  v_sales uuid;
  v_prospect record;
  v_prospect_id uuid;
  v_lead_id uuid := gen_random_uuid();
  v_conv uuid;
  v_label text;
begin
  if length(v_phone) < 8 then
    return jsonb_build_object('handled', false);
  end if;
  perform pg_advisory_xact_lock(hashtext('mkc_wa_lead:' || v_phone));

  select * into v_lead from public.mkc_wa_leads where phone = v_phone and status = 'open';
  if found then
    insert into public.mkc_chat_messages (conversation_id, sender_id, kind, body, payload)
    values (v_lead.conversation_id, null, 'text', v_body,
            jsonb_build_object('wa', 'in', 'media_url', p_media_url));
    update public.mkc_wa_leads
       set last_inbound_at = now(), waiting_since = coalesce(waiting_since, now()),
           customer_name = coalesce(customer_name, v_name)
     where id = v_lead.id;
    insert into public.mkc_notifications (user_id, type, title, body, link, category, metadata, status, is_read)
    select v_lead.assigned_sales_id, 'system', left('WA · ' || coalesce(v_lead.customer_name, v_name, '+' || v_phone), 200), left(v_body, 300),
           '/chat?c=' || v_lead.conversation_id, 'chat_message',
           jsonb_build_object('conversation_id', v_lead.conversation_id, 'wa_lead_id', v_lead.id), 'archived', true
    where public.mkc_chat_employee_eligible(v_lead.assigned_sales_id);
    return jsonb_build_object('handled', true, 'lead_id', v_lead.id, 'conversation_id', v_lead.conversation_id, 'is_new', false);
  end if;

  -- New lead: only from an ad (or the project the customer named) in scope.
  if p_ad_source_id is not null then
    select c.id, c.name, c.headline, c.project_id, c.branch_id into v_campaign
    from public.meta_ad_campaigns c
    where c.meta_ad_id = p_ad_source_id or c.meta_adset_id = p_ad_source_id or c.meta_creative_id = p_ad_source_id
    limit 1;
    if v_campaign.id is null then
      return jsonb_build_object('handled', false);
    end if;
    v_campaign_id := v_campaign.id;
    select p.id, p.name, p.city, p.project_type into v_project from public.crm_projects p where p.id = v_campaign.project_id;
    select b.code into v_branch_code from public.branches b where b.id = v_campaign.branch_id;
    v_label := coalesce(v_campaign.headline, v_campaign.name);
  elsif p_project_id is not null then
    select p.id, p.name, p.city, p.project_type, p.branch_id into v_project from public.crm_projects p where p.id = p_project_id;
    if v_project.id is null then
      return jsonb_build_object('handled', false);
    end if;
    select b.code into v_branch_code from public.branches b where b.id = v_project.branch_id;
    v_label := 'Iklan ' || v_project.name || ' (project dipilih customer)';
  else
    return jsonb_build_object('handled', false);
  end if;

  select * into v_dept from public.mkc_chat_departments d
  where d.is_active and d.settings ->> 'kind' = 'wa_lead'
    and v_branch_code in (select jsonb_array_elements_text(coalesce(d.settings -> 'campaign_branch_codes', '[]'::jsonb)))
  limit 1;
  if v_dept.id is null then
    return jsonb_build_object('handled', false);
  end if;

  -- An existing CRM prospect keeps its sales person when that person is in
  -- the rotation; otherwise the next in turn takes it.
  select p.id, p.sales_id into v_prospect from public.prospects p
  where p.phone_normalized = v_phone and p.deleted_at is null
  order by p.created_at desc limit 1;
  if v_prospect.id is not null and public.mkc_wa_lead_in_rotation(v_dept.id, v_prospect.sales_id) then
    v_sales := v_prospect.sales_id;
  else
    v_sales := public.mkc_wa_lead_pick_sales(v_dept.id);
  end if;
  if v_sales is null then
    return jsonb_build_object('handled', false);
  end if;

  if v_prospect.id is not null then
    v_prospect_id := v_prospect.id;
    update public.prospects set sales_id = v_sales, ai_mode = 'standby', updated_at = now()
     where id = v_prospect_id and (sales_id is distinct from v_sales or ai_mode <> 'standby');
  else
    insert into public.prospects (customer_name, phone, project_id, house_type, city, lead_source, notes, sales_id, branch_id, ai_mode)
    values (coalesce(v_name, 'Lead dari Iklan'), v_phone, v_project.id,
            case v_project.project_type when 'villa' then 'Villa' when 'subsidized' then 'Rumah Subsidi'
                 when 'commercial' then 'Komersial' when 'land' then 'Tanah Kavling' else 'Belum diketahui' end,
            coalesce(v_project.city, '-'), 'facebook_ads',
            format('Lead otomatis dari klik iklan "%s" — chat WA di Loonars Connect.', v_label),
            v_sales, v_dept.branch_id, 'standby')
    returning id into v_prospect_id;
  end if;

  insert into public.mkc_chat_conversations (department_id, kind, name, description, direct_key, created_by)
  values (v_dept.id, 'direct', coalesce(v_name, '+' || v_phone), 'Lead WA', 'wa:' || v_lead_id, v_sales)
  returning id into v_conv;
  insert into public.mkc_chat_members (conversation_id, employee_id, member_role, source)
  values (v_conv, v_sales, 'sales', 'direct');
  insert into public.mkc_wa_leads (id, department_id, conversation_id, phone, customer_name, prospect_id, campaign_id, source_label,
                                   assigned_sales_id, last_inbound_at, waiting_since)
  values (v_lead_id, v_dept.id, v_conv, v_phone, v_name, v_prospect_id, v_campaign_id, v_label, v_sales, now(), now());
  insert into public.mkc_chat_messages (conversation_id, sender_id, kind, body, payload)
  values (v_conv, null, 'system', format('📣 Lead baru dari iklan: %s', v_label), jsonb_build_object('wa', 'lead_opened'));
  insert into public.mkc_chat_messages (conversation_id, sender_id, kind, body, payload)
  values (v_conv, null, 'text', v_body, jsonb_build_object('wa', 'in', 'media_url', p_media_url));

  perform public.mkc_hosp_notify(array[v_sales], 'Lead WA baru: ' || coalesce(v_name, '+' || v_phone),
    format('Dari iklan %s. Balas langsung dari Chat.', v_label), '/chat?c=' || v_conv, 'new_ad_lead',
    jsonb_build_object('conversation_id', v_conv, 'wa_lead_id', v_lead_id, 'prospect_id', v_prospect_id));

  return jsonb_build_object('handled', true, 'lead_id', v_lead_id, 'conversation_id', v_conv, 'is_new', true,
                            'greeting', v_dept.settings ->> 'greeting');
end;
$$;

-- System message the app sent to the customer (the first-contact greeting).
create or replace function public.mkc_wa_lead_record_system_out(p_lead_id uuid, p_body text, p_ok boolean, p_error text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.mkc_wa_leads%rowtype;
  v_id uuid;
begin
  select * into v_lead from public.mkc_wa_leads where id = p_lead_id;
  if not found then
    raise exception 'Lead tidak ditemukan';
  end if;
  insert into public.mkc_chat_messages (conversation_id, sender_id, kind, body, payload)
  values (v_lead.conversation_id, null, 'text', left(coalesce(p_body, ''), 4000),
          jsonb_build_object('wa', 'out', 'auto', true, 'wa_status', case when p_ok then 'sent' else 'failed' end, 'wa_error', p_error))
  returning id into v_id;
  if p_ok then
    update public.mkc_wa_leads set greeted_at = coalesce(greeted_at, now()) where id = p_lead_id;
  end if;
  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Outbound (the assigned sales person, from Chat)
-- ----------------------------------------------------------------------------
-- Records Sales' message (status pending) and returns what the app needs to
-- send it on WhatsApp; the app reports the result to mkc_wa_lead_mark_out.
create or replace function public.mkc_wa_lead_queue_out(p_conversation_id uuid, p_body text, p_attachment_ids uuid[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.mkc_wa_leads%rowtype;
  v_id uuid;
  v_paths text[];
begin
  select * into v_lead from public.mkc_wa_leads where conversation_id = p_conversation_id;
  if not found then
    raise exception 'Bukan percakapan lead WA';
  end if;
  if v_lead.assigned_sales_id is distinct from auth.uid() or public.mkc_chat_my_role(p_conversation_id) is null then
    raise exception 'Hanya sales yang memegang lead ini yang bisa membalas' using errcode = '42501';
  end if;
  if v_lead.status <> 'open' then
    raise exception 'Lead ini sudah ditutup';
  end if;
  if length(trim(coalesce(p_body, ''))) = 0 and coalesce(cardinality(p_attachment_ids), 0) = 0 then
    raise exception 'Pesan kosong';
  end if;
  insert into public.mkc_chat_messages (conversation_id, sender_id, kind, body, payload)
  values (p_conversation_id, auth.uid(), 'text', left(trim(coalesce(p_body, '')), 4000), jsonb_build_object('wa', 'out', 'wa_status', 'pending'))
  returning id into v_id;
  perform public.mkc_chat_link_attachments(p_attachment_ids, p_conversation_id, v_id, null, null, null);
  select coalesce(array_agg(a.object_path order by a.uploaded_at), '{}') into v_paths
  from public.mkc_chat_attachments a where a.message_id = v_id and a.deleted_at is null;
  update public.mkc_wa_leads
     set last_sales_reply_at = now(), first_response_at = coalesce(first_response_at, now()), waiting_since = null
   where id = v_lead.id;
  -- A sales reply is the lead's follow-up in the CRM (stops the 30-min CRM escalation, feeds the reports).
  update public.prospects set last_follow_up_at = now(), updated_at = now() where id = v_lead.prospect_id;
  perform public.mkc_chat_mark_read(p_conversation_id);
  return jsonb_build_object('message_id', v_id, 'phone', v_lead.phone, 'object_paths', to_jsonb(v_paths));
end;
$$;

create or replace function public.mkc_wa_lead_mark_out(p_message_id uuid, p_ok boolean, p_error text default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.mkc_chat_messages
     set payload = payload || jsonb_build_object('wa_status', case when p_ok then 'sent' else 'failed' end, 'wa_error', p_error)
   where id = p_message_id and payload ->> 'wa' = 'out'
$$;

-- ----------------------------------------------------------------------------
-- Move a lead to another sales person (owner / Vando)
-- ----------------------------------------------------------------------------
create or replace function public.mkc_wa_lead_reassign(p_lead_id uuid, p_sales_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.mkc_wa_leads%rowtype;
  v_from text;
  v_to text;
  v_by text;
begin
  select * into v_lead from public.mkc_wa_leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead tidak ditemukan';
  end if;
  if not public.mkc_wa_lead_is_monitor(v_lead.department_id) then
    raise exception 'Hanya owner atau manajer lead yang bisa memindahkan lead' using errcode = '42501';
  end if;
  if not public.mkc_wa_lead_in_rotation(v_lead.department_id, p_sales_id) then
    raise exception 'Sales tujuan tidak ada di daftar giliran lead';
  end if;
  if p_sales_id = v_lead.assigned_sales_id then
    raise exception 'Lead sudah dipegang sales ini';
  end if;

  update public.mkc_chat_members set removed_at = now()
   where conversation_id = v_lead.conversation_id and employee_id = v_lead.assigned_sales_id and removed_at is null;
  insert into public.mkc_chat_members (conversation_id, employee_id, member_role, source)
  values (v_lead.conversation_id, p_sales_id, 'sales', 'direct')
  on conflict (conversation_id, employee_id) do update set removed_at = null, member_role = 'sales', source = 'direct', joined_at = now();
  update public.mkc_wa_leads set assigned_sales_id = p_sales_id, assigned_at = now() where id = p_lead_id;
  update public.prospects set sales_id = p_sales_id, updated_at = now() where id = v_lead.prospect_id;

  select full_name into v_from from public.employees where id = v_lead.assigned_sales_id;
  select full_name into v_to from public.employees where id = p_sales_id;
  select full_name into v_by from public.employees where id = auth.uid();
  perform public.mkc_chat_post(v_lead.conversation_id, 'system', format('↪️ Lead dipindahkan dari %s ke %s oleh %s', v_from, v_to, v_by),
    null, null, jsonb_build_object('wa', 'reassigned'), null);
  perform public.mkc_hosp_notify(array[p_sales_id], 'Lead WA dipindahkan ke Anda: ' || coalesce(v_lead.customer_name, '+' || v_lead.phone),
    format('Dari %s, oleh %s. Balas langsung dari Chat.', v_from, v_by), '/chat?c=' || v_lead.conversation_id, 'new_ad_lead',
    jsonb_build_object('conversation_id', v_lead.conversation_id, 'wa_lead_id', p_lead_id));
end;
$$;

-- ----------------------------------------------------------------------------
-- Reply-time alerts (pg_cron every 2 minutes)
-- ----------------------------------------------------------------------------
create or replace function public.mkc_wa_lead_alerts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count integer := 0;
  v_sales text;
  v_minutes integer;
begin
  for r in
    select l.*, d.settings
    from public.mkc_wa_leads l join public.mkc_chat_departments d on d.id = l.department_id
    where l.status = 'open' and l.waiting_since is not null and d.is_active
  loop
    v_minutes := floor(extract(epoch from (now() - r.waiting_since)) / 60);
    if v_minutes >= coalesce((r.settings ->> 'alert_sales_minutes')::integer, 15)
       and r.alert_sales_for is distinct from r.waiting_since then
      perform public.mkc_hosp_notify(array[r.assigned_sales_id],
        'Lead WA menunggu balasan: ' || coalesce(r.customer_name, '+' || r.phone),
        format('Sudah %s menit belum dibalas. Balas sekarang dari Chat.', v_minutes),
        '/chat?c=' || r.conversation_id, 'ad_lead_followup_reminder',
        jsonb_build_object('conversation_id', r.conversation_id, 'wa_lead_id', r.id));
      update public.mkc_wa_leads set alert_sales_for = r.waiting_since where id = r.id;
      v_count := v_count + 1;
    end if;
    if v_minutes >= coalesce((r.settings ->> 'alert_monitor_minutes')::integer, 30)
       and r.alert_monitor_for is distinct from r.waiting_since then
      select full_name into v_sales from public.employees where id = r.assigned_sales_id;
      perform public.mkc_hosp_notify(public.mkc_wa_lead_monitor_ids(r.department_id),
        format('Lead WA belum dibalas %s menit', v_minutes),
        format('%s (sales %s) belum dibalas. Buka untuk memantau atau memindahkan lead.', coalesce(r.customer_name, '+' || r.phone), v_sales),
        '/chat?c=' || r.conversation_id, 'ad_lead_escalation_branch',
        jsonb_build_object('conversation_id', r.conversation_id, 'wa_lead_id', r.id));
      update public.mkc_wa_leads set alert_monitor_for = r.waiting_since where id = r.id;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

select cron.schedule('connect-wa-lead-reply-alerts', '*/2 * * * *', 'select public.mkc_wa_lead_alerts()');

-- ----------------------------------------------------------------------------
-- Monitoring numbers (owner / Vando): per sales person
-- ----------------------------------------------------------------------------
create or replace function public.mkc_wa_lead_stats(p_department_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_dept public.mkc_chat_departments%rowtype;
  v_today date;
begin
  select * into v_dept from public.mkc_chat_departments where code = p_department_code;
  if v_dept.id is null or not public.mkc_wa_lead_is_monitor(v_dept.id) then
    raise exception 'Tidak punya akses' using errcode = '42501';
  end if;
  v_today := (now() at time zone v_dept.timezone)::date;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'sales_id', a.employee_id,
      'name', e.full_name,
      'leads_today', (select count(*) from public.mkc_wa_leads l where l.department_id = v_dept.id and l.assigned_sales_id = a.employee_id
                        and (l.created_at at time zone v_dept.timezone)::date = v_today),
      'leads_7d', (select count(*) from public.mkc_wa_leads l where l.department_id = v_dept.id and l.assigned_sales_id = a.employee_id
                     and l.created_at >= now() - interval '7 days'),
      'waiting', (select count(*) from public.mkc_wa_leads l where l.department_id = v_dept.id and l.assigned_sales_id = a.employee_id
                    and l.status = 'open' and l.waiting_since is not null),
      'oldest_waiting_since', (select min(l.waiting_since) from public.mkc_wa_leads l where l.department_id = v_dept.id
                                 and l.assigned_sales_id = a.employee_id and l.status = 'open'),
      'avg_first_response_min_7d', (select round(avg(extract(epoch from (l.first_response_at - l.created_at)) / 60)::numeric, 1)
                                      from public.mkc_wa_leads l where l.department_id = v_dept.id and l.assigned_sales_id = a.employee_id
                                        and l.first_response_at is not null and l.created_at >= now() - interval '7 days')
    ) order by e.full_name)
    from public.mkc_chat_role_assignments a
    join public.employees e on e.id = a.employee_id
    where a.department_id = v_dept.id and a.member_role = 'sales' and a.revoked_at is null
  ), '[]'::jsonb);
end;
$$;

-- ----------------------------------------------------------------------------
-- Chat list + sending: lead conversations
-- ----------------------------------------------------------------------------
-- 0300 list + lead conversations: named after the customer, with the lead's
-- facts (sales person, waiting since) for the list and the monitor view.
create or replace function public.mkc_chat_list()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.last_at desc nulls last), '[]'::jsonb)
  from (
    select c.id, c.kind,
           case when wl.id is not null then coalesce(wl.customer_name, '+' || wl.phone)
                when c.kind = 'direct' then coalesce(peer.full_name, 'Karyawan') else c.name end as name,
           case when wl.id is not null then concat_ws(' · ', 'WA', wl.sales_name)
                when c.kind = 'direct' then concat_ws(' · ', peer.position_name, peer.branch_name) else c.description end as description,
           d.code as department_code, d.name as department_name,
           public.mkc_chat_my_role(c.id) as my_role,
           (select count(*) from public.mkc_chat_members m where m.conversation_id = c.id and m.removed_at is null) as member_count,
           lm.created_at as last_at, lm.body as last_body, lm.kind as last_kind,
           (select e.full_name from public.employees e where e.id = lm.sender_id) as last_sender,
           (select count(*) from public.mkc_chat_messages x
             where x.conversation_id = c.id and x.sender_id is distinct from auth.uid()
               and x.created_at > coalesce((select r.last_read_at from public.mkc_chat_reads r
                                            where r.conversation_id = c.id and r.employee_id = auth.uid()), '-infinity'::timestamptz)
           ) as unread,
           case when wl.id is null then peer.id end as peer_id,
           case when wl.id is not null then jsonb_build_object(
             'lead_id', wl.id, 'phone', wl.phone, 'sales_id', wl.assigned_sales_id, 'sales_name', wl.sales_name,
             'waiting_since', wl.waiting_since, 'source', wl.source_label, 'status', wl.status,
             'can_reply', wl.assigned_sales_id = auth.uid(), 'monitor', public.mkc_wa_lead_is_monitor(wl.department_id)
           ) end as wa_lead
    from public.mkc_chat_conversations c
    join public.mkc_chat_departments d on d.id = c.department_id and d.is_active
    left join lateral (
      select l.*, (select e.full_name from public.employees e where e.id = l.assigned_sales_id) as sales_name
      from public.mkc_wa_leads l where l.conversation_id = c.id
    ) wl on true
    left join lateral (
      select * from public.mkc_chat_messages m where m.conversation_id = c.id order by m.created_at desc limit 1
    ) lm on true
    left join lateral (
      select e.id, e.full_name, b.name as branch_name, p.name as position_name
      from public.mkc_chat_members m
      join public.employees e on e.id = m.employee_id
      left join public.branches b on b.id = e.branch_id
      left join public.positions p on p.id = e.position_id
      where c.kind = 'direct' and wl.id is null and m.conversation_id = c.id and m.employee_id <> auth.uid()
      limit 1
    ) peer on true
    where public.mkc_chat_can_read(c.id)
      and (c.kind <> 'direct' or wl.id is not null or lm.id is not null or c.created_by = auth.uid())
  ) t
$$;

-- 0301 send: a lead conversation is answered through mkc_wa_lead_queue_out
-- (it must reach the customer's WhatsApp), never as an internal message.
create or replace function public.mkc_chat_send_message(
  p_conversation_id uuid, p_body text, p_attachment_ids uuid[] default '{}', p_reply_to_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_kind text;
begin
  select kind into v_kind from public.mkc_chat_conversations where id = p_conversation_id;
  if v_kind is null or v_kind not in ('operational_group', 'direct') or public.mkc_chat_my_role(p_conversation_id) is null then
    raise exception 'Anda bukan anggota percakapan ini' using errcode = '42501';
  end if;
  if exists (select 1 from public.mkc_wa_leads where conversation_id = p_conversation_id) then
    raise exception 'Percakapan lead WA dibalas lewat WhatsApp';
  end if;
  if length(trim(coalesce(p_body, ''))) = 0 and coalesce(cardinality(p_attachment_ids), 0) = 0 then
    raise exception 'Pesan kosong';
  end if;
  if p_reply_to_id is not null
     and not exists (select 1 from public.mkc_chat_messages m where m.id = p_reply_to_id and m.conversation_id = p_conversation_id) then
    raise exception 'Pesan yang dibalas tidak ditemukan di percakapan ini';
  end if;
  insert into public.mkc_chat_messages (conversation_id, sender_id, kind, body, reply_to_id)
  values (p_conversation_id, auth.uid(), 'text', left(trim(coalesce(p_body, '')), 4000), p_reply_to_id)
  returning id into v_id;
  perform public.mkc_chat_link_attachments(p_attachment_ids, p_conversation_id, v_id, null, null, null);
  perform public.mkc_chat_mark_read(p_conversation_id);
  return v_id;
end;
$$;

create or replace function public.mkc_chat_send_text(p_conversation_id uuid, p_body text, p_attachment_ids uuid[] default '{}')
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.mkc_chat_send_message(p_conversation_id, p_body, p_attachment_ids, null)
$$;

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------
revoke execute on function
  public.mkc_wa_lead_pick_sales(uuid),
  public.mkc_wa_lead_in_rotation(uuid, uuid),
  public.mkc_wa_lead_monitor_ids(uuid),
  public.mkc_wa_lead_inbound(text, text, text, text, text, uuid),
  public.mkc_wa_lead_record_system_out(uuid, text, boolean, text),
  public.mkc_wa_lead_mark_out(uuid, boolean, text),
  public.mkc_wa_lead_alerts()
from public, anon, authenticated;

grant execute on function
  public.mkc_wa_lead_inbound(text, text, text, text, text, uuid),
  public.mkc_wa_lead_record_system_out(uuid, text, boolean, text),
  public.mkc_wa_lead_mark_out(uuid, boolean, text)
to service_role;

revoke execute on function
  public.mkc_wa_lead_is_monitor(uuid),
  public.mkc_wa_lead_queue_out(uuid, text, uuid[]),
  public.mkc_wa_lead_reassign(uuid, uuid),
  public.mkc_wa_lead_stats(text)
from public, anon;

grant execute on function
  public.mkc_wa_lead_is_monitor(uuid),
  public.mkc_wa_lead_queue_out(uuid, text, uuid[]),
  public.mkc_wa_lead_reassign(uuid, uuid),
  public.mkc_wa_lead_stats(text)
to authenticated;
