-- ============================================================================
-- MK Connect — 0301: Loonars Connect, reply to a message (swipe right)
--
-- Owner's request (2026-10-25): swipe a chat bubble to the right to reply to
-- it, like WhatsApp. A reply points at the message it answers
-- (reply_to_id); the app shows the quoted message above the reply and jumps
-- to it on tap. The quote is read live from the original row (RLS applies),
-- so it can only ever show a message of the same conversation.
--
-- mkc_chat_send_message() = mkc_chat_send_text() (0300) + the optional
-- message being replied to, which must belong to the same conversation.
-- mkc_chat_send_text() stays as it is for clients that do not send replies.
-- ============================================================================

alter table public.mkc_chat_messages
  add column reply_to_id uuid references public.mkc_chat_messages(id) on delete set null;
create index mkc_chat_messages_reply_idx on public.mkc_chat_messages (reply_to_id) where reply_to_id is not null;

create or replace function public.mkc_chat_send_message(
  p_conversation_id uuid, p_body text, p_attachment_ids uuid[] default '{}', p_reply_to_id uuid default null
)
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
  if p_reply_to_id is not null
     and not exists (select 1 from public.mkc_chat_messages m where m.id = p_reply_to_id and m.conversation_id = p_conversation_id) then
    raise exception 'Pesan yang dibalas tidak ditemukan di percakapan ini';
  end if;
  insert into public.mkc_chat_messages (conversation_id, sender_id, kind, body, reply_to_id)
  values (p_conversation_id, auth.uid(), 'text', left(trim(coalesce(p_body, '')), 4000), p_reply_to_id)
  returning id into v_id;
  perform public.mkc_chat_link_attachments(p_attachment_ids, p_conversation_id, v_id, null, null, null);
  perform public.mkc_chat_mark_read(p_conversation_id);
  return v_id;
end;
$$;

revoke execute on function public.mkc_chat_send_message(uuid, text, uuid[], uuid) from public, anon;
grant execute on function public.mkc_chat_send_message(uuid, text, uuid[], uuid) to authenticated;
