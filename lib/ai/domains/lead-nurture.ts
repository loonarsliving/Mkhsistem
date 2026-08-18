import "server-only";

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

import type { AdReferral } from "../connectors/types";
import { sendWhatsAppImage, sendWhatsAppText } from "../notifications/engine";
import { generateAIText } from "../service";
import { routeAdDrivenLead } from "./ad-lead-routing";

/**
 * AI-nurture-first replacement for the old "ad click -> instantly notify a
 * round-robin Sales" behavior (lib/ai/domains/ad-lead-routing.ts). Gemini
 * now talks to the lead directly, answering only from knowledge_base for
 * the matched project, and a branch's Kepala Cabang is only pinged once the
 * conversation crosses the HOT threshold (see detectHotTransition below).
 * Sales assignment stays manual (Kepala Cabang picks someone via plain
 * WhatsApp chat) -- prospects.sales_id is still auto-populated by the same
 * round-robin pick ad-lead-routing.ts used, purely to satisfy the NOT NULL
 * FK and every existing RLS policy/report that already assumes it; it is
 * never used to push a notification here.
 */

const SIGNAL_KEYS = ["survey_schedule", "payment_scheme_specific", "ready_or_full_data"] as const;
type SignalKey = (typeof SIGNAL_KEYS)[number];

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function isSignalKey(value: string): value is SignalKey {
  return (SIGNAL_KEYS as readonly string[]).includes(value);
}

function computeTemperature(signals: SignalKey[]): "cold" | "warm" | "hot" {
  if (signals.length >= 2) return "hot";
  if (signals.length >= 1) return "warm";
  return "cold";
}

interface NurtureModelOutput {
  reply_to_lead: string;
  answered_from_knowledge: boolean;
  unanswered_question: string | null;
  lead_summary: string;
  /** knowledge_base ids (from the KB block fed into the prompt) whose attached image/denah is relevant to this reply -- sent as separate WhatsApp images right after reply_to_lead. */
  image_knowledge_ids?: string[];
  signals: Partial<Record<SignalKey, boolean>>;
}

interface KnowledgeRow {
  id: string;
  kategori: string;
  pertanyaan_umum: string;
  jawaban: string;
  image_url: string | null;
}

/** Best-effort JSON parse -- Gemini occasionally wraps JSON in a ```json fence despite responseFormat: "json" asking it not to. */
function parseModelOutput(raw: string): NurtureModelOutput | null {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "");
  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.reply_to_lead !== "string") return null;
    return parsed as NurtureModelOutput;
  } catch {
    return null;
  }
}

function buildSystemPrompt(
  projectName: string,
  brandContext: string,
  aiMode: "nurture" | "standby",
  knowledge: KnowledgeRow[],
): string {
  const kbBlock =
    knowledge.length > 0
      ? knowledge
          .map(
            (k) =>
              `- [ID: ${k.id}] [${k.kategori}] Q: ${k.pertanyaan_umum}\n   A: ${k.jawaban}${k.image_url ? "\n   (punya lampiran gambar -- sertakan ID ini di image_knowledge_ids kalau relevan dengan pertanyaan lead saat ini)" : ""}`,
          )
          .join("\n")
      : "(belum ada data knowledge untuk project ini -- anggap semua pertanyaan lead sebagai belum terjawab)";

  return `Anda adalah asisten WhatsApp untuk properti "${projectName}"${brandContext ? `, bagian dari ${brandContext}` : ""}. Anda membalas calon pembeli (lead) yang baru saja klik iklan Facebook/Instagram/WhatsApp, dengan gaya chat WhatsApp yang ramah, natural, dan SINGKAT (2-4 kalimat, boleh 1 emoji jika pas, jangan kaku seperti FAQ).

ATURAN PALING PENTING -- JANGAN PERNAH DILANGGAR:
- HANYA jawab berdasarkan KNOWLEDGE BASE di bawah. Dilarang keras mengarang atau menebak informasi (harga, unit, fasilitas, skema pembayaran, lokasi persis, dll) yang tidak ada di knowledge base.
- Kalau jawaban pertanyaan lead TIDAK ada di knowledge base: set "answered_from_knowledge": false, isi "unanswered_question" dengan pertanyaan lead (boleh dirapikan bahasanya), dan buat "reply_to_lead" berupa pesan penahan yang ramah -- contoh gaya: "Baik kak, untuk itu saya cek dulu ke tim ya, mohon ditunggu sebentar ya 🙏". Jangan menjanjikan waktu spesifik.
- Kalau jawabannya ADA di knowledge base: jawab natural dengan bahasa sendiri, "answered_from_knowledge": true, "unanswered_question": null.
${aiMode === "standby" ? "- PENTING: Lead ini statusnya sudah HOT dan sedang ditangani tim Sales/Kepala Cabang secara langsung. Anda hanya boleh menjawab pertanyaan umum dari knowledge base. JANGAN mendorong closing, JANGAN menawarkan jadwal survey/DP lagi -- biarkan itu jadi tugas tim manusia." : ""}

KNOWLEDGE BASE "${projectName}":
${kbBlock}

DETEKSI SINYAL -- evaluasi dari SELURUH riwayat percakapan (bukan cuma pesan lead yang paling baru):
- survey_schedule: lead menanyakan atau minta jadwal survey/kunjungan lokasi.
- payment_scheme_specific: lead menanyakan DP atau skema pembayaran secara SPESIFIK. Sekadar "berapa harganya" BUKAN sinyal ini.
- ready_or_full_data: lead menyatakan eksplisit siap beli/booking, ATAU sudah memberi data diri lengkap (nama lengkap + identitas/KTP, dsb).

Juga ringkas dalam 1 kalimat singkat apa yang diminati lead sejauh ini (unit/lokasi/budget yang disebut, kalau ada) di "lead_summary" -- kosongkan jika belum ada info berarti.

Kalau ada knowledge di atas yang punya lampiran gambar (ditandai "punya lampiran gambar") dan relevan dengan pertanyaan lead saat ini (misalnya lead minta denah/foto/brosur), masukkan ID knowledge itu ke "image_knowledge_ids" (array of string, boleh lebih dari satu, boleh kosong kalau tidak relevan) -- gambar itu akan otomatis dikirim terpisah setelah balasan teks Anda.

Balas HANYA JSON valid persis struktur berikut, tanpa markdown/backtick, tanpa teks lain di luar JSON:
{"reply_to_lead": "...", "answered_from_knowledge": true, "unanswered_question": null, "lead_summary": "...", "image_knowledge_ids": [], "signals": {"survey_schedule": false, "payment_scheme_specific": false, "ready_or_full_data": false}}`;
}

function renderTranscript(history: { sender: string; message: string }[]): string {
  return history
    .map(
      (h) =>
        `${h.sender === "lead" ? "Lead" : h.sender === "admin" ? "Admin" : "AI"}: ${h.message}`,
    )
    .join("\n");
}

interface CampaignMatch {
  projectId: string;
  projectName: string;
  branchId: string;
  brandContext: string;
}

async function findCampaignBySourceId(sourceId: string): Promise<CampaignMatch | null> {
  const supabase = createAdminClient();
  const { data: campaign } = await supabase
    .from("meta_ad_campaigns")
    .select("project_id, branch_id, project:project_id(name, city)")
    .or(`meta_ad_id.eq.${sourceId},meta_adset_id.eq.${sourceId},meta_creative_id.eq.${sourceId}`)
    .limit(1)
    .maybeSingle();

  if (!campaign || !campaign.project_id) return null;
  const project = campaign.project as { name?: string; city?: string } | null;
  return {
    projectId: campaign.project_id,
    projectName: project?.name ?? "properti kami",
    branchId: campaign.branch_id,
    brandContext: project?.city ? `Maha Karya Haluoleo (${project.city})` : "Maha Karya Haluoleo",
  };
}

type ProspectRow = {
  id: string;
  phone: string;
  project_id: string | null;
  branch_id: string;
  ai_mode: "nurture" | "standby";
  lead_temperature: "cold" | "warm" | "hot";
  temperature_signals: unknown;
};

/** Existing prospect for this phone number, regardless of how it was found (ad click today, or a plain follow-up message tomorrow). */
async function findProspectByPhone(sender: string): Promise<ProspectRow | null> {
  const supabase = createAdminClient();
  const senderDigits = digitsOnly(sender);
  const { data } = await supabase
    .from("prospects")
    .select("id, phone, project_id, branch_id, ai_mode, lead_temperature, temperature_signals")
    .eq("phone_normalized", senderDigits)
    .eq("lead_source", "facebook_ads")
    .is("deleted_at", null)
    .maybeSingle();
  return (data as ProspectRow | null) ?? null;
}

/** Creates a brand-new prospects row for a fresh ad click, silently round-robin-assigning sales_id (never notified -- see module doc) so the NOT NULL FK is satisfied. Returns null only when no Sales/freelance recipient exists at all (branch misconfigured). */
async function createNurtureProspect(
  sender: string,
  senderName: string | undefined,
  campaign: CampaignMatch,
  adSourceLabel: string,
): Promise<ProspectRow | null> {
  const supabase = createAdminClient();

  const { data: branch } = await supabase
    .from("branches")
    .select("ad_lead_override_employee_id")
    .eq("id", campaign.branchId)
    .maybeSingle();
  const overrideEmployeeId = (branch as { ad_lead_override_employee_id: string | null } | null)
    ?.ad_lead_override_employee_id;

  let salesId: string | null = null;
  if (overrideEmployeeId) {
    salesId = overrideEmployeeId;
  } else {
    const { data: picked } = await supabase
      .rpc("crm_pick_round_robin_sales_or_freelance", {
        p_branch_id: campaign.branchId,
        p_project_id: campaign.projectId,
      })
      .maybeSingle();
    if (picked && (picked as { recipient_type: string }).recipient_type === "sales") {
      salesId = (picked as { recipient_id: string }).recipient_id;
    }
  }

  if (!salesId) {
    logger.info(
      "createNurtureProspect: no Sales recipient available for branch, cannot open a nurture lead",
      { branchId: campaign.branchId },
    );
    return null;
  }

  const { data: inserted, error } = await supabase
    .from("prospects")
    .insert({
      customer_name: senderName || "Lead dari Iklan",
      phone: sender,
      project_id: campaign.projectId,
      house_type: "Belum diketahui",
      city: "-",
      lead_source: "facebook_ads",
      notes: `Lead otomatis dari klik iklan "${adSourceLabel}". Dinurture oleh AI.`,
      sales_id: salesId,
      branch_id: campaign.branchId,
    })
    .select("id, phone, project_id, branch_id, ai_mode, lead_temperature, temperature_signals")
    .single();

  if (error || !inserted) {
    logger.error("createNurtureProspect: prospect insert failed", {
      error: error?.message,
      sender,
    });
    return null;
  }
  return inserted as ProspectRow;
}

async function notifyKepalaCabangHot(
  prospect: ProspectRow,
  projectName: string,
  leadName: string | undefined,
  leadSummary: string,
) {
  const supabase = createAdminClient();
  const { data: kepalaCabangs } = await supabase
    .from("employees")
    .select("id, full_name, phone, roles:role_id(key)")
    .eq("branch_id", prospect.branch_id)
    .eq("employment_status", "active")
    .is("deleted_at", null)
    .not("phone", "is", null);

  const matches = (kepalaCabangs ?? []).filter(
    (e) => (e.roles as unknown as { key: string } | null)?.key === "kepala_cabang",
  );

  const supabaseHistory = createAdminClient();
  const { data: historyRows } = await supabaseHistory
    .from("lead_chat_history")
    .select("sender, message, created_at")
    .eq("prospect_id", prospect.id)
    .order("created_at", { ascending: true })
    .limit(30);

  const transcript = renderTranscript(
    (historyRows ?? []).map((h) => ({ sender: h.sender, message: h.message })),
  );
  const hotAtLabel = new Date().toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Makassar",
  });

  const notifyText =
    `🔥 Lead HOT -- ${projectName}\n` +
    `Nama: ${leadName || "Tidak diketahui"}\n` +
    `WA: ${prospect.phone}\n` +
    `Ringkasan: ${leadSummary || "-"}\n` +
    `Jadi HOT pada: ${hotAtLabel}\n\n` +
    `Riwayat chat:\n${transcript || "(belum ada riwayat)"}\n\n` +
    `Tolong assign ke Sales via chat biasa ya. AI akan standby (masih bisa jawab pertanyaan umum, tidak lagi mendorong closing).`;

  if (matches.length === 0) {
    logger.error("notifyKepalaCabangHot: no active Kepala Cabang with phone on file for branch", {
      branchId: prospect.branch_id,
    });
    return;
  }

  for (const kc of matches) {
    if (!kc.phone) continue;
    const sendResult = await sendWhatsAppText(kc.phone, notifyText);
    if (!sendResult.success)
      logger.error("notifyKepalaCabangHot: WA notify failed", {
        kepalaCabangId: kc.id,
        error: sendResult.error,
      });
    await supabase.from("mkc_notifications").insert({
      user_id: kc.id,
      type: "crm",
      category: "lead_hot_handoff",
      title: "Lead HOT -- perlu assign Sales",
      body: `${leadName || "Lead"} (${prospect.phone}) jadi HOT di ${projectName}. Assign ke Sales via chat.`,
      link: `/crm/${prospect.id}`,
    });
  }
}

/**
 * Escalates an unanswered question to the (branch-agnostic) Super Admin pool
 * only -- the Kepala Cabang stays out of this immediate escalation and is
 * only looped in later, either via the 20-minute timeout sweep or once the
 * lead actually goes HOT (see notifyKepalaCabangHot). Owner's explicit ask:
 * pertanyaan yang belum terjawab tetap dikirim ke Super Admin saja, jangan
 * ke Kepala Cabang. The branch name is still spelled out in the message
 * (deliberately reusing the same branch_id the nurture bot already resolved
 * from meta_ad_campaigns, see createNurtureProspect /
 * lib/ai/domains/ad-lead-routing.ts) so a Super Admin juggling escalations
 * from every branch at once doesn't repeat the mixup that answered a
 * Property Management (Jogja) question with a Cendana (Makassar) address.
 */
async function notifySuperadminsPendingQuestion(
  code: string,
  question: string,
  prospect: ProspectRow,
  projectName: string,
  leadName: string | undefined,
) {
  const supabase = createAdminClient();
  const [{ data: branch }, { data: employeesRows }] = await Promise.all([
    supabase.from("branches").select("name").eq("id", prospect.branch_id).maybeSingle(),
    supabase
      .from("employees")
      .select("id, phone, roles:role_id(key), branch_id")
      .eq("employment_status", "active")
      .is("deleted_at", null)
      .not("phone", "is", null),
  ]);

  const branchName = branch?.name ?? "-";
  const projectLabel = `${projectName} (Cabang ${branchName})`;

  const superAdmins = (employeesRows ?? []).filter(
    (e) => (e.roles as unknown as { key: string } | null)?.key === "super_admin",
  );

  const notifyText =
    `❓ Pertanyaan lead belum terjawab -- ${projectLabel}\n` +
    `[${code}]\n` +
    `Lead: ${leadName || "Tidak diketahui"} (${prospect.phone})\n` +
    `Pertanyaan: ${question}\n\n` +
    `Balas dengan format: [${code}]: <jawaban Anda> -- jawaban akan otomatis diteruskan ke lead dan disimpan ke knowledge base khusus project ini.`;

  for (const recipient of superAdmins) {
    if (!recipient.phone) continue;
    const sendResult = await sendWhatsAppText(recipient.phone, notifyText);
    if (!sendResult.success)
      logger.error("notifySuperadminsPendingQuestion: WA notify failed", {
        recipientId: recipient.id,
        error: sendResult.error,
      });
  }
}

export type NurtureTurnOutcome = "replied" | "no_recipient_available" | "error";

export interface NurtureTurnResult {
  outcome: NurtureTurnOutcome;
  prospectId?: string;
  temperature?: "cold" | "warm" | "hot";
}

/** Core turn: log the lead's message, ask Gemini (knowledge-base-only), update temperature/mode, escalate or reply. Shared by every entry point below. */
/**
 * Sends a lead one redirect message and hands them off to their branch's
 * Kepala Cabang immediately -- no knowledge-base engagement at all. Used for
 * "handoff" mode projects (see runNurtureTurn) on a lead's first message,
 * and reused standalone by the one-off manual-handoff route
 * (app/api/ai/lead-manual-handoff) to correct a lead who was answered
 * before handoff mode existed for their project.
 */
export async function handoffProspectToKepalaCabang(
  prospectId: string,
  messageToLead: string,
): Promise<{ sent: boolean }> {
  const supabase = createAdminClient();
  const { data: prospect } = await supabase
    .from("prospects")
    .select("id, phone, customer_name, project_id, branch_id")
    .eq("id", prospectId)
    .maybeSingle();
  if (!prospect) return { sent: false };

  await supabase
    .from("lead_chat_history")
    .insert({ prospect_id: prospect.id, sender: "ai", message: messageToLead });
  const sendResult = await sendWhatsAppText(prospect.phone, messageToLead);
  if (!sendResult.success)
    logger.error("handoffProspectToKepalaCabang: WA send to lead failed", {
      prospectId,
      error: sendResult.error,
    });

  await supabase.from("prospects").update({ ai_mode: "standby" }).eq("id", prospect.id);

  const [{ data: project }, { data: branch }, { data: employeesRows }, { data: historyRows }] =
    await Promise.all([
      supabase.from("crm_projects").select("name").eq("id", prospect.project_id ?? "").maybeSingle(),
      supabase.from("branches").select("name").eq("id", prospect.branch_id).maybeSingle(),
      supabase
        .from("employees")
        .select("id, phone, roles:role_id(key)")
        .eq("branch_id", prospect.branch_id)
        .eq("employment_status", "active")
        .is("deleted_at", null)
        .not("phone", "is", null),
      supabase
        .from("lead_chat_history")
        .select("sender, message")
        .eq("prospect_id", prospect.id)
        .order("created_at", { ascending: true })
        .limit(30),
    ]);

  const kepalaCabangs = (employeesRows ?? []).filter(
    (e) => (e.roles as unknown as { key: string } | null)?.key === "kepala_cabang",
  );
  const transcript = renderTranscript(
    (historyRows ?? []).map((h) => ({ sender: h.sender, message: h.message })),
  );

  const notifyText =
    `📞 Lead baru -- ${project?.name ?? "-"} (Cabang ${branch?.name ?? "-"})\n` +
    `Nama: ${prospect.customer_name || "Tidak diketahui"}\n` +
    `WA: ${prospect.phone}\n\n` +
    `Riwayat chat:\n${transcript || "(belum ada riwayat)"}\n\n` +
    `Mohon segera dihubungi langsung ya kak -- project ini ditangani manual, AI hanya mengarahkan.`;

  if (kepalaCabangs.length === 0) {
    logger.error("handoffProspectToKepalaCabang: no active Kepala Cabang with phone on file for branch", {
      branchId: prospect.branch_id,
    });
  }

  for (const kc of kepalaCabangs) {
    if (!kc.phone) continue;
    const kcSendResult = await sendWhatsAppText(kc.phone, notifyText);
    if (!kcSendResult.success)
      logger.error("handoffProspectToKepalaCabang: WA notify failed", {
        kepalaCabangId: kc.id,
        error: kcSendResult.error,
      });
    await supabase.from("mkc_notifications").insert({
      user_id: kc.id,
      type: "crm",
      category: "lead_hot_handoff",
      title: "Lead baru -- perlu ditindaklanjuti",
      body: `${prospect.customer_name || "Lead"} (${prospect.phone}) perlu dihubungi langsung.`,
      link: `/crm/${prospect.id}`,
    });
  }

  return { sent: sendResult.success };
}

/** Handoff-mode turn (see runNurtureTurn): first message hands off immediately; every message after that just gets a short repeat acknowledgement -- never knowledge-base engagement. */
async function runHandoffTurn(prospect: ProspectRow, projectName: string): Promise<NurtureTurnResult> {
  const supabase = createAdminClient();

  if (prospect.ai_mode !== "standby") {
    const redirectText = `Terima kasih sudah menghubungi kami! Untuk ${projectName}, saya sambungkan langsung dengan tim kami ya, mohon ditunggu sebentar 🙏`;
    await handoffProspectToKepalaCabang(prospect.id, redirectText);
  } else {
    const ackText = "Baik kak, mohon ditunggu ya, tim kami akan segera menghubungi 🙏";
    await supabase
      .from("lead_chat_history")
      .insert({ prospect_id: prospect.id, sender: "ai", message: ackText });
    const sendResult = await sendWhatsAppText(prospect.phone, ackText);
    if (!sendResult.success)
      logger.error("runHandoffTurn: WA send to lead failed", {
        prospectId: prospect.id,
        error: sendResult.error,
      });
  }

  return { outcome: "replied", prospectId: prospect.id, temperature: prospect.lead_temperature };
}

async function runNurtureTurn(
  prospect: ProspectRow,
  leadName: string | undefined,
  incomingText: string,
): Promise<NurtureTurnResult> {
  const supabase = createAdminClient();

  await supabase
    .from("lead_chat_history")
    .insert({ prospect_id: prospect.id, sender: "lead", message: incomingText });

  const [{ data: project }, { data: historyRows }, { data: knowledgeRows }] = await Promise.all([
    supabase
      .from("crm_projects")
      .select("name, city, ai_lead_mode")
      .eq("id", prospect.project_id ?? "")
      .maybeSingle(),
    supabase
      .from("lead_chat_history")
      .select("sender, message")
      .eq("prospect_id", prospect.id)
      .order("created_at", { ascending: true })
      .limit(30),
    supabase
      .from("knowledge_base")
      .select("id, kategori, pertanyaan_umum, jawaban, image_url")
      .eq("project_id", prospect.project_id ?? "")
      .eq("is_active", true),
  ]);
  const knowledge = (knowledgeRows ?? []) as KnowledgeRow[];
  const projectName = project?.name ?? "properti kami";

  // Handoff-mode projects (e.g. Property Management/Kirana -- a partner
  // reseller pitching property owners, not a buyer nurture flow) skip
  // knowledge-base engagement entirely: AI only redirects, a human
  // (Kepala Cabang) takes it from the first message.
  if (project?.ai_lead_mode === "handoff") {
    return runHandoffTurn(prospect, projectName);
  }

  const brandContext = project?.city ? `Maha Karya Haluoleo (${project.city})` : "";
  const systemPrompt = buildSystemPrompt(projectName, brandContext, prospect.ai_mode, knowledge);
  const transcript = renderTranscript(
    (historyRows ?? []).map((h) => ({ sender: h.sender, message: h.message })),
  );

  let modelOutput: NurtureModelOutput | null = null;
  try {
    const response = await generateAIText({
      systemPrompt,
      userPrompt: `Riwayat percakapan sejauh ini:\n${transcript}`,
      temperature: 0.4,
      maxOutputTokens: 700,
      responseFormat: "json",
    });
    modelOutput = parseModelOutput(response.text);
  } catch (err) {
    logger.error("runNurtureTurn: Gemini call failed", {
      prospectId: prospect.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (!modelOutput) {
    // Never invent a reply if Gemini/parsing failed -- hold the lead off exactly like an unanswered-knowledge-base case, without spending a pending_questions escalation on what is an infra failure, not a real content gap.
    const fallback =
      "Maaf kak, sistem kami sedang sibuk. Mohon tunggu sebentar, tim kami akan segera membalas 🙏";
    await supabase
      .from("lead_chat_history")
      .insert({ prospect_id: prospect.id, sender: "ai", message: fallback });
    await sendWhatsAppText(prospect.phone, fallback);
    return { outcome: "error", prospectId: prospect.id };
  }

  const existingSignals = (
    Array.isArray(prospect.temperature_signals) ? prospect.temperature_signals : []
  ).filter((s): s is SignalKey => typeof s === "string" && isSignalKey(s));
  const newSignals = Object.entries(modelOutput.signals ?? {})
    .filter(([key, value]) => value === true && isSignalKey(key))
    .map(([key]) => key as SignalKey);
  const mergedSignals = Array.from(new Set([...existingSignals, ...newSignals]));
  const newTemperature = computeTemperature(mergedSignals);
  const wasNotHot = prospect.lead_temperature !== "hot";
  const becomesHot = newTemperature === "hot" && wasNotHot;

  await supabase
    .from("prospects")
    .update({
      temperature_signals: mergedSignals,
      lead_temperature: newTemperature,
      ...(becomesHot ? { ai_mode: "standby" as const, hot_at: new Date().toISOString() } : {}),
    })
    .eq("id", prospect.id);

  await supabase
    .from("lead_chat_history")
    .insert({ prospect_id: prospect.id, sender: "ai", message: modelOutput.reply_to_lead });

  const sendResult = await sendWhatsAppText(prospect.phone, modelOutput.reply_to_lead);
  if (!sendResult.success)
    logger.error("runNurtureTurn: WA send to lead failed", {
      prospectId: prospect.id,
      error: sendResult.error,
    });

  // Any knowledge_base entries Gemini flagged as relevant (denah/foto/brosur
  // attached to a KB row, see buildSystemPrompt) go out as separate WhatsApp
  // images right after the text reply, in the order Gemini listed them.
  for (const kbId of modelOutput.image_knowledge_ids ?? []) {
    const kbRow = knowledge.find((k) => k.id === kbId);
    if (!kbRow?.image_url) continue;
    const imageSendResult = await sendWhatsAppImage(prospect.phone, kbRow.image_url);
    if (!imageSendResult.success)
      logger.error("runNurtureTurn: WA image send to lead failed", {
        prospectId: prospect.id,
        knowledgeBaseId: kbId,
        error: imageSendResult.error,
      });
    await supabase.from("lead_chat_history").insert({
      prospect_id: prospect.id,
      sender: "ai",
      message: `[gambar terkirim: ${kbRow.pertanyaan_umum}]`,
    });
  }

  if (
    !modelOutput.answered_from_knowledge &&
    modelOutput.unanswered_question &&
    prospect.project_id
  ) {
    const { data: pending, error } = await supabase
      .from("pending_questions")
      .insert({
        prospect_id: prospect.id,
        project_id: prospect.project_id,
        branch_id: prospect.branch_id,
        pertanyaan: modelOutput.unanswered_question,
      })
      .select("code")
      .single();
    if (error || !pending) {
      logger.error("runNurtureTurn: pending_questions insert failed", {
        prospectId: prospect.id,
        error: error?.message,
      });
    } else {
      await notifySuperadminsPendingQuestion(
        pending.code,
        modelOutput.unanswered_question,
        prospect,
        projectName,
        leadName,
      );
    }
  }

  if (becomesHot) {
    await notifyKepalaCabangHot(
      { ...prospect, ai_mode: "standby", lead_temperature: "hot" },
      projectName,
      leadName,
      modelOutput.lead_summary,
    );
  }

  return { outcome: "replied", prospectId: prospect.id, temperature: newTemperature };
}

/** True when this phone already received a lead from the freelancer pipeline (freelance_lead_deliveries) -- freelancers sit outside the branch/Kepala-Cabang org this nurture bot hands off into, so they're deliberately kept on the pre-existing instant-notify flow (see the fallback below), not migrated to nurture. */
async function hasPriorFreelanceDelivery(sender: string): Promise<boolean> {
  const supabase = createAdminClient();
  const senderDigits = digitsOnly(sender);
  const { data } = await supabase
    .from("freelance_lead_deliveries")
    .select("id")
    .eq("phone_normalized", senderDigits)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

/** Entry point A: an inbound WhatsApp message carries a real ad_reply referral (a fresh or repeat click on a Click-to-WhatsApp ad). Falls back to the pre-existing instant-notify routing (lib/ai/domains/ad-lead-routing.ts's routeAdDrivenLead) for anything outside nurture's scope: a lead already in the freelancer pipeline, a branch round-robin that lands on a freelancer, or no recipient at all -- routeAdDrivenLead already handles all three exactly as it did before this module existed. */
export async function handleAdDrivenNurtureLead(
  sender: string,
  senderName: string | undefined,
  adReferral: AdReferral,
  initialMessageText: string,
): Promise<NurtureTurnResult> {
  if (await hasPriorFreelanceDelivery(sender)) {
    const legacy = await routeAdDrivenLead(sender, senderName, adReferral);
    return {
      outcome:
        legacy.outcome === "ad_not_matched" ||
        legacy.outcome === "insert_failed" ||
        legacy.outcome === "no_sales_available"
          ? "no_recipient_available"
          : "replied",
    };
  }

  const campaign = await findCampaignBySourceId(adReferral.sourceId);
  if (!campaign) {
    logger.info("handleAdDrivenNurtureLead: ad not matched to a known campaign", {
      sourceId: adReferral.sourceId,
      sender,
    });
    return { outcome: "no_recipient_available" };
  }

  let prospect = await findProspectByPhone(sender);
  if (!prospect) {
    prospect = await createNurtureProspect(sender, senderName, campaign, adReferral.sourceId);
    if (!prospect) {
      // Round-robin landed on a freelancer, or no recipient exists at all --
      // same fallback as the prior-freelance-delivery case above.
      const legacy = await routeAdDrivenLead(sender, senderName, adReferral);
      return {
        outcome:
          legacy.outcome === "ad_not_matched" ||
          legacy.outcome === "insert_failed" ||
          legacy.outcome === "no_sales_available"
            ? "no_recipient_available"
            : "replied",
      };
    }
  }

  return runNurtureTurn(prospect, senderName, initialMessageText);
}

/** Cheap synchronous check for the webhook handler: does this phone number already have an ad-driven prospects row worth routing to the nurture bot, as opposed to falling through to tryNotifySalesLeadWantsInfo (or being ignored)? */
export async function hasNurtureEligibleLead(sender: string): Promise<boolean> {
  return (await findProspectByPhone(sender)) !== null;
}

/** Entry point B: a follow-up text from a number that already has an ad-driven prospects row (no fresh ad_reply on this particular message, e.g. the lead just replying to the bot's previous message). */
export async function continueExistingLeadNurture(
  sender: string,
  senderName: string | undefined,
  messageText: string,
): Promise<NurtureTurnResult | null> {
  const prospect = await findProspectByPhone(sender);
  if (!prospect) return null;
  return runNurtureTurn(prospect, senderName, messageText);
}

export type SuperadminAnswerOutcome =
  "not_an_answer_command" | "answered" | "not_found" | "already_answered";

export interface SuperadminAnswerResult {
  outcome: SuperadminAnswerOutcome;
  pendingQuestionId?: string;
  prospectPhone?: string;
  question?: string;
  adminAnswer?: string;
}

/** Loosely parses "[PQ-0001]: jawaban", "PQ-0001 - jawaban", "PQ-0001: jawaban" etc -- real people don't type exact syntax (same lesson as tryConfirmAdLeadFollowUp's digit-run matching elsewhere in this codebase). */
const SUPERADMIN_ANSWER_PATTERN = /\[?\s*(PQ-\d{3,})\s*\]?\s*[:\-]\s*([\s\S]+)/i;

/**
 * Step 1 of the escalation loop: marks the pending_questions row answered
 * and banks the raw admin answer into knowledge_base immediately (both pure
 * DB writes, safe to do synchronously in the webhook). Rephrasing the
 * answer for the lead and actually sending it is a separate Gemini call --
 * queued as a whatsapp_admin_answer_relay job (see relayAdminAnswerToLead)
 * so a slow/retrying Gemini call can't blow the webhook's duration budget.
 */
export async function tryHandleSuperadminAnswer(
  messageText: string,
): Promise<SuperadminAnswerResult> {
  const match = messageText.match(SUPERADMIN_ANSWER_PATTERN);
  if (!match) return { outcome: "not_an_answer_command" };

  const code = match[1].toUpperCase();
  const answer = match[2].trim();
  if (!answer) return { outcome: "not_an_answer_command" };

  const supabase = createAdminClient();
  const { data: pending } = await supabase
    .from("pending_questions")
    .select("id, status, pertanyaan, project_id, prospect:prospect_id(phone)")
    .eq("code", code)
    .maybeSingle();

  if (!pending) return { outcome: "not_found" };
  if (pending.status === "answered") return { outcome: "already_answered" };

  await supabase
    .from("pending_questions")
    .update({ status: "answered", dijawab_at: new Date().toISOString(), jawaban_admin: answer })
    .eq("id", pending.id);

  if (pending.project_id) {
    await supabase.from("knowledge_base").insert({
      project_id: pending.project_id,
      kategori: "lainnya",
      pertanyaan_umum: pending.pertanyaan,
      jawaban: answer,
      sumber: "dari_admin",
    });
  }

  const prospect = pending.prospect as unknown as { phone: string } | null;
  return {
    outcome: "answered",
    pendingQuestionId: pending.id,
    prospectPhone: prospect?.phone,
    question: pending.pertanyaan,
    adminAnswer: answer,
  };
}

/** Same escalation reply, but the admin answered with a photo (denah/brosur/foto) instead of -- or alongside -- words. Caption-gated: code required, trailing text after it optional (unlike the text-only tryHandleSuperadminAnswer, where an empty answer is rejected as noise) since "here's the photo" often needs no caption text at all. */
const SUPERADMIN_IMAGE_CODE_PATTERN = /\[?\s*(PQ-\d{3,})\s*\]?\s*(?:[:\-]\s*([\s\S]+))?/i;

/**
 * Image counterpart to tryHandleSuperadminAnswer -- same DB-writes-now,
 * Gemini-rephrase-and-send-later split (see relayAdminAnswerToLead). Banks
 * the image into knowledge_base too, so the same denah/brosur is reused
 * automatically for the next lead who asks, without round-tripping to an
 * admin again.
 */
export async function tryHandleSuperadminImageAnswer(
  caption: string | undefined,
  imageUrl: string,
): Promise<SuperadminAnswerResult> {
  if (!caption) return { outcome: "not_an_answer_command" };
  const match = caption.match(SUPERADMIN_IMAGE_CODE_PATTERN);
  if (!match) return { outcome: "not_an_answer_command" };

  const code = match[1].toUpperCase();
  const answer = (match[2] ?? "").trim() || "Gambar/dokumen terlampir.";

  const supabase = createAdminClient();
  const { data: pending } = await supabase
    .from("pending_questions")
    .select("id, status, pertanyaan, project_id, prospect:prospect_id(phone)")
    .eq("code", code)
    .maybeSingle();

  if (!pending) return { outcome: "not_found" };
  if (pending.status === "answered") return { outcome: "already_answered" };

  await supabase
    .from("pending_questions")
    .update({
      status: "answered",
      dijawab_at: new Date().toISOString(),
      jawaban_admin: answer,
      image_url: imageUrl,
    })
    .eq("id", pending.id);

  if (pending.project_id) {
    await supabase.from("knowledge_base").insert({
      project_id: pending.project_id,
      kategori: "lainnya",
      pertanyaan_umum: pending.pertanyaan,
      jawaban: answer,
      image_url: imageUrl,
      sumber: "dari_admin",
    });
  }

  const prospect = pending.prospect as unknown as { phone: string } | null;
  return {
    outcome: "answered",
    pendingQuestionId: pending.id,
    prospectPhone: prospect?.phone,
    question: pending.pertanyaan,
    adminAnswer: answer,
  };
}

/** Step 2 (queued, see whatsapp_admin_answer_relay job): rephrase the admin's raw answer into a natural WhatsApp reply and send it to the lead -- as an image with a rephrased caption when the admin answered with a photo, plain text otherwise. */
export async function relayAdminAnswerToLead(
  pendingQuestionId: string,
): Promise<{ sent: boolean }> {
  const supabase = createAdminClient();
  const { data: pending } = await supabase
    .from("pending_questions")
    .select("pertanyaan, jawaban_admin, image_url, prospect:prospect_id(id, phone)")
    .eq("id", pendingQuestionId)
    .maybeSingle();

  if (!pending || !pending.jawaban_admin) return { sent: false };
  const prospect = pending.prospect as unknown as { id: string; phone: string } | null;
  if (!prospect) return { sent: false };

  const rephrased = await generateAIText({
    systemPrompt:
      "Anda mengubah jawaban singkat dari admin properti menjadi satu balasan WhatsApp yang natural, ramah, dan singkat (2-4 kalimat) untuk calon pembeli, dalam Bahasa Indonesia. Jangan menambahkan informasi baru di luar jawaban admin. Balas hanya teks pesannya, tanpa tanda kutip atau embel-embel lain.",
    userPrompt: `Pertanyaan lead sebelumnya: ${pending.pertanyaan}\nJawaban admin: ${pending.jawaban_admin}`,
    temperature: 0.5,
    maxOutputTokens: 300,
  }).catch(() => null);

  const replyText = rephrased?.text?.trim() || pending.jawaban_admin;

  await supabase.from("lead_chat_history").insert([
    {
      prospect_id: prospect.id,
      sender: "admin",
      message: pending.image_url ? `${pending.jawaban_admin} [gambar terlampir]` : pending.jawaban_admin,
    },
    { prospect_id: prospect.id, sender: "ai", message: replyText },
  ]);

  const sendResult = pending.image_url
    ? await sendWhatsAppImage(prospect.phone, pending.image_url, replyText)
    : await sendWhatsAppText(prospect.phone, replyText);
  if (!sendResult.success)
    logger.error("relayAdminAnswerToLead: WA send failed", {
      pendingQuestionId,
      error: sendResult.error,
    });
  return { sent: sendResult.success };
}
