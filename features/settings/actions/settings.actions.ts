"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import { companySettingsSchema, type CompanySettingsInput } from "../schemas/settings.schema";

const SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

export async function updateCompanySettingsAction(input: CompanySettingsInput): Promise<ActionResult> {
  const session = await requirePermission("settings.manage");
  const parsed = companySettingsSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase
    .from("company_settings")
    .update({
      company_name: parsed.data.companyName,
      company_address: parsed.data.companyAddress || null,
      company_logo_url: parsed.data.companyLogoUrl || null,
      timezone: parsed.data.timezone,
      default_radius_meters: parsed.data.defaultRadiusMeters,
      updated_by: session.userId,
    })
    .eq("id", SETTINGS_ID);

  if (error) return actionError(error.message);

  revalidatePath("/settings");
  return actionSuccess();
}
