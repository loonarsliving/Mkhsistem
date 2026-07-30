import { NextResponse } from "next/server";

import { getWhatsAppConnector } from "@/lib/ai/connectors/manager";
import { requireFilehubBridgeAuth } from "@/lib/security/bridge-auth";

export const dynamic = "force-dynamic";

/**
 * Outbound WhatsApp bridge for the Villa app, called only by the file hub
 * (filehub-loonars, api/wa/send.js). Chain: villa-api Edge Function → file
 * hub → this route → WhatsAppConnector → Whacenter. Villa never holds the
 * Whacenter device credential; it lives here (WHACENTER_DEVICE_ID), and
 * every send goes through the same connector as this app's own messages —
 * so number sanitizing and ai_integration_logs logging apply to Villa
 * traffic too, for free.
 *
 * The response body is the connector's SendResult verbatim; villa-api
 * records it in its own wa_messages_log, so success/failure stays visible
 * on the Villa side without this route writing to Villa's tables.
 */
export async function POST(request: Request) {
  const denied = requireFilehubBridgeAuth(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "body must be JSON" }, { status: 400 });
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const phone = typeof record.phone === "string" ? record.phone.trim() : "";
  const message = typeof record.message === "string" ? record.message.trim() : "";
  if (!phone || !message) {
    return NextResponse.json({ success: false, error: "phone dan message wajib diisi" }, { status: 400 });
  }
  // Whacenter's /send takes plain text; 4096 mirrors WhatsApp's own message
  // cap so an oversized payload fails loudly here instead of silently
  // truncating somewhere downstream.
  if (message.length > 4096) {
    return NextResponse.json({ success: false, error: "message melebihi 4096 karakter" }, { status: 400 });
  }

  const connector = getWhatsAppConnector();
  if (!connector) {
    return NextResponse.json({ success: false, error: "Whacenter belum dikonfigurasi (WHACENTER_DEVICE_ID)" }, { status: 503 });
  }

  const result = await connector.sendMessage(phone, { kind: "text", text: message });
  return NextResponse.json(result, { status: result.success ? 200 : 502 });
}
