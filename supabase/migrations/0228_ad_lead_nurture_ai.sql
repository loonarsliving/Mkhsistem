-- ============================================================================
-- MK Connect — 0228: AI lead-nurture bot for ad-driven WhatsApp leads
--
-- Replaces the previous "ad click -> immediately notify a round-robin Sales"
-- behavior (lib/ai/domains/ad-lead-routing.ts's routeAdDrivenLead) with an
-- AI-nurture-first flow: Gemini answers the lead directly from a per-project
-- knowledge_base, tracks temperature signals across the whole conversation,
-- and only pings the branch's Kepala Cabang once the lead goes HOT. Sales
-- assignment stays manual (Kepala Cabang picks someone via plain WhatsApp
-- chat, same as today) -- prospects.sales_id is still populated by the
-- existing round-robin pick purely so the NOT NULL FK and every downstream
-- report/permission check (prospects_select's `sales_id = auth.uid()`, etc.)
-- keep working; it is just never used to push a notification anymore.
--
-- Unanswered questions go through a superadmin escalation loop: the bot
-- holds the lead off with a "saya cek dulu ya kak" reply, opens a
-- pending_questions row, and messages every active Super Admin with a short
-- code (mirrors approval_requests's AP-0001 pattern, 0201) they can reply to
-- with "[PQ-0001]: <jawaban>" -- loosely parsed (brackets/colon optional)
-- since real people don't type exact syntax. The answer both goes back to
-- the lead (Gemini-rephrased) and is banked into knowledge_base
-- (sumber = 'dari_admin') so the same question never needs to round-trip to
-- an admin again.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- prospects: temperature tracking + AI mode, additive columns only.
-- ----------------------------------------------------------------------------
alter table public.prospects
  add column lead_temperature text not null default 'cold'
    check (lead_temperature in ('cold', 'warm', 'hot')),
  -- Cumulative set of signal keys detected anywhere in the conversation so
  -- far (see lib/ai/domains/lead-nurture.ts's SIGNAL_KEYS) -- re-derived by
  -- Gemini from the full chat history on every turn, not incremented
  -- per-message, so a signal never "expires" just because the same intent
  -- wasn't restated in the latest message.
  add column temperature_signals jsonb not null default '[]'::jsonb,
  -- nurture: AI actively answers + tracks temperature. standby: AI still
  -- answers general questions (still knowledge_base-only, never invents)
  -- but stops pushing toward closing -- set the moment the lead goes HOT
  -- and Kepala Cabang is notified, since "assigned" itself happens outside
  -- this system (plain WhatsApp chat) and can't be observed here.
  add column ai_mode text not null default 'nurture'
    check (ai_mode in ('nurture', 'standby')),
  add column hot_at timestamptz;

create index prospects_lead_temperature_idx on public.prospects (lead_temperature) where deleted_at is null;

-- ----------------------------------------------------------------------------
-- knowledge_base: per-project FAQ the nurture bot answers from. Scoped by
-- project_id (crm_projects) rather than a free-text tag so it can't drift
-- from the project list every other feature already uses.
-- ----------------------------------------------------------------------------
create table public.knowledge_base (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.crm_projects(id) on delete cascade,
  kategori text not null check (kategori in ('harga', 'unit', 'fasilitas', 'pembayaran', 'lainnya')),
  pertanyaan_umum text not null,
  jawaban text not null,
  sumber text not null default 'manual' check (sumber in ('manual', 'dari_admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
create index knowledge_base_project_id_idx on public.knowledge_base (project_id) where is_active;
create index knowledge_base_pertanyaan_trgm_idx on public.knowledge_base using gin (pertanyaan_umum gin_trgm_ops);

create trigger set_updated_at before update on public.knowledge_base
  for each row execute function public.set_updated_at();
create trigger audit_log after insert or update or delete on public.knowledge_base
  for each row execute function public.audit_log_trigger();

-- ----------------------------------------------------------------------------
-- lead_chat_history: full transcript per prospect (lead/ai/admin turns),
-- separate from ai_conversations (which logs the internal-staff assistant,
-- one flattened inbound/reply row per turn) since the nurture bot needs
-- per-message granularity to feed Gemini a real conversation window and to
-- let a human later audit exactly what was said.
-- ----------------------------------------------------------------------------
create table public.lead_chat_history (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  sender text not null check (sender in ('lead', 'ai', 'admin')),
  message text not null,
  created_at timestamptz not null default now()
);
create index lead_chat_history_prospect_id_idx on public.lead_chat_history (prospect_id, created_at);

-- ----------------------------------------------------------------------------
-- pending_questions: a question the knowledge_base couldn't answer, escalated
-- to Super Admin. code mirrors approval_requests' AP-0001 pattern (0201).
-- ----------------------------------------------------------------------------
create sequence public.pending_question_code_seq;

create table public.pending_questions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('PQ-' || lpad(nextval('public.pending_question_code_seq')::text, 4, '0')),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  project_id uuid not null references public.crm_projects(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  pertanyaan text not null,
  status text not null default 'waiting' check (status in ('waiting', 'answered', 'timeout_escalated')),
  dikirim_ke_admin_at timestamptz not null default now(),
  dijawab_at timestamptz,
  jawaban_admin text,
  timeout_escalated_at timestamptz,
  created_at timestamptz not null default now()
);
create index pending_questions_prospect_id_idx on public.pending_questions (prospect_id);
create index pending_questions_waiting_idx on public.pending_questions (dikirim_ke_admin_at) where status = 'waiting';

-- ----------------------------------------------------------------------------
-- RLS. knowledge_base follows crm_projects' pattern (read-open reference
-- data, gated writes) since the admin form (features/lead-knowledge) needs
-- authenticated read/write. pending_questions and lead_chat_history are
-- service-role-only (webhook handler + cron use the admin client) -- same
-- "RLS enabled, zero policies" shape as ai_job_queue (0065): nothing is
-- reachable through the anon/authenticated Supabase client at all.
-- ----------------------------------------------------------------------------
alter table public.knowledge_base enable row level security;
alter table public.lead_chat_history enable row level security;
alter table public.pending_questions enable row level security;

create policy knowledge_base_select on public.knowledge_base for select to authenticated using (true);
create policy knowledge_base_write on public.knowledge_base for all to authenticated
  using (public.app_has_permission('prospect.manage'))
  with check (public.app_has_permission('prospect.manage'));

-- ----------------------------------------------------------------------------
-- ai_job_queue gains two more job types: nurture replies and the
-- admin-answer relay, both queued (not called synchronously from the
-- webhook) for the same "survive a Vercel timeout" reason every other
-- WhatsApp-triggered job in this system already is (see 0065).
-- ----------------------------------------------------------------------------
alter table public.ai_job_queue drop constraint ai_job_queue_job_type_check;
alter table public.ai_job_queue add constraint ai_job_queue_job_type_check check (job_type in (
  'whatsapp_ai_reply',
  'crm_sp1_draft',
  'markom_checklist_draft',
  'meta_ads_launch',
  'meta_ads_research',
  'social_weekly_evaluation',
  'crm_sales_coaching',
  'loonars_beauty_weekly_evaluation',
  'knowledge_bank_refresh',
  'sales_closing_tips_broadcast',
  'leasehold_competitor_comparison',
  'competitor_discovery',
  'loonars_beauty_competitor_comparison',
  'loonars_beauty_content_ideas_draft',
  'investor_intelligence_refresh',
  'cashflow_intelligence_refresh',
  'sales_teaching_weekly',
  'cashflow_action_plan',
  'loonars_beauty_weekly_content_audit',
  'markom_content_performance_broadcast',
  'occupancy_intelligence_refresh',
  'occupancy_teaching_biweekly',
  'content_submission_review',
  'kontenai_auto_produce',
  'kontenai_auto_bridge_to_studio',
  'zernio_publish_reconcile',
  'friday_executive_briefing',
  'friday_holding_briefing',
  'kontenai_asset_vision',
  'kontenai_auto_produce_beauty',
  -- This migration
  'whatsapp_lead_nurture_reply',
  'whatsapp_admin_answer_relay'
));

-- ----------------------------------------------------------------------------
-- New notification category so a Kepala Cabang's HOT-lead handoff shows up
-- in the in-app notification bell too, not just WhatsApp.
--
-- The array below is the FULL list actually live on production at the time
-- this migration was applied (verified via `pg_get_constraintdef` before
-- running it) -- earlier migrations in this repo's history had already
-- drifted from what got shipped (several categories, e.g. 'new_ad_lead',
-- 'construction_expense_submitted', 'approval_request_decided', existed live
-- but were never captured in a checked-in migration file). Dropping and
-- recreating this constraint from the stale shorter list any earlier
-- migration used would have silently deleted every one of those live
-- categories and broken the features that insert them. If this file is ever
-- replayed against a fresh database, re-verify the live constraint first
-- rather than trusting this snapshot blindly.
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
    'daily_motivation', 'daily_report',
    'birthday_wish',
    'ad_campaign_launched', 'ad_campaign_failed',
    'new_ad_lead', 'content_published', 'content_publish_reminder', 'finance_expense_alert',
    'branch_balance_alert', 'sales_coaching_tip', 'ad_lead_followup_reminder', 'ad_lead_escalation_branch',
    'ad_lead_escalation_director', 'whatsapp_webhook_silence_alert', 'finance_expense_pending_verification',
    'sales_conduct_warning', 'meta_ads_balance_low', 'content_publish_failed', 'database_followup_push',
    'lead_wants_info', 'loonars_fee_alert', 'automation_dispatch_failed', 'automation_job_dead_letter',
    'automation_queue_stalled', 'disciplinary_warning', 'employee_terminated', 'content_review_pending',
    'salary_transfer_request', 'salary_transferred', 'salary_transfer_summary',
    'construction_expense_submitted', 'construction_weekly_report', 'material_purchase_missing_photo',
    'construction_progress_report', 'approval_request_submitted', 'approval_request_decided',
    -- This migration
    'lead_hot_handoff', 'pending_question_timeout'
  ]));
