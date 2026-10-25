-- Behaviour suite for 0304 (ad clicks recognised by the pre-filled first message).
-- Run on a fresh DB: stubs.sql, then migrations 0291..0304, then this file.
\set ON_ERROR_STOP 1
\set owner   '''00000000-0000-0000-0000-0000000000a1'''
\set vando   '''00000000-0000-0000-0000-000000000301'''
\set sa      '''00000000-0000-0000-0000-000000000401'''
\set sb      '''00000000-0000-0000-0000-000000000402'''
\set out     '''00000000-0000-0000-0000-000000000409'''

create table t_results (n serial, name text, ok boolean, detail text);
create function t_check(p_name text, p_ok boolean, p_detail text default null) returns void language sql as $$ insert into t_results(name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail) $$;
grant insert, select on t_results to authenticated; grant usage on sequence t_results_n_seq to authenticated; grant execute on function t_check to authenticated;

insert into branches (code, name) values ('MKS', 'Makassar') on conflict do nothing;
insert into employees (id, full_name, branch_id, role_id, approval_status, is_active)
select :owner::uuid, 'Owner', (select id from branches where code='JOG'), (select id from roles where key='super_admin'), 'approved', true union all
select :vando::uuid, 'Vando', (select id from branches where code='JOG'), (select id from roles where key='staff'), 'approved', true union all
select :sa::uuid, 'Ayu', (select id from branches where code='JOG'), (select id from roles where key='staff'), 'approved', true union all
select :sb::uuid, 'Fety', (select id from branches where code='JOG'), (select id from roles where key='staff'), 'approved', true union all
select :out::uuid, 'Staff lain', (select id from branches where code='JOG'), (select id from roles where key='staff'), 'approved', true;

insert into crm_projects (id, name, city, project_type, branch_id) values
  ('10000000-0000-0000-0000-00000000c001', 'Loonars Living 2', 'Yogyakarta', 'villa', (select id from branches where code='JOG')),
  ('10000000-0000-0000-0000-00000000c002', 'Cendana', 'Makassar', 'subsidized', (select id from branches where code='MKS'));
insert into meta_ad_campaigns (id, name, headline, project_id, branch_id, meta_ad_id, status, welcome_message) values
  ('20000000-0000-0000-0000-00000000a001', 'Loonars living 2 - Leads WA', 'Villa Loonars 2', '10000000-0000-0000-0000-00000000c001', (select id from branches where code='JOG'), 'AD-JOG', 'active',
   'Halo tim Loonars, saya tertarik dengan model investasi villa di Loonars Living 2.'),
  ('20000000-0000-0000-0000-00000000a002', 'Loonars living 2 - lama', 'Lama', '10000000-0000-0000-0000-00000000c001', (select id from branches where code='JOG'), 'AD-OLD', 'ended', 'Teks lama'),
  ('20000000-0000-0000-0000-00000000a003', 'Cendana - Leads WA', 'Cendana', '10000000-0000-0000-0000-00000000c002', (select id from branches where code='MKS'), 'AD-MKS', 'paused',
   'Halo, saya tertarik rumah Cendana.');

select set_config('t.dept', (select id::text from mkc_chat_departments where code = 'lead_wa_jogja'), false);
insert into mkc_chat_role_assignments (department_id, employee_id, member_role)
select current_setting('t.dept')::uuid, x, 'sales' from unnest(array[:sa::uuid, :sb::uuid]) x;
insert into mkc_chat_role_assignments (department_id, employee_id, member_role) values (current_setting('t.dept')::uuid, :vando::uuid, 'manager');

select t_check('0304: Meta default prefixes stored on the lead department',
  (select jsonb_array_length(settings->'ad_prefill_prefixes') = 3 from mkc_chat_departments where code = 'lead_wa_jogja'));

-- Meta's default pre-filled text, only the Jogja campaign active -> lead.
select set_config('t.r1', mkc_wa_lead_inbound('628111111111', 'Budi', 'Halo! Bisakah saya mendapatkan info selengkapnya tentang ini?', null, null, null)::text, false);
select t_check('0304: Meta default text without ad data opens a Jogja lead with the greeting',
  (current_setting('t.r1')::jsonb->>'is_new')::boolean and current_setting('t.r1')::jsonb->>'greeting' like 'Terima kasih%');
select t_check('0304: the lead is attributed to the active Jogja campaign and its project',
  (select l.campaign_id = '20000000-0000-0000-0000-00000000a001' and l.source_label = 'Villa Loonars 2'
          and p.project_id = '10000000-0000-0000-0000-00000000c001' and p.lead_source = 'facebook_ads'
   from mkc_wa_leads l join prospects p on p.id = l.prospect_id where l.id = (current_setting('t.r1')::jsonb->>'lead_id')::uuid));
select t_check('0304: English variant, extra spaces / case and appended text are recognised',
  (mkc_wa_lead_inbound('628222222222', 'C', '  hello!   can I get more info on this? lokasi dimana', null, null, null)->>'is_new')::boolean);
select t_check('0304: the campaign''s own welcome message is recognised',
  (mkc_wa_lead_inbound('628333333333', 'D', 'Halo tim Loonars, saya tertarik dengan model investasi villa di Loonars Living 2.', null, null, null)->>'is_new')::boolean);

-- Not an ad click.
select t_check('0304: an ordinary first message is not handled',
  (mkc_wa_lead_inbound('628444444444', 'E', 'Halo kak, mau tanya', null, null, null)->>'handled')::boolean = false);
select t_check('0304: the default text in the middle of a message is not an ad click',
  (mkc_wa_lead_inbound('628444444444', 'E', 'Kak, Halo! Bisakah saya mendapatkan info selengkapnya tentang ini?', null, null, null)->>'handled')::boolean = false);
select t_check('0304: an ended campaign''s welcome message is not an ad click',
  (mkc_wa_lead_inbound('628444444444', 'E', 'Teks lama', null, null, null)->>'handled')::boolean = false);

-- A follow-up from a lead keeps joining it (unchanged).
select t_check('0304: a later message from the same customer joins the lead',
  (mkc_wa_lead_inbound('628111111111', 'Budi', 'Halo! Bisakah saya mendapatkan info selengkapnya tentang ini?', null, null, null)->>'is_new')::boolean = false
  and (select count(*) from mkc_wa_leads where phone = '628111111111') = 1);

-- Ads running in two branches at once: the default text cannot tell which -> nothing guessed.
update meta_ad_campaigns set status = 'active' where id = '20000000-0000-0000-0000-00000000a003';
select t_check('0304: with Jogja and Makassar ads both active, the default text is not attributed',
  (mkc_wa_lead_inbound('628555555555', 'F', 'Halo! Bisakah saya mendapatkan info selengkapnya tentang ini?', null, null, null)->>'handled')::boolean = false);
select t_check('0304: ... but the Jogja campaign''s own welcome message still is',
  (mkc_wa_lead_inbound('628555555555', 'F', 'Halo tim Loonars, saya tertarik dengan model investasi villa di Loonars Living 2.', null, null, null)->>'is_new')::boolean);
select t_check('0304: and the Makassar welcome message is out of scope (not handled)',
  (mkc_wa_lead_inbound('628666666666', 'G', 'Halo, saya tertarik rumah Cendana.', null, null, null)->>'handled')::boolean = false);
update meta_ad_campaigns set status = 'paused' where id = '20000000-0000-0000-0000-00000000a003';

-- Only the Makassar campaign active: default text -> Makassar -> out of scope.
update meta_ad_campaigns set status = 'paused' where id = '20000000-0000-0000-0000-00000000a001';
update meta_ad_campaigns set status = 'active' where id = '20000000-0000-0000-0000-00000000a003';
select t_check('0304: default text while only a non-Jogja ad runs is not handled',
  (mkc_wa_lead_inbound('628777777777', 'H', 'Halo! Bisakah saya mendapatkan info selengkapnya tentang ini?', null, null, null)->>'handled')::boolean = false);

-- Monitor departments.
set role authenticated;
select set_config('request.jwt.claim.sub', :owner, false);
select t_check('0304: owner monitors lead_wa_jogja', mkc_wa_lead_my_monitor_departments() = array['lead_wa_jogja']);
select set_config('request.jwt.claim.sub', :vando, false);
select t_check('0304: lead manager monitors lead_wa_jogja', mkc_wa_lead_my_monitor_departments() = array['lead_wa_jogja']);
select set_config('request.jwt.claim.sub', :sa, false);
select t_check('0304: a sales person monitors nothing', cardinality(mkc_wa_lead_my_monitor_departments()) = 0);
select set_config('request.jwt.claim.sub', :out, false);
select t_check('0304: other staff monitor nothing', cardinality(mkc_wa_lead_my_monitor_departments()) = 0);
reset role;

select t_check('0304: the campaign matcher and inbound stay service-only',
  not has_function_privilege('authenticated', 'public.mkc_wa_lead_prefill_campaign(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.mkc_wa_lead_inbound(text, text, text, text, text, uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.mkc_wa_lead_my_monitor_departments()', 'execute'));

select n, case when ok then 'PASS' else 'FAIL' end as r, name, left(coalesce(detail, ''), 90) as detail from t_results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from t_results;
