-- ============================================================================
-- MK Connect — 0051: Fix Alya Puspaningrum and Andiko Tito Setyadhi's ROLE.
--
-- Migration 0044 moved them into the Marketing & Komunikasi DIVISION but
-- deliberately left their ROLE as 'sales' ("role... untouched"). Discovered
-- live while verifying the new team-based Markom workflow: kpi_task.view_own
-- is granted by ROLE, not division, so neither of them has ever actually
-- been able to see their own team's checklist -- the Markom feature has been
-- unusable for its own team since it shipped. Now that 'markom' is a proven,
-- real role (0039) they no longer need Sales permissions for (0 prospects,
-- 0 sales_targets ever attached to either of them -- confirmed before this
-- migration), correct the role to match their actual, current job.
-- ============================================================================

update public.employees
set role_id = (select id from public.roles where key = 'markom')
where id in ('e4d7231b-915f-4440-b6ae-e7bf653a5836', '4735d3cd-b974-411c-b262-412a56d364ca')
  and division_id = (select id from public.divisions where name = 'Marketing & Komunikasi');
