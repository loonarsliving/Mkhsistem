-- Behaviour suite for 0305 (tag people in a chat).
-- Run on a fresh DB: stubs.sql, then migrations 0291..0305, then this file.
\set ON_ERROR_STOP 1
\set a  '''00000000-0000-0000-0000-000000000501'''
\set b  '''00000000-0000-0000-0000-000000000502'''
\set c  '''00000000-0000-0000-0000-000000000503'''
\set x  '''00000000-0000-0000-0000-000000000509'''

create table t_results (n serial, name text, ok boolean, detail text);
create function t_check(p_name text, p_ok boolean, p_detail text default null) returns void language sql as $$ insert into t_results(name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail) $$;
grant insert, select on t_results to authenticated; grant usage on sequence t_results_n_seq to authenticated; grant execute on function t_check to authenticated;
create function t_expect_error(p_name text, p_sql text) returns void language plpgsql as $$
begin execute p_sql; perform t_check(p_name, false, 'no error raised');
exception when others then perform t_check(p_name, true, sqlerrm); end $$;
grant execute on function t_expect_error to authenticated;

insert into employees (id, full_name, branch_id, role_id, approval_status, is_active)
select :a::uuid, 'Ayu', (select id from branches where code='JOG'), (select id from roles where key='staff'), 'approved', true union all
select :b::uuid, 'Fety Puspitasari', (select id from branches where code='JOG'), (select id from roles where key='staff'), 'approved', true union all
select :c::uuid, 'Rebecca', (select id from branches where code='JOG'), (select id from roles where key='staff'), 'approved', true union all
select :x::uuid, 'Orang luar', (select id from branches where code='JOG'), (select id from roles where key='staff'), 'approved', true;

select set_config('t.g', (select c.id::text from mkc_chat_conversations c join mkc_chat_departments d on d.id = c.department_id
                          where d.code = 'koordinasi_jogja' and c.kind = 'operational_group'), false);
insert into mkc_chat_members (conversation_id, employee_id, member_role, source)
select current_setting('t.g')::uuid, e, 'member', 'direct' from unnest(array[:a::uuid, :b::uuid, :c::uuid]) e;

set role authenticated;
select set_config('request.jwt.claim.sub', :a, false);
select set_config('t.m1', mkc_chat_send_message(current_setting('t.g')::uuid, '@Fety Puspitasari tolong cek kamar 3', '{}'::uuid[], null::uuid,
  array[:b::uuid, :x::uuid, :a::uuid, :b::uuid])::text, false);
select t_check('0305: only members other than the sender are kept as tags (outsider, self, duplicate dropped)',
  (select payload->'mentions' = jsonb_build_array(:b) from mkc_chat_messages where id = current_setting('t.m1')::uuid));
select set_config('t.m2', mkc_chat_send_message(current_setting('t.g')::uuid, 'tanpa tag', '{}'::uuid[], null::uuid)::text, false);
select t_check('0305: the 4-argument send still works and stores no tags',
  (select payload = '{}'::jsonb and body = 'tanpa tag' from mkc_chat_messages where id = current_setting('t.m2')::uuid));
select set_config('t.m3', mkc_chat_send_text(current_setting('t.g')::uuid, 'lewat send_text', '{}'::uuid[])::text, false);
select t_check('0305: mkc_chat_send_text still works', current_setting('t.m3') <> '');
select set_config('t.m4', mkc_chat_send_message(current_setting('t.g')::uuid, 'balas', '{}'::uuid[], current_setting('t.m1')::uuid, array[:c::uuid])::text, false);
select t_check('0305: a reply can tag too',
  (select reply_to_id = current_setting('t.m1')::uuid and payload->'mentions' = jsonb_build_array(:c) from mkc_chat_messages where id = current_setting('t.m4')::uuid));
select set_config('request.jwt.claim.sub', :x, false);
select t_expect_error('0305: a non-member cannot send (with tags)',
  format('select mkc_chat_send_message(%L::uuid, %L, %L::uuid[], null::uuid, array[%L::uuid])', current_setting('t.g'), 'hai', '{}', :b));
reset role;

select t_check('0305: the tagged member''s push says they were tagged',
  (select title = '📣 Ayu menandai Anda · ' || (select name from mkc_chat_conversations where id = current_setting('t.g')::uuid)
          and (metadata->>'mentioned')::boolean
   from mkc_notifications where user_id = :b::uuid and metadata->>'message_id' = current_setting('t.m1')));
select t_check('0305: other members get the normal push',
  (select title = 'Ayu · ' || (select name from mkc_chat_conversations where id = current_setting('t.g')::uuid)
          and not (metadata->>'mentioned')::boolean
   from mkc_notifications where user_id = :c::uuid and metadata->>'message_id' = current_setting('t.m1')));
select t_check('0305: the outsider and the sender get nothing',
  not exists (select 1 from mkc_notifications where user_id in (:x::uuid, :a::uuid) and metadata->>'message_id' = current_setting('t.m1')));
select t_check('0305: tagged send is callable by signed-in users only',
  has_function_privilege('authenticated', 'public.mkc_chat_send_message(uuid, text, uuid[], uuid, uuid[])', 'execute')
  and not has_function_privilege('anon', 'public.mkc_chat_send_message(uuid, text, uuid[], uuid, uuid[])', 'execute'));

select n, case when ok then 'PASS' else 'FAIL' end as r, name, left(coalesce(detail, ''), 90) as detail from t_results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from t_results;
