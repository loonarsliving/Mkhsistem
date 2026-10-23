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
psql -d t -v ON_ERROR_STOP=1 -f supabase/migrations/0291_loonars_connect_hospitality_chat.sql
psql -d t -f tests/sql/0291_hospitality/behavior_test.sql   # prints PASS/FAIL per check
```

Last run (2026-10-23): 66 passed, 0 failed.
