import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * TEMPORARY production diagnostic — open this URL directly in a browser to
 * see exactly which WhatsApp/runtime env vars this deployment resolves at
 * request time. Every field is a boolean or a non-secret runtime label;
 * never the actual variable value. Remove once the getWhatsAppConnector()
 * null-return root cause is confirmed.
 */
export async function GET() {
  const accessToken = Boolean(process.env.WHATSAPP_ACCESS_TOKEN);
  const phoneNumberId = Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID);
  const businessAccountId = Boolean(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID);
  const verifyToken = Boolean(process.env.WHATSAPP_VERIFY_TOKEN);

  return NextResponse.json({
    WHATSAPP_ACCESS_TOKEN: accessToken,
    WHATSAPP_PHONE_NUMBER_ID: phoneNumberId,
    WHATSAPP_BUSINESS_ACCOUNT_ID: businessAccountId,
    WHATSAPP_VERIFY_TOKEN: verifyToken,
    isConfigured: accessToken && phoneNumberId && businessAccountId && verifyToken,
    deploymentEnvironment: process.env.VERCEL_ENV ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
  });
}
