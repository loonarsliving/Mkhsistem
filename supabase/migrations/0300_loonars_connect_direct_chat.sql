-- ============================================================================
-- MK Connect — 0300: Loonars Connect, direct (1-on-1) chat
--
-- Owner's request (2026-10-25): chat with employees one-on-one in the chat
-- app, not only in groups. Owner's choices: anyone in scope may start a chat;
-- scope = employees of the Jogja branch (JOG) and Loonars Private Living
-- (LPL), plus the owners; photos follow the same 30-day retention as groups.
--
-- A direct chat is a conversation of kind 'direct' with exactly two members
-- (source 'direct'), under one technical department 'pesan_pribadi' that
-- holds the scope and retention settings. One conversation per pair
-- (direct_key = the two ids, smallest first). Text, photos, WhatsApp-style
-- push (0297), unread counts and realtime are the existing pipeline.
--
-- Privacy: a direct chat is readable ONLY by its two members. The owner's
-- department-wide bypass (mkc_hosp_can_view_department, used by the member /
-- attachment / storage policies) is switched off for the direct department,
-- and mkc_chat_can_read admits 'direct' only through membership. Membership
-- sync never touches direct members (they are not derived from divisions).
-- Leaving the scope later (moved branch) does not remove an existing chat;
-- leaving the company does (mkc_chat_employee_eligible, as for groups).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Schema
-- ----------------------------------------------------------------------------
alter table public.mkc_chat_conversations drop constraint mkc_chat_conversations_kind_check;
alter table public.mkc_chat_conversations add constraint mkc_chat_conversations_kind_check
  check (kind in ('operational_group', 'owner_feed', 'direct'));

alter table public.mkc_chat_conversations
  add column direct_key text,
  add column created_by uuid references public.employees(id);
alter table public.mkc_chat_conversations add constraint mkc_chat_conversations_direct_key_check
  check ((kind = 'direct') = (direct_key is not null));

-- One group / feed per department still; any number of direct chats.
alter table public.mkc_chat_conversations drop constraint mkc_chat_conversations_department_id_kind_key;
create unique index mkc_chat_conversations_department_kind_uidx on public.mkc_chat_conversations (department_id, kind)
  where kind <> 'direct';
create unique index mkc_chat_conversations_direct_key_uidx on public.mkc_chat_conversations (direct_key)
  where direct_key is not null;

alter table public.mkc_chat_members drop constraint mkc_chat_members_source_check;
alter table public.mkc_chat_members add constraint mkc_chat_members_source_check
  check (source in ('division', 'assignment', 'department', 'owner', 'direct'));

insert into public.mkc_chat_departments (code, name, branch_id, timezone, settings)
values ('pesan_pribadi', 'Pesan Pribadi', null, 'Asia/Jakarta', jsonb_build_object(
  'kind', 'direct',
  'direct_scope', jsonb_build_object('branch_codes', jsonb_build_array('JOG', 'LPL'), 'include_owners', true),
  'retention_days', 30
))
on conflict (code) do nothing;

-- ----------------------------------------------------------------------------
-- Helpers (internal)
-- ----------------------------------------------------------------------------
create or replace function public.mkc_chat_is_direct_department(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select d.settings ->> 'kind' = 'direct' from public.mkc_chat_departments d where d.id = p_department_id), false)
$$;

create or replace function public.mkc_chat_direct_key(p_a uuid, p_b uuid)
returns text
language sql
immutable
as $$
  select least(p_a::text, p_b::text) || ':' || greatest(p_a::text, p_b::text)
$$;

-- In scope = active employee of a listed branch, or an owner (settings).
create or replace function public.mkc_chat_direct_in_scope(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.mkc_chat_employee_eligible(p_employee_id) and exists (
    select 1 from public.mkc_chat_departments d
    where d.code = 'pesan_pribadi' and d.is_active
      and (
        exists (
          select 1 from public.employees e join public.branches b on b.id = e.branch_id
          where e.id = p_employee_id
            and b.code in (select jsonb_array_elements_text(coalesce(d.settings -> 'direct_scope' -> 'branch_codes', '[]'::jsonb)))
        )
        or (coalesce((d.settings -> 'direct_scope' ->> 'include_owners')::boolean, false)
            and p_employee_id = any (public.mkc_hosp_owner_ids()))
      )
  )
$$;

-- ----------------------------------------------------------------------------
-- Access: direct chats only through membership
-- ----------------------------------------------------------------------------
create or replace function public.mkc_chat_can_read(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.mkc_chat_conversations c
    where c.id = p_conversation_id
      and (
        (c.kind in ('operational_group', 'direct') and public.mkc_chat_my_role(c.id) is not null)
        or (c.kind = 'owner_feed' and public.app_has_permission('hospitality.owner_report'))
      )
  )
$$;

-- The owner's bypass covers operational departments, never private chats.
create or replace function public.mkc_hosp_can_view_department(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (public.app_has_permission('hospitality.owner_report') and not public.mkc_chat_is_direct_department(p_department_id))
      or exists (
        select 1 from public.mkc_chat_conversations c
        where c.department_id = p_department_id and c.kind = 'operational_group'
          and public.mkc_chat_my_role(c.id) is not null
      )
$$;

-- The member / attachment / photo policies (0291) found a conversation's
-- department with a subquery that runs under RLS: for a conversation the
-- caller cannot see it returned NULL, and mkc_hosp_can_view_department(NULL)
-- is true for the owner -- that NULL path is how the owner saw group members
-- and photos, and it would also have opened direct chats. Look the
-- department up without RLS instead, so the owner's access stays exactly
-- the operational departments.
create or replace function public.mkc_chat_conversation_department(p_conversation_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select department_id from public.mkc_chat_conversations where id = p_conversation_id
$$;

-- ALTER POLICY: same policies, new expression, no window without a policy.
alter policy mkc_chat_members_select on public.mkc_chat_members
  using (public.mkc_chat_can_read(conversation_id)
         or public.mkc_hosp_can_view_department(public.mkc_chat_conversation_department(conversation_id)));
alter policy mkc_chat_attachments_select on public.mkc_chat_attachments
  using (public.mkc_chat_can_read(conversation_id)
         or public.mkc_hosp_can_view_department(public.mkc_chat_conversation_department(conversation_id)));
alter policy hospitality_evidence_select on storage.objects
  using (
    bucket_id = 'hospitality-evidence'
    and exists (
      select 1 from public.mkc_chat_attachments a
      where a.object_path = name and a.deleted_at is null
        and (public.mkc_chat_can_read(a.conversation_id)
             or public.mkc_hosp_can_view_department(public.mkc_chat_conversation_department(a.conversation_id)))
    )
  );

-- Same as 0291, except direct members are never removed by the sync.
create or replace function public.mkc_chat_sync_members()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed integer := 0;
  v_n integer;
begin
  insert into public.mkc_chat_members (conversation_id, employee_id, member_role, source)
  select d.conversation_id, d.employee_id, d.member_role, d.source from public.mkc_chat_desired_members() d
  on conflict (conversation_id, employee_id) do update
    set member_role = excluded.member_role,
        source = excluded.source,
        removed_at = null,
        joined_at = case when mkc_chat_members.removed_at is not null then now() else mkc_chat_members.joined_at end
    where mkc_chat_members.removed_at is not null
       or mkc_chat_members.member_role <> excluded.member_role
       or mkc_chat_members.source <> excluded.source;
  get diagnostics v_n = row_count;
  v_changed := v_changed + v_n;

  update public.mkc_chat_members m set removed_at = now()
  where m.removed_at is null
    and m.source <> 'direct'
    and not exists (
      select 1 from public.mkc_chat_desired_members() d where d.conversation_id = m.conversation_id and d.employee_id = m.employee_id
    );
  get diagnostics v_n = row_count;
  v_changed := v_changed + v_n;

  return v_changed;
end;
$$;

-- ----------------------------------------------------------------------------
-- Client RPCs
-- ----------------------------------------------------------------------------
-- Whether the caller may use direct chat (also opens the /chat entry point).
create or replace function public.mkc_chat_direct_available()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.mkc_chat_direct_in_scope(auth.uid())
$$;

-- People the caller can chat with, with the existing conversation if any.
create or replace function public.mkc_chat_direct_contacts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.mkc_chat_direct_in_scope(auth.uid()) then
    raise exception 'Chat pribadi belum tersedia untuk akun Anda' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', e.id, 'name', e.full_name, 'branch', b.name, 'position', p.name, 'conversation_id', c.id
           ) order by e.full_name)
    from public.employees e
    left join public.branches b on b.id = e.branch_id
    left join public.positions p on p.id = e.position_id
    left join public.mkc_chat_conversations c on c.direct_key = public.mkc_chat_direct_key(auth.uid(), e.id)
    where e.id <> auth.uid() and public.mkc_chat_direct_in_scope(e.id)
  ), '[]'::jsonb);
end;
$$;

-- Opens (or reuses) the caller's chat with one person. Returns its id.
create or replace function public.mkc_chat_direct_open(p_employee_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dept uuid;
  v_key text;
  v_id uuid;
begin
  if p_employee_id is null or p_employee_id = auth.uid() then
    raise exception 'Pilih karyawan lain';
  end if;
  if not public.mkc_chat_direct_in_scope(auth.uid()) then
    raise exception 'Chat pribadi belum tersedia untuk akun Anda' using errcode = '42501';
  end if;
  if not public.mkc_chat_direct_in_scope(p_employee_id) then
    raise exception 'Karyawan ini tidak bisa dihubungi lewat chat pribadi' using errcode = '42501';
  end if;
  select id into v_dept from public.mkc_chat_departments where code = 'pesan_pribadi' and is_active;
  if v_dept is null then
    raise exception 'Chat pribadi sedang tidak aktif';
  end if;

  v_key := public.mkc_chat_direct_key(auth.uid(), p_employee_id);
  insert into public.mkc_chat_conversations (department_id, kind, name, direct_key, created_by)
  values (v_dept, 'direct', 'Pesan pribadi', v_key, auth.uid())
  on conflict (direct_key) where direct_key is not null do nothing;
  select id into v_id from public.mkc_chat_conversations where direct_key = v_key;

  insert into public.mkc_chat_members (conversation_id, employee_id, member_role, source)
  select v_id, x, 'member', 'direct' from unnest(array[auth.uid(), p_employee_id]) as x
  on conflict (conversation_id, employee_id) do update
    set removed_at = null, joined_at = now()
    where mkc_chat_members.removed_at is not null;
  return v_id;
end;
$$;

-- 0291 list + direct chats: named after the other person; an empty direct
-- chat shows only to whoever opened it (no blank chat on the other phone).
create or replace function public.mkc_chat_list()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.last_at desc nulls last), '[]'::jsonb)
  from (
    select c.id, c.kind,
           case when c.kind = 'direct' then coalesce(peer.full_name, 'Karyawan') else c.name end as name,
           case when c.kind = 'direct' then concat_ws(' · ', peer.position_name, peer.branch_name) else c.description end as description,
           d.code as department_code, d.name as department_name,
           public.mkc_chat_my_role(c.id) as my_role,
           (select count(*) from public.mkc_chat_members m where m.conversation_id = c.id and m.removed_at is null) as member_count,
           lm.created_at as last_at, lm.body as last_body, lm.kind as last_kind,
           (select e.full_name from public.employees e where e.id = lm.sender_id) as last_sender,
           (select count(*) from public.mkc_chat_messages x
             where x.conversation_id = c.id and x.sender_id is distinct from auth.uid()
               and x.created_at > coalesce((select r.last_read_at from public.mkc_chat_reads r
                                            where r.conversation_id = c.id and r.employee_id = auth.uid()), '-infinity'::timestamptz)
           ) as unread,
           peer.id as peer_id
    from public.mkc_chat_conversations c
    join public.mkc_chat_departments d on d.id = c.department_id and d.is_active
    left join lateral (
      select * from public.mkc_chat_messages m where m.conversation_id = c.id order by m.created_at desc limit 1
    ) lm on true
    left join lateral (
      select e.id, e.full_name, b.name as branch_name, p.name as position_name
      from public.mkc_chat_members m
      join public.employees e on e.id = m.employee_id
      left join public.branches b on b.id = e.branch_id
      left join public.positions p on p.id = e.position_id
      where c.kind = 'direct' and m.conversation_id = c.id and m.employee_id <> auth.uid()
      limit 1
    ) peer on true
    where public.mkc_chat_can_read(c.id)
      and (c.kind <> 'direct' or lm.id is not null or c.created_by = auth.uid())
  ) t
$$;

-- 0291 send + direct chats.
create or replace function public.mkc_chat_send_text(p_conversation_id uuid, p_body text, p_attachment_ids uuid[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_kind text;
begin
  select kind into v_kind from public.mkc_chat_conversations where id = p_conversation_id;
  if v_kind is null or v_kind not in ('operational_group', 'direct') or public.mkc_chat_my_role(p_conversation_id) is null then
    raise exception 'Anda bukan anggota percakapan ini' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_body, ''))) = 0 and coalesce(cardinality(p_attachment_ids), 0) = 0 then
    raise exception 'Pesan kosong';
  end if;
  insert into public.mkc_chat_messages (conversation_id, sender_id, kind, body)
  values (p_conversation_id, auth.uid(), 'text', left(trim(coalesce(p_body, '')), 4000))
  returning id into v_id;
  perform public.mkc_chat_link_attachments(p_attachment_ids, p_conversation_id, v_id, null, null, null);
  perform public.mkc_chat_mark_read(p_conversation_id);
  return v_id;
end;
$$;

-- 0297 push + direct chats (title = sender only, like WhatsApp).
create or replace function public.mkc_chat_message_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv record;
  v_sender text;
  v_preview text;
begin
  if new.sender_id is null then
    return null;
  end if;
  begin
    select c.id, c.kind, c.name into v_conv from public.mkc_chat_conversations c where c.id = new.conversation_id;
    if v_conv.kind is null or v_conv.kind not in ('operational_group', 'direct') then
      return null;
    end if;
    select full_name into v_sender from public.employees where id = new.sender_id;
    v_preview := case
      when new.kind = 'text' then coalesce(nullif(trim(new.body), ''),
        case when exists (select 1 from public.mkc_chat_attachments a where a.message_id = new.id) then '📷 Foto' else 'Pesan baru' end)
      else coalesce(nullif(trim(new.body), ''), 'Pembaruan baru')
    end;
    insert into public.mkc_notifications (user_id, type, title, body, link, category, metadata, status, is_read)
    select m.employee_id, 'system',
           left(case when v_conv.kind = 'direct' then coalesce(v_sender, 'Pesan pribadi')
                     else coalesce(v_sender, 'Anggota') || ' · ' || v_conv.name end, 200),
           left(v_preview, 300),
           '/chat?c=' || new.conversation_id,
           'chat_message',
           jsonb_build_object('conversation_id', new.conversation_id, 'message_id', new.id, 'sender_id', new.sender_id),
           'archived', true
    from public.mkc_chat_members m
    where m.conversation_id = new.conversation_id
      and m.removed_at is null
      and m.employee_id <> new.sender_id
      and public.mkc_chat_employee_eligible(m.employee_id)
      -- already told about this event by a workflow notification in this transaction
      and not exists (select 1 from public.mkc_notifications n
                      where n.user_id = m.employee_id and n.created_at = now() and n.category is distinct from 'chat_message');
  exception when others then
    raise warning 'Loonars Connect chat push skipped (message kept): %', sqlerrm;
  end;
  return null;
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------
revoke execute on function
  public.mkc_chat_is_direct_department(uuid),
  public.mkc_chat_direct_key(uuid, uuid),
  public.mkc_chat_direct_in_scope(uuid)
from public, anon, authenticated;

-- used directly by RLS policies, so callable by signed-in users
revoke execute on function public.mkc_chat_conversation_department(uuid) from public, anon;
grant execute on function public.mkc_chat_conversation_department(uuid) to authenticated;

revoke execute on function
  public.mkc_chat_direct_available(),
  public.mkc_chat_direct_contacts(),
  public.mkc_chat_direct_open(uuid)
from public, anon;

grant execute on function
  public.mkc_chat_direct_available(),
  public.mkc_chat_direct_contacts(),
  public.mkc_chat_direct_open(uuid)
to authenticated;
