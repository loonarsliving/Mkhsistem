/**
 * Hand-authored mirror of the Supabase schema (supabase/migrations/*.sql).
 * Regenerate with `npm run supabase:types` once the project is linked to a
 * live Supabase instance; keep this file as the checked-in fallback so the
 * app type-checks without network access to Supabase.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AttendanceStatusDb = "hadir" | "terlambat" | "izin" | "sakit" | "alpha";
export type LeaveTypeDb = "izin" | "sakit";
export type LeaveStatusDb = "pending" | "approved" | "rejected";
export type EmploymentStatusDb = "active" | "inactive" | "on_leave" | "terminated";
export type MemoPriorityDb = "low" | "normal" | "high" | "urgent";
export type TargetTypeDb = "all_branch" | "branch" | "all_division" | "division" | "position" | "user";
export type NotificationTypeDb = "memo" | "announcement" | "attendance" | "leave_request" | "system";
export type AuditActionDb = "INSERT" | "UPDATE" | "DELETE";

interface AuditColumns {
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

interface SoftDeleteColumns {
  deleted_at: string | null;
}

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
        } & AuditColumns;
        Insert: Partial<AuditColumns> & {
          id?: string;
          key: string;
          name: string;
          level?: number;
          description?: string | null;
          is_system?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["roles"]["Insert"]>;
      };
      permissions: {
        Row: { id: string; key: string; description: string | null; created_at: string };
        Insert: { id?: string; key: string; description?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["permissions"]["Insert"]>;
      };
      role_permissions: {
        Row: { role_id: string; permission_id: string; created_at: string };
        Insert: { role_id: string; permission_id: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["role_permissions"]["Insert"]>;
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
        } & AuditColumns &
          SoftDeleteColumns;
        Insert: Partial<AuditColumns & SoftDeleteColumns> & {
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
        };
        Update: Partial<Database["public"]["Tables"]["branches"]["Insert"]>;
      };
      divisions: {
        Row: {
          id: string;
          branch_id: string | null;
          code: string | null;
          name: string;
          description: string | null;
          is_active: boolean;
        } & AuditColumns &
          SoftDeleteColumns;
        Insert: Partial<AuditColumns & SoftDeleteColumns> & {
          id?: string;
          branch_id?: string | null;
          code?: string | null;
          name: string;
          description?: string | null;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["divisions"]["Insert"]>;
      };
      positions: {
        Row: {
          id: string;
          code: string | null;
          name: string;
          level: number;
          description: string | null;
          is_active: boolean;
        } & AuditColumns &
          SoftDeleteColumns;
        Insert: Partial<AuditColumns & SoftDeleteColumns> & {
          id?: string;
          code?: string | null;
          name: string;
          level?: number;
          description?: string | null;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["positions"]["Insert"]>;
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
        } & AuditColumns &
          SoftDeleteColumns;
        Insert: Partial<AuditColumns & SoftDeleteColumns> & {
          id: string;
          employee_code: string;
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
        };
        Update: Partial<Database["public"]["Tables"]["employees"]["Insert"]>;
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
        } & AuditColumns &
          SoftDeleteColumns;
        Insert: Partial<AuditColumns & SoftDeleteColumns> & {
          id?: string;
          branch_id?: string | null;
          name: string;
          start_time?: string;
          end_time?: string;
          late_tolerance_minutes?: number;
          work_days?: number[];
          is_default?: boolean;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["work_schedules"]["Insert"]>;
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
        } & AuditColumns &
          SoftDeleteColumns;
        Insert: Partial<AuditColumns & SoftDeleteColumns> & {
          id?: string;
          user_id: string;
          branch_id: string;
          work_schedule_id?: string | null;
          attendance_date?: string;
          status?: AttendanceStatusDb;
          [key: string]: unknown;
        };
        Update: Partial<Database["public"]["Tables"]["attendance"]["Insert"]>;
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
        } & AuditColumns &
          SoftDeleteColumns;
        Insert: Partial<AuditColumns & SoftDeleteColumns> & {
          id?: string;
          user_id: string;
          type: LeaveTypeDb;
          start_date: string;
          end_date: string;
          reason: string;
          attachment_url?: string | null;
          status?: LeaveStatusDb;
        };
        Update: Partial<Database["public"]["Tables"]["leave_requests"]["Insert"]>;
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
        } & AuditColumns &
          SoftDeleteColumns;
        Insert: Partial<AuditColumns & SoftDeleteColumns> & {
          id?: string;
          title: string;
          content: string;
          priority?: MemoPriorityDb;
          is_pinned?: boolean;
          is_mandatory_read?: boolean;
          published_at?: string;
          expires_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["memos"]["Insert"]>;
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
      };
      memo_targets: {
        Row: { id: string; memo_id: string; target_type: TargetTypeDb; target_id: string | null; created_at: string };
        Insert: { id?: string; memo_id: string; target_type: TargetTypeDb; target_id?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["memo_targets"]["Insert"]>;
      };
      memo_reads: {
        Row: { memo_id: string; user_id: string; read_at: string };
        Insert: { memo_id: string; user_id: string; read_at?: string };
        Update: Partial<Database["public"]["Tables"]["memo_reads"]["Insert"]>;
      };
      announcement_categories: {
        Row: { id: string; name: string; color: string } & AuditColumns;
        Insert: Partial<AuditColumns> & { id?: string; name: string; color?: string };
        Update: Partial<Database["public"]["Tables"]["announcement_categories"]["Insert"]>;
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
        } & AuditColumns &
          SoftDeleteColumns;
        Insert: Partial<AuditColumns & SoftDeleteColumns> & {
          id?: string;
          category_id?: string | null;
          title: string;
          content: string;
          is_pinned?: boolean;
          published_at?: string;
          expires_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["announcements"]["Insert"]>;
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
      };
      notifications: {
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
        Update: Partial<Database["public"]["Tables"]["notifications"]["Insert"]>;
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
        Insert: never;
        Update: never;
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
        Insert: Partial<Database["public"]["Tables"]["company_settings"]["Row"]> & { id?: string };
        Update: Partial<Database["public"]["Tables"]["company_settings"]["Row"]>;
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
        };
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
      };
      v_memo_read_stats: {
        Row: { memo_id: string; audience_count: number; read_count: number };
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
      mark_memo_read: { Args: { p_memo_id: string }; Returns: void };
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
      mark_notification_read: { Args: { p_notification_id: string }; Returns: void };
      mark_all_notifications_read: { Args: Record<string, never>; Returns: void };
      get_memo_audience: { Args: { p_memo_id: string }; Returns: { user_id: string }[] };
      get_announcement_audience: { Args: { p_announcement_id: string }; Returns: { user_id: string }[] };
    };
    Enums: Record<string, never>;
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Update"];
export type Views<T extends keyof Database["public"]["Views"]> = Database["public"]["Views"][T]["Row"];
