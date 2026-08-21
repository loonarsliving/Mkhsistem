# DEVELOPMENT WORKFLOW

Reconstructed from `git log` (508 commits), commit message content, CI
config, and existing docs. Nothing here is prescribed — it describes what
has actually happened in this repository's history.

## Who does the work

- **469 of 508 commits (92%)** are authored by `Claude` (Claude Code).
- **39 commits** are authored by `loonarsliving` (the human account/owner).
- Development is continuous and daily-paced: first commit `2026-07-09`
  ("Scaffold MK Connect..."), most recent `2026-08-21`, i.e. this ~1,400+
  file, 246-migration, 31-feature-module system was built in **under 7
  weeks** of near-daily commits — strongly indicative of an AI-agent-driven
  development process with a human directing scope and approving/merging
  work, rather than a traditional multi-engineer team cadence.

## How dev starts

Per README: `cp .env.example .env.local`, fill Supabase + app URL values,
`npm install`, `npm run dev`. First user (Super Admin) is created either via
`npm run seed:users` (5 demo accounts, shared demo password, documented
in-repo as intentionally public) or manually through the Supabase dashboard
+ a direct `employees` table insert for production.

## How features are built

Observed pattern from commit history and directory conventions:

1. A `claude/<description>-<suffix>` branch is created off the production
   branch for a unit of work (a feature, a fix, a phase of a larger
   module).
2. Commits on that branch typically touch, together: a new/updated
   `supabase/migrations/NNNN_*.sql` file (schema + RLS + RPCs), one or more
   `repositories/*.repository.ts` files, `features/<domain>/actions/*.ts`
   (Server Actions with Zod validation), `features/<domain>/components/*`,
   and route files under `app/(app)/<domain>/`.
2026-08-15's "Construction Management Phase 1" through "Phase 7-8" commits
   are a clear example of large modules being built in explicit,
   sequential, named phases within one continuous work session/day, each
   phase getting its own commit and (often) its own migration file.
3. The branch is merged back into `claude/mk-connect-app-o9zw2p` (54 merge
   commits observed).
4. Bug-fix commits frequently follow within the same day or the next,
   referencing the specific defect found (e.g. "Fix silent failure in
   bukti-transfer-to-jurnal sync (critical)", "Fix compile error: expose
   FirebaseApp on the app module's classpath") — consistent with a
   build-then-verify-then-fix loop rather than long upfront design phases.

## Coding patterns observed

- **Every new DB-backed feature gets its own numbered migration file**,
  never an edit to a past migration (246 sequential files; a small number
  of "fix" migrations correct earlier ones going forward, e.g.
  `0029_fix_crm_reporting_functions.sql`, `0040`–`0043` (a run of "fix
  ambiguous columns" migrations), rather than editing the original file in
  place).
- **RLS and permission grants are added in the same or an immediately
  following migration** as the table/feature they protect — not deferred.
- **Comments in code frequently explain *why*, including tradeoffs and
  prior failure modes** — this is a strong, consistent pattern across
  `README.md`, `docs/AUTOMATION.md`, `docs/BACKUP.md`, `middleware.ts`,
  `instrumentation.ts`, `capacitor.config.ts`, and CI workflow files. This
  reads as a deliberate documentation-as-you-go discipline, not
  accidental.
- **Security/hardening passes happen as their own dedicated commits**, not
  bundled silently into feature work — e.g. "Stop trusting client-supplied
  Content-Type on Storage uploads", "Gate /api/debug/* diagnostics behind
  Super Admin auth", "Add failed-auth rate limiting to shared-secret
  bridge/cron endpoints" (all 2026-08-20, one day, three separate hardening
  commits).

## How DB changes / migrations are made

Sequential, numbered SQL files in `supabase/migrations/`, applied via
`supabase db push` (Supabase CLI) or manually through the Supabase
Dashboard SQL editor, always in file-name order (per README). No ORM
migration tool (Prisma, Drizzle, etc.) is used — these are hand-written SQL
migrations. Live-database production credentials/employee data are
provisioned directly against the live DB (via Supabase MCP or SQL per
README's security section), **never** through a migration file or commit —
this is a documented, deliberate boundary (README, "Keamanan" section).

## How testing is done

Three tiers, matching `package.json` scripts and the `tests/` directory:

- **Unit** (`tests/unit/`, Vitest, no network) — `lib/utils`, RBAC seed
  integrity, Zod schema validation per form, some UI components. Runs in
  CI on every push/PR with no secrets required.
- **Integration** (`tests/integration/`, Vitest against **live** Supabase)
  — uses two low-privilege test accounts (`TEST-STAFF-001`, `TEST-HR-001`)
  to exercise RLS, per-role permission resolution, attendance RPCs, memo
  targeting/read-receipts. Requires 4 GitHub secrets
  (`TEST_STAFF_EMAIL/PASSWORD`, `TEST_HR_EMAIL/PASSWORD`); **skips cleanly
  (not a failure)** in CI until those secrets are configured.
- **E2E** (`tests/e2e/`, Playwright) — real browser flows for
  auth/attendance/registration, with a faked camera device and mocked
  geolocation, against a real `next build && next start`.
- Integration/e2e need live network egress to Supabase, so per README they
  intentionally run only in GitHub Actions, not in the (network-restricted)
  local/sandboxed dev environment this kind of session runs in.

## How builds are done

`npm run build` (Next.js production build) — run in CI on every push/PR
(`ci.yml`, `build` job, needs `lint-and-typecheck` to pass first). Android
builds are a separate pipeline (`android-build.yml`) — see
`MOBILE_BUILD.md`.

## How bugs are fixed

Pattern from commit history: a bug is described precisely in the commit
message (often naming the exact mechanism — "NPE in
Geolocation.checkPermissions()", "idempotency_key collision blocking
retries after a reset", "session-auth middleware allowlist" gaps), fixed in
a small, scoped commit, and where the bug was severe/production-affecting,
labeled explicitly ("(critical)") in the message.

## Sprint-like pattern

No formal sprint/ticket system (no `.github/ISSUE_TEMPLATE`, no linked
issue tracker evidence) is present in the repo. However, work is clearly
organized into **named, numbered phases for large modules** — the clearest
example being Construction Management's "Phase 1" through "Phase 7-8"
commits, each scoped to a specific vertical slice (WBS foundation → BOQ →
material/procurement → labor/earned-value → cost control) delivered in
sequence on a single day (2026-08-15). This is the closest thing to a
sprint pattern this audit found; it is module-scoped and self-directed
rather than tied to any external ticketing system.

## Branch/PR/deploy cadence

See `GIT_WORKFLOW.md` and `DEPLOYMENT.md` for the branch model and the
(inferred, not directly confirmed) push-to-production-branch → Vercel
auto-deploy flow.
