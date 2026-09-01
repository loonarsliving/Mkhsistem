/**
 * Hand-authored mirror of the Supabase schema (supabase/migrations/*.sql).
 * Regenerate with `npm run supabase:types` once the project is linked to a
 * live Supabase instance; keep this file as the checked-in fallback so the
 * app type-checks without network access to Supabase.
 *
 * Every Row/Insert/Update is a flat object literal (no `&` intersections)
 * and every table/view carries `Relationships: [...]` — both are required
 * for structural compatibility with @supabase/postgrest-js's generic
 * inference (intersection types collapse row inference to `never` under
 * strictNullChecks in this postgrest-js version; this mirrors exactly how
 * the real Supabase CLI output is shaped).
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type FridayBriefingScopeDb = "company" | "branch" | "business" | "holding";
export type HoldingBusinessStatusDb = "active" | "inactive";
export type HoldingConnectorKindDb = "internal_mkh" | "http";
export type FridayBriefingStatusDb = "pending" | "ready" | "failed";
export type FridayTriggerSourceDb = "scheduled" | "manual";
export type FridaySeverityDb = "normal" | "perhatian" | "kritis";
export type FridayActionStatusDb = "proposed" | "approved" | "rejected" | "executed" | "failed";
export type FridayRiskTierDb = "low" | "medium" | "high";

export type AttendanceStatusDb = "hadir" | "terlambat" | "izin" | "sakit" | "alpha";
export type LeaveTypeDb = "izin" | "sakit";
export type LeaveStatusDb = "pending" | "approved" | "rejected";
export type EmploymentStatusDb = "active" | "inactive" | "on_leave" | "terminated";
export type MemoPriorityDb = "low" | "normal" | "high" | "urgent";
export type TargetTypeDb = "all_branch" | "branch" | "all_division" | "division" | "position" | "user";
export type NotificationTypeDb =
  | "memo"
  | "announcement"
  | "attendance"
  | "leave_request"
  | "system"
  | "registration"
  | "crm"
  | "kpi_task"
  | "hr"
  | "finance"
  | "project"
  | "approval";
export type NotificationCategoryDb =
  | "attendance_reminder"
  | "late_attendance"
  | "forgot_checkout"
  | "leave_approved"
  | "leave_rejected"
  | "payroll_available"
  | "new_prospect"
  | "new_ad_lead"
  | "follow_up_reminder"
  | "new_assignment"
  | "closing_approved"
  | "customer_verification"
  | "target_reminder"
  | "markom_new_task"
  | "task_revision"
  | "task_approved"
  | "weekly_reminder"
  | "project_progress"
  | "material_request"
  | "inspection_reminder"
  | "payment_received"
  | "invoice_due"
  | "reimbursement_approved"
  | "waiting_approval"
  | "approved"
  | "rejected"
  | "new_announcement"
  | "new_memo"
  | "maintenance"
  | "version_update"
  | "emergency_notice"
  | "stuck_prospect_reminder"
  | "stuck_prospect_alert"
  | "branch_target_reminder"
  | "sp1_pending_review"
  | "sp1_issued"
  | "sp1_escalation"
  | "task_pending_verification"
  | "daily_motivation"
  | "daily_report"
  | "birthday_wish"
  | "ad_campaign_launched"
  | "ad_campaign_failed"
  | "content_published"
  | "content_publish_reminder"
  | "content_publish_failed"
  | "finance_expense_alert"
  | "finance_expense_pending_verification"
  | "branch_balance_alert"
  | "sales_coaching_tip"
  | "meta_ads_balance_low"
  | "lead_wants_info"
  // Present in the live mkc_notifications_category_check but missing from
  // this mirror until now -- added by migrations 0104/0106/0119/0120/0156
  // and 0174 without this file being regenerated alongside them.
  | "ad_lead_followup_reminder"
  | "ad_lead_escalation_branch"
  | "ad_lead_escalation_director"
  | "whatsapp_webhook_silence_alert"
  | "sales_conduct_warning"
  | "database_followup_push"
  | "loonars_fee_alert"
  // Automation self-monitoring (migration 0176)
  | "automation_dispatch_failed"
  | "automation_job_dead_letter"
  | "automation_queue_stalled"
  | "disciplinary_warning"
  | "employee_terminated"
  | "content_review_pending"
  // Kepala Cabang single-employee salary input (migration 0189)
  | "salary_transfer_request"
  | "salary_transferred"
  // Consolidated per-branch salary transfer digest (migration 0190)
  | "salary_transfer_summary"
  // Construction finance (migrations 0193/0195/0198/0201) -- also present
  // in the live mkc_notifications_category_check but missing from this
  // mirror until now.
  | "construction_expense_submitted"
  | "construction_weekly_report"
  | "material_purchase_missing_photo"
  | "construction_progress_report"
  | "approval_request_submitted"
  | "approval_request_decided"
  // AI lead-nurture bot (migration 0228)
  | "lead_hot_handoff"
  | "pending_question_timeout";
export type NotificationStatusDb = "unread" | "read" | "archived";
export type AuditActionDb = "INSERT" | "UPDATE" | "DELETE";
export type ProspectStatusDb = "red" | "yellow" | "green" | "closing" | "inactive";
export type LeadSourceDb = "facebook_ads" | "instagram" | "tiktok" | "walk_in" | "referral" | "whatsapp" | "marketplace" | "other";
export type LeadTemperatureDb = "cold" | "warm" | "hot";
export type LeadAiModeDb = "nurture" | "standby";
export type KnowledgeBaseKategoriDb = "harga" | "unit" | "fasilitas" | "pembayaran" | "lainnya";
export type KnowledgeBaseSumberDb = "manual" | "dari_admin";
export type LeadChatSenderDb = "lead" | "ai" | "admin";
export type PendingQuestionStatusDb = "waiting" | "answered" | "timeout_escalated";
export type PendingProjectSelectionStatusDb = "awaiting" | "matched";
export type FollowUpActivityTypeDb = "phone_call" | "whatsapp" | "meeting" | "survey" | "video_call" | "site_visit" | "negotiation";
export type PaymentTypeDb = "booking_fee" | "dp" | "installment" | "bank_disbursement";
export type PaymentStatusDb = "pending" | "approved" | "rejected";
export type CrmProjectTypeDb = "commercial" | "subsidized" | "villa" | "land";
export type CrmProjectOfferingTypeDb = "sale" | "rental_stay" | "management_service";
export type CrmProjectStatusDb = "planning" | "selling" | "completed";
export type CrmProjectAiLeadModeDb = "nurture" | "handoff";
export type KpiTaskStatusDb = "pending" | "awaiting_verification" | "completed" | "rejected";
export type KpiTaskContentFocusDb = "leasehold_sales" | "occupancy" | "general";
export type KpiRankingScopeDb = "weekly" | "monthly";

export interface Database {
  public: {
    Tables: {
      roles: {
        Row: {
          id: string;
          key: string;
          name: string;
          level: number;
          description: string | null;
          is_system: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          key: string;
          name: string;
          level?: number;
          description?: string | null;
          is_system?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["roles"]["Insert"]>;
        Relationships: [];
      };
      permissions: {
        Row: { id: string; key: string; description: string | null; created_at: string };
        Insert: { id?: string; key: string; description?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["permissions"]["Insert"]>;
        Relationships: [];
      };
      role_permissions: {
        Row: { role_id: string; permission_id: string; created_at: string };
        Insert: { role_id: string; permission_id: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["role_permissions"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_id_fkey";
            columns: ["role_id"];
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "role_permissions_permission_id_fkey";
            columns: ["permission_id"];
            referencedRelation: "permissions";
            referencedColumns: ["id"];
          },
        ];
      };
      branches: {
        Row: {
          id: string;
          code: string;
          name: string;
          address: string | null;
          city: string | null;
          latitude: number | null;
          longitude: number | null;
          radius_meters: number;
          phone: string | null;
          is_head_office: boolean;
          is_active: boolean;
          ad_lead_override_employee_id: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          address?: string | null;
          city?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          radius_meters?: number;
          phone?: string | null;
          is_head_office?: boolean;
          is_active?: boolean;
          ad_lead_override_employee_id?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["branches"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "branches_ad_lead_override_employee_id_fkey";
            columns: ["ad_lead_override_employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      divisions: {
        Row: {
          id: string;
          branch_id: string | null;
          code: string | null;
          name: string;
          description: string | null;
          is_active: boolean;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          branch_id?: string | null;
          code?: string | null;
          name: string;
          description?: string | null;
          is_active?: boolean;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["divisions"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "divisions_branch_id_fkey";
            columns: ["branch_id"];
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      positions: {
        Row: {
          id: string;
          code: string | null;
          name: string;
          level: number;
          description: string | null;
          is_active: boolean;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          code?: string | null;
          name: string;
          level?: number;
          description?: string | null;
          is_active?: boolean;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["positions"]["Insert"]>;
        Relationships: [];
      };
      employees: {
        Row: {
          id: string;
          employee_code: string;
          full_name: string;
          email: string;
          phone: string | null;
          avatar_url: string | null;
          branch_id: string;
          division_id: string | null;
          position_id: string | null;
          role_id: string;
          employment_status: EmploymentStatusDb;
          gender: "male" | "female" | null;
          birth_date: string | null;
          join_date: string;
          address: string | null;
          is_root_owner: boolean;
          approval_status: "pending" | "approved" | "rejected";
          is_active: boolean;
          approved_by: string | null;
          approved_at: string | null;
          rejected_by: string | null;
          rejected_at: string | null;
          rejection_reason: string | null;
          ads_lead_routing_paused: boolean;
          salary_separate_schedule: boolean;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id: string;
          employee_code?: string;
          full_name: string;
          email: string;
          phone?: string | null;
          avatar_url?: string | null;
          branch_id: string;
          division_id?: string | null;
          position_id?: string | null;
          role_id: string;
          employment_status?: EmploymentStatusDb;
          gender?: "male" | "female" | null;
          birth_date?: string | null;
          join_date?: string;
          address?: string | null;
          is_root_owner?: boolean;
          approval_status?: "pending" | "approved" | "rejected";
          is_active?: boolean;
          approved_by?: string | null;
          approved_at?: string | null;
          rejected_by?: string | null;
          rejected_at?: string | null;
          rejection_reason?: string | null;
          ads_lead_routing_paused?: boolean;
          salary_separate_schedule?: boolean;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["employees"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "employees_branch_id_fkey";
            columns: ["branch_id"];
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employees_division_id_fkey";
            columns: ["division_id"];
            referencedRelation: "divisions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employees_position_id_fkey";
            columns: ["position_id"];
            referencedRelation: "positions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employees_role_id_fkey";
            columns: ["role_id"];
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
        ];
      };
      work_schedules: {
        Row: {
          id: string;
          branch_id: string | null;
          name: string;
          start_time: string;
          end_time: string;
          late_tolerance_minutes: number;
          work_days: number[];
          is_default: boolean;
          is_active: boolean;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          branch_id?: string | null;
          name: string;
          start_time?: string;
          end_time?: string;
          late_tolerance_minutes?: number;
          work_days?: number[];
          is_default?: boolean;
          is_active?: boolean;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["work_schedules"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "work_schedules_branch_id_fkey";
            columns: ["branch_id"];
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      attendance: {
        Row: {
          id: string;
          user_id: string;
          branch_id: string;
          work_schedule_id: string | null;
          attendance_date: string;
          check_in_time: string | null;
          check_in_latitude: number | null;
          check_in_longitude: number | null;
          check_in_distance_meters: number | null;
          check_in_within_radius: boolean | null;
          check_in_photo_url: string | null;
          check_in_note: string | null;
          check_out_time: string | null;
          check_out_latitude: number | null;
          check_out_longitude: number | null;
          check_out_distance_meters: number | null;
          check_out_within_radius: boolean | null;
          check_out_photo_url: string | null;
          check_out_note: string | null;
          status: AttendanceStatusDb;
          work_duration_minutes: number | null;
          leave_request_id: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          branch_id: string;
          work_schedule_id?: string | null;
          attendance_date?: string;
          check_in_time?: string | null;
          check_in_latitude?: number | null;
          check_in_longitude?: number | null;
          check_in_distance_meters?: number | null;
          check_in_within_radius?: boolean | null;
          check_in_photo_url?: string | null;
          check_in_note?: string | null;
          check_out_time?: string | null;
          check_out_latitude?: number | null;
          check_out_longitude?: number | null;
          check_out_distance_meters?: number | null;
          check_out_within_radius?: boolean | null;
          check_out_photo_url?: string | null;
          check_out_note?: string | null;
          status?: AttendanceStatusDb;
          work_duration_minutes?: number | null;
          leave_request_id?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["attendance"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "attendance_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_branch_id_fkey";
            columns: ["branch_id"];
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      leave_requests: {
        Row: {
          id: string;
          user_id: string;
          type: LeaveTypeDb;
          start_date: string;
          end_date: string;
          reason: string;
          attachment_url: string | null;
          status: LeaveStatusDb;
          approved_by: string | null;
          approved_at: string | null;
          rejection_reason: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: LeaveTypeDb;
          start_date: string;
          end_date: string;
          reason: string;
          attachment_url?: string | null;
          status?: LeaveStatusDb;
          approved_by?: string | null;
          approved_at?: string | null;
          rejection_reason?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["leave_requests"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "leave_requests_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      memos: {
        Row: {
          id: string;
          title: string;
          content: string;
          priority: MemoPriorityDb;
          is_pinned: boolean;
          is_mandatory_read: boolean;
          published_at: string;
          expires_at: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          title: string;
          content: string;
          priority?: MemoPriorityDb;
          is_pinned?: boolean;
          is_mandatory_read?: boolean;
          published_at?: string;
          expires_at?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by: string;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["memos"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "memos_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      memo_attachments: {
        Row: {
          id: string;
          memo_id: string;
          file_url: string;
          file_name: string;
          file_size: number | null;
          mime_type: string | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          memo_id: string;
          file_url: string;
          file_name: string;
          file_size?: number | null;
          mime_type?: string | null;
          created_at?: string;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["memo_attachments"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "memo_attachments_memo_id_fkey";
            columns: ["memo_id"];
            referencedRelation: "memos";
            referencedColumns: ["id"];
          },
        ];
      };
      memo_targets: {
        Row: { id: string; memo_id: string; target_type: TargetTypeDb; target_id: string | null; created_at: string };
        Insert: { id?: string; memo_id: string; target_type: TargetTypeDb; target_id?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["memo_targets"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "memo_targets_memo_id_fkey";
            columns: ["memo_id"];
            referencedRelation: "memos";
            referencedColumns: ["id"];
          },
        ];
      };
      memo_reads: {
        Row: { memo_id: string; user_id: string; read_at: string };
        Insert: { memo_id: string; user_id: string; read_at?: string };
        Update: Partial<Database["public"]["Tables"]["memo_reads"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "memo_reads_memo_id_fkey";
            columns: ["memo_id"];
            referencedRelation: "memos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memo_reads_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      announcement_categories: {
        Row: {
          id: string;
          name: string;
          color: string;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          color?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["announcement_categories"]["Insert"]>;
        Relationships: [];
      };
      announcements: {
        Row: {
          id: string;
          category_id: string | null;
          title: string;
          content: string;
          is_pinned: boolean;
          published_at: string;
          expires_at: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          category_id?: string | null;
          title: string;
          content: string;
          is_pinned?: boolean;
          published_at?: string;
          expires_at?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by: string;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["announcements"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "announcements_category_id_fkey";
            columns: ["category_id"];
            referencedRelation: "announcement_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "announcements_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      announcement_attachments: {
        Row: {
          id: string;
          announcement_id: string;
          file_url: string;
          file_name: string;
          file_size: number | null;
          mime_type: string | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          announcement_id: string;
          file_url: string;
          file_name: string;
          file_size?: number | null;
          mime_type?: string | null;
          created_at?: string;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["announcement_attachments"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "announcement_attachments_announcement_id_fkey";
            columns: ["announcement_id"];
            referencedRelation: "announcements";
            referencedColumns: ["id"];
          },
        ];
      };
      announcement_targets: {
        Row: {
          id: string;
          announcement_id: string;
          target_type: TargetTypeDb;
          target_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          announcement_id: string;
          target_type: TargetTypeDb;
          target_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["announcement_targets"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "announcement_targets_announcement_id_fkey";
            columns: ["announcement_id"];
            referencedRelation: "announcements";
            referencedColumns: ["id"];
          },
        ];
      };
      // Named mkc_notifications (not notifications) — this Supabase project
      // is shared with other apps that already own an unrelated
      // public.notifications table.
      mkc_notifications: {
        Row: {
          id: string;
          user_id: string;
          type: NotificationTypeDb;
          category: NotificationCategoryDb | null;
          title: string;
          body: string | null;
          link: string | null;
          is_read: boolean;
          read_at: string | null;
          status: NotificationStatusDb;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: NotificationTypeDb;
          category?: NotificationCategoryDb | null;
          title: string;
          body?: string | null;
          link?: string | null;
          is_read?: boolean;
          read_at?: string | null;
          status?: NotificationStatusDb;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["mkc_notifications"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "mkc_notifications_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      mkc_device_push_tokens: {
        Row: {
          id: string;
          user_id: string;
          token: string;
          platform: "android" | "ios";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          token: string;
          platform: "android" | "ios";
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["mkc_device_push_tokens"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "mkc_device_push_tokens_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      mkc_push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth_key: string;
          user_agent: string | null;
          created_at: string;
          last_seen_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth_key: string;
          user_agent?: string | null;
          created_at?: string;
          last_seen_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["mkc_push_subscriptions"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "mkc_push_subscriptions_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          table_name: string;
          record_id: string | null;
          action: AuditActionDb;
          old_data: Json;
          new_data: Json;
          changed_by: string | null;
          changed_at: string;
        };
        Insert: {
          id?: string;
          table_name: string;
          record_id?: string | null;
          action: AuditActionDb;
          old_data?: Json;
          new_data?: Json;
          changed_by?: string | null;
          changed_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_logs"]["Insert"]>;
        Relationships: [];
      };
      company_settings: {
        Row: {
          id: string;
          company_name: string;
          company_logo_url: string | null;
          company_address: string | null;
          timezone: string;
          default_radius_meters: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          company_name?: string;
          company_logo_url?: string | null;
          company_address?: string | null;
          timezone?: string;
          default_radius_meters?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["company_settings"]["Insert"]>;
        Relationships: [];
      };
      mkc_error_logs: {
        Row: {
          id: string;
          occurred_at: string;
          level: "warning" | "error" | "fatal";
          source: "client" | "server";
          message: string;
          stack: string | null;
          digest: string | null;
          context: Json;
          url: string | null;
          user_agent: string | null;
          user_id: string | null;
          environment: string;
          resolved: boolean;
          resolved_at: string | null;
          resolved_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          occurred_at?: string;
          level: "warning" | "error" | "fatal";
          source: "client" | "server";
          message: string;
          stack?: string | null;
          digest?: string | null;
          context?: Json;
          url?: string | null;
          user_agent?: string | null;
          user_id?: string | null;
          environment?: string;
          resolved?: boolean;
          resolved_at?: string | null;
          resolved_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["mkc_error_logs"]["Insert"]>;
        Relationships: [];
      };
      mkc_performance_metrics: {
        Row: {
          id: string;
          metric_name: "CLS" | "FCP" | "FID" | "INP" | "LCP" | "TTFB";
          value: number;
          rating: "good" | "needs-improvement" | "poor";
          url: string | null;
          user_id: string | null;
          environment: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          metric_name: "CLS" | "FCP" | "FID" | "INP" | "LCP" | "TTFB";
          value: number;
          rating: "good" | "needs-improvement" | "poor";
          url?: string | null;
          user_id?: string | null;
          environment?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["mkc_performance_metrics"]["Insert"]>;
        Relationships: [];
      };
      voice_bridge_daily_digests: {
        Row: {
          id: string;
          generated_at: string;
          digest_text: string;
          model: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          generated_at?: string;
          digest_text: string;
          model: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["voice_bridge_daily_digests"]["Insert"]>;
        Relationships: [];
      };
      hr_disciplinary_actions: {
        Row: {
          id: string;
          employee_id: string;
          branch_id: string | null;
          action_type: string;
          reason_category: string;
          description: string;
          evidence: Json;
          effective_date: string;
          last_working_date: string | null;
          bypassed_ladder: boolean;
          bypass_justification: string | null;
          status: string;
          revoked_by: string | null;
          revoked_at: string | null;
          revoke_reason: string | null;
          issued_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          employee_id: string;
          branch_id?: string | null;
          action_type: string;
          reason_category: string;
          description: string;
          evidence?: Json;
          effective_date?: string;
          last_working_date?: string | null;
          bypassed_ladder?: boolean;
          bypass_justification?: string | null;
          status?: string;
          revoked_by?: string | null;
          revoked_at?: string | null;
          revoke_reason?: string | null;
          issued_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["hr_disciplinary_actions"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "hr_disciplinary_actions_employee_id_fkey";
            columns: ["employee_id"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      assistant_followups: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          notes: string | null;
          assigned_to: string | null;
          due_date: string | null;
          status: string;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          notes?: string | null;
          assigned_to?: string | null;
          due_date?: string | null;
          status?: string;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["assistant_followups"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "assistant_followups_owner_id_fkey";
            columns: ["owner_id"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      holding_businesses: {
        Row: {
          id: string;
          key: string;
          name: string;
          business_type: string;
          source_system: string | null;
          status: HoldingBusinessStatusDb;
          connector_kind: HoldingConnectorKindDb;
          connector_config: Json;
          display_order: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          name: string;
          business_type: string;
          source_system?: string | null;
          status?: HoldingBusinessStatusDb;
          connector_kind: HoldingConnectorKindDb;
          connector_config?: Json;
          display_order?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["holding_businesses"]["Insert"]>;
        Relationships: [];
      };
      friday_briefings: {
        Row: {
          id: string;
          scope: FridayBriefingScopeDb;
          branch_id: string | null;
          business_id: string | null;
          business_health: Json;
          trigger_source: FridayTriggerSourceDb;
          requested_by: string | null;
          status: FridayBriefingStatusDb;
          headline: string | null;
          severity: FridaySeverityDb | null;
          situasi: string | null;
          analisa: string | null;
          risiko: string | null;
          solusi: Json;
          rekomendasi: string | null;
          hasil_diharapkan: string | null;
          signals: Json;
          model_note: string | null;
          error_detail: string | null;
          generated_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          scope?: FridayBriefingScopeDb;
          branch_id?: string | null;
          business_id?: string | null;
          business_health?: Json;
          trigger_source?: FridayTriggerSourceDb;
          requested_by?: string | null;
          status?: FridayBriefingStatusDb;
          headline?: string | null;
          severity?: FridaySeverityDb | null;
          situasi?: string | null;
          analisa?: string | null;
          risiko?: string | null;
          solusi?: Json;
          rekomendasi?: string | null;
          hasil_diharapkan?: string | null;
          signals?: Json;
          model_note?: string | null;
          error_detail?: string | null;
          generated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["friday_briefings"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "friday_briefings_branch_id_fkey";
            columns: ["branch_id"];
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "friday_briefings_requested_by_fkey";
            columns: ["requested_by"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "friday_briefings_business_id_fkey";
            columns: ["business_id"];
            referencedRelation: "holding_businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      friday_actions: {
        Row: {
          id: string;
          briefing_id: string;
          action_key: string;
          title: string;
          rationale: string;
          risk_tier: FridayRiskTierDb;
          payload: Json;
          status: FridayActionStatusDb;
          decided_by: string | null;
          decided_at: string | null;
          executed_at: string | null;
          execution_note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          briefing_id: string;
          action_key: string;
          title: string;
          rationale: string;
          risk_tier?: FridayRiskTierDb;
          payload?: Json;
          status?: FridayActionStatusDb;
          decided_by?: string | null;
          decided_at?: string | null;
          executed_at?: string | null;
          execution_note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["friday_actions"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "friday_actions_briefing_id_fkey";
            columns: ["briefing_id"];
            referencedRelation: "friday_briefings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "friday_actions_decided_by_fkey";
            columns: ["decided_by"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      /** Migration 0176 (automation hardening). Service-role only — revoked from anon/authenticated. */
      automation_dispatch_log: {
        Row: {
          id: string;
          request_id: number;
          path: string;
          dispatched_at: string;
          resolved_at: string | null;
          status_code: number | null;
          timed_out: boolean | null;
          error_msg: string | null;
        };
        Insert: {
          id?: string;
          request_id: number;
          path: string;
          dispatched_at?: string;
          resolved_at?: string | null;
          status_code?: number | null;
          timed_out?: boolean | null;
          error_msg?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["automation_dispatch_log"]["Insert"]>;
        Relationships: [];
      };
      crm_projects: {
        Row: {
          id: string;
          name: string;
          city: string | null;
          branch_id: string;
          project_type: CrmProjectTypeDb;
          offering_type: CrmProjectOfferingTypeDb;
          status: CrmProjectStatusDb;
          start_date: string | null;
          target_launch_date: string | null;
          is_active: boolean;
          mkh_project_code: string | null;
          product_description: string | null;
          ai_lead_mode: CrmProjectAiLeadModeDb;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          city?: string | null;
          branch_id: string;
          project_type?: CrmProjectTypeDb;
          offering_type?: CrmProjectOfferingTypeDb;
          status?: CrmProjectStatusDb;
          start_date?: string | null;
          target_launch_date?: string | null;
          is_active?: boolean;
          mkh_project_code?: string | null;
          product_description?: string | null;
          ai_lead_mode?: CrmProjectAiLeadModeDb;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["crm_projects"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "crm_projects_branch_id_fkey";
            columns: ["branch_id"];
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_project_photos: {
        Row: {
          id: string;
          project_id: string;
          storage_path: string;
          public_url: string;
          caption: string | null;
          media_type: "image" | "video";
          uploaded_by: string;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          storage_path: string;
          public_url: string;
          caption?: string | null;
          media_type?: "image" | "video";
          uploaded_by: string;
          created_at?: string;
          deleted_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["crm_project_photos"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "crm_project_photos_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "crm_projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_project_photos_uploaded_by_fkey";
            columns: ["uploaded_by"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_promo_templates: {
        Row: {
          id: string;
          branch_id: string | null;
          name: string;
          message_body: string;
          photo_storage_path: string | null;
          photo_public_url: string | null;
          cadence_days: number;
          send_hour_local: number;
          is_active: boolean;
          last_dispatched_at: string | null;
          created_by: string;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          branch_id?: string | null;
          name: string;
          message_body: string;
          photo_storage_path?: string | null;
          photo_public_url?: string | null;
          cadence_days?: number;
          send_hour_local?: number;
          is_active?: boolean;
          last_dispatched_at?: string | null;
          created_by: string;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["crm_promo_templates"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "crm_promo_templates_branch_id_fkey";
            columns: ["branch_id"];
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_promo_templates_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_promo_sends: {
        Row: {
          id: string;
          template_id: string;
          prospect_id: string;
          message_body: string;
          status: "queued" | "sent" | "failed";
          sent_at: string | null;
          error: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          template_id: string;
          prospect_id: string;
          message_body: string;
          status?: "queued" | "sent" | "failed";
          sent_at?: string | null;
          error?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_promo_sends"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "crm_promo_sends_template_id_fkey";
            columns: ["template_id"];
            referencedRelation: "crm_promo_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_promo_sends_prospect_id_fkey";
            columns: ["prospect_id"];
            referencedRelation: "prospects";
            referencedColumns: ["id"];
          },
        ];
      };
      freelance_lead_recipients: {
        Row: {
          id: string;
          full_name: string;
          phone: string;
          branch_id: string;
          project_id: string | null;
          active: boolean;
          last_lead_sent_at: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          full_name: string;
          phone: string;
          branch_id: string;
          project_id?: string | null;
          active?: boolean;
          last_lead_sent_at?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["freelance_lead_recipients"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "freelance_lead_recipients_branch_id_fkey";
            columns: ["branch_id"];
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "freelance_lead_recipients_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "crm_projects";
            referencedColumns: ["id"];
          },
        ];
      };
      freelance_lead_deliveries: {
        Row: {
          id: string;
          recipient_id: string;
          customer_name: string | null;
          phone: string;
          phone_normalized: string;
          campaign_id: string | null;
          sent_at: string;
        };
        Insert: {
          id?: string;
          recipient_id: string;
          customer_name?: string | null;
          phone: string;
          campaign_id?: string | null;
          sent_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["freelance_lead_deliveries"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "freelance_lead_deliveries_recipient_id_fkey";
            columns: ["recipient_id"];
            referencedRelation: "freelance_lead_recipients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "freelance_lead_deliveries_campaign_id_fkey";
            columns: ["campaign_id"];
            referencedRelation: "meta_ad_campaigns";
            referencedColumns: ["id"];
          },
        ];
      };
      meta_ads_balance_state: {
        Row: {
          id: string;
          last_balance_idr: number | null;
          alert_active: boolean;
          checked_at: string | null;
        };
        Insert: {
          id?: string;
          last_balance_idr?: number | null;
          alert_active?: boolean;
          checked_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["meta_ads_balance_state"]["Insert"]>;
        Relationships: [];
      };
      meta_ad_campaigns: {
        Row: {
          id: string;
          project_id: string | null;
          branch_id: string;
          photo_id: string | null;
          meta_campaign_id: string | null;
          meta_adset_id: string | null;
          meta_creative_id: string | null;
          meta_ad_id: string | null;
          name: string;
          headline: string;
          primary_text: string;
          description: string | null;
          welcome_message: string | null;
          daily_budget_idr: number;
          status: "draft" | "active" | "paused" | "ended" | "failed";
          launched_by: "ai" | "human";
          research_summary: string | null;
          failure_reason: string | null;
          spend_idr: number | null;
          impressions: number | null;
          clicks: number | null;
          conversations_started: number | null;
          ai_analysis: string | null;
          analyzed_at: string | null;
          target_areas: string[] | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id?: string | null;
          branch_id: string;
          photo_id?: string | null;
          meta_campaign_id?: string | null;
          meta_adset_id?: string | null;
          meta_creative_id?: string | null;
          meta_ad_id?: string | null;
          name: string;
          headline: string;
          primary_text: string;
          description?: string | null;
          welcome_message?: string | null;
          daily_budget_idr: number;
          status?: "draft" | "active" | "paused" | "ended" | "failed";
          launched_by?: "ai" | "human";
          research_summary?: string | null;
          failure_reason?: string | null;
          spend_idr?: number | null;
          impressions?: number | null;
          clicks?: number | null;
          conversations_started?: number | null;
          ai_analysis?: string | null;
          analyzed_at?: string | null;
          target_areas?: string[] | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["meta_ad_campaigns"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "meta_ad_campaigns_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "crm_projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meta_ad_campaigns_branch_id_fkey";
            columns: ["branch_id"];
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meta_ad_campaigns_photo_id_fkey";
            columns: ["photo_id"];
            referencedRelation: "crm_project_photos";
            referencedColumns: ["id"];
          },
        ];
      };
      meta_ad_campaign_photos: {
        Row: {
          id: string;
          campaign_id: string;
          photo_id: string;
          display_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          photo_id: string;
          display_order?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["meta_ad_campaign_photos"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "meta_ad_campaign_photos_campaign_id_fkey";
            columns: ["campaign_id"];
            referencedRelation: "meta_ad_campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meta_ad_campaign_photos_photo_id_fkey";
            columns: ["photo_id"];
            referencedRelation: "crm_project_photos";
            referencedColumns: ["id"];
          },
        ];
      };
      social_competitor_accounts: {
        Row: {
          id: string;
          platform: "instagram" | "tiktok";
          handle: string;
          display_name: string | null;
          notes: string | null;
          is_active: boolean;
          content_focus: "leasehold_sales" | "occupancy" | "beauty";
          source: "manual" | "ai_discovered";
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          platform: "instagram" | "tiktok";
          handle: string;
          display_name?: string | null;
          notes?: string | null;
          is_active?: boolean;
          content_focus?: "leasehold_sales" | "occupancy" | "beauty";
          source?: "manual" | "ai_discovered";
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["social_competitor_accounts"]["Insert"]>;
        Relationships: [];
      };
      social_competitor_content_logs: {
        Row: {
          id: string;
          competitor_account_id: string;
          content_url: string | null;
          content_type: "reel" | "video" | "photo" | "carousel" | "story" | "other" | null;
          hook: string | null;
          duration_seconds: number | null;
          caption: string | null;
          hashtags: string | null;
          engagement_notes: string | null;
          logged_by: string;
          logged_at: string;
        };
        Insert: {
          id?: string;
          competitor_account_id: string;
          content_url?: string | null;
          content_type?: "reel" | "video" | "photo" | "carousel" | "story" | "other" | null;
          hook?: string | null;
          duration_seconds?: number | null;
          caption?: string | null;
          hashtags?: string | null;
          engagement_notes?: string | null;
          logged_by: string;
          logged_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["social_competitor_content_logs"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "social_competitor_content_logs_competitor_account_id_fkey";
            columns: ["competitor_account_id"];
            referencedRelation: "social_competitor_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      social_account_snapshots: {
        Row: {
          id: string;
          platform: "instagram" | "tiktok";
          product_line: "property" | "beauty";
          captured_at: string;
          followers_count: number | null;
          reach: number | null;
          impressions: number | null;
          likes: number | null;
          comments: number | null;
          shares: number | null;
          saves: number | null;
          watch_time_seconds: number | null;
          engagement_rate: number | null;
          best_upload_hour: number | null;
          top_content_type: string | null;
          raw_data: Json | null;
        };
        Insert: {
          id?: string;
          platform: "instagram" | "tiktok";
          product_line?: "property" | "beauty";
          captured_at?: string;
          followers_count?: number | null;
          reach?: number | null;
          impressions?: number | null;
          likes?: number | null;
          comments?: number | null;
          shares?: number | null;
          saves?: number | null;
          watch_time_seconds?: number | null;
          engagement_rate?: number | null;
          best_upload_hour?: number | null;
          top_content_type?: string | null;
          raw_data?: Json | null;
        };
        Update: Partial<Database["public"]["Tables"]["social_account_snapshots"]["Insert"]>;
        Relationships: [];
      };
      social_weekly_evaluations: {
        Row: {
          id: string;
          week_start: string;
          evaluation: string;
          audit: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          week_start: string;
          evaluation: string;
          audit?: Json | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["social_weekly_evaluations"]["Insert"]>;
        Relationships: [];
      };
      social_leasehold_competitor_comparisons: {
        Row: {
          id: string;
          generated_at: string;
          narrative: string;
          comparison: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          generated_at?: string;
          narrative: string;
          comparison: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["social_leasehold_competitor_comparisons"]["Insert"]>;
        Relationships: [];
      };
      social_monthly_content_reports: {
        Row: {
          id: string;
          month_start: string;
          report: Json;
          narrative: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          month_start: string;
          report: Json;
          narrative: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["social_monthly_content_reports"]["Insert"]>;
        Relationships: [];
      };
      markom_hashtag_bank: {
        Row: {
          id: string;
          content_focus: "leasehold_sales" | "occupancy" | "beauty";
          platform: "instagram" | "tiktok";
          tier: "broad" | "medium" | "niche";
          hashtag: string;
          rationale: string | null;
          generated_at: string;
        };
        Insert: {
          id?: string;
          content_focus: "leasehold_sales" | "occupancy" | "beauty";
          platform: "instagram" | "tiktok";
          tier: "broad" | "medium" | "niche";
          hashtag: string;
          rationale?: string | null;
          generated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["markom_hashtag_bank"]["Insert"]>;
        Relationships: [];
      };
      wa_pending_media_relay: {
        Row: {
          id: string;
          sender: string;
          employee_id: string;
          image_url: string;
          caption: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          sender: string;
          employee_id: string;
          image_url: string;
          caption?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["wa_pending_media_relay"]["Insert"]>;
        Relationships: [];
      };
      photo_auto_forward_rules: {
        Row: {
          id: string;
          sender_employee_id: string;
          recipient_employee_id: string | null;
          recipient_role: string | null;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          sender_employee_id: string;
          recipient_employee_id?: string | null;
          recipient_role?: string | null;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["photo_auto_forward_rules"]["Insert"]>;
        Relationships: [];
      };
      photo_auto_forward_log: {
        Row: {
          id: string;
          employee_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          employee_id: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["photo_auto_forward_log"]["Insert"]>;
        Relationships: [];
      };
      contractor_wa_senders: {
        Row: {
          id: string;
          full_name: string;
          phone: string;
          note: string | null;
          created_at: string;
          bank_account: string | null;
        };
        Insert: {
          id?: string;
          full_name: string;
          phone: string;
          note?: string | null;
          created_at?: string;
          bank_account?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["contractor_wa_senders"]["Insert"]>;
        Relationships: [];
      };
      contractor_expense_reports: {
        Row: {
          id: number;
          contractor_id: string;
          contractor_name: string;
          contractor_phone: string;
          item: string;
          items: Json;
          nominal: number;
          tanggal: string | null;
          supplier: string | null;
          ai_notes: string | null;
          status: string;
          reviewed_by: string | null;
          reviewed_at: string | null;
          reject_reason: string | null;
          recapped_at: string | null;
          created_at: string;
          settlement_type: string | null;
          duplicate_of_id: number | null;
        };
        Insert: {
          id?: number;
          contractor_id: string;
          contractor_name: string;
          contractor_phone: string;
          item: string;
          items?: Json;
          nominal: number;
          tanggal?: string | null;
          supplier?: string | null;
          ai_notes?: string | null;
          status?: string;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          reject_reason?: string | null;
          recapped_at?: string | null;
          created_at?: string;
          settlement_type?: string | null;
          duplicate_of_id?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["contractor_expense_reports"]["Insert"]>;
        Relationships: [];
      };
      contractor_fund_request_pending: {
        Row: {
          id: string;
          contractor_id: string;
          nominal: number;
          items: Json;
          keterangan: string;
          ai_notes: string | null;
          created_at: string;
          kategori: string | null;
          rekening: string | null;
        };
        Insert: {
          id?: string;
          contractor_id: string;
          nominal: number;
          items: Json;
          keterangan: string;
          ai_notes?: string | null;
          created_at?: string;
          kategori?: string | null;
          rekening?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["contractor_fund_request_pending"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "contractor_fund_request_pending_contractor_id_fkey";
            columns: ["contractor_id"];
            isOneToOne: false;
            referencedRelation: "contractor_wa_senders";
            referencedColumns: ["id"];
          },
        ];
      };
      pending_expense_approval_notifications: {
        Row: {
          id: string;
          employee_id: string;
          branch_id: string | null;
          title: string;
          body: string;
          link: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          employee_id: string;
          branch_id?: string | null;
          title: string;
          body: string;
          link: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["pending_expense_approval_notifications"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "pending_expense_approval_notifications_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pending_expense_approval_notifications_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      construction_blocks: {
        Row: {
          id: string;
          project_code: string;
          code: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_code?: string;
          code: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["construction_blocks"]["Insert"]>;
        Relationships: [];
      };
      construction_progress_photos: {
        Row: {
          id: string;
          employee_id: string;
          block_id: string;
          image_url: string;
          caption: string | null;
          ai_stage: string | null;
          ai_progress_pct: number | null;
          ai_notes: string | null;
          ai_concerns: string | null;
          planned_work_tomorrow: string | null;
          materials_needed_tomorrow: string | null;
          report_date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          employee_id: string;
          block_id: string;
          image_url: string;
          caption?: string | null;
          ai_stage?: string | null;
          ai_progress_pct?: number | null;
          ai_notes?: string | null;
          ai_concerns?: string | null;
          planned_work_tomorrow?: string | null;
          materials_needed_tomorrow?: string | null;
          report_date?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["construction_progress_photos"]["Insert"]>;
        Relationships: [];
      };
      approval_requests: {
        Row: {
          id: string;
          code: string;
          requester_employee_id: string;
          branch_id: string | null;
          request_text: string | null;
          image_url: string | null;
          status: "pending" | "approved" | "rejected";
          decided_by: string | null;
          decided_at: string | null;
          decision_note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          code?: string;
          requester_employee_id: string;
          branch_id?: string | null;
          request_text?: string | null;
          image_url?: string | null;
          status?: "pending" | "approved" | "rejected";
          decided_by?: string | null;
          decided_at?: string | null;
          decision_note?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["approval_requests"]["Insert"]>;
        Relationships: [];
      };
      ai_knowledge_bank: {
        Row: {
          id: string;
          topic: string;
          product_line: "property" | "beauty";
          title: string;
          content: string;
          researched_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          topic: string;
          product_line: "property" | "beauty";
          title: string;
          content: string;
          researched_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ai_knowledge_bank"]["Insert"]>;
        Relationships: [];
      };
      ai_investor_intelligence_bank: {
        Row: {
          id: string;
          topic: string;
          title: string;
          content: string;
          researched_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          topic: string;
          title: string;
          content: string;
          researched_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ai_investor_intelligence_bank"]["Insert"]>;
        Relationships: [];
      };
      ai_occupancy_intelligence_bank: {
        Row: {
          id: string;
          topic: string;
          title: string;
          content: string;
          researched_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          topic: string;
          title: string;
          content: string;
          researched_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ai_occupancy_intelligence_bank"]["Insert"]>;
        Relationships: [];
      };
      ai_cashflow_intelligence_bank: {
        Row: {
          id: string;
          topic: string;
          title: string;
          content: string;
          researched_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          topic: string;
          title: string;
          content: string;
          researched_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ai_cashflow_intelligence_bank"]["Insert"]>;
        Relationships: [];
      };
      loonars_content_items: {
        Row: {
          id: string;
          category: "problem_solution" | "ugc" | "edukasi" | "promosi";
          platform: "tiktok" | "instagram";
          title: string;
          hook: string | null;
          caption: string | null;
          script_notes: string | null;
          cta: string | null;
          product_name: string;
          status: "idea" | "draft" | "scheduled" | "published" | "archived";
          content_url: string | null;
          scheduled_at: string | null;
          published_at: string | null;
          kontenai_creative_brief_id: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          category: "problem_solution" | "ugc" | "edukasi" | "promosi";
          platform: "tiktok" | "instagram";
          title: string;
          hook?: string | null;
          caption?: string | null;
          script_notes?: string | null;
          cta?: string | null;
          product_name?: string;
          status?: "idea" | "draft" | "scheduled" | "published" | "archived";
          content_url?: string | null;
          scheduled_at?: string | null;
          published_at?: string | null;
          kontenai_creative_brief_id?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["loonars_content_items"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "loonars_content_items_kontenai_creative_brief_id_fkey";
            columns: ["kontenai_creative_brief_id"];
            referencedRelation: "kontenai_creative_briefs";
            referencedColumns: ["id"];
          },
        ];
      };
      loonars_content_metrics: {
        Row: {
          id: string;
          content_item_id: string;
          captured_at: string;
          views: number;
          likes: number;
          comments: number;
          shares: number;
          saves: number;
          watch_through_50pct: boolean;
          link_clicks: number;
          boosted_spark_ads: boolean;
          notes: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          content_item_id: string;
          captured_at?: string;
          views?: number;
          likes?: number;
          comments?: number;
          shares?: number;
          saves?: number;
          watch_through_50pct?: boolean;
          link_clicks?: number;
          boosted_spark_ads?: boolean;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["loonars_content_metrics"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "loonars_content_metrics_content_item_id_fkey";
            columns: ["content_item_id"];
            referencedRelation: "loonars_content_items";
            referencedColumns: ["id"];
          },
        ];
      };
      loonars_orders: {
        Row: {
          id: string;
          order_number: string;
          customer_name: string;
          customer_phone: string | null;
          customer_address: string | null;
          channel: "shopee" | "tokopedia" | "whatsapp" | "instagram" | "website" | "offline" | "other";
          product_name: string;
          quantity: number;
          unit_price: number;
          total_amount: number;
          status: "pending" | "processing" | "shipped" | "completed" | "cancelled";
          courier: string | null;
          tracking_number: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          order_number?: string;
          customer_name: string;
          customer_phone?: string | null;
          customer_address?: string | null;
          channel: "shopee" | "tokopedia" | "whatsapp" | "instagram" | "website" | "offline" | "other";
          product_name?: string;
          quantity?: number;
          unit_price?: number;
          total_amount?: number;
          status?: "pending" | "processing" | "shipped" | "completed" | "cancelled";
          courier?: string | null;
          tracking_number?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["loonars_orders"]["Insert"]>;
        Relationships: [];
      };
      loonars_weekly_evaluations: {
        Row: {
          id: string;
          week_start: string;
          evaluation: string;
          content_ratio_actual: Json | null;
          recommended_boost_content_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          week_start: string;
          evaluation: string;
          content_ratio_actual?: Json | null;
          recommended_boost_content_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["loonars_weekly_evaluations"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "loonars_weekly_evaluations_recommended_boost_content_id_fkey";
            columns: ["recommended_boost_content_id"];
            referencedRelation: "loonars_content_items";
            referencedColumns: ["id"];
          },
        ];
      };
      loonars_beauty_competitor_comparisons: {
        Row: {
          id: string;
          generated_at: string;
          narrative: string;
          comparison: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          generated_at?: string;
          narrative: string;
          comparison: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["loonars_beauty_competitor_comparisons"]["Insert"]>;
        Relationships: [];
      };
      loonars_beauty_weekly_content_audits: {
        Row: {
          id: string;
          week_start: string;
          evaluation: string;
          audit: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          week_start: string;
          evaluation: string;
          audit: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["loonars_beauty_weekly_content_audits"]["Insert"]>;
        Relationships: [];
      };
      prospects: {
        Row: {
          id: string;
          customer_name: string;
          phone: string;
          phone_normalized: string;
          project_id: string | null;
          house_type: string;
          city: string;
          lead_source: LeadSourceDb;
          notes: string | null;
          status: ProspectStatusDb;
          sales_id: string;
          branch_id: string;
          last_follow_up_at: string | null;
          last_reminder_sent_at: string | null;
          total_collection: number;
          total_commission: number;
          lead_temperature: LeadTemperatureDb;
          temperature_signals: Json;
          ai_mode: LeadAiModeDb;
          hot_at: string | null;
          closed_at: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          customer_name: string;
          phone: string;
          project_id?: string | null;
          house_type: string;
          city: string;
          lead_source: LeadSourceDb;
          notes?: string | null;
          status?: ProspectStatusDb;
          sales_id: string;
          branch_id: string;
          last_follow_up_at?: string | null;
          last_reminder_sent_at?: string | null;
          total_collection?: number;
          total_commission?: number;
          lead_temperature?: LeadTemperatureDb;
          temperature_signals?: Json;
          ai_mode?: LeadAiModeDb;
          hot_at?: string | null;
          closed_at?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["prospects"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "prospects_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "crm_projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prospects_sales_id_fkey";
            columns: ["sales_id"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prospects_branch_id_fkey";
            columns: ["branch_id"];
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      knowledge_base: {
        Row: {
          id: string;
          project_id: string;
          kategori: KnowledgeBaseKategoriDb;
          pertanyaan_umum: string;
          jawaban: string;
          sumber: KnowledgeBaseSumberDb;
          image_url: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          kategori: KnowledgeBaseKategoriDb;
          pertanyaan_umum: string;
          jawaban: string;
          sumber?: KnowledgeBaseSumberDb;
          image_url?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["knowledge_base"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "knowledge_base_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "crm_projects";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_chat_history: {
        Row: {
          id: string;
          prospect_id: string;
          sender: LeadChatSenderDb;
          message: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          prospect_id: string;
          sender: LeadChatSenderDb;
          message: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["lead_chat_history"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "lead_chat_history_prospect_id_fkey";
            columns: ["prospect_id"];
            referencedRelation: "prospects";
            referencedColumns: ["id"];
          },
        ];
      };
      pending_questions: {
        Row: {
          id: string;
          code: string;
          prospect_id: string;
          project_id: string;
          branch_id: string;
          pertanyaan: string;
          status: PendingQuestionStatusDb;
          dikirim_ke_admin_at: string;
          dijawab_at: string | null;
          jawaban_admin: string | null;
          image_url: string | null;
          timeout_escalated_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          code?: string;
          prospect_id: string;
          project_id: string;
          branch_id: string;
          pertanyaan: string;
          status?: PendingQuestionStatusDb;
          dikirim_ke_admin_at?: string;
          dijawab_at?: string | null;
          jawaban_admin?: string | null;
          image_url?: string | null;
          timeout_escalated_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["pending_questions"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "pending_questions_prospect_id_fkey";
            columns: ["prospect_id"];
            referencedRelation: "prospects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pending_questions_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "crm_projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pending_questions_branch_id_fkey";
            columns: ["branch_id"];
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      pending_project_selections: {
        Row: {
          id: string;
          phone: string;
          phone_normalized: string;
          sender_name: string | null;
          first_message: string;
          status: PendingProjectSelectionStatusDb;
          matched_project_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          phone: string;
          phone_normalized: string;
          sender_name?: string | null;
          first_message: string;
          status?: PendingProjectSelectionStatusDb;
          matched_project_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["pending_project_selections"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "pending_project_selections_matched_project_id_fkey";
            columns: ["matched_project_id"];
            referencedRelation: "crm_projects";
            referencedColumns: ["id"];
          },
        ];
      };
      prospect_follow_ups: {
        Row: {
          id: string;
          prospect_id: string;
          activity_type: FollowUpActivityTypeDb;
          activity_date: string;
          activity_time: string | null;
          notes: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          prospect_id: string;
          activity_type: FollowUpActivityTypeDb;
          activity_date?: string;
          activity_time?: string | null;
          notes?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["prospect_follow_ups"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "prospect_follow_ups_prospect_id_fkey";
            columns: ["prospect_id"];
            referencedRelation: "prospects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prospect_follow_ups_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      prospect_payments: {
        Row: {
          id: string;
          prospect_id: string;
          payment_type: PaymentTypeDb;
          amount: number;
          payment_date: string;
          status: PaymentStatusDb;
          commission_amount: number | null;
          notes: string | null;
          recorded_by: string;
          approved_by: string | null;
          approved_at: string | null;
          rejection_reason: string | null;
          reference_number: string | null;
          unit_label: string | null;
          finance_confirmed_at: string | null;
          finance_confirmed_by: string | null;
          finance_reference_no: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          prospect_id: string;
          payment_type: PaymentTypeDb;
          amount: number;
          payment_date?: string;
          status?: PaymentStatusDb;
          commission_amount?: number | null;
          notes?: string | null;
          recorded_by: string;
          approved_by?: string | null;
          approved_at?: string | null;
          rejection_reason?: string | null;
          reference_number?: string | null;
          unit_label?: string | null;
          finance_confirmed_at?: string | null;
          finance_confirmed_by?: string | null;
          finance_reference_no?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["prospect_payments"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "prospect_payments_prospect_id_fkey";
            columns: ["prospect_id"];
            referencedRelation: "prospects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prospect_payments_recorded_by_fkey";
            columns: ["recorded_by"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prospect_payments_approved_by_fkey";
            columns: ["approved_by"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      payroll_runs: {
        Row: {
          id: string;
          branch_id: string;
          period_month: number;
          period_year: number;
          status: "draft" | "approved";
          total_amount: number;
          created_by: string | null;
          approved_by: string | null;
          approved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          period_month: number;
          period_year: number;
          status?: "draft" | "approved";
          total_amount?: number;
          created_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payroll_runs"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "payroll_runs_branch_id_fkey";
            columns: ["branch_id"];
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      payroll_items: {
        Row: {
          id: string;
          payroll_run_id: string;
          employee_id: string;
          base_salary: number;
          allowances: number;
          deductions: number;
          net_salary: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          payroll_run_id: string;
          employee_id: string;
          base_salary?: number;
          allowances?: number;
          deductions?: number;
          net_salary: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payroll_items"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "payroll_items_payroll_run_id_fkey";
            columns: ["payroll_run_id"];
            referencedRelation: "payroll_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payroll_items_employee_id_fkey";
            columns: ["employee_id"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      employee_salary_submissions: {
        Row: {
          id: string;
          employee_id: string;
          branch_id: string;
          period_month: number;
          period_year: number;
          amount: number;
          bank_name: string | null;
          bank_account_number: string;
          bank_account_holder: string | null;
          note: string | null;
          status: "pending_transfer" | "transferred";
          submitted_by: string | null;
          transferred_by: string | null;
          transferred_at: string | null;
          summary_sent_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          employee_id: string;
          branch_id: string;
          period_month: number;
          period_year: number;
          amount: number;
          bank_name?: string | null;
          bank_account_number: string;
          bank_account_holder?: string | null;
          note?: string | null;
          status?: "pending_transfer" | "transferred";
          submitted_by?: string | null;
          transferred_by?: string | null;
          transferred_at?: string | null;
          summary_sent_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["employee_salary_submissions"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "employee_salary_submissions_employee_id_fkey";
            columns: ["employee_id"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employee_salary_submissions_branch_id_fkey";
            columns: ["branch_id"];
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      construction_projects: {
        Row: {
          id: string;
          branch_id: string;
          name: string;
          total_budget: number;
          status: "active" | "completed" | "cancelled";
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          name: string;
          total_budget: number;
          status?: "active" | "completed" | "cancelled";
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["construction_projects"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "construction_projects_branch_id_fkey";
            columns: ["branch_id"];
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      construction_fund_transfers: {
        Row: {
          id: string;
          project_id: string;
          branch_id: string;
          amount: number;
          transfer_date: string;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          branch_id: string;
          amount: number;
          transfer_date?: string;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["construction_fund_transfers"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "construction_fund_transfers_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "construction_projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "construction_fund_transfers_branch_id_fkey";
            columns: ["branch_id"];
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      construction_expenses: {
        Row: {
          id: string;
          project_id: string;
          branch_id: string;
          expense_type: "gaji_tukang" | "pembelian_material" | "material_tunai" | "pembelian_lain_lain" | "lain_lain_tunai";
          party_name: string;
          description: string | null;
          amount: number;
          payment_method: "cash" | "utang";
          is_settled: boolean;
          settled_at: string | null;
          settled_by: string | null;
          expense_date: string;
          photo_url: string | null;
          created_by: string | null;
          created_at: string;
          material_id: string | null;
          quantity: number | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          branch_id: string;
          expense_type: "gaji_tukang" | "pembelian_material" | "material_tunai" | "pembelian_lain_lain" | "lain_lain_tunai";
          party_name: string;
          description?: string | null;
          amount: number;
          payment_method: "cash" | "utang";
          is_settled?: boolean;
          settled_at?: string | null;
          settled_by?: string | null;
          expense_date?: string;
          photo_url?: string | null;
          created_by?: string | null;
          created_at?: string;
          material_id?: string | null;
          quantity?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["construction_expenses"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "construction_expenses_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "construction_projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "construction_expenses_branch_id_fkey";
            columns: ["branch_id"];
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "construction_expenses_material_id_fkey";
            columns: ["material_id"];
            referencedRelation: "cm_materials";
            referencedColumns: ["id"];
          },
        ];
      };
      cm_units: {
        Row: {
          id: string;
          project_id: string;
          code: string;
          unit_type: string | null;
          construction_budget: number | null;
          labor_budget: number | null;
          material_budget: number | null;
          other_budget: number | null;
          target_completion: string | null;
          status: "planning" | "in_progress" | "completed" | "on_hold";
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          code: string;
          unit_type?: string | null;
          construction_budget?: number | null;
          labor_budget?: number | null;
          material_budget?: number | null;
          other_budget?: number | null;
          target_completion?: string | null;
          status?: "planning" | "in_progress" | "completed" | "on_hold";
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["cm_units"]["Insert"]>;
        Relationships: [
          { foreignKeyName: "cm_units_project_id_fkey"; columns: ["project_id"]; referencedRelation: "construction_projects"; referencedColumns: ["id"] },
        ];
      };
      cm_wbs_templates: {
        Row: { id: string; name: string; is_default: boolean; created_at: string };
        Insert: { id?: string; name: string; is_default?: boolean; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["cm_wbs_templates"]["Insert"]>;
        Relationships: [];
      };
      cm_wbs_template_items: {
        Row: { id: string; template_id: string; code: string; name: string; weight: number; sort_order: number };
        Insert: { id?: string; template_id: string; code: string; name: string; weight: number; sort_order?: number };
        Update: Partial<Database["public"]["Tables"]["cm_wbs_template_items"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "cm_wbs_template_items_template_id_fkey";
            columns: ["template_id"];
            referencedRelation: "cm_wbs_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      cm_project_wbs: {
        Row: {
          id: string;
          project_id: string;
          unit_id: string | null;
          code: string;
          name: string;
          weight: number;
          budget: number | null;
          progress_pct: number;
          status: "not_started" | "in_progress" | "completed";
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          unit_id?: string | null;
          code: string;
          name: string;
          weight: number;
          budget?: number | null;
          progress_pct?: number;
          status?: "not_started" | "in_progress" | "completed";
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["cm_project_wbs"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "cm_project_wbs_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "construction_projects";
            referencedColumns: ["id"];
          },
          { foreignKeyName: "cm_project_wbs_unit_id_fkey"; columns: ["unit_id"]; referencedRelation: "cm_units"; referencedColumns: ["id"] },
        ];
      };
      cm_wbs_progress_log: {
        Row: {
          id: string;
          project_wbs_id: string;
          progress_pct: number;
          photo_url: string | null;
          note: string | null;
          status: "submitted" | "approved" | "rejected";
          submitted_by: string | null;
          submitted_at: string;
          decided_by: string | null;
          decided_at: string | null;
          reject_reason: string | null;
        };
        Insert: {
          id?: string;
          project_wbs_id: string;
          progress_pct: number;
          photo_url?: string | null;
          note?: string | null;
          status?: "submitted" | "approved" | "rejected";
          submitted_by?: string | null;
          submitted_at?: string;
          decided_by?: string | null;
          decided_at?: string | null;
          reject_reason?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["cm_wbs_progress_log"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "cm_wbs_progress_log_project_wbs_id_fkey";
            columns: ["project_wbs_id"];
            referencedRelation: "cm_project_wbs";
            referencedColumns: ["id"];
          },
        ];
      };
      cm_boq_templates: {
        Row: { id: string; name: string; unit_type: string | null; version: string; description: string | null; is_active: boolean; created_by: string | null; created_at: string };
        Insert: {
          id?: string;
          name: string;
          unit_type?: string | null;
          version?: string;
          description?: string | null;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["cm_boq_templates"]["Insert"]>;
        Relationships: [];
      };
      cm_boq_template_items: {
        Row: {
          id: string;
          template_id: string;
          category: "material" | "labor" | "equipment" | "other";
          material_id: string | null;
          description: string;
          quantity: number;
          unit: string;
          unit_price: number;
          sort_order: number;
        };
        Insert: {
          id?: string;
          template_id: string;
          category: "material" | "labor" | "equipment" | "other";
          material_id?: string | null;
          description: string;
          quantity: number;
          unit: string;
          unit_price: number;
          sort_order?: number;
        };
        Update: Partial<Database["public"]["Tables"]["cm_boq_template_items"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "cm_boq_template_items_template_id_fkey";
            columns: ["template_id"];
            referencedRelation: "cm_boq_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      cm_project_boq: {
        Row: {
          id: string;
          project_id: string;
          unit_id: string | null;
          project_wbs_id: string | null;
          category: "material" | "labor" | "equipment" | "other";
          material_id: string | null;
          description: string;
          quantity: number;
          unit: string;
          unit_price: number;
          budget: number;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          unit_id?: string | null;
          project_wbs_id?: string | null;
          category: "material" | "labor" | "equipment" | "other";
          material_id?: string | null;
          description: string;
          quantity: number;
          unit: string;
          unit_price: number;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["cm_project_boq"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "cm_project_boq_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "construction_projects";
            referencedColumns: ["id"];
          },
        ];
      };
      cm_purchase_requests: {
        Row: {
          id: string;
          project_id: string;
          material_id: string;
          requested_quantity: number;
          suggested_quantity: number | null;
          reason: string | null;
          status: "pending" | "approved" | "rejected" | "fulfilled";
          requested_by: string | null;
          requested_at: string;
          decided_by: string | null;
          decided_at: string | null;
          reject_reason: string | null;
          fulfilled_expense_id: string | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          material_id: string;
          requested_quantity: number;
          suggested_quantity?: number | null;
          reason?: string | null;
          status?: "pending" | "approved" | "rejected" | "fulfilled";
          requested_by?: string | null;
          requested_at?: string;
          decided_by?: string | null;
          decided_at?: string | null;
          reject_reason?: string | null;
          fulfilled_expense_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["cm_purchase_requests"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "cm_purchase_requests_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "construction_projects";
            referencedColumns: ["id"];
          },
        ];
      };
      cm_contractors: {
        Row: {
          id: string;
          full_name: string;
          contractor_type: "tukang" | "mandor" | "subcontractor";
          phone: string | null;
          bank_account: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          full_name: string;
          contractor_type?: "tukang" | "mandor" | "subcontractor";
          phone?: string | null;
          bank_account?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["cm_contractors"]["Insert"]>;
        Relationships: [];
      };
      cm_labor_contracts: {
        Row: {
          id: string;
          project_id: string;
          unit_id: string | null;
          contractor_id: string;
          contract_value: number;
          retention_pct: number;
          outstanding_advance: number;
          start_date: string;
          target_completion: string | null;
          attachment_url: string | null;
          notes: string | null;
          status: "active" | "completed" | "cancelled";
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          unit_id?: string | null;
          contractor_id: string;
          contract_value: number;
          retention_pct?: number;
          outstanding_advance?: number;
          start_date?: string;
          target_completion?: string | null;
          attachment_url?: string | null;
          notes?: string | null;
          status?: "active" | "completed" | "cancelled";
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["cm_labor_contracts"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "cm_labor_contracts_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "construction_projects";
            referencedColumns: ["id"];
          },
          { foreignKeyName: "cm_labor_contracts_contractor_id_fkey"; columns: ["contractor_id"]; referencedRelation: "cm_contractors"; referencedColumns: ["id"] },
          { foreignKeyName: "cm_labor_contracts_unit_id_fkey"; columns: ["unit_id"]; referencedRelation: "cm_units"; referencedColumns: ["id"] },
        ];
      };
      cm_labor_contract_weights: {
        Row: { id: string; contract_id: string; project_wbs_id: string; weight_pct: number; last_paid_progress_pct: number };
        Insert: { id?: string; contract_id: string; project_wbs_id: string; weight_pct: number; last_paid_progress_pct?: number };
        Update: Partial<Database["public"]["Tables"]["cm_labor_contract_weights"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "cm_labor_contract_weights_contract_id_fkey";
            columns: ["contract_id"];
            referencedRelation: "cm_labor_contracts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cm_labor_contract_weights_project_wbs_id_fkey";
            columns: ["project_wbs_id"];
            referencedRelation: "cm_project_wbs";
            referencedColumns: ["id"];
          },
        ];
      };
      cm_labor_advances: {
        Row: { id: string; contract_id: string; amount: number; note: string | null; created_by: string | null; created_at: string };
        Insert: { id?: string; contract_id: string; amount: number; note?: string | null; created_by?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["cm_labor_advances"]["Insert"]>;
        Relationships: [
          { foreignKeyName: "cm_labor_advances_contract_id_fkey"; columns: ["contract_id"]; referencedRelation: "cm_labor_contracts"; referencedColumns: ["id"] },
        ];
      };
      cm_labor_payments: {
        Row: {
          id: string;
          contract_id: string;
          period_start: string;
          period_end: string;
          gross_earned: number;
          retention_amount: number;
          deduction_amount: number;
          advance_recovery_amount: number;
          net_payable: number;
          cumulative_earned_before: number;
          cumulative_paid_before: number;
          status: "draft" | "kc_approved" | "approved" | "rejected";
          linked_expense_id: string | null;
          created_by: string | null;
          created_at: string;
          approved_by: string | null;
          approved_at: string | null;
          reject_reason: string | null;
          ai_reviewed_at: string | null;
          ai_verdict: "sesuai" | "perlu_dicek" | "tidak_sesuai" | null;
          ai_summary: string | null;
          ai_concerns: string[];
          ai_photo_count: number;
          kc_decided_by: string | null;
          kc_decided_at: string | null;
          kc_reject_reason: string | null;
          notified_kc_at: string | null;
        };
        Insert: {
          id?: string;
          contract_id: string;
          period_start: string;
          period_end: string;
          gross_earned?: number;
          retention_amount?: number;
          deduction_amount?: number;
          advance_recovery_amount?: number;
          net_payable?: number;
          cumulative_earned_before?: number;
          cumulative_paid_before?: number;
          status?: "draft" | "kc_approved" | "approved" | "rejected";
          linked_expense_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          approved_by?: string | null;
          approved_at?: string | null;
          reject_reason?: string | null;
          ai_reviewed_at?: string | null;
          ai_verdict?: "sesuai" | "perlu_dicek" | "tidak_sesuai" | null;
          ai_summary?: string | null;
          ai_concerns?: string[];
          ai_photo_count?: number;
          kc_decided_by?: string | null;
          kc_decided_at?: string | null;
          kc_reject_reason?: string | null;
          notified_kc_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["cm_labor_payments"]["Insert"]>;
        Relationships: [
          { foreignKeyName: "cm_labor_payments_contract_id_fkey"; columns: ["contract_id"]; referencedRelation: "cm_labor_contracts"; referencedColumns: ["id"] },
        ];
      };
      cm_labor_deductions: {
        Row: {
          id: string;
          payment_id: string;
          amount: number;
          category: "damage" | "rework" | "penalty" | "other";
          reason: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          payment_id: string;
          amount: number;
          category: "damage" | "rework" | "penalty" | "other";
          reason: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["cm_labor_deductions"]["Insert"]>;
        Relationships: [
          { foreignKeyName: "cm_labor_deductions_payment_id_fkey"; columns: ["payment_id"]; referencedRelation: "cm_labor_payments"; referencedColumns: ["id"] },
        ];
      };
      cm_materials: {
        Row: {
          id: string;
          code: string;
          name: string;
          category: string;
          unit_satuan: string;
          standard_price: number | null;
          min_stock: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          category: string;
          unit_satuan: string;
          standard_price?: number | null;
          min_stock?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["cm_materials"]["Insert"]>;
        Relationships: [];
      };
      cm_material_stock: {
        Row: {
          id: string;
          project_id: string;
          material_id: string;
          quantity: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          material_id: string;
          quantity?: number;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["cm_material_stock"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "cm_material_stock_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "construction_projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cm_material_stock_material_id_fkey";
            columns: ["material_id"];
            referencedRelation: "cm_materials";
            referencedColumns: ["id"];
          },
        ];
      };
      cm_stock_movements: {
        Row: {
          id: string;
          project_id: string;
          material_id: string;
          direction: "in" | "out";
          quantity: number;
          source_type: "purchase" | "consumption" | "adjustment" | "waste";
          source_expense_id: string | null;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          material_id: string;
          direction: "in" | "out";
          quantity: number;
          source_type: "purchase" | "consumption" | "adjustment" | "waste";
          source_expense_id?: string | null;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["cm_stock_movements"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "cm_stock_movements_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "construction_projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cm_stock_movements_material_id_fkey";
            columns: ["material_id"];
            referencedRelation: "cm_materials";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cm_stock_movements_source_expense_id_fkey";
            columns: ["source_expense_id"];
            referencedRelation: "construction_expenses";
            referencedColumns: ["id"];
          },
        ];
      };
      construction_targets: {
        Row: {
          id: string;
          branch_id: string;
          project_name: string;
          period_month: number;
          period_year: number;
          target_units: number;
          value_per_unit: number;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          project_name: string;
          period_month: number;
          period_year: number;
          target_units: number;
          value_per_unit: number;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["construction_targets"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "construction_targets_branch_id_fkey";
            columns: ["branch_id"];
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      construction_target_reminder_log: {
        Row: { id: string; target_id: string; sent_at: string };
        Insert: { id?: string; target_id: string; sent_at?: string };
        Update: Partial<Database["public"]["Tables"]["construction_target_reminder_log"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "construction_target_reminder_log_target_id_fkey";
            columns: ["target_id"];
            referencedRelation: "construction_targets";
            referencedColumns: ["id"];
          },
        ];
      };
      construction_tukang_teaching_log: {
        Row: { id: string; branch_id: string; sent_at: string };
        Insert: { id?: string; branch_id: string; sent_at?: string };
        Update: Partial<Database["public"]["Tables"]["construction_tukang_teaching_log"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "construction_tukang_teaching_log_branch_id_fkey";
            columns: ["branch_id"];
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      hr_expenses: {
        Row: {
          id: string;
          expense_type: "bonus" | "reimbursement" | "other";
          employee_id: string;
          branch_id: string;
          amount: number;
          expense_date: string;
          description: string;
          status: "pending" | "approved" | "rejected";
          requested_by: string | null;
          approved_by: string | null;
          approved_at: string | null;
          rejection_reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          expense_type: "bonus" | "reimbursement" | "other";
          employee_id: string;
          branch_id: string;
          amount: number;
          expense_date?: string;
          description: string;
          status?: "pending" | "approved" | "rejected";
          requested_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          rejection_reason?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["hr_expenses"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "hr_expenses_employee_id_fkey";
            columns: ["employee_id"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hr_expenses_branch_id_fkey";
            columns: ["branch_id"];
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_job_queue: {
        Row: {
          id: string;
          job_type: "whatsapp_ai_reply" | "crm_sp1_draft" | "markom_checklist_draft" | "meta_ads_launch" | "meta_ads_research" | "social_weekly_evaluation" | "crm_sales_coaching" | "loonars_beauty_weekly_evaluation" | "knowledge_bank_refresh" | "sales_closing_tips_broadcast" | "leasehold_competitor_comparison" | "competitor_discovery" | "loonars_beauty_competitor_comparison" | "loonars_beauty_content_ideas_draft" | "investor_intelligence_refresh" | "cashflow_intelligence_refresh" | "sales_teaching_weekly" | "cashflow_action_plan" | "loonars_beauty_weekly_content_audit" | "markom_content_performance_broadcast" | "occupancy_intelligence_refresh" | "occupancy_teaching_biweekly" | "content_submission_review" | "kontenai_auto_produce" | "kontenai_auto_produce_beauty" | "kontenai_auto_bridge_to_studio" | "zernio_publish_reconcile" | "friday_executive_briefing" | "friday_holding_briefing" | "kontenai_asset_vision" | "whatsapp_lead_nurture_reply" | "whatsapp_admin_answer_relay" | "social_monthly_content_report" | "markom_hashtag_bank_refresh";
          payload: Json;
          status: "pending" | "processing" | "succeeded" | "failed" | "dead_letter";
          attempt_count: number;
          max_attempts: number;
          last_error: string | null;
          next_attempt_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          job_type: "whatsapp_ai_reply" | "crm_sp1_draft" | "markom_checklist_draft" | "meta_ads_launch" | "meta_ads_research" | "social_weekly_evaluation" | "crm_sales_coaching" | "loonars_beauty_weekly_evaluation" | "knowledge_bank_refresh" | "sales_closing_tips_broadcast" | "leasehold_competitor_comparison" | "competitor_discovery" | "loonars_beauty_competitor_comparison" | "loonars_beauty_content_ideas_draft" | "investor_intelligence_refresh" | "cashflow_intelligence_refresh" | "sales_teaching_weekly" | "cashflow_action_plan" | "loonars_beauty_weekly_content_audit" | "markom_content_performance_broadcast" | "occupancy_intelligence_refresh" | "occupancy_teaching_biweekly" | "content_submission_review" | "kontenai_auto_produce" | "kontenai_auto_produce_beauty" | "kontenai_auto_bridge_to_studio" | "zernio_publish_reconcile" | "friday_executive_briefing" | "friday_holding_briefing" | "kontenai_asset_vision" | "whatsapp_lead_nurture_reply" | "whatsapp_admin_answer_relay" | "social_monthly_content_report" | "markom_hashtag_bank_refresh";
          payload: Json;
          status?: "pending" | "processing" | "succeeded" | "failed" | "dead_letter";
          attempt_count?: number;
          max_attempts?: number;
          last_error?: string | null;
          next_attempt_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ai_job_queue"]["Insert"]>;
        Relationships: [];
      };
      crm_sp1_warnings: {
        Row: {
          id: string;
          sales_id: string;
          branch_id: string;
          period_month: number;
          period_year: number;
          reason: string;
          stuck_prospect_ids: string[];
          ai_draft_content: string | null;
          status: "pending_ai" | "pending_review" | "approved" | "rejected";
          reviewed_by: string | null;
          reviewed_at: string | null;
          review_note: string | null;
          upload_days_30d: number | null;
          follow_up_count_30d: number | null;
          closings_30d: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          sales_id: string;
          branch_id: string;
          period_month: number;
          period_year: number;
          reason: string;
          stuck_prospect_ids?: string[];
          ai_draft_content?: string | null;
          status?: "pending_ai" | "pending_review" | "approved" | "rejected";
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          review_note?: string | null;
          upload_days_30d?: number | null;
          follow_up_count_30d?: number | null;
          closings_30d?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_sp1_warnings"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "crm_sp1_warnings_sales_id_fkey";
            columns: ["sales_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_sp1_warnings_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_sp1_warnings_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_circuit_breaker_state: {
        Row: {
          provider: string;
          state: "closed" | "open" | "half_open";
          consecutive_failures: number;
          opened_at: string | null;
          last_failure_at: string | null;
          last_success_at: string | null;
          updated_at: string;
        };
        Insert: {
          provider: string;
          state?: "closed" | "open" | "half_open";
          consecutive_failures?: number;
          opened_at?: string | null;
          last_failure_at?: string | null;
          last_success_at?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ai_circuit_breaker_state"]["Insert"]>;
        Relationships: [];
      };
      ai_request_telemetry: {
        Row: {
          id: string;
          provider: string;
          model: string;
          job_id: string | null;
          attempt: number;
          max_attempts: number;
          http_status: number | null;
          error_body: string | null;
          wait_ms: number | null;
          response_time_ms: number;
          outcome: "success" | "retrying" | "failed_final" | "model_not_found" | "circuit_open";
          circuit_state: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          provider: string;
          model: string;
          job_id?: string | null;
          attempt: number;
          max_attempts: number;
          http_status?: number | null;
          error_body?: string | null;
          wait_ms?: number | null;
          response_time_ms: number;
          outcome: "success" | "retrying" | "failed_final" | "model_not_found" | "circuit_open";
          circuit_state?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ai_request_telemetry"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "ai_request_telemetry_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "ai_job_queue";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_system_prompts: {
        Row: {
          key: string;
          label: string;
          content: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          key: string;
          label: string;
          content: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["ai_system_prompts"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "ai_system_prompts_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_integration_logs: {
        Row: {
          id: string;
          connector: "whatsapp" | "meta";
          direction: "outgoing" | "incoming";
          payload: Json;
          status: "success" | "error";
          response_status: number | null;
          error: string | null;
          latency_ms: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          connector: "whatsapp" | "meta";
          direction: "outgoing" | "incoming";
          payload: Json;
          status: "success" | "error";
          response_status?: number | null;
          error?: string | null;
          latency_ms?: number | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ai_integration_logs"]["Insert"]>;
        Relationships: [];
      };
      ai_conversations: {
        Row: {
          id: string;
          connector: "whatsapp";
          sender: string;
          employee_id: string | null;
          inbound_text: string;
          reply_text: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          connector: "whatsapp";
          sender: string;
          employee_id?: string | null;
          inbound_text: string;
          reply_text?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ai_conversations"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "ai_conversations_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      finance_pending_transfers: {
        Row: {
          id: string;
          pengajuan_id: number;
          proyek: string;
          tipe: "bahan" | "tukang";
          branch_id: string | null;
          party_name: string | null;
          reference_no: string | null;
          nominal: number;
          admin_email: string | null;
          confirmed_at: string | null;
          confirmed_by: string | null;
          rejected_at: string | null;
          rejected_by: string | null;
          rejected_reason: string | null;
          rekening_tujuan: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          pengajuan_id: number;
          proyek: string;
          tipe: "bahan" | "tukang";
          branch_id?: string | null;
          party_name?: string | null;
          reference_no?: string | null;
          nominal: number;
          admin_email?: string | null;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          rejected_at?: string | null;
          rejected_by?: string | null;
          rejected_reason?: string | null;
          rekening_tujuan?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["finance_pending_transfers"]["Insert"]>;
        Relationships: [
          { foreignKeyName: "finance_pending_transfers_branch_id_fkey"; columns: ["branch_id"]; referencedRelation: "branches"; referencedColumns: ["id"] },
          { foreignKeyName: "finance_pending_transfers_confirmed_by_fkey"; columns: ["confirmed_by"]; referencedRelation: "employees"; referencedColumns: ["id"] },
          { foreignKeyName: "finance_pending_transfers_rejected_by_fkey"; columns: ["rejected_by"]; referencedRelation: "employees"; referencedColumns: ["id"] },
        ];
      };
      construction_progress_assessments: {
        Row: {
          project_code: string;
          assessed_at: string;
          overall_progress_pct: number;
          summary: string;
          concerns: string[];
          block_count: number;
          block_count_with_photos: number;
          block_snapshot: Json;
        };
        Insert: {
          project_code: string;
          assessed_at?: string;
          overall_progress_pct: number;
          summary?: string;
          concerns?: string[];
          block_count?: number;
          block_count_with_photos?: number;
          block_snapshot?: Json;
        };
        Update: Partial<Database["public"]["Tables"]["construction_progress_assessments"]["Insert"]>;
        Relationships: [];
      };
      sync_log: {
        Row: {
          id: string;
          direction: "outbound" | "inbound";
          event_type: string;
          source_table: string;
          source_id: string;
          idempotency_key: string;
          payload: Json;
          status: "pending" | "sent" | "succeeded" | "failed" | "dead_letter" | "skipped";
          attempt_count: number;
          max_attempts: number;
          last_error: string | null;
          last_attempt_at: string | null;
          next_attempt_at: string;
          request_id: number | null;
          target_ref: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          direction: "outbound" | "inbound";
          event_type: string;
          source_table: string;
          source_id: string;
          idempotency_key: string;
          payload: Json;
          status?: "pending" | "sent" | "succeeded" | "failed" | "dead_letter" | "skipped";
          attempt_count?: number;
          max_attempts?: number;
          last_error?: string | null;
          last_attempt_at?: string | null;
          next_attempt_at?: string;
          request_id?: number | null;
          target_ref?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sync_log"]["Insert"]>;
        Relationships: [];
      };
      sync_config: {
        Row: { key: string; value: string; updated_at: string };
        Insert: { key: string; value: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["sync_config"]["Insert"]>;
        Relationships: [];
      };
      sales_targets: {
        Row: {
          id: string;
          sales_id: string;
          product_id: string | null;
          period_month: number;
          period_year: number;
          target_units: number;
          selling_price_per_unit: number;
          commission_percent: number;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          sales_id: string;
          product_id?: string | null;
          period_month: number;
          period_year: number;
          target_units?: number;
          selling_price_per_unit?: number;
          commission_percent?: number;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["sales_targets"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "sales_targets_sales_id_fkey";
            columns: ["sales_id"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_targets_product_id_fkey";
            columns: ["product_id"];
            referencedRelation: "crm_products";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_products: {
        Row: {
          id: string;
          company_id: string | null;
          product_name: string;
          category: string | null;
          unit: string;
          default_price: number;
          default_commission: number;
          status: "active" | "inactive";
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          company_id?: string | null;
          product_name: string;
          category?: string | null;
          unit?: string;
          default_price?: number;
          default_commission?: number;
          status?: "active" | "inactive";
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["crm_products"]["Insert"]>;
        Relationships: [];
      };
      crm_product_sales_assignments: {
        Row: {
          id: string;
          product_id: string;
          sales_id: string;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          product_id: string;
          sales_id: string;
          created_at?: string;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["crm_product_sales_assignments"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "crm_product_sales_assignments_product_id_fkey";
            columns: ["product_id"];
            referencedRelation: "crm_products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_product_sales_assignments_sales_id_fkey";
            columns: ["sales_id"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_target_headers: {
        Row: {
          id: string;
          company_id: string | null;
          branch_id: string;
          period_month: number;
          period_year: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id?: string | null;
          branch_id: string;
          period_month: number;
          period_year: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_target_headers"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "crm_target_headers_branch_id_fkey";
            columns: ["branch_id"];
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_target_details: {
        Row: {
          id: string;
          target_header_id: string;
          product_id: string;
          target_unit: number;
          selling_price: number;
          commission_percent: number;
          target_revenue: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          target_header_id: string;
          product_id: string;
          target_unit?: number;
          selling_price?: number;
          commission_percent?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crm_target_details"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "crm_target_details_target_header_id_fkey";
            columns: ["target_header_id"];
            referencedRelation: "crm_target_headers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_target_details_product_id_fkey";
            columns: ["product_id"];
            referencedRelation: "crm_products";
            referencedColumns: ["id"];
          },
        ];
      };
      branch_sales_targets: {
        Row: {
          id: string;
          branch_id: string;
          period_month: number;
          period_year: number;
          target_units: number;
          selling_price_per_unit: number;
          commission_percent: number;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          branch_id: string;
          period_month: number;
          period_year: number;
          target_units?: number;
          selling_price_per_unit?: number;
          commission_percent?: number;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["branch_sales_targets"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "branch_sales_targets_branch_id_fkey";
            columns: ["branch_id"];
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      kpi_tasks: {
        Row: {
          id: string;
          division_id: string;
          branch_id: string;
          title: string;
          description: string | null;
          period_year: number;
          period_month: number;
          period_week: number;
          due_date: string | null;
          status: KpiTaskStatusDb;
          content_focus: KpiTaskContentFocusDb;
          completed_at: string | null;
          verified_by: string | null;
          notes: string | null;
          assignee_response: string | null;
          assignee_response_at: string | null;
          ai_guidance: string | null;
          ai_guidance_at: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          division_id: string;
          branch_id: string;
          title: string;
          description?: string | null;
          period_year: number;
          period_month: number;
          period_week: number;
          due_date?: string | null;
          status?: KpiTaskStatusDb;
          content_focus?: KpiTaskContentFocusDb;
          completed_at?: string | null;
          verified_by?: string | null;
          notes?: string | null;
          assignee_response?: string | null;
          assignee_response_at?: string | null;
          ai_guidance?: string | null;
          ai_guidance_at?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["kpi_tasks"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "kpi_tasks_division_id_fkey";
            columns: ["division_id"];
            referencedRelation: "divisions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kpi_tasks_branch_id_fkey";
            columns: ["branch_id"];
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kpi_tasks_verified_by_fkey";
            columns: ["verified_by"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      markom_content_submissions: {
        Row: {
          id: string;
          task_id: string | null;
          beauty_content_item_id: string | null;
          branch_id: string;
          division_id: string;
          content_focus: "leasehold_sales" | "occupancy" | "beauty";
          platform: "instagram" | "tiktok";
          submitted_by: string;
          media_type: "image" | "video";
          storage_path: string;
          public_url: string;
          caption: string | null;
          status: "pending_review" | "needs_revision" | "approved" | "scheduled" | "published" | "failed";
          ai_score: number | null;
          ai_verdict: string | null;
          ai_reviewed_at: string | null;
          scheduled_publish_at: string | null;
          ig_container_id: string | null;
          ig_media_id: string | null;
          published_at: string | null;
          reminder_sent_at: string | null;
          verifier_notified_at: string | null;
          zernio_account_id: string | null;
          zernio_post_id: string | null;
          zernio_publish_status: string | null;
          zernio_permalink: string | null;
          failure_reason: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
          is_automation_generated: boolean;
        };
        Insert: {
          id?: string;
          task_id?: string | null;
          beauty_content_item_id?: string | null;
          branch_id: string;
          division_id: string;
          content_focus: "leasehold_sales" | "occupancy" | "beauty";
          platform?: "instagram" | "tiktok";
          submitted_by: string;
          is_automation_generated?: boolean;
          media_type: "image" | "video";
          storage_path: string;
          public_url: string;
          caption?: string | null;
          status?: "pending_review" | "needs_revision" | "approved" | "scheduled" | "published" | "failed";
          ai_score?: number | null;
          ai_verdict?: string | null;
          ai_reviewed_at?: string | null;
          scheduled_publish_at?: string | null;
          ig_container_id?: string | null;
          ig_media_id?: string | null;
          published_at?: string | null;
          reminder_sent_at?: string | null;
          verifier_notified_at?: string | null;
          zernio_account_id?: string | null;
          zernio_post_id?: string | null;
          zernio_publish_status?: string | null;
          zernio_permalink?: string | null;
          failure_reason?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["markom_content_submissions"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "markom_content_submissions_task_id_fkey";
            columns: ["task_id"];
            referencedRelation: "kpi_tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "markom_content_submissions_beauty_content_item_id_fkey";
            columns: ["beauty_content_item_id"];
            referencedRelation: "loonars_content_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "markom_content_submissions_branch_id_fkey";
            columns: ["branch_id"];
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "markom_content_submissions_submitted_by_fkey";
            columns: ["submitted_by"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      markom_content_submission_photos: {
        Row: {
          id: string;
          submission_id: string;
          storage_path: string;
          public_url: string;
          display_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          submission_id: string;
          storage_path: string;
          public_url: string;
          display_order?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["markom_content_submission_photos"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "markom_content_submission_photos_submission_id_fkey";
            columns: ["submission_id"];
            referencedRelation: "markom_content_submissions";
            referencedColumns: ["id"];
          },
        ];
      };
      loonars_closings: {
        Row: {
          id: string;
          aset_id: number;
          proyek: string;
          blok: string;
          buyer: string | null;
          nik: string | null;
          phone: string | null;
          address: string | null;
          tipe: string | null;
          price: number | null;
          tgl: string | null;
          marketing_name: string | null;
          marketing_email: string | null;
          matched_employee_id: string | null;
          branch_id: string | null;
          status: "pending_verification" | "verified" | "rejected";
          verified_by: string | null;
          verified_at: string | null;
          reject_reason: string | null;
          fee_requested: boolean;
          fee_amount: number | null;
          fee_phone: string | null;
          fee_requested_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          aset_id: number;
          proyek: string;
          blok: string;
          buyer?: string | null;
          nik?: string | null;
          phone?: string | null;
          address?: string | null;
          tipe?: string | null;
          price?: number | null;
          tgl?: string | null;
          marketing_name?: string | null;
          marketing_email?: string | null;
          matched_employee_id?: string | null;
          branch_id?: string | null;
          status?: "pending_verification" | "verified" | "rejected";
          verified_by?: string | null;
          verified_at?: string | null;
          reject_reason?: string | null;
          fee_requested?: boolean;
          fee_amount?: number | null;
          fee_phone?: string | null;
          fee_requested_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["loonars_closings"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "loonars_closings_matched_employee_id_fkey";
            columns: ["matched_employee_id"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loonars_closings_branch_id_fkey";
            columns: ["branch_id"];
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      loonars_projects: {
        Row: {
          id: string;
          kode: string;
          nama: string;
          lokasi: string | null;
          warna: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          kode: string;
          nama: string;
          lokasi?: string | null;
          warna?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["loonars_projects"]["Insert"]>;
        Relationships: [];
      };
      loonars_units: {
        Row: {
          id: string;
          project_id: string;
          blok: string;
          tipe: string | null;
          harga: number | null;
          luas: number | null;
          status: "tersedia" | "dp" | "verifikasi" | "terjual";
          row_label: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          blok: string;
          tipe?: string | null;
          harga?: number | null;
          luas?: number | null;
          status?: "tersedia" | "dp" | "verifikasi" | "terjual";
          row_label?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["loonars_units"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "loonars_units_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "loonars_projects";
            referencedColumns: ["id"];
          },
        ];
      };
      loonars_siteplan_layouts: {
        Row: {
          id: string;
          project_id: string;
          image_path: string;
          image_width: number | null;
          image_height: number | null;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          image_path: string;
          image_width?: number | null;
          image_height?: number | null;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["loonars_siteplan_layouts"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "loonars_siteplan_layouts_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "loonars_projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loonars_siteplan_layouts_updated_by_fkey";
            columns: ["updated_by"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      loonars_unit_positions: {
        Row: {
          id: string;
          unit_id: string;
          x_pct: number;
          y_pct: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          unit_id: string;
          x_pct: number;
          y_pct: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["loonars_unit_positions"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "loonars_unit_positions_unit_id_fkey";
            columns: ["unit_id"];
            referencedRelation: "loonars_units";
            referencedColumns: ["id"];
          },
        ];
      };
      loonars_unit_purchases: {
        Row: {
          id: string;
          unit_id: string;
          buyer_name: string;
          nik: string | null;
          phone: string | null;
          address: string | null;
          transaction_type: "booking" | "dp" | "akad";
          payment_method: "cash" | "kpr" | "both";
          price: number | null;
          booking_fee: number | null;
          dp_amount: number | null;
          pelunasan_amount: number | null;
          transaction_date: string;
          handover_date: string | null;
          spi_no: string | null;
          marketing_employee_id: string;
          branch_id: string | null;
          status: "pending_verification" | "verified" | "rejected";
          verified_by: string | null;
          verified_at: string | null;
          reject_reason: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          unit_id: string;
          buyer_name: string;
          nik?: string | null;
          phone?: string | null;
          address?: string | null;
          transaction_type: "booking" | "dp" | "akad";
          payment_method?: "cash" | "kpr" | "both";
          price?: number | null;
          booking_fee?: number | null;
          dp_amount?: number | null;
          pelunasan_amount?: number | null;
          transaction_date?: string;
          handover_date?: string | null;
          spi_no?: string | null;
          marketing_employee_id: string;
          branch_id?: string | null;
          status?: "pending_verification" | "verified" | "rejected";
          verified_by?: string | null;
          verified_at?: string | null;
          reject_reason?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["loonars_unit_purchases"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "loonars_unit_purchases_unit_id_fkey";
            columns: ["unit_id"];
            referencedRelation: "loonars_units";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loonars_unit_purchases_marketing_employee_id_fkey";
            columns: ["marketing_employee_id"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loonars_unit_purchases_branch_id_fkey";
            columns: ["branch_id"];
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loonars_unit_purchases_verified_by_fkey";
            columns: ["verified_by"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      loonars_unit_fee_requests: {
        Row: {
          id: string;
          purchase_id: string;
          unit_id: string;
          marketing_employee_id: string;
          fee_amount: number;
          phone: string | null;
          status: "pending" | "approved" | "rejected";
          decided_by: string | null;
          decided_at: string | null;
          reject_reason: string | null;
          requested_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          purchase_id: string;
          unit_id: string;
          marketing_employee_id: string;
          fee_amount: number;
          phone?: string | null;
          status?: "pending" | "approved" | "rejected";
          decided_by?: string | null;
          decided_at?: string | null;
          reject_reason?: string | null;
          requested_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["loonars_unit_fee_requests"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "loonars_unit_fee_requests_purchase_id_fkey";
            columns: ["purchase_id"];
            referencedRelation: "loonars_unit_purchases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loonars_unit_fee_requests_unit_id_fkey";
            columns: ["unit_id"];
            referencedRelation: "loonars_units";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loonars_unit_fee_requests_marketing_employee_id_fkey";
            columns: ["marketing_employee_id"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loonars_unit_fee_requests_decided_by_fkey";
            columns: ["decided_by"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      loonars_fee_wa_requests: {
        Row: {
          fee_id: number;
          proyek: string | null;
          unit: string | null;
          buyer: string | null;
          marketing: string | null;
          fee_amount: number | null;
          requested_at: string;
          decided: boolean;
          decided_at: string | null;
          decided_by: string | null;
        };
        Insert: {
          fee_id: number;
          proyek?: string | null;
          unit?: string | null;
          buyer?: string | null;
          marketing?: string | null;
          fee_amount?: number | null;
          requested_at?: string;
          decided?: boolean;
          decided_at?: string | null;
          decided_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["loonars_fee_wa_requests"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "loonars_fee_wa_requests_decided_by_fkey";
            columns: ["decided_by"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      finance_branch_balances: {
        Row: {
          id: string;
          branch_id: string;
          branch_name: string;
          saldo: number;
          source_system: string;
          synced_at: string;
          updated_at: string;
          alert_threshold: number;
          notify_dirops: boolean;
          situation_type: string;
          situation_note: string | null;
          reminder_interval_days: number;
          cashflow_teaching_threshold: number | null;
        };
        Insert: {
          id?: string;
          branch_id: string;
          branch_name: string;
          saldo?: number;
          source_system?: string;
          synced_at?: string;
          updated_at?: string;
          alert_threshold?: number;
          notify_dirops?: boolean;
          situation_type?: string;
          situation_note?: string | null;
          reminder_interval_days?: number;
          cashflow_teaching_threshold?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["finance_branch_balances"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "finance_branch_balances_branch_id_fkey";
            columns: ["branch_id"];
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      kontenai_assets: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          filename: string;
          asset_type: "image" | "video" | "audio" | "logo" | "brand_guideline" | "font" | "template" | "document";
          storage_path: string;
          public_url: string | null;
          storage_provider: "supabase" | "google_drive" | "local_mac";
          file_type: string;
          file_size_bytes: number;
          resolution: string | null;
          duration_seconds: number | null;
          company: string | null;
          project: string | null;
          campaign: string | null;
          platform: string | null;
          content_type: string | null;
          location: string | null;
          status: "draft" | "active" | "archived";
          tags: string[];
          search_text: unknown;
          ai_vision_status: "not_analyzed" | "pending" | "completed" | "failed";
          ai_title: string | null;
          ai_description: string | null;
          ai_tags: string[];
          ai_category: string | null;
          ai_detected_objects: string[];
          ai_dominant_colors: string[];
          ai_mood: string | null;
          ai_analyzed_at: string | null;
          ai_error: string | null;
          ai_scene_summary: Json;
          created_by: string;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          filename: string;
          asset_type: "image" | "video" | "audio" | "logo" | "brand_guideline" | "font" | "template" | "document";
          storage_path: string;
          public_url?: string | null;
          storage_provider?: "supabase" | "google_drive" | "local_mac";
          file_type: string;
          file_size_bytes: number;
          resolution?: string | null;
          duration_seconds?: number | null;
          company?: string | null;
          project?: string | null;
          campaign?: string | null;
          platform?: string | null;
          content_type?: string | null;
          location?: string | null;
          status?: "draft" | "active" | "archived";
          tags?: string[];
          ai_vision_status?: "not_analyzed" | "pending" | "completed" | "failed";
          ai_title?: string | null;
          ai_description?: string | null;
          ai_tags?: string[];
          ai_category?: string | null;
          ai_detected_objects?: string[];
          ai_dominant_colors?: string[];
          ai_mood?: string | null;
          ai_analyzed_at?: string | null;
          ai_error?: string | null;
          ai_scene_summary?: Json;
          created_by: string;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["kontenai_assets"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "kontenai_assets_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kontenai_assets_updated_by_fkey";
            columns: ["updated_by"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      kontenai_creative_briefs: {
        Row: {
          id: string;
          objective: "brand_awareness" | "leads" | "sales" | "engagement";
          platform: "instagram" | "tiktok" | "facebook";
          target_audience: string;
          product_project: string;
          campaign_goal: string;
          big_idea: string;
          hook: string;
          key_message: string;
          target_emotion: string;
          cta: string;
          content_angle: string;
          referenced_asset_ids: string[];
          production_direction: Json;
          content_focus: "leasehold_sales" | "occupancy" | "beauty" | null;
          created_by: string;
          created_at: string;
          kpi_task_id: string | null;
        };
        Insert: {
          id?: string;
          objective: "brand_awareness" | "leads" | "sales" | "engagement";
          platform: "instagram" | "tiktok" | "facebook";
          target_audience: string;
          product_project: string;
          campaign_goal: string;
          big_idea: string;
          hook: string;
          key_message: string;
          target_emotion: string;
          cta: string;
          content_angle: string;
          referenced_asset_ids?: string[];
          production_direction?: Json;
          content_focus?: "leasehold_sales" | "occupancy" | "beauty" | null;
          created_by: string;
          created_at?: string;
          kpi_task_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["kontenai_creative_briefs"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "kontenai_creative_briefs_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kontenai_creative_briefs_kpi_task_id_fkey";
            columns: ["kpi_task_id"];
            referencedRelation: "kpi_tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      kontenai_automation_settings: {
        Row: {
          id: string;
          enabled: boolean;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          enabled?: boolean;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["kontenai_automation_settings"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "kontenai_automation_settings_updated_by_fkey";
            columns: ["updated_by"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      kontenai_storyboards: {
        Row: {
          id: string;
          creative_brief_id: string;
          title: string;
          scenes: Json;
          total_duration_seconds: number;
          created_by: string;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          creative_brief_id: string;
          title: string;
          scenes?: Json;
          total_duration_seconds?: number;
          created_by: string;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["kontenai_storyboards"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "kontenai_storyboards_creative_brief_id_fkey";
            columns: ["creative_brief_id"];
            referencedRelation: "kontenai_creative_briefs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kontenai_storyboards_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kontenai_storyboards_updated_by_fkey";
            columns: ["updated_by"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      kontenai_render_jobs: {
        Row: {
          id: string;
          storyboard_id: string;
          status: "queued" | "rendering" | "completed" | "failed";
          progress: number;
          stage: string;
          output_storage_path: string | null;
          output_public_url: string | null;
          duration_seconds: number | null;
          error_message: string | null;
          created_by: string;
          created_at: string;
          started_at: string | null;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          storyboard_id: string;
          status?: "queued" | "rendering" | "completed" | "failed";
          progress?: number;
          stage?: string;
          output_storage_path?: string | null;
          output_public_url?: string | null;
          duration_seconds?: number | null;
          error_message?: string | null;
          created_by: string;
          created_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["kontenai_render_jobs"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "kontenai_render_jobs_storyboard_id_fkey";
            columns: ["storyboard_id"];
            referencedRelation: "kontenai_storyboards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kontenai_render_jobs_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      kontenai_video_generation_jobs: {
        Row: {
          id: string;
          storyboard_id: string;
          scene_id: string;
          prompt: string;
          base_asset_id: string | null;
          status: "queued" | "generating" | "completed" | "failed";
          generated_asset_id: string | null;
          error_message: string | null;
          created_by: string;
          created_at: string;
          started_at: string | null;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          storyboard_id: string;
          scene_id: string;
          prompt: string;
          base_asset_id?: string | null;
          status?: "queued" | "generating" | "completed" | "failed";
          generated_asset_id?: string | null;
          error_message?: string | null;
          created_by: string;
          created_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["kontenai_video_generation_jobs"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "kontenai_video_generation_jobs_storyboard_id_fkey";
            columns: ["storyboard_id"];
            referencedRelation: "kontenai_storyboards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kontenai_video_generation_jobs_base_asset_id_fkey";
            columns: ["base_asset_id"];
            referencedRelation: "kontenai_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kontenai_video_generation_jobs_generated_asset_id_fkey";
            columns: ["generated_asset_id"];
            referencedRelation: "kontenai_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kontenai_video_generation_jobs_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      kontenai_publish_schedules: {
        Row: {
          id: string;
          render_job_id: string;
          platform: "instagram" | "facebook" | "tiktok" | "youtube_shorts";
          caption: string;
          hashtags: string[];
          scheduled_at: string | null;
          status: "draft" | "scheduled" | "published" | "failed";
          published_at: string | null;
          external_post_id: string | null;
          external_post_url: string | null;
          error_message: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          render_job_id: string;
          platform: "instagram" | "facebook" | "tiktok" | "youtube_shorts";
          caption?: string;
          hashtags?: string[];
          scheduled_at?: string | null;
          status?: "draft" | "scheduled" | "published" | "failed";
          published_at?: string | null;
          external_post_id?: string | null;
          external_post_url?: string | null;
          error_message?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["kontenai_publish_schedules"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "kontenai_publish_schedules_render_job_id_fkey";
            columns: ["render_job_id"];
            referencedRelation: "kontenai_render_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kontenai_publish_schedules_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      kontenai_content_performance: {
        Row: {
          id: string;
          publish_schedule_id: string;
          views: number;
          reach: number;
          likes: number;
          comments: number;
          shares: number;
          saves: number;
          ctr: number | null;
          leads: number | null;
          ai_insight: string;
          recommended_hook: string;
          recommended_duration_seconds: number | null;
          recommended_cta: string;
          recommended_visual: string;
          recommended_target_emotion: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          publish_schedule_id: string;
          views?: number;
          reach?: number;
          likes?: number;
          comments?: number;
          shares?: number;
          saves?: number;
          ctr?: number | null;
          leads?: number | null;
          ai_insight?: string;
          recommended_hook?: string;
          recommended_duration_seconds?: number | null;
          recommended_cta?: string;
          recommended_visual?: string;
          recommended_target_emotion?: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["kontenai_content_performance"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "kontenai_content_performance_publish_schedule_id_fkey";
            columns: ["publish_schedule_id"];
            referencedRelation: "kontenai_publish_schedules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kontenai_content_performance_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      kontenai_optimization_recommendations: {
        Row: {
          id: string;
          recommended_hook: string;
          recommended_caption: string;
          recommended_cta: string;
          recommended_duration_seconds: number | null;
          recommended_visual_style: string;
          recommended_posting_time: string;
          rationale: string;
          based_on_record_count: number;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          recommended_hook: string;
          recommended_caption: string;
          recommended_cta: string;
          recommended_duration_seconds?: number | null;
          recommended_visual_style: string;
          recommended_posting_time: string;
          rationale: string;
          based_on_record_count?: number;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["kontenai_optimization_recommendations"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "kontenai_optimization_recommendations_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      kontenai_ai_reports: {
        Row: {
          id: string;
          period: "weekly" | "monthly";
          period_start: string;
          period_end: string;
          total_content: number;
          published_content: number;
          total_views: number;
          total_reach: number;
          engagement_rate: number;
          avg_ctr: number | null;
          total_leads: number | null;
          conversion_rate: number | null;
          summary: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          period: "weekly" | "monthly";
          period_start: string;
          period_end: string;
          total_content?: number;
          published_content?: number;
          total_views?: number;
          total_reach?: number;
          engagement_rate?: number;
          avg_ctr?: number | null;
          total_leads?: number | null;
          conversion_rate?: number | null;
          summary: string;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["kontenai_ai_reports"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "kontenai_ai_reports_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      v_employee_directory: {
        Row: {
          id: string;
          employee_code: string;
          full_name: string;
          email: string;
          phone: string | null;
          avatar_url: string | null;
          employment_status: EmploymentStatusDb;
          gender: "male" | "female" | null;
          birth_date: string | null;
          address: string | null;
          join_date: string;
          branch_id: string;
          branch_name: string;
          division_id: string | null;
          division_name: string | null;
          position_id: string | null;
          position_name: string | null;
          role_id: string;
          role_key: string;
          role_name: string;
          created_at: string;
          deleted_at: string | null;
          is_root_owner: boolean;
        };
        Relationships: [];
      };
      v_attendance_today: {
        Row: {
          user_id: string;
          full_name: string;
          avatar_url: string | null;
          branch_id: string;
          branch_name: string;
          division_id: string | null;
          position_id: string | null;
          attendance_id: string | null;
          check_in_time: string | null;
          check_out_time: string | null;
          status: AttendanceStatusDb | null;
          check_in_within_radius: boolean | null;
          check_out_within_radius: boolean | null;
        };
        Relationships: [];
      };
      v_attendance_monthly_stats: {
        Row: {
          user_id: string;
          month: string;
          hadir_count: number;
          terlambat_count: number;
          izin_count: number;
          sakit_count: number;
          alpha_count: number;
          total_records: number;
        };
        Relationships: [];
      };
      v_memo_read_stats: {
        Row: { memo_id: string; audience_count: number; read_count: number };
        Relationships: [];
      };
      v_performance_summary: {
        Row: {
          metric_name: string;
          sample_count: number;
          avg_value: number;
          p75_value: number;
          poor_count: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      release_pending_expense_approval_notifications: { Args: { p_employee_id: string }; Returns: number };
      markom_content_submitted: { Args: { p_submission_id: string }; Returns: Json };
      hr_discipline_evidence: { Args: { p_employee_id: string }; Returns: Json };
      hr_issue_warning: {
        Args: { p_employee_id: string; p_action_type: string; p_reason_category: string; p_description: string };
        Returns: string;
      };
      hr_terminate_employee: {
        Args: {
          p_employee_id: string;
          p_reason_category: string;
          p_description: string;
          p_last_working_date?: string | null;
          p_bypass_justification?: string | null;
        };
        Returns: string;
      };
      hr_revoke_disciplinary_action: { Args: { p_id: string; p_reason: string }; Returns: undefined };
      app_current_role_key: { Args: Record<string, never>; Returns: string };
      app_current_branch_id: { Args: Record<string, never>; Returns: string };
      app_has_permission: { Args: { p_permission_key: string }; Returns: boolean };
      app_is_super_admin: { Args: Record<string, never>; Returns: boolean };
      get_kos_occupancy: {
        Args: Record<string, never>;
        Returns: { property_id: string; property_name: string; total: number; terisi: number; kosong: number }[];
      };
      get_kos_occupancy_internal: {
        Args: Record<string, never>;
        Returns: { property_id: string; property_name: string; total: number; terisi: number; kosong: number }[];
      };
      attendance_check_in: {
        Args: { p_latitude: number; p_longitude: number; p_photo_url: string; p_note?: string | null };
        Returns: Database["public"]["Tables"]["attendance"]["Row"];
      };
      attendance_check_out: {
        Args: { p_latitude: number; p_longitude: number; p_photo_url: string; p_note?: string | null };
        Returns: Database["public"]["Tables"]["attendance"]["Row"];
      };
      decide_leave_request: {
        Args: { p_leave_request_id: string; p_approve: boolean; p_rejection_reason?: string | null };
        Returns: Database["public"]["Tables"]["leave_requests"]["Row"];
      };
      create_memo: {
        Args: {
          p_title: string;
          p_content: string;
          p_priority: MemoPriorityDb;
          p_is_pinned: boolean;
          p_is_mandatory_read: boolean;
          p_expires_at: string | null;
          p_targets: Json;
          p_attachments?: Json;
        };
        Returns: string;
      };
      mark_memo_read: { Args: { p_memo_id: string }; Returns: undefined };
      create_announcement: {
        Args: {
          p_title: string;
          p_content: string;
          p_category_id: string | null;
          p_is_pinned: boolean;
          p_expires_at: string | null;
          p_targets: Json;
          p_attachments?: Json;
        };
        Returns: string;
      };
      mark_notification_read: { Args: { p_notification_id: string }; Returns: undefined };
      mark_all_notifications_read: { Args: Record<string, never>; Returns: undefined };
      archive_notification: { Args: { p_notification_id: string }; Returns: undefined };
      create_emergency_notice: { Args: { p_title: string; p_content: string }; Returns: string };
      get_memo_audience: { Args: { p_memo_id: string }; Returns: { user_id: string }[] };
      get_announcement_audience: { Args: { p_announcement_id: string }; Returns: { user_id: string }[] };
      health_check: { Args: Record<string, never>; Returns: Json };
      record_login_attempt: {
        Args: { p_email: string; p_success: boolean; p_ip_address?: string | null };
        Returns: undefined;
      };
      check_login_lockout: { Args: { p_email: string }; Returns: boolean };
      approve_employee_registration: {
        Args: { p_employee_id: string };
        Returns: Database["public"]["Tables"]["employees"]["Row"];
      };
      reject_employee_registration: {
        Args: { p_employee_id: string; p_reason?: string | null };
        Returns: Database["public"]["Tables"]["employees"]["Row"];
      };
      crm_find_duplicate_prospect: {
        Args: { p_phone: string; p_customer_name: string };
        Returns: {
          id: string;
          customer_name: string;
          phone: string;
          status: ProspectStatusDb;
          created_at: string;
          sales_name: string;
          is_phone_match: boolean;
        }[];
      };
      crm_create_prospect: {
        Args: {
          p_customer_name: string;
          p_phone: string;
          p_project_id: string | null;
          p_house_type: string;
          p_city: string;
          p_lead_source: LeadSourceDb;
          p_notes?: string | null;
        };
        Returns: string;
      };
      crm_add_follow_up: {
        Args: {
          p_prospect_id: string;
          p_activity_type: FollowUpActivityTypeDb;
          p_activity_date: string;
          p_activity_time: string | null;
          p_notes?: string | null;
        };
        Returns: string;
      };
      crm_set_prospect_green: { Args: { p_prospect_id: string }; Returns: undefined };
      crm_pick_round_robin_sales: { Args: { p_branch_id: string }; Returns: string | null };
      crm_pick_round_robin_sales_excluding: { Args: { p_branch_id: string; p_exclude_sales_id: string }; Returns: string | null };
      crm_pick_round_robin_sales_or_freelance: {
        Args: { p_branch_id: string; p_project_id: string | null };
        Returns: { recipient_type: string; recipient_id: string; full_name: string; phone: string | null }[];
      };
      crm_record_payment: {
        Args: {
          p_prospect_id: string;
          p_payment_type: PaymentTypeDb;
          p_amount: number;
          p_payment_date: string;
          p_notes?: string | null;
        };
        Returns: string;
      };
      crm_approve_payment: { Args: { p_payment_id: string }; Returns: undefined };
      loonars_closing_verify: { Args: { p_id: string }; Returns: undefined };
      loonars_closing_reject: { Args: { p_id: string; p_reason?: string | null }; Returns: undefined };
      loonars_fee_request: { Args: { p_id: string; p_fee_amount: number }; Returns: undefined };
      loonars_unit_purchase_submit: {
        Args: {
          p_unit_id: string;
          p_buyer_name: string;
          p_nik?: string | null;
          p_phone?: string | null;
          p_address?: string | null;
          p_transaction_type?: string;
          p_payment_method?: string;
          p_price?: number | null;
          p_booking_fee?: number | null;
          p_dp_amount?: number | null;
          p_pelunasan_amount?: number | null;
          p_handover_date?: string | null;
          p_notes?: string | null;
        };
        Returns: string;
      };
      loonars_unit_purchase_verify: { Args: { p_id: string }; Returns: undefined };
      loonars_unit_purchase_reject: { Args: { p_id: string; p_reason?: string | null }; Returns: undefined };
      loonars_unit_fee_request: { Args: { p_purchase_id: string; p_fee_amount: number; p_phone?: string | null }; Returns: string };
      loonars_unit_fee_decide: { Args: { p_id: string; p_approve: boolean; p_reason?: string | null }; Returns: undefined };
      loonars_siteplan_image_save: {
        Args: { p_project_id: string; p_image_path: string; p_image_width?: number | null; p_image_height?: number | null };
        Returns: string;
      };
      loonars_unit_position_upsert: { Args: { p_unit_id: string; p_x_pct: number; p_y_pct: number }; Returns: string };
      crm_reject_payment: { Args: { p_payment_id: string; p_reason?: string | null }; Returns: undefined };
      crm_review_sp1_warning: { Args: { p_id: string; p_decision: string; p_note?: string | null }; Returns: undefined };
      markom_request_ads_research: { Args: { p_project_id: string; p_branch_id: string }; Returns: undefined };
      loonars_beauty_request_weekly_evaluation: { Args: Record<PropertyKey, never>; Returns: undefined };
      markom_request_leasehold_competitor_comparison: { Args: Record<PropertyKey, never>; Returns: undefined };
      markom_request_competitor_discovery: { Args: { p_focus: string }; Returns: undefined };
      markom_request_monthly_report: { Args: Record<PropertyKey, never>; Returns: undefined };
      markom_request_hashtag_bank_refresh: { Args: { p_focus: string; p_platform: string }; Returns: undefined };
      loonars_beauty_request_competitor_comparison: { Args: Record<PropertyKey, never>; Returns: undefined };
      loonars_beauty_request_content_ideas: { Args: Record<PropertyKey, never>; Returns: undefined };
      loonars_beauty_request_weekly_content_audit: { Args: Record<PropertyKey, never>; Returns: undefined };
      create_payroll_run: {
        Args: { p_branch_id: string; p_period_month: number; p_period_year: number };
        Returns: string;
      };
      approve_payroll_run: { Args: { p_payroll_run_id: string; p_items: Json }; Returns: undefined };
      submit_employee_salary: {
        Args: {
          p_employee_id: string;
          p_period_month: number;
          p_period_year: number;
          p_amount: number;
          p_bank_name: string | null;
          p_bank_account_number: string;
          p_bank_account_holder: string | null;
          p_note?: string | null;
          p_separate_schedule?: boolean | null;
        };
        Returns: string;
      };
      mark_salary_transferred: { Args: { p_id: string }; Returns: undefined };
      send_salary_transfer_summary: { Args: { p_branch_id?: string | null }; Returns: number };
      construction_submit_expense: {
        Args: {
          p_project_id: string;
          p_expense_type: string;
          p_party_name: string;
          p_amount: number;
          p_description?: string | null;
          p_expense_date?: string;
          p_photo_url?: string | null;
          p_material_id?: string | null;
          p_quantity?: number | null;
          p_fulfills_pr_id?: string | null;
        };
        Returns: string;
      };
      construction_settle_expense: { Args: { p_id: string }; Returns: undefined };
      cm_seed_project_wbs: { Args: { p_project_id: string; p_template_id: string; p_unit_id?: string | null }; Returns: undefined };
      cm_submit_wbs_progress: {
        Args: { p_project_wbs_id: string; p_progress_pct: number; p_photo_url?: string | null; p_note?: string | null };
        Returns: string;
      };
      cm_decide_wbs_progress: { Args: { p_log_id: string; p_approve: boolean; p_reject_reason?: string | null }; Returns: undefined };
      cm_project_overall_progress: { Args: { p_project_id: string }; Returns: number };
      cm_seed_project_boq: { Args: { p_project_id: string; p_template_id: string; p_unit_id?: string | null }; Returns: undefined };
      cm_adjust_boq_line: { Args: { p_line_id: string; p_quantity: number; p_unit_price: number }; Returns: undefined };
      cm_boq_summary: { Args: { p_project_id: string }; Returns: { category: string; total_budget: number }[] };
      cm_material_requirement: {
        Args: { p_project_id: string };
        Returns: {
          material_id: string;
          material_name: string;
          unit_satuan: string;
          boq_quantity: number;
          wbs_name: string | null;
          wbs_progress_pct: number;
          required_quantity: number;
          stock_quantity: number;
          coverage_pct: number | null;
          status: "belum_perlu" | "shortage" | "normal" | "overstock_risk" | "excessive";
        }[];
      };
      cm_submit_purchase_request: {
        Args: { p_project_id: string; p_material_id: string; p_requested_quantity: number; p_reason?: string | null };
        Returns: string;
      };
      cm_decide_purchase_request: { Args: { p_id: string; p_approve: boolean; p_reason?: string | null }; Returns: undefined };
      cm_create_contractor: {
        Args: { p_full_name: string; p_contractor_type?: string; p_phone?: string | null; p_bank_account?: string | null };
        Returns: string;
      };
      cm_create_labor_contract: {
        Args: {
          p_project_id: string;
          p_contractor_id: string;
          p_contract_value: number;
          p_retention_pct?: number;
          p_start_date?: string;
          p_target_completion?: string | null;
          p_notes?: string | null;
          p_attachment_url?: string | null;
          p_unit_id?: string | null;
        };
        Returns: string;
      };
      cm_kepala_cabang_decide_labor_payment: { Args: { p_payment_id: string; p_approve: boolean; p_reason?: string | null }; Returns: undefined };
      cm_set_labor_contract_weights: { Args: { p_contract_id: string; p_weights: Json }; Returns: undefined };
      cm_labor_contract_summary: {
        Args: { p_contract_id: string };
        Returns: {
          contract_value: number;
          cumulative_earned: number;
          cumulative_paid: number;
          payable: number;
          outstanding_advance: number;
          status: "normal" | "overpayment";
        }[];
      };
      cm_generate_labor_payment: { Args: { p_contract_id: string; p_period_start: string; p_period_end: string }; Returns: string };
      cm_add_labor_deduction: { Args: { p_payment_id: string; p_amount: number; p_category: string; p_reason: string }; Returns: undefined };
      cm_apply_labor_advance: { Args: { p_contract_id: string; p_amount: number; p_note?: string | null }; Returns: string };
      cm_approve_labor_payment: { Args: { p_payment_id: string }; Returns: string };
      cm_project_cost_control: {
        Args: { p_project_id: string };
        Returns: {
          budget: number;
          boq_committed: number;
          labor_committed: number;
          actual_total: number;
          actual_material: number;
          actual_labor: number;
          actual_other: number;
          progress_pct: number;
          cost_pct: number | null;
          cost_vs_progress_status: "unknown" | "cost_ahead" | "good" | "balanced";
        }[];
      };
      cm_reject_labor_payment: { Args: { p_payment_id: string; p_reason?: string | null }; Returns: undefined };
      cm_labor_payment_ai_context: { Args: { p_payment_id: string }; Returns: Json };
      cm_save_labor_payment_ai_review: {
        Args: { p_payment_id: string; p_verdict: string; p_summary: string; p_concerns: string[]; p_photo_count: number };
        Returns: undefined;
      };
      construction_record_fund_transfer: {
        Args: {
          p_project_id: string;
          p_amount: number;
          p_transfer_date?: string;
          p_note?: string | null;
        };
        Returns: string;
      };
      construction_create_project: {
        Args: { p_branch_id: string; p_name: string; p_budget_per_unit: number; p_total_units: number };
        Returns: string;
      };
      cm_add_project_boq_line: {
        Args: {
          p_project_id: string;
          p_category: string;
          p_description: string;
          p_quantity: number;
          p_unit: string;
          p_unit_price: number;
          p_material_id?: string | null;
          p_project_wbs_id?: string | null;
          p_unit_id?: string | null;
        };
        Returns: string;
      };
      cm_delete_project_boq_line: { Args: { p_line_id: string }; Returns: undefined };
      create_hr_expense: {
        Args: {
          p_expense_type: string;
          p_employee_id: string;
          p_branch_id: string;
          p_amount: number;
          p_expense_date: string;
          p_description: string;
        };
        Returns: string;
      };
      approve_hr_expense: { Args: { p_id: string }; Returns: undefined };
      reject_hr_expense: { Args: { p_id: string; p_reason?: string | null }; Returns: undefined };
      sync_dispatch_pending: { Args: Record<string, never>; Returns: undefined };
      sync_collect_responses: { Args: Record<string, never>; Returns: undefined };
      get_sync_secret: { Args: Record<string, never>; Returns: string };
      crm_upsert_sales_target: {
        Args: {
          p_sales_id: string;
          p_period_month: number;
          p_period_year: number;
          p_target_units: number;
          p_commission_percent: number;
        };
        Returns: string;
      };
      crm_set_branch_target: {
        Args: {
          p_branch_id: string;
          p_period_month: number;
          p_period_year: number;
          p_target_units: number;
          p_selling_price_per_unit: number;
          p_commission_percent: number;
        };
        Returns: { branch_target_id: string; distributed_count: number }[];
      };
      crm_upsert_product: {
        Args: {
          p_id?: string | null;
          p_product_name: string;
          p_category?: string | null;
          p_unit?: string;
          p_default_price?: number;
          p_default_commission?: number;
          p_status?: string;
        };
        Returns: string;
      };
      crm_set_product_sales_assignment: {
        Args: { p_product_id: string; p_sales_id: string; p_assigned: boolean };
        Returns: undefined;
      };
      crm_save_and_distribute_target: {
        Args: { p_branch_id: string; p_period_month: number; p_period_year: number; p_details: Json };
        Returns: { header_id: string; distributed_count: number; total_target_units: number; total_target_revenue: number }[];
      };
      crm_sales_stats: {
        Args: { p_sales_id?: string | null; p_month?: number | null; p_year?: number | null };
        Returns: {
          sales_id: string;
          period_month: number;
          period_year: number;
          target_units: number;
          selling_price_per_unit: number;
          commission_percent: number;
          target_revenue: number;
          max_commission: number;
          closing_units: number;
          achievement_percent: number;
          remaining_target: number;
          collection: number | null;
          estimated_commission: number | null;
          verified_commission: number | null;
          prospects_red: number;
          prospects_yellow: number;
          prospects_green: number;
          prospects_closing: number;
          today_prospect: number;
          today_follow_up: number;
          late_follow_up: number;
        }[];
      };
      crm_branch_stats: {
        Args: { p_branch_id?: string | null; p_month?: number | null; p_year?: number | null };
        Returns: {
          branch_id: string;
          period_month: number;
          period_year: number;
          target_units: number;
          target_revenue: number;
          closing_units: number;
          achievement_percent: number;
          collection: number | null;
          active_sales_count: number;
          pending_finance_verification: number;
          prospects_red: number;
          prospects_yellow: number;
          prospects_green: number;
          prospects_closing: number;
          sales_performance: Json;
        }[];
      };
      crm_national_stats: {
        Args: { p_month?: number | null; p_year?: number | null };
        Returns: {
          period_month: number;
          period_year: number;
          total_prospects: number;
          prospects_red: number;
          prospects_yellow: number;
          prospects_green: number;
          prospects_closing: number;
          conversion_percent: number;
          total_target_units: number;
          total_target_revenue: number;
          total_closing_units: number;
          achievement_percent: number;
          collection: number;
          monthly_growth_percent: number | null;
          pending_finance_verification: number;
          branch_ranking: Json;
          top_sales: Json;
        }[];
      };
      crm_sales_ranking: {
        Args: { p_month?: number | null; p_year?: number | null; p_branch_id?: string | null };
        Returns: {
          rank: number;
          sales_id: string;
          full_name: string;
          branch_name: string;
          target_units: number;
          closing_units: number;
          achievement_percent: number;
          collection: number | null;
        }[];
      };
      crm_conversion_analytics: {
        Args: { p_branch_id?: string | null; p_month?: number | null; p_year?: number | null };
        Returns: {
          total_prospects: number;
          total_closing: number;
          conversion_percent: number;
          avg_follow_up_days: number | null;
          avg_closing_days: number | null;
          lead_source_performance: Json;
        }[];
      };
      crm_monthly_trend: {
        Args: { p_months_back?: number; p_branch_id?: string | null; p_sales_id?: string | null };
        Returns: {
          period_month: number;
          period_year: number;
          target_units: number;
          closing_units: number;
          achievement_percent: number;
          collection: number | null;
        }[];
      };
      kpi_assign_tasks: {
        Args: {
          p_branch_id: string;
          p_period_year: number;
          p_period_month: number;
          p_period_week: number;
          p_items: Json;
          p_division_id?: string | null;
        };
        Returns: string[];
      };
      kpi_update_task: {
        Args: { p_task_id: string; p_title: string; p_description: string | null; p_due_date: string | null };
        Returns: undefined;
      };
      kpi_delete_task: {
        Args: { p_task_id: string };
        Returns: undefined;
      };
      kpi_complete_task: {
        Args: { p_task_id: string };
        Returns: undefined;
      };
      kpi_submit_obstacle_response: {
        Args: { p_task_id: string; p_response: string };
        Returns: undefined;
      };
      kpi_apply_ai_response: {
        Args: { p_task_id: string; p_action: string; p_new_title: string | null; p_new_description: string | null; p_ai_guidance: string };
        Returns: undefined;
      };
      ai_circuit_breaker_check: {
        Args: { p_provider: string; p_open_cooldown_ms?: number };
        Returns: Json;
      };
      ai_circuit_breaker_report: {
        Args: { p_provider: string; p_success: boolean; p_failure_threshold?: number };
        Returns: Json;
      };
      ai_job_dispatch_pending: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      kpi_verify_task: {
        Args: { p_task_id: string; p_status: string; p_notes?: string | null };
        Returns: undefined;
      };
      kpi_team_stats: {
        Args: { p_branch_id?: string | null; p_month?: number | null; p_year?: number | null; p_division_id?: string | null };
        Returns: {
          branch_id: string;
          branch_name: string;
          division_id: string;
          period_month: number;
          period_year: number;
          current_week: number;
          team_members: Json;
          weekly_total: number;
          weekly_completed: number;
          weekly_remaining: number;
          weekly_achievement_percent: number;
          monthly_total: number;
          monthly_completed: number;
          monthly_remaining: number;
          monthly_achievement_percent: number;
          overdue_count: number;
          waiting_review_count: number;
        }[];
      };
      kpi_national_stats: {
        Args: { p_month?: number | null; p_year?: number | null; p_division_id?: string | null };
        Returns: {
          period_month: number;
          period_year: number;
          current_week: number;
          team_count: number;
          monthly_total: number;
          monthly_completed: number;
          monthly_achievement_percent: number;
          overdue_count: number;
          branch_ranking: Json;
        }[];
      };
      kpi_ranking: {
        Args: {
          p_scope?: string;
          p_month?: number | null;
          p_year?: number | null;
          p_week?: number | null;
          p_branch_id?: string | null;
          p_division_id?: string | null;
        };
        Returns: {
          rank: number;
          branch_id: string;
          branch_name: string;
          team_members: Json;
          assigned: number;
          completed: number;
          rejected: number;
          achievement_percent: number;
        }[];
      };
    };
    Enums: Record<string, never>;
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Update"];
export type Views<T extends keyof Database["public"]["Views"]> = Database["public"]["Views"][T]["Row"];
