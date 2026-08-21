# ENVIRONMENT VARIABLES

All names extracted from `.env.example` (46 variables) and cross-referenced
against `process.env`/`import.meta.env` usage in source. **No values are
recorded anywhere in this file or elsewhere in `docs/project-memory/`.**

## Core app / Supabase

| Variable | Purpose | Required? | Scope | Where used |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Required | Both (public, client-safe) | `lib/supabase/client.ts`, `server.ts`, baked into CI/Android-build workflows |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key | Required | Both (public, client-safe) | same as above |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key, full DB access | Required (server only) | Both | `lib/supabase/admin.ts` **only**, per README's documented convention — never exposed to client |
| `SUPABASE_PROJECT_ID` | Project ref, used for type generation | Optional (dev tooling only) | Local | `npm run supabase:types` script |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI/API access token | Optional (dev tooling only) | Local | Supabase CLI operations (type gen, migrations) — not read directly by app code |
| `NEXT_PUBLIC_APP_URL` | Canonical app URL | Required | Both | middleware/redirects, CI/Android-build workflows (`http://127.0.0.1:3100` in CI, `https://mkh.haluoleo.id` in Android build) |
| `NEXT_PUBLIC_APP_NAME` | Display name | Optional | Both | UI branding |

## AI / Gemini

| Variable | Purpose | Required? | Scope | Where used |
|---|---|---|---|---|
| `GEMINI_API_KEY` | Gemini API auth | Required for any AI feature | Server only | `lib/ai/provider/registry.ts` (`isGeminiConfigured()`), `lib/ai/config.ts` |
| `GEMINI_MODEL` | Model identifier | Optional (has default) | Server only | `lib/ai/config.ts` → `AI_CONFIG.geminiModel` |
| `GEMINI_TEMPERATURE` | Generation temperature | Optional (has default) | Server only | `lib/ai/config.ts` |
| `GEMINI_MAX_OUTPUT_TOKENS` | Output token cap | Optional (has default) | Server only | `lib/ai/config.ts` |
| `GEMINI_TIMEOUT_MS` | Request timeout | Optional (has default) | Server only | `lib/ai/config.ts` |
| `GEMINI_RETRY_MAX_ATTEMPTS` | Retry budget | Optional (has default) | Server only | `lib/ai/provider/gemini-retry.ts` |
| `GEMINI_RETRY_BASE_DELAY_MS` | Retry backoff base | Optional (has default) | Server only | `lib/ai/provider/gemini-retry.ts` |
| `AI_PROVIDER` | Selects provider implementation | Optional (defaults `"gemini"`) | Server only | `lib/ai/provider/registry.ts` |
| `AI_SAFETY_THRESHOLD` | Gemini content-safety threshold, applied per harm category | Optional (has default) | Server only | `lib/ai/provider/gemini-provider.ts` |
| `AI_CIRCUIT_FAILURE_THRESHOLD` | Circuit breaker trip threshold | Optional (has default) | Server only | `lib/ai/resilience/circuit-breaker.ts` |
| `AI_CIRCUIT_OPEN_COOLDOWN_MS` | Circuit breaker cooldown | Optional (has default) | Server only | `lib/ai/resilience/circuit-breaker.ts` |
| `AI_HEALTHCHECK_CACHE_MS` | AI healthcheck cache TTL | Optional (has default) | Server only | likely `lib/ai/service.ts` or provider health check (not individually traced) |

## Google Veo (video generation)

| Variable | Purpose | Required? | Scope | Where used |
|---|---|---|---|---|
| `VEO_API_KEY` | Veo API auth | Required for video-gen feature | Server only (worker) | `lib/ai/veo/client.ts`, `scripts/veo-worker.ts` |
| `VEO_MODEL` | Veo model identifier | Optional (has default) | Server only | same |
| `VEO_WORKER_POLL_INTERVAL_MS` | Worker polling interval | Optional (has default) | Server only (Railway worker) | `scripts/veo-worker.ts` |

## Render worker

| Variable | Purpose | Required? | Scope | Where used |
|---|---|---|---|---|
| `RENDER_WORKER_POLL_INTERVAL_MS` | Worker polling interval | Optional (has default) | Server only (Railway worker) | `scripts/render-worker.ts` |

## Google Drive

| Variable | Purpose | Required? | Scope | Where used |
|---|---|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Service account credentials (JSON) | Required for Drive features | Server only | `lib/google-drive/client.ts` |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | Root folder for asset storage | Required for Drive features | Server only | `lib/google-drive/client.ts` |

## Meta (Facebook/Instagram Ads + WhatsApp)

| Variable | Purpose | Required? | Scope | Where used |
|---|---|---|---|---|
| `META_ACCESS_TOKEN` | Meta Graph API access token | Required for Meta features | Server only | `lib/meta/client.ts` |
| `META_AD_ACCOUNT_ID` | Ad account ID | Required for ads features | Server only | `lib/meta/ads.ts` |
| `META_API_VERSION` | Graph API version pin | Optional (has default) | Server only | `lib/meta/config.ts` |
| `META_BUSINESS_ID` | Meta Business ID | Required for Meta features | Server only | `lib/meta/config.ts` |
| `META_IG_USER_ID` | Instagram user ID | Required for IG publishing | Server only | `lib/social/instagram.ts` |
| `META_PAGE_ID` | Facebook Page ID | Required for Meta features | Server only | `lib/meta/config.ts` |
| `META_WHATSAPP_PHONE_NUMBER` | WhatsApp number tied to Meta Business | Required for WA features | Server only | likely `lib/ai/webhook-handler.ts` / `app/api/wa/*` |
| `META_ADS_DAILY_BUDGET_CAP_IDR` | Hard daily ad-spend cap (IDR) | Optional (safety guard) | Server only | `lib/meta/ads.ts` or `app/api/markom/*` |

## WhatsApp (Meta Cloud API)

| Variable | Purpose | Required? | Scope | Where used |
|---|---|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Cloud API access token | Required for WA features | Server only | `app/api/integrations/whatsapp/`, `lib/ai/webhook-handler.ts` |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WABA ID | Required for WA features | Server only | same |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone number ID | Required for WA features | Server only | same |
| `WHATSAPP_VERIFY_TOKEN` | Webhook verification token | Required for WA webhook | Server only | `app/api/integrations/whatsapp/` webhook handshake |

## Whacenter (alternate/secondary WA bridge)

| Variable | Purpose | Required? | Scope | Where used |
|---|---|---|---|---|
| `WHACENTER_DEVICE_ID` | Device ID for the Whacenter bridge | Required if this bridge is used | Server only | `UNKNOWN — NEEDS CONFIRMATION` exact call site; likely `lib/ai/connectors/whatsapp-*.ts` |

## TikTok Ads

| Variable | Purpose | Required? | Scope | Where used |
|---|---|---|---|---|
| `TIKTOK_ACCESS_TOKEN` | TikTok API access token | Required for TikTok features | Server only | `lib/social/tiktok.ts` |
| `TIKTOK_ADVERTISER_ID` | Advertiser account ID | Required for TikTok ads | Server only | `lib/social/tiktok.ts` |
| `TIKTOK_CLIENT_KEY` | OAuth client key | Required for TikTok features | Server only | `lib/social/tiktok-config.ts` |
| `TIKTOK_CLIENT_SECRET` | OAuth client secret | Required for TikTok features | Server only | `lib/social/tiktok-config.ts` |
| `TIKTOK_API_VERSION` | API version pin | Optional (has default) | Server only | `lib/social/tiktok-config.ts` |

## Security / automation

| Variable | Purpose | Required? | Scope | Where used |
|---|---|---|---|---|
| `CRON_SECRET` | Shared secret guarding cron/trigger-only endpoints | Required (guard **fails open** without it, per README) | Server only, production critical | `lib/security/cron-auth.ts` (`requireCronAuth()`), protects 10 routes per README |
| `VILLA_DEPLOY_SECRET` | Auth for villa deploy/secrets endpoints | Required for that integration | Server only | `app/api/villa/deploy`, `app/api/villa/secrets` |
| `VOICE_BRIDGE_ALLOWED_ORIGIN` | CORS allowlist for voice bridge | Required for voice-bridge to function cross-origin | Server only | `lib/ai/voice-bridge/cors.ts` |

## Backup (GitHub Actions secrets, not app runtime env)

| Variable | Purpose | Required? | Scope | Where used |
|---|---|---|---|---|
| (not in `.env.example` — GitHub Actions secrets only) `SUPABASE_DB_URL` | Direct Postgres connection string for `pg_dump` | Required to activate backups | CI only | `.github/workflows/backup.yml`, `scripts/backup-database.ts` |
| (same) `BACKUP_ENCRYPTION_KEY` | GPG symmetric passphrase for backup encryption | Required to activate backups | CI only | same |

## Android release signing (GitHub Actions secrets, not app runtime env)

Not in `.env.example` (these are Android/Gradle-specific, consumed as
GitHub Actions secrets and Gradle env vars, not Next.js env vars):
`ANDROID_RELEASE_KEYSTORE_BASE64`, `ANDROID_RELEASE_KEYSTORE_PASSWORD`,
`ANDROID_RELEASE_KEY_ALIAS`, `ANDROID_RELEASE_KEY_PASSWORD` (CI secret
names) mapping to `MKC_RELEASE_KEYSTORE_PATH`,
`MKC_RELEASE_KEYSTORE_PASSWORD`, `MKC_RELEASE_KEY_ALIAS`,
`MKC_RELEASE_KEY_PASSWORD` (Gradle-read env var names) — see
`MOBILE_BUILD.md`.

## Web Push (possible gap)

No `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`-style variable names were found
in `.env.example` despite the `web-push` package being a dependency and
`lib/push/web-push.ts` existing. **`UNKNOWN — NEEDS CONFIRMATION`** — either
these are named differently than expected, generated dynamically, stored in
the database, or this is a genuine configuration gap worth checking before
assuming Web Push is fully production-ready.

## Test-only variables (not in `.env.example`, GitHub Actions secrets)

`TEST_STAFF_EMAIL`, `TEST_STAFF_PASSWORD`, `TEST_HR_EMAIL`,
`TEST_HR_PASSWORD` — gate the `integration-tests`/`e2e-tests` CI jobs (see
`tests/integration/README.md` for full detail, not duplicated here).
