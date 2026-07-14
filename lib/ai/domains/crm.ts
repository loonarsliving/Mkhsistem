import "server-only";

import { askAI } from "../service";
import { getSystemPrompt } from "./prompts";

export async function askCrmAi(question: string, context?: string): Promise<string> {
  const userPrompt = context ? `Konteks:\n${context}\n\nPertanyaan:\n${question}` : question;
  return askAI(await getSystemPrompt("crm"), userPrompt);
}

export interface ProspectSummary {
  customerName: string;
  status: string;
  leadSource: string;
  lastActivity: string;
  notes?: string;
}

export async function getProspectInsight(prospect: ProspectSummary): Promise<string> {
  const userPrompt = `Berikan insight untuk prospek berikut:
Nama: ${prospect.customerName}
Status: ${prospect.status}
Sumber Lead: ${prospect.leadSource}
Aktivitas Terakhir: ${prospect.lastActivity}
Catatan: ${prospect.notes ?? "-"}

Berikan: (1) analisa singkat kondisi prospek, (2) risiko prospek hilang jika ada, (3) rekomendasi next action.`;
  return askAI(await getSystemPrompt("crm"), userPrompt);
}

export async function assistFollowUp(prospect: ProspectSummary): Promise<string> {
  const userPrompt = `Buatkan draft pesan follow up (WhatsApp, singkat dan sopan, Bahasa Indonesia) untuk prospek berikut:
Nama: ${prospect.customerName}
Status: ${prospect.status}
Aktivitas Terakhir: ${prospect.lastActivity}
Catatan: ${prospect.notes ?? "-"}`;
  return askAI(await getSystemPrompt("crm"), userPrompt);
}

export async function recommendClosing(prospect: ProspectSummary): Promise<string> {
  const userPrompt = `Prospek berikut berpotensi closing. Berikan rekomendasi strategi closing:
Nama: ${prospect.customerName}
Status: ${prospect.status}
Catatan: ${prospect.notes ?? "-"}

Berikan: (1) sinyal kesiapan closing yang terlihat, (2) hambatan potensial, (3) langkah closing yang disarankan.`;
  return askAI(await getSystemPrompt("crm"), userPrompt);
}

export async function analyzePipeline(pipelineSummary: string): Promise<string> {
  const userPrompt = `Analisa pipeline penjualan berikut:\n${pipelineSummary}\n\nBerikan: (1) kondisi pipeline saat ini, (2) tahap yang macet/bottleneck, (3) rekomendasi tindakan untuk tim Sales.`;
  return askAI(await getSystemPrompt("crm"), userPrompt);
}

export interface Sp1DraftInput {
  salesName: string;
  branchName: string;
  periodLabel: string;
  reason: string;
  stuckProspects: { customerName: string; lastFollowUpLabel: string }[];
}

/** Drafts an SP1 (Surat Peringatan 1) letter -- always a draft for a human (Kepala Cabang/HR/Direktur Operasional/Super Admin) to review, never auto-issued. See crm_review_sp1_warning. */
export async function draftSp1Warning(input: Sp1DraftInput): Promise<string> {
  const prospectList = input.stuckProspects.map((p) => `- ${p.customerName} (follow up terakhir: ${p.lastFollowUpLabel})`).join("\n");
  const userPrompt = `Buatkan draft Surat Peringatan 1 (SP1) resmi dalam Bahasa Indonesia untuk sales berikut, berdasarkan data kinerja objektif -- JANGAN mengarang data yang tidak diberikan.

Nama Sales: ${input.salesName}
Cabang: ${input.branchName}
Periode: ${input.periodLabel}
Alasan: ${input.reason}

Prospek yang stuck tanpa follow up:
${prospectList}

Format surat: kop singkat (nama perusahaan PT Maha Karya Haluoleo, judul "SURAT PERINGATAN 1"), paragraf pembuka, poin-poin pelanggaran/kekurangan kinerja berbasis data di atas, konsekuensi jika tidak ada perbaikan, paragraf penutup, dan baris tanda tangan untuk Kepala Cabang. Nada profesional dan tegas namun tetap membangun (bukan kasar). Ini adalah DRAFT yang akan direview manusia sebelum diterbitkan resmi -- akhiri dengan catatan singkat "[DRAFT -- menunggu review dan persetujuan]".`;
  return askAI(await getSystemPrompt("crm"), userPrompt);
}
