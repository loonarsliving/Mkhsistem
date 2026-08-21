# DATABASE

**No credentials, keys, or secrets are recorded anywhere in this file.**

## Supabase project

- Production project ref: `svcmybsziaelwwdrnzcv` (appears in
  `README.md` and as the public `NEXT_PUBLIC_SUPABASE_URL` value baked into
  `.github/workflows/ci.yml` / `android-build.yml` — this is the anon-key
  URL, intentionally public/shippable-to-browsers, not a secret).
- **Explicitly documented as a shared Supabase project** — hosts MK Connect
  alongside a separate "villa-rental" application from the same
  organization (`README.md`). This is why the `notifications` table was
  renamed to `mkc_notifications`; other MK Connect tables were verified
  (per README) not to collide and keep their natural names.
- Plan: **Free tier**, per `docs/BACKUP.md`, evidenced there by hitting the
  org's 2-active-free-project limit during setup. No automatic Supabase
  backups or PITR on this plan — see `DEPLOYMENT.md` and `docs/BACKUP.md`.
- Local dev config: `supabase/config.toml` (`project_id = "mk-connect"`,
  local API port 54321, DB port 54322, Studio port 54323, storage file-size
  limit 10MiB).

## Migrations

- Location: `supabase/migrations/`, **246 numbered SQL files**
  (`0001_extensions.sql` through `0239_contractor_expense_report_items.sql`,
  applied in numeric order; a few numbers are duplicated/reused in the
  filenames seen during audit — e.g. two files named `0202_*` and two
  `0187_*`/`0112_*` variants exist for different modules — this should be
  spot-checked against the live migration history table before assuming
  strict 1:1 numbering; flagged here as `UNKNOWN — NEEDS CONFIRMATION`
  whether any number collision caused a real ordering issue).
- Rough counts extracted directly from migration SQL text (not the live DB,
  which is the actual source of truth — see caveat below):
  - **~145** `create table` statements
  - **~14** `create view` statements
  - **~358** `create function` statements (includes RPCs, triggers'
    underlying functions, and helpers — not 358 distinct callable RPCs)
  - **~60** `create trigger` statements
- Applying migrations: per README, `supabase db push` (Supabase CLI) or
  manual execution in the Supabase Dashboard SQL Editor, **in file-name
  order**.
- Types are generated from the **live** project via
  `npm run supabase:types` → `supabase gen types typescript --project-id
  "$SUPABASE_PROJECT_ID" --schema public > types/database.types.ts` — i.e.
  the checked-in `types/database.types.ts` should always reflect the live
  schema, not just the migrations directory. If they've diverged,
  migrations are still the intended source of truth but the live DB is the
  actual runtime truth.

## Core schema areas (by table-name prefix / migration grouping)

Evidenced by `create table` statements across migrations and by
`repositories/*.repository.ts` names:

| Area | Representative tables | First-introduced migration |
|---|---|---|
| RBAC / org structure | `roles`, `permissions`, `role_permissions`, `branches`, `divisions`, `positions`, `employees` | `0002_core_tables.sql` |
| Attendance | `work_schedules`, `attendance`, `leave_requests` | `0003_attendance_tables.sql` |
| Communication | `memos`, `memo_targets`, `memo_attachments`, `memo_reads`, `announcements`, `announcement_categories`, `announcement_targets`, `announcement_attachments` | `0004_communication_tables.sql` |
| Platform | `mkc_notifications` (renamed from `notifications` — see `DATABASE.md` shared-project note), `audit_logs`, `company_settings` | `0005_notifications_audit_settings.sql` |
| CRM | `crm_projects`, `crm_products`, `crm_promo_sends`, `crm_promo_templates`, `crm_sp1_warnings`, `crm_target_headers`/`crm_target_details`, `lead_chat_history`, `freelance_lead_deliveries`/`recipients` | `0022_crm_schema.sql` onward |
| Markom / Ads | Meta ad campaign tables, KPI schema (`0035_markom_kpi_schema.sql`) | `0079` onward |
| KontenAI | `kontenai_assets`, `kontenai_storyboards`, `kontenai_render_jobs`, `kontenai_video_generation_jobs`, `kontenai_publish_schedules`, `kontenai_content_performance`, `kontenai_creative_briefs`, `kontenai_automation_settings`, `kontenai_optimization_recommendations`, `kontenai_ai_reports` | `0157` onward |
| Construction | `cm_boq_templates`/`cm_project_boq`, `cm_project_wbs`/`cm_wbs_*`, `cm_labor_contracts`/`cm_labor_payments`/`cm_labor_advances`/`cm_labor_deductions`, `cm_materials`/`cm_material_stock`/`cm_stock_movements`, `cm_purchase_requests`, `cm_contractors`, `cm_units`, `construction_projects`, `construction_expenses`, `construction_fund_transfers`, `construction_progress_assessments`/`_photos`, `construction_blocks`, `construction_targets`, `contractor_expense_reports`, `contractor_wa_senders` | `0193` onward |
| Finance | `finance_branch_balances`, `finance_pending_transfers`, `finance_cashflow_action_plan_log`, `hr_expenses`, `employee_salary_submissions` | `0055` onward |
| HR | `hr_disciplinary_actions` | `0178` |
| AI platform | `ai_job_queue`, `ai_conversations`, `ai_system_prompts`, `ai_circuit_breaker_state`, `ai_request_telemetry`, `ai_integration_logs`, `ai_knowledge_bank`, `ai_cashflow_intelligence_bank`, `ai_investor_intelligence_bank`, `ai_occupancy_intelligence_bank` | `0063_ai_operating_system.sql` onward |
| FRIDAY / Holding | `friday_briefings`, `friday_actions`, `holding_businesses` | `0179`, `0182` |
| Approvals | `approval_requests` | `0201_approval_requests.sql` |
| Automation platform | `automation_config`, `automation_dispatch_log` | `0176_automation_hardening.sql` |
| Loonars Beauty | `loonars_orders`, `loonars_closings`, `loonars_content_items`/`_metrics`, `loonars_fee_wa_requests`, `loonars_integration_log`, `loonars_beauty_weekly_content_audits`, `loonars_beauty_competitor_comparisons` | `0112` onward |
| Siteplan | `loonars_siteplan_layouts` (and related — not fully enumerated) | `0202` onward |
| Knowledge base | `knowledge_base` | present alongside `ai_knowledge_bank` — two related but distinct knowledge stores; relationship between them `UNKNOWN — NEEDS CONFIRMATION` without deeper read |
| Assistant | `assistant_followups` | — |
| Sales KPI | `kpi_tasks`, `crm_sales_coaching_log`, `crm_sales_teaching_log` | `0064` onward |
| Login security | `mkc_login_attempts` (referenced in README, not seen in the `create table` grep sample above — confirm in `0015_login_rate_limiting.sql`) | `0015` |
| Monitoring | `mkc_error_logs`, `mkc_performance_metrics` (referenced in README; confirm in `0014_monitoring.sql`) | `0014` |
| Push | `device_push_tokens` | `0021_device_push_tokens.sql` |

This table list is derived from `create table` grep matches and is **not
guaranteed exhaustive** — some tables may be created via `create table if
not exists` phrasing not captured by the exact grep pattern used, or altered
significantly by later migrations. Treat the migrations directory itself,
or a live `list_tables` against the production project, as the authoritative
source before relying on this list for schema-changing work.

## Conventions (per README, verified against migration file headers)

- **UUID primary keys** on all tables.
- Audit columns: `created_at`, `updated_at`, `created_by`, `updated_by`.
- **Soft delete** via `deleted_at` (not hard deletes) — confirmed pattern in
  `lib/rbac/session.ts` (`is("deleted_at", null)` filter) and repeated across
  repository files.
- Foreign keys and relevant indexes on all tables (per README; not
  individually re-verified per table in this audit).
- **Row Level Security active on every table**, with branch/role-aware
  policies — base policies in `0009_rls_policies.sql`, extended per-feature
  in dozens of later migrations (e.g. `0023_crm_rls.sql`,
  `0036_markom_kpi_rls.sql`, `0088_ads_specialist_super_admin_only.sql`,
  `0090_promo_broadcast_super_admin_only.sql`,
  `0148_scope_markom_to_jogja_only.sql`,
  `0188_restrict_kepala_cabang_closing_fee_visibility.sql`).

## RPC functions (transactional, SECURITY DEFINER where noted)

Notable named RPCs found in README/migration references:

- `check_in()` / `check_out()`-family attendance RPCs, leave approval RPCs,
  memo/announcement creation RPCs with notification fan-out —
  `0007_rpc_functions.sql`.
- `approve_employee_registration()` / `reject_employee_registration()` —
  `0018_self_registration.sql` — row-locking (`for update`) with a re-check
  of status before writing, specifically to prevent two concurrent
  approvals racing.
- `health_check()` — granted to `anon`, used by `GET /api/health`, returns
  no application data.
- `check_login_lockout()` / `record_login_attempt()` — SECURITY DEFINER,
  `0015_login_rate_limiting.sql`, 5-attempts/15-minute lockout, pruned daily
  by `pg_cron`.
- `check_automation_health()` — hourly, alerts Super Admin on failed
  dispatch / dead-lettered AI jobs / stuck `ai_job_queue`.
- `automation_post()` — the HTTP-dispatch primitive used by `pg_cron`
  jobs/triggers to call Next.js routes.

Full RPC inventory is **not enumerated exhaustively** here (358 `create
function` matches include triggers' backing functions and internal
helpers, not just callable RPCs) — use `supabase/migrations/*.sql` grep or
a live `list_tables`/schema introspection for a complete, current list
before depending on any specific RPC signature.

## Views

**14** `create view` statements found, including reporting views named in
README: employee directory (`v_employee_directory`, confirmed used directly
in `lib/rbac/session.ts`), today's attendance, monthly stats, memo read
stats (`0008_views.sql`), plus later additions such as
`v_performance_summary` (Monitoring, p75 7-day Web Vitals aggregate) and
`v_automation_health` (per-endpoint automation dispatch summary).

## Storage buckets (from `0010_storage.sql`)

| Bucket | Public | Size limit | Notes |
|---|---|---|---|
| `avatars` | yes | 5 MiB | owner-write-only via `{auth.uid()}/...` path convention |
| `company-assets` | yes | 5 MiB | write gated by `settings.manage` permission |
| `attendance-selfies` | no | 5 MiB | private; owner or `attendance.view_all`/`attendance.view_branch` can read; served via signed URL (TTL 10 min per README) |
| `memo-attachments` | no | 10 MiB | gated by `memo.view`/create permission |
| `announcement-attachments` | no | 10 MiB | gated similarly |
| `leave-attachments` | no | 10 MiB | leave-request supporting documents |

A later migration, `0235_restrict_attachment_bucket_mime_types.sql`,
tightens allowed MIME types on attachment buckets — evidence of an active
security hardening pass (also see commit `c4be152 "Stop trusting
client-supplied Content-Type on Storage uploads"`).

## Foreign Data Wrapper / cross-database integration

`0146_kos_fdw_integration.sql` sets up a Postgres **Foreign Data Wrapper**
for the Kos Occupancy module — implies a live cross-database connection to
an external Postgres source at the database layer, distinct from the
application-level `http` Connector pattern used by FRIDAY/Holding. Exact
foreign source `UNKNOWN — NEEDS CONFIRMATION` (would require reading that
migration's connection details, which this audit did not extract to avoid
risking exposure of connection info in this document).

## Supabase Edge Functions

One found: `supabase/functions/sync-inbound/index.ts`. Purpose (by name and
by cross-reference with `pg_cron` job `sync-collect-responses` /
`sync-dispatch-pending` described in `docs/AUTOMATION.md`, which mention
syncing outbound `sync_log` entries "to MKH Property") appears related to
inbound sync from an external "MKH Property" system. Full behavior
`UNKNOWN — NEEDS CONFIRMATION` without reading the function body in detail.

## Backup / recovery status

See `docs/BACKUP.md` (existing, authoritative) and `DEPLOYMENT.md`. Summary:
Free-tier Supabase has **no built-in automated backups**; a self-managed
daily `pg_dump` + gzip + GPG-encrypt workflow exists
(`.github/workflows/backup.yml`, `scripts/backup-database.ts`) but is
**inert until two GitHub secrets are configured** (`SUPABASE_DB_URL`,
`BACKUP_ENCRYPTION_KEY`) — status of whether those secrets are currently
set is `UNKNOWN — NEEDS CONFIRMATION` (not visible from repo contents).
