import type { TypedSupabaseClient } from "@/lib/supabase/types";

/** Reads for the WA-only approval flow (0201) -- submission/decision happen over WhatsApp, this is read-only history. */

export interface ApprovalRequest {
  id: string;
  code: string;
  requesterName: string | null;
  branchName: string | null;
  requestText: string | null;
  imageUrl: string | null;
  status: "pending" | "approved" | "rejected";
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

interface RawApprovalRow {
  id: string;
  code: string;
  request_text: string | null;
  image_url: string | null;
  status: "pending" | "approved" | "rejected";
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
  requester: { full_name: string } | null;
  decider: { full_name: string } | null;
  branch: { name: string } | null;
}

const SELECT =
  "id, code, request_text, image_url, status, decided_at, decision_note, created_at, requester:requester_employee_id(full_name), decider:decided_by(full_name), branch:branch_id(name)";

function mapRow(row: RawApprovalRow): ApprovalRequest {
  return {
    id: row.id,
    code: row.code,
    requesterName: row.requester?.full_name ?? null,
    branchName: row.branch?.name ?? null,
    requestText: row.request_text,
    imageUrl: row.image_url,
    status: row.status,
    decidedByName: row.decider?.full_name ?? null,
    decidedAt: row.decided_at,
    decisionNote: row.decision_note,
    createdAt: row.created_at,
  };
}

/** RLS scopes this to own submissions unless the caller holds approval_request.manage (every branch). */
export async function listApprovalRequests(supabase: TypedSupabaseClient, limit = 100): Promise<ApprovalRequest[]> {
  const { data, error } = await supabase.from("approval_requests").select(SELECT).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data as unknown as RawApprovalRow[]).map(mapRow);
}
