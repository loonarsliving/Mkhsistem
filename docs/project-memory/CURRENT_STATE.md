# CURRENT STATE

Audit date: 2026-08-21. Reconstructed from `git log`, migration file names,
and existing docs — not from any external issue tracker (none found).

## Last known completed work

As of the most recent commits (2026-08-21), the active area of work is a
**contractor expense-reporting WhatsApp flow** for the Construction
Management module:

- "Add WhatsApp nota-photo -> pengajuan submission (Endy/Rebecca)"
- "Add contractor nota-report WhatsApp flow (Anang)"
- "Recap Vando-approved contractor reports into one WA to Super Admin"
- "Read nota line items individually instead of one combined summary"
- "Add internal send-wa-message endpoint for one-off outbound messages" +
  "Exclude /api/admin/send-wa-message from session-auth middleware"
- "Let Anang request a fund advance himself, in his own words"
- "Split Anang's fund requests into gaji vs material categories"

Backed by migrations `0237_contractor_expense_report.sql` through
`0239_contractor_expense_report_items.sql`. This reads as a live,
in-progress feature build for specific named real users (Anang, Endy,
Rebecca, Vando appear to be actual staff, not test fixtures), not a
generic/finished module — treat the exact business rules here as
still-settling rather than fully stable.

## Current active work (best inference from most recent history)

The Construction Finance / Construction Management area has seen the
highest commit density in the last ~2 weeks (2026-08-15 through
2026-08-21): full "Phase 1–8" buildout (WBS, BOQ, material/procurement,
labor/earned-value payments, cost control), followed immediately by a run
of bug fixes and sync-to-external-system work ("Sync construction fund
transfers to mkh-properti's jurnal", "Fix construction expense sync to map
project code per branch"), followed by the AI WhatsApp lead-nurture bot and
the contractor expense-report flow described above. This module is the
clear center of gravity of current development.

## Unfinished / explicitly incomplete work (from doc content and code)

- **Web Push VAPID configuration** — env var names not found in
  `.env.example` despite the feature existing in code. See
  `ENVIRONMENT.md`. `UNKNOWN — NEEDS CONFIRMATION` whether this is actually
  wired up in production.
- **Android release signing** — per `docs/android/BUILD.md` /
  `android-build.yml`, release APKs ship **unsigned** until
  `ANDROID_RELEASE_KEYSTORE_BASE64` (and related secrets) are added to the
  repo. Whether they've since been added is `UNKNOWN — NEEDS
  CONFIRMATION`.
- **Database backups** — inert until `SUPABASE_DB_URL` and
  `BACKUP_ENCRYPTION_KEY` GitHub secrets are configured (`docs/BACKUP.md`).
  Status `UNKNOWN — NEEDS CONFIRMATION`.
- **iOS mobile app** — not implemented at all (no `ios/` directory).
- **Generic/company-wide payroll and inventory modules** — described only
  as architectural affordances in README's roadmap section, not built.

## Known bugs / recently-fixed bugs worth remembering

Several fixes in the last week address **real production incidents**, not
just code review nits — worth reading their commit messages before
touching adjacent code:

- "Fix silent failure in bukti-transfer-to-jurnal sync (critical)" —
  transfer-proof-to-journal sync could fail silently.
- "Stop blind FIFO-confirming a bukti transfer with no nominal match" — a
  matching-logic correctness bug (transfer proofs were being matched to
  pending requests by submission order alone, not by amount).
- "Fix idempotency_key collision blocking retries after a reset" — a
  retry-safety bug.
- "Fix mkc_notifications_category_check list in 0228 to match production" —
  a migration/production schema drift bug.
- "Fix sisa-kontrak-tukang sync: source_id must be a real UUID" — a type
  mismatch bug in a sync path.

These indicate the **sync-to-mkh-properti / bukti-transfer / journal
posting chain** is a historically fragile area that has needed multiple
targeted fixes recently — treat changes in that area with extra care and
re-verification.

## Technical debt / structural notes

- `services/` (README's designated home for cross-repository business
  logic) contains only one file — most business logic actually lives in
  `features/*/actions/*.ts` instead. Not necessarily a problem, but a
  discrepancy between documented and actual architecture (see
  `ARCHITECTURE.md`).
- CI/Android-build workflow files reference a `main` branch that does not
  exist in this repository (see `GIT_WORKFLOW.md`) — worth resolving
  (either create `main` and repoint the default branch, or clean up the
  workflow triggers) so PR-triggered CI actually runs as intended.
- Migration file numbering has a small number of apparent duplicates
  (e.g. two files both prefixed `0202_`) — see `DATABASE.md` caveat; worth
  a direct check against the live `supabase_migrations.schema_migrations`
  table before assuming strict linear history.

## Blocked work

None identified from repo contents — no issue tracker, no `TODO`/`FIXME`
sweep was performed as part of this audit (out of scope for a
non-invasive audit; a future pass could grep for these explicitly).

## Company File Manager (added 2026-08-26, this app's side)

This app owns WhatsApp (the existing LEON pipeline) and the Gemini
classification for "kirim saya file X" / "simpan sebagai ... kategori ..."
requests (`lib/ai/domains/file-request.ts`, wired into `router.ts` and
`webhook-handler.ts`'s Super Admin image branch). The actual files and
catalog live entirely on a separate `Filemanager` repo on the owner's Mac
Mini, called via `lib/filemanager/client.ts` over a Cloudflare Tunnel —
this app stores no file metadata of its own. Saving a file is Super
Admin-only for now (migration `0245`'s `files.wa_upload` permission; owner
plans to extend it to more roles later). Not live yet:
`FILEMANAGER_BASE_URL` / `FILEMANAGER_SHARED_SECRET` are unset, and the
owner's Mac Mini hasn't been provisioned yet (no tunnel running) —
`Filemanager` repo code itself is up to date (own WhatsApp
device design was reverted, it's a thin authenticated storage backend now,
matching this app's client).

## KontenAI local Mac Mini footage/render (added 2026-08-27)

`storage_provider = 'local_mac'` (migration `0246`) lets `kontenai_assets`
point at footage stored on the owner's Mac Mini SSD instead of Supabase
Storage/Google Drive, and `scripts/render-worker.ts` (existing FFmpeg
render pipeline, previously Railway-only) can now run unmodified ON that
Mac Mini for a network-free render path
(`scripts/local-mac-asset-resolver.ts`). Not live yet — same blocker as
above (Mac Mini not provisioned) — and the "Upload Footage" UI (Bagian K
of the owner's brief: project/campaign/location/tags, separate from the
plain-document WhatsApp upload) is intentionally not built yet, flagged as
the next step. Note this is a DIFFERENT, narrower scope than the owner's
original full vision (a `mk-connect-local-agent` service also driving
DaVinci Resolve automation) — that part is on hold: DaVinci Resolve's
external-scripting API became Studio-only as of v19.1 (Nov 2024), the
owner is on the Free edition, and no license/automation-approach decision
has been made yet. FFmpeg-based rendering (this work) was chosen as the
unblocked, immediately actionable slice.

## Important warnings

- **This repository is public.** Real employee/production credentials must
  never be committed (README's own explicit warning, restated here).
- **The Supabase project is shared** with another (villa-rental)
  application under the same organization — any schema change must
  continue avoiding the collisions already worked around (see `mkc_`
  table-name prefix convention, `DATABASE.md`).
- **`CRON_SECRET` fails open** if unset — a genuine, if intentional,
  security posture that should not be forgotten when reasoning about the
  10 cron/trigger-only endpoints it's meant to protect.

## Production status

Live in production at `https://mkh.haluoleo.id`, hosted on Vercel, backed
by a shared free-tier Supabase project. Actively used by real, named staff
(per the most recent commits) — this is **not** a demo/staging-only system.

## Mobile status

Android: implemented, CI-verified (build + emulator smoke test), debug
APKs distributed via CI artifacts/GitHub Releases; release-signing wiring
present in code but activation status unverifiable from the repo. iOS: not
implemented.

## Database status

Free-tier Supabase, 246 migrations applied (assumed — not independently
re-verified against the live project in this audit, which intentionally
made no database changes), RLS active repo-wide, no automated backups
active by default (self-managed backup workflow exists but needs secrets).
