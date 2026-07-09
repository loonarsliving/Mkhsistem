/* eslint-disable no-console -- CLI script: stdout progress output is the intended behavior */
/**
 * Dumps the MK Connect Postgres database via `pg_dump`, gzips it, and (if
 * BACKUP_ENCRYPTION_KEY is set) encrypts it symmetrically with `gpg` before
 * writing to disk — the dump contains employee PII (names, emails, phone
 * numbers, attendance GPS coordinates), so anywhere it's stored at rest
 * (including CI artifact storage on a public repo) it must not sit in
 * plaintext.
 *
 * Usage:
 *   SUPABASE_DB_URL="postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres" \
 *   BACKUP_ENCRYPTION_KEY="a long random passphrase" \
 *   npx tsx scripts/backup-database.ts
 *
 * Restore:
 *   gpg --batch --yes --passphrase "$BACKUP_ENCRYPTION_KEY" -d backup.sql.gz.gpg \
 *     | gunzip | psql "$SUPABASE_DB_URL"
 */
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";

const DB_URL = process.env.SUPABASE_DB_URL;
const ENCRYPTION_KEY = process.env.BACKUP_ENCRYPTION_KEY;
const OUTPUT_DIR = process.env.BACKUP_OUTPUT_DIR ?? "backups";

if (!DB_URL) {
  console.error("SUPABASE_DB_URL is not set. Get it from Supabase Dashboard → Project Settings → Database →");
  console.error("Connection string (use the 'URI' / session pooler form, not the transaction pooler).");
  process.exit(1);
}

function timestampedFilename(): string {
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `mk-connect-${stamp}`;
}

async function run() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const base = timestampedFilename();
  const gzPath = path.join(OUTPUT_DIR, `${base}.sql.gz`);

  console.log(`Dumping database → ${gzPath}`);

  const pgDump = spawn(
    "pg_dump",
    [
      DB_URL!,
      "--no-owner",
      "--no-privileges",
      // auth.* and storage.* are Supabase-managed system schemas — restoring
      // them from a dump is unsupported and unnecessary; only public (the
      // app schema) needs to be captured for disaster recovery.
      "--schema=public",
      "--format=plain",
    ],
    { stdio: ["ignore", "pipe", "inherit"] },
  );

  const gzip = zlib.createGzip({ level: 9 });
  const out = createWriteStream(gzPath);

  await pipeline(pgDump.stdout, gzip, out);

  const exitCode: number = await new Promise((resolve) => pgDump.on("close", resolve));
  if (exitCode !== 0) {
    console.error(`pg_dump exited with code ${exitCode}`);
    process.exit(exitCode);
  }

  if (ENCRYPTION_KEY) {
    const encPath = `${gzPath}.gpg`;
    console.log(`Encrypting → ${encPath}`);
    await new Promise<void>((resolve, reject) => {
      const gpg = spawn("gpg", [
        "--batch",
        "--yes",
        "--symmetric",
        "--cipher-algo",
        "AES256",
        "--passphrase",
        ENCRYPTION_KEY,
        "--output",
        encPath,
        gzPath,
      ]);
      gpg.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`gpg exited with code ${code}`))));
    });
    const { unlinkSync } = await import("node:fs");
    unlinkSync(gzPath); // don't leave the plaintext-gzip copy on disk once encrypted
    console.log(`Backup complete: ${encPath}`);
  } else {
    console.warn("BACKUP_ENCRYPTION_KEY not set — backup written unencrypted. Do not upload this as-is.");
    console.log(`Backup complete: ${gzPath}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
