# ARCHITECTURE

All claims below are grounded in the actual folder layout, `README.md`'s
"Arsitektur" section (verified against the folders it describes), and named
source files. Where a claim could not be directly verified, it is marked
`UNKNOWN — NEEDS CONFIRMATION`.

## High-level stack

| Layer | Technology | Evidence |
|---|---|---|
| Framework | Next.js 15.5.23 (App Router, Server Components, Server Actions) | `package.json`, `next.config.ts`, `app/` structure |
| Language | TypeScript, strict mode | `tsconfig.json`, `.ts`/`.tsx` throughout |
| Styling | Tailwind CSS + Radix UI primitives | `tailwind.config.ts`, `@radix-ui/*` deps, `components/ui/` |
| Backend/data | Supabase (PostgreSQL, Auth, Storage, Realtime, RLS) | `@supabase/ssr`, `@supabase/supabase-js`, `lib/supabase/*`, `supabase/migrations/` |
| Data fetching | TanStack Query (client) + Server Actions (mutations) | `@tanstack/react-query` dep, `features/*/actions` |
| Tables | TanStack Table | `@tanstack/react-table` dep |
| Forms | React Hook Form + Zod | `react-hook-form`, `zod`, `features/*/schemas` |
| Hosting (web) | Vercel | `vercel.json` (region `sin1`), `@vercel/speed-insights` dep, `.gitignore` excludes `.vercel`, CI/Android workflows reference production URL `https://mkh.haluoleo.id` |
| Mobile shell | Capacitor 8 (Android; iOS not present) | `capacitor.config.ts`, `android/` directory, no `ios/` directory found |
| Background workers | Standalone Node/tsx workers, deployed to Railway | `scripts/render-worker.ts`, `scripts/veo-worker.ts`, `scripts/worker-main.ts`, `Dockerfile.render-worker`, `railway.json` |
| AI provider | Google Gemini via `@google/genai` | `lib/ai/provider/gemini-*.ts`, `.env.example` (`GEMINI_*`) |

## Directory layout (as documented in README, matches actual structure)

```
app/            Route segments (App Router) — (auth), (app), api
components/     UI primitives (ui/) & shared cross-feature components (shared/, layout/)
features/       Per-domain modules: actions (Server Actions), schemas (Zod), components, hooks
repositories/   Pure Supabase data access (query builders), no business logic — 51 files
services/       Cross-repository business logic (e.g. signed URL storage) — 1 file (storage.service.ts)
lib/            Supabase client factories, RBAC session resolver, AI, security, utils
hooks/          Reusable client hooks (geolocation, camera, debounce, ...)
constants/      RBAC, status enums, navigation, app config
types/          Database types (schema mirror) & domain types
supabase/       Migrations SQL (246 files), seed SQL, config, one Edge Function
scripts/        Operational scripts (seed, backup, workers)
```

`repositories/` (51 files) is genuinely broad, covering CRM, construction
management (`cm-*`), KontenAI, HR, Loonars Beauty, Kos Occupancy, Siteplan,
FRIDAY/Holding, and more — confirming these are real, data-backed modules,
not stubs.

`services/` contains only `storage.service.ts` — most "service"-layer logic
actually lives inside `features/*/actions/*.ts` (Server Actions) rather than
a separate services layer, despite the README describing `services/` as the
home for cross-repository business logic. This is a discrepancy between the
documented and actual code organization — most business logic is
Server-Action-colocated, not centralized in `services/`.

## Data flow

Documented in README and consistent with the folder layout:

`page.tsx` (Server Component) → `repositories/*` (read) or
`features/*/actions` (Server Action mutation) → Supabase (RLS-enforced).
Client components call Server Actions directly or go through TanStack Query
for interactive data (filtering, pagination, realtime subscriptions).

## Authentication

- Supabase Auth (`@supabase/ssr`), cookie-based sessions.
- `lib/supabase/client.ts` (browser client), `lib/supabase/server.ts`
  (server client, per-request), `lib/supabase/admin.ts` (service-role client,
  server-only — README states this is the only place the service role key
  is used), `lib/supabase/middleware.ts` (`updateSession`, called from the
  root `middleware.ts`), `lib/supabase/bearer.ts` (bearer-token variant,
  likely for API/cron routes — exact usage sites `UNKNOWN — NEEDS
  CONFIRMATION` beyond the filename).
- `middleware.ts` runs `updateSession` on nearly all routes (matcher
  excludes static assets, `_vercel`, `sw.js`, and a few well-known files).
- Self-registration flow (`/register`) creates a Supabase Auth user
  immediately but with `role = pending`, `is_active = false`; cannot log in
  until approved via `approve_employee_registration()` /
  `reject_employee_registration()` RPCs (migration `0018_self_registration.sql`).

## Authorization (RBAC)

- Data-driven: `roles`, `permissions`, `role_permissions` tables
  (`supabase/migrations/0002_core_tables.sql`, refined in `0016`, `0019`,
  and many feature-specific migrations that add new permission keys).
- Server-side resolution: `lib/rbac/session.ts` — `getCurrentSession()`
  (memoized with React `cache()`) reads the authenticated user, looks up
  their employee row via the `v_employee_directory` view, and resolves
  role + permission set. This is described in code comments as "the single
  source of truth server-side code should use."
- Every Server Action is expected to call `requirePermission()` before
  acting (per README; spot-checked in `lib/rbac/session.ts` and consistent
  with the permission-key constants in `constants/rbac`).
- Postgres **Row Level Security** is a second, independent enforcement
  layer (`supabase/migrations/0009_rls_policies.sql` plus per-feature RLS
  migrations, e.g. `0023_crm_rls.sql`, `0036_markom_kpi_rls.sql`).
- Special protections: a trigger blocks non-Super-Admins from altering
  other Super Admin accounts (`0016_rbac_refinement.sql`), and a separate
  "Root Owner" trigger protects one specifically flagged account
  (`0011_root_owner_protection.sql`).

## API / Route surface

`app/api/` contains route handlers grouped by concern (evidenced by
directory listing):

- `api/health` — public liveness/readiness probe, does a real DB round trip
  via RPC `health_check()` (`app/api/health/route.ts`).
- `api/ai/*` — `process-job` (AI job queue worker endpoint), `voice-assistant`,
  `voice-bridge`, `whatsapp-relay`, `branch-balance-advisory`,
  `construction-progress-assessment`, `lead-manual-handoff`,
  `lead-pending-question-timeout`.
- `api/automation/construction-tukang-tip` — one HTTP-dispatch automation
  endpoint.
- `api/crm/dispatch-promo-sends` — promo broadcast dispatch.
- `api/markom/check-ads-balance`, `api/markom/refresh-ad-campaign-spend` —
  Meta Ads balance/spend sync.
- `api/social/capture-snapshots`, `api/social/publish-content` — social
  publishing pipeline endpoints.
- `api/integrations/whatsapp` — WhatsApp webhook/integration route(s).
- `api/wa/send`, `api/admin/send-wa-message` — outbound WhatsApp send
  endpoints (the latter added recently, per git log, and explicitly
  excluded from session-auth middleware — see `GIT_WORKFLOW.md`/commit
  `e24db86`).
- `api/push/send` — Web Push notification sender.
- `api/debug/*` (`instagram-config`, `meta-ads-config`, `whatsapp-config`,
  `zernio-connect`) — diagnostic endpoints, gated behind Super Admin auth
  per README and commit `310c522`.
- `api/sso/loonars-sales` — SSO bridge to an external "Loonars Sales"
  surface. Exact protocol `UNKNOWN — NEEDS CONFIRMATION`.
- `api/villa/deploy`, `api/villa/secrets` — endpoints related to deploying
  or managing secrets for a separate "villa" system. Exact mechanism
  `UNKNOWN — NEEDS CONFIRMATION`.

Ten routes are documented as protected specifically for cron/trigger callers
via a shared-secret guard (`requireCronAuth()`, `lib/security/cron-auth.ts`,
secret `CRON_SECRET`) — README states this guard **fails open** until the
secret is configured, so activation needs no downtime window.

## Repositories / Services / Workers

- **Repositories** (`repositories/*.repository.ts`, 51 files) — pure
  Supabase query builders, one per domain (attendance, employee, CRM,
  construction-management `cm-*`, KontenAI, HR, FRIDAY, Holding, Loonars
  Beauty, Kos Occupancy, Siteplan, Knowledge Base, etc). No business logic
  per README's stated convention.
- **Services** (`services/storage.service.ts`) — signed URL / storage
  business logic, per README.
- **Workers** — three standalone long-running Node processes intended to
  run outside the Next.js request lifecycle, launched with
  `NODE_OPTIONS=--conditions=react-server tsx`:
  - `scripts/render-worker.ts` — video/ffmpeg rendering (uses
    `@ffmpeg-installer/ffmpeg`), polling-based (`RENDER_WORKER_POLL_INTERVAL_MS`).
  - `scripts/veo-worker.ts` — Google Veo video generation polling
    (`VEO_WORKER_POLL_INTERVAL_MS`, `lib/ai/veo/client.ts`).
  - `scripts/worker-main.ts` — general worker entrypoint (exact scope of
    what it dispatches is `UNKNOWN — NEEDS CONFIRMATION` without reading
    its full source).
  - Deployed via `Dockerfile.render-worker` + `railway.json`
    (`DOCKERFILE` builder) — i.e. **Railway**, not Vercel, hosts these
    workers. This is a second, separate hosting target from the main app.

## AI integration

See `AI_AND_AGENTS.md` for the full inventory. Summary: Gemini
(`@google/genai`) is the sole LLM provider (`lib/ai/provider/gemini-*.ts`,
`AI_PROVIDER` env var suggests a provider-abstraction exists —
`lib/ai/provider/registry.ts` and `types.ts` support a pluggable-provider
pattern, but only a Gemini implementation was found). AI calls are queued
through `ai_job_queue` (Postgres table) with retry/backoff/circuit-breaker
logic (`lib/ai/resilience/circuit-breaker.ts`, `lib/ai/queue/ai-job-queue.ts`)
rather than called synchronously from most request paths — a resilience
pattern documented in `docs/AUTOMATION.md`.

## Automation / background execution

`docs/AUTOMATION.md` (existing project doc, verified against migrations)
describes **four execution paths**: pure SQL (`pg_cron` → plpgsql), the AI
job queue (`ai_job_queue` → `/api/ai/process-job`), HTTP dispatch
(`pg_cron`/trigger → `automation_post()` → a Next.js route, logged in
`automation_dispatch_log`), and standalone Railway workers (24/7 polling).
As of that doc, **57 `pg_cron` jobs** are inventoried (54 original + 2 from
an audit + 2 FRIDAY-related, minus 1 retired KontenAI job); several are
explicitly marked inactive in that same document. This document should be
treated as current-but-verify — it is dated by its own git history (see
`CHANGELOG.md`) and may drift from the live database over time.

## Integrations (see INTEGRATIONS.md for full detail)

Supabase, Google Gemini, Google Veo, Google Drive, Meta (Ads/Instagram/
WhatsApp Business), TikTok Ads, WhatsApp (via Meta Cloud API and/or
Whacenter device bridge), Web Push, Vercel, Railway.

## Multi-business / Holding architecture (FRIDAY)

Genuinely present in code, not aspirational:
- `lib/ai/friday/holding.ts`, `lib/ai/friday/holding-prompt.ts`,
  `repositories/holding.repository.ts`,
  `supabase/migrations/0182_friday_holding_architecture.sql`,
  `app/(app)/friday/holding/`.
- Model: a `holding_businesses` table (each business is one row); each
  business exposes a snapshot with a fixed-vocabulary `metrics[]` channel
  (for cross-business arithmetic comparison) and a free-form `narrative`
  channel (for business-specific detail) — per README and migration intent.
- A `Connector` abstraction (`lib/ai/connectors/manager.ts`,
  `lib/ai/connectors/types.ts`) has exactly two connector kinds evidenced:
  `internal_mkh` (reads the MK Connect database directly) and `http`
  (reads another business's dashboard JSON over HTTP) — a
  `whatsapp-connector.ts` and `whatsapp-http-client.ts` also live in this
  folder, suggesting connectors are used more broadly than just Holding
  (exact non-Holding usage `UNKNOWN — NEEDS CONFIRMATION` without deeper
  read).
- FRIDAY's action system: proposed actions must reference a key from a
  fixed catalog (`lib/ai/friday/action-catalog.ts`), enforced by a DB check
  constraint added in migration `0179_friday_executive_intelligence.sql`,
  and require a human with `friday.action_decide` permission before
  executing.
