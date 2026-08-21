# AI AND AGENTS

Only AI features/agents with direct code evidence are listed. Nothing here
is invented or extrapolated beyond what the source shows.

## Provider layer

- **Model/provider**: Google Gemini, via `@google/genai`
  (`lib/ai/provider/gemini-client.ts`, `gemini-provider.ts`).
- **Abstraction**: `lib/ai/provider/registry.ts` implements a single
  `AIProvider` interface (`lib/ai/provider/types.ts`) with `AI_PROVIDER` env
  var selecting the implementation. **Only `"gemini"` is implemented** —
  the code's own comments describe this as the seam for adding a second
  provider later, not evidence one currently exists. Do not assume a second
  provider is live.
- **Resilience**: `lib/ai/resilience/circuit-breaker.ts` (per-integration
  circuit breaker state persisted to `ai_circuit_breaker_state` table),
  `lib/ai/resilience/telemetry.ts` (request telemetry to
  `ai_request_telemetry`), retry with backoff
  (`lib/ai/provider/gemini-retry.ts`).
- **Job queue**: `lib/ai/queue/ai-job-queue.ts` — all async AI work is
  queued into the `ai_job_queue` Postgres table and processed via
  `app/api/ai/process-job`, not called synchronously from most request
  paths. See `ARCHITECTURE.md` and `docs/AUTOMATION.md` for the full
  execution-path model (4 paths; the AI queue is one of them).

## FRIDAY — Executive Intelligence Layer

- **Purpose**: cross-domain executive briefing — reads CRM, Meta ads,
  branch finance, HR/attendance, Markom, occupancy, and automation health
  simultaneously and produces one structured briefing: situation → root
  cause → risk-of-inaction → ≥3 alternatives with tradeoffs →
  recommendation with rationale → expected outcome (per README, matches
  the code's domain-reading breadth in `lib/ai/friday/`).
- **Model**: Gemini (via the shared provider layer above).
- **Input**: cross-domain signals computed **in application code, not by
  the model** — `lib/ai/friday/signals.ts` (e.g. ad cost per lead, share of
  stalled prospects) — the model only narrates over pre-computed numbers.
- **Output**: structured briefing persisted to `friday_briefings`; optional
  proposed actions persisted to `friday_actions` with `status = 'proposed'`.
- **Tools/scope**: reads via `repositories/friday.repository.ts`; action
  vocabulary is a fixed catalog (`lib/ai/friday/action-catalog.ts`) enforced
  by a DB check constraint (migration `0179`) — the model cannot propose an
  action outside this catalog. No catalog entry launches ads, spends
  budget, publishes content, or messages customers directly (per README).
- **Location**: `lib/ai/friday/{analyst,briefing,prompt,signals,
  action-catalog}.ts`, `app/(app)/friday`, `features/friday/`.
- **Caller**: scheduled daily at 06:30 WITA (per README; underlying
  `pg_cron` job name not independently re-verified in this pass) and
  on-demand via the UI with a specific question.
- **Status**: DONE. Actions execute only after a human holding
  `friday.action_decide` approves — the `private_assistant` role
  deliberately has `friday.view`/`friday.run` but not
  `friday.action_decide` (migration `0177`).

## FRIDAY Holding — multi-business rollup

- **Purpose**: reads across the whole business group (Villa, Homestay, Kos,
  Hotel, Coffee Shop, future businesses), each of which keeps its own
  database/dashboard/automation as source of truth.
- **Model**: Gemini, via `lib/ai/friday/holding-prompt.ts` +
  `lib/ai/friday/holding.ts`.
- **Input**: per-business snapshots via a `Connector` abstraction
  (`lib/ai/connectors/manager.ts`) — two connector kinds: `internal_mkh`
  (reads MK Connect's own DB directly) and `http` (reads another business's
  dashboard JSON). Each snapshot carries a fixed-vocabulary `metrics[]`
  channel (enables arithmetic cross-business comparison) plus a free-form
  `narrative` channel.
- **Output**: holding-level briefing; a business whose connector fails
  becomes status `data_tidak_tersedia`, **hard-forced in code
  (`holding.ts`)** regardless of what the model would otherwise generate —
  explicitly to prevent an unreachable dashboard being reported as "quiet"
  or "critical."
- **Location**: `app/(app)/friday/holding`, `lib/ai/friday/holding*.ts`,
  `repositories/holding.repository.ts`, migration
  `0182_friday_holding_architecture.sql`.
- **Caller**: `/friday/holding` UI; scheduling `UNKNOWN — NEEDS
  CONFIRMATION` (not independently verified whether this runs on the same
  06:30 WITA cron as core FRIDAY or its own).
- **Status**: DONE.

## Domain AI helpers (`lib/ai/domains/*.ts`)

A large set of narrower, single-purpose AI functions, each backing one
workflow (evidenced by file presence — full list not individually
audited line-by-line, but all are wired into named migrations/routes,
indicating live rather than dead code):

`ad-lead-routing`, `approval-requests`, `cashflow-intelligence`,
`cashflow-teaching`, `construction-fund-transfer-confirmation`,
`construction-overall-progress`, `construction-payment-review`,
`construction-progress-tracking`, `construction-progress-vision`,
`construction-report-routing`, `contractor-expense-report`,
`contractor-fund-request-recognition`, `contractor-fund-request`, `crm`,
`data-queries`, `expense-receipt-recognition`, `finance`, `hr`,
`investor-intelligence`, `knowledge-bank`, `kontenai-analytics`,
`kontenai-director`, `kontenai-learning`, `kontenai-publishing`,
`kontenai-storyboard`, `kontenai-vision`, `lead-nurture`, `loonars-beauty`,
`loonars-fee-approval`, `markom`, `material-receipt-submission`,
`message-relay`, `occupancy-intelligence`, `occupancy-teaching`,
`photo-auto-forward`, `sales-teaching`, `transfer-proof-confirmation`,
`transfer-proof-recognition`, `transfer-rejection`,
`tukang-payment-recommendation`.

- **Model**: Gemini for all, via the shared provider.
- **Router**: `lib/ai/domains/router.ts` dispatches inbound
  events/messages (notably WhatsApp) to the correct domain handler.
- **Prompts**: `lib/ai/domains/prompts.ts` centralizes prompt text/templates
  used across domain handlers; `ai_system_prompts` table
  (`0068_ai_system_prompts.sql`) suggests some prompts are DB-configurable
  rather than hardcoded — exact split between hardcoded vs DB-stored
  prompts `UNKNOWN — NEEDS CONFIRMATION`.
- **Status**: DONE for the modules with matching migrations (see
  `FEATURES.md` for per-domain status); newest additions per git log are
  the contractor expense-report chain
  (`contractor-expense-report.ts`, `contractor-fund-request*.ts`).

## KontenAI content pipeline

- **Purpose**: end-to-end AI content production — direction/briefing,
  storyboarding, asset selection (with Gemini Vision analysis), rendering,
  publishing, and post-hoc analytics/learning.
- **Model**: Gemini for text/vision (`kontenai-director.ts`,
  `kontenai-storyboard.ts`, `kontenai-vision.ts`,
  `kontenai-analytics.ts`, `kontenai-learning.ts`,
  `kontenai-publishing.ts`); Google Veo for video generation
  (`lib/ai/veo/client.ts`).
- **Input**: creative briefs, asset library (Google Drive-backed),
  performance history for the learning-engine feedback loop.
- **Output**: storyboards, rendered video assets, publish schedules,
  optimization recommendations.
- **Location**: `app/(app)/kontenai/*` (9 sub-routes), `features/kontenai/`
  (105 files — the single largest feature module in the repo),
  `repositories/kontenai-*.repository.ts` (9 files), `lib/kontenai/`.
- **Status**: DONE overall; the Gemini Vision background-queue sub-feature
  was explicitly reverted once (`0186_revert_kontenai_vision_background_queue.sql`)
  — flag this specific sub-piece as PARTIAL/iterated rather than assumed
  stable.

## Voice Assistant / Voice Bridge

- **Purpose**: voice-driven assistant interaction.
- **Model**: Gemini, via `lib/ai/voice-bridge/gemini-agent.ts`, which
  defines its own tool set (`lib/ai/voice-bridge/tools.ts`) — i.e. this is
  the one component in the codebase that most resembles a tool-using
  "agent" in the LLM sense (function/tool calling), as distinct from the
  domain helpers above which are single-shot generate calls.
- **Input**: voice input relayed via `app/api/ai/voice-bridge` and
  `app/api/ai/voice-assistant`; CORS constrained by
  `lib/ai/voice-bridge/cors.ts` and `VOICE_BRIDGE_ALLOWED_ORIGIN`.
- **Output**: voice/text assistant responses; also produces a "daily
  digest" per migration `0171_voice_bridge_daily_digest.sql`.
- **Location**: `app/(app)/asisten`, `features/assistant/` (3 files),
  `lib/ai/voice-bridge/`.
- **Caller**: `UNKNOWN — NEEDS CONFIRMATION` whether this is web-only,
  mobile-only, or both (Capacitor has microphone-adjacent plugins but no
  dedicated voice plugin was seen in `package.json`).
- **Status**: PARTIAL — present and migrated, but the smaller file count
  relative to other modules (3 feature files) suggests thinner UI/action
  coverage than the domain breadth implies; not fully verified in depth.

## WhatsApp AI relay

- **Purpose**: routes inbound WhatsApp messages/media to the appropriate
  domain AI handler (via `lib/ai/domains/router.ts` and
  `lib/ai/webhook-handler.ts`), and sends AI-composed replies back out.
- **Location**: `app/api/ai/whatsapp-relay`,
  `app/api/integrations/whatsapp/`, `lib/ai/domains/message-relay.ts`.
- **Status**: DONE — this is the primary channel for a large share of the
  domain AI helpers (contractor reports, fund requests, lead nurture,
  transfer confirmations all arrive/reply via WhatsApp per migration and
  commit-message evidence).

## Text-to-speech / music

- `lib/ai/tts.ts` and `lib/ai/music.ts` exist. Purpose and call sites
  `UNKNOWN — NEEDS CONFIRMATION` — not traced to a specific feature/route
  in this audit pass; may be KontenAI-related (video needs audio) or
  Voice-Assistant-related. Flagging rather than guessing.

## Summary

No AI features beyond Gemini-backed generation/vision and the Veo video
model were found. No agent framework (LangChain, CrewAI, AutoGen, etc.) is
a dependency — `package.json` shows no such library. The closest thing to a
classic "tool-using agent" is the Voice Bridge's Gemini agent with an
explicit tool set (`lib/ai/voice-bridge/tools.ts`); everything else is
single-shot Gemini generate calls organized by domain, queued through
`ai_job_queue`, with deterministic pre/post-processing in application code.
