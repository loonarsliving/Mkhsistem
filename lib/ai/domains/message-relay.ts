import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { generateAIText } from "../service";
import { sendWhatsAppImage, sendWhatsAppText } from "../notifications/engine";

export type MessageRelayOutcome = "not_a_relay_request" | "relayed" | "failed";

export interface MessageRelayResult {
  outcome: MessageRelayOutcome;
  /** Names of employees the message/photo(s) were successfully sent to. */
  relayedNames: string[];
  /** Descriptors (as mentioned in the message) that matched no active employee. */
  notFoundDescriptions: string[];
  /** Descriptors that matched more than one employee, each with its candidate names. */
  ambiguousDescriptions: { descriptor: string; candidateNames: string[] }[];
  /** Employees that were correctly resolved but the WhatsApp send itself failed. */
  sendFailedNames: string[];
  /** How many photos were relayed (0 for a text-only relay). */
  photoCount: number;
}

const ROLE_KEYS = ["super_admin", "direktur_utama", "direktur_operasional", "hr", "kepala_cabang", "finance", "manager", "sales", "markom", "staff"] as const;
type RoleKey = (typeof ROLE_KEYS)[number];

interface RecipientDescriptor {
  type: "person_name" | "role_at_branch";
  personName: string | null;
  roleKey: RoleKey | null;
  branchName: string | null;
  /** Human-readable label for this descriptor, for not-found/ambiguous reporting. */
  label: string;
}

interface RelayExtraction {
  isRelayRequest: boolean;
  recipients: RecipientDescriptor[];
  messageToRelay: string | null;
}

function parseRelayExtractionJson(text: string): RelayExtraction {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const parsed = JSON.parse(cleaned) as {
    isRelayRequest?: boolean;
    recipients?: { type?: string; personName?: string; roleKey?: string; branchName?: string }[];
    messageToRelay?: string;
  };

  const recipients: RecipientDescriptor[] = Array.isArray(parsed.recipients)
    ? parsed.recipients
        .map((r): RecipientDescriptor | null => {
          if (r.type === "person_name" && typeof r.personName === "string" && r.personName.trim()) {
            return { type: "person_name", personName: r.personName.trim(), roleKey: null, branchName: null, label: r.personName.trim() };
          }
          if (r.type === "role_at_branch" && (ROLE_KEYS as readonly string[]).includes(r.roleKey ?? "")) {
            const branchName = typeof r.branchName === "string" && r.branchName.trim() ? r.branchName.trim() : null;
            return {
              type: "role_at_branch",
              personName: null,
              roleKey: r.roleKey as RoleKey,
              branchName,
              label: branchName ? `${r.roleKey} ${branchName}` : (r.roleKey as string),
            };
          }
          return null;
        })
        .filter((r): r is RecipientDescriptor => r !== null)
    : [];

  return {
    isRelayRequest: parsed.isRelayRequest === true,
    recipients,
    messageToRelay: typeof parsed.messageToRelay === "string" && parsed.messageToRelay.trim() ? parsed.messageToRelay.trim() : null,
  };
}

/** Shared by the text and image relay paths -- one Gemini call determines relay intent + who (1 or more recipients). */
async function extractRelayIntent(senderEmployee: { name: string }, messageText: string): Promise<RelayExtraction | null> {
  const extractionPrompt = `Pesan/keterangan berikut dikirim oleh karyawan "${senderEmployee.name}" ke asisten AI internal perusahaan lewat WhatsApp. Tentukan apakah ini permintaan untuk MENERUSKAN/MENYAMPAIKAN sesuatu ke KARYAWAN LAIN yang disebutkan (bukan pertanyaan biasa untuk AI, bukan minta AI membuatkan sesuatu untuk pengirim sendiri). Bisa jadi ditujukan ke LEBIH DARI SATU orang sekaligus (mis. "sampaikan ke Vando dan kepala cabang Makassar").

Pesan/keterangan: "${messageText}"

Kalau ini permintaan meneruskan, sebutkan SEMUA penerima yang disebut (array, boleh 1 atau lebih), masing-masing salah satu dari:
- "person_name": kalau disebut nama orang spesifik (mis. "Vando", "Budi").
- "role_at_branch": kalau disebut jabatan + cabang (mis. "kepala cabang Makassar", "finance Jogja", "direktur operasional"). Role key HARUS salah satu dari: ${ROLE_KEYS.join(", ")}. Kalau tidak sebut cabang spesifik, branchName boleh null.

Balas HANYA dengan JSON (tanpa markdown code fence): {"isRelayRequest": true/false, "recipients": [{"type": "person_name atau role_at_branch", "personName": "nama apa adanya atau null", "roleKey": "salah satu role key di atas atau null", "branchName": "nama cabang apa adanya atau null"}], "messageToRelay": "isi pesan/instruksi yang harus disampaikan, ditulis ulang jelas dalam Bahasa Indonesia, null jika isRelayRequest false"}`;

  try {
    const response = await generateAIText({
      systemPrompt: "Kamu adalah pengklasifikasi intent pesan WhatsApp internal perusahaan. Balas HANYA dengan JSON sesuai instruksi, tanpa penjelasan tambahan.",
      userPrompt: extractionPrompt,
      maxOutputTokens: 768,
    });
    const extraction = parseRelayExtractionJson(response.text);
    if (!extraction.isRelayRequest || extraction.recipients.length === 0) return null;
    return extraction;
  } catch {
    return null;
  }
}

interface EmployeeRow {
  id: string;
  full_name: string;
  phone: string;
}

/** Resolves ONE descriptor into 0, 1, or many active employees (never the sender). */
function matchDescriptor(descriptor: RecipientDescriptor, employees: { id: string; full_name: string; phone: string; role_key: string | null; branch_name: string | null }[]): EmployeeRow[] {
  if (descriptor.type === "person_name" && descriptor.personName) {
    const needle = descriptor.personName.toLowerCase();
    return employees
      .filter((e) => e.full_name.toLowerCase().includes(needle) || needle.split(/\s+/).some((word) => word.length >= 3 && e.full_name.toLowerCase().includes(word)))
      .map((e) => ({ id: e.id, full_name: e.full_name, phone: e.phone }));
  }
  if (descriptor.type === "role_at_branch" && descriptor.roleKey) {
    const branchNeedle = descriptor.branchName?.toLowerCase().trim();
    return employees
      .filter((e) => e.role_key === descriptor.roleKey && (!branchNeedle || (e.branch_name ?? "").toLowerCase().includes(branchNeedle)))
      .map((e) => ({ id: e.id, full_name: e.full_name, phone: e.phone }));
  }
  return [];
}

interface ResolvedRecipients {
  resolved: EmployeeRow[];
  notFoundDescriptions: string[];
  ambiguousDescriptions: { descriptor: string; candidateNames: string[] }[];
}

async function resolveAllRecipients(senderEmployeeId: string, descriptors: RecipientDescriptor[]): Promise<ResolvedRecipients> {
  const supabase = createAdminClient();
  const { data: raw } = await supabase
    .from("employees")
    .select("id, full_name, phone, branches:branch_id(name), roles:role_id(key)")
    .is("deleted_at", null)
    .eq("employment_status", "active")
    .not("phone", "is", null)
    .neq("id", senderEmployeeId);

  const employees = (raw ?? []).map((e) => ({
    id: e.id,
    full_name: e.full_name,
    phone: e.phone as string,
    role_key: (e.roles as unknown as { key: string } | null)?.key ?? null,
    branch_name: (e.branches as unknown as { name: string } | null)?.name ?? null,
  }));

  const resolvedById = new Map<string, EmployeeRow>();
  const notFoundDescriptions: string[] = [];
  const ambiguousDescriptions: { descriptor: string; candidateNames: string[] }[] = [];

  for (const descriptor of descriptors) {
    const matches = matchDescriptor(descriptor, employees);
    if (matches.length === 0) {
      notFoundDescriptions.push(descriptor.label);
    } else if (matches.length > 1) {
      ambiguousDescriptions.push({ descriptor: descriptor.label, candidateNames: matches.map((m) => m.full_name) });
    } else {
      resolvedById.set(matches[0].id, matches[0]);
    }
  }

  return { resolved: [...resolvedById.values()], notFoundDescriptions, ambiguousDescriptions };
}

/**
 * "Sampaikan ke X: Y" (or "ke X dan Y") is a real, common instruction
 * pattern from employees (especially Super Admin/owner) via the internal
 * WhatsApp AI -- but the general Q&A pipeline (routeAndAnswer) had no way
 * to actually act on it, so Gemini just role-played politeness ("Baik,
 * saya akan segera meneruskan pesan ini...") with zero follow-through -- a
 * false promise the recipient never received. This intercepts that
 * pattern BEFORE the general chat prompt.
 *
 * Also the single entry point for photo relay: if the sender has any
 * recently-sent, not-yet-claimed photos staged in wa_pending_media_relay
 * (0113 -- e.g. they sent 2 bukti transfer photos, then this text names
 * who they're for), ALL of those photos are sent together instead of a
 * plain text message -- letting "2 foto sekaligus" actually work instead
 * of only ever relaying one photo per caption.
 *
 * Deliberately never names the original sender in the outgoing message
 * (per owner's explicit instruction) -- it reads as coming from MK
 * Connect itself. senderEmployee is only used for Gemini context.
 */
export async function tryRelayToEmployees(senderEmployee: { id: string; name: string }, senderWaNumber: string, messageText: string): Promise<MessageRelayResult> {
  const extraction = await extractRelayIntent(senderEmployee, messageText);
  if (!extraction) return { outcome: "not_a_relay_request", relayedNames: [], notFoundDescriptions: [], ambiguousDescriptions: [], sendFailedNames: [], photoCount: 0 };

  const { resolved, notFoundDescriptions, ambiguousDescriptions } = await resolveAllRecipients(senderEmployee.id, extraction.recipients);

  const supabase = createAdminClient();
  const { data: pendingPhotos } = await supabase
    .from("wa_pending_media_relay")
    .select("id, image_url")
    .eq("sender", senderWaNumber)
    .gte("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .order("created_at", { ascending: true });

  const relayedNames: string[] = [];
  const sendFailedNames: string[] = [];

  for (const recipient of resolved) {
    if (pendingPhotos && pendingPhotos.length > 0) {
      let allOk = true;
      for (let i = 0; i < pendingPhotos.length; i++) {
        const caption = i === 0 ? `📋 Dari MK Connect${extraction.messageToRelay ? `: ${extraction.messageToRelay}` : ""}` : undefined;
        const sendResult = await sendWhatsAppImage(recipient.phone, pendingPhotos[i].image_url, caption);
        if (!sendResult.success) allOk = false;
      }
      if (allOk) relayedNames.push(recipient.full_name);
      else sendFailedNames.push(recipient.full_name);
    } else {
      const relayText = `📋 Instruksi dari MK Connect:\n\n${extraction.messageToRelay ?? messageText}`;
      const sendResult = await sendWhatsAppText(recipient.phone, relayText);
      if (sendResult.success) relayedNames.push(recipient.full_name);
      else sendFailedNames.push(recipient.full_name);
    }
  }

  if (relayedNames.length > 0 && pendingPhotos && pendingPhotos.length > 0) {
    await supabase
      .from("wa_pending_media_relay")
      .delete()
      .in(
        "id",
        pendingPhotos.map((p) => p.id),
      );
  }

  return {
    outcome: relayedNames.length > 0 ? "relayed" : "failed",
    relayedNames,
    notFoundDescriptions,
    ambiguousDescriptions,
    sendFailedNames,
    photoCount: pendingPhotos?.length ?? 0,
  };
}

/** Stages an inbound photo for later batch relay -- called for every image the connector receives from a recognized employee, regardless of whether it has a caption yet. */
export async function stagePendingPhoto(senderWaNumber: string, employeeId: string, imageUrl: string, caption: string | undefined): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from("wa_pending_media_relay").insert({ sender: senderWaNumber, employee_id: employeeId, image_url: imageUrl, caption: caption ?? null });
}

/** True if this sender already has at least one other unclaimed staged photo -- used to avoid repeating the "foto diterima" prompt for every photo in a multi-photo batch. */
export async function hasOtherPendingPhotos(senderWaNumber: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { count } = await supabase
    .from("wa_pending_media_relay")
    .select("id", { count: "exact", head: true })
    .eq("sender", senderWaNumber)
    .gte("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString());
  return (count ?? 0) > 0;
}

/** Builds the human-readable confirmation sent back to the sender, honest about partial success -- never a blanket "sudah diteruskan" if part of it failed. */
export function formatRelayReply(result: MessageRelayResult): string {
  const parts: string[] = [];
  const noun = result.photoCount > 0 ? `${result.photoCount} foto` : "Pesan";

  if (result.relayedNames.length > 0) {
    parts.push(`✅ ${noun} sudah diteruskan ke ${result.relayedNames.join(", ")} via WhatsApp.`);
  }
  if (result.notFoundDescriptions.length > 0) {
    parts.push(`Tidak ditemukan karyawan aktif untuk: ${result.notFoundDescriptions.join(", ")}.`);
  }
  for (const amb of result.ambiguousDescriptions) {
    parts.push(`"${amb.descriptor}" cocok dengan lebih dari satu orang: ${amb.candidateNames.join(", ")} -- sebutkan nama lengkap.`);
  }
  if (result.sendFailedNames.length > 0) {
    parts.push(`Gagal terkirim ke: ${result.sendFailedNames.join(", ")} (cek nomor HP-nya di data karyawan).`);
  }
  return parts.join("\n");
}
