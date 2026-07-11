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
  | "kpi_task";
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
          title: string;
          body: string | null;
          link: string | null;
          is_read: boolean;
          read_at: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: NotificationTypeDb;
          title: string;
          body?: string | null;
          link?: string | null;
          is_read?: boolean;
          read_at?: string | null;
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
      sales_targets: {
        Row: {
          id: string;
          sales_id: string;
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
