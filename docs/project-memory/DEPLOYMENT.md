# DEPLOYMENT

No credentials, keys, tokens, or secrets appear anywhere in this document.

## Production URL

**`https://mkh.haluoleo.id`** — confirmed as the canonical production URL
by:
- `capacitor.config.ts` (`server.url: "https://mkh.haluoleo.id"` — the
  Android app is a thin native shell that loads this URL directly, per its
  own code comment: "Nothing here duplicates business logic").
- `.github/workflows/android-build.yml` (`NEXT_PUBLIC_APP_URL:
  https://mkh.haluoleo.id`).
- Commit `"Make mkh.haluoleo.id the canonical application URL"` (2026-07-10).

## Hosting

- **Web app**: **Vercel** — evidenced by `vercel.json` (region pinned to
  `sin1`/Singapore, per commit "Pin Vercel functions to sin1 (Singapore) to
  fix cross-continental DB latency" — implies the Supabase project is also
  hosted in a Singapore-adjacent region), `@vercel/speed-insights`
  dependency (auto-active on Vercel deploys), and `.gitignore` excluding
  `.vercel` (the local Vercel CLI project-link file — confirms a Vercel
  project is linked locally/in CI, just not committed).
  - **Exact Vercel project name/ID/team**: `UNKNOWN — NEEDS CONFIRMATION`
    (not present anywhere in the repo).
- **Background workers**: **Railway** — `railway.json`
  (`builder: "DOCKERFILE"`, `dockerfilePath: "Dockerfile.render-worker"`).
  This is a **separate deployment target** from the main web app; the
  render/Veo/general workers are long-running polling processes that don't
  fit Vercel's serverless execution model. Whether all three worker scripts
  (`render-worker.ts`, `veo-worker.ts`, `worker-main.ts`) run from this one
  Dockerfile/Railway service or are split across multiple Railway services
  is `UNKNOWN — NEEDS CONFIRMATION` (only one Dockerfile exists in the
  repo, named specifically for the render worker).
- **Database/Auth/Storage/Realtime**: **Supabase**, project ref
  `svcmybsziaelwwdrnzcv`, explicitly documented as **shared** with a
  separate villa-rental application (see `DATABASE.md`).
- **Android distribution**: GitHub Releases, tag pattern `android-v*`
  (produces a release with both debug and release APKs attached) — see
  `MOBILE_BUILD.md`.

## GitHub repository

`loonarsliving/mkhsistem` on GitHub (this audit's clone remote), display
name in `package.json` is `mk-connect`, product name "MK Connect". The repo
is explicitly documented as **public** (README security section: "repo ini
publik").

## Production / preview branch

- **Production branch (best evidence available)**: `claude/mk-connect-app-o9zw2p`
  — the repository's actual default branch (confirmed via
  `origin/HEAD`). See `GIT_WORKFLOW.md` for the important caveat that CI
  workflow files reference a `main` branch that does not currently exist.
- **Preview deployments**: Vercel's standard behavior would auto-preview
  every non-production branch/PR; whether Preview Deployments are enabled
  for this specific Vercel project is `UNKNOWN — NEEDS CONFIRMATION`.
- No explicit "production branch" setting is visible from repo contents
  alone — this is inferred from the branch being the default branch, the
  domain naming, and the absence of any other candidate branch.

## Deployment workflow (GitHub → Vercel, inferred)

The evidence strongly suggests, but this repo's contents cannot 100% prove,
a standard **GitHub → Vercel → Production** flow:

1. Work happens on a `claude/<description>-<suffix>` branch.
2. Branch is merged into `claude/mk-connect-app-o9zw2p` (the default
   branch).
3. Push to that branch triggers `ci.yml` (lint, typecheck, unit tests,
   build — all run with **no secrets required**, using the public
   anon-key/URL values baked directly into the workflow file) and,
   separately and independently, a **Vercel deployment** (Vercel's GitHub
   integration deploys on push to the connected branch — this integration
   itself is not visible in repo contents, but is the standard mechanism
   and is consistent with everything else observed).
4. `android-build.yml` also triggers on the same push (path-filtered to
   `android/**`, `capacitor.config.ts`, `lib/native/**`, `package.json`,
   `package-lock.json`) — Android builds are **not** blocking or gating
   the web deploy; they're an independent parallel pipeline.

## Build / install configuration

| Setting | Value | Evidence |
|---|---|---|
| Install command | `npm ci` (CI) / `npm install` (local, per README) | `.github/workflows/ci.yml` |
| Build command | `npm run build` (→ `next build`) | `package.json` |
| Start command | `npm run start` (→ `next start`) | `package.json` |
| Output | Next.js default (`.next/`) — no custom `output` config found in `next.config.ts` beyond security headers | `next.config.ts` |
| Node version (CI) | 22 | `.github/workflows/ci.yml` `setup-node` step |
| Node engine requirement | `>=20.0.0` | `package.json` `engines` |
| Region pin | `sin1` (Singapore) | `vercel.json` |

## Required environment variables

See `ENVIRONMENT.md` for the full, categorized list of all 46 variable
**names** referenced across the codebase (no values). At minimum, a working
deploy needs the Supabase public/service keys, `NEXT_PUBLIC_APP_URL`, and
(for AI features to function) `GEMINI_API_KEY`.

## Supabase production configuration

- Redirect URLs: README explicitly instructs adding the production domain
  to **Supabase → Authentication → URL Configuration → Redirect URLs**
  (required for password-reset and invite-email flows to work correctly in
  production).
- The production Supabase project is on the **Free plan** (see
  `DATABASE.md`/`docs/BACKUP.md`) — no automated backups from Supabase
  itself; a self-managed backup workflow exists but needs two secrets
  configured to be active (status of those secrets is unverifiable from
  the repo).

## Domain

`mkh.haluoleo.id` — DNS/registrar ownership and TLS configuration are
`UNKNOWN — NEEDS CONFIRMATION` (outside repo scope; presumably managed via
Vercel's domain settings given Vercel hosting, but not confirmable here).

## CI/CD summary (see `.github/workflows/`)

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | push to `main`/`claude/**`, PR to `main` | lint, typecheck, unit tests (always); integration + e2e tests (only if 4 test-account secrets are set — otherwise skipped, not failed); build; `npm audit --audit-level=high` |
| `codeql.yml` | (not fully read in this pass — README states "weekly + every push") | static security analysis |
| `android-build.yml` | push to `main`/`claude/**` touching Android-relevant paths, or `android-v*` tag | build/sign/verify/smoke-test debug + release APKs; publish GitHub Release on tag push |
| `backup.yml` | daily cron `0 18 * * *` (18:00 UTC / 02:00 WITA) | encrypted DB dump to GitHub Actions artifact; inert until 2 secrets are set |
| `wa-bridge-test.yml` | (not fully read in this pass) | tests for the WhatsApp bridge integration |

Dependabot (`.github/dependabot.yml`) opens weekly PRs (Monday) for both npm
and GitHub Actions dependencies, grouped for `@radix-ui/*` and the testing
libraries.

### PRODUCTION DEPLOYMENT CHECKLIST

Reconstructed to match the actual workflow evidenced above — not a new
process. Follow this before pushing to `claude/mk-connect-app-o9zw2p` (the
production branch) or any branch destined to merge into it:

1. **Confirm current branch** — `git branch --show-current`. Work should be
   on a `claude/<description>-<suffix>` branch, not directly on
   `claude/mk-connect-app-o9zw2p`, unless intentionally finalizing a merge.
2. **Confirm target branch and whether it is production** — merging into
   `claude/mk-connect-app-o9zw2p` **is** effectively a production deploy
   trigger (see the inferred GitHub→Vercel flow above). Treat it as such.
3. **Check `git status`** — ensure no unintended files are staged
   (especially anything under `.env*`, credentials, or `.vercel/`, which
   is gitignored but worth a sanity check).
4. **Run `npm run typecheck`** locally — matches the `lint-and-typecheck`
   CI job.
5. **Run `npm run lint`** locally.
6. **Run `npm test`** (unit) locally — matches CI's `unit-tests` job.
   Integration/e2e require live Supabase test-account secrets and network
   egress not available in most local/sandboxed dev setups; these are
   expected to run in CI, not necessarily pre-push locally.
7. **Run `npm run build`** locally to catch build-time errors before
   pushing (CI's `build` job will also catch this, but failing fast avoids
   consuming CI minutes and delaying the merge).
8. **Review any new/changed `supabase/migrations/*.sql`** — confirm the
   file is numbered correctly relative to the current highest migration,
   includes RLS policies for any new table, and does not silently rely on
   a table/column assumed-but-not-yet-migrated.
9. **Commit** with a clear, specific message describing the change and
   (if fixing a bug) the mechanism of the bug — matching the project's
   observed convention (see `DEVELOPMENT_WORKFLOW.md`).
10. **Push** the feature branch, then merge into
    `claude/mk-connect-app-o9zw2p` (method — direct merge vs. GitHub PR —
    is `UNKNOWN — NEEDS CONFIRMATION`; use whichever the task/user
    explicitly directs).
11. **Wait for Vercel** to build and deploy (status page/dashboard —
    outside this repo's visibility) and for `ci.yml`/`android-build.yml`
    (if Android-relevant paths changed) to go green on GitHub Actions.
12. **Verify production** — hit `GET https://mkh.haluoleo.id/api/health`
    and confirm `status: "ok"` with a real DB round-trip latency figure,
    not just a 200.
13. **Check critical functionality** manually for anything the change
    touched — attendance check-in/out, login, or the specific feature
    changed — since integration/e2e tests only run in CI, not against the
    live production deploy itself.
14. **Check logs** — `/monitoring` in-app (Super Admin only,
    `system.monitoring_view` permission) surfaces `mkc_error_logs` and
    `mkc_performance_metrics`; Vercel's own log collector captures
    `lib/logger.ts`'s structured JSON output automatically.
15. If the change included a new `pg_cron` job or automation dispatch
    endpoint, confirm it in `docs/AUTOMATION.md`'s inventory and via
    `v_automation_health` — do not assume a scheduled job is running just
    because the migration applied successfully.

Never push directly to `claude/mk-connect-app-o9zw2p` if the task at hand
indicates a review step should happen first (e.g. an explicit PR-based
ask) — this checklist assumes the same direct-merge pattern observed in
git history, not a stricter process a human may impose for a given task.
