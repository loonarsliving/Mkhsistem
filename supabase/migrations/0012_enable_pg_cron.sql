-- Enables pg_cron so scheduled jobs (e.g. daily attendance finalization) can
-- run inside the database itself, without relying on external infrastructure.
create extension if not exists pg_cron with schema extensions;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
