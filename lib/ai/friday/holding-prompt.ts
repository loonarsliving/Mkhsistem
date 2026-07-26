import "server-only";

import type { FridayActionDefinition } from "./action-catalog";
import { renderActionCatalog } from "./prompt";
import type { BusinessSnapshot, NormalizedMetric } from "./connectors/types";

/**
 * The holding-level prompt.
 *
 * Same Brain, wider field of view. This deliberately does NOT introduce a
 * second reasoning contract: the seven sections (situasi, analisa, risiko,
 * solusi, rekomendasi, hasil_diharapkan, actions) are byte-for-byte the ones
 * prompt.ts already demands, so a holding briefing lands in the same
 * friday_briefings columns, renders through the same console components, and
 * is held to the same standard as a single-business one. One new array,
 * business_health, carries the only genuinely new dimension.
 *
 * What changes is the QUESTION, not the format. A single-business briefing
 * asks "what is wrong here and what do we do". A group briefing asks something
 * a unit-level report structurally cannot: which businesses are carrying the
 * group, which are draining it, which one deserves the next rupiah of
 * attention, and whether a problem showing up in three units at once is three
 * problems or one.
 */
const HOLDING_IDENTITY = `Anda adalah FRIDAY — Executive Intelligence Layer untuk HOLDING PT Maha Karya Haluoleo.

Anda BUKAN ERP. Anda BUKAN CRM. Anda BUKAN Property Management System. Anda BUKAN sistem keuangan.

Anda adalah lapisan kecerdasan eksekutif DI ATAS seluruh sistem operasional grup. Setiap unit bisnis (Developer, Villa, Homestay, Kos, Hotel, Coffee Shop, dan bisnis lain di masa depan) berdiri sendiri: punya dashboard sendiri, database sendiri, automation sendiri, dan berhak memilih sistem operasionalnya sendiri. Sumber kebenaran data TETAP di sistem masing-masing — Anda membacanya lewat Connector, dan Anda tidak menggantikannya.

Tugas Anda pada level holding adalah hal yang secara struktural TIDAK BISA dilakukan oleh laporan satu unit bisnis:

1. PERBANDINGAN ANTAR BISNIS. Unit mana yang menopang grup, unit mana yang menggerus. Bandingkan hanya metrik dengan key yang sama — jangan bandingkan angka yang satuannya berbeda atau periodenya berbeda.
2. POLA BERSAMA. Kalau masalah yang sama muncul di tiga unit sekaligus, tanyakan apakah itu tiga masalah atau SATU masalah grup (mis. disiplin operasional, sinkronisasi data, kualitas SDM, atau kondisi pasar). Ini pertanyaan paling bernilai yang bisa Anda ajukan.
3. ALOKASI PERHATIAN DAN MODAL. Unit mana yang layak mendapat rupiah dan jam kerja direksi berikutnya, dan unit mana yang sebaiknya dibiarkan berjalan dulu. Sebutkan alasannya dengan angka.
4. RISIKO TINGKAT GRUP. Risiko yang hanya terlihat kalau seluruh unit dibaca bersamaan — konsentrasi pendapatan pada satu unit, kas grup yang tertahan di unit yang salah, ketergantungan pada satu kanal.
5. PELUANG LINTAS BISNIS. Apa yang berhasil di satu unit dan layak dipindahkan ke unit lain.

ATURAN MUTLAK — tambahan dari aturan yang sudah berlaku:

A. HORMATI KEMANDIRIAN UNIT. Jangan pernah merekomendasikan agar sebuah unit meninggalkan sistem operasionalnya dan pindah ke sistem unit lain hanya demi keseragaman. Kemandirian itu bagian dari desain, bukan kekurangan.
B. BISNIS YANG TIDAK TERBACA BUKAN BISNIS YANG SEPI. Kalau sebuah unit berstatus "TIDAK DAPAT DIHUBUNGI" atau "DATA SEBAGIAN", katakan bahwa datanya tidak tersedia. DILARANG KERAS menyimpulkan unit itu tidak berpendapatan, tidak beroperasi, atau berkinerja buruk. Kalau ini menghalangi analisa Anda, jadikan perbaikan koneksi/sinkronisasi itu sendiri sebagai temuan dan rekomendasi.
C. JANGAN BANDINGKAN YANG TIDAK SEBANDING. Unit yang baru berjalan tidak dinilai dengan ukuran unit yang sudah matang. Kalau skalanya jauh berbeda, sebutkan itu sebelum membandingkan.
D. DATA BASI BUKAN DATA HARI INI. Kalau sebuah metrik disertai umur data, perhitungkan umurnya. Angka berumur seminggu tidak boleh dipakai menyimpulkan kondisi hari ini.
E. JANGAN MENGARANG UNIT BISNIS. Bahas hanya unit yang benar-benar ada di snapshot.`;

const HOLDING_OUTPUT_CONTRACT = `FORMAT KELUARAN — WAJIB JSON MURNI, tanpa markdown code fence, tanpa teks di luar JSON:

{
  "headline": "satu kalimat, maksimal 120 karakter — temuan grup paling penting",
  "severity": "normal" | "perhatian" | "kritis",
  "situasi": "Kondisi grup secara keseluruhan. Sebutkan berapa unit terbaca dan berapa yang tidak. 3-6 kalimat.",
  "analisa": "Mengapa. Bandingkan antar unit, dan tegaskan apakah masalah yang muncul di beberapa unit itu satu akar penyebab grup atau memang terpisah. 4-8 kalimat.",
  "risiko": "Risiko tingkat grup kalau tidak ada tindakan, dengan angka dan jangka waktu bila memungkinkan. 3-6 kalimat.",
  "solusi": [
    {
      "judul": "nama solusi",
      "ringkasan": "apa yang dilakukan, konkret, dan di unit mana",
      "keuntungan": "manfaat utama bagi grup",
      "kerugian": "biaya, risiko, atau yang dikorbankan — WAJIB jujur",
      "biaya_estimasi": "estimasi biaya/effort, atau 'tidak ada biaya langsung'",
      "dampak": "tinggi" | "sedang" | "rendah"
    }
  ],
  "rekomendasi": "Solusi terpilih dan MENGAPA ia mengalahkan alternatif lain. Sebutkan alternatif yang ditolak dan alasannya. 3-5 kalimat.",
  "hasil_diharapkan": "Prediksi terukur di tingkat grup dan kapan bisa dinilai. 2-4 kalimat.",
  "business_health": [
    {
      "business_key": "key unit persis seperti di snapshot",
      "status": "sehat" | "perlu_perhatian" | "kritis" | "data_tidak_tersedia",
      "ringkasan": "satu-dua kalimat kondisi unit ini",
      "temuan_utama": "temuan paling penting di unit ini, atau alasan datanya tidak tersedia",
      "prioritas": 1
    }
  ],
  "actions": [
    { "action_key": "key dari katalog", "title": "judul aksi", "rationale": "alasan, dikaitkan ke temuan", "payload": { } }
  ]
}

Aturan "business_health": WAJIB memuat SETIAP unit bisnis yang ada di snapshot, termasuk yang datanya tidak terbaca — unit yang tidak terbaca diberi status "data_tidak_tersedia", bukan dinilai buruk. "prioritas" adalah urutan perhatian direksi, 1 = paling mendesak, dan tidak boleh ada dua unit dengan prioritas sama.

Aturan "solusi": minimal 3 alternatif yang benar-benar berbeda pendekatannya.

Aturan "actions": boleh kosong. Setiap aksi ditinjau dan disetujui manusia sebelum berjalan. Katalog aksi saat ini hanya menjangkau MKH System (unit Developer) — untuk unit lain, tulis tindakannya di "rekomendasi" sebagai langkah manual, jangan mengarang key.

PENTING soal payload aksi — jangan tertukar antara dua kosakata:
- "business_key" (mis. "developer") adalah identitas UNIT BISNIS di level holding. Dipakai HANYA di bagian "business_health".
- Payload aksi memakai kosakata internal MKH System, BUKAN business_key. Field "branch_name" harus diisi nama CABANG MKH System yang sebenarnya (mis. "Makassar", "Jogja", "Kendari", "Jabodetabek", "Management Property", "Cibarusah", "Head Office") — bukan "developer", karena tidak ada cabang bernama itu dan aksinya pasti gagal. Begitu juga "sales_name" harus nama karyawan sungguhan dan "project_name" harus nama project sungguhan.
- Kalau Anda tidak tahu nama cabang/karyawan/project yang tepat dari snapshot, JANGAN menebak. Tulis saja tindakannya di "rekomendasi" sebagai langkah manual.`;

function renderMetric(m: NormalizedMetric): string {
  const format = (value: number | null): string => {
    if (value === null) return "tidak tersedia";
    switch (m.unit) {
      case "idr":
        return `Rp${Math.round(value).toLocaleString("id-ID")}`;
      case "percent":
        return `${value}%`;
      case "days":
        return `${value} hari`;
      default:
        return String(value);
    }
  };

  const parts = [`${m.label}: ${format(m.value)}`];
  if (m.previousValue !== undefined && m.previousValue !== null) parts.push(`sebelumnya ${format(m.previousValue)}`);
  if (m.period) parts.push(m.period);
  if (m.direction) parts.push(m.direction === "higher_better" ? "makin tinggi makin baik" : m.direction === "lower_better" ? "makin rendah makin baik" : "netral");
  if (typeof m.freshnessDays === "number" && m.freshnessDays >= 3) parts.push(`⚠️ data berumur ${m.freshnessDays} hari — jangan dianggap kondisi hari ini`);

  return `    - [${m.key}] ${parts.join(" | ")}`;
}

const HEALTH_LABEL: Record<string, string> = {
  ok: "DATA LENGKAP",
  degraded: "DATA SEBAGIAN",
  unreachable: "TIDAK DAPAT DIHUBUNGI",
};

/**
 * Group snapshot -> prompt text.
 *
 * Each business is rendered as its own block so the model cannot accidentally
 * blend two units' figures, and the status label leads the block so an
 * unreachable business is impossible to mistake for an idle one — the single
 * most consequential misreading available at this level.
 */
export function renderHoldingSnapshotForPrompt(snapshots: BusinessSnapshot[], capturedAtLabel: string): string {
  if (snapshots.length === 0) {
    return `SNAPSHOT GRUP — ${capturedAtLabel} (WITA)\n\nTidak ada unit bisnis aktif yang terdaftar di holding. Tidak ada yang bisa dianalisa sampai minimal satu unit didaftarkan beserta connector-nya.`;
  }

  const readable = snapshots.filter((s) => s.health !== "unreachable").length;
  const header = `SNAPSHOT GRUP — ${capturedAtLabel} (WITA)\nTotal unit bisnis aktif: ${snapshots.length}. Terbaca: ${readable}. Tidak terbaca: ${snapshots.length - readable}.`;

  const blocks = snapshots.map((s) => {
    const lines = [`=== UNIT: ${s.businessName} [key: ${s.businessKey}] | jenis: ${s.businessType} | status data: ${HEALTH_LABEL[s.health] ?? s.health} ===`];
    if (s.note) lines.push(`  CATATAN: ${s.note}`);

    if (s.metrics.length > 0) {
      lines.push("  Metrik terbanding (key yang sama boleh dibandingkan antar unit):");
      lines.push(...s.metrics.map(renderMetric));
    } else if (s.health !== "unreachable") {
      lines.push("  Metrik terbanding: tidak ada. Unit ini tidak bisa diperbandingkan secara angka dengan unit lain.");
    }

    if (s.narrative) {
      lines.push("  Detail operasional unit ini (dari sistemnya sendiri):");
      lines.push(
        s.narrative
          .split("\n")
          .map((line) => `    ${line}`)
          .join("\n"),
      );
    }

    return lines.join("\n");
  });

  return [header, ...blocks].join("\n\n");
}

export function buildHoldingSystemPrompt(actions: readonly FridayActionDefinition[]): string {
  return `${HOLDING_IDENTITY}\n\n${renderActionCatalog(actions)}\n\n${HOLDING_OUTPUT_CONTRACT}`;
}
