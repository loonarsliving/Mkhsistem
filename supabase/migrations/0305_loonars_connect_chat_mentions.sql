-- ============================================================================
-- MK Connect — 0305: Loonars Connect, tag people in a chat (@name)
--
-- Owner's request (2026-10-25): people in a group chat can tag each other by
-- name. Typing "@" in the composer lists the group's members; the tagged
-- people are stored on the message (payload.mentions, uuid list) so the app
-- can highlight "@Name" and the push can say who was tagged.
--
-- 1. mkc_chat_send_message gains a 5-argument form with p_mention_ids. Only
--    active members of the same conversation other than the sender are kept
--    (at most 20); anything else is silently dropped. The existing 4-argument
--    form now calls it with no tags, so every current caller is unchanged.
--    (The 5-argument form has no defaults, so a call with 4 arguments is
--    never ambiguous.)
-- 2. mkc_chat_message_notify (0300): a tagged member's push reads
--    "📣 <sender> menandai Anda · <group>" instead of "<sender> · <group>";
--    everyone else gets the same push as before. metadata.mentioned marks it.
-- WhatsApp lead conversations still reject internal messages (0303 check).
-- ============================================================================

-- 0303 send + tags.
create or replace function public.mkc_chat_send_message(
  p_conversation_id uuid, p_body text, p_attachment_ids uuid[], p_reply_to_id uuid, p_mention_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_kind text;
  v_mentions uuid[];
begin
  select kind into v_kind from public.mkc_chat_conversations where id = p_conversation_id;
  if v_kind is null or v_kind not in ('operational_group', 'direct') or public.mkc_chat_my_role(p_conversation_id) is null then
    raise exception 'Anda bukan anggota percakapan ini' using errcode = '42501';
  end if;
  if exists (select 1 from public.mkc_wa_leads where conversation_id = p_conversation_id) then
    raise exception 'Percakapan lead WA dibalas lewat WhatsApp';
  end if;
  if length(trim(coalesce(p_body, ''))) = 0 and coalesce(cardinality(p_attachment_ids), 0) = 0 then
    raise exception 'Pesan kosong';
  end if;
  if p_reply_to_id is not null
     and not exists (select 1 from public.mkc_chat_messages m where m.id = p_reply_to_id and m.conversation_id = p_conversation_id) then
    raise exception 'Pesan yang dibalas tidak ditemukan di percakapan ini';
  end if;
  -- Tags: active members of this conversation other than the sender, at most 20.
  select coalesce(array_agg(x.id), '{}') into v_mentions
  from (
    select distinct m.employee_id as id
    from public.mkc_chat_members m
    where m.conversation_id = p_conversation_id and m.removed_at is null
      and m.employee_id = any (coalesce(p_mention_ids, '{}'))
      and m.employee_id <> auth.uid()
    limit 20
  ) x;
  insert into public.mkc_chat_messages (conversation_id, sender_id, kind, body, reply_to_id, payload)
  values (p_conversation_id, auth.uid(), 'text', left(trim(coalesce(p_body, '')), 4000), p_reply_to_id,
          case when cardinality(v_mentions) > 0 then jsonb_build_object('mentions', to_jsonb(v_mentions)) else '{}'::jsonb end)
  returning id into v_id;
  perform public.mkc_chat_link_attachments(p_attachment_ids, p_conversation_id, v_id, null, null, null);
  perform public.mkc_chat_mark_read(p_conversation_id);
  return v_id;
end;
$$;

-- 0301 / 0303 4-argument form: the same send, no tags.
create or replace function public.mkc_chat_send_message(
  p_conversation_id uuid, p_body text, p_attachment_ids uuid[] default '{}', p_reply_to_id uuid default null
)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.mkc_chat_send_message(p_conversation_id, p_body, p_attachment_ids, p_reply_to_id, '{}'::uuid[])
$$;

-- 0300 notify + "tagged you" title for mentioned members.
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
                     when coalesce(new.payload -> 'mentions', '[]'::jsonb) ? m.employee_id::text
                       then '📣 ' || coalesce(v_sender, 'Anggota') || ' menandai Anda · ' || v_conv.name
                     else coalesce(v_sender, 'Anggota') || ' · ' || v_conv.name end, 200),
           left(v_preview, 300),
           '/chat?c=' || new.conversation_id,
           'chat_message',
           jsonb_build_object('conversation_id', new.conversation_id, 'message_id', new.id, 'sender_id', new.sender_id,
                              'mentioned', coalesce(new.payload -> 'mentions', '[]'::jsonb) ? m.employee_id::text),
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

revoke execute on function public.mkc_chat_send_message(uuid, text, uuid[], uuid, uuid[]) from public, anon;
grant execute on function public.mkc_chat_send_message(uuid, text, uuid[], uuid, uuid[]) to authenticated;
revoke execute on function public.mkc_chat_message_notify() from public, anon, authenticated;
