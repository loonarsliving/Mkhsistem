# MK Connect

**Internal Communication & Attendance System** — PT Maha Karya Haluoleo

MK Connect adalah aplikasi internal resmi untuk seluruh karyawan PT Maha Karya Haluoleo. Versi 1 mencakup autentikasi, dashboard, absensi (GPS + selfie), memo, pengumuman, manajemen karyawan/cabang/divisi/jabatan, notifikasi realtime, pencarian global, dan pengaturan perusahaan — dibangun di atas arsitektur yang siap dikembangkan menjadi ERP internal perusahaan.

> **Catatan proyek Supabase**: Instance produksi MK Connect saat ini adalah proyek Supabase `svcmybsziaelwwdrnzcv` yang **dipakai bersama (shared)** dengan aplikasi villa-rental lain milik organisasi yang sama. Karena itu tabel `notifications` bawaan MK Connect diberi nama `mkc_notifications` (bukan `notifications`) untuk menghindari bentrok dengan tabel `notifications` milik aplikasi villa yang sudah ada lebih dulu — lihat komentar di `supabase/migrations/0005_notifications_audit_settings.sql`. Seluruh tabel/fungsi lain sudah diverifikasi tidak bentrok dan tetap memakai nama aslinya. Jika MK Connect suatu saat dipindah ke proyek Supabase khusus (dedicated), penyesuaian nama ini boleh dibalik.

---

## Tech Stack

| Layer | Teknologi |
|---|---|
| Framework | Next.js 15 (App Router, Server Components, Server Actions) |
| Bahasa | TypeScript (strict mode) |
| Styling | Tailwind CSS + Radix UI primitives |
| Backend | Supabase (PostgreSQL, Auth, Storage, Realtime, RLS) |
| Data fetching | TanStack Query, Server Actions |
| Tabel | TanStack Table |
| Form | React Hook Form + Zod |
| Notifikasi UI | Sonner |
| Tanggal | date-fns |
| Ikon | Lucide React |
| Hosting | Vercel |

## Arsitektur

Clean architecture dengan pemisahan tanggung jawab per layer:

```
app/            Route segments (App Router) — (auth), (app), api
components/     UI primitives (ui/) & shared cross-feature components (shared/, layout/)
features/       Modul per domain: actions (Server Actions), schemas (Zod), components, hooks
repositories/   Akses data Supabase murni (query builder), tanpa business logic
services/       Business logic lintas-repository (mis. signed URL storage)
lib/            Supabase client factories, RBAC session resolver, utils
hooks/          Reusable client hooks (geolocation, camera, debounce, ...)
constants/      RBAC, status enum, navigasi, konfigurasi aplikasi
types/          Tipe database (mirror schema) & tipe domain
supabase/       Migrations SQL, seed SQL, config
scripts/        Script operasional (seed demo user)
```

**Alur data**: `page.tsx` (Server Component) → `repositories/*` (query) atau `features/*/actions` (mutation via Server Action) → Supabase (RLS-enforced). Komponen klien memanggil Server Actions langsung atau via TanStack Query untuk data interaktif (filter, pagination, realtime).

**RBAC**: Role & permission disimpan di database (`roles`, `permissions`, `role_permissions`), bukan hardcoded — role baru dapat ditambahkan tanpa migrasi skema. Setiap Server Action memvalidasi permission melalui `requirePermission()` (lib/rbac/session.ts), dan Postgres RLS menjadi lapisan pertahanan kedua yang independen dari kode aplikasi.

## Modul Versi 1

- **Authentication** — login, logout, forgot/reset password, protected routes via middleware, RBAC
- **Self-registration** (`/register`) — karyawan mendaftar sendiri (Cabang: Makassar/Jabodetabek/Kendari/Yogyakarta + Divisi), akun langsung dibuat di Supabase Auth tapi dengan role `pending` dan `is_active=false` — tidak bisa login sampai disetujui. Approval bertingkat: Super Admin & Direktur Operasional melihat/menyetujui semua cabang; Kepala Cabang hanya cabang sendiri (Jabodetabek & Kendari belum punya Kepala Cabang, jadi approval-nya jatuh ke Direktur Operasional/Super Admin secara otomatis — tidak di-hardcode per cabang). Approve/reject lewat RPC `approve_employee_registration()`/`reject_employee_registration()` (`supabase/migrations/0018_self_registration.sql`) — mengunci baris (`for update`) dan mengecek ulang status sebelum menulis, jadi dua approval bersamaan tidak mungkin terjadi; approver yang tidak berwenang mendapat error tanpa pernah tahu apakah registrasi itu sudah diproses. Notifikasi realtime terkirim ke approver yang tepat saat pendaftaran masuk, dan dashboard mereka menampilkan card jumlah "Pending Registration".
- **Dashboard** — ringkasan profil, status kehadiran hari ini, statistik bulanan, memo & pengumuman terbaru, quick actions
- **Attendance** — check-in/out dengan GPS + selfie + validasi radius kantor, riwayat & filter & export CSV, pengajuan izin/sakit & approval, pengaturan jam kerja
- **Memo** — CRUD, pin, prioritas, wajib dibaca, lampiran, read receipt, targeting (cabang/divisi/jabatan/user)
- **Pengumuman** — CRUD, kategori, lampiran, pin, tanggal kedaluwarsa, targeting
- **Employee / Branch / Division / Position** — CRUD lengkap dengan RBAC
- **Notification** — realtime via Supabase Realtime, unread badge
- **Profile** — edit profil, foto, ganti password
- **Search** — pencarian global (memo, pengumuman, karyawan)
- **Settings** — profil perusahaan, jam kerja, lokasi kantor, radius absensi

## Struktur Database

Seluruh skema ada di `supabase/migrations/` (dijalankan berurutan sesuai nomor file):

1. `0001_extensions.sql` — pgcrypto, pg_trgm, unaccent
2. `0002_core_tables.sql` — roles, permissions, role_permissions, branches, divisions, positions, employees
3. `0003_attendance_tables.sql` — work_schedules, attendance, leave_requests
4. `0004_communication_tables.sql` — memos, memo_targets, memo_attachments, memo_reads, announcements, announcement_categories, announcement_targets, announcement_attachments
5. `0005_notifications_audit_settings.sql` — notifications, audit_logs, company_settings
6. `0006_functions_and_triggers.sql` — updated_at trigger, audit log trigger, RBAC helper functions, geo distance function, target audience resolver
7. `0007_rpc_functions.sql` — transactional RPCs: check-in/out, leave approval, create memo/announcement (+ notification fan-out)
8. `0008_views.sql` — reporting views (employee directory, today's attendance, monthly stats, memo read stats)
9. `0009_rls_policies.sql` — Row Level Security policies untuk seluruh tabel
10. `0010_storage.sql` — storage buckets & policies

Semua tabel menggunakan **UUID primary key**, kolom audit (`created_at`, `updated_at`, `created_by`, `updated_by`), **soft delete** (`deleted_at`), foreign key + index yang relevan, dan **Row Level Security** aktif dengan policy sesuai role & cabang.

Seed data ada di `supabase/seed/`:
- `01_rbac_seed.sql` — permissions, roles, role_permissions
- `02_reference_seed.sql` — cabang, divisi, jabatan, jadwal kerja default, company settings

## Setup

### 1. Buat proyek Supabase

Buat proyek baru di [supabase.com](https://supabase.com), lalu catat `Project URL`, `anon key`, dan `service_role key` dari **Project Settings → API**.

### 2. Jalankan migration & seed

Install [Supabase CLI](https://supabase.com/docs/guides/cli) secara terpisah (bukan sebagai dependency proyek ini — gunakan Homebrew/Scoop/binary release sesuai OS Anda), lalu:

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push               # menjalankan seluruh file di supabase/migrations
psql "$(supabase db url)" -f supabase/seed/01_rbac_seed.sql
psql "$(supabase db url)" -f supabase/seed/02_reference_seed.sql
```

Atau jalankan isi setiap file secara manual via **SQL Editor** di Supabase Dashboard (urutkan sesuai nomor file).

### 3. Konfigurasi environment

```bash
cp .env.example .env.local
```

Isi `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxxx
SUPABASE_SERVICE_ROLE_KEY=xxxxx
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Install & jalankan

```bash
npm install
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000).

### 5. Buat akun pengguna pertama

Karyawan dibuat melalui modul **Employee**, yang mengirim undangan email via Supabase Auth (`inviteUserByEmail`) — namun untuk akun *pertama* (Super Admin) belum ada user yang bisa membuatnya lewat UI. Dua opsi:

**A. Script seed demo (untuk development):**

```bash
SUPABASE_SERVICE_ROLE_KEY=xxxxx NEXT_PUBLIC_SUPABASE_URL=xxxxx npm run seed:users
```

Membuat 5 akun demo (super admin, direktur, HR, kepala cabang, staff) dengan password `MkConnect#2026`. Lihat `scripts/seed-users.ts`.

**B. Manual (untuk production):** buat user melalui **Authentication → Users → Add User** di Supabase Dashboard, lalu insert satu baris ke tabel `employees` yang mereferensikan `id` user tersebut dengan `role_id` milik role `super_admin` (lihat `supabase/seed/01_rbac_seed.sql`).

## Deploy ke Vercel

1. Push repository ini ke GitHub.
2. Import project di [vercel.com/new](https://vercel.com/new).
3. Tambahkan environment variables yang sama seperti `.env.local` di **Project Settings → Environment Variables**.
4. Deploy — Vercel otomatis mendeteksi Next.js, tidak perlu konfigurasi build tambahan.
5. Tambahkan domain produksi ke **Supabase → Authentication → URL Configuration → Redirect URLs** (untuk flow reset password & invite).

## Perintah yang Tersedia

```bash
npm run dev              # development server
npm run build             # production build
npm run start             # jalankan production build
npm run lint                # ESLint
npm run typecheck           # TypeScript strict check
npm run format                # Prettier
npm run supabase:types         # generate types/database.types.ts dari proyek Supabase live
npm run seed:users              # seed akun demo (lihat di atas)
npm test                         # unit test (Vitest, tanpa network)
npm run test:coverage             # unit test + laporan coverage
npm run test:integration           # integration test terhadap Supabase live (lihat tests/integration/README.md)
npm run test:e2e                    # end-to-end test (Playwright)
npm run backup:db                    # backup database manual (lihat docs/BACKUP.md)
```

## Testing

- **Unit** (`tests/unit/`) — Vitest, tanpa dependency eksternal. Mencakup `lib/utils`, integritas seed RBAC, validasi Zod untuk setiap schema form, dan beberapa komponen UI. Jalankan dengan `npm test`.
- **Integration** (`tests/integration/`) — Vitest terhadap proyek Supabase live menggunakan dua akun uji berhak-akses-rendah (`TEST-STAFF-001`, `TEST-HR-001`): RLS, resolusi permission per role, RPC absensi, targeting & read-receipt memo. Lihat `tests/integration/README.md` untuk environment variable yang dibutuhkan.
- **End-to-end** (`tests/e2e/`) — Playwright dengan kamera palsu (`--use-fake-device-for-media-stream`) dan geolocation ter-mock, menjalankan alur check-in/check-out sungguhan lewat UI, bukan hanya lewat RPC.
- Integration & e2e membutuhkan akses network ke Supabase sehingga dijalankan di GitHub Actions (`.github/workflows/ci.yml`), bukan di sandbox dev lokal yang egress-nya dibatasi.

## CI/CD

`.github/workflows/ci.yml` berjalan pada setiap push/PR: lint, typecheck, unit test, build selalu jalan (tanpa secret apa pun). Integration & e2e test otomatis aktif begitu 4 secret berikut ditambahkan di **Settings → Secrets and variables → Actions**: `TEST_STAFF_EMAIL`, `TEST_STAFF_PASSWORD`, `TEST_HR_EMAIL`, `TEST_HR_PASSWORD` — sebelum itu, job tersebut di-skip secara eksplisit (bukan gagal). `.github/workflows/codeql.yml` menjalankan static analysis mingguan + setiap push. `.github/dependabot.yml` membuka PR pembaruan dependency mingguan.

## Backup & Recovery

Lihat [`docs/BACKUP.md`](docs/BACKUP.md) — proyek Supabase saat ini di plan Free (tanpa backup otomatis dari Supabase). Backup terjadwal harian via `.github/workflows/backup.yml` sudah di-deploy tapi butuh 2 secret (`SUPABASE_DB_URL`, `BACKUP_ENCRYPTION_KEY`) sebelum aktif — dokumen tersebut menjelaskan cara mendapatkannya dan prosedur restore.

## Monitoring, Logging & Error Tracking

Semua bagian di bawah ini benar-benar berjalan begitu di-deploy — tidak ada yang menunggu akun pihak ketiga:

- **Health check** — `GET /api/health` (publik, tanpa auth) melakukan round-trip nyata ke database lewat RPC `health_check()` dan mengembalikan status `ok`/`degraded` beserta latensi. Arahkan uptime monitor (UptimeRobot, Better Stack, dll) atau load balancer ke endpoint ini.
- **Logging** — `lib/logger.ts` menulis satu baris JSON terstruktur per event ke stdout/stderr. Vercel (dan platform log collector standar lainnya) menangkap ini otomatis tanpa setup tambahan.
- **Error tracking** — dua jalur, keduanya menulis ke tabel `mkc_error_logs`:
  - Server: `instrumentation.ts` (`onRequestError`, API bawaan Next.js 15) menangkap error tak tertangani di Route Handler, Server Action, dan RSC.
  - Client: `app/(app)/error.tsx` & `app/global-error.tsx` menangkap error React, lalu mengirim ke server lewat `reportClientErrorAction`.
  - Dilihat & diselesaikan lewat halaman **Monitoring** (`/monitoring`, permission `system.monitoring_view`, default hanya Super Admin).
- **Performance monitoring** — `components/shared/web-vitals-reporter.tsx` mengirim Core Web Vitals (CLS, FCP, FID, INP, LCP, TTFB) tiap page view ke `mkc_performance_metrics`; halaman Monitoring menampilkan agregat p75 7-hari terakhir (`v_performance_summary`). `@vercel/speed-insights` juga aktif otomatis begitu di-deploy ke Vercel.
- **Scheduled jobs** — `pg_cron` aktif di database live dengan **55 job terjadwal** (absensi, CRM, Markom, konten, iklan Meta, knowledge bank, sinkronisasi finance). Inventaris lengkapnya — beserta jadwal UTC/WITA, empat jalur eksekusi otomasi, dan hasil audit lapisan ini — ada di [`docs/AUTOMATION.md`](docs/AUTOMATION.md).
- **Automation health** — `automation_dispatch_log` mencatat setiap panggilan HTTP dari `pg_cron`/trigger ke aplikasi, dan `check_automation_health()` (tiap jam) mengalerti Super Admin saat dispatch gagal, job AI masuk dead letter, atau antrian `ai_job_queue` macet. Ini diperlukan karena `net.http_post()` bersifat fire-and-forget: tanpanya `cron.job_run_details` melaporkan `succeeded` untuk dispatch yang endpoint-nya membalas 500. Ringkasan per endpoint: view `v_automation_health`.
- **Automation auth** — sepuluh route yang hanya boleh dipanggil `pg_cron`/trigger dijaga `requireCronAuth()` (`lib/security/cron-auth.ts`) lewat shared secret `CRON_SECRET`. Guard ini **fail-open selama secret belum diisi**, jadi aktivasinya tidak butuh jendela downtime — lihat prosedurnya di [`docs/AUTOMATION.md`](docs/AUTOMATION.md#5-cara-mengaktifkan-autentikasi-otomasi).

## Keamanan

- **RLS di setiap tabel** — akses data selalu difilter berdasarkan role & cabang di level database, independen dari kode aplikasi.
- **Permission check ganda** — Server Action memvalidasi permission sebelum eksekusi (defense in depth bersama RLS).
- **Service role key** hanya dipakai di `lib/supabase/admin.ts` (server-only, untuk provisioning akun karyawan) — tidak pernah diekspos ke client.
- **Validasi input** dengan Zod di setiap Server Action.
- **Security headers**: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security` (static, `next.config.ts`) plus a per-request nonce-based **Content-Security-Policy** (`lib/security/csp.ts`, applied in `lib/supabase/middleware.ts`) — `script-src` uses a fresh nonce + `strict-dynamic` per request, blocking injected/inline script execution; `style-src` allows `'unsafe-inline'` deliberately (Radix UI positions popovers/dropdowns via inline `style` attributes, which nonces cannot cover). Verified against a real `next build && next start` with Playwright: zero CSP violations, hydration and client-side validation both work.
- **Login rate limiting** — `mkc_login_attempts` + `check_login_lockout()`/`record_login_attempt()` (SECURITY DEFINER RPCs, `supabase/migrations/0015_login_rate_limiting.sql`) lock an email out for 15 minutes after 5 failed attempts; old rows are pruned daily by `pg_cron`. Enforced in `loginAction` before Supabase Auth is even called.
- **Storage** — bucket privat untuk selfie absensi & lampiran izin (signed URL, TTL 10 menit); bucket publik hanya untuk avatar & aset perusahaan.
- **Audit log** otomatis (trigger) untuk seluruh tabel penting (`employees`, `attendance`, `leave_requests`, `memos`, `announcements`, dll).
- **Perlindungan akun Super Admin** — trigger `prevent_non_super_admin_from_altering_super_admin` (`supabase/migrations/0016_rbac_refinement.sql`) memblokir siapa pun yang bukan Super Admin dari menghapus, menonaktifkan, atau mengubah role akun Super Admin lain — meski aktor tersebut punya `employee.manage` (mis. Direktur Operasional). Melengkapi trigger Root Owner yang sudah ada (`0011_root_owner_protection.sql`), yang secara spesifik melindungi satu akun pemilik yang ditandai `is_root_owner`.
- **Akun produksi tidak pernah masuk git** — repo ini publik. Akun demo (`scripts/seed-users.ts`) memakai password bersama yang memang dimaksudkan publik. Akun karyawan sungguhan (Owner, direksi, kepala cabang, HR, dst.) dibuat langsung ke database live lewat Supabase MCP/SQL, dengan cara yang identik ke pola provisioning Root Owner — **tidak pernah** ditulis ke file migrasi atau commit apa pun. Kredensial akun tersebut disampaikan hanya lewat percakapan pemberi tugas.

## Roadmap ERP

Struktur database dan folder sudah dirancang agar mudah dikembangkan tanpa refactor besar:
- `divisions`/`positions` bersifat company-wide dengan `branch_id` opsional → siap untuk struktur organisasi lebih kompleks.
- `roles`/`permissions` data-driven → modul baru cukup menambah permission key baru + policy RLS, tanpa mengubah struktur inti.
- Folder `features/` per domain memudahkan penambahan modul baru (payroll, inventory, procurement, dll) sebagai folder baru yang mandiri.
