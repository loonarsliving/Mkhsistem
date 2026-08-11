import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { Database } from "@/types/database.types";

type SiteplanUnitStatusDb = Database["public"]["Tables"]["loonars_units"]["Row"]["status"];

// ----------------------------------------------------------------------------
// Projects
// ----------------------------------------------------------------------------

export async function listSiteplanProjects(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase.from("loonars_projects").select("*").order("nama", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getSiteplanProject(supabase: TypedSupabaseClient, projectId: string) {
  const { data, error } = await supabase.from("loonars_projects").select("*").eq("id", projectId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createSiteplanProject(
  supabase: TypedSupabaseClient,
  payload: { kode: string; nama: string; lokasi: string | null; warna: string | null },
) {
  const { data, error } = await supabase.from("loonars_projects").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateSiteplanProject(
  supabase: TypedSupabaseClient,
  id: string,
  payload: Partial<{ kode: string; nama: string; lokasi: string | null; warna: string | null }>,
) {
  const { data, error } = await supabase.from("loonars_projects").update(payload).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

// ----------------------------------------------------------------------------
// Units
// ----------------------------------------------------------------------------

/** All units for a project, ordered by blok code -- feeds both the viewer and the admin position editor's sidebar list. */
export async function listSiteplanUnits(supabase: TypedSupabaseClient, projectId: string) {
  const { data, error } = await supabase
    .from("loonars_units")
    .select("*")
    .eq("project_id", projectId)
    .order("blok", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createSiteplanUnit(
  supabase: TypedSupabaseClient,
  payload: { project_id: string; blok: string; tipe: string | null; harga: number | null; luas: number | null },
) {
  const { data, error } = await supabase.from("loonars_units").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateSiteplanUnit(
  supabase: TypedSupabaseClient,
  id: string,
  payload: Partial<{ blok: string; tipe: string | null; harga: number | null; luas: number | null; status: SiteplanUnitStatusDb }>,
) {
  const { data, error } = await supabase.from("loonars_units").update(payload).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

export async function deleteSiteplanUnit(supabase: TypedSupabaseClient, id: string) {
  const { error } = await supabase.from("loonars_units").delete().eq("id", id);
  if (error) throw error;
}

// ----------------------------------------------------------------------------
// Siteplan image + unit positions (hotspots)
// ----------------------------------------------------------------------------

/** The project's background siteplan image config, if one has been uploaded yet. */
export async function getSiteplanImage(supabase: TypedSupabaseClient, projectId: string) {
  const { data, error } = await supabase.from("loonars_siteplan_layouts").select("*").eq("project_id", projectId).maybeSingle();
  if (error) throw error;
  return data;
}

/** Every placed hotspot for a project's units (joins through loonars_units for the project_id filter). */
export async function listUnitPositions(supabase: TypedSupabaseClient, projectId: string) {
  const { data, error } = await supabase
    .from("loonars_unit_positions")
    .select("*, loonars_units!inner(project_id)")
    .eq("loonars_units.project_id", projectId);
  if (error) throw error;
  return data ?? [];
}

/** Units for a project that don't have a hotspot placed yet -- the admin position editor's "unplaced" sidebar list. */
export async function listUnpositionedUnits(supabase: TypedSupabaseClient, projectId: string) {
  const [units, positions] = await Promise.all([listSiteplanUnits(supabase, projectId), listUnitPositions(supabase, projectId)]);
  const positionedIds = new Set(positions.map((p) => p.unit_id));
  return units.filter((u) => !positionedIds.has(u.id));
}

// ----------------------------------------------------------------------------
// Purchases
// ----------------------------------------------------------------------------

/** Siteplan purchases waiting for Finance to verify the money actually landed. */
export async function listPendingSiteplanPurchases(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase
    .from("loonars_unit_purchases")
    .select("*, loonars_units(blok, project_id, loonars_projects(nama)), marketing:employees!loonars_unit_purchases_marketing_employee_id_fkey(full_name)")
    .eq("status", "pending_verification")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** The current live (non-rejected) purchase for a unit, if any -- read-only detail modal for a taken unit. RLS restricts this to the owning marketing rep or a finance_verify holder, so other viewers simply see nothing back. */
export async function getSiteplanPurchaseForUnit(supabase: TypedSupabaseClient, unitId: string) {
  const { data, error } = await supabase
    .from("loonars_unit_purchases")
    .select("*")
    .eq("unit_id", unitId)
    .neq("status", "rejected")
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** A sales rep's own purchase attempts (any status) -- for tracking + the dashboard fee card. */
export async function listMySiteplanPurchases(supabase: TypedSupabaseClient, employeeId: string) {
  const { data, error } = await supabase
    .from("loonars_unit_purchases")
    .select("*, loonars_units(blok, project_id, loonars_projects(nama))")
    .eq("marketing_employee_id", employeeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ----------------------------------------------------------------------------
// Fee requests
// ----------------------------------------------------------------------------

/** Fee claims waiting on a siteplan.manage holder's approve/reject decision. */
export async function listPendingSiteplanFeeRequests(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase
    .from("loonars_unit_fee_requests")
    .select(
      "*, loonars_units(blok, project_id, loonars_projects(nama)), marketing:employees!loonars_unit_fee_requests_marketing_employee_id_fkey(full_name)",
    )
    .eq("status", "pending")
    .order("requested_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** A sales rep's own fee claims (any status). */
export async function listMySiteplanFeeRequests(supabase: TypedSupabaseClient, employeeId: string) {
  const { data, error } = await supabase
    .from("loonars_unit_fee_requests")
    .select("*, loonars_units(blok, project_id, loonars_projects(nama))")
    .eq("marketing_employee_id", employeeId)
    .order("requested_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
