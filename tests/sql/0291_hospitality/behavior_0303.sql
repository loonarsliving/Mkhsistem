-- Behaviour suite for 0303 (WhatsApp ad leads answered from Loonars Connect).
-- Run on a fresh DB: stubs.sql, then migrations 0291..0303, then this file.
\set ON_ERROR_STOP 1
\set owner   '''00000000-0000-0000-0000-0000000000a1'''
\set vando   '''00000000-0000-0000-0000-000000000301'''
\set sa      '''00000000-0000-0000-0000-000000000401'''
\set sb      '''00000000-0000-0000-0000-000000000402'''
\set sc      '''00000000-0000-0000-0000-000000000403'''
\set sx      '''00000000-0000-0000-0000-000000000404'''
\set mks     '''00000000-0000-0000-0000-000000000405'''

create table t_results (n serial, name text, ok boolean, detail text);
create function t_check(p_name text, p_ok boolean, p_detail text default null) returns void language sql as $$ insert into t_results(name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail) $$;
grant insert, select on t_results to authenticated; grant usage on sequence t_results_n_seq to authenticated; grant execute on function t_check to authenticated;
create function t_expect_error(p_name text, p_sql text) returns void language plpgsql as $$
begin execute p_sql; perform t_check(p_name, false, 'no error raised');
exception when others then perform t_check(p_name, true, sqlerrm); end $$;
grant execute on function t_expect_error to authenticated;

insert into branches (code, name) values ('MKS', 'Makassar') on conflict do nothing;
insert into employees (id, full_name, branch_id, role_id, approval_status, is_active)
select :owner::uuid, 'Owner', (select id from branches where code='JOG'), (select id from roles where key='super_admin'), 'approved', true union all
select :vando::uuid, 'Vando', (select id from branches where code='JOG'), (select id from roles where key='staff'), 'approved', true union all
select :sa::uuid, 'Ayu', (select id from branches where code='JOG'), (select id from roles where key='staff'), 'approved', true union all
select :sb::uuid, 'Wahyuda', (select id from branches where code='JOG'), (select id from roles where key='staff'), 'approved', true union all
select :sc::uuid, 'Fety', (select id from branches where code='JOG'), (select id from roles where key='staff'), 'approved', true union all
select :sx::uuid, 'Nyarso', (select id from branches where code='JOG'), (select id from roles where key='staff'), 'approved', true union all
select :mks::uuid, 'Sales Makassar', (select id from branches where code='MKS'), (select id from roles where key='staff'), 'approved', true;

insert into crm_projects (id, name, city, project_type, branch_id) values
  ('10000000-0000-0000-0000-00000000c001', 'Loonars Living 2', 'Yogyakarta', 'subsidized', (select id from branches where code='JOG')),
  ('10000000-0000-0000-0000-00000000c002', 'Cendana', 'Makassar', 'subsidized', (select id from branches where code='MKS'));
insert into meta_ad_campaigns (name, headline, project_id, branch_id, meta_ad_id) values
  ('Loonars living 2 - Leads WA', 'Rumah Loonars 2', '10000000-0000-0000-0000-00000000c001', (select id from branches where code='JOG'), 'AD-JOG'),
  ('Cendana - Leads WA', 'Cendana', '10000000-0000-0000-0000-00000000c002', (select id from branches where code='MKS'), 'AD-MKS');

select set_config('t.dept', (select id::text from mkc_chat_departments where code = 'lead_wa_jogja'), false);
insert into mkc_chat_role_assignments (department_id, employee_id, member_role)
select current_setting('t.dept')::uuid, x, 'sales' from unnest(array[:sa::uuid, :sb::uuid, :sc::uuid]) x;
insert into mkc_chat_role_assignments (department_id, employee_id, member_role)
values (current_setting('t.dept')::uuid, :vando::uuid, 'manager');

select t_check('0303: lead department exists with the owner greeting and 15/30 min alerts',
  (select settings->>'greeting' = 'Terima kasih telah menghubungi Loonars, sales terbaik kami akan segera menghubungi Anda.'
          and (settings->>'alert_sales_minutes')::int = 15 and (settings->>'alert_monitor_minutes')::int = 30
   from mkc_chat_departments where code = 'lead_wa_jogja'));
select t_check('0303: reply-time alert job scheduled', exists (select 1 from cron.job where jobname = 'connect-wa-lead-reply-alerts'));

-- Out of scope: other branch's ad, unknown ad, a stranger with no lead.
select t_check('0303: Makassar ad is not handled (existing flow continues)', (mkc_wa_lead_inbound('628000000001', 'A', 'halo', null, 'AD-MKS', null)->>'handled')::boolean = false);
select t_check('0303: unknown ad is not handled', (mkc_wa_lead_inbound('628000000001', 'A', 'halo', null, 'AD-XXX', null)->>'handled')::boolean = false);
select t_check('0303: a stranger without an ad or open lead is not handled', (mkc_wa_lead_inbound('628000000001', 'A', 'halo', null, null, null)->>'handled')::boolean = false);

-- New lead from the Jogja ad.
select set_config('t.r1', mkc_wa_lead_inbound('628111111111', 'Budi', 'Halo, info rumah?', null, 'AD-JOG', null)::text, false);
select set_config('t.lead1', current_setting('t.r1')::jsonb->>'lead_id', false);
select set_config('t.conv1', current_setting('t.r1')::jsonb->>'conversation_id', false);
select t_check('0303: Jogja ad opens a new lead with the greeting to send',
  (current_setting('t.r1')::jsonb->>'handled')::boolean and (current_setting('t.r1')::jsonb->>'is_new')::boolean
  and current_setting('t.r1')::jsonb->>'greeting' like 'Terima kasih telah menghubungi Loonars%');
select set_config('t.s1', (select assigned_sales_id::text from mkc_wa_leads where id = current_setting('t.lead1')::uuid), false);
select t_check('0303: first lead goes to a sales person in the rotation (not Nyarso)', current_setting('t.s1')::uuid in (:sa::uuid, :sb::uuid, :sc::uuid));
select t_check('0303: the lead is a CRM prospect: facebook_ads, AI standby, owned by the same sales person',
  (select p.lead_source = 'facebook_ads' and p.ai_mode = 'standby' and p.sales_id = current_setting('t.s1')::uuid and p.customer_name = 'Budi'
          and p.branch_id = (select id from branches where code='JOG')
   from prospects p join mkc_wa_leads l on l.prospect_id = p.id where l.id = current_setting('t.lead1')::uuid));
select t_check('0303: conversation has only the assigned sales person as member (source direct)',
  (select string_agg(employee_id::text || ':' || member_role || ':' || source, ',') from mkc_chat_members
   where conversation_id = current_setting('t.conv1')::uuid and removed_at is null) = current_setting('t.s1') || ':sales:direct');
select t_check('0303: customer message stored without a sender, marked wa=in',
  exists (select 1 from mkc_chat_messages where conversation_id = current_setting('t.conv1')::uuid and sender_id is null
          and body = 'Halo, info rumah?' and payload->>'wa' = 'in'));
select t_check('0303: sales person gets a new-lead notification (in app, not the WhatsApp relay)',
  exists (select 1 from mkc_notifications where user_id = current_setting('t.s1')::uuid and category = 'new_ad_lead' and link = '/chat?c=' || current_setting('t.conv1')));

-- Rotation: next three leads go to the two others, then back.
select mkc_wa_lead_inbound('628222222222', 'Citra', 'halo', null, 'AD-JOG', null);
select mkc_wa_lead_inbound('628333333333', 'Dewi', 'halo', null, 'AD-JOG', null);
select t_check('0303: three leads -> three different sales people',
  (select count(distinct assigned_sales_id) from mkc_wa_leads) = 3);
select mkc_wa_lead_inbound('628444444444', 'Eko', 'halo', null, 'AD-JOG', null);
select t_check('0303: the fourth lead goes back to whoever was served first',
  (select assigned_sales_id from mkc_wa_leads where phone = '628444444444') = current_setting('t.s1')::uuid);

-- Follow-up message (no ad on it) lands in the same open lead.
select set_config('t.r1b', mkc_wa_lead_inbound('+62 811-1111-111', 'Budi', 'Masih ada unit?', 'https://media.example/x.jpg', null, null)::text, false);
select t_check('0303: follow-up from the same number joins the open lead (not a new one)',
  current_setting('t.r1b')::jsonb->>'lead_id' = current_setting('t.lead1') and not (current_setting('t.r1b')::jsonb->>'is_new')::boolean
  and (select count(*) from mkc_wa_leads where phone = '628111111111') = 1);
select t_check('0303: photo URL kept on the inbound message',
  exists (select 1 from mkc_chat_messages where conversation_id = current_setting('t.conv1')::uuid and payload->>'media_url' = 'https://media.example/x.jpg'));
select t_check('0303: a repeat ad click from an open lead also joins it',
  (mkc_wa_lead_inbound('628111111111', 'Budi', 'klik lagi', null, 'AD-JOG', null)->>'is_new')::boolean = false);

-- Greeting recorded.
select mkc_wa_lead_record_system_out(current_setting('t.lead1')::uuid, 'Terima kasih telah menghubungi Loonars, sales terbaik kami akan segera menghubungi Anda.', true);
select t_check('0303: greeting stored as an automatic outgoing message, lead marked greeted',
  exists (select 1 from mkc_chat_messages where conversation_id = current_setting('t.conv1')::uuid and payload->>'auto' = 'true' and payload->>'wa_status' = 'sent')
  and (select greeted_at is not null from mkc_wa_leads where id = current_setting('t.lead1')::uuid));

-- Who sees what.
select set_config('t.other', (select x::text from unnest(array[:sa::uuid, :sb::uuid, :sc::uuid]) x where x <> current_setting('t.s1')::uuid limit 1), false);
set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('t.s1'), false);
select t_check('0303: the assigned sales person reads the lead and can reply',
  exists (select 1 from mkc_chat_messages where conversation_id = current_setting('t.conv1')::uuid and body = 'Masih ada unit?')
  and (select (x->'wa_lead'->>'can_reply')::boolean from jsonb_array_elements(mkc_chat_list()) x where x->>'id' = current_setting('t.conv1')));
select t_expect_error('0303: a lead conversation cannot get an internal (non-WhatsApp) message',
  format('select mkc_chat_send_message(%L, %L, %L)', current_setting('t.conv1'), 'catatan', '{}'));
select set_config('t.out', mkc_wa_lead_queue_out(current_setting('t.conv1')::uuid, 'Halo Kak Budi, masih ada!', '{}')::text, false);
select t_check('0303: sales reply queued for WhatsApp with the customer number',
  current_setting('t.out')::jsonb->>'phone' = '628111111111'
  and exists (select 1 from mkc_chat_messages where id = (current_setting('t.out')::jsonb->>'message_id')::uuid and payload->>'wa_status' = 'pending'));
select t_expect_error('0303: the assigned sales person cannot reassign', format('select mkc_wa_lead_reassign(%L, %L)', current_setting('t.lead1'), current_setting('t.other')));
select t_expect_error('0303: sales cannot read the monitoring numbers', 'select mkc_wa_lead_stats(''lead_wa_jogja'')');

select set_config('request.jwt.claim.sub', current_setting('t.other'), false);
select t_check('0303: another sales person cannot read someone else''s lead',
  not exists (select 1 from mkc_chat_messages where conversation_id = current_setting('t.conv1')::uuid)
  and not exists (select 1 from mkc_wa_leads where id = current_setting('t.lead1')::uuid));
select t_expect_error('0303: another sales person cannot reply to it',
  format('select mkc_wa_lead_queue_out(%L, %L, %L)', current_setting('t.conv1'), 'x', '{}'));

select set_config('request.jwt.claim.sub', :sx, false);
select t_check('0303: Nyarso (not in the rotation) sees no lead', not exists (select 1 from mkc_wa_leads));

select set_config('request.jwt.claim.sub', :vando, false);
select t_check('0303: Vando reads every lead conversation (monitor, cannot reply)',
  (select count(*) from mkc_wa_leads) = 4
  and exists (select 1 from mkc_chat_messages where conversation_id = current_setting('t.conv1')::uuid and body = 'Masih ada unit?')
  and (select (x->'wa_lead'->>'monitor')::boolean and not (x->'wa_lead'->>'can_reply')::boolean
       from jsonb_array_elements(mkc_chat_list()) x where x->>'id' = current_setting('t.conv1')));
select t_expect_error('0303: Vando cannot reply to the customer', format('select mkc_wa_lead_queue_out(%L, %L, %L)', current_setting('t.conv1'), 'x', '{}'));
select t_check('0303: Vando gets per-sales numbers (3 sales in the rotation)', jsonb_array_length(mkc_wa_lead_stats('lead_wa_jogja')) = 3);
select t_expect_error('0303: cannot move a lead to someone outside the rotation', format('select mkc_wa_lead_reassign(%L, %L)', current_setting('t.lead1'), :sx));

select set_config('request.jwt.claim.sub', :owner, false);
select t_check('0303: the owner also reads every lead', (select count(*) from mkc_wa_leads) = 4);
select mkc_wa_lead_reassign(current_setting('t.lead1')::uuid, current_setting('t.other')::uuid);
reset role;

select mkc_wa_lead_mark_out((current_setting('t.out')::jsonb->>'message_id')::uuid, true);
select t_check('0303: delivery status recorded', (select payload->>'wa_status' from mkc_chat_messages where id = (current_setting('t.out')::jsonb->>'message_id')::uuid) = 'sent');
select t_check('0303: first sales reply = first response; nothing waiting; CRM follow-up recorded',
  (select first_response_at is not null and waiting_since is null from mkc_wa_leads where id = current_setting('t.lead1')::uuid)
  and (select p.last_follow_up_at is not null from prospects p join mkc_wa_leads l on l.prospect_id = p.id where l.id = current_setting('t.lead1')::uuid));
select t_check('0303: reassign moves the lead, its member and the CRM owner, with a history line',
  (select assigned_sales_id from mkc_wa_leads where id = current_setting('t.lead1')::uuid) = current_setting('t.other')::uuid
  and (select string_agg(employee_id::text, ',') from mkc_chat_members where conversation_id = current_setting('t.conv1')::uuid and removed_at is null) = current_setting('t.other')
  and (select p.sales_id from prospects p join mkc_wa_leads l on l.prospect_id = p.id where l.id = current_setting('t.lead1')::uuid) = current_setting('t.other')::uuid
  and exists (select 1 from mkc_chat_messages where conversation_id = current_setting('t.conv1')::uuid and body like '↪️ Lead dipindahkan dari % oleh Owner'));
set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('t.s1'), false);
select t_check('0303: the previous sales person loses access after the move', not exists (select 1 from mkc_chat_messages where conversation_id = current_setting('t.conv1')::uuid));
reset role;

-- Alerts: 15 min -> sales, 30 min -> owner + Vando, once per wait.
select set_config('t.lead2', (select id::text from mkc_wa_leads where phone = '628222222222'), false);
select set_config('t.s2', (select assigned_sales_id::text from mkc_wa_leads where phone = '628222222222'), false);
update mkc_wa_leads set waiting_since = now() - interval '16 minutes' where id = current_setting('t.lead2')::uuid;
select mkc_wa_lead_alerts(); select mkc_wa_lead_alerts();
select t_check('0303: 15 min without a reply -> one reminder to the sales person, none to monitors yet',
  (select count(*) from mkc_notifications where category = 'ad_lead_followup_reminder' and user_id = current_setting('t.s2')::uuid and metadata->>'wa_lead_id' = current_setting('t.lead2')) = 1
  and not exists (select 1 from mkc_notifications where category = 'ad_lead_escalation_branch' and metadata->>'wa_lead_id' = current_setting('t.lead2')));
update mkc_wa_leads set waiting_since = waiting_since - interval '15 minutes' where id = current_setting('t.lead2')::uuid;
update mkc_wa_leads set alert_sales_for = waiting_since where id = current_setting('t.lead2')::uuid;
select mkc_wa_lead_alerts(); select mkc_wa_lead_alerts();
select t_check('0303: 30 min -> owner and Vando told once each (not the other sales people)',
  (select string_agg(distinct user_id::text, ',' order by user_id::text) from mkc_notifications
   where category = 'ad_lead_escalation_branch' and metadata->>'wa_lead_id' = current_setting('t.lead2'))
  = (select string_agg(x::text, ',' order by x::text) from unnest(array[:owner::uuid, :vando::uuid]) x)
  and (select count(*) from mkc_notifications where category = 'ad_lead_escalation_branch' and metadata->>'wa_lead_id' = current_setting('t.lead2')) = 2);
select t_check('0303: alerts never use a category relayed to personal WhatsApp',
  not exists (select 1 from mkc_notifications where metadata ? 'wa_lead_id' and category in ('hospitality_critical_alert', 'refund_reminder')));

-- Existing prospect owned by someone outside the rotation -> rotation takes it.
insert into prospects (customer_name, phone, project_id, house_type, city, lead_source, sales_id, branch_id)
values ('Lama', '628555555555', '10000000-0000-0000-0000-00000000c001', 'x', 'x', 'facebook_ads', :sx::uuid, (select id from branches where code='JOG'));
select mkc_wa_lead_inbound('628555555555', 'Lama', 'halo lagi', null, 'AD-JOG', null);
select t_check('0303: an old prospect of Nyarso clicking again goes to the rotation (no duplicate prospect)',
  (select count(*) from prospects where phone_normalized = '628555555555' and deleted_at is null) = 1
  and (select sales_id from prospects where phone_normalized = '628555555555') in (:sa::uuid, :sb::uuid, :sc::uuid)
  and (select l.prospect_id = p.id from mkc_wa_leads l join prospects p on p.phone_normalized = l.phone where l.phone = '628555555555'));

-- Customer named the project (ad data missing): Jogja project -> lead; Makassar -> not handled.
select t_check('0303: unmatched ad, customer picked the Jogja project -> new lead',
  (mkc_wa_lead_inbound('628666666666', 'Fajar', 'Loonars 2', null, null, '10000000-0000-0000-0000-00000000c001')->>'is_new')::boolean);
select t_check('0303: unmatched ad, customer picked a Makassar project -> not handled',
  (mkc_wa_lead_inbound('628777777777', 'G', 'Cendana', null, null, '10000000-0000-0000-0000-00000000c002')->>'handled')::boolean = false);

select t_check('0303: inbound functions are not callable by signed-in users',
  not has_function_privilege('authenticated', 'public.mkc_wa_lead_inbound(text, text, text, text, text, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.mkc_wa_lead_mark_out(uuid, boolean, text)', 'execute'));

select n, case when ok then 'PASS' else 'FAIL' end as r, name, left(coalesce(detail, ''), 90) as detail from t_results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from t_results;
