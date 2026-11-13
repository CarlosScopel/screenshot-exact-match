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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          body: string
          cohort_ids: string[]
          created_at: string
          id: string
          pinned: boolean
          published_at: string
          title: string
        }
        Insert: {
          body?: string
          cohort_ids?: string[]
          created_at?: string
          id?: string
          pinned?: boolean
          published_at?: string
          title: string
        }
        Update: {
          body?: string
          cohort_ids?: string[]
          created_at?: string
          id?: string
          pinned?: boolean
          published_at?: string
          title?: string
        }
        Relationships: []
      }
      cohort_members: {
        Row: {
          cohort_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          cohort_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          cohort_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_members_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cohorts: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      lesson_materials: {
        Row: {
          created_at: string
          file_path: string | null
          id: string
          lesson_id: string
          position: number
          title: string
          url: string | null
        }
        Insert: {
          created_at?: string
          file_path?: string | null
          id?: string
          lesson_id: string
          position?: number
          title: string
          url?: string | null
        }
        Update: {
          created_at?: string
          file_path?: string | null
          id?: string
          lesson_id?: string
          position?: number
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_materials_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_notes: {
        Row: {
          content: string
          lesson_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          lesson_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          lesson_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_notes_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_progress: {
        Row: {
          completed: boolean
          completed_at: string | null
          lesson_id: string
          position_seconds: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          lesson_id: string
          position_seconds?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          lesson_id?: string
          position_seconds?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          available_at: string | null
          content: string | null
          created_at: string
          description: string | null
          duration_minutes: number | null
          id: string
          module_id: string
          position: number
          status: Database["public"]["Enums"]["content_status"]
          thumbnail_url: string | null
          title: string
          video_url: string | null
        }
        Insert: {
          available_at?: string | null
          content?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          module_id: string
          position?: number
          status?: Database["public"]["Enums"]["content_status"]
          thumbnail_url?: string | null
          title: string
          video_url?: string | null
        }
        Update: {
          available_at?: string | null
          content?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          module_id?: string
          position?: number
          status?: Database["public"]["Enums"]["content_status"]
          thumbnail_url?: string | null
          title?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      library_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          position: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          position?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          position?: number
        }
        Relationships: []
      }
      library_items: {
        Row: {
          body: string | null
          category_id: string | null
          cohort_ids: string[]
          cover_url: string | null
          created_at: string
          description: string | null
          file_name: string | null
          file_path: string | null
          id: string
          kind: string
          published_at: string | null
          status: Database["public"]["Enums"]["content_status"]
          tags: string[]
          title: string
          url: string | null
        }
        Insert: {
          body?: string | null
          category_id?: string | null
          cohort_ids?: string[]
          cover_url?: string | null
          created_at?: string
          description?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          kind?: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          tags?: string[]
          title: string
          url?: string | null
        }
        Update: {
          body?: string | null
          category_id?: string | null
          cohort_ids?: string[]
          cover_url?: string | null
          created_at?: string
          description?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          kind?: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          tags?: string[]
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "library_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "library_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      mentorship_installments: {
        Row: {
          amount_cents: number
          confirmed_by: string | null
          due_date: string
          id: string
          number: number
          paid_at: string | null
          paid_on: string | null
          payment_note: string
          plan_id: string
        }
        Insert: {
          amount_cents: number
          confirmed_by?: string | null
          due_date: string
          id?: string
          number: number
          paid_at?: string | null
          paid_on?: string | null
          payment_note?: string
          plan_id: string
        }
        Update: {
          amount_cents?: number
          confirmed_by?: string | null
          due_date?: string
          id?: string
          number?: number
          paid_at?: string | null
          paid_on?: string | null
          payment_note?: string
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentorship_installments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "mentorship_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      mentorship_plans: {
        Row: {
          created_at: string
          created_by: string
          duration_count: number
          duration_unit: string
          end_date: string
          ends_at: string
          first_due_date: string
          id: string
          installment_count: number
          revision: number
          start_date: string
          starts_at: string
          total_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          duration_count: number
          duration_unit: string
          end_date: string
          ends_at: string
          first_due_date: string
          id: string
          installment_count: number
          revision?: number
          start_date: string
          starts_at: string
          total_cents: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          duration_count?: number
          duration_unit?: string
          end_date?: string
          ends_at?: string
          first_due_date?: string
          id?: string
          installment_count?: number
          revision?: number
          start_date?: string
          starts_at?: string
          total_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentorship_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mentorship_receipts: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          id: string
          installment_id: string
          paid_on: string
          review_note: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          installment_id: string
          paid_on: string
          review_note?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          installment_id?: string
          paid_on?: string
          review_note?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentorship_receipts_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "mentorship_installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentorship_receipts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mentorship_recording_learning: {
        Row: {
          content: string
          position_seconds: number
          recording_id: string
          revision: number
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          position_seconds?: number
          recording_id: string
          revision?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          position_seconds?: number
          recording_id?: string
          revision?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentorship_recording_learning_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: true
            referencedRelation: "mentorship_recordings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentorship_recording_learning_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mentorship_recordings: {
        Row: {
          created_at: string
          description: string
          file_name: string
          file_path: string
          id: string
          mime_type: string
          recorded_on: string
          size_bytes: number
          status: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          file_name: string
          file_path: string
          id?: string
          mime_type: string
          recorded_on: string
          size_bytes: number
          status?: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string
          recorded_on?: string
          size_bytes?: number
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentorship_recordings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      modules: {
        Row: {
          created_at: string
          description: string | null
          id: string
          position: number
          status: Database["public"]["Enums"]["content_status"]
          title: string
          training_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          position?: number
          status?: Database["public"]["Enums"]["content_status"]
          title: string
          training_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          position?: number
          status?: Database["public"]["Enums"]["content_status"]
          title?: string
          training_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "modules_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          favicon_url: string | null
          id: number
          login_image_url: string | null
          login_subtitle: string
          login_title: string
          logo_url: string | null
          platform_name: string
          primary_color: string
          social_links: Json
          support_email: string | null
          support_whatsapp: string | null
          updated_at: string
          welcome_message: string
        }
        Insert: {
          favicon_url?: string | null
          id?: number
          login_image_url?: string | null
          login_subtitle?: string
          login_title?: string
          logo_url?: string | null
          platform_name?: string
          primary_color?: string
          social_links?: Json
          support_email?: string | null
          support_whatsapp?: string | null
          updated_at?: string
          welcome_message?: string
        }
        Update: {
          favicon_url?: string | null
          id?: number
          login_image_url?: string | null
          login_subtitle?: string
          login_title?: string
          logo_url?: string | null
          platform_name?: string
          primary_color?: string
          social_links?: Json
          support_email?: string | null
          support_whatsapp?: string | null
          updated_at?: string
          welcome_message?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          access_expires_at: string | null
          admin_notes: string | null
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          last_seen_at: string | null
          status: string
        }
        Insert: {
          access_expires_at?: string | null
          admin_notes?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id: string
          last_seen_at?: string | null
          status?: string
        }
        Update: {
          access_expires_at?: string | null
          admin_notes?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          last_seen_at?: string | null
          status?: string
        }
        Relationships: []
      }
      tools: {
        Row: {
          category: string | null
          cohort_ids: string[]
          created_at: string
          description: string | null
          enabled: boolean
          icon: string
          id: string
          kind: string
          name: string
          position: number
          route: string | null
          status: string
          url: string | null
        }
        Insert: {
          category?: string | null
          cohort_ids?: string[]
          created_at?: string
          description?: string | null
          enabled?: boolean
          icon?: string
          id?: string
          kind?: string
          name: string
          position?: number
          route?: string | null
          status?: string
          url?: string | null
        }
        Update: {
          category?: string | null
          cohort_ids?: string[]
          created_at?: string
          description?: string | null
          enabled?: boolean
          icon?: string
          id?: string
          kind?: string
          name?: string
          position?: number
          route?: string | null
          status?: string
          url?: string | null
        }
        Relationships: []
      }
      training_cohorts: {
        Row: {
          cohort_id: string
          training_id: string
        }
        Insert: {
          cohort_id: string
          training_id: string
        }
        Update: {
          cohort_id?: string
          training_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_cohorts_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_cohorts_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
        ]
      }
      training_grants: {
        Row: {
          training_id: string
          user_id: string
        }
        Insert: {
          training_id: string
          user_id: string
        }
        Update: {
          training_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_grants_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trainings: {
        Row: {
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          position: number
          published_at: string | null
          status: Database["public"]["Enums"]["content_status"]
          title: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          position?: number
          published_at?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          title: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          position?: number
          published_at?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          title?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_lesson: {
        Args: { _lesson_id: string; _user_id: string }
        Returns: boolean
      }
      can_access_training: {
        Args: { _training_id: string; _user_id: string }
        Returns: boolean
      }
      can_read_material: {
        Args: { _path: string; _user_id: string }
        Returns: boolean
      }
      get_public_branding: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      in_audience: {
        Args: { _cohorts: string[]; _user_id: string }
        Returns: boolean
      }
      is_active_member: { Args: { _user_id: string }; Returns: boolean }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      mentorship_account: { Args: { p_user_id?: string }; Returns: Json }
      mentorship_confirm_payment: {
        Args: { p_installment_id: string; p_note?: string; p_paid_on: string }
        Returns: undefined
      }
      mentorship_receipt_path: {
        Args: { p_path: string; p_upload?: boolean }
        Returns: boolean
      }
      mentorship_register_receipt: {
        Args: {
          p_file_name: string
          p_installment_id: string
          p_paid_on: string
          p_path: string
        }
        Returns: string
      }
      mentorship_review_receipt: {
        Args: { p_decision: string; p_note?: string; p_receipt_id: string }
        Returns: undefined
      }
      mentorship_save_plan: {
        Args: {
          p_duration_count: number
          p_duration_unit: string
          p_expected_revision?: number
          p_first_due_date: string
          p_id: string
          p_installment_count: number
          p_start_date: string
          p_total_cents: number
          p_user_id: string
        }
        Returns: string
      }
      recordings_can_read: { Args: { p_id: string }; Returns: boolean }
      recordings_can_read_path: { Args: { p_path: string }; Returns: boolean }
      recordings_can_upload: { Args: { p_path: string }; Returns: boolean }
      recordings_create: {
        Args: {
          p_description: string
          p_file_name: string
          p_mime_type: string
          p_recorded_on: string
          p_size_bytes: number
          p_title: string
          p_user_id: string
        }
        Returns: Json
      }
      recordings_learning: { Args: { p_id: string }; Returns: Json }
      recordings_list: { Args: { p_user_id: string }; Returns: Json }
      recordings_publish: { Args: { p_id: string }; Returns: Json }
      recordings_save_note: {
        Args: { p_content: string; p_id: string; p_revision: number }
        Returns: Json
      }
      recordings_save_position: {
        Args: { p_id: string; p_seconds: number }
        Returns: undefined
      }
      touch_last_seen: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "mentorado" | "suporte" | "moderador"
      content_status: "draft" | "published"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "mentorado", "suporte", "moderador"],
      content_status: ["draft", "published"],
    },
  },
} as const
