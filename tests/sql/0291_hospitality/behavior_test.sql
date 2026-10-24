\set ON_ERROR_STOP 1
-- Fixed ids
\set owner   '''00000000-0000-0000-0000-0000000000a1'''
\set rebecca '''00000000-0000-0000-0000-0000000000b1'''
\set fo1     '''00000000-0000-0000-0000-0000000000c1'''
\set fo2     '''00000000-0000-0000-0000-0000000000c2'''
\set sec1    '''00000000-0000-0000-0000-0000000000d1'''
\set cln1    '''00000000-0000-0000-0000-0000000000e1'''
\set markom  '''00000000-0000-0000-0000-0000000000f1'''

create table t_results (n serial, name text, ok boolean, detail text);
create function t_check(p_name text, p_ok boolean, p_detail text default null) returns void language sql as $$ insert into t_results(name, ok, detail) values (p_name, p_ok, p_detail) $$;
grant insert, select on t_results to authenticated; grant usage on sequence t_results_n_seq to authenticated; grant execute on function t_check to authenticated;
-- run a statement expecting an error; records the message
create function t_expect_error(p_name text, p_sql text) returns void language plpgsql as $$
begin
  execute p_sql;
  perform t_check(p_name, false, 'no error raised');
exception when others then
  perform t_check(p_name, true, sqlerrm);
end $$;
grant execute on function t_expect_error to authenticated;

insert into employees (id, full_name, branch_id, division_id, role_id, approval_status, is_active)
select :owner::uuid, 'Owner', (select id from branches where code='JOG'), null, (select id from roles where key='super_admin'), 'approved', true union all
select :rebecca::uuid, 'Rebecca', (select id from branches where code='JOG'), (select id from divisions where code='JOG-PROD'), (select id from roles where key='staff'), 'approved', true union all
select :fo1::uuid, 'FO Satu', (select id from branches where code='LPL'), (select id from divisions where code='LPL-FO'), (select id from roles where key='staff'), 'approved', true union all
select :fo2::uuid, 'FO Pending', (select id from branches where code='LPL'), (select id from divisions where code='LPL-FO'), (select id from roles where key='pending'), 'pending', false union all
select :sec1::uuid, 'Sec Satu', (select id from branches where code='LPL'), (select id from divisions where code='LPL-SEC'), (select id from roles where key='staff'), 'approved', true union all
select :cln1::uuid, 'Cleaner Satu', (select id from branches where code='LPL'), (select id from divisions where code='LPL-CLN'), (select id from roles where key='staff'), 'approved', true union all
select :markom::uuid, 'Markom', (select id from branches where code='JOG'), (select id from divisions where code='JOG-PROD'), (select id from roles where key='staff'), 'approved', true;

insert into mkc_chat_role_assignments (department_id, employee_id, member_role, note)
select id, :rebecca::uuid, 'manager', 'Hospitality Manager' from mkc_chat_departments where code='hospitality';

-- (scoped to the Hospitality group: 0298's Koordinasi Jogja derives its members from it, plus the owner)
select t_check('members: 4 eligible (rebecca manager, fo1, sec1, cln1)',
  (select count(*) from mkc_chat_members m join mkc_chat_conversations c on c.id = m.conversation_id
    where m.removed_at is null and c.department_id = (select id from mkc_chat_departments where code = 'hospitality')) = 4
  and (select member_role from mkc_chat_members m join mkc_chat_conversations c on c.id = m.conversation_id
        where m.employee_id = :rebecca::uuid and c.department_id = (select id from mkc_chat_departments where code = 'hospitality')) = 'manager'
  and not exists (select 1 from mkc_chat_members m join mkc_chat_conversations c on c.id = m.conversation_id
                  where m.employee_id in (:fo2::uuid, :markom::uuid, :owner::uuid) and c.department_id = (select id from mkc_chat_departments where code = 'hospitality')));

-- villa data
insert into units (id, nomor, status) values
 ('10000000-0000-0000-0000-000000000001','A1','dirty'),
 ('10000000-0000-0000-0000-000000000002','A2','available'),
 ('10000000-0000-0000-0000-000000000003','A3','dirty');
insert into housekeeping (id, unit_id, unit_nomor, status, jenis) values
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','A1','pending','bersih'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','A2','pending','bersih'),
 ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003','A3','pending','bersih'),
 ('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','A1','pending','amenities');

select mkc_hosp_sync_room_tasks();
select mkc_hosp_sync_room_tasks();
select t_check('sync: tasks only for dirty units with pending bersih (A1, A3), idempotent',
  (select count(*) from mkc_hosp_room_tasks) = 2 and (select count(*) from mkc_chat_messages where kind='task') = 2);
select t_check('sync: cleaners notified once per task', (select count(*) from mkc_notifications where category='hospitality_task' and user_id = :cln1::uuid) = 2);

-- approve the pending FO -> trigger adds membership
update employees set approval_status='approved', is_active=true, role_id=(select id from roles where key='staff') where id = :fo2::uuid;
select t_check('approval trigger adds member', exists (select 1 from mkc_chat_members where employee_id = :fo2::uuid and removed_at is null));
update employees set deleted_at = now() where id = :fo2::uuid;
select t_check('deleting employee removes member (soft)', exists (select 1 from mkc_chat_members where employee_id = :fo2::uuid and removed_at is not null));

-- ===================== as Markom (not a member) =====================
set role authenticated;
select set_config('request.jwt.claim.sub', :markom, false);
select t_check('markom: sees no conversations', jsonb_array_length(mkc_chat_list()) = 0);
select t_check('markom: no messages via table', (select count(*) from mkc_chat_messages) = 0);
select t_check('markom: no tasks via table', (select count(*) from mkc_hosp_room_tasks) = 0);
select t_expect_error('markom: cannot send text', format('select mkc_chat_send_text(%L, %L)', (select id from mkc_chat_conversations limit 0), 'hi'));
select t_expect_error('markom: cannot send to group by id', 'select mkc_chat_send_text(mkc_hosp_group_id((select department_id from mkc_hosp_room_tasks limit 1)), ''hi'')');
select t_expect_error('markom: cannot start task', 'select mkc_hosp_task_start(''00000000-0000-0000-0000-000000000000'')');
select t_expect_error('markom: cannot call internal mkc_chat_post', 'select mkc_chat_post(gen_random_uuid(), ''system'', ''x'', null, null, ''{}'', ''k'')');
select t_expect_error('markom: cannot insert message directly', 'insert into mkc_chat_messages (conversation_id, kind, body) values (gen_random_uuid(), ''text'', ''x'')');
select t_expect_error('markom: cannot list units', 'select mkc_hosp_units(''hospitality'')');

-- ===================== as Owner =====================
select set_config('request.jwt.claim.sub', :owner, false);
select t_check('owner: sees owner feeds (+ the 0298 Koordinasi group), never a team group', (select bool_and(x ->> 'kind' = 'owner_feed' or x ->> 'name' = 'Koordinasi Jogja') and count(*) filter (where x ->> 'kind' = 'owner_feed') >= 1 from jsonb_array_elements(mkc_chat_list()) x));
select t_check('owner: no Hospitality group messages', (select count(*) from mkc_chat_messages m join mkc_chat_conversations c on c.id = m.conversation_id where c.kind = 'operational_group' and c.department_id = (select id from mkc_chat_departments where code = 'hospitality')) = 0);
select t_check('owner: can open operational details (tasks)', (select count(*) from mkc_hosp_room_tasks) = 2);
select t_expect_error('owner: cannot post into group', 'select mkc_chat_send_text((select id from mkc_chat_conversations where kind=''owner_feed''), ''x'')');

-- ===================== workflow =====================
select set_config('request.jwt.claim.sub', :cln1, false);
select set_config('t.task', (select id::text from mkc_hosp_room_tasks where unit_nomor='A1'), false);
select set_config('t.group', (select id::text from mkc_chat_conversations where kind='operational_group' and department_id = (select id from mkc_chat_departments where code = 'hospitality')), false);
select t_check('cleaner: sees group with role cleaning', (select x ->> 'my_role' from jsonb_array_elements(mkc_chat_list()) x where x ->> 'name' = 'Hospitality Loonars') = 'cleaning');
select mkc_chat_send_text(current_setting('t.group')::uuid, 'Halo tim');
select t_expect_error('cleaner: submit before start rejected', format('select mkc_hosp_task_submit_cleaning(%L, ''{}'', null)', current_setting('t.task')));
select mkc_hosp_task_start(current_setting('t.task')::uuid);
select t_expect_error('cleaner: incomplete checklist rejected', format('select mkc_hosp_task_submit_cleaning(%L, %L, null)', current_setting('t.task'), '{"sampah_dibuang":true}'));
select t_expect_error('cleaner: cannot FO-inspect', format('select mkc_hosp_fo_inspect(%L, ''{}'', null, ''ready'')', current_setting('t.task')));
select mkc_hosp_task_submit_cleaning(current_setting('t.task')::uuid,
  (select jsonb_object_agg(k, true) from unnest(mkc_hosp_checklist_items('cleaning')) k), 'ok');
select t_check('task awaiting inspection', (select status from mkc_hosp_room_tasks where id = current_setting('t.task')::uuid) = 'awaiting_inspection');

select set_config('request.jwt.claim.sub', :fo1, false);
select t_expect_error('FO: ready with a failed item rejected', format('select mkc_hosp_fo_inspect(%L, %L, null, ''ready'')', current_setting('t.task'),
  (select jsonb_object_agg(k, k <> 'kolam_renang') from unnest(mkc_hosp_checklist_items('fo_inspection')) k)));
select t_expect_error('FO: ready without the 3 photos rejected', format('select mkc_hosp_fo_inspect(%L, %L, null, ''ready'')', current_setting('t.task'),
  (select jsonb_object_agg(k, true) from unnest(mkc_hosp_checklist_items('fo_inspection')) k)));

-- upload 3 evidence objects as FO (storage RLS insert policy)
insert into storage.objects (bucket_id, name, owner_id, metadata)
select 'hospitality-evidence', current_setting('t.group') || '/' || :fo1 || '/' || s || '.jpg', :fo1, '{"mimetype":"image/jpeg","size":"1000"}'
from unnest(array['bed','bathroom','main_room']) s;
select t_expect_error('FO: cannot upload into another uid folder', format(
  'insert into storage.objects (bucket_id, name, owner_id) values (''hospitality-evidence'', %L, %L)', current_setting('t.group') || '/' || :cln1 || '/x.jpg', :fo1));
select set_config('t.att', (select string_agg(mkc_chat_register_attachment(current_setting('t.group')::uuid,
  current_setting('t.group') || '/' || :fo1 || '/' || s || '.jpg', s)::text, ',') from unnest(array['bed','bathroom','main_room']) s), false);
select t_check('attachment expiry = upload + 30 days (server-side)',
  (select bool_and(expires_at = uploaded_at + interval '30 days') from mkc_chat_attachments));
select t_expect_error('FO: register a path outside own folder rejected', format('select mkc_chat_register_attachment(%L, %L, ''bed'')',
  current_setting('t.group'), current_setting('t.group') || '/' || :cln1 || '/x.jpg'));

select mkc_hosp_fo_inspect(current_setting('t.task')::uuid,
  (select jsonb_object_agg(k, true) from unnest(mkc_hosp_checklist_items('fo_inspection')) k), null, 'ready',
  string_to_array(current_setting('t.att'), ',')::uuid[]);
reset role;
select t_check('ready: villa unit A1 dirty -> available', (select status from units where nomor='A1') = 'available');
select t_check('ready: villa housekeeping bersih done, amenities untouched',
  (select status from housekeeping where id='20000000-0000-0000-0000-000000000001') = 'done'
  and (select status from housekeeping where id='20000000-0000-0000-0000-000000000004') = 'pending');
select t_check('ready: task completed fo_verified', (select status || '/' || completion_source from mkc_hosp_room_tasks where unit_nomor='A1') = 'completed/fo_verified');
select t_check('ready: one room_readiness message', (select count(*) from mkc_chat_messages where kind='room_readiness') = 1);
select t_check('ready: attachments linked to checklist+task', (select count(*) from mkc_chat_attachments where checklist_id is not null and room_task_id is not null) = 3);

-- storage read policy
set role authenticated;
select set_config('request.jwt.claim.sub', :markom, false);
select t_check('markom: cannot read evidence objects', (select count(*) from storage.objects where bucket_id='hospitality-evidence') = 0);
select set_config('request.jwt.claim.sub', :owner, false);
select t_check('owner: can read evidence objects', (select count(*) from storage.objects where bucket_id='hospitality-evidence') = 3);
select set_config('request.jwt.claim.sub', :sec1, false);
select t_check('security member: can read evidence objects', (select count(*) from storage.objects where bucket_id='hospitality-evidence') = 3);

-- Front Desk closes A3 outside the chat
reset role;
update housekeeping set status='done' where id='20000000-0000-0000-0000-000000000003';
select mkc_hosp_sync_room_tasks();
select mkc_hosp_sync_room_tasks();
select t_check('villa_app close: task completed as villa_app, flagged once',
  (select completion_source from mkc_hosp_room_tasks where unit_nomor='A3') = 'villa_app'
  and (select count(*) from mkc_chat_messages where dedupe_key like 'task_closed_villa:%') = 1);

-- conflict: dirty unit gets checked in (occupied) while task open
insert into units (id, nomor, status) values ('10000000-0000-0000-0000-000000000004','B1','dirty');
insert into housekeeping (unit_id, unit_nomor) values ('10000000-0000-0000-0000-000000000004','B1');
select mkc_hosp_sync_room_tasks();
update units set status='occupied' where nomor='B1';
select mkc_hosp_sync_room_tasks();
select t_check('conflict flagged when villa unit no longer dirty', (select conflict_note from mkc_hosp_room_tasks where unit_nomor='B1') like '%occupied%');
update units set status='dirty' where nomor='B1';
select mkc_hosp_sync_room_tasks();
select t_check('conflict cleared when consistent again', (select conflict_note from mkc_hosp_room_tasks where unit_nomor='B1') is null);

-- ===================== security + critical escalation =====================
set role authenticated;
select set_config('request.jwt.claim.sub', :sec1, false);
select mkc_hosp_submit_security('hospitality', 'security_shift_start',
  (select jsonb_object_agg(k, true) from unnest(mkc_hosp_checklist_items('security_shift_start')) k), null);
select t_expect_error('security: problem without notes rejected', format('select mkc_hosp_submit_security(''hospitality'', ''security_patrol'', %L, null)',
  (select jsonb_object_agg(k, k <> 'perimeter') from unnest(mkc_hosp_checklist_items('security_patrol')) k)));
select mkc_hosp_submit_security('hospitality', 'security_patrol',
  (select jsonb_object_agg(k, k <> 'perimeter') from unnest(mkc_hosp_checklist_items('security_patrol')) k), 'Pagar belakang rusak');
select t_check('security problem creates tracked issue', (select count(*) from mkc_hosp_issues where category='security' and status='open') = 1);
select t_expect_error('security: cannot submit cleaning-only RPC', format('select mkc_hosp_task_start(%L)', (select id from mkc_hosp_room_tasks where unit_nomor='B1')));
select set_config('t.crit', mkc_hosp_issue_create('hospitality', 'security', 'critical', 'Penyusup di area parkir', 'Orang tak dikenal memanjat pagar')::text, false);
reset role;
select t_check('critical: manager + owner notified immediately',
  (select count(distinct user_id) from mkc_notifications where category='hospitality_critical_alert') = 2
  and exists (select 1 from mkc_notifications where category='hospitality_critical_alert' and user_id = :rebecca::uuid)
  and exists (select 1 from mkc_notifications where category='hospitality_critical_alert' and user_id = :owner::uuid));
select t_check('critical: alert posted in owner feed', exists (select 1 from mkc_chat_messages m join mkc_chat_conversations c on c.id=m.conversation_id where c.kind='owner_feed' and m.kind='alert'));
select t_check('critical: no routine messages in owner feed',
  not exists (select 1 from mkc_chat_messages m join mkc_chat_conversations c on c.id=m.conversation_id where c.kind='owner_feed' and m.kind in ('text','task','checklist','work_report')));

set role authenticated;
select set_config('request.jwt.claim.sub', :cln1, false);
select t_expect_error('cleaner: cannot resolve unassigned issue', format('select mkc_hosp_issue_update(%L, ''resolve'', null, ''done'')', current_setting('t.crit')));
select t_expect_error('cleaner: cannot cancel issue', format('select mkc_hosp_issue_update(%L, ''cancel'', null, ''tidak perlu'')', current_setting('t.crit')));
select set_config('request.jwt.claim.sub', :rebecca, false);
select t_expect_error('manager: resolve without notes rejected', format('select mkc_hosp_issue_update(%L, ''resolve'', null, null)', current_setting('t.crit')));
select mkc_hosp_issue_update(current_setting('t.crit')::uuid, 'assign', :sec1::uuid, null);
select set_config('request.jwt.claim.sub', :sec1, false);
select mkc_hosp_issue_update(current_setting('t.crit')::uuid, 'resolve', null, 'Diamankan, polisi dihubungi');
reset role;
select t_check('issue history complete', (select count(*) from mkc_hosp_issue_events where issue_id = current_setting('t.crit')::uuid) >= 4);
select t_check('issue resolved with notes + audit row', (select status from mkc_hosp_issues where id = current_setting('t.crit')::uuid) = 'resolved'
  and exists (select 1 from audit_logs where record_id = current_setting('t.crit')::uuid and new_data ->> 'to' = 'resolved'));

-- ===================== retention hold =====================
set role authenticated;
select set_config('request.jwt.claim.sub', :fo1, false);
select t_expect_error('FO: cannot set retention hold', format('select mkc_chat_set_retention_hold(%L, current_date + 30, ''Bukti kasus polisi'')',
  (select id from mkc_chat_attachments limit 1)));
select set_config('request.jwt.claim.sub', :owner, false);
select t_expect_error('owner: hold only for issue evidence', format('select mkc_chat_set_retention_hold(%L, current_date + 30, ''Bukti kasus polisi'')',
  (select id from mkc_chat_attachments limit 1)));
reset role;

-- ===================== reports: idempotency =====================
select set_config('t.dept', (select id::text from mkc_chat_departments where code='hospitality'), false);
select set_config('t.rep', mkc_hosp_report_begin(current_setting('t.dept')::uuid, current_date, 'morning')::text, false);
select t_check('report begin: second claim while generating returns null', mkc_hosp_report_begin(current_setting('t.dept')::uuid, current_date, 'morning') is null);
select mkc_hosp_report_finish(current_setting('t.rep')::uuid, '{"x":1}', '{}', 'Ringkasan');
select mkc_hosp_report_finish(current_setting('t.rep')::uuid, '{"x":1}', '{}', 'Ringkasan');
select t_check('report finish idempotent: one card', (select count(*) from mkc_chat_messages where kind='report_card') = 1);
select t_check('report begin after success returns null', mkc_hosp_report_begin(current_setting('t.dept')::uuid, current_date, 'morning') is null);
select set_config('t.rep2', mkc_hosp_report_begin(current_setting('t.dept')::uuid, current_date, 'afternoon')::text, false);
select mkc_hosp_report_fail(current_setting('t.rep2')::uuid, 'villa-api timeout');
select t_check('report failure visible in owner feed', exists (select 1 from mkc_chat_messages where dedupe_key like 'report_failed:%'));
set role authenticated;
select set_config('request.jwt.claim.sub', :fo1, false);
select t_check('FO: cannot read reports', (select count(*) from mkc_hosp_reports) = 0);
select t_expect_error('FO: cannot acknowledge', format('select mkc_hosp_report_acknowledge(%L)', current_setting('t.rep')));
select t_expect_error('FO: cannot call report_begin', format('select mkc_hosp_report_begin(%L, current_date, ''manual'')', current_setting('t.dept')));
select set_config('request.jwt.claim.sub', :rebecca, false);
select t_check('manager: can read reports', (select count(*) from mkc_hosp_reports) = 2);
select set_config('request.jwt.claim.sub', :owner, false);
select mkc_hosp_report_acknowledge(current_setting('t.rep')::uuid);
reset role;
select t_check('owner acknowledged', (select acknowledged_by from mkc_hosp_reports where id = current_setting('t.rep')::uuid) = :owner::uuid);

-- unread counts
set role authenticated;
select set_config('request.jwt.claim.sub', :sec1, false);
select set_config('t.unread', (select (x ->> 'unread') from jsonb_array_elements(mkc_chat_list()) x where x ->> 'name' = 'Hospitality Loonars'), false);
select mkc_chat_mark_read(current_setting('t.group')::uuid);
select t_check('unread: >0 before, 0 after mark_read', current_setting('t.unread')::int > 0 and (select (x ->> 'unread')::int from jsonb_array_elements(mkc_chat_list()) x where x ->> 'name' = 'Hospitality Loonars') = 0);
reset role;


-- villa snapshot: stub has no bookings/villa_room_maintenance/cron.job_run_details -> those report ok:false, units ok
select set_config('t.snap', mkc_hosp_report_villa_snapshot(now() - interval '1 day', now(), current_date)::text, false);
-- the stub has no cron.job_run_details, so 'jobs' must come back as an error, not as empty/zero
select t_check('snapshot: available sources ok, a missing source reported as an error (not zero)',
  (current_setting('t.snap')::jsonb #>> '{units,ok}') = 'true'
  and (current_setting('t.snap')::jsonb #>> '{bookings,ok}') = 'true'
  and (current_setting('t.snap')::jsonb #>> '{jobs,ok}') = 'false'
  and (current_setting('t.snap')::jsonb #> '{jobs,error}') is not null);
set role authenticated;
select set_config('request.jwt.claim.sub', :markom, false);
select t_expect_error('markom: cannot call villa snapshot', 'select mkc_hosp_report_villa_snapshot(now(), now(), current_date)');
select t_expect_error('markom: cannot list people', 'select mkc_hosp_people(''hospitality'')');
select set_config('request.jwt.claim.sub', :sec1, false);
select t_check('member: people directory has names + roles only', (select bool_and(x ?& array['id','name','role','active'] and not x ? 'email') from jsonb_array_elements(mkc_hosp_people('hospitality')) x)
  and jsonb_array_length(mkc_hosp_people('hospitality')) >= 5);
reset role;

-- 0295: the villa app leaves old 'bersih' rows pending; a dirty unit gets ONE task, for its latest row
insert into units (id, nomor, status) values ('10000000-0000-0000-0000-000000000009','C9','dirty');
insert into housekeeping (id, unit_id, unit_nomor, tgl, created_at) values
 ('20000000-0000-0000-0000-000000000091','10000000-0000-0000-0000-000000000009','C9', current_date - 30, now() - interval '30 days'),
 ('20000000-0000-0000-0000-000000000092','10000000-0000-0000-0000-000000000009','C9', current_date - 10, now() - interval '10 days'),
 ('20000000-0000-0000-0000-000000000093','10000000-0000-0000-0000-000000000009','C9', current_date, now());
select mkc_hosp_sync_room_tasks();
select mkc_hosp_sync_room_tasks();
select t_check('0295: stale pending rows -> one task per dirty unit, tied to the latest row',
  (select count(*) from mkc_hosp_room_tasks where unit_nomor = 'C9') = 1
  and (select housekeeping_id from mkc_hosp_room_tasks where unit_nomor = 'C9') = '20000000-0000-0000-0000-000000000093'
  and (select count(*) from mkc_chat_messages m join mkc_hosp_room_tasks t on t.id = m.ref_id where t.unit_nomor = 'C9' and m.kind = 'task') = 1);
update housekeeping set status = 'done' where id = '20000000-0000-0000-0000-000000000093';
update units set status = 'available' where nomor = 'C9';
select mkc_hosp_sync_room_tasks();
select t_check('0295: cleaned in villa -> task closed, stale rows do not respawn a task',
  (select string_agg(status, ',') from mkc_hosp_room_tasks where unit_nomor = 'C9') = 'completed');
update units set status = 'dirty' where nomor = 'C9';
insert into housekeeping (id, unit_id, unit_nomor) values ('20000000-0000-0000-0000-000000000094','10000000-0000-0000-0000-000000000009','C9');
select mkc_hosp_sync_room_tasks();
select t_check('0295: next checkout -> one new task for the new row',
  (select count(*) from mkc_hosp_room_tasks where unit_nomor = 'C9' and status = 'pending') = 1
  and (select housekeeping_id from mkc_hosp_room_tasks where unit_nomor = 'C9' and status = 'pending') = '20000000-0000-0000-0000-000000000094');

-- 0296: a villa checkout (unit -> dirty + 'bersih' row, one transaction) creates the task without waiting for cron
begin;
insert into units (id, nomor, status) values ('10000000-0000-0000-0000-000000000010','D1','occupied');
commit;
begin;
update units set status = 'dirty' where nomor = 'D1';
insert into housekeeping (id, unit_id, unit_nomor) values ('20000000-0000-0000-0000-000000000101','10000000-0000-0000-0000-000000000010','D1');
commit;
select t_check('0296: villa checkout creates the room task + card at commit, no sync call',
  (select count(*) from mkc_hosp_room_tasks where unit_nomor = 'D1' and status = 'pending') = 1
  and exists (select 1 from mkc_chat_messages m join mkc_hosp_room_tasks t on t.id = m.ref_id where t.unit_nomor = 'D1' and m.kind = 'task'));
update housekeeping set status = 'done' where id = '20000000-0000-0000-0000-000000000101';
select t_check('0296: room marked clean in villa closes the task immediately',
  (select status from mkc_hosp_room_tasks where unit_nomor = 'D1') = 'completed');
-- a broken Loonars Connect setting must never block a villa checkout
update mkc_chat_departments set settings = settings || '{"cleaning_target_minutes":"x"}' where code = 'hospitality';
insert into units (id, nomor, status) values ('10000000-0000-0000-0000-000000000011','D2','occupied');
begin;
update units set status = 'dirty' where nomor = 'D2';
insert into housekeeping (id, unit_id, unit_nomor) values ('20000000-0000-0000-0000-000000000102','10000000-0000-0000-0000-000000000011','D2');
commit;
select t_check('0296: sync error is swallowed, villa checkout still committed',
  (select status from units where nomor = 'D2') = 'dirty'
  and exists (select 1 from housekeeping where id = '20000000-0000-0000-0000-000000000102')
  and not exists (select 1 from mkc_hosp_room_tasks where unit_nomor = 'D2'));
update mkc_chat_departments set settings = settings - 'cleaning_target_minutes' where code = 'hospitality';
reset role;

-- 0297: workflow cards earlier in this suite (cleaning hand-off, FO decision, incidents) already notified their
-- targets; those targets must not get a second, chat_message push for the same transaction
select t_check('0297: no double push -- chat push skips people a workflow notification already reached',
  (select count(*) from mkc_notifications c join mkc_notifications w on w.user_id = c.user_id and w.created_at = c.created_at
    where c.category = 'chat_message' and w.category is distinct from 'chat_message') = 0
  and (select count(*) from mkc_notifications where category = 'chat_message') > 0);
-- 0297: WhatsApp-style chat push -- a member's message notifies the other members (archived: push only, not the bell)
delete from mkc_notifications;
set role authenticated;
select set_config('request.jwt.claim.sub', :sec1, false);
select mkc_chat_send_text((select id from mkc_chat_conversations where kind = 'operational_group' and department_id = (select id from mkc_chat_departments where code = 'hospitality')), 'Gerbang depan sudah dikunci');
reset role;
select t_check('0297: text message -> chat_message push for every other active member, not the sender',
  (select count(*) from mkc_notifications where category = 'chat_message' and user_id = :sec1::uuid) = 0
  and (select count(*) from mkc_notifications where category = 'chat_message') =
      (select count(*) from mkc_chat_members m join mkc_chat_conversations c on c.id = m.conversation_id
        where c.kind = 'operational_group' and c.department_id = (select id from mkc_chat_departments where code = 'hospitality')
          and m.removed_at is null and m.employee_id <> :sec1::uuid and mkc_chat_employee_eligible(m.employee_id))
  and (select count(*) from mkc_notifications where category = 'chat_message') > 0);
select t_check('0297: chat push is WhatsApp-shaped and stays out of the bell',
  (select bool_and(status = 'archived' and is_read and title like '% · Hospitality Loonars' and body = 'Gerbang depan sudah dikunci'
                   and link like '/chat?c=%' and type = 'system') from mkc_notifications where category = 'chat_message'));
select t_check('0297: push trigger fired for each chat notification',
  (select count(*) from automation_calls where path = '/api/push/send' and (body->>'notification_id')::uuid in (select id from mkc_notifications where category = 'chat_message'))
  = (select count(*) from mkc_notifications where category = 'chat_message'));
select t_check('0297: unread badge counts the new message for a member, not for the sender',
  mkc_chat_unread_total(:cln1::uuid) >= 1
  and mkc_chat_unread_total(:sec1::uuid) < mkc_chat_unread_total(:cln1::uuid));
reset role;

-- ---------------------------------------------------------------------------
-- 0300: direct (1-on-1) chat. Scope = JOG + LPL employees and owners.
-- ---------------------------------------------------------------------------
\set outsider '''00000000-0000-0000-0000-0000000000f9'''
insert into branches (code, name) values ('MKS', 'Makassar') on conflict do nothing;
insert into employees (id, full_name, branch_id, role_id, approval_status, is_active)
select :outsider::uuid, 'Orang Makassar', (select id from branches where code='MKS'), (select id from roles where key='staff'), 'approved', true;

select set_config('t.dept_hosp', (select id from mkc_chat_departments where code = 'hospitality')::text, false);
select set_config('t.dept_dm', (select id from mkc_chat_departments where code = 'pesan_pribadi')::text, false);
set role authenticated;
select set_config('request.jwt.claim.sub', :outsider, false);
select t_check('0300: out-of-scope branch has no direct chat', not mkc_chat_direct_available());
select t_expect_error('0300: out-of-scope employee cannot list contacts', 'select mkc_chat_direct_contacts()');
select t_expect_error('0300: out-of-scope employee cannot open a chat', format('select mkc_chat_direct_open(%L)', :rebecca));

select set_config('request.jwt.claim.sub', :fo1, false);
select t_check('0300: LPL employee has direct chat', mkc_chat_direct_available());
select t_check('0300: contacts = in-scope people (JOG + LPL + owner), not self / outsider / pending',
  (select array_agg(x->>'name' order by x->>'name') from jsonb_array_elements(mkc_chat_direct_contacts()) x)
  = array['Cleaner Satu', 'Markom', 'Owner', 'Rebecca', 'Sec Satu']);
select t_expect_error('0300: cannot chat with yourself', format('select mkc_chat_direct_open(%L)', :fo1));
select t_expect_error('0300: cannot open a chat with an out-of-scope employee', format('select mkc_chat_direct_open(%L)', :outsider));
select t_expect_error('0300: cannot open a chat with a pending (ineligible) employee', format('select mkc_chat_direct_open(%L)', :fo2));
select set_config('t.dm', mkc_chat_direct_open(:rebecca::uuid)::text, false);
select t_check('0300: reopening returns the same chat', mkc_chat_direct_open(:rebecca::uuid) = current_setting('t.dm')::uuid);
select t_check('0300: empty chat listed for the opener, named after the other person',
  (select x->>'name' = 'Rebecca' and x->>'kind' = 'direct' and x->>'peer_id' = :rebecca and (x->>'member_count')::int = 2
   from jsonb_array_elements(mkc_chat_list()) x where x->>'id' = current_setting('t.dm')));

select set_config('request.jwt.claim.sub', :rebecca, false);
select t_check('0300: the other side opening finds the same chat', mkc_chat_direct_open(:fo1::uuid) = current_setting('t.dm')::uuid);
select t_check('0300: an empty chat does not appear on the other phone',
  not exists (select 1 from jsonb_array_elements(mkc_chat_list()) x where x->>'id' = current_setting('t.dm')));

select set_config('request.jwt.claim.sub', :fo1, false);
select mkc_chat_send_text(current_setting('t.dm')::uuid, 'Bu, kamar B2 sudah siap', '{}');

select set_config('request.jwt.claim.sub', :rebecca, false);
select t_check('0300: after a message it shows for the receiver, named after the sender, unread 1',
  (select x->>'name' = 'FO Satu' and (x->>'unread')::int = 1 and x->>'last_body' = 'Bu, kamar B2 sudah siap'
   from jsonb_array_elements(mkc_chat_list()) x where x->>'id' = current_setting('t.dm')));
select t_check('0300: receiver reads the message (RLS)',
  exists (select 1 from mkc_chat_messages where conversation_id = current_setting('t.dm')::uuid and body = 'Bu, kamar B2 sudah siap'));
select mkc_chat_send_text(current_setting('t.dm')::uuid, 'Oke, makasih', '{}');

-- Privacy: nobody else, the owner included, can see or post in it.
select set_config('request.jwt.claim.sub', :owner, false);
select t_check('0300: owner cannot read a chat between two employees (messages, members, conversation, list)',
  not exists (select 1 from mkc_chat_messages where conversation_id = current_setting('t.dm')::uuid)
  and not exists (select 1 from mkc_chat_members where conversation_id = current_setting('t.dm')::uuid)
  and not exists (select 1 from mkc_chat_conversations where id = current_setting('t.dm')::uuid)
  and not exists (select 1 from jsonb_array_elements(mkc_chat_list()) x where x->>'id' = current_setting('t.dm')));
select t_check('0300: owner bypass still covers operational departments, not the private one',
  mkc_hosp_can_view_department(current_setting('t.dept_hosp')::uuid)
  and not mkc_hosp_can_view_department(current_setting('t.dept_dm')::uuid));
select t_check('0300: owner still sees Hospitality group members (policy no longer relies on the NULL path)',
  (select count(*) from mkc_chat_members m where m.removed_at is null and mkc_chat_conversation_department(m.conversation_id) = current_setting('t.dept_hosp')::uuid) = 4);
select t_expect_error('0300: owner cannot post in a chat between two employees',
  format('select mkc_chat_send_text(%L, %L, %L)', current_setting('t.dm'), 'halo', '{}'));
select t_check('0300: owner has direct chat too', mkc_chat_direct_available());
select set_config('t.dm_owner', mkc_chat_direct_open(:cln1::uuid)::text, false);
select mkc_chat_send_text(current_setting('t.dm_owner')::uuid, 'Terima kasih kerja kerasnya', '{}');

select set_config('request.jwt.claim.sub', :sec1, false);
select t_check('0300: another LPL colleague cannot read it either',
  not exists (select 1 from mkc_chat_messages where conversation_id = current_setting('t.dm')::uuid)
  and not mkc_chat_can_read(current_setting('t.dm')::uuid));

select set_config('request.jwt.claim.sub', :cln1, false);
select t_check('0300: owner -> employee chat arrives, titled with the owner name',
  (select x->>'name' = 'Owner' and (x->>'unread')::int = 1 from jsonb_array_elements(mkc_chat_list()) x where x->>'id' = current_setting('t.dm_owner')));
reset role;

select t_check('0300: push like WhatsApp: one per message to the other person only, title = sender name',
  (select count(*) from mkc_notifications where category = 'chat_message' and metadata->>'conversation_id' = current_setting('t.dm')) = 2
  and exists (select 1 from mkc_notifications where category = 'chat_message' and user_id = :rebecca::uuid
              and metadata->>'conversation_id' = current_setting('t.dm') and title = 'FO Satu' and body = 'Bu, kamar B2 sudah siap' and status = 'archived')
  and exists (select 1 from mkc_notifications where category = 'chat_message' and user_id = :fo1::uuid
              and metadata->>'conversation_id' = current_setting('t.dm') and title = 'Rebecca'));
select t_check('0300: unread badge includes direct chats', mkc_chat_unread_total(:cln1::uuid) >= 1);

select mkc_chat_sync_members();
select t_check('0300: membership sync never removes direct-chat members',
  (select count(*) from mkc_chat_members where conversation_id = current_setting('t.dm')::uuid and removed_at is null) = 2);
select t_check('0300: Hospitality group membership unchanged by 0300',
  (select count(*) from mkc_chat_members m join mkc_chat_conversations c on c.id = m.conversation_id
    where m.removed_at is null and c.department_id = (select id from mkc_chat_departments where code = 'hospitality')) = 4);

insert into storage.objects (bucket_id, name, owner_id, metadata)
values ('hospitality-evidence', current_setting('t.dm') || '/' || :fo1 || '/x.jpg', :fo1, '{"mimetype":"image/jpeg","size":"10"}');
set role authenticated;
select set_config('request.jwt.claim.sub', :fo1, false);
select set_config('t.att', mkc_chat_register_attachment(current_setting('t.dm')::uuid, current_setting('t.dm') || '/' || :fo1 || '/x.jpg')::text, false);
reset role;
select t_check('0300: photos in direct chats expire after 30 days',
  (select expires_at - uploaded_at = interval '30 days' from mkc_chat_attachments where id = current_setting('t.att')::uuid));

update employees set is_active = false where id = :fo1::uuid;
set role authenticated;
select set_config('request.jwt.claim.sub', :fo1, false);
select t_check('0300: an employee who left can no longer read their chats', not mkc_chat_can_read(current_setting('t.dm')::uuid));
reset role;
update employees set is_active = true where id = :fo1::uuid;

select n, case when ok then 'PASS' else 'FAIL' end as r, name, left(coalesce(detail, ''), 90) as detail from t_results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from t_results;
