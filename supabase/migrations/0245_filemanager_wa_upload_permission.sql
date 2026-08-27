-- ============================================================================
-- MK Connect — 0245: Filemanager WhatsApp-upload permission
--
-- Owner's ask: "kirim saya file X" already works for anyone recognized as
-- an employee (see lib/ai/domains/file-request.ts), but SAVING a new file
-- into the catalog by sending it as a WhatsApp attachment ("simpan sebagai
-- ... kategori ...") should be restricted -- not every employee should be
-- able to add files to the company file manager. Starts Super Admin-only;
-- owner said more roles will be added later (files.wa_upload can simply be
-- granted to additional roles in a future migration, same pattern as every
-- other permission in this schema).
--
-- No new tables here -- the file catalog and its bytes live entirely on
-- the owner's Mac Mini (separate `Filemanager` repo, reached via a
-- Cloudflare Tunnel from lib/filemanager/client.ts). This app only needs a
-- permission to gate who may trigger a save.
-- ============================================================================

insert into public.permissions (key, description) values
  ('files.wa_upload', 'Save a new file into the company file manager by sending it as a WhatsApp attachment')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key = 'files.wa_upload'
where r.key = 'super_admin'
on conflict do nothing;
