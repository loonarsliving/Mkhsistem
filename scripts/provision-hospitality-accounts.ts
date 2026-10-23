/* eslint-disable no-console -- CLI script: stdout progress output is the intended behavior */
/**
 * Loonars Connect (0291) -- provision individual MK Connect accounts for
 * Hospitality staff who do NOT have one yet. Server-side only: needs the
 * service-role key, which must never be in the browser or in git.
 *
 * Input is a LOCAL JSON file the owner fills from the real Loonars Living
 * employee list (never committed -- this repository is public):
 *   [{ "fullName": "...", "email": "...", "division": "LPL-FO" | "LPL-SEC" | "LPL-CLN" | "LPL-HEAD", "phone": "08..." }]
 *
 * For each person:
 *   - an employee with the same email, or the same name in the LPL branch,
 *     already exists      -> "already existed", nothing created, no password
 *   - several candidates   -> "ambiguous", nothing created (resolve by hand)
 *   - otherwise            -> a Supabase Auth user (email confirmed) with an
 *     individual random temporary password + an approved `staff` employee
 *     row in the LPL branch/division. Group membership follows automatically
 *     from the division (mkc_chat_division_roles).
 *
 * Dry run by default; --apply to create. The credentials report (the only
 * place a temporary password ever appears) is written to --out with mode
 * 0600 OUTSIDE the repository; hand it to the owner and delete it.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/provision-hospitality-accounts.ts --input ~/hospitality-staff.json --out ~/hospitality-accounts.csv [--apply]
 *
 * MK Connect has no forced first-login password change today; the report
 * tells each employee to change it from Profil. user_metadata.must_change_password
 * is set so a future enforcement can pick these accounts up.
 */
import { randomInt } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

const DIVISIONS = ["LPL-FO", "LPL-SEC", "LPL-CLN", "LPL-HEAD"] as const;
const ROLE_LABEL: Record<(typeof DIVISIONS)[number], string> = {
  "LPL-FO": "Front Office",
  "LPL-SEC": "Security",
  "LPL-CLN": "Cleaning",
  "LPL-HEAD": "Hospitality Manager",
};

interface Person {
  fullName: string;
  email: string;
  division: (typeof DIVISIONS)[number];
  phone?: string;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/**
 * Easy to type on a phone, individual, not derived from the person:
 * two random pronounceable syllable pairs + 4 random digits, e.g. "bodu-kemi-4821".
 * ~13 bits per word x2 + ~13 bits digits -- ample for a temporary password
 * behind Supabase Auth's own rate limiting.
 */
export function temporaryPassword(): string {
  const c = "bcdfghjklmnprstvw";
  const v = "aeiou";
  const word = () => Array.from({ length: 2 }, () => c[randomInt(c.length)] + v[randomInt(v.length)]).join("");
  return `${word()}-${word()}-${String(randomInt(10_000)).padStart(4, "0")}`;
}

function csv(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const input = arg("--input");
  const out = arg("--out");
  const apply = process.argv.includes("--apply");
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  if (!input || !out) throw new Error("Usage: --input <people.json> --out <report.csv> [--apply]");
  const outPath = resolve(out);
  if (outPath.startsWith(resolve(process.cwd()))) throw new Error("--out must be outside the repository (it will contain passwords)");
  if (existsSync(outPath)) throw new Error(`${outPath} already exists -- refusing to overwrite a credentials report`);

  const people = JSON.parse(readFileSync(resolve(input), "utf8")) as Person[];
  for (const p of people) {
    if (!p.fullName?.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email ?? "") || !DIVISIONS.includes(p.division)) {
      throw new Error(`Invalid entry: ${JSON.stringify({ fullName: p.fullName, email: p.email, division: p.division })}`);
    }
  }

  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: branch } = await admin.from("branches").select("id").eq("code", "LPL").single();
  if (!branch) throw new Error("Branch LPL not found");
  const { data: divisions } = await admin.from("divisions").select("id, code").eq("branch_id", branch.id);
  const { data: staffRole } = await admin.from("roles").select("id").eq("key", "staff").single();
  if (!divisions || !staffRole) throw new Error("Reference data missing (divisions / staff role) -- is migration 0291 applied?");

  const rows: string[] = ["employee,login,role,status,initial_password"];
  for (const p of people) {
    const email = p.email.trim().toLowerCase();
    const { data: byEmail } = await admin.from("employees").select("id, full_name").ilike("email", email).is("deleted_at", null);
    const { data: byName } = await admin
      .from("employees")
      .select("id, full_name")
      .eq("branch_id", branch.id)
      .ilike("full_name", p.fullName.trim())
      .is("deleted_at", null);
    const matches = new Map([...(byEmail ?? []), ...(byName ?? [])].map((e) => [e.id, e]));
    const role = ROLE_LABEL[p.division];

    if (matches.size === 1) {
      rows.push([p.fullName, email, role, "already existed", ""].map(csv).join(","));
      console.log(`= ${p.fullName}: already exists, nothing created`);
      continue;
    }
    if (matches.size > 1) {
      rows.push([p.fullName, email, role, "ambiguous - review manually", ""].map(csv).join(","));
      console.log(`? ${p.fullName}: ${matches.size} matching employee records -- skipped, review manually`);
      continue;
    }
    if (!apply) {
      rows.push([p.fullName, email, role, "would be created (dry run)", ""].map(csv).join(","));
      console.log(`+ ${p.fullName}: would be created (dry run)`);
      continue;
    }

    const division = divisions.find((d) => d.code === p.division);
    if (!division) throw new Error(`Division ${p.division} not found`);
    const password = temporaryPassword();
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: p.fullName.trim(), must_change_password: true },
    });
    if (error || !created.user) {
      rows.push([p.fullName, email, role, `failed: ${error?.message ?? "unknown"}`, ""].map(csv).join(","));
      console.log(`! ${p.fullName}: auth user failed (${error?.message})`);
      continue;
    }
    const { error: empError } = await admin.from("employees").insert({
      id: created.user.id,
      full_name: p.fullName.trim(),
      email,
      phone: p.phone?.trim() || null,
      branch_id: branch.id,
      division_id: division.id,
      role_id: staffRole.id,
      approval_status: "approved",
      is_active: true,
    });
    if (empError) {
      await admin.auth.admin.deleteUser(created.user.id);
      rows.push([p.fullName, email, role, `failed: ${empError.message}`, ""].map(csv).join(","));
      console.log(`! ${p.fullName}: employee row failed, auth user rolled back (${empError.message})`);
      continue;
    }
    rows.push([p.fullName, email, role, "created", password].map(csv).join(","));
    console.log(`+ ${p.fullName}: created`);
  }

  writeFileSync(outPath, rows.join("\n") + "\n", { mode: 0o600 });
  console.log(`\nReport written to ${outPath} (mode 600). It contains temporary passwords: deliver it to the owner and delete it.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
