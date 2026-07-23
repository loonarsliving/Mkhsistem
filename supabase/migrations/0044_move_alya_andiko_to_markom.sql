-- ============================================================================
-- MK Connect — 0044: Move Alya Puspaningrum and Andiko Tito Setyadhi from
-- Marketing & Sales to Marketing & Komunikasi (Markom)
--
-- Division only -- employee id, branch, role, and permissions are untouched.
-- They keep role 'sales' (their existing permission tier); Division alone
-- determines Sales Target vs Markom checklist participation everywhere in
-- the app, per the established "Role = permissions, Division = function"
-- rule.
-- ============================================================================

update public.employees
set division_id = (select id from public.divisions where name = 'Marketing & Komunikasi')
where id in (
  '4735d3cd-b974-411c-b262-412a56d364ca', -- Andiko Tito Setyadhi
  'e4d7231b-915f-4440-b6ae-e7bf653a5836'  -- Alya Puspaningrum
)
and deleted_at is null;
