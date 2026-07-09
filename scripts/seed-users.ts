/**
 * Seeds demo auth accounts + employee profiles for local/demo environments.
 * Run after `supabase db reset` (which applies migrations + SQL seeds).
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-users.ts
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const DEMO_PASSWORD = "MkConnect#2026";

const DEMO_USERS = [
  { email: "superadmin@mahakaryahaluoleo.com", fullName: "Super Admin", roleKey: "super_admin", branchCode: "HO", employeeCode: "EMP-0001" },
  { email: "direktur@mahakaryahaluoleo.com", fullName: "Budi Santoso", roleKey: "direktur_utama", branchCode: "HO", employeeCode: "EMP-0002" },
  { email: "hr@mahakaryahaluoleo.com", fullName: "Siti Rahayu", roleKey: "hr", branchCode: "HO", employeeCode: "EMP-0003" },
  { email: "kacab.jogja@mahakaryahaluoleo.com", fullName: "Andi Wijaya", roleKey: "kepala_cabang", branchCode: "JOG", employeeCode: "EMP-0004" },
  { email: "staff.kendari@mahakaryahaluoleo.com", fullName: "Dewi Lestari", roleKey: "staff", branchCode: "KDI", employeeCode: "EMP-0005" },
];

async function main() {
  const { data: branches } = await admin.from("branches").select("id, code");
  const { data: roles } = await admin.from("roles").select("id, key");

  if (!branches || !roles) throw new Error("Reference data not found — run migrations and seed SQL first.");

  for (const user of DEMO_USERS) {
    const branch = branches.find((b) => b.code === user.branchCode);
    const role = roles.find((r) => r.key === user.roleKey);
    if (!branch || !role) {
      console.warn(`Skipping ${user.email}: branch/role not found`);
      continue;
    }

    const { data: created, error } = await admin.auth.admin.createUser({
      email: user.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: user.fullName },
    });

    if (error || !created.user) {
      console.warn(`Skipping ${user.email}: ${error?.message}`);
      continue;
    }

    const { error: profileError } = await admin.from("employees").insert({
      id: created.user.id,
      employee_code: user.employeeCode,
      full_name: user.fullName,
      email: user.email,
      branch_id: branch.id,
      role_id: role.id,
      join_date: new Date().toISOString().slice(0, 10),
    });

    if (profileError) {
      console.warn(`Failed to insert employee profile for ${user.email}: ${profileError.message}`);
      continue;
    }

    console.log(`Created ${user.email} (${user.roleKey})`);
  }

  console.log(`\nDemo password for all accounts: ${DEMO_PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
