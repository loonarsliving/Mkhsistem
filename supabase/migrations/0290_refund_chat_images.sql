-- Refund chat: officers can send a photo to a refund customer (owner
-- 2026-10-23, "tambahkan fitur kirim gambar"). The photo is uploaded from the
-- browser into the existing private refund-transfer-proofs bucket under
-- "<customer_id>/..." (same insert/select policies as transfer proofs), and
-- the message row keeps only its storage path -- a fresh signed URL is made
-- whenever the chat is loaded, so nothing long-lived is stored.
alter table public.mkc_refund_chat_messages add column media_path text;

comment on column public.mkc_refund_chat_messages.media_path is
  'Outbound photo sent by a refund officer: storage path in the refund-transfer-proofs bucket ("<customer_id>/..."). Null for text messages.';
