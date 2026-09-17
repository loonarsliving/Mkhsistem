# FEATURES

Status tags: **DONE** (repositories/actions/UI/migrations all present, and
either covered by tests or described as shipped in README/docs with matching
code), **PARTIAL** (some layers exist but evidence of completeness is
missing, e.g. no tests, or docs note it's temporary/in-progress),
**IN_PROGRESS** (recent commits actively touching it), **PLANNED** (referenced
but no/minimal implementation), **UNKNOWN** (insufficient evidence either
way without deeper code reading than this audit performed).

Never marked DONE without direct source evidence (route + repository/action
+ at least a migration, or explicit test coverage).

## Core "V1" modules (per README, all have matching code)

| Feature | Status | Evidence |
|---|---|---|
| Authentication (login/logout/forgot/reset password, middleware-protected routes) | DONE | `app/(auth)/login`, `forgot-password`, `reset-password`; `lib/supabase/middleware.ts`; `features/auth/` (5 files); e2e test `tests/e2e/auth.spec.ts` |
| Self-registration + tiered approval | DONE | `app/(auth)/register`, `app/(app)/registrations`, `features/registration/` (5 files), RPCs `approve_employee_registration()`/`reject_employee_registration()` in `0018_self_registration.sql`; integration test `tests/integration/registration.integration.test.ts`; e2e `tests/e2e/registration.spec.ts` |
| Dashboard | DONE | `app/(app)/dashboard`, `features/dashboard/` (19 files) |
| Attendance (GPS + selfie check-in/out, leave requests, CSV export) | DONE | `app/(app)/attendance`, `attendance/history`, `attendance/settings`; `features/attendance/` (14 files); `repositories/attendance.repository.ts`; RPCs in `0007_rpc_functions.sql`; integration test `tests/integration/attendance.integration.test.ts`; e2e `tests/e2e/attendance.spec.ts`; known historical bug fixed per commit `0074_fix_attendance_utc_date_bug.sql` |
| Memo (CRUD, pin, priority, required-read, attachments, read receipts, targeting) | DONE | `app/(app)/memo`, `features/memo/` (5 files); migration `0004_communication_tables.sql`; integration test `tests/integration/memo.integration.test.ts` |
| Announcements | DONE | `app/(app)/announcements`, `features/announcements/` (7 files); migration `0004_communication_tables.sql` |
| Employee / Branch / Division / Position CRUD | DONE | `app/(app)/employees`, `branches`, `divisions`, `positions`; matching `features/*` dirs and `repositories/*.repository.ts` |
| Notifications (realtime) | DONE | `app/(app)/notifications`, `features/notifications/` (6 files); Supabase Realtime per README; web push also present (`0052_web_push_notifications.sql`, `lib/push/`, `app/api/push/send`) |
| Profile | DONE | `app/(app)/profile`, `features/profile/` (6 files) |
| Search (global) | DONE | `app/(app)/search`, `features/search/` (2 files) |
| Settings (company profile, work hours, office location/radius) | DONE | `app/(app)/settings`, `features/settings/` (3 files) |

## FRIDAY / Holding (Executive Intelligence Layer)

| Feature | Status | Evidence |
|---|---|---|
| FRIDAY daily/on-demand executive briefing | DONE | `app/(app)/friday`, `features/friday/` (5 files), `lib/ai/friday/{analyst,briefing,prompt,signals}.ts`, migration `0179_friday_executive_intelligence.sql`; README states it runs daily at 06:30 WITA and on-demand |
| FRIDAY action proposal/approval system | DONE | `lib/ai/friday/action-catalog.ts` + DB check constraint in `0179`; `friday.action_decide` permission gating |
| Holding (multi-business rollup) | DONE | `app/(app)/friday/holding`, `lib/ai/friday/holding.ts`, `repositories/holding.repository.ts`, migration `0182_friday_holding_architecture.sql` |
| Connector framework (`internal_mkh`, `http`) | DONE | `lib/ai/connectors/manager.ts`, `types.ts` |

## CRM

| Feature | Status | Evidence |
|---|---|---|
| CRM core (leads/customers/projects/sales) | DONE | `app/(app)/crm/*` (customers, projects, sales, targets, warnings, analytics, dashboard, branches, finance, knowledge-base); `features/crm/` (38 files, largest module besides KontenAI); `repositories/crm.repository.ts`; migrations `0022_crm_schema.sql` through many `00xx`/`01xx` CRM migrations |
| Ad lead routing / nurture (AI) | DONE | `lib/ai/domains/ad-lead-routing.ts`, `lib/ai/domains/lead-nurture.ts`; migrations `0092_ad_lead_routing.sql`, `0228_ad_lead_nurture_ai.sql`, `0229_..._timeout_cron.sql`, `0230_..._image_answers.sql`, `0231_..._handoff_mode.sql`, `0232_..._project_selection.sql` — actively iterated per recent commit history |
| Promo broadcast (WhatsApp) | DONE | `app/(app)/markom/promo-broadcast`, `repositories/crm-promo.repository.ts`, `app/api/crm/dispatch-promo-sends`, migration `0089_crm_promo_broadcasts.sql` |

## Markom (Marketing Communications / Ads)

| Feature | Status | Evidence |
|---|---|---|
| Ads management (Meta) | DONE | `app/(app)/markom/ads`, `features/markom/` (23 files), `lib/meta/`, migrations `0079_meta_ad_campaigns.sql` onward, `app/api/markom/check-ads-balance`, `refresh-ad-campaign-spend` |
| Content planner / calendar / studio | DONE | `app/(app)/markom/content-planner`, `content-studio`, `content-audit`; matching migrations `0085_content_planner.sql`, `0142_markom_content_studio.sql` |
| KPI/ranking | DONE | `app/(app)/markom/ranking`, migrations `0035_markom_kpi_schema.sql`, `0036-0038` |
| Monthly content performance report (AI, property-only) | DONE | `MonthlyReportCard` in `app/(app)/markom/content-planner`, `social_monthly_content_reports`, migration `0251_markom_monthly_report_and_hashtag_bank.sql` |
| Hashtag bank (AI, per content_focus x platform) | DONE | `HashtagBank` in `app/(app)/markom/content-planner`, `markom_hashtag_bank`, migration `0251_markom_monthly_report_and_hashtag_bank.sql` |

## KontenAI (AI content production)

| Feature | Status | Evidence |
|---|---|---|
| Content pipeline (director, storyboard, render, publish) | DONE | `app/(app)/kontenai/*` (ai-director, ai-optimization, ai-report, analytics, asset-library, asset-selector, content-calendar, gemini-vision, learning-engine, production-pipeline, publishing-engine, render-engine, storyboard-engine); `features/kontenai/` (105 files — largest module in the codebase); `repositories/kontenai-*.repository.ts` (9 files); `lib/ai/domains/kontenai-*.ts` (6 files); `lib/kontenai/` |
| Video rendering worker | DONE | `scripts/render-worker.ts`, `Dockerfile.render-worker`, `railway.json`, `lib/video/` |
| Veo video generation | DONE | `scripts/veo-worker.ts`, `lib/ai/veo/client.ts`, migration `0172_kontenai_veo_bridge.sql` |
| Gemini Vision asset analysis | PARTIAL | `app/(app)/kontenai/gemini-vision`, migration `0159_kontenai_asset_gemini_vision.sql`, but a later migration `0186_revert_kontenai_vision_background_queue.sql` reverts an earlier queue design — indicates this sub-feature was iterated/rolled back, not a stable finished state |

## Construction Finance / Construction Management

| Feature | Status | Evidence |
|---|---|---|
| Construction finance tracking | DONE | `app/(app)/construction-finance`, `features/construction-finance/` (20 files), `repositories/construction-finance.repository.ts` |
| Construction management (BOQ, cost control, labor, material, procurement, WBS) | DONE | `repositories/cm-boq.repository.ts`, `cm-cost-control.repository.ts`, `cm-labor.repository.ts`, `cm-material.repository.ts`, `cm-procurement.repository.ts`, `cm-wbs.repository.ts`; migrations `0207`–`0227` (material stock, BOQ foundation, WBS, procurement, labor contracts, cost control, progress tracking) |
| Contractor expense reporting via WhatsApp | DONE (very recently added) | Most recent commits in git log: `0d2b705`, `5925244`, `2b7fedd`, migrations `0237`–`0239` (`contractor_expense_report*`) — this is the newest work in the repo as of the audit date |

## HR

| Feature | Status | Evidence |
|---|---|---|
| HR Discipline | DONE | `app/(app)/hr/discipline`, `features/hr-discipline/` (3 files), migration `0178_hr_disciplinary_actions.sql` |
| HR Finance / payroll sync | DONE | `app/(app)/hr/finance-sync`, `features/hr-finance/` (7 files), migration `0056_hr_payroll_expense_sync.sql` |
| Salary input | DONE | `app/(app)/hr/salary`, `features/salary-input/` (5 files), migrations `0189_kepala_cabang_salary_input.sql`, `0190_salary_transfer_summary.sql`, `0191_auto_send_salary_summary...sql` |

## Other domain modules

| Feature | Status | Evidence |
|---|---|---|
| Loonars Beauty | DONE | `app/(app)/loonars-beauty/*`, `features/loonars-beauty/` (11 files), `repositories/loonars-beauty.repository.ts`, `loonars-closing.repository.ts`; migrations `0112_loonars_beauty_module.sql` and later |
| Kos Occupancy | DONE | `app/(app)/kos-occupancy`, `repositories/kos-occupancy.repository.ts`, migrations `0145_kos_occupancy_module.sql`, `0146_kos_fdw_integration.sql` (FDW = foreign data wrapper — cross-database integration, see `INTEGRATIONS.md`) |
| Siteplan | DONE | `app/(app)/siteplan`, `siteplan/admin`, `siteplan/kwitansi/[purchaseId]`, `features/siteplan/` (14 files), `repositories/loonars-siteplan.repository.ts`, migrations `0202_siteplan_native_feature.sql` onward (`0261` = Loonars 2 Jogja project + printable Kwitansi Tanda Jadi; `0262` = every project branch-exclusive via `loonars_projects.branch_id`, RLS + RPC enforced; `0263` = Loonars 2 unit prices set: BANYU=1BR/Rp420jt, AVARA=2 Kamar/Rp520jt; `0264` = those prices genuinely uneditable — `loonars_units.price_locked` + a trigger with no `siteplan.manage` bypass; `0265` = public unauthenticated live-status sharing at `/share/siteplan/[kode]`, `loonars_projects.publicly_shareable` + a SECURITY DEFINER RPC granted to `anon`, block/status only, no price or buyer data) |
| Lead Knowledge / Knowledge Bank | DONE | `features/lead-knowledge/` (4 files), `repositories/knowledge-base.repository.ts`, migrations `0115_ai_knowledge_bank.sql`, `0116`, `0117`, `0126`, `0127` |
| Assistant (voice) | PARTIAL | `app/(app)/asisten`, `features/assistant/` (3 files), `app/api/ai/voice-assistant`, `app/api/ai/voice-bridge`, `lib/ai/voice-bridge/`; small file count relative to breadth of `app/api` surface suggests this may be thinner than other modules — depth not fully verified |
| Messaging | DONE | `app/(app)/messaging`, `features/messaging/` (3 files), migration `0066_messaging_send_permission.sql` |
| Monitoring (error tracking, Web Vitals) | DONE | `app/(app)/monitoring`, `features/monitoring/` (10 files), `instrumentation.ts`, `components/shared/web-vitals-reporter.tsx`, migration `0014_monitoring.sql` |
| AI Module (admin/settings for AI) | DONE | `app/(app)/ai`, `features/ai-module/` (3 files), migration `0067_ai_module_permission.sql`, `0068_ai_system_prompts.sql` |

## Loonars AI Occupancy Ads (added 2026-09-17, branch `claude/loonars-ai-occupancy-ads-e1m2on`)

| Feature | Status | Evidence |
|---|---|---|
| Occupancy provider + gap/classification engine | DONE (unit tested) | `lib/occupancy/villa-provider.ts` (GET-only villa-api client, `/public/availability` primary + `/bridge/occupancy` secondary/caveated), `lib/occupancy/gap-engine.ts` (pure TS classification LOW/HEALTHY/HIGH/FULL + budget recommendation), `lib/occupancy/campaign-rules.ts` (fixed market/persona/campaign-type candidate sets, destination-URL + budget-ceiling validators); tests `tests/unit/lib/occupancy-gap-engine.test.ts`, `tests/unit/lib/occupancy-campaign-rules.test.ts` |
| AI campaign brief engine | DONE (unit tested) | `lib/ai/domains/occupancy-ads.ts` -- hand-rolled JSON parse convention (mirrors `markom.ts`), never trusts the AI's numbers past `resolveLaunchBudgetIdr`'s re-clamp; `askOccupancyCopilot` for the "Ask Occupancy AI" panel; test `tests/unit/lib/occupancy-ads-ai-parser.test.ts` |
| Server Actions + repository | DONE (not integration-tested — no live DB) | `features/occupancy-ads/actions/occupancy-ads.actions.ts`, `repositories/occupancy-ads.repository.ts`; two-step draft-research (`requestOccupancyAdsBriefAction`) -> human-approve -> `launchOccupancyCampaignAction` (real Meta spend) flow, mirroring `features/markom/actions/ads.actions.ts` |
| New Meta link-click (traffic) primitives | DONE, additive only | `lib/meta/ads.ts`: `createTrafficAdCampaign`/`createTrafficAdSet`/`createLinkAdCreative`/`launchLinkClickCampaign` -- new functions for `OUTCOME_TRAFFIC`/`LINK_CLICKS` destination-URL ads to `https://loonars.id`; the existing Click-to-WhatsApp functions are untouched |
| Dashboard UI | PARTIAL | `app/(app)/occupancy-ads/page.tsx`, `features/occupancy-ads/components/occupancy-dashboard.tsx` -- occupancy calendar, gap summary, campaign board, target config, and the copilot panel are all wired to real Server Actions; the Creative Asset Library has repository/action support (`recordCreativeAssetAction` etc.) but no dedicated upload UI page yet (asset URLs are entered manually when launching) -- see open items below |
| Database schema | **NOT YET APPLIED to production** | `supabase/migrations/0268_loonars_occupancy_ads_rbac.sql`, `0269_loonars_occupancy_ads_schema.sql` -- 7 new `loonars_*` tables, 2 new permissions (`occupancy_ads.view/.manage`, Super Admin only per the `ad_campaign.*` precedent), new `occupancy-ads-assets` storage bucket, widened `ai_integration_logs.connector` (+`villa`) and `mkc_notifications` category check. Committed for review, deliberately not run against `svcmybsziaelwwdrnzcv` -- see "Open items" below for the exact approval gate. |

**Villa-api dependency (read-only)**: this module reads `villa-api`
(`https://svcmybsziaelwwdrnzcv.supabase.co/functions/v1/villa-api`), a
Supabase Edge Function that lives in the separate villa repo, not this one.
Only `GET /public/availability` (no auth) and optionally `GET
/bridge/occupancy` (header `x-internal-secret`, env `VILLA_BRIDGE_SECRET`)
are ever called -- no POST/PUT/PATCH/DELETE anywhere in this module. If
villa-api is unreachable or errors, every `OccupancyProvider` method returns
`{ ok: false, reason }` and every caller (Server Actions, AI brief
generation) stops and surfaces that reason rather than falling back to
estimated/fabricated numbers. The `/bridge/occupancy` snapshot carries a
known data-quality caveat inherited from the villa repo's own project
memory (its `okupansi_persen` divides by all 13 units rather than the 8
actually offered for sale) -- the UI/types label it explicitly rather than
treating it as equivalent in trust to the `/public/availability`-derived
calendar.

**Open items / two pending approval gates before this is live:**

1. **DB migration apply** -- `0268`/`0269` must be reviewed and applied by a
   human via Supabase MCP or the CLI against `svcmybsziaelwwdrnzcv` (same
   process as every other migration in this repo's history, e.g. `0261`).
   Until then, `/occupancy-ads` will 500 on every real data call (the RBAC
   permissions don't exist yet either, so in practice nobody can reach the
   page). After applying, run `npm run supabase:types` to regenerate
   `types/database.types.ts` -- `repositories/occupancy-ads.repository.ts`
   and `lib/ai/integration-log.ts` both use a small, clearly-commented
   `db()`/`as never` type-cast escape hatch for the new tables/connector
   value specifically because the generated types don't know about them
   yet; both casts can be removed once types regenerate (no logic change
   needed).
2. **Live Meta launch test** -- `launchLinkClickCampaign` (the new
   link-click/traffic orchestration in `lib/meta/ads.ts`) has never been
   called against a real Meta ad account (forbidden by this task's own
   constraints). Verify it end-to-end with one real manual launch (small
   budget, a human reviewing the draft first, same discipline
   `uploadAdVideoFromUrl`'s own doc comment asks for) before relying on it
   for unattended use.

**Judgment calls worth flagging to the owner before merge:**
- `occupancy_ads.view`/`.manage` were scoped Super Admin-only from the
  start, mirroring `ad_campaign.*`'s 0088 precedent (this module can also
  spend real Meta budget) -- widen deliberately later if Markom/Direktur
  roles should have access.
- The system prompt/JSON schema for `lib/ai/domains/occupancy-ads.ts` is a
  local string constant, NOT registered in the `PROMPT_KEYS`/`ai_system_prompts`
  DB-editable registry `lib/ai/domains/prompts.ts` uses for `markom`/`hr`/etc.
  -- kept local to avoid an extra migration/admin-UI surface for a first
  version; can be migrated into that registry later if the prompt needs
  non-developer editing.
- Automation mode is ASSISTED only (spec §41) -- there is no code path that
  calls `launchLinkClickCampaign` without `launchOccupancyCampaignAction`'s
  explicit human confirmation; a "fully automated" mode is a deliberate
  future step, not built here.

## Roadmap-only / not yet implemented

The README's "Roadmap ERP" section states the schema/folder structure is
*designed to* support future modules (payroll, inventory, procurement, etc.)
without major refactor — it does **not** claim these are built. No dedicated
payroll/inventory/procurement module (as distinct from the construction
"procurement" repository, which is construction-specific) was found.

| Feature | Status | Evidence |
|---|---|---|
| Generic/company-wide payroll module | PLANNED | Only described as an architectural affordance in README's roadmap section; no matching `features/payroll` or migration found |
| Generic inventory module | PLANNED | Same as above |
| iOS mobile app | UNKNOWN — NEEDS CONFIRMATION | `android/` exists; no `ios/` directory found; `capacitor.config.ts` has no iOS-specific config; README makes no iOS claim |
