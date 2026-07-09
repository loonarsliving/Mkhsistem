/**
 * Ensures the e2e test account starts each run with no attendance record
 * for today, regardless of what a previous (possibly interrupted) run left
 * behind. Runs in Node before any browser is launched.
 */
async function globalSetup() {
  if (!process.env.TEST_STAFF_EMAIL) {
    // No live credentials configured (e.g. running config validation only) — nothing to clean.
    return;
  }

  const { signInAs } = await import("../support/supabase-test-client");
  const today = new Date().toISOString().slice(0, 10);

  const staff = await signInAs("staff");
  const hr = await signInAs("hr");
  await hr.client.from("attendance").delete().eq("user_id", staff.userId).eq("attendance_date", today);
  await staff.client.auth.signOut();
  await hr.client.auth.signOut();
}

export default globalSetup;
