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

## Documentation history (existing docs, for reference)

`docs/AUTOMATION.md` and `docs/BACKUP.md` are themselves existing,
maintained project documents (not created by this audit) — both describe
themselves as verified against the live production database/project at the
time they were last updated. Their own git history (not separately
reproduced here) is the authoritative changelog for the automation
inventory and backup procedure specifically.
