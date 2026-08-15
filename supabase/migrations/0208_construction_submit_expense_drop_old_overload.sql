-- 0207's CREATE OR REPLACE added 2 new params to construction_submit_expense,
-- which in Postgres creates a SECOND overload rather than replacing the
-- original (function identity = name + parameter types) -- leaving both the
-- old 7-arg and new 9-arg versions live simultaneously, risking ambiguous
-- overload resolution. Drop the stale one; the 9-arg version (with
-- p_material_id/p_quantity defaulting to null) is a strict superset.
drop function public.construction_submit_expense(uuid, text, text, numeric, text, date, text);
