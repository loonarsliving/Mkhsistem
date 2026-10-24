-- Behaviour suite for 0294 (Markom Jogja + Sales Jogja). Run on a fresh DB:
--   stubs.sql, then seed_0294.sql, then migrations 0291..0294, then this file.
\set ON_ERROR_STOP 1
\set owner   '''00000000-0000-0000-0000-0000000000a1'''
\set rebecca '''00000000-0000-0000-0000-0000000000b1'''
\set alya    '''00000000-0000-0000-0000-000000000101'''
\set syifa   '''00000000-0000-0000-0000-000000000102'''
\set mkmks   '''00000000-0000-0000-0000-000000000103'''
\set ayu     '''00000000-0000-0000-0000-000000000201'''
\set fety    '''00000000-0000-0000-0000-000000000202'''
\set slmks   '''00000000-0000-0000-0000-000000000203'''
\set vando   '''00000000-0000-0000-0000-000000000301'''

create table t_results (n serial, name text, ok boolean, detail text);
create function t_check(p_name text, p_ok boolean, p_detail text default null) returns void language sql as $$ insert into t_results(name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail) $$;
grant insert, select on t_results to authenticated; grant usage on sequence t_results_n_seq to authenticated; grant execute on function t_check to authenticated;
create function t_expect_error(p_name text, p_sql text) returns void language plpgsql as $$
begin execute p_sql; perform t_check(p_name, false, 'no error raised');
exception when others then perform t_check(p_name, true, sqlerrm); end $$;
grant execute on function t_expect_error to authenticated;

insert into mkc_chat_role_assignments (department_id, employee_id, member_role)
select id, :rebecca::uuid, 'room_approver' from mkc_chat_departments where code = 'markom_jogja';
insert into mkc_chat_role_assignments (department_id, employee_id, member_role)
select id, :vando::uuid, 'manager' from mkc_chat_departments where code = 'sales_jogja';

select set_config('t.mgroup', (select c.id::text from mkc_chat_conversations c join mkc_chat_departments d on d.id = c.department_id where d.code = 'markom_jogja' and c.kind = 'operational_group'), false);
select set_config('t.sgroup', (select c.id::text from mkc_chat_conversations c join mkc_chat_departments d on d.id = c.department_id where d.code = 'sales_jogja' and c.kind = 'operational_group'), false);

select t_check('markom members: JOG Markom incl. staff-role Syifa + Rebecca as room_approver, not Makassar',
  (select string_agg(e.full_name || ':' || m.member_role, ',' order by e.full_name) from mkc_chat_members m join employees e on e.id = m.employee_id
   where m.conversation_id = current_setting('t.mgroup')::uuid and m.removed_at is null) = 'Alya:markom,Rebecca:room_approver,Syifa:markom');
select t_check('sales members: JOG Sales incl. staff-role Fety + Vando manager, not Makassar',
  (select string_agg(e.full_name || ':' || m.member_role, ',' order by e.full_name) from mkc_chat_members m join employees e on e.id = m.employee_id
   where m.conversation_id = current_setting('t.sgroup')::uuid and m.removed_at is null) = 'Ayu:sales,Fety:sales,Vando:manager');
select t_check('hospitality membership unchanged by branch filter', (select count(*) from mkc_chat_members m join mkc_chat_conversations c on c.id = m.conversation_id
  join mkc_chat_departments d on d.id = c.department_id where d.code = 'hospitality' and m.removed_at is null) >= 1);

-- ===================== Markom: content calendar =====================
set role authenticated;
select set_config('request.jwt.claim.sub', :syifa, false);
select set_config('t.c1', mkc_mkt_content_create('markom_jogja', current_date + 2, 'instagram', 'reels', 'villa', 'Room tour unit A1', 'brief', null, null)::text, false);
select t_check('staff-role Syifa (markom) can plan content', current_setting('t.c1') is not null);
select t_expect_error('content in the past rejected', 'select mkc_mkt_content_create(''markom_jogja'', current_date - 5, ''instagram'', ''feed'', ''villa'', ''Lama'')');
select t_expect_error('publish without link rejected', format('select mkc_mkt_content_update(%L, ''publish'')', current_setting('t.c1')));
select mkc_mkt_content_update(current_setting('t.c1')::uuid, 'start');
select mkc_mkt_content_update(current_setting('t.c1')::uuid, 'publish', null, 'https://instagram.com/p/abc');
select set_config('request.jwt.claim.sub', :rebecca, false);
select t_expect_error('Rebecca (room_approver) cannot plan content', 'select mkc_mkt_content_create(''markom_jogja'', current_date + 1, ''instagram'', ''feed'', ''villa'', ''Tes'')');
select set_config('request.jwt.claim.sub', :ayu, false);
select t_expect_error('sales member cannot plan Markom content', 'select mkc_mkt_content_create(''markom_jogja'', current_date + 1, ''instagram'', ''feed'', ''villa'', ''Tes'')');
select t_check('sales member sees nothing of Markom', (select count(*) from mkc_mkt_content_plans) = 0
  and (select count(*) from mkc_chat_messages where conversation_id = current_setting('t.mgroup')::uuid) = 0);
reset role;
select t_check('content published with url', (select status || '|' || published_url from mkc_mkt_content_plans where id = current_setting('t.c1')::uuid) = 'published|https://instagram.com/p/abc');

-- ===================== Markom: KOL + Rebecca + voucher =====================
insert into units (id, nomor, status) values ('10000000-0000-0000-0000-0000000000a1', 'A1', 'available'), ('10000000-0000-0000-0000-0000000000a2', 'A2', 'available');
insert into bookings (unit_id, unit_nomor, status, tgl_checkin, tgl_checkout) values ('10000000-0000-0000-0000-0000000000a1', 'A1', 'terjadwal', current_date + 10, current_date + 12);
set role authenticated;
select set_config('request.jwt.claim.sub', :alya, false);
select set_config('t.k1', mkc_mkt_kol_create('markom_jogja', '@kol.jogja', 'instagram', 25000, 'travel', 'barter', current_date + 10, 2, array['reels', 'story'])::text, false);
select t_expect_error('Markom cannot approve the room', format('select mkc_mkt_kol_decide(%L, ''approve'', %L, current_date + 10, 2)', current_setting('t.k1'), '10000000-0000-0000-0000-0000000000a2'));
select set_config('request.jwt.claim.sub', :rebecca, false);
select t_expect_error('Rebecca: unit with overlapping booking rejected', format('select mkc_mkt_kol_decide(%L, ''approve'', %L, current_date + 11, 2)', current_setting('t.k1'), '10000000-0000-0000-0000-0000000000a1'));
select t_expect_error('Rebecca: more than 7 nights rejected', format('select mkc_mkt_kol_decide(%L, ''approve'', %L, current_date + 10, 9)', current_setting('t.k1'), '10000000-0000-0000-0000-0000000000a2'));
select set_config('t.dec', mkc_mkt_kol_decide(current_setting('t.k1')::uuid, 'approve', '10000000-0000-0000-0000-0000000000a2', current_date + 10, 2, 'ok')::text, false);
select t_expect_error('second decision rejected', format('select mkc_mkt_kol_decide(%L, ''reject'', null, null, null, ''x'')', current_setting('t.k1')));
reset role;
select t_check('voucher created in villa table exactly like villa-api (KOL-XXXXXX, nights, 3 months, mkconnect)',
  (select kode ~ '^KOL-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$' and malam_gratis = 2 and aktif and dibuat_lewat = 'mkconnect'
          and berlaku_sampai = (current_date + interval '3 months')::date and untuk = '@kol.jogja'
   from villa_kol_vouchers where id = (select voucher_id from mkc_mkt_kol_collabs where id = current_setting('t.k1')::uuid)));
select t_check('kol approved with unit A2', (select status || '|' || approved_unit_nomor from mkc_mkt_kol_collabs where id = current_setting('t.k1')::uuid) = 'approved|A2');

insert into bookings (unit_id, unit_nomor, status, tgl_checkin, tgl_checkout, kol_voucher_id)
select '10000000-0000-0000-0000-0000000000a2', 'A2', 'terjadwal', current_date + 10, current_date + 12, voucher_id from mkc_mkt_kol_collabs where id = current_setting('t.k1')::uuid;
select mkc_mkt_sync_kol(); select mkc_mkt_sync_kol();
select t_check('sync: booking with the voucher -> booked, posted once', (select status from mkc_mkt_kol_collabs where id = current_setting('t.k1')::uuid) = 'booked'
  and (select count(*) from mkc_chat_messages where dedupe_key like 'kol_booked:%') = 1);
update bookings set status = 'checkin' where kol_voucher_id is not null; select mkc_mkt_sync_kol();
select t_check('sync: check-in -> staying', (select status from mkc_mkt_kol_collabs where id = current_setting('t.k1')::uuid) = 'staying');
update bookings set status = 'checkout' where kol_voucher_id is not null; select mkc_mkt_sync_kol();
select t_check('sync: check-out -> content_due with deadline checkout + 7d',
  (select status = 'content_due' and content_due_at::date = current_date + 12 + 7 from mkc_mkt_kol_collabs where id = current_setting('t.k1')::uuid));
set role authenticated;
select set_config('request.jwt.claim.sub', :alya, false);
select t_expect_error('deliverable outside the agreed list rejected', format('select mkc_mkt_kol_update(%L, ''deliverable'', ''feed'', ''https://x.com/1'')', current_setting('t.k1')));
select mkc_mkt_kol_update(current_setting('t.k1')::uuid, 'deliverable', 'reels', 'https://instagram.com/reel/1');
select mkc_mkt_kol_update(current_setting('t.k1')::uuid, 'deliverable', 'story', 'https://instagram.com/stories/1');
reset role;
select t_check('all deliverables -> completed', (select status from mkc_mkt_kol_collabs where id = current_setting('t.k1')::uuid) = 'completed');

set role authenticated;
select set_config('request.jwt.claim.sub', :alya, false);
select set_config('t.k2', mkc_mkt_kol_create('markom_jogja', '@kol.dua', 'tiktok', null, null, 'barter', current_date + 20, 1, array['tiktok'])::text, false);
select set_config('request.jwt.claim.sub', :rebecca, false);
select mkc_mkt_kol_decide(current_setting('t.k2')::uuid, 'approve', '10000000-0000-0000-0000-0000000000a1', current_date + 20, 1);
select set_config('request.jwt.claim.sub', :alya, false);
select mkc_mkt_kol_update(current_setting('t.k2')::uuid, 'cancel', null, null, 'KOL batal datang');
reset role;
select t_check('cancel with unused voucher switches the voucher off', (select not aktif from villa_kol_vouchers where id = (select voucher_id from mkc_mkt_kol_collabs where id = current_setting('t.k2')::uuid)));

-- ===================== Sales =====================
insert into prospects (id, customer_name, phone, house_type, city, lead_source, sales_id, branch_id, status)
values ('30000000-0000-0000-0000-000000000001', 'Budi Calon', '081234567890', 'AVARA', 'Jakarta', 'instagram', :ayu::uuid, (select id from branches where code = 'JOG'), 'red'),
       ('30000000-0000-0000-0000-000000000002', 'Lead Makassar', '081200000000', 'X', 'Makassar', 'walk_in', :slmks::uuid, (select id from branches where code = 'MKS'), 'red');
select mkc_sales_sync(); select mkc_sales_sync();
select t_check('sync: JOG lead posted once, Makassar lead not', (select count(*) from mkc_chat_messages where dedupe_key = 'lead:30000000-0000-0000-0000-000000000001') = 1
  and (select count(*) from mkc_chat_messages where dedupe_key = 'lead:30000000-0000-0000-0000-000000000002') = 0);
select t_check('lead card text has no phone number', not exists (select 1 from mkc_chat_messages where body like '%081234567890%'));

set role authenticated;
select set_config('request.jwt.claim.sub', :ayu, false);
select mkc_sales_follow_up('sales_jogja', '30000000-0000-0000-0000-000000000001', 'whatsapp', 'tanya harga');
select set_config('request.jwt.claim.sub', :fety, false);
select t_expect_error('other sales cannot act on Ayu''s lead', 'select mkc_sales_follow_up(''sales_jogja'', ''30000000-0000-0000-0000-000000000001'', ''whatsapp'')');
select t_expect_error('Makassar lead not reachable from Sales Jogja', 'select mkc_sales_follow_up(''sales_jogja'', ''30000000-0000-0000-0000-000000000002'', ''whatsapp'')');
select t_check('cards: lead visible to team, without phone', (select (x ? 'name') and not (x ? 'phone') from jsonb_array_elements(
  mkc_sales_cards('sales_jogja', array['30000000-0000-0000-0000-000000000001'::uuid], '{}', '{}') -> 'prospects') x));
select set_config('request.jwt.claim.sub', :vando, false);
select mkc_sales_follow_up('sales_jogja', '30000000-0000-0000-0000-000000000001', 'phone_call', 'manager cek');
select set_config('t.v1', mkc_sales_visit_schedule('sales_jogja', '30000000-0000-0000-0000-000000000001', now() + interval '1 day', 'lihat unit')::text, false);
select t_expect_error('visit done needs a result note', format('select mkc_sales_visit_result(%L, ''done'')', current_setting('t.v1')));
select mkc_sales_visit_result(current_setting('t.v1')::uuid, 'done', 'hot', 'tertarik AVARA-03');
select t_expect_error('manager cannot submit a sales daily report', 'select mkc_sales_daily_report_submit(''sales_jogja'', ''{}'', 1, 1, 1)');
select set_config('request.jwt.claim.sub', :ayu, false);
select t_expect_error('daily report missing a checklist item rejected', 'select mkc_sales_daily_report_submit(''sales_jogja'', ''{"lead_baru_dihubungi":true}'', 3, 0, 1)');
select mkc_sales_daily_report_submit('sales_jogja', '{"lead_baru_dihubungi":true,"follow_up_dicatat_crm":true,"materi_promosi_dibagikan":false}', 3, 1, 1, null);
select t_expect_error('second daily report same day rejected', 'select mkc_sales_daily_report_submit(''sales_jogja'', ''{"lead_baru_dihubungi":true,"follow_up_dicatat_crm":true,"materi_promosi_dibagikan":true}'', 1, 0, 0)');
reset role;
select t_check('CRM got 3 follow-ups (WA, call, site_visit) and status moved off red',
  (select count(*) from prospect_follow_ups where prospect_id = '30000000-0000-0000-0000-000000000001') = 3
  and (select count(*) from prospect_follow_ups where prospect_id = '30000000-0000-0000-0000-000000000001' and activity_type = 'site_visit') = 1
  and (select status from prospects where id = '30000000-0000-0000-0000-000000000001') = 'yellow');

insert into loonars_projects (id, kode, branch_id) values ('40000000-0000-0000-0000-000000000001', 'LNR2', (select id from branches where code = 'JOG'));
insert into loonars_units (id, project_id, blok, tipe, status) values ('40000000-0000-0000-0000-000000000011', '40000000-0000-0000-0000-000000000001', 'AVARA-03', 'AVARA', 'verifikasi');
insert into loonars_unit_purchases (id, unit_id, marketing_employee_id, status, booking_fee) values ('40000000-0000-0000-0000-000000000021', '40000000-0000-0000-0000-000000000011', :ayu::uuid, 'pending_verification', 5000000);
select mkc_sales_sync();
update loonars_unit_purchases set status = 'verified', verified_at = now(), updated_at = now();
select mkc_sales_sync(); select mkc_sales_sync();
select t_check('purchase: pending + verified each posted once', (select count(*) from mkc_chat_messages where dedupe_key like 'purchase:%') = 2);

-- ===================== Owner =====================
set role authenticated;
select set_config('request.jwt.claim.sub', :owner, false);
select t_check('owner sees the three owner feeds only', (select string_agg(x ->> 'name', ',' order by x ->> 'name') from jsonb_array_elements(mkc_chat_list()) x)
  = 'Laporan Hospitality,Laporan Markom Jogja,Laporan Sales Jogja');
select t_check('owner sees no Markom/Sales group messages', (select count(*) from mkc_chat_messages where conversation_id in (current_setting('t.mgroup')::uuid, current_setting('t.sgroup')::uuid)) = 0);
select t_check('owner can open supporting records', (select count(*) from mkc_mkt_kol_collabs) = 2 and (select count(*) from mkc_sales_visits) = 1);
reset role;

-- ===================== Reports =====================
select t_check('markom snapshot sources ok', (select bool_and((mkc_mkt_report_snapshot(d.id, now() - interval '1 day', now(), current_date) -> k ->> 'ok')::boolean)
  from mkc_chat_departments d, unnest(array['content', 'kols', 'submissions']) k where d.code = 'markom_jogja'));
select t_check('sales snapshot sources ok', (select bool_and((mkc_sales_report_snapshot(d.id, now() - interval '1 day', now(), current_date) -> k ->> 'ok')::boolean)
  from mkc_chat_departments d, unnest(array['sales', 'leads', 'follow_ups', 'visits', 'daily_reports', 'siteplan', 'targets']) k where d.code = 'sales_jogja'));
select set_config('t.r', mkc_hosp_report_begin((select id from mkc_chat_departments where code = 'sales_jogja'), current_date, 'end_of_day')::text, false);
select mkc_hosp_report_finish(current_setting('t.r')::uuid, '{"kind":"sales"}', '{}', 'Ringkasan sales');
select t_check('sales report notifies owner as "Laporan Sales Jogja" (daily_report)',
  exists (select 1 from mkc_notifications where user_id = :owner::uuid and title = 'Laporan Sales Jogja' and category = 'daily_report' and type = 'system'));

select n, case when ok then 'PASS' else 'FAIL' end as r, name, left(coalesce(detail, ''), 90) as detail from t_results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from t_results;
