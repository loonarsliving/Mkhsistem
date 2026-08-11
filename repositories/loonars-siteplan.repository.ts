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

/**
 * All units for a project, ordered by row_label (nulls last, i.e. "Belum dikelompokkan" sorts to the
 * end), then sort_order, then blok as the final tiebreaker -- feeds the grid viewer, the admin row
 * ordering editor, and the admin CRUD table. Never sort/parse the numeric part of blok: real unit
 * numbering skips codes (e.g. C7, C11 intentionally missing), so row_label+sort_order is authoritative.
 */
export async function listSiteplanUnits(supabase: TypedSupabaseClient, projectId: string) {
  const { data, error } = await supabase
    .from("loonars_units")
    .select("*")
    .eq("project_id", projectId)
    .order("row_label", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true })
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
// Grid row/order (0203) -- replaces the image+hotspot placement below as the
// default siteplan layout: each unit belongs to a named row_label (e.g.
// "Atas"/"Bawah", null = "Belum dikelompokkan") and has a sort_order within
// that row. Gated by the same loonars_units_update RLS policy (siteplan.manage).
// ----------------------------------------------------------------------------

/**
 * Sets row_label + sort_order (1-based, by array position) for the given units, then moves any other
 * unit in the project that currently belongs to that row_label but was left out of `unitIds` back to
 * "Belum dikelompokkan" (row_label null, sort_order 0) -- the ordered id list is authoritative for the
 * row's full membership, matching the original loonars-sales admin's comma-list-per-row behavior.
 */
export async function saveSiteplanRowOrdering(
  supabase: TypedSupabaseClient,
  projectId: string,
  rowLabel: string,
  unitIds: string[],
) {
  await Promise.all(
    unitIds.map((id, index) =>
      supabase
        .from("loonars_units")
        .update({ row_label: rowLabel, sort_order: index + 1 })
        .eq("id", id)
        .eq("project_id", projectId)
        .then(({ error }) => {
          if (error) throw error;
        }),
    ),
  );

  const keep = new Set(unitIds);
  const { data: currentRowUnits, error: fetchError } = await supabase
    .from("loonars_units")
    .select("id")
    .eq("project_id", projectId)
    .eq("row_label", rowLabel);
  if (fetchError) throw fetchError;

  const toUnassign = (currentRowUnits ?? []).map((u) => u.id).filter((id) => !keep.has(id));
  if (toUnassign.length > 0) {
    const { error } = await supabase
      .from("loonars_units")
      .update({ row_label: null, sort_order: 0 })
      .in("id", toUnassign);
    if (error) throw error;
  }
}

/** Deletes a row entirely, moving every unit in it back to "Belum dikelompokkan". */
export async function deleteSiteplanRow(supabase: TypedSupabaseClient, projectId: string, rowLabel: string) {
  const { error } = await supabase
    .from("loonars_units")
    .update({ row_label: null, sort_order: 0 })
    .eq("project_id", projectId)
    .eq("row_label", rowLabel);
  if (error) throw error;
}

/** Quick single-unit assignment (e.g. moving one ungrouped unit into an existing row) -- appends to the end of that row. */
export async function assignSiteplanUnitToRow(supabase: TypedSupabaseClient, unitId: string, rowLabel: string) {
  const { data: unit, error: unitError } = await supabase.from("loonars_units").select("project_id").eq("id", unitId).single();
  if (unitError) throw unitError;

  const { data: rowUnits, error: rowError } = await supabase
    .from("loonars_units")
    .select("sort_order")
    .eq("project_id", unit.project_id)
    .eq("row_label", rowLabel)
    .order("sort_order", { ascending: false })
    .limit(1);
  if (rowError) throw rowError;

  const nextSortOrder = (rowUnits?.[0]?.sort_order ?? 0) + 1;
  const { error } = await supabase.from("loonars_units").update({ row_label: rowLabel, sort_order: nextSortOrder }).eq("id", unitId);
  if (error) throw error;
}

// ----------------------------------------------------------------------------
// Siteplan image + unit positions (hotspots) -- legacy image-map mode from
// 0202. No longer used by the default grid viewer/editor (see the row/order
// section above), left in place in case a future project wants an image-map
// mode again.
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
