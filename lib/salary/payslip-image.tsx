import "server-only";

import { ImageResponse } from "next/og";

import { APP_URL } from "@/constants/app";
import { logger } from "@/lib/logger";

import { PAYSLIP_HEIGHT, PAYSLIP_WIDTH, PayslipCard, type PayslipCardInput } from "./payslip-card";

let cachedLogo: string | null | undefined;

/** The logo as a data URI, or null (the card still renders with a text-only header). */
async function loadLogo(): Promise<string | null> {
  if (cachedLogo !== undefined) return cachedLogo;
  try {
    const res = await fetch(`${APP_URL}/branding/logo-mkh.png`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    cachedLogo = `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
    return cachedLogo;
  } catch (err) {
    logger.warn("payslip-image: logo unavailable", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/** Renders the slip gaji card as PNG bytes. */
export async function renderPayslipImage(input: Omit<PayslipCardInput, "logo">): Promise<Buffer> {
  const logo = await loadLogo();
  const image = new ImageResponse(<PayslipCard {...input} logo={logo} />, { width: PAYSLIP_WIDTH, height: PAYSLIP_HEIGHT });
  return Buffer.from(await image.arrayBuffer());
}
