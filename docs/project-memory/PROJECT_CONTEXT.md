# PROJECT CONTEXT

## Project name

**MK Connect** (`package.json` name: `mk-connect`; Capacitor `appId`:
`id.haluoleo.mkconnect`; production domain: `mkh.haluoleo.id`).

## Purpose

Per `README.md`: "Internal Communication & Attendance System" for **PT Maha
Karya Haluoleo**. Version 1 scope (as documented and evidenced in code):
authentication, dashboard, attendance (GPS + selfie), memos, announcements,
employee/branch/division/position management, realtime notifications,
global search, and company settings — described as "built on an architecture
ready to grow into an internal ERP."

The codebase today is **substantially larger than the "V1" scope described
in the README's module list**. Evidenced by `features/` (31 modules) and
`app/(app)/` route groups, the live system also includes: CRM (leads, sales,
promo broadcast), Markom (marketing communications / ads), KontenAI (AI
content production pipeline), Construction Finance, HR Discipline & Finance,
Salary Input, Loonars Beauty, Kos Occupancy, Siteplan, Lead Knowledge, an
Assistant/voice module, and **FRIDAY** (an executive-intelligence layer) with
a **Holding** sub-module for multi-business oversight. See `FEATURES.md` for
per-module evidence and status.

## Users

Role-based, per `constants/rbac` and `lib/rbac/session.ts` (roles are
data-driven, stored in the `roles`/`permissions`/`role_permissions` tables,
not hardcoded enums). Roles observed in migrations and README text include:
Super Admin, Direktur Operasional, Kepala Cabang (per-branch), HR, staff
roles, a `pending` self-registration role, and a `private_assistant` role
(FRIDAY-related, `friday.view`/`friday.run` without `friday.action_decide`,
per migration `0177`). Branches referenced in code: Makassar, Jabodetabek,
Kendari, Yogyakarta, plus a "Management Property" branch — see
`constants/app.ts` (`JOGJA_BRANCH_ID`, `KENDARI_BRANCH_ID`,
`MAKASSAR_BRANCH_ID`, `MANAGEMENT_PROPERTY_BRANCH_ID`).

## Relation to other systems

- The production Supabase project (`svcmybsziaelwwdrnzcv`) is explicitly
  documented (`README.md`) as **shared** with a separate "villa-rental"
  application belonging to the same organization. MK Connect's own
  `notifications` table was renamed to `mkc_notifications` specifically to
  avoid a name collision with the villa app's pre-existing `notifications`
  table (see `supabase/migrations/0005_notifications_audit_settings.sql`).
- The **FRIDAY Holding Architecture** (`app/(app)/friday/holding`,
  `lib/ai/friday/holding.ts`, migration `0182_friday_holding_architecture.sql`)
  is a deliberate cross-business design: other businesses (Villa, Homestay,
  Kos, Hotel, Coffee Shop, "future businesses") each keep their own
  database/dashboard/automation and are read via a `Connector` abstraction
  (`internal_mkh` or `http` type) rather than having their data owned by
  MK Connect. This is a real, migrated feature — see `ARCHITECTURE.md`.
- An `app/api/sso/loonars-sales` route and `app/api/villa/deploy` +
  `app/api/villa/secrets` routes exist, indicating integration touchpoints
  with at least one other Loonars/villa-branded system. Exact nature of that
  other system (its own repo, ownership, deployment) is
  **UNKNOWN — NEEDS CONFIRMATION** (not verifiable from this repo alone).

## Status

Actively developed — 508 commits total, most recent commit dated
2026-08-21 (see `CURRENT_STATE.md` and `CHANGELOG.md`). CI, CodeQL,
Dependabot, an Android build pipeline, and a scheduled DB backup workflow
are all present and wired up in `.github/workflows/`.

## Key principles (evidenced in code/docs, not inferred)

- **Clean architecture / layering** — `app/` (routes) → `repositories/*`
  (pure Supabase queries) or `features/*/actions` (Server Actions / mutation
  + business logic) → Supabase, with RLS as an independent second
  enforcement layer. Documented in `README.md` "Arsitektur" section and
  matches the actual directory layout (`repositories/`, `services/`,
  `features/*/actions`).
- **RBAC is data-driven**, not hardcoded — enforced both at the application
  layer (`requirePermission()` / `lib/rbac/session.ts`) and independently at
  the database layer (Postgres RLS).
- **FRIDAY's numbers are computed in code, not by the model** —
  `lib/ai/friday/signals.ts` per README; the AI narrates, deterministic code
  computes cross-domain figures.
- **FRIDAY/Holding proposes, humans decide, code executes** — actions
  proposed by AI start `status = 'proposed'` and require a human holding
  `friday.action_decide` permission before executing; the catalog of
  possible actions is a fixed, migration-guarded list
  (`lib/ai/friday/action-catalog.ts`, check constraint in migration `0179`),
  not something the model can invent at runtime.
- **A business unit that can't be reached is never reported as "quiet" or
  "critical"** — `holding.ts` forces an unreachable connector's status to
  `data_tidak_tersedia` regardless of what the model would otherwise write
  (README, "Holding Architecture" section).
- **Production employee credentials never enter git** — the repo is public;
  only the shared demo-seed accounts (`scripts/seed-users.ts`) use a
  published password. Real accounts are provisioned directly against the
  live database.
