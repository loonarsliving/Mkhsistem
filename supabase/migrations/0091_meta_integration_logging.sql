-- ============================================================================
-- MK Connect — 0091: Widen ai_integration_logs to cover Meta Graph API calls
--
-- metaGraphRequest (lib/meta/client.ts) never persisted request/response
-- detail anywhere, so a launch failure like "Meta Graph API error: Invalid
-- parameter" had no way to be diagnosed further -- Meta's error object
-- usually carries a much more specific error_user_msg/error_subcode that was
-- being discarded. ai_integration_logs already exists for this exact
-- purpose (WhatsApp connector telemetry); this just lets 'meta' use it too.
-- ============================================================================

alter table public.ai_integration_logs drop constraint ai_integration_logs_connector_check;
alter table public.ai_integration_logs add constraint ai_integration_logs_connector_check
  check (connector in ('whatsapp', 'meta'));
