import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { generateAIText } from "../service";
import { sendWhatsAppImage, sendWhatsAppText } from "../notifications/engine";

export type MessageRelayOutcome =
  | "not_a_relay_request"
  | "relayed"
  | "recipient_not_found"
  | "recipient_ambiguous"
  | "send_failed";

export interface MessageRelayResult {
  outcome: MessageRelayOutcome;
  recipientName?: string;
  candidateNames?: string[];
}

const ROLE_KEYS = ["super_admin", "direktur_utama", "direktur_operasional", "hr", "kepala_cabang", "finance", "manager", "sales", "markom", "staff"] as const;
type RoleKey = (typeof ROLE_KEYS)[number];

interface RelayExtraction {
  isRelayRequest: boolean;
  recipientType: "person_name" | "role_at_branch" | null;
  recipientPersonName: string | null;
  recipientRoleKey: RoleKey | null;
  recipientBranchName: string | null;
  messageToRelay: string | null;
}

function parseRelayExtractionJson(text: string): RelayExtraction {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const parsed = JSON.parse(cleaned) as Partial<RelayExtraction>;
  return {
    isRelayRequest: parsed.isRelayRequest === true,
    recipientType: parsed.recipientType === "person_name" || parsed.recipientType === "role_at_branch" ? parsed.recipientType : null,
    recipientPersonName: typeof parsed.recipientPersonName === "string" && parsed.recipientPersonName.trim() ? parsed.recipientPersonName.trim() : null,
    recipientRoleKey: (ROLE_KEYS as readonly string[]).includes(parsed.recipientRoleKey ?? "") ? (parsed.recipientRoleKey as RoleKey) : null,
    recipientBranchName: typeof parsed.recipientBranchName === "string" && parsed.recipientBranchName.trim() ? parsed.recipientBranchName.trim() : null,
    messageToRelay: typeof parsed.messageToRelay === "string" && parsed.messageToRelay.trim() ? parsed.messageToRelay.trim() : null,
  };
}

/** Shared by tryRelayMessageToEmployee and tryRelayImageToEmployee -- one Gemini call determines relay intent + who, both callers just differ in WHAT gets sent to the resolved recipient (text vs. an image). */
async function extractRelayIntent(senderEmployee: { name: string }, messageText: string, requireMessageToRelay: boolean): Promise<RelayExtraction | null> {
  const extractionPrompt = `Pesan/keterangan berikut dikirim oleh karyawan "${senderEmployee.name}" ke asisten AI internal perusahaan lewat WhatsApp. Tentukan apakah ini permintaan untuk MENERUSKAN/MENYAMPAIKAN sesuatu ke KARYAWAN LAIN yang disebutkan (bukan pertanyaan biasa untuk AI, bukan minta AI membuatkan sesuatu untuk pengirim sendiri).

Pesan/keterangan: "${messageText}"

Kalau ini permintaan meneruskan, tentukan juga siapa penerimanya:
- "person_name": kalau disebut nama orang spesifik (mis. "Vando", "Budi").
- "role_at_branch": kalau disebut jabatan + cabang (mis. "kepala cabang Makassar", "finance Jogja", "direktur operasional"). Role key HARUS salah satu dari: ${ROLE_KEYS.join(", ")}. Kalau tidak sebut cabang spesifik (mis. "direktur operasional" saja), recipientBranchName boleh null.

Balas HANYA dengan JSON (tanpa markdown code fence): {"isRelayRequest": true/false, "recipientType": "person_name atau role_at_branch, null jika isRelayRequest false", "recipientPersonName": "nama orang apa adanya, null jika recipientType bukan person_name", "recipientRoleKey": "salah satu role key di atas, null jika recipientType bukan role_at_branch", "recipientBranchName": "nama cabang apa adanya, null jika tidak disebut", "messageToRelay": "isi pesan/instruksi yang harus disampaikan, ditulis ulang jelas dalam Bahasa Indonesia, null jika isRelayRequest false"}`;

  let extraction: RelayExtraction;
  try {
    const response = await generateAIText({
      systemPrompt: "Kamu adalah pengklasifikasi intent pesan WhatsApp internal perusahaan. Balas HANYA dengan JSON sesuai instruksi, tanpa penjelasan tambahan.",
      userPrompt: extractionPrompt,
      maxOutputTokens: 512,
    });
    extraction = parseRelayExtractionJson(response.text);
  } catch {
    return null;
  }

  if (!extraction.isRelayRequest || !extraction.recipientType) return null;
  if (requireMessageToRelay && !extraction.messageToRelay) return null;
  return extraction;
}

interface RecipientCandidate {
  id: string;
  full_name: string;
  phone: string;
}

/** Resolves person_name/role_at_branch extraction into 0, 1, or many active employees -- never the sender themselves. */
async function resolveRecipients(senderEmployeeId: string, extraction: RelayExtraction): Promise<RecipientCandidate[]> {
  const supabase = createAdminClient();
  const { data: employees } = await supabase
    .from("employees")
    .select("id, full_name, phone, branch_id, role_id, branches:branch_id(name), roles:role_id(key)")
    .is("deleted_at", null)
    .eq("employment_status", "active")
    .not("phone", "is", null)
    .neq("id", senderEmployeeId);

  if (extraction.recipientType === "person_name" && extraction.recipientPersonName) {
    const needle = extraction.recipientPersonName.toLowerCase();
    return (employees ?? [])
      .filter((e) => e.full_name.toLowerCase().includes(needle) || needle.split(/\s+/).some((word) => word.length >= 3 && e.full_name.toLowerCase().includes(word)))
      .map((e) => ({ id: e.id, full_name: e.full_name, phone: e.phone as string }));
  }
  if (extraction.recipientType === "role_at_branch" && extraction.recipientRoleKey) {
    const branchNeedle = extraction.recipientBranchName?.toLowerCase().trim();
    return (employees ?? [])
      .filter((e) => {
        const role = e.roles as unknown as { key: string } | null;
        if (role?.key !== extraction.recipientRoleKey) return false;
        if (!branchNeedle) return true;
        const branch = e.branches as unknown as { name: string } | null;
        return (branch?.name ?? "").toLowerCase().includes(branchNeedle);
      })
      .map((e) => ({ id: e.id, full_name: e.full_name, phone: e.phone as string }));
  }
  return [];
}

/**
 * "Sampaikan ke X: Y" is a real, common instruction pattern from employees
 * (especially Super Admin/owner) via the internal WhatsApp AI -- but the
 * general Q&A pipeline (routeAndAnswer) had no way to actually act on it,
 * so Gemini just role-played politeness ("Baik, saya akan segera
 * meneruskan pesan ini...") with zero follow-through -- a false promise
 * the recipient never received. This intercepts that pattern BEFORE the
 * general chat prompt, extracts who + what via one Gemini call (recipient
 * can be named directly, e.g. "Vando", or described by role+branch, e.g.
 * "kepala cabang Makassar" -- both are how people actually talk), resolves
 * the real employee via the DB, and genuinely sends the WhatsApp message
 * -- so the confirmation reply is never a lie about something that
 * happened.
 */
export async function tryRelayMessageToEmployee(senderEmployee: { id: string; name: string }, messageText: string): Promise<MessageRelayResult> {
  const extraction = await extractRelayIntent(senderEmployee, messageText, true);
  if (!extraction) return { outcome: "not_a_relay_request" };

  const candidates = await resolveRecipients(senderEmployee.id, extraction);
  if (candidates.length === 0) return { outcome: "recipient_not_found" };
  if (candidates.length > 1) return { outcome: "recipient_ambiguous", candidateNames: candidates.map((c) => c.full_name) };

  const recipient = candidates[0];
  const relayText = `Pesan dari ${senderEmployee.name} (diteruskan oleh AI MK Connect):\n\n${extraction.messageToRelay}`;
  const sendResult = await sendWhatsAppText(recipient.phone, relayText);
  if (!sendResult.success) return { outcome: "send_failed", recipientName: recipient.full_name };

  return { outcome: "relayed", recipientName: recipient.full_name };
}

/**
 * Same intent -- "kirim ini ke X" -- but for an image (e.g. bukti
 * transfer). Only the caption text carries the recipient instruction (an
 * image with no caption has nothing to detect intent from, so this
 * short-circuits to not_a_relay_request rather than spending a Gemini call
 * on it). Forwards the real image via sendWhatsAppImage, keeping the
 * original caption attached so the recipient sees the same context the
 * sender wrote, plus a one-line attribution.
 */
export async function tryRelayImageToEmployee(senderEmployee: { id: string; name: string }, caption: string | undefined, imageUrl: string): Promise<MessageRelayResult> {
  if (!caption || caption.trim().length === 0) return { outcome: "not_a_relay_request" };

  const extraction = await extractRelayIntent(senderEmployee, caption, false);
  if (!extraction) return { outcome: "not_a_relay_request" };

  const candidates = await resolveRecipients(senderEmployee.id, extraction);
  if (candidates.length === 0) return { outcome: "recipient_not_found" };
  if (candidates.length > 1) return { outcome: "recipient_ambiguous", candidateNames: candidates.map((c) => c.full_name) };

  const recipient = candidates[0];
  const relayCaption = `Dari ${senderEmployee.name} (diteruskan oleh AI MK Connect)${extraction.messageToRelay ? `: ${extraction.messageToRelay}` : ""}`;
  const sendResult = await sendWhatsAppImage(recipient.phone, imageUrl, relayCaption);
  if (!sendResult.success) return { outcome: "send_failed", recipientName: recipient.full_name };

  return { outcome: "relayed", recipientName: recipient.full_name };
}
