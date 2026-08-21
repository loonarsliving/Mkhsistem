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
| Siteplan | DONE | `app/(app)/siteplan`, `siteplan/admin`, `features/siteplan/` (13 files), `repositories/loonars-siteplan.repository.ts`, migrations `0202_siteplan_native_feature.sql` onward |
| Lead Knowledge / Knowledge Bank | DONE | `features/lead-knowledge/` (4 files), `repositories/knowledge-base.repository.ts`, migrations `0115_ai_knowledge_bank.sql`, `0116`, `0117`, `0126`, `0127` |
| Assistant (voice) | PARTIAL | `app/(app)/asisten`, `features/assistant/` (3 files), `app/api/ai/voice-assistant`, `app/api/ai/voice-bridge`, `lib/ai/voice-bridge/`; small file count relative to breadth of `app/api` surface suggests this may be thinner than other modules — depth not fully verified |
| Messaging | DONE | `app/(app)/messaging`, `features/messaging/` (3 files), migration `0066_messaging_send_permission.sql` |
| Monitoring (error tracking, Web Vitals) | DONE | `app/(app)/monitoring`, `features/monitoring/` (10 files), `instrumentation.ts`, `components/shared/web-vitals-reporter.tsx`, migration `0014_monitoring.sql` |
| AI Module (admin/settings for AI) | DONE | `app/(app)/ai`, `features/ai-module/` (3 files), migration `0067_ai_module_permission.sql`, `0068_ai_system_prompts.sql` |

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
