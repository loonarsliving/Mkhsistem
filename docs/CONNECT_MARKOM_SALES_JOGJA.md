# Loonars Connect — Markom Jogja & Sales Jogja

Second and third departments on the Loonars Connect chat (`/chat`), after
Hospitality (`docs/HOSPITALITY_CONNECT.md`). Migration
`0294_loonars_connect_markom_sales_jogja.sql`. Built 2026-10-24. **Jogja only.**

Owner's decisions (2026-10-24):

- Markom builds its **content calendar inside the group chat**.
- **Markom has no manager.** Any Markom member plans and moves content forward.
- KOL room use and the KOL voucher need **Rebecca's approval only**. Rebecca
  joins the Markom group for this (group role `room_approver`), because it
  concerns villa rooms.
- Group members are named by the owner: Markom = Syifa, Andiko; Sales =
  Fety, Ayu, Wahyudha. Other JOG employees of those divisions (e.g. Alya,
  Nyarso) are not in the groups.
- Sales Jogja sells **Loonars 2 units only**.
- Vando (Kepala Cabang Jogja) is the Sales group's `manager`.

Each department has the same shape as Hospitality:

- an operational group ("Markom Jogja" / "Sales Jogja");
- an owner feed ("Laporan Markom Jogja" / "Laporan Sales Jogja"), readable
  with `hospitality.owner_report`;
- an end-of-day report at **20:00 WIB**.

## Membership

Membership is **explicit only** (`mkc_chat_role_assignments`, no division
mapping):

| Group | Members (group role) |
|---|---|
| Markom Jogja | Syifa, Andiko (`markom`); Rebecca (`room_approver`) |
| Sales Jogja | Fety, Ayu, Wahyudha (`sales`); Vando (`manager`) |

Adding or removing someone means inserting a row or setting `revoked_at` on
it; the 5-minute membership sync applies the change. These rows are **data,
not part of the migration**.

`mkc_chat_division_roles` also gained an optional `branch_id`, because the
divisions are company-wide. `mkc_chat_desired_members()` honours it, but 0294
seeds no division mapping for these two departments. Hospitality's mapping
has `branch_id = null`, so its behaviour is unchanged.

The sync job posts **every** new JOG CRM lead to the Sales group. A lead the
CRM round-robin assigns to a sales person outside the group, such as Nyarso,
still appears in the group, but only that person or Vando can act on it.

## Markom Jogja

The "+" menu offers two items: **Rencana konten** and **Kolaborasi KOL**. The
work panel ("Kalender & KOL") shows:

- late content;
- the next 14 days, including days with nothing planned;
- KOLs waiting for Rebecca;
- running KOLs.

**Content calendar** (`mkc_mkt_content_plans`):

- Statuses: planned → in_production → ready → published (needs the live
  https link) or cancelled (needs a reason).
- Reschedule and reassign PIC are available. The PIC must be a Markom member
  of the group and is notified.
- Only `markom` members can act (RPC `mkc_mkt_content_update`).

**KOL** (`mkc_mkt_kol_collabs`):

1. A Markom member submits the request: handle, platform, followers, niche,
   compensation, requested check-in, 1–7 nights and deliverables. Rebecca is
   notified.
2. Rebecca approves (`mkc_mkt_kol_decide`, role `room_approver` only). She
   picks the unit, the check-in date and the number of nights.
   - The RPC refuses if that unit has an overlapping `terjadwal`/`checkin`
     booking or a maintenance closure in the villa app.
   - If the unit is free, it inserts the voucher into the villa app's
     `villa_kol_vouchers`, exactly as villa-api `/bridge/kol` does:
     - code `KOL-` + 6 characters, retried on collision;
     - `malam_gratis` = number of nights;
     - valid for check-in for 3 months (or until the check-in date, if later);
     - `dibuat_lewat = 'mkconnect'`.
   - The code is shown to her and posted in the group.
   - Rebecca can also reject, which requires a reason.
3. The KOL books on loonars.id with the code. Redemption is unchanged.
4. The sync job (every 10 min) follows `bookings.kol_voucher_id`:
   - booking `terjadwal` → `booked`; it also flags a booking whose unit or
     date differs from what was approved;
   - booking `checkin` → `staying`;
   - booking `checkout` → `content_due`, due on checkout + `kol_content_due_days`
     (7 by default);
   - booking `batal` → back to `approved`.
5. Markom posts the link for each deliverable. When every deliverable has a
   link, the KOL is `completed`.
6. Cancelling a KOL that hasn't booked deactivates its unused voucher.

**Report (20:00):**

- today's planned vs published content;
- late content;
- empty days in the coming week;
- KOLs waiting for Rebecca, flagged once they pass `kol_decision_target_hours`
  (24 h);
- KOLs that owe content past their due date;
- expired unused vouchers;
- KOL room nights approved this month;
- the existing auto-publish pipeline's published/failed counts.

Views and reach are **not** included: they are not read from the platforms,
and they are never estimated.

## Sales Jogja (Loonars 2)

**The CRM stays the record.** The chat writes leads and follow-ups only
through the CRM's own RPCs (`crm_create_prospect`, `crm_add_follow_up`), so
the CRM's permission, ownership, duplicate and status rules apply. A customer's
phone number is never posted in the group or returned to the chat UI
(`mkc_sales_cards` / `mkc_sales_open_work` leave it out). "Buka di CRM" links
to `/crm/[id]`.

The "+" menu has three items:

- **Lead baru**: creates the lead in the CRM, then posts its card.
- **Follow-up / jadwalkan kunjungan**: opens the panel.
- **Laporan harian**: `sales` role only, once a day. It has a 3-point
  checklist plus the sales person's own counts.

The work panel ("Lead & kunjungan") shows:

- Loonars 2 unit status from the siteplan;
- scheduled site visits;
- active leads from the last 90 days, overdue first;
- a "Lead saya saja" filter for sales.

**Acting on a lead:** a sales person can act on their own leads; the `manager`
can act on any lead in the branch (`mkc_sales_prospect_access`). There are two
actions:

- **Follow-up**: logged in the CRM as today's activity.
- **Kunjungan lokasi**: schedules a visit. Recording the result `done` also
  logs a CRM `site_visit` follow-up.

**Overdue rule:**

- first contact within `lead_first_contact_hours` (24 h) of creation;
- after that, a follow-up every `lead_stale_days` (3 days);
- only red, yellow and green leads count.

**Sync job (every 10 min):**

- New JOG CRM leads created after the department existed (ads routing, CRM
  page) are posted once, and the assigned sales person is notified.
- Loonars 2 booking status changes (pending verification / verified /
  rejected by Finance) are posted once each.

**Report (20:00):**

- new leads;
- overdue leads, broken down per sales person;
- hot prospects;
- CRM follow-ups;
- visits done;
- unreported past visits;
- Loonars 2 units available;
- bookings verified this month;
- bookings waiting for Finance;
- daily reports received and missing (once the 19:00 due time has passed);
- per sales person: follow-ups, daily report, and verified bookings against
  the monthly target. The target shows "not set" when there is none.

## Live report in the owner feed

The top of "Laporan Markom Jogja" and "Laporan Sales Jogja" shows a **live
report for today so far**. It uses the same snapshot RPC and the same
`lib/connect/*-report.ts` rules as the 20:00 report, through
`buildConnectReport()`, but it is computed on request and **not stored**. The
20:00 report stays the daily record.

- `loadLiveReportAction` (owner only) runs the KOL and Sales source syncs
  first, so new CRM leads and KOL bookings are counted.
- The card refreshes on realtime activity, at most once every 15 s. The
  activity it reacts to is changes to content plans, KOLs and visits.
- It also refreshes every minute, because CRM leads have no realtime, and
  when the tab becomes visible again.

## Realtime + WhatsApp-style chat push (0297)

**Chat push**
- Every message a person sends in an operational group (text, photo, or a
  card they created) creates a `chat_message` notification for each of the
  group's other active members.
- The existing push pipeline (`mkc_notifications` trigger →
  `/api/push/send` → `public/sw.js`) shows it like WhatsApp:
  - "Sender · Group" as the title and the message as the body;
  - one notification per conversation (tag `chat-<id>`), which each new
    message replaces and re-alerts;
  - the unread total (`mkc_chat_unread_total`) as the app-icon badge.
- The rows are stored `archived`, so chat doesn't flood the bell.
- `chat_message` is not on the WhatsApp-relay allowlist, so no WhatsApp
  message is sent.
- The trigger is deferred to commit and skips anyone a workflow
  notification already reached in the same transaction, so there are no
  double pushes. Errors never block a message.

**In the app**
- A message in another conversation shows an in-app banner with "Buka".
- The app-icon badge follows the unread total.
- Opening a conversation clears its phone notifications.
- The chat list offers "Aktifkan notifikasi". iPhone only grants permission
  from a tap, and only for a home-screen app; the banner says so.

**Realtime pulse**
- `mkc_connect_pulse` (realtime, readable like the department) is bumped by
  deferred, error-safe triggers on:
  - CRM leads and follow-ups;
  - Loonars 2 bookings;
  - sales visits and daily reports;
  - Markom content plans and KOLs;
  - KOL-voucher villa bookings.
- The same triggers run the Sales / KOL group sync, so a new lead or a KOL
  check-in reaches the group at once.
- The live report refreshes within about 5 s of a pulse. The minute poll and
  the 10-minute cron stay as safety nets.

## Koordinasi Jogja: the cross-team group (0298)

One group where the teams talk to each other, as the owner chose:
Hospitality, Markom Jogja and Sales Jogja, with the owner as a member.

- **Department** `koordinasi_jogja`:
  - no workflow, no owner feed, no report;
  - text, photos and the 0297 WhatsApp-style push only.
- **Members are derived, never maintained by hand:**
  - `settings.member_of` lists the source departments, and everyone in
    their operational groups is a `member`;
  - `settings.include_owners` adds the owners.
  - `mkc_chat_desired_members()` computes this from the source
    departments' own desired members, so one membership sync is enough.
    Joining or leaving a team updates Koordinasi Jogja too.
- **Access:** a member of Koordinasi still can't read another team's
  group. They only share the Koordinasi group.
- **UI:** `departmentKind()` returns `koordinasi`, which hides the "+"
  menu and the work panel.

## Rules carried over from Hospitality

- Numbers are computed in code (`lib/connect/*-report.ts`) from SQL snapshots
  (`mkc_mkt_report_snapshot` / `mkc_sales_report_snapshot`).
- A failed source is shown as `?` with the reason, never as 0.
- Writes go only through security-definer RPCs that check the caller's group
  role. RLS select policies use `mkc_hosp_can_view_department`. There are no
  insert/update policies.
- Reports use the same idempotent begin/finish/fail tables
  (`mkc_hosp_reports`). The 15-minute dispatcher and the "Buat laporan
  sekarang" button route by department code (`lib/hospitality/report-generator.ts`).
  That button is for the owner, or the group's manager (none for Markom).

## Known prerequisite

`crm_create_prospect` / `crm_add_follow_up` need the CRM permissions
(`prospect.create`, `prospect.follow_up_create`), which come from the app
role. A Sales group member whose app role is `staff` gets the CRM's
permission error when adding a lead or follow-up. On 2026-10-24 the owner
approved changing Fety's app role from `staff` to `sales`.

## Tests

- Unit: `tests/unit/lib/connect-reports.test.ts` (report engines, plus a drift
  check of the daily checklist keys against 0294);
  `tests/unit/schemas/connect.schema.test.ts` (inputs, plus a drift check of
  the content/KOL lists against the 0294 CHECK constraints).
- SQL: `tests/sql/0291_hospitality/behavior_0294.sql`, seeded by
  `seed_0294.sql` on top of the Hospitality stubs. It checks RPC roles,
  Rebecca-only approval, voucher creation and overlap refusal, the booking
  sync, CRM write-through and phone-free cards, the branch filter and
  snapshots.

## Markom inside the Hospitality group (0302)

- Hospitality's `settings.member_of = ['markom_jogja']`: the Markom Jogja team
  is in the Hospitality group as `member` (talk, read, report an issue; no
  cleaning / FO / security role). Membership follows the Markom group.
- Markom Jogja's `settings.mirror_kol_to = 'hospitality'`: every KOL message
  in the Markom group is copied once into the Hospitality group
  (`payload.mirrored_from`, dedupe `mirror:<id>`), keeping its sender, so a
  new room request pushes to the Hospitality team. Remove the key to stop.

## WhatsApp ad leads answered from Chat (0303)

Owner's request (2026-10-25): every WhatsApp conversation with a customer who
came from a Meta ad for the Jogja branch should live in the system, so the
sales person answers from Loonars Connect and the owner can watch it.

- **Scope**: department `lead_wa_jogja` (`settings.kind = 'wa_lead'`,
  `campaign_branch_codes = ['JOG']`). A customer opens a lead when their
  first message carries a Meta ad of a JOG campaign (or, when the ad data is
  missing, after they pick a JOG project in lead-nurture's project
  selection). Later messages from the same number join the open lead, with or
  without an ad. Other branches keep the existing flow unchanged.
- **Rotation**: the department's active `sales` role assignments, least
  recently served first (`mkc_wa_lead_pick_sales`). A customer who already is a
  prospect keeps their sales person if that person is in the rotation. The CRM
  `crm_sales_rotation` flags do not apply here. People are set as data, not
  in the migration: `sales` (the rotation) and `manager` (lead monitor).
- **Greeting**: the first message of a new lead gets `settings.greeting` once,
  sent from the system's WhatsApp number (Whacenter) and recorded in the chat
  as "Pesan otomatis". No AI / nurture reply ever goes to a captured lead
  (the capture runs in `webhook-handler.ts` right after the refund chat, and
  first in `resolveProjectSelectionAndNurture`). The WhatsApp Business app's
  own greeting / away message on the Whacenter phone must be switched off by
  hand, otherwise the customer gets two greetings.
- **Conversation**: one `direct` conversation per lead (`direct_key
  wa:<lead id>`), the assigned sales person as its only member. Customer
  messages: `sender_id null`, `payload.wa = 'in'` (+ `media_url` for a photo,
  shown as a link because the app's CSP blocks external images). Sales replies
  go through `mkc_wa_lead_queue_out` (assigned sales only; plain
  `mkc_chat_send_message` rejects lead conversations), are sent on WhatsApp
  by `sendWaLeadMessageAction` (text, or photos via `createWaMediaUrl`) and
  marked `wa_status` sent / failed. A reply also sets the prospect's
  `last_follow_up_at`, which stops the existing 30-minute CRM escalation.
- **Monitors** (owner with `monitor_owners`, plus `manager` assignments): read
  every lead (`mkc_chat_can_read`), see "Lead WA Jogja" in the chat list with
  per-sales numbers (`mkc_wa_lead_stats`: leads today / 7 days, waiting,
  oldest wait, average first reply) and can move a lead to another sales
  person in the rotation (`mkc_wa_lead_reassign`). They cannot reply.
- **Alerts**: `connect-wa-lead-reply-alerts` (every 2 min,
  `mkc_wa_lead_alerts`) warns the sales person after
  `alert_sales_minutes` (15) and the monitors after `alert_monitor_minutes`
  (30) of an unanswered customer message, once per wait. Warning only; the
  lead is never moved automatically.
- **Retention**: photos follow the 30-day chat retention
  (`settings.retention_days`).
