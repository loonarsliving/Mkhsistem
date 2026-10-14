/**
 * Pure helpers for the refund customer chat (no server-only imports, so they
 * can be unit-tested directly).
 */

export type RefundInboundContent =
  | { kind: "text"; text: string }
  | { kind: "image"; url: string; caption?: string }
  | { kind: "raw"; text: string };

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Same tolerant rule as webhook-handler.ts's findEmployeeByPhone: compare the
 * last 9 digits, so "0852..." on the spreadsheet matches the "62852..." id
 * WhatsApp sends. Anything shorter than 9 digits never matches.
 */
export function refundPhonesMatch(storedPhone: string, sender: string): boolean {
  const stored = digitsOnly(storedPhone);
  const incoming = digitsOnly(sender);
  if (stored.length < 9 || incoming.length < 9) return false;
  return stored.slice(-9) === incoming.slice(-9);
}

export function formatRefundInboundBody(content: RefundInboundContent): string {
  if (content.kind === "image") {
    const caption = content.caption?.trim();
    return `[Foto]${caption ? ` ${caption}` : ""}\n${content.url}`;
  }
  const text = content.text.trim();
  return content.kind === "raw" ? `[Pesan non-teks] ${text}`.trim() : text || "[pesan kosong]";
}
