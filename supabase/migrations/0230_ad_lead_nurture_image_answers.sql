-- ============================================================================
-- MK Connect — 0230: image support for the AI lead-nurture bot
--
-- The nurture bot (0228) was text-only: a Super Admin answering an escalated
-- question could only reply with words, and knowledge_base had nowhere to
-- hold a denah/brosur/foto. First real gap hit in production: a lead asked
-- "ada denah untuk unit tipe 60?" -- nothing in this system could carry that
-- answer as an image.
--
-- Adds image_url to both pending_questions (the raw photo an admin sends to
-- answer an escalation) and knowledge_base (so once answered, that image is
-- reusable -- the next lead asking the same thing gets it automatically,
-- same "learns over time" loop the text case already has).
-- ============================================================================

alter table public.pending_questions add column image_url text;
alter table public.knowledge_base add column image_url text;
