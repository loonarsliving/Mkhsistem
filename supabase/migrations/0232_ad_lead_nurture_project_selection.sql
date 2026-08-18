-- ============================================================================
-- MK Connect — 0232: ask-which-project fallback for ad clicks missing ad_reply
--
-- Real production gap (Yanti's lead, 2026-08-18): WhatsApp's own client shows
-- "This chat started from an ad", but Whacenter's webhook can still deliver
-- ad_reply with every field null (source_id/source_type/source_url) -- a
-- known Meta Click-to-WhatsApp limitation, not something this app controls.
-- Without a source_id, the nurture bot cannot resolve which campaign/project/
-- branch the lead came from, so the message previously fell all the way
-- through to the "unrecognized sender" branch and got silently dropped: no
-- reply to the lead, no notification to anyone.
--
-- Owner's explicit fix: AI should ask the lead which project they're asking
-- about, then once they answer, match that against crm_projects and continue
-- as a normal nurture lead using that project's branch/knowledge_base.
--
-- pending_project_selections tracks that "we asked, waiting for their pick"
-- state for a phone number that has no prospects row yet (can't reuse
-- prospects/pending_questions for this since both require project_id/
-- branch_id to already be known).
-- ============================================================================

create table public.pending_project_selections (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  phone_normalized text not null,
  sender_name text,
  first_message text not null,
  status text not null default 'awaiting' check (status in ('awaiting', 'matched')),
  matched_project_id uuid references public.crm_projects(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pending_project_selections_awaiting_idx
  on public.pending_project_selections (phone_normalized)
  where status = 'awaiting';

create trigger set_updated_at before update on public.pending_project_selections
  for each row execute function public.set_updated_at();

-- service-role-only (webhook handler uses the admin client exclusively),
-- same "RLS enabled, zero policies" shape as pending_questions/ai_job_queue.
alter table public.pending_project_selections enable row level security;
