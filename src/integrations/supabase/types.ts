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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      authentications: {
        Row: {
          analysis_config_version: string | null
          analysis_model: string | null
          analysis_source: string | null
          analyzed_at: string | null
          cache_key: string | null
          cached_from_id: string | null
          created_at: string
          details: Json | null
          id: string
          image_urls: string[] | null
          legacy_unverified_references_used: boolean | null
          pop_name: string | null
          pop_number: string | null
          score: number | null
          share_token: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis_config_version?: string | null
          analysis_model?: string | null
          analysis_source?: string | null
          analyzed_at?: string | null
          cache_key?: string | null
          cached_from_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          image_urls?: string[] | null
          legacy_unverified_references_used?: boolean | null
          pop_name?: string | null
          pop_number?: string | null
          score?: number | null
          share_token?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis_config_version?: string | null
          analysis_model?: string | null
          analysis_source?: string | null
          analyzed_at?: string | null
          cache_key?: string | null
          cached_from_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          image_urls?: string[] | null
          legacy_unverified_references_used?: boolean | null
          pop_name?: string | null
          pop_number?: string | null
          score?: number | null
          share_token?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "authentications_cached_from_id_fkey"
            columns: ["cached_from_id"]
            isOneToOne: false
            referencedRelation: "authentications"
            referencedColumns: ["id"]
          },
        ]
      }
      expert_training: {
        Row: {
          admin_notes: string | null
          created_at: string
          detected_fake_trait: string | null
          id: string
          report_id: string
          status: string
          user_comment: string | null
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          detected_fake_trait?: string | null
          id?: string
          report_id: string
          status?: string
          user_comment?: string | null
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          detected_fake_trait?: string | null
          id?: string
          report_id?: string
          status?: string
          user_comment?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expert_training_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "authentications"
            referencedColumns: ["id"]
          },
        ]
      }
      fake_references: {
        Row: {
          created_at: string
          detected_flaw: string | null
          id: string
          image_url: string
          part_type: string
          pop_number: string
        }
        Insert: {
          created_at?: string
          detected_flaw?: string | null
          id?: string
          image_url: string
          part_type: string
          pop_number: string
        }
        Update: {
          created_at?: string
          detected_flaw?: string | null
          id?: string
          image_url?: string
          part_type?: string
          pop_number?: string
        }
        Relationships: []
      }
      internal_forensic_manual: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          severity: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          severity?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          severity?: string
        }
        Relationships: []
      }
      negative_references: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          fake_trait: string
          id: string
          image_urls: string[] | null
          pop_name: string | null
          pop_number: string | null
          report_id: string | null
          training_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          fake_trait: string
          id?: string
          image_urls?: string[] | null
          pop_name?: string | null
          pop_number?: string | null
          report_id?: string | null
          training_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          fake_trait?: string
          id?: string
          image_urls?: string[] | null
          pop_name?: string | null
          pop_number?: string | null
          report_id?: string | null
          training_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "negative_references_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "authentications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negative_references_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "expert_training"
            referencedColumns: ["id"]
          },
        ]
      }
      original_references: {
        Row: {
          created_at: string
          expert_note: string | null
          id: string
          image_url: string
          part_type: string
          pop_number: string
        }
        Insert: {
          created_at?: string
          expert_note?: string | null
          id?: string
          image_url: string
          part_type: string
          pop_number: string
        }
        Update: {
          created_at?: string
          expert_note?: string | null
          id?: string
          image_url?: string
          part_type?: string
          pop_number?: string
        }
        Relationships: []
      }
      pop_reference_library: {
        Row: {
          critical_notes: string | null
          expected_logos: string | null
          factory_codes: string[] | null
          id: string
          master_image_url: string | null
          name: string | null
          pop_number: string | null
          release_year: number | null
        }
        Insert: {
          critical_notes?: string | null
          expected_logos?: string | null
          factory_codes?: string[] | null
          id?: string
          master_image_url?: string | null
          name?: string | null
          pop_number?: string | null
          release_year?: number | null
        }
        Update: {
          critical_notes?: string | null
          expected_logos?: string | null
          factory_codes?: string[] | null
          id?: string
          master_image_url?: string | null
          name?: string | null
          pop_number?: string | null
          release_year?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reference_pops: {
        Row: {
          barcode_data: string | null
          category: string | null
          created_at: string
          id: string
          is_vaulted: boolean | null
          key_details: Json | null
          name: string
          number: string | null
          official_image_url: string | null
          production_code_prefix: string | null
        }
        Insert: {
          barcode_data?: string | null
          category?: string | null
          created_at?: string
          id?: string
          is_vaulted?: boolean | null
          key_details?: Json | null
          name: string
          number?: string | null
          official_image_url?: string | null
          production_code_prefix?: string | null
        }
        Update: {
          barcode_data?: string | null
          category?: string | null
          created_at?: string
          id?: string
          is_vaulted?: boolean | null
          key_details?: Json | null
          name?: string
          number?: string | null
          official_image_url?: string | null
          production_code_prefix?: string | null
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
      get_shared_authentication: {
        Args: { p_id: string; p_token: string }
        Returns: {
          cache_key: string | null
          cached_from_id: string | null
          created_at: string
          details: Json | null
          id: string
          image_urls: string[] | null
          pop_name: string | null
          pop_number: string | null
          score: number | null
          share_token: string
          status: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "authentications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
