export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_cashflow_intelligence_bank: {
        Row: {
          content: string
          created_at: string
          id: string
          researched_at: string
          title: string
          topic: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          researched_at?: string
          title: string
          topic: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          researched_at?: string
          title?: string
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_circuit_breaker_state: {
        Row: {
          consecutive_failures: number
          last_failure_at: string | null
          last_success_at: string | null
          opened_at: string | null
          provider: string
          state: string
          updated_at: string
        }
        Insert: {
          consecutive_failures?: number
          last_failure_at?: string | null
          last_success_at?: string | null
          opened_at?: string | null
          provider: string
          state?: string
          updated_at?: string
        }
        Update: {
          consecutive_failures?: number
          last_failure_at?: string | null
          last_success_at?: string | null
          opened_at?: string | null
          provider?: string
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          connector: string
          created_at: string
          employee_id: string | null
          id: string
          inbound_text: string
          reply_text: string | null
          sender: string
        }
        Insert: {
          connector: string
          created_at?: string
          employee_id?: string | null
          id?: string
          inbound_text: string
          reply_text?: string | null
          sender: string
        }
        Update: {
          connector?: string
          created_at?: string
          employee_id?: string | null
          id?: string
          inbound_text?: string
          reply_text?: string | null
          sender?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_conversations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ai_conversations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_integration_logs: {
        Row: {
          connector: string
          created_at: string
          direction: string
          error: string | null
          id: string
          latency_ms: number | null
          payload: Json
          response_status: number | null
          status: string
        }
        Insert: {
          connector: string
          created_at?: string
          direction: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          payload: Json
          response_status?: number | null
          status: string
        }
        Update: {
          connector?: string
          created_at?: string
          direction?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          payload?: Json
          response_status?: number | null
          status?: string
        }
        Relationships: []
      }
      ai_investor_intelligence_bank: {
        Row: {
          content: string
          created_at: string
          id: string
          researched_at: string
          title: string
          topic: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          researched_at?: string
          title: string
          topic: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          researched_at?: string
          title?: string
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_job_queue: {
        Row: {
          attempt_count: number
          created_at: string
          id: string
          job_type: string
          last_error: string | null
          max_attempts: number
          next_attempt_at: string
          payload: Json
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          id?: string
          job_type: string
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload: Json
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          id?: string
          job_type?: string
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload?: Json
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_knowledge_bank: {
        Row: {
          content: string
          created_at: string
          id: string
          product_line: string
          researched_at: string
          title: string
          topic: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          product_line: string
          researched_at?: string
          title: string
          topic: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          product_line?: string
          researched_at?: string
          title?: string
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_occupancy_intelligence_bank: {
        Row: {
          content: string
          created_at: string
          id: string
          researched_at: string
          title: string
          topic: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          researched_at?: string
          title: string
          topic: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          researched_at?: string
          title?: string
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_request_telemetry: {
        Row: {
          attempt: number
          circuit_state: string | null
          created_at: string
          error_body: string | null
          http_status: number | null
          id: string
          job_id: string | null
          max_attempts: number
          model: string
          outcome: string
          provider: string
          response_time_ms: number | null
          wait_ms: number | null
        }
        Insert: {
          attempt: number
          circuit_state?: string | null
          created_at?: string
          error_body?: string | null
          http_status?: number | null
          id?: string
          job_id?: string | null
          max_attempts: number
          model: string
          outcome: string
          provider: string
          response_time_ms?: number | null
          wait_ms?: number | null
        }
        Update: {
          attempt?: number
          circuit_state?: string | null
          created_at?: string
          error_body?: string | null
          http_status?: number | null
          id?: string
          job_id?: string | null
          max_attempts?: number
          model?: string
          outcome?: string
          provider?: string
          response_time_ms?: number | null
          wait_ms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_request_telemetry_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "ai_job_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_system_prompts: {
        Row: {
          content: string
          key: string
          label: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content: string
          key: string
          label: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: string
          key?: string
          label?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_system_prompts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_system_prompts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ai_system_prompts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_attachments: {
        Row: {
          announcement_id: string
          created_at: string
          created_by: string | null
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          mime_type: string | null
        }
        Insert: {
          announcement_id: string
          created_at?: string
          created_by?: string | null
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          mime_type?: string | null
        }
        Update: {
          announcement_id?: string
          created_at?: string
          created_by?: string | null
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          mime_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcement_attachments_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_attachments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_attachments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "announcement_attachments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_categories: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      announcement_targets: {
        Row: {
          announcement_id: string
          created_at: string
          id: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          announcement_id: string
          created_at?: string
          id?: string
          target_id?: string | null
          target_type: string
        }
        Update: {
          announcement_id?: string
          created_at?: string
          id?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_targets_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          category_id: string | null
          content: string
          created_at: string
          created_by: string
          deleted_at: string | null
          expires_at: string | null
          id: string
          is_pinned: boolean
          published_at: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category_id?: string | null
          content: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          is_pinned?: boolean
          published_at?: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category_id?: string | null
          content?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          is_pinned?: boolean
          published_at?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcements_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "announcement_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "announcements_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_followups: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          due_date: string | null
          id: string
          notes: string | null
          owner_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          owner_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          owner_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_followups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_followups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "assistant_followups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          attendance_date: string
          branch_id: string
          check_in_distance_meters: number | null
          check_in_latitude: number | null
          check_in_longitude: number | null
          check_in_note: string | null
          check_in_photo_url: string | null
          check_in_time: string | null
          check_in_within_radius: boolean | null
          check_out_distance_meters: number | null
          check_out_latitude: number | null
          check_out_longitude: number | null
          check_out_note: string | null
          check_out_photo_url: string | null
          check_out_time: string | null
          check_out_within_radius: boolean | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          leave_request_id: string | null
          status: string
          updated_at: string
          updated_by: string | null
          user_id: string
          work_duration_minutes: number | null
          work_schedule_id: string | null
        }
        Insert: {
          attendance_date?: string
          branch_id: string
          check_in_distance_meters?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_note?: string | null
          check_in_photo_url?: string | null
          check_in_time?: string | null
          check_in_within_radius?: boolean | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_note?: string | null
          check_out_photo_url?: string | null
          check_out_time?: string | null
          check_out_within_radius?: boolean | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          leave_request_id?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
          work_duration_minutes?: number | null
          work_schedule_id?: string | null
        }
        Update: {
          attendance_date?: string
          branch_id?: string
          check_in_distance_meters?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_note?: string | null
          check_in_photo_url?: string | null
          check_in_time?: string | null
          check_in_within_radius?: boolean | null
          check_out_distance_meters?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_note?: string | null
          check_out_photo_url?: string | null
          check_out_time?: string | null
          check_out_within_radius?: boolean | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          leave_request_id?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          work_duration_minutes?: number | null
          work_schedule_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_leave_request_id_fkey"
            columns: ["leave_request_id"]
            isOneToOne: false
            referencedRelation: "leave_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_work_schedule_id_fkey"
            columns: ["work_schedule_id"]
            isOneToOne: false
            referencedRelation: "work_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      automation_config: {
        Row: {
          app_base_url: string
          cron_secret: string
          id: boolean
          updated_at: string
        }
        Insert: {
          app_base_url?: string
          cron_secret?: string
          id?: boolean
          updated_at?: string
        }
        Update: {
          app_base_url?: string
          cron_secret?: string
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      automation_dispatch_log: {
        Row: {
          dispatched_at: string
          error_msg: string | null
          id: string
          path: string
          request_id: number
          resolved_at: string | null
          status_code: number | null
          timed_out: boolean | null
        }
        Insert: {
          dispatched_at?: string
          error_msg?: string | null
          id?: string
          path: string
          request_id: number
          resolved_at?: string | null
          status_code?: number | null
          timed_out?: boolean | null
        }
        Update: {
          dispatched_at?: string
          error_msg?: string | null
          id?: string
          path?: string
          request_id?: number
          resolved_at?: string | null
          status_code?: number | null
          timed_out?: boolean | null
        }
        Relationships: []
      }
      bookings: {
        Row: {
          catatan: string | null
          checkin_at: string | null
          checkin_by: string | null
          checkout_at: string | null
          checkout_by: string | null
          created_at: string | null
          durasi_malam: number | null
          guest_id: string | null
          guest_nama: string
          id: string
          status: string | null
          sumber: string | null
          tarif: number
          tgl_checkin: string
          tgl_checkout: string | null
          tipe: string
          total_bayar: number | null
          unit_id: string
          unit_nomor: string
          updated_at: string | null
        }
        Insert: {
          catatan?: string | null
          checkin_at?: string | null
          checkin_by?: string | null
          checkout_at?: string | null
          checkout_by?: string | null
          created_at?: string | null
          durasi_malam?: number | null
          guest_id?: string | null
          guest_nama: string
          id?: string
          status?: string | null
          sumber?: string | null
          tarif: number
          tgl_checkin: string
          tgl_checkout?: string | null
          tipe: string
          total_bayar?: number | null
          unit_id: string
          unit_nomor: string
          updated_at?: string | null
        }
        Update: {
          catatan?: string | null
          checkin_at?: string | null
          checkin_by?: string | null
          checkout_at?: string | null
          checkout_by?: string | null
          created_at?: string | null
          durasi_malam?: number | null
          guest_id?: string | null
          guest_nama?: string
          id?: string
          status?: string | null
          sumber?: string | null
          tarif?: number
          tgl_checkin?: string
          tgl_checkout?: string | null
          tipe?: string
          total_bayar?: number | null
          unit_id?: string
          unit_nomor?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_sales_targets: {
        Row: {
          branch_id: string
          commission_percent: number
          created_at: string
          created_by: string | null
          id: string
          period_month: number
          period_year: number
          selling_price_per_unit: number
          target_units: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          branch_id: string
          commission_percent?: number
          created_at?: string
          created_by?: string | null
          id?: string
          period_month: number
          period_year: number
          selling_price_per_unit?: number
          target_units?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          branch_id?: string
          commission_percent?: number
          created_at?: string
          created_by?: string | null
          id?: string
          period_month?: number
          period_year?: number
          selling_price_per_unit?: number
          target_units?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branch_sales_targets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          city: string | null
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          is_head_office: boolean
          latitude: number | null
          longitude: number | null
          name: string
          phone: string | null
          radius_meters: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_head_office?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          phone?: string | null
          radius_meters?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_head_office?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          phone?: string | null
          radius_meters?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          company_address: string | null
          company_logo_url: string | null
          company_name: string
          default_radius_meters: number
          id: string
          timezone: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_address?: string | null
          company_logo_url?: string | null
          company_name?: string
          default_radius_meters?: number
          id?: string
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_address?: string | null
          company_logo_url?: string | null
          company_name?: string
          default_radius_meters?: number
          id?: string
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      crm_product_sales_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          product_id: string
          sales_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          product_id: string
          sales_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          product_id?: string
          sales_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_product_sales_assignments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "crm_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_product_sales_assignments_sales_id_fkey"
            columns: ["sales_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_product_sales_assignments_sales_id_fkey"
            columns: ["sales_id"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "crm_product_sales_assignments_sales_id_fkey"
            columns: ["sales_id"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_products: {
        Row: {
          category: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          default_commission: number
          default_price: number
          id: string
          product_name: string
          status: string
          unit: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          default_commission?: number
          default_price?: number
          id?: string
          product_name: string
          status?: string
          unit?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          default_commission?: number
          default_price?: number
          id?: string
          product_name?: string
          status?: string
          unit?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      crm_project_photos: {
        Row: {
          caption: string | null
          created_at: string
          deleted_at: string | null
          id: string
          media_type: string
          project_id: string
          public_url: string
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          media_type?: string
          project_id: string
          public_url: string
          storage_path: string
          uploaded_by: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          media_type?: string
          project_id?: string
          public_url?: string
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_project_photos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "crm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_project_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_project_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "crm_project_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_projects: {
        Row: {
          branch_id: string
          city: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          mkh_project_code: string | null
          name: string
          offering_type: string
          product_description: string | null
          project_type: string
          start_date: string | null
          status: string
          target_launch_date: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          branch_id: string
          city?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          mkh_project_code?: string | null
          name: string
          offering_type?: string
          product_description?: string | null
          project_type?: string
          start_date?: string | null
          status?: string
          target_launch_date?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          branch_id?: string
          city?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          mkh_project_code?: string | null
          name?: string
          offering_type?: string
          product_description?: string | null
          project_type?: string
          start_date?: string | null
          status?: string
          target_launch_date?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_projects_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_promo_sends: {
        Row: {
          created_at: string
          error: string | null
          id: string
          message_body: string
          prospect_id: string
          sent_at: string | null
          status: string
          template_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          message_body: string
          prospect_id: string
          sent_at?: string | null
          status?: string
          template_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          message_body?: string
          prospect_id?: string
          sent_at?: string | null
          status?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_promo_sends_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_promo_sends_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "crm_promo_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_promo_templates: {
        Row: {
          branch_id: string | null
          cadence_days: number
          created_at: string
          created_by: string
          deleted_at: string | null
          id: string
          is_active: boolean
          last_dispatched_at: string | null
          message_body: string
          name: string
          photo_public_url: string | null
          photo_storage_path: string | null
          send_hour_local: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          branch_id?: string | null
          cadence_days?: number
          created_at?: string
          created_by: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          last_dispatched_at?: string | null
          message_body: string
          name: string
          photo_public_url?: string | null
          photo_storage_path?: string | null
          send_hour_local?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          branch_id?: string | null
          cadence_days?: number
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          last_dispatched_at?: string | null
          message_body?: string
          name?: string
          photo_public_url?: string | null
          photo_storage_path?: string | null
          send_hour_local?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_promo_templates_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_promo_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_promo_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "crm_promo_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_promo_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_promo_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "crm_promo_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_sales_coaching_log: {
        Row: {
          created_at: string
          id: string
          sales_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          sales_id: string
        }
        Update: {
          created_at?: string
          id?: string
          sales_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_sales_coaching_log_sales_id_fkey"
            columns: ["sales_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_sales_coaching_log_sales_id_fkey"
            columns: ["sales_id"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "crm_sales_coaching_log_sales_id_fkey"
            columns: ["sales_id"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_sales_teaching_log: {
        Row: {
          branch_id: string
          created_at: string
          id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_sales_teaching_log_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_sp1_warnings: {
        Row: {
          ai_draft_content: string | null
          branch_id: string
          closings_30d: number | null
          created_at: string
          follow_up_count_30d: number | null
          id: string
          period_month: number
          period_year: number
          reason: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sales_id: string
          status: string
          stuck_prospect_ids: string[]
          updated_at: string
          upload_days_30d: number | null
        }
        Insert: {
          ai_draft_content?: string | null
          branch_id: string
          closings_30d?: number | null
          created_at?: string
          follow_up_count_30d?: number | null
          id?: string
          period_month: number
          period_year: number
          reason: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sales_id: string
          status?: string
          stuck_prospect_ids?: string[]
          updated_at?: string
          upload_days_30d?: number | null
        }
        Update: {
          ai_draft_content?: string | null
          branch_id?: string
          closings_30d?: number | null
          created_at?: string
          follow_up_count_30d?: number | null
          id?: string
          period_month?: number
          period_year?: number
          reason?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sales_id?: string
          status?: string
          stuck_prospect_ids?: string[]
          updated_at?: string
          upload_days_30d?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_sp1_warnings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_sp1_warnings_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_sp1_warnings_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "crm_sp1_warnings_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_sp1_warnings_sales_id_fkey"
            columns: ["sales_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_sp1_warnings_sales_id_fkey"
            columns: ["sales_id"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "crm_sp1_warnings_sales_id_fkey"
            columns: ["sales_id"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_target_details: {
        Row: {
          commission_percent: number
          created_at: string
          id: string
          product_id: string
          selling_price: number
          target_header_id: string
          target_revenue: number | null
          target_unit: number
          updated_at: string
        }
        Insert: {
          commission_percent?: number
          created_at?: string
          id?: string
          product_id: string
          selling_price?: number
          target_header_id: string
          target_revenue?: number | null
          target_unit?: number
          updated_at?: string
        }
        Update: {
          commission_percent?: number
          created_at?: string
          id?: string
          product_id?: string
          selling_price?: number
          target_header_id?: string
          target_revenue?: number | null
          target_unit?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_target_details_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "crm_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_target_details_target_header_id_fkey"
            columns: ["target_header_id"]
            isOneToOne: false
            referencedRelation: "crm_target_headers"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_target_headers: {
        Row: {
          branch_id: string
          company_id: string | null
          created_at: string
          created_by: string | null
          id: string
          period_month: number
          period_year: number
          updated_at: string
        }
        Insert: {
          branch_id: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          period_month: number
          period_year: number
          updated_at?: string
        }
        Update: {
          branch_id?: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          period_month?: number
          period_year?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_target_headers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      divisions: {
        Row: {
          branch_id: string | null
          code: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          branch_id?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          branch_id?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "divisions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          address: string | null
          ads_lead_routing_paused: boolean
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          avatar_url: string | null
          birth_date: string | null
          branch_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          division_id: string | null
          email: string
          employee_code: string
          employment_status: string
          full_name: string
          gender: string | null
          id: string
          is_active: boolean
          is_root_owner: boolean
          join_date: string
          phone: string | null
          position_id: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          role_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          ads_lead_routing_paused?: boolean
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          branch_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          division_id?: string | null
          email: string
          employee_code: string
          employment_status?: string
          full_name: string
          gender?: string | null
          id: string
          is_active?: boolean
          is_root_owner?: boolean
          join_date?: string
          phone?: string | null
          position_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          role_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          ads_lead_routing_paused?: boolean
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          branch_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          division_id?: string | null
          email?: string
          employee_code?: string
          employment_status?: string
          full_name?: string
          gender?: string | null
          id?: string
          is_active?: boolean
          is_root_owner?: boolean
          join_date?: string
          phone?: string | null
          position_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          role_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "employees_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "employees_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_branch_balances: {
        Row: {
          alert_threshold: number
          branch_id: string
          branch_name: string
          cashflow_teaching_threshold: number | null
          id: string
          notify_dirops: boolean
          reminder_interval_days: number
          saldo: number
          situation_note: string | null
          situation_type: string
          source_system: string
          synced_at: string
          updated_at: string
        }
        Insert: {
          alert_threshold?: number
          branch_id: string
          branch_name: string
          cashflow_teaching_threshold?: number | null
          id?: string
          notify_dirops?: boolean
          reminder_interval_days?: number
          saldo?: number
          situation_note?: string | null
          situation_type?: string
          source_system?: string
          synced_at?: string
          updated_at?: string
        }
        Update: {
          alert_threshold?: number
          branch_id?: string
          branch_name?: string
          cashflow_teaching_threshold?: number | null
          id?: string
          notify_dirops?: boolean
          reminder_interval_days?: number
          saldo?: number
          situation_note?: string | null
          situation_type?: string
          source_system?: string
          synced_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_branch_balances_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_cashflow_action_plan_log: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          saldo_at_trigger: number
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          saldo_at_trigger: number
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          saldo_at_trigger?: number
        }
        Relationships: [
          {
            foreignKeyName: "finance_cashflow_action_plan_log_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      freelance_lead_deliveries: {
        Row: {
          campaign_id: string | null
          customer_name: string | null
          id: string
          phone: string
          phone_normalized: string | null
          recipient_id: string
          sent_at: string
        }
        Insert: {
          campaign_id?: string | null
          customer_name?: string | null
          id?: string
          phone: string
          phone_normalized?: string | null
          recipient_id: string
          sent_at?: string
        }
        Update: {
          campaign_id?: string | null
          customer_name?: string | null
          id?: string
          phone?: string
          phone_normalized?: string | null
          recipient_id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "freelance_lead_deliveries_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freelance_lead_deliveries_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "freelance_lead_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      freelance_lead_recipients: {
        Row: {
          active: boolean
          branch_id: string
          created_at: string
          created_by: string | null
          full_name: string
          id: string
          last_lead_sent_at: string | null
          notes: string | null
          phone: string
          project_id: string | null
        }
        Insert: {
          active?: boolean
          branch_id: string
          created_at?: string
          created_by?: string | null
          full_name: string
          id?: string
          last_lead_sent_at?: string | null
          notes?: string | null
          phone: string
          project_id?: string | null
        }
        Update: {
          active?: boolean
          branch_id?: string
          created_at?: string
          created_by?: string | null
          full_name?: string
          id?: string
          last_lead_sent_at?: string | null
          notes?: string | null
          phone?: string
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "freelance_lead_recipients_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freelance_lead_recipients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freelance_lead_recipients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "freelance_lead_recipients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freelance_lead_recipients_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "crm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      friday_actions: {
        Row: {
          action_key: string
          briefing_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          executed_at: string | null
          execution_note: string | null
          id: string
          payload: Json
          rationale: string
          risk_tier: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          action_key: string
          briefing_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          executed_at?: string | null
          execution_note?: string | null
          id?: string
          payload?: Json
          rationale: string
          risk_tier?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          action_key?: string
          briefing_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          executed_at?: string | null
          execution_note?: string | null
          id?: string
          payload?: Json
          rationale?: string
          risk_tier?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "friday_actions_briefing_id_fkey"
            columns: ["briefing_id"]
            isOneToOne: false
            referencedRelation: "friday_briefings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friday_actions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friday_actions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "friday_actions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      friday_briefings: {
        Row: {
          analisa: string | null
          branch_id: string | null
          business_health: Json
          business_id: string | null
          created_at: string
          error_detail: string | null
          generated_at: string | null
          hasil_diharapkan: string | null
          headline: string | null
          id: string
          model_note: string | null
          rekomendasi: string | null
          requested_by: string | null
          risiko: string | null
          scope: string
          severity: string | null
          signals: Json
          situasi: string | null
          solusi: Json
          status: string
          trigger_source: string
          updated_at: string
        }
        Insert: {
          analisa?: string | null
          branch_id?: string | null
          business_health?: Json
          business_id?: string | null
          created_at?: string
          error_detail?: string | null
          generated_at?: string | null
          hasil_diharapkan?: string | null
          headline?: string | null
          id?: string
          model_note?: string | null
          rekomendasi?: string | null
          requested_by?: string | null
          risiko?: string | null
          scope?: string
          severity?: string | null
          signals?: Json
          situasi?: string | null
          solusi?: Json
          status?: string
          trigger_source?: string
          updated_at?: string
        }
        Update: {
          analisa?: string | null
          branch_id?: string | null
          business_health?: Json
          business_id?: string | null
          created_at?: string
          error_detail?: string | null
          generated_at?: string | null
          hasil_diharapkan?: string | null
          headline?: string | null
          id?: string
          model_note?: string | null
          rekomendasi?: string | null
          requested_by?: string | null
          risiko?: string | null
          scope?: string
          severity?: string | null
          signals?: Json
          situasi?: string | null
          solusi?: Json
          status?: string
          trigger_source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "friday_briefings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friday_briefings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "holding_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friday_briefings_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friday_briefings_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "friday_briefings_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      guests: {
        Row: {
          created_at: string | null
          email: string | null
          hp: string | null
          id: string
          nama: string
          no_ktp: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          hp?: string | null
          id?: string
          nama: string
          no_ktp?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          hp?: string | null
          id?: string
          nama?: string
          no_ktp?: string | null
        }
        Relationships: []
      }
      holding_businesses: {
        Row: {
          business_type: string
          connector_config: Json
          connector_kind: string
          created_at: string
          display_order: number
          id: string
          key: string
          name: string
          notes: string | null
          source_system: string | null
          status: string
          updated_at: string
        }
        Insert: {
          business_type: string
          connector_config?: Json
          connector_kind: string
          created_at?: string
          display_order?: number
          id?: string
          key: string
          name: string
          notes?: string | null
          source_system?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          business_type?: string
          connector_config?: Json
          connector_kind?: string
          created_at?: string
          display_order?: number
          id?: string
          key?: string
          name?: string
          notes?: string | null
          source_system?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      housekeeping: {
        Row: {
          created_at: string | null
          done_at: string | null
          done_by: string | null
          id: string
          status: string | null
          tgl: string
          tugas: string
          unit_id: string | null
          unit_nomor: string | null
        }
        Insert: {
          created_at?: string | null
          done_at?: string | null
          done_by?: string | null
          id?: string
          status?: string | null
          tgl?: string
          tugas: string
          unit_id?: string | null
          unit_nomor?: string | null
        }
        Update: {
          created_at?: string | null
          done_at?: string | null
          done_by?: string | null
          id?: string
          status?: string | null
          tgl?: string
          tugas?: string
          unit_id?: string | null
          unit_nomor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "housekeeping_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_disciplinary_actions: {
        Row: {
          action_type: string
          branch_id: string | null
          bypass_justification: string | null
          bypassed_ladder: boolean
          created_at: string
          description: string
          effective_date: string
          employee_id: string
          evidence: Json
          id: string
          issued_by: string | null
          last_working_date: string | null
          reason_category: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          action_type: string
          branch_id?: string | null
          bypass_justification?: string | null
          bypassed_ladder?: boolean
          created_at?: string
          description: string
          effective_date?: string
          employee_id: string
          evidence?: Json
          id?: string
          issued_by?: string | null
          last_working_date?: string | null
          reason_category: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          branch_id?: string | null
          bypass_justification?: string | null
          bypassed_ladder?: boolean
          created_at?: string
          description?: string
          effective_date?: string
          employee_id?: string
          evidence?: Json
          id?: string
          issued_by?: string | null
          last_working_date?: string | null
          reason_category?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_disciplinary_actions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_disciplinary_actions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_disciplinary_actions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hr_disciplinary_actions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_disciplinary_actions_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_disciplinary_actions_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hr_disciplinary_actions_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_disciplinary_actions_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_disciplinary_actions_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hr_disciplinary_actions_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_expenses: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          branch_id: string
          created_at: string
          description: string
          employee_id: string
          expense_date: string
          expense_type: string
          id: string
          rejection_reason: string | null
          requested_by: string | null
          status: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          branch_id: string
          created_at?: string
          description: string
          employee_id: string
          expense_date?: string
          expense_type: string
          id?: string
          rejection_reason?: string | null
          requested_by?: string | null
          status?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string
          created_at?: string
          description?: string
          employee_id?: string
          expense_date?: string
          expense_type?: string
          id?: string
          rejection_reason?: string | null
          requested_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_expenses_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_expenses_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hr_expenses_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_expenses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_expenses_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_expenses_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hr_expenses_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_expenses_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_expenses_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hr_expenses_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      kontenai_ai_reports: {
        Row: {
          avg_ctr: number | null
          conversion_rate: number | null
          created_at: string
          created_by: string
          engagement_rate: number
          id: string
          period: string
          period_end: string
          period_start: string
          published_content: number
          summary: string
          total_content: number
          total_leads: number | null
          total_reach: number
          total_views: number
        }
        Insert: {
          avg_ctr?: number | null
          conversion_rate?: number | null
          created_at?: string
          created_by: string
          engagement_rate?: number
          id?: string
          period: string
          period_end: string
          period_start: string
          published_content?: number
          summary: string
          total_content?: number
          total_leads?: number | null
          total_reach?: number
          total_views?: number
        }
        Update: {
          avg_ctr?: number | null
          conversion_rate?: number | null
          created_at?: string
          created_by?: string
          engagement_rate?: number
          id?: string
          period?: string
          period_end?: string
          period_start?: string
          published_content?: number
          summary?: string
          total_content?: number
          total_leads?: number | null
          total_reach?: number
          total_views?: number
        }
        Relationships: [
          {
            foreignKeyName: "kontenai_ai_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kontenai_ai_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "kontenai_ai_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      kontenai_assets: {
        Row: {
          ai_analyzed_at: string | null
          ai_category: string | null
          ai_description: string | null
          ai_detected_objects: string[]
          ai_dominant_colors: string[]
          ai_error: string | null
          ai_mood: string | null
          ai_scene_summary: Json
          ai_tags: string[]
          ai_title: string | null
          ai_vision_status: string
          asset_type: string
          campaign: string | null
          company: string | null
          content_type: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
          duration_seconds: number | null
          file_size_bytes: number
          file_type: string
          filename: string
          id: string
          location: string | null
          platform: string | null
          project: string | null
          public_url: string
          resolution: string | null
          search_text: unknown
          status: string
          storage_path: string
          storage_provider: string
          tags: string[]
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ai_analyzed_at?: string | null
          ai_category?: string | null
          ai_description?: string | null
          ai_detected_objects?: string[]
          ai_dominant_colors?: string[]
          ai_error?: string | null
          ai_mood?: string | null
          ai_scene_summary?: Json
          ai_tags?: string[]
          ai_title?: string | null
          ai_vision_status?: string
          asset_type: string
          campaign?: string | null
          company?: string | null
          content_type?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string | null
          duration_seconds?: number | null
          file_size_bytes: number
          file_type: string
          filename: string
          id?: string
          location?: string | null
          platform?: string | null
          project?: string | null
          public_url: string
          resolution?: string | null
          search_text?: unknown
          status?: string
          storage_path: string
          storage_provider?: string
          tags?: string[]
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ai_analyzed_at?: string | null
          ai_category?: string | null
          ai_description?: string | null
          ai_detected_objects?: string[]
          ai_dominant_colors?: string[]
          ai_error?: string | null
          ai_mood?: string | null
          ai_scene_summary?: Json
          ai_tags?: string[]
          ai_title?: string | null
          ai_vision_status?: string
          asset_type?: string
          campaign?: string | null
          company?: string | null
          content_type?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          duration_seconds?: number | null
          file_size_bytes?: number
          file_type?: string
          filename?: string
          id?: string
          location?: string | null
          platform?: string | null
          project?: string | null
          public_url?: string
          resolution?: string | null
          search_text?: unknown
          status?: string
          storage_path?: string
          storage_provider?: string
          tags?: string[]
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kontenai_assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kontenai_assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "kontenai_assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kontenai_assets_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kontenai_assets_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "kontenai_assets_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      kontenai_automation_settings: {
        Row: {
          enabled: boolean
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kontenai_automation_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kontenai_automation_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "kontenai_automation_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      kontenai_content_performance: {
        Row: {
          ai_insight: string
          comments: number
          created_at: string
          created_by: string
          ctr: number | null
          id: string
          leads: number | null
          likes: number
          publish_schedule_id: string
          reach: number
          recommended_cta: string
          recommended_duration_seconds: number | null
          recommended_hook: string
          recommended_target_emotion: string
          recommended_visual: string
          saves: number
          shares: number
          updated_at: string
          views: number
        }
        Insert: {
          ai_insight?: string
          comments?: number
          created_at?: string
          created_by: string
          ctr?: number | null
          id?: string
          leads?: number | null
          likes?: number
          publish_schedule_id: string
          reach?: number
          recommended_cta?: string
          recommended_duration_seconds?: number | null
          recommended_hook?: string
          recommended_target_emotion?: string
          recommended_visual?: string
          saves?: number
          shares?: number
          updated_at?: string
          views?: number
        }
        Update: {
          ai_insight?: string
          comments?: number
          created_at?: string
          created_by?: string
          ctr?: number | null
          id?: string
          leads?: number | null
          likes?: number
          publish_schedule_id?: string
          reach?: number
          recommended_cta?: string
          recommended_duration_seconds?: number | null
          recommended_hook?: string
          recommended_target_emotion?: string
          recommended_visual?: string
          saves?: number
          shares?: number
          updated_at?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "kontenai_content_performance_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kontenai_content_performance_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "kontenai_content_performance_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kontenai_content_performance_publish_schedule_id_fkey"
            columns: ["publish_schedule_id"]
            isOneToOne: false
            referencedRelation: "kontenai_publish_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      kontenai_creative_briefs: {
        Row: {
          big_idea: string
          campaign_goal: string
          content_angle: string
          content_focus: string | null
          created_at: string
          created_by: string
          cta: string
          hook: string
          id: string
          key_message: string
          kpi_task_id: string | null
          objective: string
          platform: string
          product_project: string
          production_direction: Json
          referenced_asset_ids: string[]
          target_audience: string
          target_emotion: string
        }
        Insert: {
          big_idea: string
          campaign_goal: string
          content_angle: string
          content_focus?: string | null
          created_at?: string
          created_by: string
          cta: string
          hook: string
          id?: string
          key_message: string
          kpi_task_id?: string | null
          objective: string
          platform: string
          product_project: string
          production_direction?: Json
          referenced_asset_ids?: string[]
          target_audience: string
          target_emotion: string
        }
        Update: {
          big_idea?: string
          campaign_goal?: string
          content_angle?: string
          content_focus?: string | null
          created_at?: string
          created_by?: string
          cta?: string
          hook?: string
          id?: string
          key_message?: string
          kpi_task_id?: string | null
          objective?: string
          platform?: string
          product_project?: string
          production_direction?: Json
          referenced_asset_ids?: string[]
          target_audience?: string
          target_emotion?: string
        }
        Relationships: [
          {
            foreignKeyName: "kontenai_creative_briefs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kontenai_creative_briefs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "kontenai_creative_briefs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kontenai_creative_briefs_kpi_task_id_fkey"
            columns: ["kpi_task_id"]
            isOneToOne: false
            referencedRelation: "kpi_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      kontenai_optimization_recommendations: {
        Row: {
          based_on_record_count: number
          created_at: string
          created_by: string
          id: string
          rationale: string
          recommended_caption: string
          recommended_cta: string
          recommended_duration_seconds: number | null
          recommended_hook: string
          recommended_posting_time: string
          recommended_visual_style: string
        }
        Insert: {
          based_on_record_count?: number
          created_at?: string
          created_by: string
          id?: string
          rationale: string
          recommended_caption: string
          recommended_cta: string
          recommended_duration_seconds?: number | null
          recommended_hook: string
          recommended_posting_time: string
          recommended_visual_style: string
        }
        Update: {
          based_on_record_count?: number
          created_at?: string
          created_by?: string
          id?: string
          rationale?: string
          recommended_caption?: string
          recommended_cta?: string
          recommended_duration_seconds?: number | null
          recommended_hook?: string
          recommended_posting_time?: string
          recommended_visual_style?: string
        }
        Relationships: [
          {
            foreignKeyName: "kontenai_optimization_recommendations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kontenai_optimization_recommendations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "kontenai_optimization_recommendations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      kontenai_publish_schedules: {
        Row: {
          caption: string
          created_at: string
          created_by: string
          error_message: string | null
          external_post_id: string | null
          external_post_url: string | null
          hashtags: string[]
          id: string
          platform: string
          published_at: string | null
          render_job_id: string
          scheduled_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          caption?: string
          created_at?: string
          created_by: string
          error_message?: string | null
          external_post_id?: string | null
          external_post_url?: string | null
          hashtags?: string[]
          id?: string
          platform: string
          published_at?: string | null
          render_job_id: string
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          caption?: string
          created_at?: string
          created_by?: string
          error_message?: string | null
          external_post_id?: string | null
          external_post_url?: string | null
          hashtags?: string[]
          id?: string
          platform?: string
          published_at?: string | null
          render_job_id?: string
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kontenai_publish_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kontenai_publish_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "kontenai_publish_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kontenai_publish_schedules_render_job_id_fkey"
            columns: ["render_job_id"]
            isOneToOne: false
            referencedRelation: "kontenai_render_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      kontenai_render_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          duration_seconds: number | null
          error_message: string | null
          id: string
          output_public_url: string | null
          output_storage_path: string | null
          progress: number
          stage: string
          started_at: string | null
          status: string
          storyboard_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          duration_seconds?: number | null
          error_message?: string | null
          id?: string
          output_public_url?: string | null
          output_storage_path?: string | null
          progress?: number
          stage?: string
          started_at?: string | null
          status?: string
          storyboard_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          duration_seconds?: number | null
          error_message?: string | null
          id?: string
          output_public_url?: string | null
          output_storage_path?: string | null
          progress?: number
          stage?: string
          started_at?: string | null
          status?: string
          storyboard_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kontenai_render_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kontenai_render_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "kontenai_render_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kontenai_render_jobs_storyboard_id_fkey"
            columns: ["storyboard_id"]
            isOneToOne: false
            referencedRelation: "kontenai_storyboards"
            referencedColumns: ["id"]
          },
        ]
      }
      kontenai_storyboards: {
        Row: {
          created_at: string
          created_by: string
          creative_brief_id: string
          id: string
          scenes: Json
          title: string
          total_duration_seconds: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          creative_brief_id: string
          id?: string
          scenes?: Json
          title: string
          total_duration_seconds?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          creative_brief_id?: string
          id?: string
          scenes?: Json
          title?: string
          total_duration_seconds?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kontenai_storyboards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kontenai_storyboards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "kontenai_storyboards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kontenai_storyboards_creative_brief_id_fkey"
            columns: ["creative_brief_id"]
            isOneToOne: false
            referencedRelation: "kontenai_creative_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kontenai_storyboards_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kontenai_storyboards_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "kontenai_storyboards_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      kontenai_video_generation_jobs: {
        Row: {
          base_asset_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          error_message: string | null
          generated_asset_id: string | null
          id: string
          prompt: string
          scene_id: string
          started_at: string | null
          status: string
          storyboard_id: string
        }
        Insert: {
          base_asset_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          error_message?: string | null
          generated_asset_id?: string | null
          id?: string
          prompt: string
          scene_id: string
          started_at?: string | null
          status?: string
          storyboard_id: string
        }
        Update: {
          base_asset_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          error_message?: string | null
          generated_asset_id?: string | null
          id?: string
          prompt?: string
          scene_id?: string
          started_at?: string | null
          status?: string
          storyboard_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kontenai_video_generation_jobs_base_asset_id_fkey"
            columns: ["base_asset_id"]
            isOneToOne: false
            referencedRelation: "kontenai_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kontenai_video_generation_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kontenai_video_generation_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "kontenai_video_generation_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kontenai_video_generation_jobs_generated_asset_id_fkey"
            columns: ["generated_asset_id"]
            isOneToOne: false
            referencedRelation: "kontenai_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kontenai_video_generation_jobs_storyboard_id_fkey"
            columns: ["storyboard_id"]
            isOneToOne: false
            referencedRelation: "kontenai_storyboards"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_tasks: {
        Row: {
          ai_guidance: string | null
          ai_guidance_at: string | null
          assignee_response: string | null
          assignee_response_at: string | null
          branch_id: string
          completed_at: string | null
          content_focus: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          division_id: string
          due_date: string | null
          id: string
          notes: string | null
          period_month: number
          period_week: number
          period_year: number
          status: string
          title: string
          updated_at: string
          updated_by: string | null
          verified_by: string | null
        }
        Insert: {
          ai_guidance?: string | null
          ai_guidance_at?: string | null
          assignee_response?: string | null
          assignee_response_at?: string | null
          branch_id: string
          completed_at?: string | null
          content_focus?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          division_id: string
          due_date?: string | null
          id?: string
          notes?: string | null
          period_month: number
          period_week: number
          period_year: number
          status?: string
          title: string
          updated_at?: string
          updated_by?: string | null
          verified_by?: string | null
        }
        Update: {
          ai_guidance?: string | null
          ai_guidance_at?: string | null
          assignee_response?: string | null
          assignee_response_at?: string | null
          branch_id?: string
          completed_at?: string | null
          content_focus?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          division_id?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          period_month?: number
          period_week?: number
          period_year?: number
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kpi_tasks_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "kpi_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_tasks_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_tasks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_tasks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "kpi_tasks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_tasks_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_tasks_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "kpi_tasks_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attachment_url: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          end_date: string
          id: string
          reason: string
          rejection_reason: string | null
          start_date: string
          status: string
          type: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attachment_url?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          end_date: string
          id?: string
          reason: string
          rejection_reason?: string | null
          start_date: string
          status?: string
          type: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attachment_url?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          end_date?: string
          id?: string
          reason?: string
          rejection_reason?: string | null
          start_date?: string
          status?: string
          type?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "leave_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "leave_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      loonars_beauty_competitor_comparisons: {
        Row: {
          comparison: Json
          created_at: string
          generated_at: string
          id: string
          narrative: string
        }
        Insert: {
          comparison: Json
          created_at?: string
          generated_at?: string
          id?: string
          narrative: string
        }
        Update: {
          comparison?: Json
          created_at?: string
          generated_at?: string
          id?: string
          narrative?: string
        }
        Relationships: []
      }
      loonars_beauty_weekly_content_audits: {
        Row: {
          audit: Json
          created_at: string
          evaluation: string
          id: string
          week_start: string
        }
        Insert: {
          audit: Json
          created_at?: string
          evaluation: string
          id?: string
          week_start: string
        }
        Update: {
          audit?: Json
          created_at?: string
          evaluation?: string
          id?: string
          week_start?: string
        }
        Relationships: []
      }
      loonars_closings: {
        Row: {
          address: string | null
          aset_id: number
          blok: string
          branch_id: string | null
          buyer: string | null
          created_at: string
          fee_amount: number | null
          fee_phone: string | null
          fee_requested: boolean
          fee_requested_at: string | null
          id: string
          marketing_email: string | null
          marketing_name: string | null
          matched_employee_id: string | null
          nik: string | null
          phone: string | null
          price: number | null
          proyek: string
          reject_reason: string | null
          status: string
          tgl: string | null
          tipe: string | null
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          address?: string | null
          aset_id: number
          blok: string
          branch_id?: string | null
          buyer?: string | null
          created_at?: string
          fee_amount?: number | null
          fee_phone?: string | null
          fee_requested?: boolean
          fee_requested_at?: string | null
          id?: string
          marketing_email?: string | null
          marketing_name?: string | null
          matched_employee_id?: string | null
          nik?: string | null
          phone?: string | null
          price?: number | null
          proyek: string
          reject_reason?: string | null
          status?: string
          tgl?: string | null
          tipe?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          address?: string | null
          aset_id?: number
          blok?: string
          branch_id?: string | null
          buyer?: string | null
          created_at?: string
          fee_amount?: number | null
          fee_phone?: string | null
          fee_requested?: boolean
          fee_requested_at?: string | null
          id?: string
          marketing_email?: string | null
          marketing_name?: string | null
          matched_employee_id?: string | null
          nik?: string | null
          phone?: string | null
          price?: number | null
          proyek?: string
          reject_reason?: string | null
          status?: string
          tgl?: string | null
          tipe?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loonars_closings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loonars_closings_matched_employee_id_fkey"
            columns: ["matched_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loonars_closings_matched_employee_id_fkey"
            columns: ["matched_employee_id"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "loonars_closings_matched_employee_id_fkey"
            columns: ["matched_employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loonars_closings_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loonars_closings_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "loonars_closings_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      loonars_content_items: {
        Row: {
          caption: string | null
          category: string
          content_url: string | null
          created_at: string
          created_by: string | null
          cta: string | null
          deleted_at: string | null
          hook: string | null
          id: string
          kontenai_creative_brief_id: string | null
          platform: string
          product_name: string
          published_at: string | null
          scheduled_at: string | null
          script_notes: string | null
          status: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          caption?: string | null
          category: string
          content_url?: string | null
          created_at?: string
          created_by?: string | null
          cta?: string | null
          deleted_at?: string | null
          hook?: string | null
          id?: string
          kontenai_creative_brief_id?: string | null
          platform: string
          product_name?: string
          published_at?: string | null
          scheduled_at?: string | null
          script_notes?: string | null
          status?: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          caption?: string | null
          category?: string
          content_url?: string | null
          created_at?: string
          created_by?: string | null
          cta?: string | null
          deleted_at?: string | null
          hook?: string | null
          id?: string
          kontenai_creative_brief_id?: string | null
          platform?: string
          product_name?: string
          published_at?: string | null
          scheduled_at?: string | null
          script_notes?: string | null
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loonars_content_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loonars_content_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "loonars_content_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loonars_content_items_kontenai_creative_brief_id_fkey"
            columns: ["kontenai_creative_brief_id"]
            isOneToOne: false
            referencedRelation: "kontenai_creative_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loonars_content_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loonars_content_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "loonars_content_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      loonars_content_metrics: {
        Row: {
          boosted_spark_ads: boolean
          captured_at: string
          comments: number
          content_item_id: string
          created_at: string
          created_by: string | null
          id: string
          likes: number
          link_clicks: number
          notes: string | null
          saves: number
          shares: number
          views: number
          watch_through_50pct: boolean
        }
        Insert: {
          boosted_spark_ads?: boolean
          captured_at?: string
          comments?: number
          content_item_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          likes?: number
          link_clicks?: number
          notes?: string | null
          saves?: number
          shares?: number
          views?: number
          watch_through_50pct?: boolean
        }
        Update: {
          boosted_spark_ads?: boolean
          captured_at?: string
          comments?: number
          content_item_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          likes?: number
          link_clicks?: number
          notes?: string | null
          saves?: number
          shares?: number
          views?: number
          watch_through_50pct?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "loonars_content_metrics_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "loonars_content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loonars_content_metrics_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loonars_content_metrics_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "loonars_content_metrics_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      loonars_integration_log: {
        Row: {
          created_at: string
          detail: string | null
          event_type: string
          fee_id: string | null
          id: string
          matched_employee_id: string | null
          payload: Json
          phone: string | null
          prospect_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          event_type: string
          fee_id?: string | null
          id?: string
          matched_employee_id?: string | null
          payload: Json
          phone?: string | null
          prospect_id?: string | null
          status: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          event_type?: string
          fee_id?: string | null
          id?: string
          matched_employee_id?: string | null
          payload?: Json
          phone?: string | null
          prospect_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "loonars_integration_log_matched_employee_id_fkey"
            columns: ["matched_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loonars_integration_log_matched_employee_id_fkey"
            columns: ["matched_employee_id"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "loonars_integration_log_matched_employee_id_fkey"
            columns: ["matched_employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loonars_integration_log_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      loonars_orders: {
        Row: {
          channel: string
          courier: string | null
          created_at: string
          created_by: string | null
          customer_address: string | null
          customer_name: string
          customer_phone: string | null
          id: string
          notes: string | null
          order_number: string
          product_name: string
          quantity: number
          status: string
          total_amount: number
          tracking_number: string | null
          unit_price: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          channel: string
          courier?: string | null
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_name: string
          customer_phone?: string | null
          id?: string
          notes?: string | null
          order_number: string
          product_name?: string
          quantity?: number
          status?: string
          total_amount?: number
          tracking_number?: string | null
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          channel?: string
          courier?: string | null
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_name?: string
          customer_phone?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          product_name?: string
          quantity?: number
          status?: string
          total_amount?: number
          tracking_number?: string | null
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loonars_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loonars_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "loonars_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loonars_orders_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loonars_orders_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "loonars_orders_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      loonars_weekly_evaluations: {
        Row: {
          content_ratio_actual: Json | null
          created_at: string
          evaluation: string
          id: string
          recommended_boost_content_id: string | null
          week_start: string
        }
        Insert: {
          content_ratio_actual?: Json | null
          created_at?: string
          evaluation: string
          id?: string
          recommended_boost_content_id?: string | null
          week_start: string
        }
        Update: {
          content_ratio_actual?: Json | null
          created_at?: string
          evaluation?: string
          id?: string
          recommended_boost_content_id?: string | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "loonars_weekly_evaluations_recommended_boost_content_id_fkey"
            columns: ["recommended_boost_content_id"]
            isOneToOne: false
            referencedRelation: "loonars_content_items"
            referencedColumns: ["id"]
          },
        ]
      }
      markom_content_submission_photos: {
        Row: {
          created_at: string
          display_order: number
          id: string
          public_url: string
          storage_path: string
          submission_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          public_url: string
          storage_path: string
          submission_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          public_url?: string
          storage_path?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "markom_content_submission_photos_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "markom_content_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      markom_content_submissions: {
        Row: {
          ai_reviewed_at: string | null
          ai_score: number | null
          ai_verdict: string | null
          beauty_content_item_id: string | null
          branch_id: string
          caption: string | null
          content_focus: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          division_id: string
          failure_reason: string | null
          id: string
          ig_container_id: string | null
          ig_media_id: string | null
          is_automation_generated: boolean
          media_type: string
          platform: string
          public_url: string
          published_at: string | null
          reminder_sent_at: string | null
          scheduled_publish_at: string | null
          status: string
          storage_path: string
          submitted_by: string
          task_id: string | null
          updated_at: string
          updated_by: string | null
          verifier_notified_at: string | null
          zernio_account_id: string | null
          zernio_permalink: string | null
          zernio_post_id: string | null
          zernio_publish_status: string | null
        }
        Insert: {
          ai_reviewed_at?: string | null
          ai_score?: number | null
          ai_verdict?: string | null
          beauty_content_item_id?: string | null
          branch_id: string
          caption?: string | null
          content_focus: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          division_id: string
          failure_reason?: string | null
          id?: string
          ig_container_id?: string | null
          ig_media_id?: string | null
          is_automation_generated?: boolean
          media_type: string
          platform?: string
          public_url: string
          published_at?: string | null
          reminder_sent_at?: string | null
          scheduled_publish_at?: string | null
          status?: string
          storage_path: string
          submitted_by: string
          task_id?: string | null
          updated_at?: string
          updated_by?: string | null
          verifier_notified_at?: string | null
          zernio_account_id?: string | null
          zernio_permalink?: string | null
          zernio_post_id?: string | null
          zernio_publish_status?: string | null
        }
        Update: {
          ai_reviewed_at?: string | null
          ai_score?: number | null
          ai_verdict?: string | null
          beauty_content_item_id?: string | null
          branch_id?: string
          caption?: string | null
          content_focus?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          division_id?: string
          failure_reason?: string | null
          id?: string
          ig_container_id?: string | null
          ig_media_id?: string | null
          is_automation_generated?: boolean
          media_type?: string
          platform?: string
          public_url?: string
          published_at?: string | null
          reminder_sent_at?: string | null
          scheduled_publish_at?: string | null
          status?: string
          storage_path?: string
          submitted_by?: string
          task_id?: string | null
          updated_at?: string
          updated_by?: string | null
          verifier_notified_at?: string | null
          zernio_account_id?: string | null
          zernio_permalink?: string | null
          zernio_post_id?: string | null
          zernio_publish_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "markom_content_submissions_beauty_content_item_id_fkey"
            columns: ["beauty_content_item_id"]
            isOneToOne: false
            referencedRelation: "loonars_content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "markom_content_submissions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "markom_content_submissions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "markom_content_submissions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "markom_content_submissions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "markom_content_submissions_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "markom_content_submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "markom_content_submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "markom_content_submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "markom_content_submissions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "kpi_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "markom_content_submissions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "markom_content_submissions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "markom_content_submissions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      memo_attachments: {
        Row: {
          created_at: string
          created_by: string | null
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          memo_id: string
          mime_type: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          memo_id: string
          mime_type?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          memo_id?: string
          mime_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memo_attachments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memo_attachments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "memo_attachments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memo_attachments_memo_id_fkey"
            columns: ["memo_id"]
            isOneToOne: false
            referencedRelation: "memos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memo_attachments_memo_id_fkey"
            columns: ["memo_id"]
            isOneToOne: false
            referencedRelation: "v_memo_read_stats"
            referencedColumns: ["memo_id"]
          },
        ]
      }
      memo_reads: {
        Row: {
          memo_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          memo_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          memo_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memo_reads_memo_id_fkey"
            columns: ["memo_id"]
            isOneToOne: false
            referencedRelation: "memos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memo_reads_memo_id_fkey"
            columns: ["memo_id"]
            isOneToOne: false
            referencedRelation: "v_memo_read_stats"
            referencedColumns: ["memo_id"]
          },
          {
            foreignKeyName: "memo_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memo_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "memo_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      memo_targets: {
        Row: {
          created_at: string
          id: string
          memo_id: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          memo_id: string
          target_id?: string | null
          target_type: string
        }
        Update: {
          created_at?: string
          id?: string
          memo_id?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "memo_targets_memo_id_fkey"
            columns: ["memo_id"]
            isOneToOne: false
            referencedRelation: "memos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memo_targets_memo_id_fkey"
            columns: ["memo_id"]
            isOneToOne: false
            referencedRelation: "v_memo_read_stats"
            referencedColumns: ["memo_id"]
          },
        ]
      }
      memos: {
        Row: {
          content: string
          created_at: string
          created_by: string
          deleted_at: string | null
          expires_at: string | null
          id: string
          is_mandatory_read: boolean
          is_pinned: boolean
          priority: string
          published_at: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          is_mandatory_read?: boolean
          is_pinned?: boolean
          priority?: string
          published_at?: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          is_mandatory_read?: boolean
          is_pinned?: boolean
          priority?: string
          published_at?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "memos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memos_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memos_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "memos_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ad_campaign_photos: {
        Row: {
          campaign_id: string
          created_at: string
          display_order: number
          id: string
          photo_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          display_order?: number
          id?: string
          photo_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          display_order?: number
          id?: string
          photo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_campaign_photos_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ad_campaign_photos_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "crm_project_photos"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ad_campaigns: {
        Row: {
          ai_analysis: string | null
          analyzed_at: string | null
          branch_id: string
          clicks: number | null
          conversations_started: number | null
          created_at: string
          created_by: string | null
          daily_budget_idr: number
          description: string | null
          failure_reason: string | null
          headline: string
          id: string
          impressions: number | null
          launched_by: string
          meta_ad_id: string | null
          meta_adset_id: string | null
          meta_campaign_id: string | null
          meta_creative_id: string | null
          name: string
          photo_id: string | null
          primary_text: string
          project_id: string | null
          research_summary: string | null
          spend_idr: number | null
          status: string
          target_areas: string[] | null
          updated_at: string
          welcome_message: string | null
        }
        Insert: {
          ai_analysis?: string | null
          analyzed_at?: string | null
          branch_id: string
          clicks?: number | null
          conversations_started?: number | null
          created_at?: string
          created_by?: string | null
          daily_budget_idr: number
          description?: string | null
          failure_reason?: string | null
          headline: string
          id?: string
          impressions?: number | null
          launched_by?: string
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          meta_creative_id?: string | null
          name: string
          photo_id?: string | null
          primary_text: string
          project_id?: string | null
          research_summary?: string | null
          spend_idr?: number | null
          status?: string
          target_areas?: string[] | null
          updated_at?: string
          welcome_message?: string | null
        }
        Update: {
          ai_analysis?: string | null
          analyzed_at?: string | null
          branch_id?: string
          clicks?: number | null
          conversations_started?: number | null
          created_at?: string
          created_by?: string | null
          daily_budget_idr?: number
          description?: string | null
          failure_reason?: string | null
          headline?: string
          id?: string
          impressions?: number | null
          launched_by?: string
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          meta_creative_id?: string | null
          name?: string
          photo_id?: string | null
          primary_text?: string
          project_id?: string | null
          research_summary?: string | null
          spend_idr?: number | null
          status?: string
          target_areas?: string[] | null
          updated_at?: string
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_campaigns_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ad_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ad_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "meta_ad_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ad_campaigns_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "crm_project_photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ad_campaigns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "crm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ads_balance_state: {
        Row: {
          alert_active: boolean
          checked_at: string | null
          id: string
          last_balance_idr: number | null
        }
        Insert: {
          alert_active?: boolean
          checked_at?: string | null
          id?: string
          last_balance_idr?: number | null
        }
        Update: {
          alert_active?: boolean
          checked_at?: string | null
          id?: string
          last_balance_idr?: number | null
        }
        Relationships: []
      }
      mkc_device_push_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkc_device_push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkc_device_push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "mkc_device_push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      mkc_error_logs: {
        Row: {
          context: Json
          created_at: string
          digest: string | null
          environment: string
          id: string
          level: string
          message: string
          occurred_at: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          source: string
          stack: string | null
          url: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json
          created_at?: string
          digest?: string | null
          environment?: string
          id?: string
          level: string
          message: string
          occurred_at?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          source: string
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json
          created_at?: string
          digest?: string | null
          environment?: string
          id?: string
          level?: string
          message?: string
          occurred_at?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkc_error_logs_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkc_error_logs_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "mkc_error_logs_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkc_error_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkc_error_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "mkc_error_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      mkc_login_attempts: {
        Row: {
          attempted_at: string
          email: string
          id: string
          ip_address: string | null
          success: boolean
        }
        Insert: {
          attempted_at?: string
          email: string
          id?: string
          ip_address?: string | null
          success: boolean
        }
        Update: {
          attempted_at?: string
          email?: string
          id?: string
          ip_address?: string | null
          success?: boolean
        }
        Relationships: []
      }
      mkc_notifications: {
        Row: {
          body: string | null
          category: string | null
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          metadata: Json
          read_at: string | null
          status: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          category?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          metadata?: Json
          read_at?: string | null
          status?: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          category?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          metadata?: Json
          read_at?: string | null
          status?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkc_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkc_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "mkc_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      mkc_performance_metrics: {
        Row: {
          created_at: string
          environment: string
          id: string
          metric_name: string
          rating: string
          url: string | null
          user_id: string | null
          value: number
        }
        Insert: {
          created_at?: string
          environment?: string
          id?: string
          metric_name: string
          rating: string
          url?: string | null
          user_id?: string | null
          value: number
        }
        Update: {
          created_at?: string
          environment?: string
          id?: string
          metric_name?: string
          rating?: string
          url?: string | null
          user_id?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "mkc_performance_metrics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkc_performance_metrics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "mkc_performance_metrics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      mkc_push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkc_push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkc_push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "mkc_push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_reports: {
        Row: {
          created_at: string | null
          gross_profit: number | null
          gross_revenue: number | null
          id: string
          jaminan_aktif: boolean | null
          jaminan_topup: number | null
          loonars_amount: number | null
          occupancy_pct: number | null
          opex_unit: number | null
          owner_amount: number | null
          periode: string
          transfer_status: string | null
          transfer_tgl: string | null
          unit_id: string
          unit_nomor: string
        }
        Insert: {
          created_at?: string | null
          gross_profit?: number | null
          gross_revenue?: number | null
          id?: string
          jaminan_aktif?: boolean | null
          jaminan_topup?: number | null
          loonars_amount?: number | null
          occupancy_pct?: number | null
          opex_unit?: number | null
          owner_amount?: number | null
          periode: string
          transfer_status?: string | null
          transfer_tgl?: string | null
          unit_id: string
          unit_nomor: string
        }
        Update: {
          created_at?: string | null
          gross_profit?: number | null
          gross_revenue?: number | null
          id?: string
          jaminan_aktif?: boolean | null
          jaminan_topup?: number | null
          loonars_amount?: number | null
          occupancy_pct?: number | null
          opex_unit?: number | null
          owner_amount?: number | null
          periode?: string
          transfer_status?: string | null
          transfer_tgl?: string | null
          unit_id?: string
          unit_nomor?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_reports_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      mp_occupancy_teaching_log: {
        Row: {
          branch_id: string
          created_at: string
          id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mp_occupancy_teaching_log_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read_owner: boolean | null
          is_read_staff: boolean | null
          judul: string
          pesan: string
          ref_id: string | null
          target_role: string | null
          tipe: string | null
          unit_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read_owner?: boolean | null
          is_read_staff?: boolean | null
          judul: string
          pesan: string
          ref_id?: string | null
          target_role?: string | null
          tipe?: string | null
          unit_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read_owner?: boolean | null
          is_read_staff?: boolean | null
          judul?: string
          pesan?: string
          ref_id?: string | null
          target_role?: string | null
          tipe?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      opex_bulanan: {
        Row: {
          created_at: string | null
          deskripsi: string | null
          dicatat_oleh: string | null
          id: string
          kategori: string
          per_unit: number | null
          periode: string
          total: number
        }
        Insert: {
          created_at?: string | null
          deskripsi?: string | null
          dicatat_oleh?: string | null
          id?: string
          kategori: string
          per_unit?: number | null
          periode: string
          total: number
        }
        Update: {
          created_at?: string | null
          deskripsi?: string | null
          dicatat_oleh?: string | null
          id?: string
          kategori?: string
          per_unit?: number | null
          periode?: string
          total?: number
        }
        Relationships: []
      }
      payroll_items: {
        Row: {
          allowances: number
          base_salary: number
          created_at: string
          deductions: number
          employee_id: string
          id: string
          net_salary: number
          payroll_run_id: string
        }
        Insert: {
          allowances?: number
          base_salary?: number
          created_at?: string
          deductions?: number
          employee_id: string
          id?: string
          net_salary: number
          payroll_run_id: string
        }
        Update: {
          allowances?: number
          base_salary?: number
          created_at?: string
          deductions?: number
          employee_id?: string
          id?: string
          net_salary?: number
          payroll_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payroll_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          branch_id: string
          created_at: string
          created_by: string | null
          id: string
          period_month: number
          period_year: number
          status: string
          total_amount: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          period_month: number
          period_year: number
          status?: string
          total_amount?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          period_month?: number
          period_year?: number
          status?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payroll_runs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payroll_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
        }
        Relationships: []
      }
      positions: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          level: number
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          level?: number
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          level?: number
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      prospect_follow_ups: {
        Row: {
          activity_date: string
          activity_time: string | null
          activity_type: string
          created_at: string
          created_by: string
          id: string
          notes: string | null
          prospect_id: string
        }
        Insert: {
          activity_date?: string
          activity_time?: string | null
          activity_type: string
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          prospect_id: string
        }
        Update: {
          activity_date?: string
          activity_time?: string | null
          activity_type?: string
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          prospect_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospect_follow_ups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_follow_ups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "prospect_follow_ups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_follow_ups_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      prospect_payments: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          commission_amount: number | null
          created_at: string
          finance_confirmed_at: string | null
          finance_confirmed_by: string | null
          finance_reference_no: string | null
          id: string
          notes: string | null
          payment_date: string
          payment_type: string
          prospect_id: string
          recorded_by: string
          reference_number: string | null
          rejection_reason: string | null
          status: string
          unit_label: string | null
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          commission_amount?: number | null
          created_at?: string
          finance_confirmed_at?: string | null
          finance_confirmed_by?: string | null
          finance_reference_no?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_type: string
          prospect_id: string
          recorded_by: string
          reference_number?: string | null
          rejection_reason?: string | null
          status?: string
          unit_label?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          commission_amount?: number | null
          created_at?: string
          finance_confirmed_at?: string | null
          finance_confirmed_by?: string | null
          finance_reference_no?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_type?: string
          prospect_id?: string
          recorded_by?: string
          reference_number?: string | null
          rejection_reason?: string | null
          status?: string
          unit_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospect_payments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_payments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "prospect_payments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_payments_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "prospect_payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      prospects: {
        Row: {
          branch_id: string
          city: string
          closed_at: string | null
          created_at: string
          created_by: string | null
          customer_name: string
          deleted_at: string | null
          house_type: string
          id: string
          last_follow_up_at: string | null
          last_reminder_sent_at: string | null
          lead_source: string
          notes: string | null
          phone: string
          phone_normalized: string | null
          project_id: string | null
          sales_id: string
          status: string
          total_collection: number
          total_commission: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          branch_id: string
          city: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_name: string
          deleted_at?: string | null
          house_type: string
          id?: string
          last_follow_up_at?: string | null
          last_reminder_sent_at?: string | null
          lead_source: string
          notes?: string | null
          phone: string
          phone_normalized?: string | null
          project_id?: string | null
          sales_id: string
          status?: string
          total_collection?: number
          total_commission?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          branch_id?: string
          city?: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_name?: string
          deleted_at?: string | null
          house_type?: string
          id?: string
          last_follow_up_at?: string | null
          last_reminder_sent_at?: string | null
          lead_source?: string
          notes?: string | null
          phone?: string
          phone_normalized?: string | null
          project_id?: string | null
          sales_id?: string
          status?: string
          total_collection?: number
          total_commission?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospects_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "crm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospects_sales_id_fkey"
            columns: ["sales_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospects_sales_id_fkey"
            columns: ["sales_id"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "prospects_sales_id_fkey"
            columns: ["sales_id"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_system: boolean
          key: string
          level: number
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          key: string
          level?: number
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          key?: string
          level?: number
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      sales_targets: {
        Row: {
          commission_percent: number
          created_at: string
          created_by: string | null
          id: string
          period_month: number
          period_year: number
          product_id: string | null
          sales_id: string
          selling_price_per_unit: number
          target_units: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          commission_percent?: number
          created_at?: string
          created_by?: string | null
          id?: string
          period_month: number
          period_year: number
          product_id?: string | null
          sales_id: string
          selling_price_per_unit?: number
          target_units?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          commission_percent?: number
          created_at?: string
          created_by?: string | null
          id?: string
          period_month?: number
          period_year?: number
          product_id?: string | null
          sales_id?: string
          selling_price_per_unit?: number
          target_units?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_targets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "crm_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_targets_sales_id_fkey"
            columns: ["sales_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_targets_sales_id_fkey"
            columns: ["sales_id"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sales_targets_sales_id_fkey"
            columns: ["sales_id"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_log: {
        Row: {
          catatan: string | null
          checkin_count: number | null
          checkout_count: number | null
          created_at: string | null
          id: string
          nama_staff: string
          shift: string | null
          tgl: string
          user_id: string | null
        }
        Insert: {
          catatan?: string | null
          checkin_count?: number | null
          checkout_count?: number | null
          created_at?: string | null
          id?: string
          nama_staff: string
          shift?: string | null
          tgl?: string
          user_id?: string | null
        }
        Update: {
          catatan?: string | null
          checkin_count?: number | null
          checkout_count?: number | null
          created_at?: string | null
          id?: string
          nama_staff?: string
          shift?: string | null
          tgl?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "villa_users"
            referencedColumns: ["id"]
          },
        ]
      }
      social_account_snapshots: {
        Row: {
          best_upload_hour: number | null
          captured_at: string
          comments: number | null
          engagement_rate: number | null
          followers_count: number | null
          id: string
          impressions: number | null
          likes: number | null
          platform: string
          product_line: string
          raw_data: Json | null
          reach: number | null
          saves: number | null
          shares: number | null
          top_content_type: string | null
          watch_time_seconds: number | null
        }
        Insert: {
          best_upload_hour?: number | null
          captured_at?: string
          comments?: number | null
          engagement_rate?: number | null
          followers_count?: number | null
          id?: string
          impressions?: number | null
          likes?: number | null
          platform: string
          product_line?: string
          raw_data?: Json | null
          reach?: number | null
          saves?: number | null
          shares?: number | null
          top_content_type?: string | null
          watch_time_seconds?: number | null
        }
        Update: {
          best_upload_hour?: number | null
          captured_at?: string
          comments?: number | null
          engagement_rate?: number | null
          followers_count?: number | null
          id?: string
          impressions?: number | null
          likes?: number | null
          platform?: string
          product_line?: string
          raw_data?: Json | null
          reach?: number | null
          saves?: number | null
          shares?: number | null
          top_content_type?: string | null
          watch_time_seconds?: number | null
        }
        Relationships: []
      }
      social_competitor_accounts: {
        Row: {
          content_focus: string
          created_at: string
          created_by: string | null
          display_name: string | null
          handle: string
          id: string
          is_active: boolean
          notes: string | null
          platform: string
          source: string
        }
        Insert: {
          content_focus?: string
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          handle: string
          id?: string
          is_active?: boolean
          notes?: string | null
          platform: string
          source?: string
        }
        Update: {
          content_focus?: string
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          handle?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          platform?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_competitor_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_competitor_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "social_competitor_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      social_competitor_content_logs: {
        Row: {
          caption: string | null
          competitor_account_id: string
          content_type: string | null
          content_url: string | null
          duration_seconds: number | null
          engagement_notes: string | null
          hashtags: string | null
          hook: string | null
          id: string
          logged_at: string
          logged_by: string
        }
        Insert: {
          caption?: string | null
          competitor_account_id: string
          content_type?: string | null
          content_url?: string | null
          duration_seconds?: number | null
          engagement_notes?: string | null
          hashtags?: string | null
          hook?: string | null
          id?: string
          logged_at?: string
          logged_by: string
        }
        Update: {
          caption?: string | null
          competitor_account_id?: string
          content_type?: string | null
          content_url?: string | null
          duration_seconds?: number | null
          engagement_notes?: string | null
          hashtags?: string | null
          hook?: string | null
          id?: string
          logged_at?: string
          logged_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_competitor_content_logs_competitor_account_id_fkey"
            columns: ["competitor_account_id"]
            isOneToOne: false
            referencedRelation: "social_competitor_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_competitor_content_logs_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_competitor_content_logs_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "social_competitor_content_logs_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      social_leasehold_competitor_comparisons: {
        Row: {
          comparison: Json
          created_at: string
          generated_at: string
          id: string
          narrative: string
        }
        Insert: {
          comparison: Json
          created_at?: string
          generated_at?: string
          id?: string
          narrative: string
        }
        Update: {
          comparison?: Json
          created_at?: string
          generated_at?: string
          id?: string
          narrative?: string
        }
        Relationships: []
      }
      social_weekly_evaluations: {
        Row: {
          audit: Json | null
          created_at: string
          evaluation: string
          id: string
          week_start: string
        }
        Insert: {
          audit?: Json | null
          created_at?: string
          evaluation: string
          id?: string
          week_start: string
        }
        Update: {
          audit?: Json | null
          created_at?: string
          evaluation?: string
          id?: string
          week_start?: string
        }
        Relationships: []
      }
      sync_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      sync_log: {
        Row: {
          attempt_count: number
          created_at: string
          direction: string
          event_type: string
          id: string
          idempotency_key: string
          last_attempt_at: string | null
          last_error: string | null
          max_attempts: number
          next_attempt_at: string
          payload: Json
          request_id: number | null
          source_id: string
          source_table: string
          status: string
          target_ref: string | null
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          direction: string
          event_type: string
          id?: string
          idempotency_key: string
          last_attempt_at?: string | null
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload: Json
          request_id?: number | null
          source_id: string
          source_table: string
          status?: string
          target_ref?: string | null
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          direction?: string
          event_type?: string
          id?: string
          idempotency_key?: string
          last_attempt_at?: string | null
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload?: Json
          request_id?: number | null
          source_id?: string
          source_table?: string
          status?: string
          target_ref?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          booking_id: string | null
          created_at: string | null
          deskripsi: string
          dicatat_oleh: string | null
          id: string
          jumlah: number
          kategori: string | null
          periode_bulan: string | null
          tipe: string
          unit_id: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string | null
          deskripsi: string
          dicatat_oleh?: string | null
          id?: string
          jumlah: number
          kategori?: string | null
          periode_bulan?: string | null
          tipe: string
          unit_id?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string | null
          deskripsi?: string
          dicatat_oleh?: string | null
          id?: string
          jumlah?: number
          kategori?: string | null
          periode_bulan?: string | null
          tipe?: string
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          blok: string
          catatan: string | null
          created_at: string | null
          fasilitas: string[] | null
          id: string
          nomor: string
          owner_bank: string | null
          owner_hp: string | null
          owner_id: string | null
          owner_nama: string | null
          owner_rek: string | null
          status: string | null
          tarif_bulanan: number | null
          tarif_harian: number | null
        }
        Insert: {
          blok: string
          catatan?: string | null
          created_at?: string | null
          fasilitas?: string[] | null
          id?: string
          nomor: string
          owner_bank?: string | null
          owner_hp?: string | null
          owner_id?: string | null
          owner_nama?: string | null
          owner_rek?: string | null
          status?: string | null
          tarif_bulanan?: number | null
          tarif_harian?: number | null
        }
        Update: {
          blok?: string
          catatan?: string | null
          created_at?: string | null
          fasilitas?: string[] | null
          id?: string
          nomor?: string
          owner_bank?: string | null
          owner_hp?: string | null
          owner_id?: string | null
          owner_nama?: string | null
          owner_rek?: string | null
          status?: string | null
          tarif_bulanan?: number | null
          tarif_harian?: number | null
        }
        Relationships: []
      }
      villa_users: {
        Row: {
          created_at: string | null
          email: string
          hp: string | null
          id: string
          is_active: boolean | null
          last_login: string | null
          nama: string
          password_hash: string
          role: string
          unit_id: string | null
          unit_nomor: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          hp?: string | null
          id?: string
          is_active?: boolean | null
          last_login?: string | null
          nama: string
          password_hash: string
          role?: string
          unit_id?: string | null
          unit_nomor?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          hp?: string | null
          id?: string
          is_active?: boolean | null
          last_login?: string | null
          nama?: string
          password_hash?: string
          role?: string
          unit_id?: string | null
          unit_nomor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "villa_users_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_bridge_daily_digests: {
        Row: {
          created_at: string
          digest_text: string
          generated_at: string
          id: string
          model: string
        }
        Insert: {
          created_at?: string
          digest_text: string
          generated_at?: string
          id?: string
          model: string
        }
        Update: {
          created_at?: string
          digest_text?: string
          generated_at?: string
          id?: string
          model?: string
        }
        Relationships: []
      }
      wa_pending_media_relay: {
        Row: {
          caption: string | null
          created_at: string
          employee_id: string
          id: string
          image_url: string
          sender: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          employee_id: string
          id?: string
          image_url: string
          sender: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          image_url?: string
          sender?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_pending_media_relay_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_pending_media_relay_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "wa_pending_media_relay_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      work_schedules: {
        Row: {
          branch_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          end_time: string
          id: string
          is_active: boolean
          is_default: boolean
          late_tolerance_minutes: number
          name: string
          start_time: string
          updated_at: string
          updated_by: string | null
          work_days: number[]
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          end_time?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          late_tolerance_minutes?: number
          name: string
          start_time?: string
          updated_at?: string
          updated_by?: string | null
          work_days?: number[]
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          end_time?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          late_tolerance_minutes?: number
          name?: string
          start_time?: string
          updated_at?: string
          updated_by?: string | null
          work_days?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "work_schedules_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_attendance_monthly_stats: {
        Row: {
          alpha_count: number | null
          hadir_count: number | null
          izin_count: number | null
          month: string | null
          sakit_count: number | null
          terlambat_count: number | null
          total_records: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_attendance_today"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_employee_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      v_attendance_today: {
        Row: {
          attendance_id: string | null
          avatar_url: string | null
          branch_id: string | null
          branch_name: string | null
          check_in_time: string | null
          check_in_within_radius: boolean | null
          check_out_time: string | null
          check_out_within_radius: boolean | null
          division_id: string | null
          full_name: string | null
          position_id: string | null
          status: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      v_automation_health: {
        Row: {
          dispatches_24h: number | null
          http_error_24h: number | null
          last_dispatch_at: string | null
          last_success_at: string | null
          ok_24h: number | null
          path: string | null
          pending_24h: number | null
          timeout_24h: number | null
        }
        Relationships: []
      }
      v_employee_directory: {
        Row: {
          address: string | null
          avatar_url: string | null
          birth_date: string | null
          branch_id: string | null
          branch_name: string | null
          created_at: string | null
          deleted_at: string | null
          division_id: string | null
          division_name: string | null
          email: string | null
          employee_code: string | null
          employment_status: string | null
          full_name: string | null
          gender: string | null
          id: string | null
          is_root_owner: boolean | null
          join_date: string | null
          phone: string | null
          position_id: string | null
          position_name: string | null
          role_id: string | null
          role_key: string | null
          role_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_memo_read_stats: {
        Row: {
          audience_count: number | null
          memo_id: string | null
          read_count: number | null
        }
        Relationships: []
      }
      v_performance_summary: {
        Row: {
          avg_value: number | null
          metric_name: string | null
          p75_value: number | null
          poor_count: number | null
          sample_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      ai_circuit_breaker_check: {
        Args: { p_open_cooldown_ms?: number; p_provider: string }
        Returns: Json
      }
      ai_circuit_breaker_report: {
        Args: {
          p_failure_threshold?: number
          p_provider: string
          p_success: boolean
        }
        Returns: Json
      }
      ai_job_dispatch_pending: { Args: never; Returns: undefined }
      ai_run_cashflow_intelligence_dispatch: { Args: never; Returns: undefined }
      ai_run_investor_intelligence_dispatch: { Args: never; Returns: undefined }
      ai_run_knowledge_bank_dispatch: { Args: never; Returns: undefined }
      ai_run_occupancy_intelligence_dispatch: {
        Args: never
        Returns: undefined
      }
      ai_send_birthday_wishes: { Args: never; Returns: number }
      ai_send_coo_introduction: { Args: never; Returns: number }
      ai_send_daily_motivation: { Args: never; Returns: number }
      ai_send_daily_report: { Args: never; Returns: number }
      ai_send_sales_target_reminders: { Args: never; Returns: undefined }
      app_current_branch_id: { Args: never; Returns: string }
      app_current_role_key: { Args: never; Returns: string }
      app_has_permission: {
        Args: { p_permission_key: string }
        Returns: boolean
      }
      app_is_super_admin: { Args: never; Returns: boolean }
      approve_employee_registration: {
        Args: { p_employee_id: string }
        Returns: {
          address: string | null
          ads_lead_routing_paused: boolean
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          avatar_url: string | null
          birth_date: string | null
          branch_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          division_id: string | null
          email: string
          employee_code: string
          employment_status: string
          full_name: string
          gender: string | null
          id: string
          is_active: boolean
          is_root_owner: boolean
          join_date: string
          phone: string | null
          position_id: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          role_id: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "employees"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_hr_expense: { Args: { p_id: string }; Returns: undefined }
      approve_payroll_run: {
        Args: { p_items: Json; p_payroll_run_id: string }
        Returns: undefined
      }
      archive_notification: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      attendance_check_in: {
        Args: {
          p_latitude: number
          p_longitude: number
          p_note?: string
          p_photo_url: string
        }
        Returns: {
          attendance_date: string
          branch_id: string
          check_in_distance_meters: number | null
          check_in_latitude: number | null
          check_in_longitude: number | null
          check_in_note: string | null
          check_in_photo_url: string | null
          check_in_time: string | null
          check_in_within_radius: boolean | null
          check_out_distance_meters: number | null
          check_out_latitude: number | null
          check_out_longitude: number | null
          check_out_note: string | null
          check_out_photo_url: string | null
          check_out_time: string | null
          check_out_within_radius: boolean | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          leave_request_id: string | null
          status: string
          updated_at: string
          updated_by: string | null
          user_id: string
          work_duration_minutes: number | null
          work_schedule_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "attendance"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      attendance_check_out: {
        Args: {
          p_latitude: number
          p_longitude: number
          p_note?: string
          p_photo_url: string
        }
        Returns: {
          attendance_date: string
          branch_id: string
          check_in_distance_meters: number | null
          check_in_latitude: number | null
          check_in_longitude: number | null
          check_in_note: string | null
          check_in_photo_url: string | null
          check_in_time: string | null
          check_in_within_radius: boolean | null
          check_out_distance_meters: number | null
          check_out_latitude: number | null
          check_out_longitude: number | null
          check_out_note: string | null
          check_out_photo_url: string | null
          check_out_time: string | null
          check_out_within_radius: boolean | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          leave_request_id: string | null
          status: string
          updated_at: string
          updated_by: string | null
          user_id: string
          work_duration_minutes: number | null
          work_schedule_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "attendance"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      attendance_notify_checkin_reminder: { Args: never; Returns: number }
      attendance_notify_forgot_checkout: { Args: never; Returns: number }
      automation_collect_dispatch_results: { Args: never; Returns: undefined }
      automation_post: {
        Args: { p_body?: Json; p_path: string; p_timeout_ms?: number }
        Returns: number
      }
      calculate_distance_meters: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      check_automation_health: { Args: never; Returns: undefined }
      check_login_lockout: { Args: { p_email: string }; Returns: boolean }
      check_whatsapp_webhook_health: { Args: never; Returns: undefined }
      create_announcement: {
        Args: {
          p_attachments?: Json
          p_category_id: string
          p_content: string
          p_expires_at: string
          p_is_pinned: boolean
          p_targets: Json
          p_title: string
        }
        Returns: string
      }
      create_emergency_notice: {
        Args: { p_content: string; p_title: string }
        Returns: string
      }
      create_hr_expense: {
        Args: {
          p_amount: number
          p_branch_id: string
          p_description: string
          p_employee_id: string
          p_expense_date: string
          p_expense_type: string
        }
        Returns: string
      }
      create_memo: {
        Args: {
          p_attachments?: Json
          p_content: string
          p_expires_at: string
          p_is_mandatory_read: boolean
          p_is_pinned: boolean
          p_priority: string
          p_targets: Json
          p_title: string
        }
        Returns: string
      }
      create_payroll_run: {
        Args: {
          p_branch_id: string
          p_period_month: number
          p_period_year: number
        }
        Returns: string
      }
      crm_add_follow_up: {
        Args: {
          p_activity_date: string
          p_activity_time: string
          p_activity_type: string
          p_notes?: string
          p_prospect_id: string
        }
        Returns: string
      }
      crm_approve_payment: {
        Args: { p_payment_id: string }
        Returns: undefined
      }
      crm_branch_stats: {
        Args: { p_branch_id?: string; p_month?: number; p_year?: number }
        Returns: {
          achievement_percent: number
          active_sales_count: number
          branch_id: string
          closing_units: number
          collection: number
          pending_finance_verification: number
          period_month: number
          period_year: number
          prospects_closing: number
          prospects_green: number
          prospects_red: number
          prospects_yellow: number
          sales_performance: Json
          target_revenue: number
          target_units: number
        }[]
      }
      crm_conversion_analytics: {
        Args: { p_branch_id?: string; p_month?: number; p_year?: number }
        Returns: {
          avg_closing_days: number
          avg_follow_up_days: number
          conversion_percent: number
          lead_source_performance: Json
          total_closing: number
          total_prospects: number
        }[]
      }
      crm_create_prospect: {
        Args: {
          p_city: string
          p_customer_name: string
          p_house_type: string
          p_lead_source: string
          p_notes?: string
          p_phone: string
          p_project_id: string
        }
        Returns: string
      }
      crm_dispatch_sales_closing_tips: { Args: never; Returns: undefined }
      crm_find_duplicate_prospect: {
        Args: { p_customer_name: string; p_phone: string }
        Returns: {
          created_at: string
          customer_name: string
          id: string
          is_phone_match: boolean
          phone: string
          sales_name: string
          status: string
        }[]
      }
      crm_monthly_trend: {
        Args: {
          p_branch_id?: string
          p_months_back?: number
          p_sales_id?: string
        }
        Returns: {
          achievement_percent: number
          closing_units: number
          collection: number
          period_month: number
          period_year: number
          target_units: number
        }[]
      }
      crm_national_stats: {
        Args: { p_month?: number; p_year?: number }
        Returns: {
          achievement_percent: number
          branch_ranking: Json
          collection: number
          conversion_percent: number
          monthly_growth_percent: number
          pending_finance_verification: number
          period_month: number
          period_year: number
          prospects_closing: number
          prospects_green: number
          prospects_red: number
          prospects_yellow: number
          top_sales: Json
          total_closing_units: number
          total_prospects: number
          total_target_revenue: number
          total_target_units: number
        }[]
      }
      crm_pick_round_robin_sales: {
        Args: { p_branch_id: string }
        Returns: string
      }
      crm_pick_round_robin_sales_excluding: {
        Args: { p_branch_id: string; p_exclude_sales_id: string }
        Returns: string
      }
      crm_pick_round_robin_sales_or_freelance: {
        Args: { p_branch_id: string; p_project_id: string }
        Returns: {
          full_name: string
          phone: string
          recipient_id: string
          recipient_type: string
        }[]
      }
      crm_record_payment: {
        Args: {
          p_amount: number
          p_notes?: string
          p_payment_date: string
          p_payment_type: string
          p_prospect_id: string
        }
        Returns: string
      }
      crm_reject_payment: {
        Args: { p_payment_id: string; p_reason?: string }
        Returns: undefined
      }
      crm_review_sp1_warning: {
        Args: { p_decision: string; p_id: string; p_note?: string }
        Returns: undefined
      }
      crm_run_ad_lead_monitoring: { Args: never; Returns: undefined }
      crm_run_branch_target_reminder: { Args: never; Returns: undefined }
      crm_run_follow_up_reminders: { Args: never; Returns: undefined }
      crm_run_promo_cadence_dispatch: { Args: never; Returns: undefined }
      crm_run_prospect_analysis: { Args: never; Returns: undefined }
      crm_run_sales_coaching: { Args: never; Returns: undefined }
      crm_run_sales_conduct_monitoring: { Args: never; Returns: undefined }
      crm_run_sales_teaching_weekly: { Args: never; Returns: undefined }
      crm_run_sp1_evaluation: { Args: never; Returns: undefined }
      crm_run_villa_cariu_database_followup: { Args: never; Returns: undefined }
      crm_sales_ranking: {
        Args: { p_branch_id?: string; p_month?: number; p_year?: number }
        Returns: {
          achievement_percent: number
          branch_name: string
          closing_units: number
          collection: number
          full_name: string
          rank: number
          sales_id: string
          target_units: number
        }[]
      }
      crm_sales_stats: {
        Args: { p_month?: number; p_sales_id?: string; p_year?: number }
        Returns: {
          achievement_percent: number
          closing_units: number
          collection: number
          commission_percent: number
          estimated_commission: number
          late_follow_up: number
          max_commission: number
          period_month: number
          period_year: number
          prospects_closing: number
          prospects_green: number
          prospects_red: number
          prospects_yellow: number
          remaining_target: number
          sales_id: string
          selling_price_per_unit: number
          target_revenue: number
          target_units: number
          today_follow_up: number
          today_prospect: number
          verified_commission: number
        }[]
      }
      crm_save_and_distribute_target: {
        Args: {
          p_branch_id: string
          p_details: Json
          p_period_month: number
          p_period_year: number
        }
        Returns: {
          distributed_count: number
          header_id: string
          total_target_revenue: number
          total_target_units: number
        }[]
      }
      crm_set_branch_target: {
        Args: {
          p_branch_id: string
          p_commission_percent: number
          p_period_month: number
          p_period_year: number
          p_selling_price_per_unit: number
          p_target_units: number
        }
        Returns: {
          branch_target_id: string
          distributed_count: number
        }[]
      }
      crm_set_product_sales_assignment: {
        Args: { p_assigned: boolean; p_product_id: string; p_sales_id: string }
        Returns: undefined
      }
      crm_set_prospect_green: {
        Args: { p_prospect_id: string }
        Returns: undefined
      }
      crm_upsert_product: {
        Args: {
          p_category?: string
          p_default_commission?: number
          p_default_price?: number
          p_id?: string
          p_product_name?: string
          p_status?: string
          p_unit?: string
        }
        Returns: string
      }
      crm_upsert_sales_target: {
        Args: {
          p_commission_percent: number
          p_period_month: number
          p_period_year: number
          p_sales_id: string
          p_target_units: number
        }
        Returns: string
      }
      decide_leave_request: {
        Args: {
          p_approve: boolean
          p_leave_request_id: string
          p_rejection_reason?: string
        }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          attachment_url: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          end_date: string
          id: string
          reason: string
          rejection_reason: string | null
          start_date: string
          status: string
          type: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "leave_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finance_run_cashflow_teaching_check: { Args: never; Returns: undefined }
      friday_enqueue_daily_briefing: { Args: never; Returns: undefined }
      friday_enqueue_holding_briefing: { Args: never; Returns: undefined }
      get_announcement_audience: {
        Args: { p_announcement_id: string }
        Returns: {
          user_id: string
        }[]
      }
      get_kos_occupancy: {
        Args: never
        Returns: {
          kosong: number
          property_id: string
          property_name: string
          terisi: number
          total: number
        }[]
      }
      get_kos_occupancy_internal: {
        Args: never
        Returns: {
          kosong: number
          property_id: string
          property_name: string
          terisi: number
          total: number
        }[]
      }
      get_memo_audience: {
        Args: { p_memo_id: string }
        Returns: {
          user_id: string
        }[]
      }
      get_sync_secret: { Args: never; Returns: string }
      health_check: { Args: never; Returns: Json }
      hr_discipline_evidence: { Args: { p_employee_id: string }; Returns: Json }
      hr_issue_warning: {
        Args: {
          p_action_type: string
          p_description: string
          p_employee_id: string
          p_reason_category: string
        }
        Returns: string
      }
      hr_revoke_disciplinary_action: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      hr_terminate_employee: {
        Args: {
          p_bypass_justification?: string
          p_description: string
          p_employee_id: string
          p_last_working_date?: string
          p_reason_category: string
        }
        Returns: string
      }
      kontenai_automation_dispatch: { Args: never; Returns: undefined }
      kpi_apply_ai_response: {
        Args: {
          p_action: string
          p_ai_guidance: string
          p_new_description: string
          p_new_title: string
          p_task_id: string
        }
        Returns: undefined
      }
      kpi_assign_tasks: {
        Args: {
          p_branch_id: string
          p_division_id?: string
          p_items: Json
          p_period_month: number
          p_period_week: number
          p_period_year: number
        }
        Returns: string[]
      }
      kpi_complete_task: { Args: { p_task_id: string }; Returns: undefined }
      kpi_delete_task: { Args: { p_task_id: string }; Returns: undefined }
      kpi_national_stats: {
        Args: { p_division_id?: string; p_month?: number; p_year?: number }
        Returns: {
          branch_ranking: Json
          current_week: number
          monthly_achievement_percent: number
          monthly_completed: number
          monthly_total: number
          overdue_count: number
          period_month: number
          period_year: number
          team_count: number
        }[]
      }
      kpi_ranking: {
        Args: {
          p_branch_id?: string
          p_division_id?: string
          p_month?: number
          p_scope?: string
          p_week?: number
          p_year?: number
        }
        Returns: {
          achievement_percent: number
          assigned: number
          branch_id: string
          branch_name: string
          completed: number
          rank: number
          rejected: number
          team_members: Json
        }[]
      }
      kpi_submit_obstacle_response: {
        Args: { p_response: string; p_task_id: string }
        Returns: undefined
      }
      kpi_team_stats: {
        Args: {
          p_branch_id?: string
          p_division_id?: string
          p_month?: number
          p_year?: number
        }
        Returns: {
          branch_id: string
          branch_name: string
          current_week: number
          division_id: string
          monthly_achievement_percent: number
          monthly_completed: number
          monthly_remaining: number
          monthly_total: number
          overdue_count: number
          period_month: number
          period_year: number
          team_members: Json
          waiting_review_count: number
          weekly_achievement_percent: number
          weekly_completed: number
          weekly_remaining: number
          weekly_total: number
        }[]
      }
      kpi_update_task: {
        Args: {
          p_description: string
          p_due_date: string
          p_task_id: string
          p_title: string
        }
        Returns: undefined
      }
      kpi_verify_task: {
        Args: { p_notes?: string; p_status: string; p_task_id: string }
        Returns: undefined
      }
      loonars_beauty_request_competitor_comparison: {
        Args: never
        Returns: undefined
      }
      loonars_beauty_request_content_ideas: { Args: never; Returns: undefined }
      loonars_beauty_request_weekly_content_audit: {
        Args: never
        Returns: undefined
      }
      loonars_beauty_request_weekly_evaluation: {
        Args: never
        Returns: undefined
      }
      loonars_beauty_run_competitor_comparison_dispatch: {
        Args: never
        Returns: undefined
      }
      loonars_beauty_run_content_ideas_dispatch: {
        Args: never
        Returns: undefined
      }
      loonars_beauty_run_weekly_content_audit_dispatch: {
        Args: never
        Returns: undefined
      }
      loonars_beauty_run_weekly_evaluation_dispatch: {
        Args: never
        Returns: undefined
      }
      loonars_closing_reject: {
        Args: { p_id: string; p_reason?: string }
        Returns: undefined
      }
      loonars_closing_verify: { Args: { p_id: string }; Returns: undefined }
      loonars_fee_request: {
        Args: { p_fee_amount: number; p_id: string }
        Returns: undefined
      }
      mark_absentees_alpha: { Args: { p_date?: string }; Returns: number }
      mark_all_notifications_read: { Args: never; Returns: undefined }
      mark_memo_read: { Args: { p_memo_id: string }; Returns: undefined }
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      markom_content_submitted: {
        Args: { p_submission_id: string }
        Returns: Json
      }
      markom_notify_kepala_cabang_pending: { Args: never; Returns: number }
      markom_reconcile_zernio_publish_status: {
        Args: never
        Returns: undefined
      }
      markom_request_ads_research: {
        Args: { p_branch_id: string; p_project_id: string }
        Returns: undefined
      }
      markom_request_competitor_discovery: {
        Args: { p_focus: string }
        Returns: undefined
      }
      markom_request_leasehold_competitor_comparison: {
        Args: never
        Returns: undefined
      }
      markom_run_ai_ads_dispatch: { Args: never; Returns: undefined }
      markom_run_ai_checklist_dispatch: { Args: never; Returns: undefined }
      markom_run_content_performance_broadcast_dispatch: {
        Args: never
        Returns: undefined
      }
      markom_weekly_reminder: { Args: never; Returns: number }
      mp_run_occupancy_teaching_biweekly: { Args: never; Returns: undefined }
      next_employee_code: { Args: never; Returns: string }
      postgres_fdw_disconnect: { Args: { "": string }; Returns: boolean }
      postgres_fdw_disconnect_all: { Args: never; Returns: boolean }
      postgres_fdw_get_connections: {
        Args: never
        Returns: Record<string, unknown>[]
      }
      postgres_fdw_handler: { Args: never; Returns: unknown }
      record_login_attempt: {
        Args: { p_email: string; p_ip_address?: string; p_success: boolean }
        Returns: undefined
      }
      reject_employee_registration: {
        Args: { p_employee_id: string; p_reason?: string }
        Returns: {
          address: string | null
          ads_lead_routing_paused: boolean
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          avatar_url: string | null
          birth_date: string | null
          branch_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          division_id: string | null
          email: string
          employee_code: string
          employment_status: string
          full_name: string
          gender: string | null
          id: string
          is_active: boolean
          is_root_owner: boolean
          join_date: string
          phone: string | null
          position_id: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          role_id: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "employees"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_hr_expense: {
        Args: { p_id: string; p_reason?: string }
        Returns: undefined
      }
      resolve_target_audience: {
        Args: { p_target_id: string; p_target_type: string }
        Returns: {
          user_id: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      social_run_competitor_discovery_dispatch: {
        Args: never
        Returns: undefined
      }
      social_run_leasehold_competitor_comparison_dispatch: {
        Args: never
        Returns: undefined
      }
      social_run_weekly_evaluation_dispatch: { Args: never; Returns: undefined }
      sync_collect_responses: { Args: never; Returns: undefined }
      sync_dispatch_pending: { Args: never; Returns: undefined }
      sync_inbound: {
        Args: {
          p_event_type: string
          p_idempotency_key: string
          p_payload: Json
        }
        Returns: Json
      }
      trigger_branch_balance_advisory_check: { Args: never; Returns: undefined }
      unaccent: { Args: { "": string }; Returns: string }
      wa_cleanup_pending_media_relay: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
