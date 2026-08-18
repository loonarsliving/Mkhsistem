-- ============================================================================
-- MK Connect — 0231: per-project handoff-only mode for the AI lead-nurture bot
--
-- Property Management (Kirana by Loonars) is a different business shape from
-- the villa/rumah projects the nurture bot was designed for: leads are
-- property owners being pitched a management service by a partner/reseller
-- ("orang lain yang menawarkan produk kita"), not buyers who benefit from an
-- AI walking them through a knowledge-base FAQ. Owner's explicit ask: for
-- this project, AI should never engage with FAQ content -- it should just
-- redirect the lead and immediately hand off to that branch's Kepala Cabang
-- (Ayu) so a human takes the conversation from the very first message.
--
-- ai_lead_mode is per-project (not a global switch) so every other project
-- keeps the full nurture/knowledge-base/temperature flow unchanged.
-- ============================================================================

alter table public.crm_projects
  add column ai_lead_mode text not null default 'nurture'
    check (ai_lead_mode in ('nurture', 'handoff'));

update public.crm_projects set ai_lead_mode = 'handoff' where name = 'Property management';
