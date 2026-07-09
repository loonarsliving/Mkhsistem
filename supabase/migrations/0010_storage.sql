-- ============================================================================
-- MK Connect — 0010: Storage buckets & policies
-- Convention: user-owned buckets store objects under `{auth.uid()}/...`.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/png', 'image/jpeg', 'image/webp']),
  ('company-assets', 'company-assets', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']),
  ('attendance-selfies', 'attendance-selfies', false, 5242880, array['image/png', 'image/jpeg', 'image/webp']),
  ('memo-attachments', 'memo-attachments', false, 10485760, null),
  ('announcement-attachments', 'announcement-attachments', false, 10485760, null),
  ('leave-attachments', 'leave-attachments', false, 10485760, null)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- avatars — public read, owner-only write into their own folder
-- ----------------------------------------------------------------------------
create policy avatars_select on storage.objects for select to authenticated, anon
  using (bucket_id = 'avatars');
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ----------------------------------------------------------------------------
-- company-assets — public read, settings.manage write
-- ----------------------------------------------------------------------------
create policy company_assets_select on storage.objects for select to authenticated, anon
  using (bucket_id = 'company-assets');
create policy company_assets_write on storage.objects for all to authenticated
  using (bucket_id = 'company-assets' and public.app_has_permission('settings.manage'))
  with check (bucket_id = 'company-assets' and public.app_has_permission('settings.manage'));

-- ----------------------------------------------------------------------------
-- attendance-selfies — private; owner uploads into own folder; readable by
-- the owner or anyone with attendance visibility permission
-- ----------------------------------------------------------------------------
create policy attendance_selfies_select on storage.objects for select to authenticated
  using (
    bucket_id = 'attendance-selfies'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.app_has_permission('attendance.view_all')
      or public.app_has_permission('attendance.view_branch')
    )
  );
create policy attendance_selfies_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attendance-selfies' and (storage.foldername(name))[1] = auth.uid()::text);

-- ----------------------------------------------------------------------------
-- memo-attachments / announcement-attachments — private to authenticated
-- staff (mirrors the broad `*.view` permission every role has); write
-- gated by create permission
-- ----------------------------------------------------------------------------
create policy memo_attachments_bucket_select on storage.objects for select to authenticated
  using (bucket_id = 'memo-attachments' and public.app_has_permission('memo.view'));
create policy memo_attachments_bucket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'memo-attachments' and public.app_has_permission('memo.create'));
create policy memo_attachments_bucket_delete on storage.objects for delete to authenticated
  using (bucket_id = 'memo-attachments' and public.app_has_permission('memo.manage'));

create policy announcement_attachments_bucket_select on storage.objects for select to authenticated
  using (bucket_id = 'announcement-attachments' and public.app_has_permission('announcement.view'));
create policy announcement_attachments_bucket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'announcement-attachments' and public.app_has_permission('announcement.create'));
create policy announcement_attachments_bucket_delete on storage.objects for delete to authenticated
  using (bucket_id = 'announcement-attachments' and public.app_has_permission('announcement.manage'));

-- ----------------------------------------------------------------------------
-- leave-attachments — private; owner uploads/reads own folder; HR/managers
-- with attendance.manage can read all
-- ----------------------------------------------------------------------------
create policy leave_attachments_select on storage.objects for select to authenticated
  using (
    bucket_id = 'leave-attachments'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.app_has_permission('attendance.manage')
    )
  );
create policy leave_attachments_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
