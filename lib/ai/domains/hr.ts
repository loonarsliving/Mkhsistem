import "server-only";

import { askAI } from "../service";
import { getSystemPrompt } from "./prompts";

/** General HR Q&A — the entrypoint the WhatsApp router and any future HR UI/server action calls. */
export async function askHrAi(question: string, context?: string): Promise<string> {
  const userPrompt = context ? `Konteks:\n${context}\n\nPertanyaan:\n${question}` : question;
  return askAI(await getSystemPrompt("hr"), userPrompt);
}

export async function recommendHrSop(topic: string, context?: string): Promise<string> {
  const userPrompt = `Buatkan rekomendasi SOP (Standard Operating Procedure) untuk topik berikut: "${topic}".${
    context ? `\n\nKonteks tambahan:\n${context}` : ""
  }\nFormat: judul SOP, tujuan, langkah-langkah bernomor, dan pihak yang bertanggung jawab di tiap langkah.`;
  return askAI(await getSystemPrompt("hr"), userPrompt);
}

export async function generateHrChecklist(topic: string, context?: string): Promise<string> {
  const userPrompt = `Buatkan checklist HR untuk: "${topic}".${
    context ? `\n\nKonteks tambahan:\n${context}` : ""
  }\nFormat: daftar checklist bernomor, singkat dan bisa langsung dicentang satu per satu.`;
  return askAI(await getSystemPrompt("hr"), userPrompt);
}

export interface EmployeeEvaluationInput {
  employeeName: string;
  position: string;
  attendanceSummary: string;
  performanceNotes: string;
}

export async function evaluateEmployee(input: EmployeeEvaluationInput): Promise<string> {
  const userPrompt = `Bantu evaluasi karyawan berikut berdasarkan data yang tersedia:
Nama: ${input.employeeName}
Jabatan: ${input.position}
Ringkasan Kehadiran: ${input.attendanceSummary}
Catatan Kinerja: ${input.performanceNotes}

Berikan: (1) ringkasan kinerja, (2) kekuatan, (3) area yang perlu diperbaiki, (4) rekomendasi tindak lanjut untuk atasan langsung.`;
  return askAI(await getSystemPrompt("hr"), userPrompt);
}
