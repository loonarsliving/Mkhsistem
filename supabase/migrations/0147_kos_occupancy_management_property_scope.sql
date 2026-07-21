-- ============================================================================
-- Scope Kos occupancy visibility to the Management Property branch's own
-- Kepala Cabang, not the Kepala Cabang role in general. Every branch head
-- shares that one role, so a broad role_permissions grant would let every
-- Kepala Cabang (Jogja, Makassar, ...) see Kos data that isn't theirs.
--
-- Branch-scoped access for that specific branch's head is instead handled
-- app-side in lib/rbac/session.ts (compares employee.branch_id against
-- constants/app.ts MANAGEMENT_PROPERTY_BRANCH_ID) and mirrored here in
-- get_kos_occupancy() as defense in depth. Direktur Utama/Operasional and
-- Super Admin keep company-wide access via the existing role grant.
-- ============================================================================

delete from public.role_permissions
where role_id = (select id from public.roles where key = 'kepala_cabang')
  and permission_id = (select id from public.permissions where key = 'kos_occupancy.view');

create or replace function public.get_kos_occupancy()
returns table (property_id uuid, property_name text, total integer, terisi integer, kosong integer)
language plpgsql
security definer
stable
set search_path = public, kos_remote
as $$
begin
  if not (
    public.app_has_permission('kos_occupancy.view')
    or public.app_current_branch_id() = (select id from public.branches where code = 'MP')
  ) then
    raise exception 'permission denied';
  end if;

  return query
    select
      p.id,
      p.nama,
      count(r.id)::integer as total,
      count(r.id) filter (where r.status <> 'available')::integer as terisi,
      count(r.id) filter (where r.status = 'available')::integer as kosong
    from kos_remote.kos_properties p
    left join kos_remote.kos_rooms r on r.property_id = p.id
    where p.is_active
    group by p.id, p.nama
    order by p.nama;
end;
$$;
