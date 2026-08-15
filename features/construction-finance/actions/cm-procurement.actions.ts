"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import {
  decidePurchaseRequestSchema,
  submitPurchaseRequestSchema,
  type DecidePurchaseRequestInput,
  type SubmitPurchaseRequestInput,
} from "../schemas/cm-procurement.schema";

/** Every write here is an RPC call -- cm_submit_purchase_request / cm_decide_purchase_request (migration 0212) are security definer. */

export async function submitPurchaseRequestAction(input: SubmitPurchaseRequestInput): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = submitPurchaseRequestSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cm_submit_purchase_request", {
    p_project_id: parsed.data.projectId,
    p_material_id: parsed.data.materialId,
    p_requested_quantity: parsed.data.requestedQuantity,
    p_reason: parsed.data.reason || null,
  });
  if (error) return actionError(error.message);

  revalidatePath("/construction-finance");
  return actionSuccess({ id: data as string });
}

export async function decidePurchaseRequestAction(input: DecidePurchaseRequestInput): Promise<ActionResult> {
  await requireSession();
  const parsed = decidePurchaseRequestSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.rpc("cm_decide_purchase_request", {
    p_id: parsed.data.id,
    p_approve: parsed.data.approve,
    p_reason: parsed.data.reason || null,
  });
  if (error) return actionError(error.message);

  revalidatePath("/construction-finance");
  return actionSuccess();
}
