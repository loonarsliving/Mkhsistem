# Loonars Connect — Phase 1 (Hospitality)

In-app replacement for the internal Hospitality WhatsApp group, at
**`/chat`** in MK Connect (`https://mkh.haluoleo.id/chat`). Migration
`0291_loonars_connect_hospitality_chat.sql`. Built 2026-10-23.

Three parts:

1. **Operational group "Hospitality Loonars"** — members only (Hospitality
   Manager, Front Office, Cleaning, Security). Text + photos, plus structured
   cards: room cleaning tasks, cleaning checklist, FO room inspection, security
   reports, issues/incidents, system status lines.
2. **Owner feed "Laporan Hospitality"** — consolidated report cards
   (morning / afternoon / end of day) and immediate critical alerts. Readable
   with `hospitality.owner_report` (super_admin); the owner is **not** a
   group member and never sees raw staff conversation.
3. **Extensible shape** — `mkc_chat_departments` → operational group +
   owner feed → structured records → report. `hospitality` was the first
   department; Markom Jogja and Sales Jogja followed in 0294
   (`docs/CONNECT_MARKOM_SALES_JOGJA.md`). Each department needs its own
   division mapping, workflow RPCs and report computation; the chat
   tables/UI are reused.

## Home-screen shortcut

`/chat` links its own manifest (`app/chat-manifest.webmanifest`, `start_url`
`/chat`, `id` `/chat`) via `app/(app)/chat/layout.tsx`; every other page keeps
the root manifest (`start_url` `/`). Before this (2026-10-24) an "Add to Home
Screen" from /chat opened the dashboard. A shortcut added before the fix keeps
the old start_url: delete it and add it again from /chat.

## Source of truth — what is read, what is written

| Data | Owner | MK Connect does |
|---|---|---|
| Units / room status (`units.status`: available, occupied, dirty) | villa app | read; one guarded write (below) |
| Reservations / check-in / check-out (`bookings`) | villa app (+ Cloudbeds sync) | read unit ids, timestamps only — no guest data |
| Housekeeping tasks (`housekeeping`, created by `villa_commit_checkout`) | villa app | read; one guarded write (below) |
| Room maintenance / Cloudbeds blocks (`villa_room_maintenance`) | villa app | read only |
| Chat, checklists, issues, reports, evidence metadata | MK Connect (`mkc_chat_*`, `mkc_hosp_*`) | owns |

**Room workflow** (follows the villa app's existing rules, adds the FO gate):

1. Guest checks out in the villa app → unit `dirty` + `housekeeping` row
   (`jenis='bersih'`, `pending`). Unchanged.
2. `mkc_hosp_sync_room_tasks()` (at villa checkout / room-cleaned commit via deferred triggers on `units` + `housekeeping` (0296), plus pg_cron every 5 min and on `/chat` load)
   creates one room task per such row whose unit is `dirty`. Cleaning gets a
   notification.
3. Cleaning: **Mulai** → **Checklist** (all 9 items) → task
   `awaiting_inspection`; FO is notified.
4. FO: **Periksa Kamar** — 7 items + 3 mandatory photos (bed, bathroom,
   main room; configurable) and a decision:
   - *Siap dijual* → performs exactly villa-api `PATCH /housekeeping/done`
     for a `bersih` task: `housekeeping.status='done'` and
     `units.status` `dirty`→`available`. Guarded: refuses if the
     housekeeping row is no longer pending or the unit is no longer `dirty`.
     (villa-api only accepts villa-app sessions, so MK Connect cannot call
     that endpoint; it mirrors its two updates and nothing else — that
     endpoint makes no Cloudbeds call either.)
   - *Bersihkan ulang* → back to Cleaning (`rework_count` +1).
   - *Perlu perbaikan* → task `blocked` + a high-severity issue; the room
     stays `dirty` (not sellable). Closing it in Cloudbeds stays in the villa
     app's **Kamar Maintenance** menu.
5. If the Front Desk marks the room clean in the villa app instead, the task
   closes as `completion_source='villa_app'` and the owner report lists it as
   *selesai tanpa verifikasi FO*. The existing villa workflow is not blocked.
6. If villa data stops matching an open task (unit checked in, row deleted),
   the task gets a `conflict_note`; shown on the card and in the report.

The Hospitality Manager is notified of exceptions (blocked task, failed
inspection, critical incident) but is not a required approval step.

## Roles

No parallel permission system. Two layers:

- **RBAC** (`role_permissions`): `hospitality.owner_report` → super_admin.
  `chat.view` is session-derived (nav entry only) for active group members
  and owner-feed holders (`lib/rbac/session.ts`).
- **Group role** (`mkc_chat_members.member_role`), derived from data:
  - LPL division → role via `mkc_chat_division_roles`:
    `LPL-FO`→front_office, `LPL-SEC`→security, `LPL-CLN`→cleaning (division
    added by 0291), `LPL-HEAD`→manager.
  - Explicit `mkc_chat_role_assignments` row (wins over division) — e.g. the
    Hospitality Manager whose employee record is in another branch.
  - Only approved, active, non-deleted employees. Membership re-syncs on
    any employee approval/move/deactivation (trigger), never hard-deletes.

| Action | manager | front_office | cleaning | security | owner |
|---|---|---|---|---|---|
| Read/send in group | ✓ | ✓ | ✓ | ✓ | — |
| Start / submit cleaning | ✓ | | ✓ | | |
| FO inspection (release room) | ✓ | ✓ | | | |
| Assign room task | ✓ | ✓ | | | |
| Mark task blocked | ✓ | ✓ | ✓ | | |
| Security reports | ✓ | late check-in only | | ✓ | |
| Report issue | ✓ | ✓ | ✓ | ✓ | |
| Resolve issue | ✓ | assignee | assignee | assignee | |
| Cancel issue (reason required) | ✓ | | | | |
| Owner feed, all records read-only, acknowledge | | | | | ✓ |
| Retention hold on incident evidence | ✓ | | | | ✓ |

Every rule above is enforced inside the security-definer RPCs and RLS
(verified by `tests/sql/0291_hospitality`), not by the UI.

## Owner report

Computed in `lib/hospitality/report.ts` (pure, unit-tested), generated by
`lib/hospitality/report-generator.ts`. Metric sources:

| Metric | Source |
|---|---|
| Total units | `units` (villa) |
| Ready for sale (physical) | `units.status='available'` minus units in active `villa_room_maintenance` |
| Occupied | `units.status='occupied'` (cross-checked with `bookings.status='checkin'`) |
| Not ready | dirty + maintenance + any other non-available status |
| Check-ins / check-outs | `bookings.checkin_at` / `checkout_at` inside the report window, excluding `batal` |
| Open room tasks / overdue | `mkc_hosp_room_tasks` (`target_at`) |
| Open issues / critical / guest complaints / unassigned | `mkc_hosp_issues` |
| Missing staff reports | `settings.required_reports` vs `mkc_hosp_checklists` (only after their due time) |
| Stale / failed integrations | `cron.job_run_details` for `villa-sync-cloudbeds-reservations`, `hospitality-sync-room-tasks` |
| Failed / missed scheduled reports | `mkc_hosp_reports` |
| Revenue | **not included** — no agreed definition for an operational report yet |

A source that fails returns `value: null` with the reason (shown as **?**),
never 0. Cloudbeds blocks created directly in Cloudbeds are not readable from
the database — stated on every card.

Windows (department timezone, default `Asia/Jakarta`): morning = since last
night's end-of-day time; afternoon = since this morning's time; end of day /
manual = whole local day. Times in `mkc_chat_departments.settings.report_times`
(default 08:00 / 14:00 / 21:00).

**Schedule:** pg_cron `hospitality-report-dispatch` (`7,22,37,52 * * * *`) →
`automation_post('/api/hospitality/reports/dispatch')` (CRON_SECRET). A period
is generated once it is due and at most 3 h late; `mkc_hosp_report_begin()`
makes it idempotent (one card per department/date/period, failures retried up
to 3×, each failure posted to the owner feed). Slots that never ran appear in
the next report. Owner and Hospitality Manager can also press *Buat laporan
sekarang* (manual, not deduplicated).

**Critical alerts:** an issue with a severity in
`settings.alert_severities` (default `critical`) immediately notifies the
group's manager(s) and every owner-feed holder (`mkc_notifications` →
existing web push trigger, and `hospitality_critical_alert` is on the
WhatsApp relay allowlist) and posts an alert card in the owner feed.

## Direct (1-on-1) chat (0300)

- Anyone in scope can start a chat with anyone else in scope: active
  employees of the Jogja (JOG) and Loonars Private Living (LPL) branches, plus
  the owners. Scope lives in `mkc_chat_departments.settings.direct_scope` of
  the technical department `pesan_pribadi` (`branch_codes`, `include_owners`),
  so it can be widened without a deploy.
- One conversation per pair (`mkc_chat_conversations.direct_key`), kind
  `direct`, two members with source `direct`. Same text / photo / push /
  unread / realtime pipeline as the groups; photos expire after 30 days.
- Only the two members can read it — not the owner. The owner's
  department-wide access (`mkc_hosp_can_view_department`) excludes the
  private department, and the member / attachment / storage policies look up
  the department with `mkc_chat_conversation_department()` (security
  definer) instead of an RLS subquery that returned NULL.
- Group membership sync never removes direct members. Someone who leaves the
  company loses access (`mkc_chat_employee_eligible`); someone who moves to
  another branch keeps existing chats but can no longer start new ones.

## Evidence storage & 30-day retention

- Private bucket `hospitality-evidence` (10 MB, jpeg/png/webp/pdf). Browser
  uploads straight to `<conversation>/<own uid>/…` (storage RLS checks both),
  then `mkc_chat_register_attachment()` records it. `expires_at` is set by a
  trigger to upload + `settings.retention_days` (30) — the client cannot set it.
- Read: signed URLs (1 h) only, under the same membership/owner RLS. No public URLs.
- `/api/hospitality/retention` (pg_cron `hospitality-evidence-retention`,
  hourly at :40) removes expired objects through the Storage API, confirms
  absence for any object not reported as removed, stamps `deleted_at`, records
  failures (`delete_attempts`, `last_delete_error`, backoff 1 h→24 h) and logs
  each run in `mkc_chat_retention_runs`. Deleted files render as
  "kedaluwarsa"; messages, checklists, issues, reports and audit rows stay.
- Retention hold: only for evidence linked to an issue, by owner or
  Hospitality Manager, with a reason, max `max_retention_hold_days` (180),
  written to `audit_logs`.

## Verification status (2026-10-23)

- SQL behaviour suite (`tests/sql/0291_hospitality`, local Postgres 16): 66/66.
- Unit tests: report calculations, missing data, schedule/windows,
  idempotency inputs, retention selection, checklist drift vs SQL, schemas,
  cron-route public paths.
- **Not yet verified in production** (requires applying 0291 + deploying):
  realtime delivery, scheduled reports actually firing, real Storage object
  deletion, WhatsApp relay of critical alerts. See CURRENT_STATE.md.
