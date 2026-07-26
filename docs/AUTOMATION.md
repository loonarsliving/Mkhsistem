# Automation Layer — Inventory & Audit

Semua otomasi MK Connect, apa yang dijalankan, kapan, dan lewat jalur mana.
Ditulis dari hasil audit terhadap **database produksi live** (`svcmybsziaelwwdrnzcv`),
bukan hanya dari file migrasi — keduanya diverifikasi cocok.

Semua jadwal `pg_cron` disimpan dalam **UTC**. Kantor beroperasi di **WITA
(UTC+8)**, jadi setiap jadwal di bawah ditulis dengan kedua waktu.

---

## 1. Arsitektur otomasi

Ada empat jalur eksekusi yang berbeda. Membedakannya penting, karena mode
kegagalan masing-masing berbeda.

| Jalur | Pemicu | Contoh | Kalau gagal |
|---|---|---|---|
| **SQL murni** | `pg_cron` → fungsi plpgsql | `mark_absentees_alpha()` | Tercatat di `cron.job_run_details` sebagai `failed` |
| **Antrian AI** | fungsi SQL → `insert ai_job_queue` → trigger/sweep → `/api/ai/process-job` | Semua job Gemini | Retry 4x dengan backoff, lalu `dead_letter` |
| **HTTP dispatch** | `pg_cron`/trigger → `automation_post()` → route Next.js | Publish konten, kirim promo | Tercatat di `automation_dispatch_log` |
| **Worker mandiri** | Proses polling 24/7 di Railway | Render ffmpeg, Veo | Restart oleh supervisor host |

### Antrian AI (`ai_job_queue`)

Inti dari sebagian besar otomasi cerdas. Alurnya:

1. Fungsi cron menyisipkan baris ke `ai_job_queue` (status `pending`).
2. Trigger `ai_job_queue_after_insert` langsung memanggil `/api/ai/process-job`
   (jalur cepat).
3. Cron `ai-job-dispatch-pending` (tiap menit) menyapu job `pending` yang
   `next_attempt_at`-nya sudah lewat — jaring pengaman kalau trigger gagal.
4. Route mengklaim job secara atomik (`UPDATE ... WHERE status = 'pending'`),
   jadi trigger dan sweep tidak pernah memproses job yang sama dua kali.
5. Gagal transient → `next_attempt_at` dimundurkan (backoff 20s/40s/80s),
   maksimal 4 percobaan. Gagal non-transient (model tidak ada, foto belum
   diunggah, budget habis) → langsung `dead_letter` tanpa membuang retry.

26 `job_type` terdaftar di constraint `ai_job_queue_job_type_check`.

---

## 2. Inventaris `pg_cron` — 56 job (54 lama + 2 dari audit ini)

### Platform & housekeeping

| Job | UTC | WITA | Fungsi |
|---|---|---|---|
| `mark-absentees-alpha-daily` | `0 10 * * *` | 18:00 | Tandai karyawan aktif yang tidak absen sebagai alpha |
| `prune-login-attempts-daily` | `0 3 * * *` | 11:00 | Hapus `mkc_login_attempts` > 1 hari |
| `wa-pending-media-relay-cleanup` | `30 * * * *` | tiap jam | Bersihkan relay media WhatsApp tertunda |
| `whatsapp-webhook-health-hourly` | `0 * * * *` | tiap jam | Alert Super Admin bila tidak ada WA masuk 4 jam+ |
| `sync-dispatch-pending` | `*/1 * * * *` | tiap menit | Kirim `sync_log` outbound ke MKH Property |
| `sync-collect-responses` | `*/1 * * * *` | tiap menit | Baca balik respons pg_net, retry / dead-letter |
| `ai-job-dispatch-pending` | `*/1 * * * *` | tiap menit | Sweep antrian AI |
| `automation-collect-dispatch-results` ✨ | `*/5 * * * *` | tiap 5 menit | Resolusi hasil HTTP dispatch |
| `automation-health-hourly` ✨ | `20 * * * *` | tiap jam | Alert kegagalan otomasi ke Super Admin |

✨ = ditambahkan oleh audit ini (migrasi `0176`).

### HR & komunikasi harian

| Job | UTC | WITA | Fungsi |
|---|---|---|---|
| `ai-birthday-wishes-daily` | `0 23 * * *` | 07:00 | Ucapan ulang tahun otomatis |
| `ai-daily-report` | `30 10 * * *` | 18:30 | Laporan harian |
| `ai-daily-motivation` | `0 23 * * 0-4` | 07:00 | **NONAKTIF** |
| `attendance-checkin-reminder-daily` | `30 23 * * 0-4` | 07:30 | **NONAKTIF** |
| `attendance-forgot-checkout-daily` | `0 9 * * *` | 17:00 | **NONAKTIF** |

### CRM & Sales — 14 job

| Job | UTC | WITA | Fungsi |
|---|---|---|---|
| `crm-ad-lead-monitoring-15min` | `*/15 * * * *` | tiap 15 mnt | Monitor & eskalasi lead iklan |
| `crm-sales-conduct-monitoring-hourly` | `0 * * * *` | tiap jam | Monitor perilaku sales |
| `crm-promo-sends-worker` | `*/5 * * * *` | tiap 5 mnt | Kirim promo WA (batch 5, anti-ban) |
| `crm-promo-cadence-dispatch` | `0 22 * * *` | 06:00 | Antrikan promo harian |
| `crm-villa-cariu-followup-morning` | `0 1 * * *` | 09:00 | Follow-up database Villa/Cariu |
| `crm-villa-cariu-followup-afternoon` | `0 8 * * *` | 16:00 | Follow-up database Villa/Cariu |
| `ai-sales-target-reminder-weekly` | `0 1 * * 1` | Sen 09:00 | Reminder target sales |
| `crm-follow-up-reminders-daily` | `0 2 * * *` | 10:00 | Reminder follow-up prospek |
| `crm-branch-target-reminder-3days` | `0 1 */3 * *` | 09:00 /3hr | Reminder target cabang |
| `crm-prospect-analysis-3days` | `0 2 */3 * *` | 10:00 /3hr | Analisis prospek (AI) |
| `crm-sales-coaching-3days` | `0 3 */3 * *` | 11:00 /3hr | Coaching sales (AI) |
| `crm-sales-teaching-weekly` | `0 5 * * 1` | Sen 13:00 | Teaching engine sales (AI) |
| `crm-sales-closing-tips-2x-weekly` | `0 0 * * 0,3` | Min/Rab 08:00 | Tips closing (AI) |
| `crm-sp1-evaluation-monthly` | `0 1 1 * *` | Tgl 1, 09:00 | Evaluasi SP1 |

### Markom & konten — 14 job

| Job | UTC | WITA | Fungsi |
|---|---|---|---|
| `markom-ai-checklist-never-empty` | `0 */2 * * *` | tiap 2 jam | Jaga checklist Markom tidak kosong (AI) |
| `markom-content-publish-worker` | `*/5 * * * *` | tiap 5 mnt | Publish ke IG/TikTok via Zernio |
| `markom-reconcile-zernio-publish-status` | `*/5 * * * *` | tiap 5 mnt | Rekonsiliasi status publish |
| `kontenai-automation-dispatch` | `*/5 * * * *` | tiap 5 mnt | Pipeline KontenAI (**flag mati**) |
| `markom-kepala-cabang-pending-reminder-3days` | `30 3 * * *` | 11:30 | Reminder checklist (nama menyesatkan: harian) |
| `markom-checklist-reminder-afternoon` | `30 6 * * *` | 14:30 | Nudge kedua di hari yang sama |
| `social-daily-snapshot-capture` | `0 23 * * *` | 07:00 | Snapshot metrik sosial |
| `markom-weekly-reminder` | `0 2 * * 4` | Kam 10:00 | Reminder mingguan Markom |
| `markom-ai-ads-dispatch-weekly` | `0 0 * * 1` | Sen 08:00 | Riset & luncurkan iklan (AI) |
| `leasehold-competitor-comparison-dispatch` | `15 1 * * 1` | Sen 09:15 | Banding kompetitor leasehold (AI) |
| `markom-content-performance-broadcast-monday` | `10 2 * * 1` | Sen 10:10 | Broadcast skor konten |
| `markom-content-performance-broadcast-thursday` | `10 2 * * 4` | Kam 10:10 | Broadcast skor konten |
| `social-weekly-evaluation-dispatch` | `0 1 */3 * *` | 09:00 /3hr | Audit konten (nama "weekly" sudah usang) |
| `competitor-discovery-dispatch` | `30 0 * * 0` | Min 08:30 | Temukan kompetitor baru (AI) |

### Loonars Beauty — 4 job

| Job | UTC | WITA | Fungsi |
|---|---|---|---|
| `loonars-beauty-content-ideas-dispatch` | `15 2 * * *` | 10:15 harian | Ide konten beauty (AI) |
| `loonars-beauty-weekly-evaluation-dispatch` | `45 1 * * 1` | Sen 09:45 | Evaluasi performa mingguan (AI) |
| `loonars-beauty-weekly-content-audit-dispatch` | `50 1 */3 * *` | 09:50 /3hr | Audit konten (AI) |
| `loonars-beauty-competitor-comparison-dispatch` | `0 2 * * 1` | Sen 10:00 | Banding kompetitor (AI) |

### Iklan Meta & Finance

| Job | UTC | WITA | Fungsi |
|---|---|---|---|
| `ad-campaign-spend-auto-refresh` | `15 */2 * * *` | tiap 2 jam | Refresh spend kampanye |
| `meta-ads-balance-check` | `0 */6 * * *` | tiap 6 jam | Alert saldo iklan < Rp 100.000 |
| `ai-branch-balance-advisory-daily` | `0 1 * * *` | 09:00 | Advisory saldo cabang (AI) |
| `finance-cashflow-teaching-daily` | `0 5 * * *` | 13:00 | Teaching engine cashflow (AI) |

### Knowledge bank & intelligence — 5 job

| Job | UTC | WITA | Fungsi |
|---|---|---|---|
| `ai-investor-intelligence-weekly-refresh` | `30 1 * * 1` | Sen 09:30 | Refresh intelligence investor |
| `ai-cashflow-intelligence-weekly-refresh` | `45 1 * * 1` | Sen 09:45 | Refresh intelligence cashflow |
| `ai-knowledge-bank-weekly-refresh` | `0 2 * * 1` | Sen 10:00 | Refresh knowledge bank |
| `ai-occupancy-intelligence-weekly-refresh` | `20 2 * * 1` | Sen 10:20 | Refresh intelligence okupansi |
| `mp-occupancy-teaching-biweekly` | `0 5 * * 3,5` | Rab/Jum 13:00 | Teaching engine okupansi |

### Voice bridge

| Job | UTC | WITA | Fungsi |
|---|---|---|---|
| `voice-bridge-daily-digest` | `0 9 * * *` | 17:00 | Digest harian untuk asisten suara Ultron |

---

## 3. Otomasi non-cron

### Trigger database

| Trigger | Pada | Aksi |
|---|---|---|
| `mkc_notifications_after_insert_push` | insert `mkc_notifications` | Kirim Web Push |
| `mkc_notifications_after_insert_whatsapp` | insert `mkc_notifications` | Relay ke WhatsApp (untuk ~38 kategori) |
| `ai_job_queue_after_insert` | insert `ai_job_queue` | Dispatch segera ke processor |

### Worker mandiri (Railway, `Dockerfile.render-worker`)

`scripts/worker-main.ts` menjalankan dua loop polling tanpa henti:
- **Render worker** — perakitan video ffmpeg (Sprint 6)
- **Veo worker** — image-to-video Veo (Sprint 5)

### GitHub Actions

| Workflow | Jadwal | Fungsi |
|---|---|---|
| `ci.yml` | tiap push/PR | Lint, typecheck, unit test, build |
| `codeql.yml` | `0 2 * * 1` + tiap push | Static analysis keamanan |
| `backup.yml` | `0 18 * * *` | Backup database harian |
| `dependabot.yml` | mingguan | PR pembaruan dependency |

---

## 4. Temuan audit

### Sudah diperbaiki (migrasi `0176` + `lib/security/cron-auth.ts`)

**T1 — Sepuluh endpoint otomasi terbuka tanpa autentikasi.** *(kritis)*
Setiap route yang dipanggil `pg_cron`/trigger dapat dipanggil siapa saja yang
tahu URL-nya. Delapan di antaranya tidak menerima argumen sama sekali: satu
`POST {}` ke `/api/crm/dispatch-promo-sends` mengirim batch WhatsApp, ke
`/api/social/publish-content` mempublikasikan ke Instagram/TikTok, ke
`/api/ai/voice-bridge/daily-digest` membakar token Gemini.

Yang membuatnya serius: pacing anti-ban yang ditulis hati-hati di worker
(`BATCH_SIZE` per tick 5 menit) hanya bermakna kalau laju tick dikendalikan
`pg_cron`. Penyerang yang me-loop URL-nya melewati pacing itu sepenuhnya —
risiko nomor WhatsApp diblokir permanen.

> Perbaikan: `automation_post()` melampirkan header `x-cron-secret`, dan
> `requireCronAuth()` memverifikasinya dengan perbandingan constant-time.

**T2 — Dispatch bersifat fire-and-forget dan tidak terpantau.**
`net.http_post()` langsung kembali, sehingga `cron.job_run_details` mencatat
`succeeded` untuk setiap job HTTP **walaupun endpoint-nya membalas 500 atau
tidak menjawab sama sekali**. Tidak ada satu pun kode yang membaca
`net._http_response`. Artinya: aplikasi down, deploy rusak, atau token Meta
kedaluwarsa akan tetap tampak hijau seluruhnya di riwayat job.

> Perbaikan: `automation_dispatch_log` + `automation_collect_dispatch_results()`
> + view `v_automation_health`.

**T3 — Kegagalan bersifat senyap.**
Job yang habis retry-nya masuk `dead_letter` tanpa memberi tahu siapa pun.
Saat audit ditemukan 4 baris menganggur di produksi — termasuk satu dari
13 Juli dengan error *"Gemini model gemini-2.5-flash-lite is no longer
available"*. Artinya seluruh kelas balasan AI gagal, dan satu-satunya jejak
adalah tabel yang tidak pernah dibaca siapa pun.

> Perbaikan: `check_automation_health()` mengalerti Super Admin (in-app +
> WhatsApp) untuk dispatch gagal, dead-letter baru, dan antrian macet —
> dengan dedup per episode 6 jam agar tidak jadi kebisingan.

**T4 — URL produksi ter-hardcode** di 5 fungsi dan 6 body cron, sehingga
database staging tidak mungkin diarahkan ke deployment staging. Kini
dibaca dari `automation_config.app_base_url`.

### Belum diperbaiki — perlu keputusan bisnis

**T5 — Penumpukan job AI Senin pagi.** *(kapasitas)*
Data produksi Senin 20 Juli: **33 job AI diantrikan dalam jendela 2 jam**
(21 job pukul 01:00 UTC, 12 job pukul 02:00 UTC), berasal dari ~12 cron
mingguan yang semuanya dijadwalkan antara 08:00–10:20 WITA.

Semuanya melewati **satu API key Gemini** dengan **satu circuit breaker
global** (`ai_circuit_breaker_state`, satu baris `provider='gemini'`). Kalau
breaker terbuka di tengah burst, sisa job dalam jendela itu gagal bersamaan.
Komentar di `lib/ai/config.ts` sudah mencatat model 3.5-flash mengalami 503
"high demand" di bawah beban nyata — persis kondisi yang diciptakan burst ini.

> Rekomendasi: sebar job mingguan ke beberapa hari, atau tambahkan jeda
> 15 menit antar dispatch mingguan. Ini mengubah waktu terbitnya laporan ke
> tim, jadi keputusannya ada di pemilik proses, bukan perubahan teknis murni.

**T6 — Nama job tidak lagi mencerminkan jadwal.** *(kebersihan)*
- `markom-kepala-cabang-pending-reminder-3days` → sebenarnya **harian** 11:30
- `social-weekly-evaluation-dispatch` → sebenarnya **tiap 3 hari**
- `loonars-beauty-weekly-content-audit-dispatch` → sebenarnya **tiap 3 hari**
- `crm-sales-coaching-3days` → benar tiap 3 hari (nama sudah tepat)

Tidak berdampak fungsional, tapi menyesatkan saat insiden. Mengganti nama
berarti `unschedule` + `schedule`; layak digabung ke perubahan terjadwal
berikutnya.

**T7 — Worker Railway menyala 24/7 untuk fitur yang dimatikan.** *(biaya)*
`kontenai_automation_settings.enabled = false`, dan cron
`kontenai-automation-dispatch` tetap jalan tiap 5 menit lalu langsung
`return` (798 eksekusi dalam 7 hari). Kontainer render/Veo di Railway juga
tetap hidup tanpa pekerjaan. Aman secara fungsional, tapi membayar compute
untuk pipeline yang tidak aktif.

**T8 — Tiga job HR nonaktif secara permanen.**
`ai-daily-motivation`, `attendance-checkin-reminder-daily`, dan
`attendance-forgot-checkout-daily` berstatus `active = false` (dimatikan oleh
migrasi `0105` sebagai "routine noise"). Perlu diputuskan: hapus, atau
hidupkan kembali dengan cadence yang lebih jarang.

**T9 — Kunci VAPID push tertulis di kode.**
`app/api/push/send/route.ts` menyimpan private key VAPID sebagai literal.
Komentar di sana mencatat ini keputusan sadar yang sebelumnya disetujui
(tidak ada jalur env var saat itu). Sekarang jalur env var jelas tersedia —
layak dipindahkan ke Vercel Environment Variables saat ada kesempatan.

---

## 5. Cara mengaktifkan autentikasi otomasi

Rollout **fail-open** dan **tidak bergantung urutan** — tidak ada jendela
downtime, dan sisi mana pun boleh dikonfigurasi lebih dulu.

1. Buat sebuah secret acak yang kuat:
   ```bash
   openssl rand -hex 32
   ```
2. Set di Vercel → Project Settings → Environment Variables:
   ```
   CRON_SECRET=<nilai>
   ```
   lalu redeploy.
3. Set nilai **yang sama** di database:
   ```sql
   update public.automation_config
     set cron_secret = '<nilai>', updated_at = now();
   ```
4. Verifikasi — endpoint harus menolak pemanggil tanpa header:
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' \
     -X POST https://mkh.haluoleo.id/api/crm/dispatch-promo-sends
   # 401
   ```
5. Pastikan otomasi asli tetap hijau:
   ```sql
   select * from public.v_automation_health order by path;
   ```

Selama `CRON_SECRET` kosong, guard membiarkan semua request lewat persis
seperti sebelumnya — jadi men-deploy perubahan ini saja tidak mengubah
perilaku apa pun.

### Mengarahkan database staging ke deployment staging

```sql
update public.automation_config
  set app_base_url = 'https://staging.example.com', updated_at = now();
```
