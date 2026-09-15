# CHANGELOG

Built entirely from `git log` (508 commits, 2026-07-09 → 2026-08-21) and
cross-referenced against `supabase/migrations/`. Grouped by theme/period
rather than listing all 508 commits individually — see `git log` directly
for full detail on any specific change. No entries are fabricated; every
line below corresponds to one or more actual commit messages.

## 2026-07-09 — Project scaffold (day 1, 22 commits)

Initial build of the "V1" scope in a single day: Next.js 15 app shell,
Supabase schema + RLS + RBAC, auth, UI system, dashboard, attendance
(check-in/out, history, leave requests, work schedules), memo module,
announcement module, employee/branch/division/position management,
notifications, profile, global search, settings. Also same-day: production
hardening (nonce-based CSP, HSTS, login rate limiting), monitoring
(structured logging, error tracking, performance monitoring, health
check), database backup script + scheduled workflow, GitHub Actions CI/CD
(lint/typecheck/unit/build/integration/e2e, CodeQL, Dependabot), automated
test suite (Vitest unit, live-Supabase integration, Playwright e2e),
employee self-registration with tiered approval, Root Owner account
protection, and the `notifications` → `mkc_notifications` rename to avoid
colliding with the shared Supabase project's existing villa-app table.

## 2026-07-10 — Android app + production URL

Added the MK Connect Android app (Capacitor native shell) and worked
through a real native-crash stabilization arc same-day: fixed an NPE in
`Geolocation.checkPermissions()`, a missing Firebase classpath, an AAPT
resource-linking failure, added an on-device crash screen + `crash.txt` for
self-diagnosis without `adb`. Set up the Android CI pipeline (build, lint,
emulator smoke test, signed-APK verification via `apksigner`, GitHub
Release publishing on `android-v*` tags). Made `mkh.haluoleo.id` the
canonical application URL and pinned Vercel functions to `sin1`
(Singapore) to fix cross-continental DB latency.

## 2026-07-11 — CRM module

Added the full CRM module: prospect pipeline, follow-ups, Finance
verification, commission engine, Project Master admin page, CRM
Dashboard with branch/sales drill-down, Customer Database + export,
role-scoped dashboard visibility, Sales Target rework (branch-based
auto-distribution, division-based sales identification), Markom KPI module
(task-completion checklist, not revenue-based). Included a same-day
"Full-system QA" commit fixing nav-visibility and role-permission gaps.

## 2026-07-12 to 2026-07-20 — Markom, KontenAI foundation, AI platform

High-velocity period (13–27 commits/day). Major threads:

- **AI Operating System** — production-grade resilience platform (circuit
  breaker, retry, telemetry) for all AI calls; `ai_job_queue` with
  retry/backoff/dead-letter.
- **KontenAI** built as a sequence of named "Sprints" (1 through 9 plus a
  foundation commit and a cross-sprint integration contract): Asset
  Library, Gemini Vision, AI Director, Storyboard Engine, Asset Selector,
  Render Engine, Production Pipeline, Learning Engine, AI Optimization —
  each sprint is its own commit/migration, mirroring the later
  Construction Management "Phase" pattern.
- **Markom** AI automation (research-driven checklist), content
  submissions (upload → AI review → schedule to Instagram), Meta Ads
  Specialist (autonomous Click-to-WhatsApp campaigns), TikTok/Instagram
  connection status diagnostics, Zernio connector added specifically to
  bypass a Meta Business Verification blocker.
- **Knowledge & Teaching Engines** — Investor Intelligence, Sales Teaching,
  Cashflow Intelligence, Cashflow Teaching, Occupancy Intelligence —
  AI-driven coaching/analysis banks feeding domain-specific advice back
  into CRM/sales/occupancy workflows.
- **HR Disciplinary Actions** (SP1/SP2/SP3, recorded termination).
- **Loonars Beauty** module (content rotation, orders, weekly AI
  evaluation) and **Kos Occupancy** module.
- **Automatic birthday wishes**, **general daily automation** (morning
  motivation, daily report to Super Admin) via WhatsApp.
- SSO handoff route so logged-in MK Connect users skip a separate
  "loonars-sales" login — first clear evidence of the cross-system
  integration documented in `INTEGRATIONS.md`.

## 2026-07-21 — Single largest day (59 commits)

The highest-density day in the project's history. Included: **FRIDAY
executive intelligence layer** added (with fixes labeled "T7"/"T10",
suggesting a structured internal test/task numbering for this rollout),
native Siteplan module (image-map units, buyer purchase flow, fee claims),
loonars-sales closing verification queue + fee claim card, WhatsApp-only
approval requests for Kepala Cabang, and further Markom/CRM/KontenAI
refinement.

## 2026-07-22 to 2026-07-26 — FRIDAY Holding, hardening

- **FRIDAY Holding layer** added ("read a group without changing how one
  company is read") — the multi-business rollup architecture described in
  `ARCHITECTURE.md`.
- Continued diagnostic/debug route additions for Meta Ads, Instagram,
  WhatsApp, Zernio config troubleshooting (later gated behind Super Admin
  auth on 2026-08-20 — see below).
- Ad account balance monitoring, AI ad performance analysis, inline
  daily-budget editing.

## 2026-07-27 to 2026-08-14 — Lower-velocity maintenance period

Notably quieter (as few as 1–2 commits on several days) compared to the
surrounding weeks — consistent with either a scope pause, external review
period, or lighter maintenance-only work. Activity resumes at higher
density from 2026-08-15 onward.

## 2026-08-15 — Construction Management, built in 8 named phases (12 commits)

Entire Construction Management module built same-day as sequential
"Phase 1" through "Phase 7-8" commits: WBS foundation + weighted progress
→ BOQ foundation (schema + RPCs) → material requirement engine +
procurement → labor/kontraktor earned-value payments → cost control + city
comparison. Also: opened Construction Management to every branch (not just
Kendari), restructured project creation (budget-per-unit × unit count +
BOQ input form), unified labor cost with "Kontrak Borongan" rather than a
separate BOQ line item.

## 2026-08-16 to 2026-08-19 — Construction Finance hardening + AI lead-nurture bot

- Kepala Cabang approval stage for weekly borongan payments, AI payment
  recommendations shown alongside sisa gaji, "bukti transfer" made the
  real final approval step that posts journal + kas entries.
- Multiple **production-incident fixes** to the construction-finance ↔
  mkh-properti sync chain: silent sync failures, FIFO-vs-nominal matching
  bugs, `idempotency_key` collisions, project-code-per-branch mapping
  errors (see `CURRENT_STATE.md` "Known bugs" for full list and
  significance).
- **AI WhatsApp lead-nurture bot** added for ad-driven leads
  (2026-08-17), immediately followed by a run of scoping/hardening fixes:
  branch-scoped pending-question escalation, image-answer support,
  handoff-only mode scoped to Property Management project, ask-which-
  project fallback for ad clicks missing `ad_reply` data.

## 2026-08-20 — Security hardening pass (4 commits)

Dedicated hardening day, distinct from feature work: gated `/api/debug/*`
diagnostics behind Super Admin auth (dropped an unused
storage-orphan-cleanup route in the process), added failed-auth rate
limiting to shared-secret bridge/cron endpoints, stopped trusting
client-supplied `Content-Type` on Storage uploads, bumped Next.js to
15.5.23 and applied non-breaking `npm audit` fixes.

## 2026-08-21 — Contractor expense-report WhatsApp flow (8 commits, most recent)

Newest work in the repository as of this audit: WhatsApp nota-photo →
pengajuan submission, contractor nota-report flow, recap of Vando-approved
reports to Super Admin, itemized nota line-item reading, an internal
send-wa-message endpoint (excluded from session-auth middleware), and
splitting a specific contractor's fund requests into gaji vs material
categories. See `CURRENT_STATE.md` for why this is flagged as still
actively settling rather than finished.

## 2026-08-26 — Company File Manager, final shape: this app owns WhatsApp + AI

Settled after two same-day pivots (see git history for the intermediate
"standalone Filemanager + AI-proxy" design, since replaced): the owner
decided this app should keep owning WhatsApp and the Gemini classification
(reusing the existing LEON pipeline) for file requests/saves, while the
actual file bytes and catalog stay entirely on a separate `Filemanager`
repo running on the owner's Mac Mini, reached over a Cloudflare Tunnel.
This app never stores a file catalog and never receives calls from
Filemanager — it only calls OUT to it.

- `lib/filemanager/client.ts` — HTTP client (search / store / get a
  delivery link), guarded by `FILEMANAGER_SHARED_SECRET`.
- `lib/ai/domains/file-request.ts` — two flows: "kirim saya file X" (any
  recognized employee, wired into `router.ts`'s `routeAndAnswer`) searches
  Filemanager's catalog and sends a match via `sendWhatsAppDocument`
  (`lib/ai/notifications/engine.ts`); "simpan sebagai ... kategori ..."
  (Super Admin only so far, migration `0245`'s new `files.wa_upload`
  permission) downloads the WhatsApp attachment and hands it to Filemanager
  to store — wired into `webhook-handler.ts`'s Super Admin image branch,
  gated on an explicit caption-keyword pre-filter
  (`looksLikeFileSaveCaption`) so it never shadows the many existing
  bukti-transfer/nota/progress-photo flows in that same block.
- No file-catalog tables in this app's database (deliberately) — search
  and storage both happen on Filemanager's side.

## 2026-08-27 — KontenAI local Mac Mini footage/render support

Added `storage_provider = 'local_mac'` for `kontenai_assets` (migration
`0246`, widens the check constraint added in `0167` for Google Drive; also
relaxes `public_url` to nullable since a local_mac row has no durable
public URL). Footage bytes for this provider live entirely on the owner's
Mac Mini SSD, indexed by the separate `Filemanager` repo agent (see
`docs/FILE_MANAGER.md`-adjacent context in this CHANGELOG's 2026-08-26
entries) — `kontenai_assets.storage_path` holds Filemanager's own numeric
file id, not a filesystem path, mirroring how `google_drive` rows already
store a Drive file id there.

- `lib/kontenai/asset-source.ts` — new branch: resolves a `local_mac`
  asset via `lib/filemanager/client.ts`'s delivery-link API over
  Filemanager's Cloudflare Tunnel. Works from anywhere (Vercel, a
  Railway-hosted worker, or the Mac Mini itself).
- `scripts/local-mac-asset-resolver.ts` (new, worker-only, never imported
  by `app/`/`features/`) — when `scripts/render-worker.ts` happens to run
  ON the same Mac Mini as the Filemanager agent, reads Filemanager's
  SQLite catalog directly (read-only) to resolve a file id straight to an
  absolute disk path, skipping the network round trip entirely. Falls back
  to the network path automatically if `FILEMANAGER_DB_PATH`/
  `FILEMANAGER_STORAGE_ROOT` aren't set (e.g. still running on Railway).
- `lib/video/render-storyboard.ts` — `RenderScene.assetLocalPath`: when
  set, copies the file directly instead of an HTTP download.
- UI fallout from `public_url` becoming nullable: `AssetThumbnail` and the
  Asset Library preview/download UI now show a generic icon /
  disabled-download state instead of crashing when a local_mac asset (no
  direct public URL) is displayed.
- `render-worker`'s job-claim (`kontenai_render_jobs`, atomic
  `UPDATE ... WHERE status = 'queued'`) was already safe for two workers
  polling concurrently, so this ships without needing to change or pause
  the existing Railway deployment — the Mac Mini worker is additive,
  verified by re-running the full typecheck/lint/build/unit-test suite
  (all green) plus a standalone smoke test of the SQLite resolver logic.
- Deliberately NOT built yet: the "Upload Footage" UI (project/campaign/
  location/tags entry, separate from the plain-document WhatsApp upload
  flow) — flagged as the clear next step once this plumbing is confirmed
  working end-to-end with a real Mac Mini.

## 2026-08-27 — Company File Manager + local Mac Mini footage merged to production

Merged `claude/company-file-manager-8jyo81` into `claude/mk-connect-app-o9zw2p`
(the production branch) and pushed — the 5 commits described in the two
entries above (Filemanager WhatsApp file manager, KontenAI local Mac Mini
footage/render support) were sitting on a feature branch that had never
been merged, which is why the owner's first live test found zero requests
reaching the Mac Mini despite correct env vars on both sides. Root-caused
via `git show origin/claude/mk-connect-app-o9zw2p:lib/ai/domains/file-request.ts`
failing (file didn't exist on the production branch at all).

Full validation re-run on the merged production branch before push
(typecheck/lint/build/unit tests, all green), clean merge with no
conflicts. Migrations `0245_filemanager_wa_upload_permission` and
`0246_kontenai_local_mac_storage_provider` applied directly to the live
Supabase project (`svcmybsziaelwwdrnzcv`) via the Supabase MCP
`apply_migration` tool, each individually verified afterward
(`files.wa_upload` permission exists and is granted to `super_admin`;
`kontenai_assets_storage_provider_check` now allows `local_mac`;
`kontenai_assets.public_url` is nullable). Security advisor re-run found
no new findings attributable to either migration.

The owner's Mac Mini agent is reachable at
`https://mac-mini-zafran.tail59f198.ts.net` via **Tailscale Funnel** — not
Cloudflare Tunnel, which is what `docs/FILE_MANAGER.md`-adjacent guidance
and the Filemanager repo's own README assume throughout. Functionally
equivalent (both just expose the agent's local port over HTTPS), but
worth knowing before trusting any Cloudflare-specific instructions in
those docs literally.

## Villa AI CCTV bridge (2026-08-31)

Added `app/api/villa/ai/cctv-vision` + `lib/ai/domains/villa-cctv-vision.ts`: a bridge endpoint so the separate `villa` repo's AI CCTV checkpoint module can use this app's existing Gemini integration instead of provisioning its own `GEMINI_API_KEY`. Guarded by the same `VILLA_BRIDGE_SECRET` already used by the WhatsApp bridge (`/api/wa/send`). Merged to `claude/mk-connect-app-o9zw2p` and deployed to production same day.

## Markom AI brief tone -- millennial/Gen Z voice (2026-09-01)

Owner feedback: AI-generated Markom content briefs (`researchAndGenerateChecklist`,
`lib/ai/domains/markom.ts`) read too stiff/corporate ("kaku"), not the natural
voice millennial/Gen Z audiences respond to on Instagram/TikTok. Fixed at two
levels since the two together determine the actual daily prompt sent to
Gemini:
1. The deterministic instruction text inside `researchAndGenerateChecklist`
   (both the grounded and no-search fallback prompts) now explicitly requires
   the hook + draft caption to read like a real creator talking to "kamu",
   short sentences, and explicitly forbids press-release/company-profile
   phrasing ("kami dengan bangga", "solusi terbaik untuk kebutuhan Anda").
2. The `markom` system prompt's `[CONTENT PLANNER]` knowledge block (both the
   code fallback in `lib/ai/domains/prompts.ts` and the live
   `ai_system_prompts` DB row, which was byte-identical to that fallback and
   unedited since 2026-07-16) got the same voice/tone bullet added.

The `ai_system_prompts.markom` row was updated directly in production
(`svcmybsziaelwwdrnzcv`) via SQL to match the new code default -- this table
is intentionally live-admin-editable at runtime (`/ai` page,
`ai_module.manage` permission), not migration-tracked, so this is the same
kind of write the admin UI itself performs, not a schema/migration change.
Confirmed with the owner before writing to prod. Only `markom` was touched;
`crm`/`loonars_beauty`/`hr`/`general` prompts are untouched.

Also surfaced during this pass, not yet acted on: Markom's social-media
coverage is Instagram + TikTok only everywhere (`ZernioPlatform`, competitor
schema, content submission schema) with no Facebook/YouTube/LinkedIn/X, and
there is no community-management (comment/DM inbox) feature at all despite
Zernio already being the connected publishing provider.

## Markom AI gap-closers: monthly report + hashtag bank (2026-09-01)

Follow-up to a review of the Markom module against a "Social Media
Specialist" role: two of the identified gaps that are genuinely AI-closeable
with existing infrastructure (Gemini + web search grounding, the
ai_job_queue/cron dispatch pattern, admin-editable system prompts) were
built, following existing patterns exactly rather than introducing new
architecture:

1. **Monthly content performance report**
   (`social_monthly_content_reports`, migration `0251`) -- a rollup of the
   weekly content audits that already existed (`social_weekly_evaluations`,
   0111/0124). Follower growth %, average weekly score, and best/worst week
   are computed in application code (`processSocialMonthlyContentReport`,
   `app/api/ai/process-job/route.ts`) from real snapshot/audit data -- the
   AI (`generateMonthlyContentReportNarrative`, `lib/ai/domains/markom.ts`)
   only narrates and recommends, same "numbers in code, AI narrates" rule
   FRIDAY already follows. Auto-generated on the 1st of each month
   (`social-monthly-content-report` cron), manual trigger via
   `markom_request_monthly_report()` RPC. Property only (leasehold_sales +
   occupancy share one account) for this first pass -- same scope weekly
   evaluation itself started at before Beauty got its own version later.
   UI: `MonthlyReportCard`, Content Planner's Leasehold tab.

2. **Hashtag bank** (`markom_hashtag_bank`, migration `0251`) -- AI-generated
   per (content_focus, platform), following the 30/40/30 broad/medium/niche
   formula already documented in the markom system prompt. Wholesale
   replace on each refresh (never accumulated). `generateHashtagBank`
   (`lib/ai/domains/markom.ts`) covers leasehold_sales/occupancy;
   `generateBeautyHashtagBank` (`lib/ai/domains/loonars-beauty.ts`) is
   Beauty's own version with its own system prompt, same
   property/beauty-knowledge separation already enforced for competitor
   discovery. Auto weekly refresh for all 3 foci x 2 platforms
   (`markom-hashtag-bank-dispatch-weekly` cron), manual trigger via
   `markom_request_hashtag_bank_refresh(focus, platform)` RPC. UI:
   `HashtagBank`, all three Content Planner tabs.

Migration `0251` applied directly to the live Supabase project
(`svcmybsziaelwwdrnzcv`) via the Supabase MCP `apply_migration` tool,
confirmed with the owner first. `types/database.types.ts` is a
hand-authored mirror (not CLI-generated) with specific structural
conventions other code depends on -- patched surgically (new table/RPC
entries only) rather than overwritten with the MCP `generate_typescript_types`
tool's raw output, which reformats the entire file and would have produced
an 18,000+ line diff unrelated to this change.

Two other gaps from the same review (community management / comment-DM
inbox, and social listening beyond what Google Search grounding already
covers) were deliberately NOT built here -- they need the connected
provider's (Zernio) actual API capabilities verified first, which wasn't
possible in this pass. Multi-platform expansion (Facebook/YouTube/LinkedIn/X)
was also flagged as out of scope -- it's an integration gap, not an AI one.

## 2026-09-15 — Loonars 2 (Jogja) siteplan + printable booking receipt

Migration `0261_loonars_2_siteplan_booking_receipt.sql`. Built ON TOP of the
existing native Siteplan feature (0202/0203/0204) rather than as a second
module — block picking, auto-locking, Finance verification and the fee claim
are all pre-existing behaviour and are unchanged.

1. **Loonars 2 project seeded as catalog data** — `loonars_projects` row
   `LNR2` plus 20 units, `AVARA-01..10` and `BANYU-01..10`, grouped with the
   0203 `row_label`/`sort_order` grid layout (two facing rows, numbered from
   the Loonars Coffee/parking entrance inwards) so the siteplan renders
   without an admin row-editor pass. `harga`/`luas`/`tipe` deliberately left
   NULL — the Loonars 2 price list is not in this repository and was not
   guessed; a `siteplan.manage` holder fills them in via `/siteplan/admin`.
   Seed is idempotent (`on conflict do nothing`), verified by re-running it.

2. **Jogja opened up on the siteplan viewer** — `siteplan.view` was scoped to
   Makassar only (`SITEPLAN_MAKASSAR_ONLY_PERMISSIONS` + a
   `branch_id !== MAKASSAR_BRANCH_ID` strip in `getCurrentSession()`).
   Renamed to `SITEPLAN_BRANCH_SCOPED_PERMISSIONS` and driven by a new
   `SITEPLAN_BRANCH_IDS` list (Makassar + Jogja), so Jogja's Sales/Kepala
   Cabang keep the permission. Every other branch is unchanged, and the
   role-level grant was not widened.

3. **Kwitansi Tanda Jadi** (`loonars_booking_receipts`,
   `loonars_receipt_counters`, `loonars_booking_receipt_issue()`) — a
   numbered, audit-stamped booking receipt, printed at
   `/siteplan/kwitansi/[purchaseId]` through the app's existing
   `.print-area`/`.no-print` CSS (browser print-to-PDF, no new PDF
   dependency). Design decisions worth keeping:
   - **The nominal is NOT the pre-printed Rp 5.000.000** the paper form
     carried — it is whatever booking fee the rep entered, per the owner.
   - `amount`/`buyer_name`/`buyer_phone`/`unit_label`/`payment_method` are
     **snapshotted onto the receipt row at issue time**, so a later edit to
     the purchase can't silently change an already-printed document.
   - **Issue is idempotent per purchase** — a reprint returns the identical
     number rather than burning a second one.
   - Numbering is `MKH/LNR/NNNN/YYYY`, per calendar year, allocated by an
     atomic `insert .. on conflict do update .. returning` against
     `loonars_receipt_counters` — deliberately NOT `max(seq)+1`, which would
     hand two simultaneous reps the same number. Counter table has RLS on
     with **no policies**: only the security-definer function reaches it.
   - Refused for non-`booking` transaction types, rejected purchases, and
     purchases with no `booking_fee`.
   - `terbilang` (the spelled-out rupiah line) is computed in application
     code (`lib/utils/terbilang.ts`) from the same stored `amount` the
     digits render from, so words and figures can never disagree. Unit
     tested (`tests/unit/lib/terbilang.test.ts`).

**Verified before commit** by applying `0261` to a throwaway local Postgres 16
against stub definitions of the tables it depends on: migration applies clean,
seed produces exactly 10+10 units and is a no-op on re-run, reissue returns the
same number, sequence advances across purchases, all four refusal paths raise,
and 8 concurrent issues produced 8 distinct gapless numbers. Also
typecheck + lint + 243 unit tests + `next build` clean.

**Applied directly to the live production database** (`svcmybsziaelwwdrnzcv`)
2026-09-15 via Supabase MCP `apply_migration`, per the owner's explicit
go-ahead in chat ("sekarang bawa ke production mkhsistem"). Pre-flight
checks before applying: confirmed the project ref against
PROJECT_CONTEXT.md, diffed `loonars_projects`/`loonars_units`/
`loonars_unit_purchases`' live column shapes against what the migration
assumes (identical), confirmed no existing project used the `LNR2` kode
(only `Cendana` existed), and confirmed `MAKASSAR_BRANCH_ID`/
`JOGJA_BRANCH_ID` resolve to the real Makassar/Jogja branch rows. Verified
post-apply: 20 units (10 AVARA + 10 BANYU) under `LNR2`, `authenticated`
can execute `loonars_booking_receipt_issue`, zero receipts/counter rows
(nothing fabricated), and the security advisor's only new finding is the
intentional one (`loonars_receipt_counters` has RLS with no policies by
design — only the security-definer function touches it). Confirmed 2 Sales
+ 1 Kepala Cabang already sit in the Jogja branch and will pick up
`siteplan.view` once this branch deploys. **No test purchase or receipt
was created against production** — doing so would have flipped a real
unit's status and printed a fake receipt number, so the RPC itself was
verified only in the earlier local-Postgres pass, not against prod.

**Real logos added** (same day, follow-up commit): the header's typographic
MKH/Loonars wordmarks were replaced with the owner's actual logo files
(`public/branding/logo-mkh.png`, `logo-loonars.png`, plus a cropped
`logo-loonars-icon.png` used as a faint bottom-right watermark), and the "A
BETTER LIVING / BEGINS HERE" side note + solid dark footer bar were added
to close the remaining gaps against the reference photo. Verified by
rendering the component's exact markup against the project's own built
Tailwind CSS and screenshotting it with Playwright for a side-by-side
comparison, not from memory. Not reproduced: the paper form's diagonal
cursive "Invest in a Better Living" script and its large pale background
leaf outline — doing so would need a new script font import, left for the
owner to decide rather than added silently.

**Still open:** the Loonars 2 unit prices (`harga`/`luas`/`tipe`) are NULL
and need filling in at `/siteplan/admin`.

## Documentation history (existing docs, for reference)

`docs/AUTOMATION.md` and `docs/BACKUP.md` are themselves existing,
maintained project documents (not created by this audit) — both describe
themselves as verified against the live production database/project at the
time they were last updated. Their own git history (not separately
reproduced here) is the authoritative changelog for the automation
inventory and backup procedure specifically.
