import type { TypedSupabaseClient } from "@/lib/supabase/types";

/**
 * Queries behind /hr — the HR control room.
 *
 * The organising idea: HR does not need to see the 200 employees who
 * checked in normally, they need the handful who did not. So everything
 * here is an exception list or an action count, never a full roster dump.
 */

export interface HrActionQueue {
  pendingLeave: number;
  pendingRegistrations: number;
  draftPayrollRuns: number;
  pendingHrExpenses: number;
}

/** The four things that sit in HR's inbox. Counted in parallel -- each is a cheap head-count query. */
export async function getHrActionQueue(supabase: TypedSupabaseClient): Promise<HrActionQueue> {
  const [leave, registrations, payroll, expenses] = await Promise.all([
    supabase.from("leave_requests").select("*", { count: "exact", head: true }).eq("status", "pending").is("deleted_at", null),
    supabase.from("employees").select("*", { count: "exact", head: true }).eq("approval_status", "pending"),
    supabase.from("payroll_runs").select("*", { count: "exact", head: true }).eq("status", "draft"),
    supabase.from("hr_expenses").select("*", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  return {
    pendingLeave: leave.count ?? 0,
    pendingRegistrations: registrations.count ?? 0,
    draftPayrollRuns: payroll.count ?? 0,
    pendingHrExpenses: expenses.count ?? 0,
  };
}

export interface BranchAttendanceRow {
  branchId: string;
  branchName: string;
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
  alpha: number;
  belumAbsen: number;
  total: number;
}

export interface NotCheckedInEmployee {
  userId: string;
  fullName: string;
  branchName: string;
}

export interface TodayAttendanceBoard {
  branches: BranchAttendanceRow[];
  notCheckedIn: NotCheckedInEmployee[];
}

/**
 * Today's attendance split per branch, plus the names behind the one column
 * that is actionable while the day is still running.
 *
 * `belumAbsen` (no attendance row yet) is the point of this widget.
 * mark_absentees_alpha() converts those rows to 'alpha' at 18:00 WITA, so
 * before that cutoff they are still recoverable -- HR can call the person.
 * Nothing in the app surfaced that window before; alpha was only ever
 * discovered the next day, as history.
 */
export async function getTodayAttendanceBoard(supabase: TypedSupabaseClient): Promise<TodayAttendanceBoard> {
  const { data, error } = await supabase
    .from("v_attendance_today")
    .select("user_id, full_name, branch_id, branch_name, status");
  if (error) throw error;

  const byBranch = new Map<string, BranchAttendanceRow>();
  const notCheckedIn: NotCheckedInEmployee[] = [];

  for (const row of data ?? []) {
    const branchId = row.branch_id ?? "unknown";
    let bucket = byBranch.get(branchId);
    if (!bucket) {
      bucket = {
        branchId,
        branchName: row.branch_name ?? "Tanpa cabang",
        hadir: 0,
        terlambat: 0,
        izin: 0,
        sakit: 0,
        alpha: 0,
        belumAbsen: 0,
        total: 0,
      };
      byBranch.set(branchId, bucket);
    }
    bucket.total++;

    switch (row.status) {
      case "hadir":
        bucket.hadir++;
        break;
      case "terlambat":
        bucket.terlambat++;
        break;
      case "izin":
        bucket.izin++;
        break;
      case "sakit":
        bucket.sakit++;
        break;
      case "alpha":
        bucket.alpha++;
        break;
      default:
        bucket.belumAbsen++;
        notCheckedIn.push({
          userId: row.user_id ?? "",
          fullName: row.full_name ?? "—",
          branchName: row.branch_name ?? "Tanpa cabang",
        });
    }
  }

  return {
    branches: [...byBranch.values()].sort((a, b) => a.branchName.localeCompare(b.branchName)),
    notCheckedIn: notCheckedIn.sort((a, b) => a.branchName.localeCompare(b.branchName) || a.fullName.localeCompare(b.fullName)),
  };
}

export interface MonthlyCompliance {
  hadir: number;
  terlambat: number;
  alpha: number;
  izin: number;
  sakit: number;
  totalRecords: number;
  /** hadir / (hadir + terlambat + alpha), as a percentage. Leave days are excluded -- an approved absence is not non-compliance. */
  attendanceRate: number;
}

function summariseMonth(
  rows: { hadir_count: number | null; terlambat_count: number | null; alpha_count: number | null; izin_count: number | null; sakit_count: number | null }[],
): MonthlyCompliance {
  const totals = rows.reduce(
    (acc, r) => ({
      hadir: acc.hadir + (r.hadir_count ?? 0),
      terlambat: acc.terlambat + (r.terlambat_count ?? 0),
      alpha: acc.alpha + (r.alpha_count ?? 0),
      izin: acc.izin + (r.izin_count ?? 0),
      sakit: acc.sakit + (r.sakit_count ?? 0),
    }),
    { hadir: 0, terlambat: 0, alpha: 0, izin: 0, sakit: 0 },
  );

  const working = totals.hadir + totals.terlambat + totals.alpha;
  return {
    ...totals,
    totalRecords: working + totals.izin + totals.sakit,
    attendanceRate: working === 0 ? 0 : Math.round(((totals.hadir + totals.terlambat) / working) * 100),
  };
}

function monthStart(offset: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)).toISOString().slice(0, 10);
}

/** This month's compliance next to last month's, so the number has a direction and not just a value. */
export async function getMonthlyCompliance(
  supabase: TypedSupabaseClient,
): Promise<{ thisMonth: MonthlyCompliance; lastMonth: MonthlyCompliance }> {
  const [current, previous] = await Promise.all([
    supabase.from("v_attendance_monthly_stats").select("*").eq("month", monthStart(0)),
    supabase.from("v_attendance_monthly_stats").select("*").eq("month", monthStart(-1)),
  ]);
  if (current.error) throw current.error;
  if (previous.error) throw previous.error;

  return {
    thisMonth: summariseMonth(current.data ?? []),
    lastMonth: summariseMonth(previous.data ?? []),
  };
}

export interface WatchlistEntry {
  userId: string;
  fullName: string;
  branchName: string;
  alpha: number;
  terlambat: number;
}

/**
 * Employees with the most unexcused absences or late arrivals this month --
 * the shortlist HR would actually open a conversation about. Sorted by alpha
 * first: an unexplained absence is a heavier signal than lateness.
 */
export async function getAttendanceWatchlist(supabase: TypedSupabaseClient, limit = 8): Promise<WatchlistEntry[]> {
  const { data, error } = await supabase
    .from("v_attendance_monthly_stats")
    .select("user_id, alpha_count, terlambat_count")
    .eq("month", monthStart(0));
  if (error) throw error;

  const flagged = (data ?? []).filter((r) => (r.alpha_count ?? 0) > 0 || (r.terlambat_count ?? 0) > 0);
  if (flagged.length === 0) return [];

  const { data: people, error: peopleError } = await supabase
    .from("v_employee_directory")
    .select("id, full_name, branch_name")
    .in("id", flagged.map((r) => r.user_id).filter((id): id is string => Boolean(id)));
  if (peopleError) throw peopleError;

  const nameById = new Map((people ?? []).map((p) => [p.id, p]));

  return flagged
    .map((r) => ({
      userId: r.user_id ?? "",
      fullName: nameById.get(r.user_id ?? "")?.full_name ?? "—",
      branchName: nameById.get(r.user_id ?? "")?.branch_name ?? "—",
      alpha: r.alpha_count ?? 0,
      terlambat: r.terlambat_count ?? 0,
    }))
    .sort((a, b) => b.alpha - a.alpha || b.terlambat - a.terlambat)
    .slice(0, limit);
}

export interface UpcomingBirthday {
  userId: string;
  fullName: string;
  branchName: string;
  /** Day-of-year date this year, already normalised for display. */
  date: string;
  daysAway: number;
}

/**
 * Birthdays in the next `days` days.
 *
 * ai_send_birthday_wishes() already congratulates people automatically at
 * 07:00 WITA on the day, but HR needs to know *beforehand* -- the automated
 * message is not a substitute for the company remembering to organise
 * something.
 *
 * Filtered in JS rather than SQL because birth_date stores the birth year,
 * so "birthday within N days" is a day-of-year comparison, not a date range.
 */
export async function getUpcomingBirthdays(supabase: TypedSupabaseClient, days = 14): Promise<UpcomingBirthday[]> {
  const { data, error } = await supabase
    .from("employees")
    .select("id, full_name, birth_date, branches:branch_id(name)")
    .not("birth_date", "is", null)
    .eq("employment_status", "active")
    .is("deleted_at", null);
  if (error) throw error;

  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

  const upcoming: UpcomingBirthday[] = [];
  for (const row of data ?? []) {
    if (!row.birth_date) continue;
    const birth = new Date(row.birth_date);
    // Next occurrence: this year's, or next year's if it already passed.
    let next = Date.UTC(today.getUTCFullYear(), birth.getUTCMonth(), birth.getUTCDate());
    if (next < todayUtc) next = Date.UTC(today.getUTCFullYear() + 1, birth.getUTCMonth(), birth.getUTCDate());

    const daysAway = Math.round((next - todayUtc) / 86_400_000);
    if (daysAway > days) continue;

    const branch = row.branches as { name: string } | null;
    upcoming.push({
      userId: row.id,
      fullName: row.full_name,
      branchName: branch?.name ?? "—",
      date: new Date(next).toISOString().slice(0, 10),
      daysAway,
    });
  }

  return upcoming.sort((a, b) => a.daysAway - b.daysAway);
}

export interface UpcomingLeave {
  id: string;
  fullName: string;
  type: string;
  startDate: string;
  endDate: string;
}

/** Approved leave overlapping the next `days` days — staffing visibility, not an approval queue. */
export async function getUpcomingLeave(supabase: TypedSupabaseClient, days = 14): Promise<UpcomingLeave[]> {
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("leave_requests")
    .select("id, type, start_date, end_date, employees:user_id(full_name)")
    .eq("status", "approved")
    .is("deleted_at", null)
    .lte("start_date", horizon)
    .gte("end_date", today)
    .order("start_date", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row) => {
    const employee = row.employees as { full_name: string } | null;
    return {
      id: row.id,
      fullName: employee?.full_name ?? "—",
      type: row.type,
      startDate: row.start_date,
      endDate: row.end_date,
    };
  });
}

export interface HeadcountSummary {
  total: number;
  newThisMonth: number;
  byBranch: { branchName: string; count: number }[];
}

/** Active headcount, and who joined this month. */
export async function getHeadcount(supabase: TypedSupabaseClient): Promise<HeadcountSummary> {
  const { data, error } = await supabase
    .from("employees")
    .select("id, join_date, branches:branch_id(name)")
    .eq("employment_status", "active")
    .is("deleted_at", null);
  if (error) throw error;

  const start = monthStart(0);
  const byBranch = new Map<string, number>();
  let newThisMonth = 0;

  for (const row of data ?? []) {
    const branch = row.branches as { name: string } | null;
    const name = branch?.name ?? "Tanpa cabang";
    byBranch.set(name, (byBranch.get(name) ?? 0) + 1);
    if (row.join_date && row.join_date >= start) newThisMonth++;
  }

  return {
    total: (data ?? []).length,
    newThisMonth,
    byBranch: [...byBranch.entries()]
      .map(([branchName, count]) => ({ branchName, count }))
      .sort((a, b) => b.count - a.count),
  };
}
