-- ============================================================================
-- MK Connect — 0251: Ad-lead AI manual takeover window
--
-- Owner's ask: for a few days, every ad-lead WhatsApp question should go
-- straight to Super Admin instead of the AI answering from knowledge_base --
-- so the owner personally handles the conversations, and the raw answers
-- (pending_questions.jawaban_admin -- already used once for a smaller style
-- pass, see lib/ai/domains/lead-nurture.ts's buildSystemPrompt "GAYA
-- BAHASA" section) become a real dataset to later refine the AI's chat
-- style from.
--
-- ai_lead_manual_takeover: single-row toggle (matches
-- kontenai_automation_settings' pattern, 0169). `until` set in the future
-- means every new lead question skips the Gemini knowledge-base reply
-- entirely and escalates straight to Super Admin (see runNurtureTurn /
-- runManualTakeoverTurn) -- self-expiring, no cron needed to turn it back
-- off.
--
-- pending_questions.raw_reply: true for a question raised while manual
-- takeover was active. relayAdminAnswerToLead sends jawaban_admin to the
-- lead verbatim (skipping its usual AI-rephrase step) for these rows, so
-- the lead genuinely receives the owner's own words, not an AI paraphrase.
-- ============================================================================

create table public.ai_lead_manual_takeover (
  id text primary key default 'singleton' check (id = 'singleton'),
  until timestamptz,
  updated_by uuid references public.employees(id),
  updated_at timestamptz not null default now()
);
alter table public.ai_lead_manual_takeover enable row level security;

insert into public.ai_lead_manual_takeover (id, until) values ('singleton', null);

create policy ai_lead_manual_takeover_select on public.ai_lead_manual_takeover
  for select using (app_is_super_admin());

create policy ai_lead_manual_takeover_write on public.ai_lead_manual_takeover
  for update using (app_is_super_admin()) with check (app_is_super_admin());

comment on table public.ai_lead_manual_takeover is
  'Single-row toggle: when until is set in the future, every ad-lead WhatsApp question skips the AI knowledge-base reply and escalates straight to Super Admin instead (see lib/ai/domains/lead-nurture.ts runNurtureTurn/runManualTakeoverTurn). Self-expiring -- no cron needed to turn back off.';

alter table public.pending_questions
  add column raw_reply boolean not null default false;

comment on column public.pending_questions.raw_reply is
  'True when this question was raised during an ai_lead_manual_takeover window -- relayAdminAnswerToLead sends jawaban_admin to the lead verbatim instead of AI-rephrasing it, so the lead gets the Super Admin''s own words unmodified.';
