# Database Backup & Recovery

## Current state — read this first

MK Connect's database (`svcmybsziaelwwdrnzcv`) runs on Supabase's **Free
plan**, evidenced directly by the organization's project-creation limit (2
active free projects) hit during setup. Supabase's own automated backups
work like this:

| Plan | What Supabase provides automatically |
|---|---|
| Free | **Nothing.** No scheduled backups, no PITR. |
| Pro ($25/mo+) | Daily backups, 7-day retention, restorable from the Dashboard. |
| Team / Enterprise | Point-in-Time Recovery (restore to any second within the retention window). |

**This means on the current plan, if the database is lost or corrupted,
there is no built-in way to recover it — full stop.** Two options, not
mutually exclusive:

1. **Upgrade the Supabase organization to Pro.** The single highest-leverage
   fix; takes minutes in the Dashboard, no code changes. Recommended before
   this system holds real payroll-adjacent data (attendance, leave records).
2. **Self-managed backups** (this document + `.github/workflows/backup.yml`),
   which work regardless of plan and give you an off-platform copy Supabase
   itself doesn't have access to.

Both together is the correct answer for a system PT Maha Karya Haluoleo
actually depends on operationally.

## What's implemented here

`scripts/backup-database.ts` runs `pg_dump` against the `public` schema
(the application data — not Supabase's own `auth`/`storage` system schemas,
which aren't meaningfully restorable from a dump anyway), gzips it, and
encrypts it with `gpg` (AES-256, symmetric passphrase) before it ever touches
disk as a permanent artifact. Encryption is not optional in practice: the
dump contains employee PII (names, emails, phone numbers, attendance GPS
coordinates), and this repository is **public**, so anything committed or
uploaded unencrypted here is world-readable.

`.github/workflows/backup.yml` runs this daily at 18:00 UTC (02:00 WITA,
after every branch's working hours) and uploads the encrypted dump as a
30-day-retained GitHub Actions artifact — an off-platform copy independent of
Supabase's own infrastructure.

## One-time setup required

The workflow is deployed but **inert** until two secrets exist
(`Settings → Secrets and variables → Actions` on the repo):

| Secret | Where to get it |
|---|---|
| `SUPABASE_DB_URL` | Supabase Dashboard → Project Settings → Database → Connection string → **URI** (session pooler form). Contains the database password — treat it exactly like a root credential. |
| `BACKUP_ENCRYPTION_KEY` | Generate one: `openssl rand -base64 32`. Store this **outside** GitHub too (password manager) — if it's lost, existing backups become unrecoverable. |

Until both exist, the workflow runs on schedule, logs a warning, and exits
cleanly (it does not fail CI or send failure notifications) — see the
`check` step in `backup.yml`.

## Restoring from a backup

```bash
# Download the artifact from the Actions run, then:
gpg --batch --yes --passphrase "$BACKUP_ENCRYPTION_KEY" -d mk-connect-<timestamp>.sql.gz.gpg \
  | gunzip \
  | psql "$SUPABASE_DB_URL"
```

Restoring into the *same* project will conflict with existing data (primary
keys, unique constraints). For disaster recovery, restore into a fresh
Supabase project's empty `public` schema instead, then repoint the
application's environment variables at it.

## Manual / on-demand backup

```bash
SUPABASE_DB_URL="postgresql://postgres:...@db.svcmybsziaelwwdrnzcv.supabase.co:5432/postgres" \
BACKUP_ENCRYPTION_KEY="your-passphrase" \
npm run backup:db
```

Requires `pg_dump` and `gpg` installed locally (both ship with a standard
PostgreSQL client install and GnuPG respectively).

## What this does not cover

- **Storage buckets** (`avatars`, `attendance-selfies`, memo/announcement
  attachments) are not included in this backup — `pg_dump` only captures
  the Postgres database, not Supabase Storage's object contents. For full
  disaster recovery, also mirror the buckets (e.g. `rclone` against the
  S3-compatible Storage API) on a similar schedule. Not implemented in this
  pass — flagged as a follow-up.
- **`auth.users` / `auth.identities`** are intentionally excluded from the
  dump (`--schema=public`). Recovering authentication requires either a
  Supabase-plan restore or recreating accounts via `scripts/seed-users.ts`
  plus a forced password reset for every employee.
