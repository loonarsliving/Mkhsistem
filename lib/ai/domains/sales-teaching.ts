import "server-only";

import { askAI } from "../service";
import { getInvestorIntelligenceContext } from "./investor-intelligence";

const SYSTEM_PROMPT = `Anda adalah AI Sales Teaching Engine untuk PT Maha Karya Haluoleo, menyusun Weekly Coaching untuk Kepala Cabang Jogja (Loonars Living) -- satu-satunya cabang yang menjual villa leasehold (produk investasi).

Kepala Cabang akan memakai pesan Anda LANGSUNG sebagai materi briefing/coaching di meeting mingguan tim Sales -- jadi setiap bagian harus konkret dan bisa langsung dipakai, bukan teori umum.

Anda punya wawasan tentang perilaku dan psikologi calon investor villa leasehold (disediakan sebagai konteks riset di bawah) -- evaluasi dulu relevansinya terhadap data cabang yang diberikan sebelum dipakai, jangan tempel mentah-mentah.

Jawab dalam Bahasa Indonesia, format pesan WhatsApp dengan PERSIS 8 bagian bernomor berikut (gunakan judul ini apa adanya):
1. KONDISI CABANG SAAT INI
2. PELUANG TERBESAR MINGGU INI
3. KESALAHAN YANG HARUS DIPERBAIKI
4. MATERI COACHING UNTUK MEETING MINGGUAN SALES
5. CHECKLIST AKTIVITAS ORGANIK TIM SALES
6. TARGET MINGGUAN
7. KPI YANG HARUS DICAPAI
8. PRIORITAS PEKERJAAN

Setiap bagian singkat (2-4 kalimat atau poin), tidak bertele-tele. Gunakan HANYA angka/data yang diberikan di prompt -- jangan mengarang angka. Nada membangun dan actionable, bukan menyalahkan.`;

export interface WeeklySalesTeachingInput {
  branchName: string;
  periodLabel: string;
  activeProspectCount: number;
  newProspectCount7d: number;
  stuckProspectCount: number;
  followUpCount7d: number;
  closings7d: number;
  closings30d: number;
}

/** One Gemini call producing the full 8-section Weekly Coaching briefing for Kepala Cabang -- grounded in the Investor Intelligence knowledge bank (0126) plus real branch numbers (never invented). Delivered via WhatsApp only (see processSalesTeachingWeekly, process-job/route.ts). */
export async function generateWeeklySalesTeaching(input: WeeklySalesTeachingInput): Promise<string> {
  const investorContext = await getInvestorIntelligenceContext();

  const userPrompt = `Cabang: ${input.branchName} (villa leasehold)
Periode: ${input.periodLabel}
Prospek aktif saat ini: ${input.activeProspectCount}
Prospek baru masuk 7 hari terakhir: ${input.newProspectCount7d}
Prospek stuck tanpa follow up 3+ hari: ${input.stuckProspectCount}
Total aktivitas follow up 7 hari terakhir: ${input.followUpCount7d}
Closing 7 hari terakhir: ${input.closings7d}
Closing 30 hari terakhir: ${input.closings30d}

Susun Weekly Coaching untuk Kepala Cabang ${input.branchName} berdasarkan data di atas.${
    investorContext ? `\n\n---\nPENGETAHUAN RISET INVESTOR VILLA LEASEHOLD (referensi tambahan, evaluasi relevansinya dulu):\n${investorContext}` : ""
  }`;

  return askAI(SYSTEM_PROMPT, userPrompt, { temperature: 0.6, maxOutputTokens: 1400 });
}
