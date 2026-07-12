// MK Connect — sync-inbound Edge Function
//
// Receives cross-system sync events from MKH Property (Finance). Deployed
// with verify_jwt = false (see supabase/config.toml) because this is a
// server-to-server call from another Supabase project's Postgres trigger via
// pg_net, not a browser request — there is no end-user session to verify a
// JWT against. Authentication instead relies on:
//   1. A shared secret (X-Sync-Secret) stored in Supabase Vault on both
//      sides, compared with a constant-time check.
//   2. Idempotency: every request must carry a unique idempotency_key; a
//      duplicate (retry, replay, or genuine double-send) is a no-op that
//      still returns 200 with the previously recorded target_ref, so the
//      sender's retry logic never needs special-casing "already applied".
//
// Currently the only inbound event type is `finance_payment_confirmed`,
// emitted when the MKH Property CFO confirms a synced Incoming Cash entry
// (see supabase/migrations/0057_crm_payment_finance_sync.sql for the
// outbound half of this flow).
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  if (bufA.length !== bufB.length) return false;
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) diff |= bufA[i] ^ bufB[i];
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: expectedSecret } = await admin.rpc("get_sync_secret");

  const providedSecret = req.headers.get("X-Sync-Secret") ?? "";
  if (!expectedSecret || !timingSafeEqual(providedSecret, expectedSecret)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  let body: {
    sync_log_id?: string;
    idempotency_key?: string;
    event_type?: string;
    source_system?: string;
    payload?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const { idempotency_key, event_type, payload } = body;
  if (!idempotency_key || !event_type || !payload) {
    return new Response(JSON.stringify({ error: "Missing idempotency_key/event_type/payload" }), { status: 400 });
  }

  // Idempotency: record the inbound attempt first. A unique-violation means
  // this event was already processed (or is being processed concurrently) —
  // short-circuit with the previously stored target_ref.
  const { data: inserted, error: insertErr } = await admin
    .from("sync_log")
    .insert({
      direction: "inbound",
      event_type,
      source_table: "mkh_property",
      source_id: crypto.randomUUID(),
      idempotency_key,
      payload,
      status: "sent",
    })
    .select("id")
    .maybeSingle();

  if (insertErr) {
    if (insertErr.code === "23505") {
      const { data: existing } = await admin
        .from("sync_log")
        .select("status, target_ref")
        .eq("idempotency_key", idempotency_key)
        .maybeSingle();
      return new Response(JSON.stringify({ status: "duplicate", target_ref: existing?.target_ref ?? null }), {
        status: 200,
      });
    }
    return new Response(JSON.stringify({ error: insertErr.message }), { status: 500 });
  }

  const syncLogId = inserted!.id as string;

  try {
    let targetRef: string | null = null;

    if (event_type === "finance_payment_confirmed") {
      const mkcPaymentId = payload.mkc_payment_id as string | undefined;
      if (!mkcPaymentId) throw new Error("finance_payment_confirmed payload missing mkc_payment_id");

      const { data: updated, error } = await admin
        .from("prospect_payments")
        .update({
          finance_confirmed_at: (payload.confirmed_at as string) ?? new Date().toISOString(),
          finance_confirmed_by: (payload.confirmed_by as string) ?? "mkh_property",
          finance_reference_no: (payload.jurnal_no as string) ?? null,
        })
        .eq("id", mkcPaymentId)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!updated) throw new Error(`prospect_payments ${mkcPaymentId} not found`);
      targetRef = updated.id as string;
    } else {
      await admin
        .from("sync_log")
        .update({ status: "skipped", last_error: `Unknown event_type: ${event_type}`, updated_at: new Date().toISOString() })
        .eq("id", syncLogId);
      return new Response(JSON.stringify({ status: "skipped", reason: "unknown event_type" }), { status: 200 });
    }

    await admin
      .from("sync_log")
      .update({ status: "succeeded", target_ref: targetRef, updated_at: new Date().toISOString() })
      .eq("id", syncLogId);

    return new Response(JSON.stringify({ status: "ok", target_ref: targetRef }), { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from("sync_log")
      .update({ status: "failed", last_error: message.slice(0, 2000), updated_at: new Date().toISOString() })
      .eq("id", syncLogId);
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});
