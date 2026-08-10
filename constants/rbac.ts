/**
 * Roles are data-driven (stored in the `roles` table), not a hardcoded enum,
 * so new roles can be added without a schema or code change. These keys are
 * the seed set for v1 and are used only as typed references in app code /
 * seed data — the source of truth at runtime is always the database row.
 */
export const ROLE_KEYS = {
  SUPER_ADMIN: "super_admin",
  DIREKTUR_UTAMA: "direktur_utama",
  DIREKTUR_OPERASIONAL: "direktur_operasional",
  HR: "hr",
  KEPALA_CABANG: "kepala_cabang",
  MANAGER: "manager",
  STAFF: "staff",
  SALES: "sales",
  FINANCE: "finance",
  MARKOM: "markom",
  /**
   * Private assistant to the Super Admin. Deliberately a *visibility* role,
   * not an authority one: it can see everything the principal would see --
   * including payroll figures -- but holds no approve, verify, manage, or
   * publish permission anywhere. If an assistant could
   * approve, the audit trail would record decisions under a principal who
   * never saw them, which destroys the evidentiary value of every approval
   * in the system.
   */
  PRIVATE_ASSISTANT: "private_assistant",
  /** Placeholder role for self-registered accounts awaiting approval — grants nothing. */
  PENDING: "pending",
} as const;

export type RoleKey = (typeof ROLE_KEYS)[keyof typeof ROLE_KEYS];

/**
 * Permission keys follow `<resource>.<action>` and are additive: a role has
 * a permission if it exists in role_permissions. Scope (own / branch / all)
 * is resolved separately via RLS + branch_id comparison, not encoded here.
 */
export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",

  ATTENDANCE_VIEW_OWN: "attendance.view_own",
  ATTENDANCE_VIEW_BRANCH: "attendance.view_branch",
  ATTENDANCE_VIEW_ALL: "attendance.view_all",
  ATTENDANCE_MANAGE: "attendance.manage",
  ATTENDANCE_SETTINGS_MANAGE: "attendance.settings_manage",
  ATTENDANCE_EXPORT: "attendance.export",

  MEMO_VIEW: "memo.view",
  MEMO_CREATE: "memo.create",
  MEMO_MANAGE: "memo.manage",

  ANNOUNCEMENT_VIEW: "announcement.view",
  ANNOUNCEMENT_CREATE: "announcement.create",
  ANNOUNCEMENT_MANAGE: "announcement.manage",

  EMPLOYEE_VIEW_BRANCH: "employee.view_branch",
  EMPLOYEE_VIEW_ALL: "employee.view_all",
  EMPLOYEE_MANAGE: "employee.manage",

  BRANCH_MANAGE: "branch.manage",
  DIVISION_MANAGE: "division.manage",
  POSITION_MANAGE: "position.manage",
  ROLE_MANAGE: "role.manage",

  SETTINGS_MANAGE: "settings.manage",
  AUDIT_LOG_VIEW: "audit_log.view",
  SYSTEM_MONITORING_VIEW: "system.monitoring_view",

  REGISTRATION_VIEW_ALL: "registration.view_all",
  REGISTRATION_VIEW_BRANCH: "registration.view_branch",
  REGISTRATION_MANAGE: "registration.manage",

  PROSPECT_VIEW_OWN: "prospect.view_own",
  PROSPECT_VIEW_BRANCH: "prospect.view_branch",
  PROSPECT_VIEW_ALL: "prospect.view_all",
  PROSPECT_CREATE: "prospect.create",
  PROSPECT_MANAGE: "prospect.manage",
  PROSPECT_FOLLOW_UP_CREATE: "prospect.follow_up_create",
  PROSPECT_FINANCE_VERIFY: "prospect.finance_verify",

  SALES_TARGET_VIEW_OWN: "sales_target.view_own",
  SALES_TARGET_VIEW_BRANCH: "sales_target.view_branch",
  SALES_TARGET_VIEW_ALL: "sales_target.view_all",
  SALES_TARGET_MANAGE: "sales_target.manage",

  CRM_ANALYTICS_VIEW_BRANCH: "crm_analytics.view_branch",
  CRM_ANALYTICS_VIEW_ALL: "crm_analytics.view_all",
  CRM_ANALYTICS_VIEW_EXECUTIVE: "crm_analytics.view_executive",
  CRM_PROJECT_MANAGE: "crm_project.manage",
  // Not a real DB-granted permission — injected in-session for Jogja branch
  // employees only (see lib/rbac/session.ts), same pattern as
  // KOS_OCCUPANCY_VIEW. Gates the "Siteplan Loonars Villa" nav link, since
  // that project only exists in Jogja.
  LOONARS_SALES_VIEW: "loonars_sales.view",

  KPI_TASK_VIEW_OWN: "kpi_task.view_own",
  KPI_TASK_VIEW_BRANCH: "kpi_task.view_branch",
  KPI_TASK_VIEW_ALL: "kpi_task.view_all",
  KPI_TASK_ASSIGN: "kpi_task.assign",
  KPI_TASK_VERIFY: "kpi_task.verify",

  PAYROLL_MANAGE: "payroll.manage",
  /**
   * Read payroll figures without the authority to approve a run.
   * payroll.manage was the only payroll permission, so "let them see the
   * numbers" and "let them approve the money" could not be separated --
   * this splits them.
   */
  PAYROLL_VIEW: "payroll.view",
  HR_EXPENSE_CREATE: "hr_expense.create",
  HR_EXPENSE_APPROVE: "hr_expense.approve",

  MESSAGING_SEND: "messaging.send",

  AI_MODULE_MANAGE: "ai_module.manage",

  SP1_WARNING_MANAGE: "sp1_warning.manage",
  SP1_WARNING_VIEW_ALL: "sp1_warning.view_all",

  CRM_PROJECT_PHOTO_MANAGE: "crm_project_photo.manage",

  AD_CAMPAIGN_VIEW: "ad_campaign.view",
  AD_CAMPAIGN_MANAGE: "ad_campaign.manage",

  CONTENT_PLANNER_VIEW: "content_planner.view",
  CONTENT_PLANNER_MANAGE: "content_planner.manage",

  PROMO_TEMPLATE_VIEW: "promo_template.view",
  PROMO_TEMPLATE_MANAGE: "promo_template.manage",

  CONTENT_SUBMISSION_MANAGE: "content_submission.manage",

  LOONARS_BEAUTY_VIEW: "loonars_beauty.view",
  LOONARS_BEAUTY_MANAGE: "loonars_beauty.manage",

  KOS_OCCUPANCY_VIEW: "kos_occupancy.view",

  /**
   * FRIDAY — the executive intelligence layer (/friday).
   *
   * Three permissions rather than one, because reading FRIDAY's analysis,
   * asking it a question, and authorizing it to act are genuinely different
   * powers. Only the third one sends a WhatsApp message to a Kepala Cabang or
   * queues a job, which is why private_assistant holds the first two and not
   * the third (same reasoning as every other permission that role has).
   */
  FRIDAY_VIEW: "friday.view",
  FRIDAY_RUN: "friday.run",
  FRIDAY_ACTION_DECIDE: "friday.action_decide",

  /**
   * Holding group view (/friday/holding) — FRIDAY reading every business unit
   * at once. Separate from FRIDAY_VIEW because group performance is a
   * different audience than one company's operations.
   *
   * HOLDING_MANAGE is split off deliberately: it edits connector_config, which
   * decides what URL this server fetches on a schedule. That is a materially
   * different power from reading the group report.
   */
  HOLDING_VIEW: "holding.view",
  HOLDING_MANAGE: "holding.manage",

  /** Gates /hr — the HR control room (action queue + live attendance + compliance). */
  HR_WORKSPACE_VIEW: "hr_workspace.view",
  /** Gates /asisten — the private assistant's workspace. */
  ASSISTANT_WORKSPACE_VIEW: "assistant_workspace.view",
  /** Personal follow-up list on /asisten. Separate from the view permission so the page can be granted read-only to someone else later. */
  ASSISTANT_FOLLOWUP_MANAGE: "assistant_followup.manage",

  /** Issue SP1/SP2/SP3 disciplinary letters. Distinct from SP1_WARNING_* which is sales performance, not conduct. */
  HR_DISCIPLINE_WARN: "hr_discipline.warn",
  /** Terminate an employee. Split from the warn permission so it can be withheld separately. */
  HR_DISCIPLINE_TERMINATE: "hr_discipline.terminate",
  HR_DISCIPLINE_VIEW: "hr_discipline.view",

  /**
   * Input a single employee's salary + bank account, which sends them a
   * payslip notification and asks Super Admin to transfer the money.
   * Distinct from PAYROLL_MANAGE (the batch payroll_runs module): this is
   * the one-employee-at-a-time path a Kepala Cabang uses directly.
   */
  SALARY_INPUT_SUBMIT: "salary_input.submit",
  /** See salary submissions awaiting transfer and mark them transferred. */
  SALARY_INPUT_TRANSFER: "salary_input.transfer",

  /**
   * Construction project finance (dana proyek pembangunan) -- currently
   * Kendari-only, see KENDARI_BRANCH_ID / getCurrentSession(). A Kepala
   * Cabang inputs gaji tukang / pembelian material (always utang toko);
   * Super Admin/Finance allocate dana and settle utang.
   */
  CONSTRUCTION_FINANCE_VIEW_OWN: "construction_finance.view_own",
  CONSTRUCTION_FINANCE_SUBMIT: "construction_finance.submit",
  CONSTRUCTION_FINANCE_MANAGE: "construction_finance.manage",

  /**
   * WhatsApp-only approval requests (0201) -- Kepala Cabang submits
   * ("AJUKAN ...", text/photo), Super Admin decides by replying
   * SETUJU/TOLAK. This page is read-only history/status; the actual
   * submit/decide actions happen over WA, not here.
   */
  APPROVAL_REQUEST_VIEW_OWN: "approval_request.view_own",
  APPROVAL_REQUEST_MANAGE: "approval_request.manage",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Every branch shares the "Kepala Cabang" role, so these can't be scoped to
 * just Jogja via role_permissions alone -- RLS still needs the role grant
 * (removing it would break Jogja's own Kepala Cabang's queries too, since
 * kpi_tasks/content_planner RLS already scopes each Kepala Cabang to their
 * own branch_id). getCurrentSession() strips these back out of the session
 * for any Kepala Cabang whose branch isn't Jogja, so the Markom pages/nav
 * only ever render for Jogja's own branch head.
 */
export const MARKOM_KEPALA_CABANG_PERMISSIONS = [
  "kpi_task.view_branch",
  "kpi_task.assign",
  "kpi_task.verify",
  "content_planner.view",
  "content_planner.manage",
] as const satisfies readonly PermissionKey[];

/**
 * Same pattern as MARKOM_KEPALA_CABANG_PERMISSIONS above, but for
 * construction project finance -- granted at the role level (every branch
 * shares "Kepala Cabang"), stripped back out in getCurrentSession() for any
 * Kepala Cabang whose branch isn't Kendari (KENDARI_BRANCH_ID).
 */
export const CONSTRUCTION_FINANCE_KEPALA_CABANG_PERMISSIONS = [
  "construction_finance.view_own",
  "construction_finance.submit",
] as const satisfies readonly PermissionKey[];

/**
 * Owner's explicit call: Kendari's Kepala Cabang (currently Fasly) should
 * NOT get the normal full Kepala Cabang facility set -- only the dashboard
 * and the construction project finance input/saldo page. getCurrentSession()
 * reduces the session down to exactly this allow-list for any Kepala Cabang
 * whose branch is Kendari, instead of the usual strip-list approach used
 * elsewhere in this file. If Kendari's scope is ever meant to grow back
 * toward the normal Kepala Cabang set, widen this list -- don't special-case
 * around it.
 */
export const KENDARI_KEPALA_CABANG_ALLOWED_PERMISSIONS = [
  "dashboard.view",
  "construction_finance.view_own",
  "construction_finance.submit",
] as const satisfies readonly PermissionKey[];

/** Seed mapping of role -> permissions, mirrored in supabase/seed/02_rbac_seed.sql */
export const ROLE_PERMISSIONS_SEED: Record<RoleKey, PermissionKey[]> = {
  [ROLE_KEYS.SUPER_ADMIN]: Object.values(PERMISSIONS),
  [ROLE_KEYS.DIREKTUR_UTAMA]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.ATTENDANCE_VIEW_ALL,
    PERMISSIONS.ATTENDANCE_EXPORT,
    PERMISSIONS.MEMO_VIEW,
    PERMISSIONS.MEMO_CREATE,
    PERMISSIONS.MEMO_MANAGE,
    PERMISSIONS.ANNOUNCEMENT_VIEW,
    PERMISSIONS.ANNOUNCEMENT_CREATE,
    PERMISSIONS.ANNOUNCEMENT_MANAGE,
    PERMISSIONS.EMPLOYEE_VIEW_ALL,
    PERMISSIONS.EMPLOYEE_MANAGE,
    PERMISSIONS.BRANCH_MANAGE,
    PERMISSIONS.DIVISION_MANAGE,
    PERMISSIONS.POSITION_MANAGE,
    PERMISSIONS.SETTINGS_MANAGE,
    PERMISSIONS.AUDIT_LOG_VIEW,
    PERMISSIONS.PROSPECT_VIEW_ALL,
    PERMISSIONS.PROSPECT_MANAGE,
    PERMISSIONS.SALES_TARGET_VIEW_ALL,
    PERMISSIONS.SALES_TARGET_MANAGE,
    PERMISSIONS.CRM_ANALYTICS_VIEW_ALL,
    PERMISSIONS.CRM_ANALYTICS_VIEW_EXECUTIVE,
    PERMISSIONS.CRM_PROJECT_MANAGE,
    PERMISSIONS.LOONARS_BEAUTY_VIEW,
    PERMISSIONS.LOONARS_BEAUTY_MANAGE,
    PERMISSIONS.KOS_OCCUPANCY_VIEW,
    // Markom pages (Checklist/Assign/Ranking/Foto Project/Content
    // Studio/Content Planner/Content Audit/Promo Broadcast) are
    // deliberately NOT granted here -- owner's call: only the Markom role,
    // Jogja's own Kepala Cabang, and Super Admin get Markom access for now.
    PERMISSIONS.HR_DISCIPLINE_VIEW,
    PERMISSIONS.FRIDAY_VIEW,
    PERMISSIONS.FRIDAY_RUN,
    PERMISSIONS.FRIDAY_ACTION_DECIDE,
    PERMISSIONS.HOLDING_VIEW,
    PERMISSIONS.HOLDING_MANAGE,
  ],
  [ROLE_KEYS.DIREKTUR_OPERASIONAL]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.ATTENDANCE_VIEW_ALL,
    PERMISSIONS.ATTENDANCE_MANAGE,
    PERMISSIONS.ATTENDANCE_SETTINGS_MANAGE,
    PERMISSIONS.ATTENDANCE_EXPORT,
    PERMISSIONS.MEMO_VIEW,
    PERMISSIONS.MEMO_CREATE,
    PERMISSIONS.MEMO_MANAGE,
    PERMISSIONS.ANNOUNCEMENT_VIEW,
    PERMISSIONS.ANNOUNCEMENT_CREATE,
    PERMISSIONS.ANNOUNCEMENT_MANAGE,
    PERMISSIONS.EMPLOYEE_VIEW_ALL,
    PERMISSIONS.EMPLOYEE_MANAGE,
    PERMISSIONS.BRANCH_MANAGE,
    PERMISSIONS.DIVISION_MANAGE,
    PERMISSIONS.POSITION_MANAGE,
    PERMISSIONS.REGISTRATION_VIEW_ALL,
    PERMISSIONS.REGISTRATION_MANAGE,
    PERMISSIONS.PROSPECT_VIEW_ALL,
    PERMISSIONS.SALES_TARGET_VIEW_ALL,
    PERMISSIONS.SALES_TARGET_MANAGE,
    PERMISSIONS.CRM_ANALYTICS_VIEW_ALL,
    PERMISSIONS.CRM_PROJECT_MANAGE,
    PERMISSIONS.LOONARS_BEAUTY_VIEW,
    PERMISSIONS.LOONARS_BEAUTY_MANAGE,
    PERMISSIONS.PAYROLL_MANAGE,
    PERMISSIONS.PAYROLL_VIEW,
    PERMISSIONS.HR_EXPENSE_CREATE,
    PERMISSIONS.HR_EXPENSE_APPROVE,
    PERMISSIONS.SP1_WARNING_MANAGE,
    PERMISSIONS.SP1_WARNING_VIEW_ALL,
    PERMISSIONS.KOS_OCCUPANCY_VIEW,
    // Markom pages deliberately NOT granted here -- see Direktur Utama note.
    PERMISSIONS.HR_DISCIPLINE_VIEW,
    PERMISSIONS.FRIDAY_VIEW,
    PERMISSIONS.FRIDAY_RUN,
    PERMISSIONS.FRIDAY_ACTION_DECIDE,
    // Reads the group, does not re-wire it -- HOLDING_MANAGE edits connector
    // endpoints and stays with Super Admin / Direktur Utama.
    PERMISSIONS.HOLDING_VIEW,
    PERMISSIONS.SALARY_INPUT_SUBMIT,
    PERMISSIONS.CONSTRUCTION_FINANCE_VIEW_OWN,
    PERMISSIONS.CONSTRUCTION_FINANCE_MANAGE,
  ],
  // HR administers people and attendance company-wide but must not be able
  // to restructure the org chart (branches/divisions/positions) or touch
  // roles/settings — those stay with Direktur Utama/Operasional.
  [ROLE_KEYS.HR]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.ATTENDANCE_VIEW_ALL,
    PERMISSIONS.ATTENDANCE_MANAGE,
    PERMISSIONS.ATTENDANCE_SETTINGS_MANAGE,
    PERMISSIONS.ATTENDANCE_EXPORT,
    PERMISSIONS.MEMO_VIEW,
    PERMISSIONS.MEMO_CREATE,
    PERMISSIONS.MEMO_MANAGE,
    PERMISSIONS.ANNOUNCEMENT_VIEW,
    PERMISSIONS.ANNOUNCEMENT_CREATE,
    PERMISSIONS.ANNOUNCEMENT_MANAGE,
    PERMISSIONS.EMPLOYEE_VIEW_ALL,
    PERMISSIONS.EMPLOYEE_MANAGE,
    // Approving a new hire is core HR work, but the original seed gave
    // registration control only to Direktur Operasional and Kepala Cabang,
    // so an HR account could create and manage employees yet not admit them.
    PERMISSIONS.REGISTRATION_VIEW_ALL,
    PERMISSIONS.REGISTRATION_MANAGE,
    PERMISSIONS.PAYROLL_MANAGE,
    PERMISSIONS.PAYROLL_VIEW,
    PERMISSIONS.HR_EXPENSE_CREATE,
    PERMISSIONS.HR_EXPENSE_APPROVE,
    PERMISSIONS.SP1_WARNING_MANAGE,
    PERMISSIONS.SP1_WARNING_VIEW_ALL,
    PERMISSIONS.HR_WORKSPACE_VIEW,
    PERMISSIONS.HR_DISCIPLINE_WARN,
    PERMISSIONS.HR_DISCIPLINE_TERMINATE,
    PERMISSIONS.HR_DISCIPLINE_VIEW,
    PERMISSIONS.SALARY_INPUT_SUBMIT,
  ],
  [ROLE_KEYS.KEPALA_CABANG]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.ATTENDANCE_VIEW_BRANCH,
    PERMISSIONS.ATTENDANCE_EXPORT,
    PERMISSIONS.MEMO_VIEW,
    PERMISSIONS.MEMO_CREATE,
    PERMISSIONS.ANNOUNCEMENT_VIEW,
    PERMISSIONS.ANNOUNCEMENT_CREATE,
    PERMISSIONS.EMPLOYEE_VIEW_BRANCH,
    PERMISSIONS.REGISTRATION_VIEW_BRANCH,
    PERMISSIONS.REGISTRATION_MANAGE,
    PERMISSIONS.PROSPECT_VIEW_BRANCH,
    PERMISSIONS.PROSPECT_FOLLOW_UP_CREATE,
    PERMISSIONS.SALES_TARGET_VIEW_BRANCH,
    PERMISSIONS.CRM_ANALYTICS_VIEW_BRANCH,
    // kpi_task.* / content_planner.* (Markom pages) stay granted at the role
    // level -- every branch shares this role and RLS already scopes each
    // Kepala Cabang to their own branch_id, so this can't leak Jogja's data
    // to another branch. getCurrentSession() strips these back out of the
    // session for any Kepala Cabang whose branch isn't Jogja (see
    // MARKOM_KEPALA_CABANG_PERMISSIONS), so the pages/nav only render for
    // Jogja's own head.
    PERMISSIONS.KPI_TASK_VIEW_BRANCH,
    PERMISSIONS.KPI_TASK_ASSIGN,
    PERMISSIONS.KPI_TASK_VERIFY,
    PERMISSIONS.HR_EXPENSE_CREATE,
    PERMISSIONS.SP1_WARNING_MANAGE,
    PERMISSIONS.CONTENT_PLANNER_VIEW,
    PERMISSIONS.CONTENT_PLANNER_MANAGE,
    PERMISSIONS.LOONARS_BEAUTY_VIEW,
    PERMISSIONS.LOONARS_BEAUTY_MANAGE,
    PERMISSIONS.SALARY_INPUT_SUBMIT,
    // construction_finance.* stays granted at the role level for the same
    // reason as kpi_task/content_planner above -- see
    // CONSTRUCTION_FINANCE_KEPALA_CABANG_PERMISSIONS -- and is stripped back
    // out in getCurrentSession() for any branch that isn't Kendari.
    PERMISSIONS.CONSTRUCTION_FINANCE_VIEW_OWN,
    PERMISSIONS.CONSTRUCTION_FINANCE_SUBMIT,
    // Unlike construction_finance.*, approval_request.view_own applies to
    // every branch's Kepala Cabang -- the WA submission flow (0201) isn't
    // Kendari-specific.
    PERMISSIONS.APPROVAL_REQUEST_VIEW_OWN,
    // kos_occupancy.view is deliberately NOT granted here -- every branch
    // shares the "Kepala Cabang" role, but Kos occupancy is scoped to the
    // Management Property branch specifically. That branch's Kepala Cabang
    // gets it via a branch-based check in getCurrentSession(), not this role
    // grant, so other branches' heads don't see it.
  ],
  [ROLE_KEYS.MANAGER]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.ATTENDANCE_VIEW_BRANCH,
    PERMISSIONS.MEMO_VIEW,
    PERMISSIONS.MEMO_CREATE,
    PERMISSIONS.ANNOUNCEMENT_VIEW,
    PERMISSIONS.EMPLOYEE_VIEW_BRANCH,
    PERMISSIONS.HR_EXPENSE_CREATE,
  ],
  [ROLE_KEYS.STAFF]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.ATTENDANCE_VIEW_OWN,
    PERMISSIONS.MEMO_VIEW,
    PERMISSIONS.ANNOUNCEMENT_VIEW,
    PERMISSIONS.HR_EXPENSE_CREATE,
  ],
  [ROLE_KEYS.SALES]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.ATTENDANCE_VIEW_OWN,
    PERMISSIONS.MEMO_VIEW,
    PERMISSIONS.ANNOUNCEMENT_VIEW,
    PERMISSIONS.PROSPECT_VIEW_OWN,
    PERMISSIONS.PROSPECT_CREATE,
    PERMISSIONS.PROSPECT_FOLLOW_UP_CREATE,
    PERMISSIONS.SALES_TARGET_VIEW_OWN,
    PERMISSIONS.HR_EXPENSE_CREATE,
  ],
  [ROLE_KEYS.FINANCE]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.ATTENDANCE_VIEW_OWN,
    PERMISSIONS.MEMO_VIEW,
    PERMISSIONS.ANNOUNCEMENT_VIEW,
    PERMISSIONS.PROSPECT_VIEW_ALL,
    PERMISSIONS.PROSPECT_FINANCE_VERIFY,
    PERMISSIONS.CRM_ANALYTICS_VIEW_ALL,
    PERMISSIONS.PAYROLL_MANAGE,
    PERMISSIONS.PAYROLL_VIEW,
    PERMISSIONS.HR_EXPENSE_CREATE,
    PERMISSIONS.HR_EXPENSE_APPROVE,
    PERMISSIONS.SALARY_INPUT_TRANSFER,
    PERMISSIONS.CONSTRUCTION_FINANCE_VIEW_OWN,
    PERMISSIONS.CONSTRUCTION_FINANCE_MANAGE,
  ],
  [ROLE_KEYS.MARKOM]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.ATTENDANCE_VIEW_OWN,
    PERMISSIONS.MEMO_VIEW,
    PERMISSIONS.ANNOUNCEMENT_VIEW,
    PERMISSIONS.KPI_TASK_VIEW_OWN,
    PERMISSIONS.HR_EXPENSE_CREATE,
    PERMISSIONS.CRM_PROJECT_PHOTO_MANAGE,
    PERMISSIONS.CONTENT_SUBMISSION_MANAGE,
    PERMISSIONS.CONTENT_PLANNER_VIEW,
    PERMISSIONS.CONTENT_PLANNER_MANAGE,
    PERMISSIONS.LOONARS_BEAUTY_VIEW,
    PERMISSIONS.LOONARS_BEAUTY_MANAGE,
  ],
  /**
   * Assists the Super Admin, so the visibility is the widest of any
   * non-admin role -- the point of the role is that nothing reaches the
   * principal's desk without the assistant having already seen it.
   *
   * Every entry below is a *_view / *_view_all permission. There is no
   * manage, approve, verify, create, or send anywhere in this list, and
   * that is the whole design: the assistant chases and prepares, the
   * principal decides. Note memo/announcement creation is absent even
   * though "drafting" was the intent -- memos publish the instant they are
   * created (published_at defaults to now(), no draft state), so memo.create
   * is a publish right today, not a drafting one. Adding a real draft state
   * is the prerequisite for granting it.
   */
  [ROLE_KEYS.PRIVATE_ASSISTANT]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.ASSISTANT_WORKSPACE_VIEW,
    PERMISSIONS.ASSISTANT_FOLLOWUP_MANAGE,
    PERMISSIONS.ATTENDANCE_VIEW_ALL,
    PERMISSIONS.ATTENDANCE_EXPORT,
    PERMISSIONS.MEMO_VIEW,
    PERMISSIONS.ANNOUNCEMENT_VIEW,
    PERMISSIONS.EMPLOYEE_VIEW_ALL,
    PERMISSIONS.REGISTRATION_VIEW_ALL,
    PERMISSIONS.PROSPECT_VIEW_ALL,
    PERMISSIONS.SALES_TARGET_VIEW_ALL,
    PERMISSIONS.CRM_ANALYTICS_VIEW_ALL,
    PERMISSIONS.CRM_ANALYTICS_VIEW_EXECUTIVE,
    PERMISSIONS.KPI_TASK_VIEW_ALL,
    PERMISSIONS.SP1_WARNING_VIEW_ALL,
    PERMISSIONS.AD_CAMPAIGN_VIEW,
    PERMISSIONS.CONTENT_PLANNER_VIEW,
    PERMISSIONS.PROMO_TEMPLATE_VIEW,
    PERMISSIONS.LOONARS_BEAUTY_VIEW,
    PERMISSIONS.KOS_OCCUPANCY_VIEW,
    // Owner's call: the assistant sees payroll figures. Read-only -- the
    // run itself is still approved by someone holding payroll.manage.
    PERMISSIONS.PAYROLL_VIEW,
    PERMISSIONS.HR_DISCIPLINE_VIEW,
    // Assists the Super Admin, so the automation/health alerts that land on
    // /monitoring are part of what they are expected to notice first.
    PERMISSIONS.SYSTEM_MONITORING_VIEW,
    // Reads FRIDAY's briefing and may ask it a question, so nothing reaches
    // the principal's desk unread. FRIDAY_ACTION_DECIDE is deliberately
    // absent: preparing a decision is the job, making it is not.
    PERMISSIONS.FRIDAY_VIEW,
    PERMISSIONS.FRIDAY_RUN,
    PERMISSIONS.HOLDING_VIEW,
  ],
  [ROLE_KEYS.PENDING]: [],
};
