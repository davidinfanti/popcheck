export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_guidance_versions: {
        Row: {
          category: string
          created_at: string
          created_by: string
          guidance: string
          id: string
          previous_version_id: string | null
          version: number
        }
        Insert: {
          category: string
          created_at?: string
          created_by: string
          guidance: string
          id?: string
          previous_version_id?: string | null
          version: number
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string
          guidance?: string
          id?: string
          previous_version_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_guidance_versions_previous_version_id_fkey"
            columns: ["previous_version_id"]
            isOneToOne: false
            referencedRelation: "ai_guidance_versions"
            referencedColumns: ["id"]
          },
        ]
      }
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
      assessment_runs: {
        Row: {
          authentication_id: string
          candidate_identity: Json
          completion_token: string | null
          created_at: string
          decision_engine_version: string
          dimensions: Json
          guidance_version_id: string | null
          id: string
          limitations: Json
          missing_evidence: Json
          model: string
          observation_schema_version: string
          prompt_version: string
          run_kind: string
          source: string
          structured_guidance_version_id: string | null
          structured_observations: Json
          verdict: Json
        }
        Insert: {
          authentication_id: string
          candidate_identity: Json
          completion_token?: string | null
          created_at?: string
          decision_engine_version: string
          dimensions: Json
          guidance_version_id?: string | null
          id?: string
          limitations?: Json
          missing_evidence?: Json
          model: string
          observation_schema_version: string
          prompt_version: string
          run_kind?: string
          source: string
          structured_guidance_version_id?: string | null
          structured_observations: Json
          verdict: Json
        }
        Update: {
          authentication_id?: string
          candidate_identity?: Json
          completion_token?: string | null
          created_at?: string
          decision_engine_version?: string
          dimensions?: Json
          guidance_version_id?: string | null
          id?: string
          limitations?: Json
          missing_evidence?: Json
          model?: string
          observation_schema_version?: string
          prompt_version?: string
          run_kind?: string
          source?: string
          structured_guidance_version_id?: string | null
          structured_observations?: Json
          verdict?: Json
        }
        Relationships: [
          {
            foreignKeyName: "assessment_runs_authentication_id_fkey"
            columns: ["authentication_id"]
            isOneToOne: false
            referencedRelation: "authentications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_runs_guidance_version_id_fkey"
            columns: ["guidance_version_id"]
            isOneToOne: false
            referencedRelation: "ai_guidance_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_runs_structured_guidance_version_id_fkey"
            columns: ["structured_guidance_version_id"]
            isOneToOne: false
            referencedRelation: "structured_guidance_versions"
            referencedColumns: ["id"]
          },
        ]
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
      structured_guidance_versions: {
        Row: {
          action: string
          applicable_product_id: string | null
          applicable_release_range: unknown
          applicable_variant_id: string | null
          created_at: string
          created_by: string
          guidance_type: string
          id: string
          inspection_area: string
          previous_version_id: string | null
          priority: string
          reference_requirement: string
          structured_note: string
          version: number
        }
        Insert: {
          action: string
          applicable_product_id?: string | null
          applicable_release_range?: unknown
          applicable_variant_id?: string | null
          created_at?: string
          created_by: string
          guidance_type: string
          id?: string
          inspection_area: string
          previous_version_id?: string | null
          priority: string
          reference_requirement: string
          structured_note?: string
          version: number
        }
        Update: {
          action?: string
          applicable_product_id?: string | null
          applicable_release_range?: unknown
          applicable_variant_id?: string | null
          created_at?: string
          created_by?: string
          guidance_type?: string
          id?: string
          inspection_area?: string
          previous_version_id?: string | null
          priority?: string
          reference_requirement?: string
          structured_note?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "structured_guidance_versions_previous_version_id_fkey"
            columns: ["previous_version_id"]
            isOneToOne: false
            referencedRelation: "structured_guidance_versions"
            referencedColumns: ["id"]
          },
        ]
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
      backfill_legacy_assessment_runs: { Args: never; Returns: number }
      complete_phase_1b_assessment: {
        Args: {
          p_authentication_id: string
          p_candidate_identity: Json
          p_completion_token: string
          p_created_at: string
          p_decision_engine_version: string
          p_dimensions: Json
          p_expected_previous_run_id: string
          p_legacy_unverified_references_used: boolean
          p_limitations: Json
          p_missing_evidence: Json
          p_model: string
          p_observation_schema_version: string
          p_prompt_version: string
          p_snapshot: Json
          p_source: string
          p_structured_guidance_version_id: string
          p_structured_observations: Json
          p_user_id: string
          p_verdict: Json
        }
        Returns: {
          authentication_id: string
          candidate_identity: Json
          completion_token: string | null
          created_at: string
          decision_engine_version: string
          dimensions: Json
          guidance_version_id: string | null
          id: string
          limitations: Json
          missing_evidence: Json
          model: string
          observation_schema_version: string
          prompt_version: string
          run_kind: string
          source: string
          structured_guidance_version_id: string | null
          structured_observations: Json
          verdict: Json
        }
        SetofOptions: {
          from: "*"
          to: "assessment_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_ai_guidance_version: {
        Args: { p_category: string; p_guidance: string }
        Returns: {
          category: string
          created_at: string
          created_by: string
          guidance: string
          id: string
          previous_version_id: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "ai_guidance_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_structured_guidance_version: {
        Args: {
          p_action: string
          p_applicable_product_id: string
          p_applicable_variant_id: string
          p_guidance_type: string
          p_inspection_area: string
          p_priority: string
          p_reference_requirement: string
          p_release_year_from: number
          p_release_year_to: number
          p_structured_note: string
        }
        Returns: {
          action: string
          applicable_product_id: string | null
          applicable_release_range: unknown
          applicable_variant_id: string | null
          created_at: string
          created_by: string
          guidance_type: string
          id: string
          inspection_area: string
          previous_version_id: string | null
          priority: string
          reference_requirement: string
          structured_note: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "structured_guidance_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_shared_assessment_runs: {
        Args: { p_id: string; p_token: string }
        Returns: {
          authentication_id: string
          candidate_identity: Json
          completion_token: string | null
          created_at: string
          decision_engine_version: string
          dimensions: Json
          guidance_version_id: string | null
          id: string
          limitations: Json
          missing_evidence: Json
          model: string
          observation_schema_version: string
          prompt_version: string
          run_kind: string
          source: string
          structured_guidance_version_id: string | null
          structured_observations: Json
          verdict: Json
        }[]
        SetofOptions: {
          from: "*"
          to: "assessment_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_shared_authentication: {
        Args: { p_id: string; p_token: string }
        Returns: {
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
