# Integration tests

These tests run against the **live** MK Connect Supabase project — no mocking,
no local Postgres. They sign in as real seeded test employees and exercise
actual RLS policies and RPC functions.

## Why they don't run in local sandboxes

This project was built in a network-sandboxed dev container that only allows
outbound HTTPS to an explicit allowlist. `*.supabase.co` is not on it, so
`npm run test:integration` will fail with connection errors there — that is
expected, not a bug. These tests are designed to run in GitHub Actions
(`.github/workflows/ci.yml`), which has unrestricted outbound network access.

## Required environment variables

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://svcmybsziaelwwdrnzcv.supabase.co` (not secret — public project URL) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The project's anon key (not secret — meant to be public) |
| `TEST_STAFF_EMAIL` / `TEST_STAFF_PASSWORD` | Seeded `staff`-role test account (`TEST-STAFF-001`, zero elevated permissions) |
| `TEST_HR_EMAIL` / `TEST_HR_PASSWORD` | Seeded `hr`-role test account (`TEST-HR-001`, used to test elevated-permission paths and to clean up test data) |

Both test accounts were created specifically for CI — they have no relation to
real employees and are safe to rotate at any time. To rotate: sign in to the
Supabase Dashboard → Authentication → Users, reset the password for
`test.staff@haluoleo.id` / `test.hr@haluoleo.id`, then update the CI
environment values in `.github/workflows/ci.yml`.

## What's covered

- `rls.integration.test.ts` — anonymous access is blocked; a staff account can
  only see its own data; an HR account can see company-wide data; permission
  RPCs (`app_has_permission`) resolve correctly per role.
- `attendance.integration.test.ts` — real check-in/check-out RPC calls,
  duplicate-check-in/out rejection, cleanup via the HR account afterward so
  the suite is safely re-runnable.
- `memo.integration.test.ts` — memo creation with targeting via `create_memo`,
  audience-based visibility, read-receipt tracking via `mark_memo_read`.
