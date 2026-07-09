-- ============================================================================
-- MK Connect — 0002: Core reference tables
-- roles, permissions, role_permissions, branches, divisions, positions, employees
-- ============================================================================

-- ----------------------------------------------------------------------------
-- roles: data-driven RBAC. New roles can be added without touching the schema.
-- `level` is a coarse authority rank (lower = higher authority) used for
-- simple hierarchy checks (e.g. "can approve requests from lower levels").
-- ----------------------------------------------------------------------------
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  level smallint not null default 100,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
comment on table public.roles is 'Data-driven roles; new roles do not require a migration.';

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

-- ----------------------------------------------------------------------------
-- branches
-- ----------------------------------------------------------------------------
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  address text,
  city text,
  latitude double precision,
  longitude double precision,
  radius_meters integer not null default 100 check (radius_meters > 0),
  phone text,
  is_head_office boolean not null default false,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
create index branches_is_active_idx on public.branches (is_active) where deleted_at is null;

-- ----------------------------------------------------------------------------
-- divisions (company-wide by default; branch_id lets a division be scoped
-- to a single branch in the future without a schema change)
-- ----------------------------------------------------------------------------
create table public.divisions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id) on delete cascade,
  code text,
  name text not null,
  description text,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (branch_id, name)
);
create index divisions_branch_id_idx on public.divisions (branch_id);

-- ----------------------------------------------------------------------------
-- positions (jabatan). `level` supports future approval-hierarchy logic.
-- ----------------------------------------------------------------------------
create table public.positions (
  id uuid primary key default gen_random_uuid(),
  code text,
  name text not null unique,
  level smallint not null default 100,
  description text,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

-- ----------------------------------------------------------------------------
-- employees: 1:1 extension of auth.users. This is the app-facing "user"
-- table everything else joins against.
-- ----------------------------------------------------------------------------
create table public.employees (
  id uuid primary key references auth.users(id) on delete cascade,
  employee_code text not null unique,
  full_name text not null,
  email text not null,
  phone text,
  avatar_url text,
  branch_id uuid not null references public.branches(id) on delete restrict,
  division_id uuid references public.divisions(id) on delete set null,
  position_id uuid references public.positions(id) on delete set null,
  role_id uuid not null references public.roles(id) on delete restrict,
  employment_status text not null default 'active'
    check (employment_status in ('active', 'inactive', 'on_leave', 'terminated')),
  gender text check (gender in ('male', 'female')),
  birth_date date,
  join_date date not null default current_date,
  address text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
create index employees_branch_id_idx on public.employees (branch_id);
create index employees_division_id_idx on public.employees (division_id);
create index employees_position_id_idx on public.employees (position_id);
create index employees_role_id_idx on public.employees (role_id);
create index employees_employment_status_idx on public.employees (employment_status);
create index employees_full_name_trgm_idx on public.employees using gin (full_name gin_trgm_ops);
