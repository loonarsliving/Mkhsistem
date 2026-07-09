-- ============================================================================
-- MK Connect — 0001: Extensions
-- ============================================================================
create extension if not exists "pgcrypto" with schema public;
create extension if not exists "pg_trgm" with schema public;
create extension if not exists "unaccent" with schema public;
