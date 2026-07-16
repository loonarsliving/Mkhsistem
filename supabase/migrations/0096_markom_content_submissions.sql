-- ============================================================================
-- MK Connect — 0096: Markom content submissions (upload -> AI review ->
-- schedule to Instagram at the best hour)
--
-- Closes the loop the checklist brief (kpi_tasks) opens: Markom now has a
-- place to upload the actual finished photo/video they made for a brief,
-- have AI review it (real vision for photos via Gemini multimodal, see
-- lib/ai/domains/markom.ts's reviewContentSubmission; caption-only for
-- video -- no frame-level video understanding exists in this codebase),
-- and once approved, schedule it to auto-publish to Instagram at the
-- account's own real best-upload-hour (social_account_snapshots.best_upload_hour,
-- already computed from real IG insights for the Content Planner module).
--
-- Same single-permission / open-read shape as crm_project_photos (0078) --
-- this is marketing content headed for a public Instagram post anyway, no
-- reason to lock reads down tighter than that. Publishing itself is a
-- Content Publishing API call (lib/social/instagram.ts) that requires the
-- connected token to actually have instagram_content_publish -- unverified,
-- see that module's doc comment; a permission error there is expected
-- first-run friction to diagnose from a real error, not a design flaw.
-- ============================================================================

insert into public.permissions (key, description) values
  ('content_submission.manage', 'Upload finished content for a checklist brief, see AI review, and schedule it to auto-publish to Instagram')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where r.key in ('markom', 'direktur_utama', 'direktur_operasional') and p.key = 'content_submission.manage'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p where r.key = 'super_admin'
on conflict do nothing;

create table public.markom_content_submissions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.kpi_tasks(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  division_id uuid not null references public.divisions(id) on delete restrict,
  submitted_by uuid not null references public.employees(id) on delete restrict,
  media_type text not null check (media_type in ('image', 'video')),
  storage_path text not null,
  public_url text not null,
  caption text,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'needs_revision', 'approved', 'scheduled', 'published', 'failed')),
  ai_verdict text,
  ai_reviewed_at timestamptz,
  scheduled_publish_at timestamptz,
  -- Set once a container is created so the 5-minute publish worker
  -- (below) never creates a second container for the same submission
  -- while a video is still processing on Meta's side -- it just re-checks
  -- status on the existing container each tick.
  ig_container_id text,
  ig_media_id text,
  published_at timestamptz,
  failure_reason text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.employees(id),
  updated_by uuid references public.employees(id)
);

create index markom_content_submissions_task_idx on public.markom_content_submissions (task_id) where deleted_at is null;
create index markom_content_submissions_branch_idx on public.markom_content_submissions (branch_id, status) where deleted_at is null;
create index markom_content_submissions_scheduled_idx on public.markom_content_submissions (scheduled_publish_at) where status = 'scheduled';

create trigger set_updated_at before update on public.markom_content_submissions
  for each row execute function public.set_updated_at();

create trigger audit_log after insert or update or delete on public.markom_content_submissions
  for each row execute function public.audit_log_trigger();

alter table public.markom_content_submissions enable row level security;

create policy markom_content_submissions_select on public.markom_content_submissions for select to authenticated using (true);
create policy markom_content_submissions_write on public.markom_content_submissions for all to authenticated
  using (public.app_has_permission('content_submission.manage'))
  with check (public.app_has_permission('content_submission.manage'));

-- ----------------------------------------------------------------------------
-- Storage bucket: public read (published content is public anyway), write
-- gated the same as the table. Video needs both a wider size cap and a
-- video mime allowlist neither existing bucket (project-photos,
-- promo-templates) has.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('markom-content-submissions', 'markom-content-submissions', true, 52428800,
  array['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/quicktime'])
on conflict (id) do nothing;

create policy markom_content_submissions_bucket_select on storage.objects for select to authenticated, anon
  using (bucket_id = 'markom-content-submissions');
create policy markom_content_submissions_bucket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'markom-content-submissions' and public.app_has_permission('content_submission.manage'));
create policy markom_content_submissions_bucket_delete on storage.objects for delete to authenticated
  using (bucket_id = 'markom-content-submissions' and public.app_has_permission('content_submission.manage'));

-- ----------------------------------------------------------------------------
-- Notification categories: adds 'content_published' for this feature, and
-- fixes a real pre-existing bug found while touching this constraint --
-- routeAdDrivenLead (lib/ai/domains/ad-lead-routing.ts, migration 0092)
-- inserts category 'new_ad_lead' but no migration ever added it here, so
-- every one of those notification inserts has been silently failing the
-- check constraint since that feature shipped (never caught because no
-- real ad-driven lead has reached that code path yet).
-- ----------------------------------------------------------------------------
alter table public.mkc_notifications drop constraint mkc_notifications_category_check;
alter table public.mkc_notifications add constraint mkc_notifications_category_check
  check (category is null or category = any (array[
    'attendance_reminder', 'late_attendance', 'forgot_checkout', 'leave_approved', 'leave_rejected', 'payroll_available',
    'new_prospect', 'follow_up_reminder', 'new_assignment', 'closing_approved', 'customer_verification', 'target_reminder',
    'markom_new_task', 'task_revision', 'task_approved', 'weekly_reminder',
    'project_progress', 'material_request', 'inspection_reminder',
    'payment_received', 'invoice_due', 'reimbursement_approved',
    'waiting_approval', 'approved', 'rejected',
    'new_announcement', 'new_memo',
    'maintenance', 'version_update', 'emergency_notice',
    'stuck_prospect_reminder', 'stuck_prospect_alert', 'branch_target_reminder',
    'sp1_pending_review', 'sp1_issued', 'sp1_escalation',
    'task_pending_verification',
    'daily_motivation', 'daily_report', 'birthday_wish',
    'ad_campaign_launched', 'ad_campaign_failed',
    'new_ad_lead',
    -- This migration
    'content_published'
  ]));

-- ----------------------------------------------------------------------------
-- Every 5 minutes, publish any submission whose scheduled_publish_at has
-- arrived -- same deliberately-separate-from-enqueue, paced-worker pattern
-- as crm-promo-sends-worker (0089). The route itself does the actual Meta
-- Content Publishing API calls (container create/status-check/publish) and
-- handles the async video-processing case by leaving status='scheduled'
-- with ig_container_id set so the next tick just re-checks status instead
-- of creating a duplicate container.
-- ----------------------------------------------------------------------------
select cron.schedule(
  'markom-content-publish-worker',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://mkh.haluoleo.id/api/social/publish-content',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 45000
  );
  $$
);
