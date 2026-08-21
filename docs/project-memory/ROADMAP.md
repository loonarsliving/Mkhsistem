# ROADMAP

Only items with direct evidence in the repository (README's own roadmap
section, migration/commit patterns implying planned-but-not-shipped work,
or explicit in-code notes) are listed. No roadmap items are invented.

## COMPLETED

Everything listed as DONE in `FEATURES.md` — the core V1 module set, CRM,
Markom, KontenAI, Construction Management/Finance, HR Discipline/Finance,
Salary Input, Loonars Beauty, Kos Occupancy, Siteplan, FRIDAY, FRIDAY
Holding, Android app. See `FEATURES.md` for per-item evidence; not
duplicated here to avoid drift between the two files.

## IN PROGRESS

- **Contractor expense-report WhatsApp flow** (Construction Management) —
  actively being built and iterated as of the most recent commits
  (2026-08-21). See `CURRENT_STATE.md`.
- **AI WhatsApp lead-nurture bot** for ad-driven leads — added 2026-08-17,
  with immediately-following fix/refinement commits through 2026-08-19
  (branch-scoped escalation, image-answer support, handoff-only mode,
  project-selection fallback) — this reads as a feature still being
  hardened, not yet fully settled.
- **Bukti-transfer-to-jurnal sync chain** — multiple correctness fixes in
  the 2026-08-16 to 2026-08-19 window (see `CURRENT_STATE.md` "Known bugs"
  section) suggest this integration is still maturing, even though it is
  functionally live.

## NEXT

No explicit "next up" backlog, ticket, or `TODO` file was found in the
repository. `UNKNOWN — NEEDS CONFIRMATION` — there may be a roadmap
maintained outside this repo (a project management tool, a chat thread with
the task-giver) that this audit has no visibility into.

## PLANNED

From README's own "Roadmap ERP" section — explicitly describes these as
architectural affordances the schema/folder structure was designed to
support, **not** committed work:

- Generic company-wide **payroll** module (beyond the construction-specific
  labor-payment tables and the HR salary-input feature that already exist).
- Generic **inventory** module.
- Generic **procurement** module (beyond the construction-specific
  `cm-procurement.repository.ts`/`cm_purchase_requests` that already
  exist).
- The stated rationale: `divisions`/`positions` are already company-wide
  with optional `branch_id`; `roles`/`permissions` are already data-driven;
  `features/` is already organized per-domain — so README claims these
  additions would not require "major refactor." This is a design claim by
  the project's own documentation, not independently verified by this
  audit.

## UNKNOWN

- Whether an iOS app is planned. No evidence either way — README makes no
  claim, no `ios/` scaffold exists.
- Whether the `main` branch referenced in CI/Android-build workflow
  triggers is meant to be created/adopted, or is dead configuration. See
  `GIT_WORKFLOW.md`.
- Whether Supabase plan upgrade (Free → Pro, for automated backups/PITR)
  is planned — `docs/BACKUP.md` recommends it but does not confirm it is
  scheduled.
- Whether the Whacenter WhatsApp bridge (`WHACENTER_DEVICE_ID`,
  `wa-bridge-test.yml`) is a planned replacement for, or a supplement to,
  the Meta WhatsApp Cloud API integration.
- Any roadmap items tracked outside this repository (issue tracker, project
  board, external docs) — not visible to this audit.
