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
  | "ad_campaign_failed";
export type NotificationStatusDb = "unread" | "read" | "archived";
export type AuditActionDb = "INSERT" | "UPDATE" | "DELETE";
export type ProspectStatusDb = "red" | "yellow" | "green" | "closing" | "inactive";
export type LeadSourceDb = "facebook_ads" | "instagram" | "tiktok" | "walk_in" | "referral" | "whatsapp" | "marketplace" | "other";
export type FollowUpActivityTypeDb = "phone_call" | "whatsapp" | "meeting" | "survey" | "video_call" | "site_visit" | "negotiation";
export type PaymentTypeDb = "booking_fee" | "dp" | "installment" | "bank_disbursement";
export type PaymentStatusDb = "pending" | "approved" | "rejected";
export type CrmProjectTypeDb = "commercial" | "subsidized" | "villa" | "land";
export type CrmProjectStatusDb = "planning" | "selling" | "completed";
export type KpiTaskStatusDb = "pending" | "completed" | "rejected";
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
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["branches"]["Insert"]>;
        Relationships: [];
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
      crm_projects: {
        Row: {
          id: string;
          name: string;
          city: string | null;
          branch_id: string;
          project_type: CrmProjectTypeDb;
          status: CrmProjectStatusDb;
          start_date: string | null;
          target_launch_date: string | null;
          is_active: boolean;
          mkh_project_code: string | null;
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
          status?: CrmProjectStatusDb;
          start_date?: string | null;
          target_launch_date?: string | null;
          is_active?: boolean;
          mkh_project_code?: string | null;
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
          daily_budget_idr: number;
          status: "active" | "paused" | "ended" | "failed";
          launched_by: "ai" | "human";
          research_summary: string | null;
          failure_reason: string | null;
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
          daily_budget_idr: number;
          status?: "active" | "paused" | "ended" | "failed";
          launched_by?: "ai" | "human";
          research_summary?: string | null;
          failure_reason?: string | null;
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
          job_type: "whatsapp_ai_reply" | "crm_sp1_draft" | "markom_checklist_draft" | "meta_ads_launch";
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
          job_type: "whatsapp_ai_reply" | "crm_sp1_draft" | "markom_checklist_draft" | "meta_ads_launch";
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
          connector: "whatsapp";
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
          connector: "whatsapp";
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
          completed_at: string | null;
          verified_by: string | null;
          notes: string | null;
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
          completed_at?: string | null;
          verified_by?: string | null;
          notes?: string | null;
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
      app_current_role_key: { Args: Record<string, never>; Returns: string };
      app_current_branch_id: { Args: Record<string, never>; Returns: string };
      app_has_permission: { Args: { p_permission_key: string }; Returns: boolean };
      app_is_super_admin: { Args: Record<string, never>; Returns: boolean };
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
      crm_reject_payment: { Args: { p_payment_id: string; p_reason?: string | null }; Returns: undefined };
      crm_review_sp1_warning: { Args: { p_id: string; p_decision: string; p_note?: string | null }; Returns: undefined };
      create_payroll_run: {
        Args: { p_branch_id: string; p_period_month: number; p_period_year: number };
        Returns: string;
      };
      approve_payroll_run: { Args: { p_payroll_run_id: string; p_items: Json }; Returns: undefined };
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
          collection: number;
          estimated_commission: number;
          verified_commission: number;
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
          collection: number;
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
          collection: number;
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
          collection: number;
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
