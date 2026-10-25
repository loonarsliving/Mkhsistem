-- ============================================================================
-- MK Connect — 0304: Loonars Connect WA leads, recognise ad clicks without ad data
--
-- 0303 opens a lead when the inbound message carries Meta's ad data
-- (Whacenter's ad_reply.source_id). Production logs show Whacenter changed its
-- webhook payload on 2026-09-06 (new from_jid / lid fields) and has not sent
-- ad_reply since: between 2026-09-07 and 2026-10-13, 87 first messages with
-- Meta's Click-to-WhatsApp pre-filled text ("Halo! Bisakah saya mendapatkan
-- info selengkapnya tentang ini?") arrived with no ad data, so no ad lead
-- was recognised at all.
--
-- From now on, a message without ad data still opens a lead when it is an
-- ad's pre-filled first message:
--   1. exactly an active campaign's own welcome_message -> that campaign;
--   2. starts with one of Meta's default pre-filled texts (settings
--      ad_prefill_prefixes of a wa_lead department) -> the active WhatsApp
--      campaign, as long as every active campaign belongs to one branch (the
--      text does not say which ad was tapped; with several branches running
--      ads at once nothing is guessed and the existing flow continues).
-- The branch must still be in a lead department's scope (Jogja), exactly as
-- for a message with ad data. Follow-ups, rotation, greeting: unchanged.
--
-- Also mkc_wa_lead_my_monitor_departments(): the lead departments the caller
-- monitors, so the monitor view is reachable before the first lead arrives.
-- ============================================================================

update public.mkc_chat_departments
   set settings = settings || jsonb_build_object('ad_prefill_prefixes', jsonb_build_array(
     'Halo! Bisakah saya mendapatkan info selengkapnya tentang ini',
     'Halo! Bisa minta info lebih lanjut tentang ini',
     'Hello! Can I get more info on this'))
 where code = 'lead_wa_jogja';

-- The active WhatsApp campaign an ad's pre-filled first message points to, or null.
create or replace function public.mkc_wa_lead_prefill_campaign(p_body text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with msg as (
    select lower(regexp_replace(trim(coalesce(p_body, '')), '\s+', ' ', 'g')) as t
  ), active as (
    select c.id, c.branch_id, c.welcome_message, c.updated_at
    from public.meta_ad_campaigns c
    where c.status = 'active' and c.meta_ad_id is not null
  )
  select coalesce(
    (select a.id from active a, msg
      where msg.t <> '' and a.welcome_message is not null
        and lower(regexp_replace(trim(a.welcome_message), '\s+', ' ', 'g')) = msg.t
      order by a.updated_at desc limit 1),
    (select a.id from active a
      where (select count(distinct x.branch_id) from active x) = 1
        and exists (
          select 1 from msg, public.mkc_chat_departments d,
                 jsonb_array_elements_text(coalesce(d.settings -> 'ad_prefill_prefixes', '[]'::jsonb)) p(prefix)
          where d.is_active and d.settings ->> 'kind' = 'wa_lead' and length(p.prefix) > 0
            and left(msg.t, length(p.prefix)) = lower(regexp_replace(trim(p.prefix), '\s+', ' ', 'g'))
        )
      order by a.updated_at desc limit 1)
  )
$$;

-- 0303 inbound + the pre-filled message path (only the final "else" changed).
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
    -- 0304: no ad data (Whacenter dropped ad_reply on 2026-09-06) -> the
    -- ad's pre-filled first message identifies the click.
    v_campaign_id := public.mkc_wa_lead_prefill_campaign(p_body);
    if v_campaign_id is null then
      return jsonb_build_object('handled', false);
    end if;
    select c.id, c.name, c.headline, c.project_id, c.branch_id into v_campaign
    from public.meta_ad_campaigns c where c.id = v_campaign_id;
    select p.id, p.name, p.city, p.project_type into v_project from public.crm_projects p where p.id = v_campaign.project_id;
    select b.code into v_branch_code from public.branches b where b.id = v_campaign.branch_id;
    v_label := coalesce(v_campaign.headline, v_campaign.name);
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

-- Lead departments the caller watches (owner / lead manager).
create or replace function public.mkc_wa_lead_my_monitor_departments()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(d.code order by d.code), '{}')
  from public.mkc_chat_departments d
  where d.is_active and d.settings ->> 'kind' = 'wa_lead' and public.mkc_wa_lead_is_monitor(d.id)
$$;

revoke execute on function public.mkc_wa_lead_prefill_campaign(text) from public, anon, authenticated;
revoke execute on function public.mkc_wa_lead_inbound(text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.mkc_wa_lead_inbound(text, text, text, text, text, uuid) to service_role;
revoke execute on function public.mkc_wa_lead_my_monitor_departments() from public, anon;
grant execute on function public.mkc_wa_lead_my_monitor_departments() to authenticated;
