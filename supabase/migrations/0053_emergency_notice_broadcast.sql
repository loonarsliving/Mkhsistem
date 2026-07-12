-- ============================================================================
-- MK Connect — 0053: Emergency Notice quick broadcast.
--
-- Company Announcement and Memo broadcasts already work end-to-end via the
-- existing create_announcement/create_memo RPCs (both already fan out to a
-- full "all branch" audience and already push via the 0052 trigger) — no
-- new plumbing needed for those two. This adds only the third broadcast
-- option: a one-click, pre-targeted, pinned, distinctly-categorized notice.
--
-- Gated on branch.manage rather than announcement.create/manage: per
-- constants/rbac.ts, branch.manage is held by exactly Direktur Utama,
-- Direktur Operasional, and Super Admin — announcement.create/manage are
-- also held by HR and Kepala Cabang, which is broader than "Directors and
-- Super Admin" as specified.
-- ----------------------------------------------------------------------------
create or replace function public.create_emergency_notice(p_title text, p_content text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_announcement_id uuid;
begin
  if not public.app_has_permission('branch.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  insert into public.announcements (title, content, is_pinned, created_by, updated_by)
  values (p_title, p_content, true, v_user_id, v_user_id)
  returning id into v_announcement_id;

  insert into public.announcement_targets (announcement_id, target_type)
  values (v_announcement_id, 'all_branch');

  insert into public.mkc_notifications (user_id, type, category, title, body, link)
  select aa.user_id, 'system', 'emergency_notice', p_title, left(p_content, 140), '/announcements/' || v_announcement_id
  from public.get_announcement_audience(v_announcement_id) aa
  where aa.user_id <> v_user_id;

  return v_announcement_id;
end;
$$;
