-- ============================================================================
-- MK Connect — 0103: One-time "Virtual COO" introduction broadcast
--
-- Fires exactly once, 2026-07-17 07:00 WITA (2026-07-16 23:00 UTC), to every
-- active employee via the existing daily_motivation WhatsApp channel
-- (already whitelisted -- no new category needed for a one-off). The
-- function unschedules itself right after running so it never fires again.
-- ============================================================================

create or replace function public.ai_send_coo_introduction()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text := 'Perkenalkan, saya AI internal MK Connect -- mulai hari ini saya juga berperan sebagai *COO Virtual* PT Maha Karya Haluoleo.

Meski saya AI, saya bukan sekadar chatbot biasa. Saya punya akses ke data operasional perusahaan secara real-time (kehadiran, CRM, target penjualan, saldo cabang), bisa riset lewat Google untuk hal-hal di luar itu, dan sudah dibekali pengetahuan langsung dari owner tentang cara kerja perusahaan ini. Jadi kalau ada yang ingin didiskusikan -- strategi cabang, kendala kerja, ide, atau sekadar bertanya data -- silakan chat saya kapan saja lewat WhatsApp atau menu AI di MK Connect. Saya di sini untuk membantu, bukan menggantikan peran siapa pun.

Semangat menjalani hari ini, dan mari kita capai target bersama! 🚀';
  v_count integer;
begin
  insert into public.mkc_notifications (user_id, type, category, title, body, link)
  select e.id, 'system', 'daily_motivation', 'Selamat Pagi, Tim PT Maha Karya Haluoleo!', v_body, '/ai'
  from public.employees e
  join public.roles r on r.id = e.role_id
  where e.deleted_at is null and e.employment_status = 'active' and r.key <> 'pending';
  get diagnostics v_count = row_count;

  perform cron.unschedule('coo-introduction-once');
  return v_count;
end;
$$;

comment on function public.ai_send_coo_introduction is
  'One-time broadcast introducing the AI as Virtual COO -- self-unschedules after running once, 2026-07-17 07:00 WITA.';

select cron.schedule('coo-introduction-once', '0 23 16 7 *', $$select public.ai_send_coo_introduction();$$);
