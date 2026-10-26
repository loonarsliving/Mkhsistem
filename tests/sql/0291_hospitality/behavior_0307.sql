-- Behaviour suite for 0307 (Pengajuan Biaya Villa chat). Run on a fresh DB:
--   stubs.sql, seed_0294.sql, migrations 0291..0306, a villa_users stub,
--   the villa repo's migration 20261026000001_villa_pengajuan_biaya.sql,
--   then 0307, then this file (see README.md).
\set ON_ERROR_STOP 1
\set owner   '''00000000-0000-0000-0000-0000000000a1'''
\set rebecca '''00000000-0000-0000-0000-0000000000b1'''
\set alya    '''00000000-0000-0000-0000-000000000101'''

create table t_results (n serial, name text, ok boolean, detail text);
create function t_check(p_name text, p_ok boolean, p_detail text default null) returns void language sql as $$ insert into t_results(name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail) $$;
grant insert, select on t_results to authenticated; grant usage on sequence t_results_n_seq to authenticated; grant execute on function t_check to authenticated;
create function t_expect_error(p_name text, p_sql text) returns void language plpgsql as $$
begin execute p_sql; perform t_check(p_name, false, 'no error raised');
exception when others then perform t_check(p_name, true, sqlerrm); end $$;
grant execute on function t_expect_error to authenticated;

select set_config('t.group', (select c.id::text from mkc_chat_conversations c join mkc_chat_departments d on d.id = c.department_id
  where d.code = 'pengajuan_biaya_villa' and c.kind = 'operational_group'), false);
select set_config('t.bulan', to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM'), false);
select set_config('t.dua_bulan_lalu', to_char((date_trunc('month', now() at time zone 'Asia/Jakarta') - interval '1 month' - interval '1 day'), 'YYYY-MM'), false);

select t_check('group exists with the owners only (Finance is not a member)',
  (select string_agg(e.full_name || ':' || m.member_role, ',' order by e.full_name) from mkc_chat_members m join employees e on e.id = m.employee_id
   where m.conversation_id = current_setting('t.group')::uuid and m.removed_at is null) = 'Owner:member');

insert into mkc_chat_role_assignments (department_id, employee_id, member_role)
select id, :rebecca::uuid, 'manager' from mkc_chat_departments where code = 'pengajuan_biaya_villa';
select mkc_chat_sync_members();
select t_check('Rebecca joins as manager through her assignment',
  (select member_role from mkc_chat_members where conversation_id = current_setting('t.group')::uuid and employee_id = :rebecca::uuid and removed_at is null) = 'manager');

-- Files the server uploaded (service role) into the villa bucket.
insert into storage.objects (bucket_id, name) values
  ('villa-pengajuan-biaya', 'chat/' || :rebecca || '/nota1.jpg'),
  ('villa-pengajuan-biaya', 'chat/' || :rebecca || '/bayar1.jpg'),
  ('villa-pengajuan-biaya', 'chat/' || :alya || '/lain.jpg'),
  ('hospitality-evidence', 'chat/' || :rebecca || '/salah-bucket.jpg');

-- ===================== Manager submits from chat =====================
set role authenticated;
select set_config('request.jwt.claim.sub', :rebecca, false);
select set_config('t.p1', mkc_biaya_create('laundry', null, 'permintaan_dana', current_setting('t.bulan'), 350000, 'Laundry sprei 1-15',
  'Laundry Bersih', 'BCA', '1234567890', 'chat/' || :rebecca || '/nota1.jpg', null)::text, false);
select t_check('manager can submit from chat', current_setting('t.p1') is not null);
select t_expect_error('lain-lain without a name rejected', format('select mkc_biaya_create(''lain_lain'', '' '', ''permintaan_dana'', %L, 50000, ''Gas'', ''A'', ''BCA'', ''1'')', current_setting('t.bulan')));
select t_expect_error('month older than last month rejected', format('select mkc_biaya_create(''netflix'', null, ''permintaan_dana'', %L, 186000, ''Netflix'', ''A'', ''BCA'', ''1'')', current_setting('t.dua_bulan_lalu')));
select t_expect_error('reimburse without proof of payment rejected', format('select mkc_biaya_create(''netflix'', null, ''reimburse'', %L, 186000, ''Netflix'', ''A'', ''BCA'', ''1'')', current_setting('t.bulan')));
select t_expect_error('missing bank account rejected', format('select mkc_biaya_create(''netflix'', null, ''permintaan_dana'', %L, 186000, ''Netflix'', ''A'', '''', ''1'')', current_setting('t.bulan')));
select t_expect_error('a file in someone else''s folder rejected', format('select mkc_biaya_create(''netflix'', null, ''permintaan_dana'', %L, 186000, ''Netflix'', ''A'', ''BCA'', ''1'', %L)', current_setting('t.bulan'), 'chat/' || :alya || '/lain.jpg'));
select t_expect_error('a file not uploaded rejected', format('select mkc_biaya_create(''netflix'', null, ''permintaan_dana'', %L, 186000, ''Netflix'', ''A'', ''BCA'', ''1'', %L)', current_setting('t.bulan'), 'chat/' || :rebecca || '/tidak-ada.jpg'));
select t_expect_error('a file in another bucket rejected', format('select mkc_biaya_create(''netflix'', null, ''permintaan_dana'', %L, 186000, ''Netflix'', ''A'', ''BCA'', ''1'', %L)', current_setting('t.bulan'), 'chat/' || :rebecca || '/salah-bucket.jpg'));
select set_config('t.p2', mkc_biaya_create('lain_lain', 'Gas elpiji', 'reimburse', current_setting('t.bulan'), 50000, 'Isi ulang 2 tabung',
  'Rebecca', 'BRI', '999', null, 'chat/' || :rebecca || '/bayar1.jpg')::text, false);
select t_check('reimburse with proof + own category name accepted', current_setting('t.p2') is not null);
select t_check('manager cannot read the villa table directly (RLS)', (select count(*) from villa_pengajuan_biaya) = 0);
select t_expect_error('manager cannot call the file-path function', 'select mkc_biaya_file_path(null, null, null, ''nota'')');

select set_config('request.jwt.claim.sub', :alya, false);
select t_expect_error('non-member cannot submit', format('select mkc_biaya_create(''netflix'', null, ''permintaan_dana'', %L, 186000, ''Netflix'', ''A'', ''BCA'', ''1'')', current_setting('t.bulan')));
select t_expect_error('non-member cannot read cards', format('select mkc_biaya_cards(%L, array[%L]::uuid[])', current_setting('t.group'), current_setting('t.p1')));
reset role;

select t_check('villa row recorded as from chat, named after the employee',
  (select diajukan_lewat = 'chat' and diajukan_oleh_nama = 'Rebecca' and diajukan_oleh_employee = :rebecca::uuid and status = 'diajukan' and diajukan_oleh_villa_user is null
   from villa_pengajuan_biaya where id = current_setting('t.p1')::uuid));
select t_check('lain-lain keeps the manager''s own name', (select kategori_nama from villa_pengajuan_biaya where id = current_setting('t.p2')::uuid) = 'Gas elpiji');
select t_check('card posted once by Rebecca (task, ref biaya)',
  (select count(*) = 1 and bool_and(sender_id = :rebecca::uuid and kind = 'task' and body like '🧾 PB-0001 · Laundry Rp350.000%')
   from mkc_chat_messages where ref_table = 'biaya' and ref_id = current_setting('t.p1')::uuid));
select t_check('villa history written for the chat submission',
  (select count(*) from villa_pengajuan_biaya_log where pengajuan_id = current_setting('t.p1')::uuid and status = 'diajukan' and oleh_nama = 'Rebecca') = 1);

-- ===================== Request from the villa dashboard =====================
insert into villa_pengajuan_biaya (kategori, jenis, periode, nominal, keterangan, penerima_nama, penerima_bank, penerima_rekening, diajukan_lewat, diajukan_oleh_nama)
values ('netflix', 'permintaan_dana', current_setting('t.bulan'), 186000, 'Netflix November', 'Netflix', 'BCA', '1', 'dashboard', 'Rebeca');
select set_config('t.p3', (select id::text from villa_pengajuan_biaya where keterangan = 'Netflix November'), false);
select t_check('dashboard request posted as a system card naming the submitter',
  (select count(*) = 1 and bool_and(sender_id is null and kind = 'task' and body like '%dari dashboard villa%') from mkc_chat_messages where ref_id = current_setting('t.p3')::uuid));

-- ===================== Finance (villa-api, service role) =====================
delete from mkc_notifications;
update villa_pengajuan_biaya set status = 'disetujui', diputus_oleh_nama = 'Finance', diputus_at = now() where id = current_setting('t.p1')::uuid;
select t_check('approval posted to the group',
  (select count(*) from mkc_chat_messages where ref_id = current_setting('t.p1')::uuid and kind = 'system' and body like '✅ PB-0001%disetujui Finance (Finance)%') = 1);
select t_check('Rebecca notified of the approval (owner is not)',
  (select string_agg(user_id::text || ':' || category, ',') from mkc_notifications) = :rebecca || ':approval_request_decided');
update villa_pengajuan_biaya set catatan_finance = 'ok' where id = current_setting('t.p1')::uuid;
select t_check('non-status change posts nothing', (select count(*) from mkc_chat_messages where ref_id = current_setting('t.p1')::uuid) = 2);
update villa_pengajuan_biaya set status = 'ditransfer', bukti_transfer_path = 'transfer/' || current_setting('t.p1') || '/b.jpg', tanggal_transfer = current_date,
  ditransfer_oleh_nama = 'Finance', ditransfer_at = now() where id = current_setting('t.p1')::uuid;
select t_check('transfer posted with the date', (select count(*) from mkc_chat_messages where ref_id = current_setting('t.p1')::uuid
  and body like '💸 PB-0001%sudah ditransfer Finance tanggal ' || to_char(current_date, 'DD-MM-YYYY') || '%') = 1);
update villa_pengajuan_biaya set status = 'ditolak', diputus_oleh_nama = 'Finance', alasan_tolak = 'Nota belum ada' where id = current_setting('t.p3')::uuid;
select t_check('rejection posted with the reason', (select count(*) from mkc_chat_messages where ref_id = current_setting('t.p3')::uuid and body like '❌ PB-0003%: Nota belum ada') = 1);

-- ===================== Cancel, cards, files =====================
set role authenticated;
select set_config('request.jwt.claim.sub', :rebecca, false);
select t_expect_error('cannot cancel a request Finance already processed', format('select mkc_biaya_cancel(%L, ''salah'')', current_setting('t.p1')));
select t_expect_error('cancel needs a reason', format('select mkc_biaya_cancel(%L, '''')', current_setting('t.p2')));
select mkc_biaya_cancel(current_setting('t.p2')::uuid, 'Salah nominal');
select t_check('cards: live status, file flags, no storage paths',
  (select c ->> 'status' = 'ditransfer' and (c ->> 'ada_bukti_transfer')::boolean and (c ->> 'ada_nota')::boolean and not (c ? 'bukti_transfer_path') and not (c ? 'nota_path')
   from jsonb_array_elements(mkc_biaya_cards(current_setting('t.group')::uuid, array[current_setting('t.p1')::uuid])) c));
select t_check('cards only for requests shown in that conversation',
  jsonb_array_length(mkc_biaya_cards(current_setting('t.group')::uuid, array[current_setting('t.p1')::uuid, gen_random_uuid()])) = 1);
reset role;
select t_check('cancelled from chat: villa status + history + chat line',
  (select status = 'dibatalkan' and alasan_batal = 'Salah nominal' from villa_pengajuan_biaya where id = current_setting('t.p2')::uuid)
  and (select count(*) from mkc_chat_messages where ref_id = current_setting('t.p2')::uuid and body like '🚫 PB-0002%Salah nominal') = 1
  and (select count(*) from villa_pengajuan_biaya_log where pengajuan_id = current_setting('t.p2')::uuid and status = 'dibatalkan') = 1);
select t_check('file path for a member', mkc_biaya_file_path(:rebecca::uuid, current_setting('t.group')::uuid, current_setting('t.p1')::uuid, 'bukti_transfer')
  = 'transfer/' || current_setting('t.p1') || '/b.jpg');
select t_check('no file path for a non-member', mkc_biaya_file_path(:alya::uuid, current_setting('t.group')::uuid, current_setting('t.p1')::uuid, 'nota') is null);

set role authenticated;
select set_config('request.jwt.claim.sub', :owner, false);
select t_check('owner sees the group in the chat list', (select count(*) from jsonb_array_elements(mkc_chat_list()) x where x ->> 'name' = 'Pengajuan Biaya Villa') = 1);
select t_check('owner can read the cards', jsonb_array_length(mkc_biaya_cards(current_setting('t.group')::uuid, array[current_setting('t.p1')::uuid])) = 1);
select t_expect_error('owner (member) cannot submit for the manager', format('select mkc_biaya_create(''netflix'', null, ''permintaan_dana'', %L, 186000, ''Netflix'', ''A'', ''BCA'', ''1'')', current_setting('t.bulan')));
reset role;

-- ===================== The villa write never depends on the chat =====================
update mkc_chat_departments set is_active = false where code = 'pengajuan_biaya_villa';
insert into villa_pengajuan_biaya (kategori, jenis, periode, nominal, keterangan, diajukan_lewat, diajukan_oleh_nama)
values ('laundry', 'permintaan_dana', current_setting('t.bulan'), 1000, 'Saat grup nonaktif', 'dashboard', 'Rebeca');
select t_check('inactive group: villa insert still works, nothing posted',
  (select count(*) from villa_pengajuan_biaya where keterangan = 'Saat grup nonaktif') = 1
  and (select count(*) from mkc_chat_messages m join villa_pengajuan_biaya p on p.id = m.ref_id where p.keterangan = 'Saat grup nonaktif') = 0);
update mkc_chat_departments set is_active = true where code = 'pengajuan_biaya_villa';
alter table mkc_chat_messages rename to mkc_chat_messages_x;
update villa_pengajuan_biaya set status = 'disetujui', diputus_oleh_nama = 'Finance' where keterangan = 'Saat grup nonaktif';
alter table mkc_chat_messages_x rename to mkc_chat_messages;
select t_check('broken chat: villa update still saved', (select status from villa_pengajuan_biaya where keterangan = 'Saat grup nonaktif') = 'disetujui');

select format('%s %s%s', case when ok then 'PASS' else 'FAIL' end, name, case when not ok and detail is not null then ' -- ' || detail else '' end) from t_results order by n;
select format('%s passed, %s failed', count(*) filter (where ok), count(*) filter (where not ok)) from t_results;
