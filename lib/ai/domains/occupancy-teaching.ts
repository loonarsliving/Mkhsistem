import "server-only";

import { askAI } from "../service";
import { getOccupancyIntelligenceContext } from "./occupancy-intelligence";

const SYSTEM_PROMPT = `Anda adalah LEON, COO Virtual PT Maha Karya Haluoleo, menyusun briefing dua-mingguan (Rabu & Jumat) untuk Kepala Cabang Management Property -- cabang yang mengelola kos/kontrakan/villa ATAS NAMA PEMILIKNYA (jasa manajemen properti, bukan menjual unit properti).

Kepala Cabang akan memakai pesan Anda LANGSUNG sebagai materi briefing/edukasi untuk timnya -- jadi setiap bagian harus konkret dan bisa langsung dipakai, bukan teori umum.

Anda punya wawasan tentang cara meningkatkan okupansi, cara meyakinkan pemilik properti baru untuk mempercayakan pengelolaan, dan data pasar kota wisata (disediakan sebagai konteks riset di bawah) -- evaluasi dulu relevansinya terhadap data cabang yang diberikan sebelum dipakai, jangan tempel mentah-mentah.

Jawab dalam Bahasa Indonesia, format pesan WhatsApp dengan PERSIS 7 bagian bernomor berikut (gunakan judul ini apa adanya):
1. KONDISI OKUPANSI SAAT INI
2. PELUANG TERBESAR UNTUK MENINGKATKAN OKUPANSI
3. STRATEGI MENDEKATI PEMILIK PROPERTI BARU (agar mau dikelola kami)
4. KESALAHAN YANG HARUS DIPERBAIKI
5. MATERI EDUKASI UNTUK TIM
6. TARGET OKUPANSI PERIODE INI
7. PRIORITAS PEKERJAAN

Setiap bagian singkat (2-4 kalimat atau poin), tidak bertele-tele. Gunakan HANYA angka/data yang diberikan di prompt -- jangan mengarang angka. Nada membangun dan actionable, bukan menyalahkan.`;

export interface OccupancyPropertySnapshot {
  propertyName: string;
  totalRooms: number;
  filledRooms: number;
  emptyRooms: number;
}

export interface OccupancyTeachingInput {
  branchName: string;
  periodLabel: string;
  properties: OccupancyPropertySnapshot[];
}

/** One Gemini call producing the full 7-section Wed/Fri briefing for Management Property's Kepala Cabang -- grounded in the Occupancy Intelligence knowledge bank plus real per-property occupancy numbers (never invented). Delivered via WhatsApp only (see processOccupancyTeachingBiweekly, process-job/route.ts). */
export async function generateOccupancyTeaching(input: OccupancyTeachingInput): Promise<string> {
  const occupancyContext = await getOccupancyIntelligenceContext();

  const totalRooms = input.properties.reduce((sum, p) => sum + p.totalRooms, 0);
  const totalFilled = input.properties.reduce((sum, p) => sum + p.filledRooms, 0);
  const occupancyRate = totalRooms > 0 ? Math.round((totalFilled / totalRooms) * 1000) / 10 : null;

  const propertyLines = input.properties.length
    ? input.properties.map((p) => `- ${p.propertyName}: ${p.filledRooms}/${p.totalRooms} terisi (${p.emptyRooms} kosong)`).join("\n")
    : "Belum ada data properti tercatat.";

  const userPrompt = `Cabang: ${input.branchName} (manajemen properti kos/kontrakan/villa)
Periode: ${input.periodLabel}
Ringkasan okupansi per properti:
${propertyLines}
Total okupansi keseluruhan: ${totalFilled}/${totalRooms} kamar${occupancyRate !== null ? ` (${occupancyRate}%)` : ""}

Susun briefing untuk Kepala Cabang ${input.branchName} berdasarkan data di atas.${
    occupancyContext ? `\n\n---\nPENGETAHUAN RISET OKUPANSI, DEAL PEMILIK PROPERTI, & PASAR WISATA (referensi tambahan, evaluasi relevansinya dulu):\n${occupancyContext}` : ""
  }`;

  return askAI(SYSTEM_PROMPT, userPrompt, { temperature: 0.6, maxOutputTokens: 1400 });
}
