# INTEGRATIONS

Every external integration below is evidenced by dependency + code +
(where applicable) `.env.example` variable names. No secrets are recorded.

---

## Supabase

- **Purpose**: primary database (PostgreSQL), auth, storage, realtime.
- **Location**: `lib/supabase/{client,server,admin,middleware,bearer,storage}.ts`,
  `supabase/migrations/`, `supabase/functions/sync-inbound/`.
- **Data IN**: all application reads via `repositories/*` and direct
  Supabase client calls.
- **Data OUT**: all application writes via Server Actions / RPCs; file
  uploads to Storage buckets.
- **Auth method**: `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public, client-safe) +
  `SUPABASE_SERVICE_ROLE_KEY` (server-only, used exclusively in
  `lib/supabase/admin.ts` per README's stated convention).
- **Status**: DONE / live in production.
- **Dependencies**: `@supabase/ssr`, `@supabase/supabase-js`.

## Google Gemini

- **Purpose**: sole LLM provider for all AI features (FRIDAY briefings,
  CRM/lead nurture, KontenAI content generation/vision, HR/finance
  domain helpers, voice assistant, WhatsApp-driven flows).
- **Location**: `lib/ai/provider/gemini-client.ts`,
  `gemini-provider.ts`, `gemini-retry.ts`; wired through
  `lib/ai/provider/registry.ts` (a provider-abstraction boundary —
  `AIProvider` interface — with Gemini as the only implemented case;
  code comments explicitly describe this as the seam for adding a second
  provider later, none exists today).
- **Data IN**: prompts assembled per-domain in `lib/ai/domains/*.ts` and
  `lib/ai/friday/*.ts`.
- **Data OUT**: generated text/JSON responses, consumed by callers; safety
  thresholds applied per harm category (`HARM_CATEGORY_HARASSMENT`,
  `HATE_SPEECH`, `SEXUALLY_EXPLICIT`, `DANGEROUS_CONTENT`) via
  `AI_SAFETY_THRESHOLD`.
- **Auth method**: `GEMINI_API_KEY`.
- **Status**: DONE, actively used, protected by a circuit breaker
  (`lib/ai/resilience/circuit-breaker.ts`, tunable via
  `AI_CIRCUIT_FAILURE_THRESHOLD`/`AI_CIRCUIT_OPEN_COOLDOWN_MS`) and retry
  logic (`GEMINI_RETRY_MAX_ATTEMPTS`/`GEMINI_RETRY_BASE_DELAY_MS`).
- **Dependencies**: `@google/genai`; config knobs `GEMINI_MODEL`,
  `GEMINI_TEMPERATURE`, `GEMINI_MAX_OUTPUT_TOKENS`, `GEMINI_TIMEOUT_MS`.

## Google Veo (video generation)

- **Purpose**: AI video generation for KontenAI content pipeline.
- **Location**: `lib/ai/veo/client.ts`, `scripts/veo-worker.ts`, migration
  `0172_kontenai_veo_bridge.sql`.
- **Data IN**: generation prompts/parameters from `kontenai` jobs.
- **Data OUT**: generated video assets.
- **Auth method**: `VEO_API_KEY`.
- **Status**: DONE (dedicated polling worker deployed via Railway).
- **Dependencies**: `VEO_MODEL`, `VEO_WORKER_POLL_INTERVAL_MS`.

## Google Drive

- **Purpose**: asset storage/retrieval for KontenAI (per migration
  `0167_kontenai_assets_google_drive.sql`).
- **Location**: `lib/google-drive/client.ts`.
- **Auth method**: `GOOGLE_SERVICE_ACCOUNT_JSON` (service account),
  `GOOGLE_DRIVE_ROOT_FOLDER_ID`; `google-auth-library` dependency.
- **Status**: DONE.

## Meta (Facebook/Instagram Ads + Messenger/Business)

- **Purpose**: ad campaign management (Markom module) and Instagram
  content publishing.
- **Location**: `lib/meta/{ads,client,config}.ts`,
  `lib/social/instagram.ts`, `app/api/markom/check-ads-balance`,
  `refresh-ad-campaign-spend`, `app/api/debug/meta-ads-config`,
  `app/api/debug/instagram-config`.
- **Data IN**: campaign performance/spend data pulled from Meta's API.
- **Data OUT**: campaign creation/updates, ad spend budget checks
  (`META_ADS_DAILY_BUDGET_CAP_IDR` enforced client-side per env var name).
- **Auth method**: `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`,
  `META_BUSINESS_ID`, `META_IG_USER_ID`, `META_PAGE_ID`, `META_API_VERSION`.
- **Status**: DONE, iterated extensively (migrations `0079`–`0141` and
  later touch Meta ad campaign tables).

## Meta WhatsApp Business Cloud API

- **Purpose**: primary WhatsApp channel — inbound webhook processing,
  outbound messages, lead nurture, contractor reports, approvals routed
  through WhatsApp.
- **Location**: `app/api/integrations/whatsapp/`, `app/api/wa/send`,
  `app/api/admin/send-wa-message`, `app/api/debug/whatsapp-config`,
  `lib/ai/webhook-handler.ts`, `lib/ai/domains/message-relay.ts`.
- **Auth method**: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_BUSINESS_ACCOUNT_ID`,
  `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`,
  `META_WHATSAPP_PHONE_NUMBER`.
- **Status**: DONE — this is the primary interaction surface for a large
  share of the AI-domain modules (ad lead routing, construction expense
  reports, finance approvals, salary summaries all route through WA per
  migration names and recent commit messages).

## Whacenter (secondary/alternate WhatsApp bridge)

- **Purpose**: a device-based WhatsApp bridge, distinct from the official
  Meta Cloud API — evidenced by `WHACENTER_DEVICE_ID` env var and
  `.github/workflows/wa-bridge-test.yml`.
- **Location**: exact call sites `UNKNOWN — NEEDS CONFIRMATION` (not
  isolated during this audit beyond the env var and the CI workflow name);
  likely `lib/ai/connectors/whatsapp-connector.ts` /
  `whatsapp-http-client.ts`, but this needs direct code confirmation
  before being relied upon.
- **Status**: PARTIAL/UNKNOWN — presence of a dedicated CI test workflow
  (`wa-bridge-test.yml`) indicates active use, but full integration depth
  wasn't verified in this pass.

## TikTok Ads

- **Purpose**: ad management, per `lib/social/tiktok.ts` /
  `tiktok-config.ts` and migration `0122_tiktok_cold_start_growth_topic.sql`.
- **Auth method**: `TIKTOK_ACCESS_TOKEN`, `TIKTOK_ADVERTISER_ID`,
  `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_API_VERSION`.
- **Status**: PARTIAL — env vars and a config/client file exist; breadth of
  usage relative to Meta (which has 60+ migrations touching it) suggests
  this is a thinner integration; not fully verified.

## Zernio

- **Purpose**: `@zernio/node` is a direct npm dependency; `lib/social/zernio.ts`
  exists; migration `0170_zernio_publish_reconciliation.sql` and
  `app/api/debug/zernio-connect` reference it. Appears to be a
  publishing/reconciliation platform used by the content pipeline.
- **Status**: DONE (has a dedicated migration and debug endpoint), but
  exact product/vendor purpose is `UNKNOWN — NEEDS CONFIRMATION` beyond
  what's inferable from file/migration names.

## Vercel

- **Purpose**: production web hosting for the Next.js app.
- **Location**: `vercel.json` (region `sin1` — Singapore), `@vercel/speed-insights`
  package (auto-active on Vercel deploys per README), `.gitignore` excludes
  `.vercel` (local project-link file, confirming Vercel CLI/dashboard
  linkage exists but isn't committed).
- **Status**: DONE — see `DEPLOYMENT.md` for the full flow. Exact Vercel
  project name/ID/team is `UNKNOWN — NEEDS CONFIRMATION` (not present in
  repo; would require Vercel dashboard/API access to confirm).

## Railway

- **Purpose**: hosts the standalone background workers (render, Veo,
  general worker) that must run outside Vercel's serverless request
  lifecycle.
- **Location**: `railway.json` (`DOCKERFILE` builder →
  `Dockerfile.render-worker`).
- **Status**: DONE for the render worker path; whether `veo-worker.ts` and
  `worker-main.ts` are deployed via the same Railway service/Dockerfile or
  separate ones is `UNKNOWN — NEEDS CONFIRMATION` (only one Dockerfile was
  found, named specifically for the render worker).

## Web Push

- **Purpose**: browser push notifications.
- **Location**: `lib/push/web-push.ts`, `app/api/push/send`, migration
  `0021_device_push_tokens.sql`, `0052_web_push_notifications.sql`.
- **Auth method**: VAPID keys — not found named in `.env.example`
  (`UNKNOWN — NEEDS CONFIRMATION`; the `web-push` package typically needs
  `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`-style env vars, but no such names
  were found in `.env.example`, so they may be generated/stored elsewhere
  or hardcoded — worth confirming before assuming this is fully wired).
- **Status**: PARTIAL/UNKNOWN pending the above confirmation.

## Google (auth-library, general)

- **Purpose**: `google-auth-library` dependency backs Google Drive service
  account auth and possibly other Google API calls.
- **Status**: DONE for Drive; broader usage not fully enumerated.

## "MKH Property" cross-system sync (via Supabase FDW + Edge Function)

- **Purpose**: `pg_cron` jobs `sync-dispatch-pending`/`sync-collect-responses`
  (per `docs/AUTOMATION.md`) send/receive `sync_log` entries to/from an
  external system referred to as "MKH Property"; `supabase/functions/sync-inbound/`
  and `0146_kos_fdw_integration.sql` (Foreign Data Wrapper) are the likely
  mechanisms.
- **Status**: DONE per the automation doc, but the external system's own
  identity/repo/ownership is `UNKNOWN — NEEDS CONFIRMATION` from this repo
  alone.

## Villa / Loonars Sales SSO

- **Purpose**: `app/api/sso/loonars-sales`, `app/api/villa/deploy`,
  `app/api/villa/secrets` suggest a live integration with another
  Loonars/villa-branded system for SSO and deploy/secret coordination.
- **Auth method**: `VILLA_DEPLOY_SECRET` env var.
- **Status**: PARTIAL/UNKNOWN — routes exist; exact protocol and the
  identity of the other system are `UNKNOWN — NEEDS CONFIRMATION`.
