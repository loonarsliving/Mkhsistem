-- ============================================================================
-- MK Connect — 0302: Loonars Connect, Markom inside the Hospitality group
--
-- Owner's request (2026-10-25): Markom belongs in the Hospitality group too.
-- A KOL's room request (and what happens to it) should show up there, and
-- when Hospitality needs content they coordinate with Markom in the same
-- group -- the two teams keep each other informed.
--
-- 1. Membership: Hospitality's settings.member_of = ['markom_jogja'], the
--    same mechanism as Koordinasi Jogja (0298). Everyone in the Markom
--    Jogja group is a 'member' of Hospitality -- they can talk, read and
--    report an issue, but get no Hospitality workflow role (cleaning, FO
--    inspection, security stay with their roles). Joins and leaves follow
--    the Markom group on the normal membership sync. Someone who already
--    has a Hospitality role (Rebecca, manager) keeps it.
-- 2. KOL updates: Markom Jogja's settings.mirror_kol_to = 'hospitality'.
--    Every KOL message in the Markom group (request, approval / rejection,
--    booking, check-in, check-out ...) is copied once into the Hospitality
--    group as a history line. The copy keeps its sender, so a new request
--    pushes to the Hospitality team like any message (0297); system updates
--    stay silent. The copy never breaks the Markom write (exceptions are
--    swallowed) and cannot loop (copies carry no KOL reference).
-- No existing function changes; only settings and one trigger.
-- ============================================================================

update public.mkc_chat_departments
   set settings = settings || jsonb_build_object('member_of', jsonb_build_array('markom_jogja'))
 where code = 'hospitality';

update public.mkc_chat_departments
   set settings = settings || jsonb_build_object('mirror_kol_to', 'hospitality')
 where code = 'markom_jogja';

create or replace function public.mkc_connect_mirror_kol_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_code text;
  v_target uuid;
begin
  begin
    select d.settings ->> 'mirror_kol_to' into v_target_code
    from public.mkc_chat_conversations c
    join public.mkc_chat_departments d on d.id = c.department_id
    where c.id = new.conversation_id and c.kind = 'operational_group';
    if v_target_code is null then
      return null;
    end if;
    select c.id into v_target
    from public.mkc_chat_departments d
    join public.mkc_chat_conversations c on c.department_id = d.id and c.kind = 'operational_group'
    where d.code = v_target_code and d.is_active;
    if v_target is null or v_target = new.conversation_id then
      return null;
    end if;
    perform public.mkc_chat_post(v_target, 'system', new.body, null, null,
      jsonb_build_object('mirrored_from', new.id, 'kol_id', new.ref_id), 'mirror:' || new.id, new.sender_id);
  exception when others then
    raise warning 'Loonars Connect KOL mirror skipped (Markom message kept): %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger mkc_chat_messages_mirror_kol
  after insert on public.mkc_chat_messages
  for each row when (new.ref_table = 'kol')
  execute function public.mkc_connect_mirror_kol_message();

revoke execute on function public.mkc_connect_mirror_kol_message() from public, anon, authenticated;

select public.mkc_chat_sync_members();
