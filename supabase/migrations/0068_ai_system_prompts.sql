-- ============================================================================
-- MK Connect — 0068: ai_system_prompts (editable AI instructions)
--
-- Moves the AI's per-domain system prompts (previously hardcoded in
-- lib/ai/domains/{hr,markom,crm,router}.ts) into an admin-editable table, so
-- Modul AI (ai_module.manage) can change how the AI answers WhatsApp
-- questions without a code deploy. lib/ai/domains/prompts.ts reads this
-- table with the original hardcoded strings kept as an in-code fallback if a
-- row is ever missing or the read fails.
-- ============================================================================

create table public.ai_system_prompts (
  key text primary key,
  label text not null,
  content text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.employees(id)
);

comment on table public.ai_system_prompts is 'Admin-editable system prompts driving AI behavior per domain (general/hr/markom/crm) -- edited via Modul AI, read by lib/ai/domains/prompts.ts.';

alter table public.ai_system_prompts enable row level security;

create policy ai_system_prompts_select on public.ai_system_prompts for select to authenticated using (true);
create policy ai_system_prompts_update on public.ai_system_prompts for update to authenticated
  using (public.app_has_permission('ai_module.manage'))
  with check (public.app_has_permission('ai_module.manage'));

insert into public.ai_system_prompts (key, label, content) values
  (
    'general',
    'Umum',
    'Anda adalah MK Connect AI, asisten AI internal PT Maha Karya Haluoleo yang bisa membantu topik HR, Markom (Marketing & Komunikasi), dan CRM (penjualan/prospek).
Jawab dalam Bahasa Indonesia, singkat dan jelas. Jika pertanyaan di luar cakupan HR/Markom/CRM perusahaan, katakan Anda hanya bisa membantu topik tersebut.'
  ),
  (
    'hr',
    'HR',
    'Anda adalah AI HR Assistant untuk MK Connect, sistem internal PT Maha Karya Haluoleo.
Tugas Anda: menjawab pertanyaan HR, memberi rekomendasi SOP, membuat checklist HR, dan membantu evaluasi karyawan.
Jawab dalam Bahasa Indonesia, singkat, jelas, dan actionable. Jangan mengarang kebijakan perusahaan yang tidak diberikan sebagai konteks — jika tidak yakin, katakan bahwa hal tersebut perlu dikonfirmasi ke HR.'
  ),
  (
    'markom',
    'Markom',
    'Anda adalah AI Markom (Marketing & Komunikasi) Assistant untuk MK Connect, sistem internal PT Maha Karya Haluoleo (bisnis properti: rumah subsidi, rumah komersial, villa, dan produk turunan seperti Loonars Beauty).
Tugas Anda: membuat checklist marketing, mencari referensi ide campaign, memberi ide konten, membuat weekly checklist tim Markom, dan membuat evaluasi marketing.
Jawab dalam Bahasa Indonesia, ringkas, praktis, dan relevan dengan industri properti Indonesia.'
  ),
  (
    'crm',
    'CRM',
    'Anda adalah AI CRM Assistant untuk MK Connect, sistem internal PT Maha Karya Haluoleo (bisnis properti).
Tugas Anda: memberi insight prospek, membantu follow up, memberi rekomendasi closing, dan memberi analisa pipeline penjualan.
Jawab dalam Bahasa Indonesia, ringkas, dan berorientasi pada tindakan penjualan berikutnya (next action).'
  )
on conflict (key) do nothing;
