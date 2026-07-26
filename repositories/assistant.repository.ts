import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { NotificationCategoryDb, TablesInsert } from "@/types/database.types";

/**
 * Queries behind /asisten — the private assistant's workspace.
 *
 * The assistant supports the Super Admin, so the job is to make sure nothing
 * reaches the principal's desk unseen: one list of what is waiting on a
 * decision, one list of what is currently on fire, and a personal chase
 * list. Everything here is read-only except the follow-up list -- the role
 * holds no approve/verify permission anywhere by design.
 */

export interface PrincipalQueue {
  pendingRegistrations: number;
  pendingLeave: number;
  draftPayrollRuns: number;
  pendingHrExpenses: number;
  pendingPaymentVerification: number;
  pendingSp1Reviews: number;
  pendingContentReviews: number;
}

/**
 * Everything sitting unattended across the system, in one place.
 *
 * Counted with head-only queries so this stays cheap even as the tables
 * grow -- the assistant needs the number and the link, not the rows.
 * Each count is wrapped so that one missing/renamed table degrades that
 * single tile to zero instead of blanking the whole page.
 */
export async function getPrincipalQueue(supabase: TypedSupabaseClient): Promise<PrincipalQueue> {
  const count = async (run: () => PromiseLike<{ count: number | null; error: unknown }>) => {
    try {
      const { count: n, error } = await run();
      return error ? 0 : (n ?? 0);
    } catch {
      return 0;
    }
  };

  const [
    pendingRegistrations,
    pendingLeave,
    draftPayrollRuns,
    pendingHrExpenses,
    pendingPaymentVerification,
    pendingSp1Reviews,
    pendingContentReviews,
  ] = await Promise.all([
    count(() => supabase.from("employees").select("*", { count: "exact", head: true }).eq("approval_status", "pending")),
    count(() => supabase.from("leave_requests").select("*", { count: "exact", head: true }).eq("status", "pending").is("deleted_at", null)),
    count(() => supabase.from("payroll_runs").select("*", { count: "exact", head: true }).eq("status", "draft")),
    count(() => supabase.from("hr_expenses").select("*", { count: "exact", head: true }).eq("status", "pending")),
    count(() => supabase.from("prospect_payments").select("*", { count: "exact", head: true }).eq("status", "pending")),
    count(() => supabase.from("crm_sp1_warnings").select("*", { count: "exact", head: true }).eq("status", "pending_review")),
    count(() => supabase.from("markom_content_submissions").select("*", { count: "exact", head: true }).eq("status", "pending_review").is("deleted_at", null)),
  ]);

  return {
    pendingRegistrations,
    pendingLeave,
    draftPayrollRuns,
    pendingHrExpenses,
    pendingPaymentVerification,
    pendingSp1Reviews,
    pendingContentReviews,
  };
}

export interface EscalationItem {
  id: string;
  category: string;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
}

/**
 * Categories that mean "someone needs to look at this now" rather than
 * "here is your routine reminder". Reading them off mkc_notifications keeps
 * this list automatically in step with whatever the automation layer starts
 * emitting -- adding a new alert category surfaces it here for free.
 */
const ESCALATION_CATEGORIES = [
  "ad_lead_escalation_director",
  "ad_lead_escalation_branch",
  "sp1_escalation",
  "branch_balance_alert",
  "meta_ads_balance_low",
  "finance_expense_alert",
  "whatsapp_webhook_silence_alert",
  "sales_conduct_warning",
  "content_publish_failed",
  "automation_dispatch_failed",
  "automation_job_dead_letter",
  "automation_queue_stalled",
  "emergency_notice",
] as const satisfies readonly NotificationCategoryDb[];

/** Active escalations and system alerts from the last `days` days, newest first, deduplicated by category+title. */
export async function listActiveEscalations(supabase: TypedSupabaseClient, days = 3, limit = 12): Promise<EscalationItem[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from("mkc_notifications")
    .select("id, category, title, body, link, created_at")
    .in("category", [...ESCALATION_CATEGORIES])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(120);
  if (error) throw error;

  // The same alert fans out one row per Super Admin, so collapse identical
  // category+title pairs down to the most recent occurrence.
  const seen = new Set<string>();
  const items: EscalationItem[] = [];
  for (const row of data ?? []) {
    const key = `${row.category}::${row.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: row.id,
      category: row.category ?? "—",
      title: row.title,
      body: row.body,
      link: row.link,
      createdAt: row.created_at,
    });
    if (items.length >= limit) break;
  }
  return items;
}

export interface AssistantFollowup {
  id: string;
  title: string;
  notes: string | null;
  assignedTo: string | null;
  dueDate: string | null;
  status: string;
  createdAt: string;
}

/** Open items first, then by due date (undated last), then newest. */
export async function listFollowups(supabase: TypedSupabaseClient, ownerId: string): Promise<AssistantFollowup[]> {
  const { data, error } = await supabase
    .from("assistant_followups")
    .select("id, title, notes, assigned_to, due_date, status, created_at")
    .eq("owner_id", ownerId)
    .order("status", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    notes: row.notes,
    assignedTo: row.assigned_to,
    dueDate: row.due_date,
    status: row.status,
    createdAt: row.created_at,
  }));
}

export async function insertFollowup(supabase: TypedSupabaseClient, input: TablesInsert<"assistant_followups">) {
  const { error } = await supabase.from("assistant_followups").insert(input);
  if (error) throw error;
}

export async function setFollowupStatus(supabase: TypedSupabaseClient, id: string, status: "open" | "done") {
  const { error } = await supabase
    .from("assistant_followups")
    .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteFollowup(supabase: TypedSupabaseClient, id: string) {
  const { error } = await supabase.from("assistant_followups").delete().eq("id", id);
  if (error) throw error;
}
