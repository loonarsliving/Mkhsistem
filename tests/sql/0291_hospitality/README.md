# 0291 Loonars Connect — SQL behavior suite

Exercises migration `0291_loonars_connect_hospitality_chat.sql` end to end
against a throwaway local Postgres 16 (no Supabase needed): membership sync,
RLS for members / non-members / owner, the cleaning → FO inspection →
room-ready transition into the villa tables, villa-side closures and
conflicts, security reports, critical escalation, issue permissions,
retention-hold rules, report idempotency, and the villa snapshot's
per-source failure reporting.

`stubs.sql` stands in for the Supabase platform (auth.uid(), storage, cron,
realtime publication) and for the existing MK Connect / villa tables, with
columns mirrored from the live schema. It is NOT a migration.

```sh
createdb t
psql -d t -f tests/sql/0291_hospitality/stubs.sql
for f in supabase/migrations/029[1-9]_loonars_connect*.sql supabase/migrations/030*_loonars_connect*.sql; do psql -d t -v ON_ERROR_STOP=1 -f "$f"; done
psql -d t -f tests/sql/0291_hospitality/behavior_test.sql   # prints PASS/FAIL per check
```

Last run (2026-10-25, incl. 0295–0301): 110 passed, 0 failed (27 of them for
0300 direct chat: scope, one chat per pair, privacy incl. the owner, push,
membership sync, 30-day photo expiry; 6 for 0301 replies).

## 0294 (Markom Jogja + Sales Jogja)

On a separate fresh DB: `stubs.sql`, then `seed_0294.sql`, then migrations
0291..0298, then `behavior_0294.sql`. Last run (2026-10-24): 50 passed, 0 failed.

## 0303 (WhatsApp ad leads)

`behavior_0303.sql` runs on the same DB as `behavior_test.sql` (stubs +
migrations 0291..0303; it seeds its own campaign / project / sales rows).
Covers scope (JOG ad / project only), rotation, follow-ups joining the open
lead, the one-time greeting, privacy (other sales, non-monitors), monitors,
queue_out, reassign, the 15 / 30-minute alerts, an existing prospect keeping
its sales person, and grants. Last run (2026-10-25): 41 passed, 0 failed
(behavior_test 110/110, behavior_0294 56/56 on the same migrations).

## 0304 (ad clicks recognised by the pre-filled message)

`behavior_0304.sql` on a fresh DB (stubs + migrations 0291..0304). Last run
(2026-10-25): 18 passed, 0 failed (with 110/110, 56/56, 41/41 on the same
migrations).
