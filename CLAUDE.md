# CLAUDE PROJECT MEMORY

Before doing any coding work:

1. Read this file.
2. Read /docs/project-memory/PROJECT_CONTEXT.md
3. Read /docs/project-memory/CURRENT_STATE.md
4. Read /docs/project-memory/DEVELOPMENT_WORKFLOW.md
5. Read /docs/project-memory/GIT_WORKFLOW.md
6. Read /docs/project-memory/DEPLOYMENT.md
7. Read relevant documentation before modifying a feature.

The rest of `/docs/project-memory/` — ARCHITECTURE.md, FEATURES.md,
DATABASE.md, INTEGRATIONS.md, AI_AND_AGENTS.md, MOBILE_BUILD.md,
ENVIRONMENT.md, ROADMAP.md, CHANGELOG.md — is the detailed reference layer.
Consult the relevant file(s) before touching that area of the system (e.g.
read DATABASE.md before any migration, INTEGRATIONS.md before touching an
external API call, MOBILE_BUILD.md before touching `android/` or
`capacitor.config.ts`).

IMPORTANT:

DO NOT TRUST CHAT MEMORY.
TRUST THE REPOSITORY MEMORY.

The repository is the persistent memory of this project.

Before modifying existing functionality:

- inspect existing implementation
- understand dependencies
- understand database impact
- understand production impact
- reuse existing patterns

Never:

- delete working functionality without explicit approval
- change architecture without approval
- change database schema without approval
- change production configuration without approval
- expose secrets
- commit secrets
- invent APIs
- invent features
- assume deployment destination

## PROJECT-SPECIFIC NOTES (from the 2026-08-21 memory audit)

- This is **MK Connect**, an internal system for PT Maha Karya Haluoleo,
  hosted at `https://mkh.haluoleo.id` on Vercel, backed by a Supabase
  project (`svcmybsziaelwwdrnzcv`) that is **shared** with a separate
  villa-rental application under the same organization. Never assume this
  Supabase project is exclusive to MK Connect — check for naming
  collisions (the `mkc_` table prefix convention exists specifically
  because of this) before adding tables at the top level of `public`.
- This repository is **public**. Real employee/production credentials
  must never be committed — see PROJECT_CONTEXT.md and README.md's
  "Keamanan" section.
- The repository's actual default/production branch is
  `claude/mk-connect-app-o9zw2p`, **not** `main` — despite CI workflow
  files referencing `main`. See GIT_WORKFLOW.md before assuming which
  branch is production.
- 246 SQL migrations exist in `supabase/migrations/`, applied strictly in
  numeric filename order. Never edit a past migration — add a new
  numbered one, even to fix an earlier mistake (the project's own
  established pattern, see DEVELOPMENT_WORKFLOW.md).
- Standard architecture: `app/` (routes) → `repositories/*` (pure reads) or
  `features/*/actions` (Server Action mutations, with Zod validation) →
  Supabase (RLS-enforced). RBAC is data-driven (`roles`/`permissions`/
  `role_permissions` tables), checked both in application code
  (`requirePermission()`, `lib/rbac/session.ts`) and independently via
  Postgres RLS — always add both layers for a new permission-gated
  feature, not just one.
- FRIDAY / FRIDAY Holding (the AI executive-intelligence layer) has strict
  guardrails that must never be relaxed casually: numeric signals are
  computed in application code, never by the model
  (`lib/ai/friday/signals.ts`); proposed actions must come from a fixed,
  migration-guarded catalog (`lib/ai/friday/action-catalog.ts`); an
  unreachable business unit must always report `data_tidak_tersedia`, never
  a fabricated number.
- `CRON_SECRET`-guarded endpoints **fail open** when the secret is unset —
  be deliberate about this if touching `lib/security/cron-auth.ts` or any
  of the 10 routes it protects.

## PRODUCTION SAFETY

Before pushing or deploying, ALWAYS determine:
- current branch
- target branch
- whether target is production
- what will be deployed
- whether database changes are included
- whether environment variables are affected

NEVER push directly to production if the existing workflow indicates another process.
NEVER run destructive production commands without explicit approval.

See `docs/project-memory/DEPLOYMENT.md`'s "PRODUCTION DEPLOYMENT CHECKLIST"
section for the concrete, project-specific checklist (branch check, git
status, typecheck, lint, unit tests, build, migration review, commit,
push, wait for Vercel + CI, verify `/api/health`, check critical
functionality, check `/monitoring` logs).

## MEMORY UPDATE RULE

When a significant feature or architectural change is completed, update the relevant project-memory files. At minimum consider: CURRENT_STATE.md, CHANGELOG.md, ROADMAP.md, ARCHITECTURE.md. Do not update memory with guesses.
