import { NextResponse } from "next/server";

import { getWhatsAppConnector } from "@/lib/ai/connectors/manager";

export const dynamic = "force-dynamic";

/**
 * TEMPORARY production diagnostic — open this URL directly in a browser to
 * see exactly which WhatsApp/runtime env vars this deployment resolves at
 * request time, plus a LIVE call to Whacenter's own /statusDevice endpoint
 * (see WhatsAppConnector.healthCheck) -- this is the only way to see whether
 * the paired phone's WhatsApp session is actually CONNECTED right now and
 * which phone number it's connected as, since that state lives entirely on
 * Whacenter's side (a QR-paired session, not something our own config can
 * attest to). Every field is a boolean/non-secret label; never a token
 * value. Remove once inbound webhook traffic is confirmed flowing again.
 */
export async function GET() {
  const accessToken = Boolean(process.env.WHATSAPP_ACCESS_TOKEN);
  const phoneNumberId = Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID);
  const businessAccountId = Boolean(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID);
  const verifyToken = Boolean(process.env.WHATSAPP_VERIFY_TOKEN);
  const whacenterDeviceId = Boolean(process.env.WHACENTER_DEVICE_ID);

  let deviceHealth: { ok: boolean; detail: string } | { error: string };
  try {
    const connector = getWhatsAppConnector();
    deviceHealth = connector ? await connector.healthCheck() : { error: "getWhatsAppConnector() returned null -- WHACENTER_DEVICE_ID not set" };
  } catch (err) {
    deviceHealth = { error: err instanceof Error ? err.message : String(err) };
  }

  return NextResponse.json({
    WHATSAPP_ACCESS_TOKEN: accessToken,
    WHATSAPP_PHONE_NUMBER_ID: phoneNumberId,
    WHATSAPP_BUSINESS_ACCOUNT_ID: businessAccountId,
    WHATSAPP_VERIFY_TOKEN: verifyToken,
    WHACENTER_DEVICE_ID: whacenterDeviceId,
    isConfigured: whacenterDeviceId,
    whacenterDeviceHealth: deviceHealth,
    deploymentEnvironment: process.env.VERCEL_ENV ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
  });
}
