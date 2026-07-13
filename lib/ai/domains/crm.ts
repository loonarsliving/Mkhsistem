import "server-only";

import { askAI } from "../service";

const CRM_SYSTEM_PROMPT = `Anda adalah AI CRM Assistant untuk MK Connect, sistem internal PT Maha Karya Haluoleo (bisnis properti).
Tugas Anda: memberi insight prospek, membantu follow up, memberi rekomendasi closing, dan memberi analisa pipeline penjualan.
Jawab dalam Bahasa Indonesia, ringkas, dan berorientasi pada tindakan penjualan berikutnya (next action).`;

export async function askCrmAi(question: string, context?: string): Promise<string> {
  const userPrompt = context ? `Konteks:\n${context}\n\nPertanyaan:\n${question}` : question;
  return askAI(CRM_SYSTEM_PROMPT, userPrompt);
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
  return askAI(CRM_SYSTEM_PROMPT, userPrompt);
}

export async function assistFollowUp(prospect: ProspectSummary): Promise<string> {
  const userPrompt = `Buatkan draft pesan follow up (WhatsApp, singkat dan sopan, Bahasa Indonesia) untuk prospek berikut:
Nama: ${prospect.customerName}
Status: ${prospect.status}
Aktivitas Terakhir: ${prospect.lastActivity}
Catatan: ${prospect.notes ?? "-"}`;
  return askAI(CRM_SYSTEM_PROMPT, userPrompt);
}

export async function recommendClosing(prospect: ProspectSummary): Promise<string> {
  const userPrompt = `Prospek berikut berpotensi closing. Berikan rekomendasi strategi closing:
Nama: ${prospect.customerName}
Status: ${prospect.status}
Catatan: ${prospect.notes ?? "-"}

Berikan: (1) sinyal kesiapan closing yang terlihat, (2) hambatan potensial, (3) langkah closing yang disarankan.`;
  return askAI(CRM_SYSTEM_PROMPT, userPrompt);
}

export async function analyzePipeline(pipelineSummary: string): Promise<string> {
  const userPrompt = `Analisa pipeline penjualan berikut:\n${pipelineSummary}\n\nBerikan: (1) kondisi pipeline saat ini, (2) tahap yang macet/bottleneck, (3) rekomendasi tindakan untuk tim Sales.`;
  return askAI(CRM_SYSTEM_PROMPT, userPrompt);
}

export { CRM_SYSTEM_PROMPT };
