import { LPL_BRANCH_ID } from "@/constants/app";
import type { TypedSupabaseClient } from "@/lib/supabase/types";

/**
 * Reads for /lpl-staff (0289). RLS (employees_select_lpl_manager) lets
 * Jogja's Kepala Cabang see the LPL branch; every write goes through the
 * lpl_add_employee / lpl_remove_employee RPCs.
 */

export interface LplEmployee {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string | null;
  divisionName: string | null;
  joinDate: string;
}

export async function listLplEmployees(supabase: TypedSupabaseClient): Promise<LplEmployee[]> {
  const { data, error } = await supabase
    .from("employees")
    .select("id, employee_code, full_name, email, phone, join_date, division:division_id(name)")
    .eq("branch_id", LPL_BRANCH_ID)
    .is("deleted_at", null)
    .order("full_name", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    employeeCode: row.employee_code,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    divisionName: (row.division as unknown as { name: string } | null)?.name ?? null,
    joinDate: row.join_date,
  }));
}

export async function listLplDivisions(supabase: TypedSupabaseClient): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from("divisions")
    .select("id, name")
    .eq("branch_id", LPL_BRANCH_ID)
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}
