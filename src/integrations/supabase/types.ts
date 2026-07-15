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
      companies: {
        Row: {
          created_at: string
          description: string | null
          id: string
          legal_name: string | null
          name: string
          site_id: string
          status: string
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          legal_name?: string | null
          name: string
          site_id: string
          status?: string
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          legal_name?: string | null
          name?: string
          site_id?: string
          status?: string
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      company_custom_fields: {
        Row: {
          company_id: string
          created_at: string
          id: string
          site_custom_field_id: string
          updated_at: string
          value: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          site_custom_field_id: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          site_custom_field_id?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_custom_fields_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_custom_fields_site_custom_field_id_fkey"
            columns: ["site_custom_field_id"]
            isOneToOne: false
            referencedRelation: "site_custom_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_definitions: {
        Row: {
          created_at: string
          custom_field_name: string
          custom_field_type: string | null
          display_name: Json
          etag: string | null
          id: string
          is_deleted: boolean
          is_read_only: boolean
          synchronization_enabled: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_field_name: string
          custom_field_type?: string | null
          display_name?: Json
          etag?: string | null
          id?: string
          is_deleted?: boolean
          is_read_only?: boolean
          synchronization_enabled?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_field_name?: string
          custom_field_type?: string | null
          display_name?: Json
          etag?: string | null
          id?: string
          is_deleted?: boolean
          is_read_only?: boolean
          synchronization_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      identities: {
        Row: {
          account_id: string | null
          company_approvers: Json | null
          company_department_name: string | null
          company_id: string | null
          company_job_title: string | null
          company_name: string | null
          company_site_id: string | null
          company_supervisor_name: string | null
          company_worker_type_code: string | null
          company_worker_type_desc: string | null
          country_code: string | null
          created_at: string
          created_by: string | null
          creation_date_utc: string | null
          creation_on_behalf: string | null
          culture: string | null
          description: string | null
          display_name: string | null
          email: string | null
          etag: string | null
          first_name: string
          has_licensed_vehicles: boolean | null
          has_vehicles: boolean | null
          id: string
          identity_id: string | null
          identity_type: string | null
          is_deleted: boolean
          last_modification_date_utc: string | null
          last_modified_by: string | null
          last_name: string
          middle_name: string | null
          ordinal: number | null
          private_birthday: string | null
          private_city_of_residence: string | null
          private_employee_number: string | null
          private_phone_primary: string | null
          private_phone_secondary: string | null
          private_picture_blob_name: string | null
          private_secondary_email: string | null
          private_state_of_residence: string | null
          private_zip_code: string | null
          status: string
          system_access_permission_level: number | null
          system_activation_date_utc: string | null
          system_antipassback_exemption: boolean | null
          system_can_escort: boolean | null
          system_custom_fields: Json | null
          system_expiration_date_utc: string | null
          system_external_id: string | null
          system_external_sync_source_id: string | null
          system_external_sync_time_utc: string | null
          system_has_extended_time: boolean | null
          system_horizon_id: string | null
          system_provisioning_attributes: Json | null
          system_resource_filters: Json | null
          system_trigger_code: number | null
          updated_at: string
          worker_type_id: string | null
        }
        Insert: {
          account_id?: string | null
          company_approvers?: Json | null
          company_department_name?: string | null
          company_id?: string | null
          company_job_title?: string | null
          company_name?: string | null
          company_site_id?: string | null
          company_supervisor_name?: string | null
          company_worker_type_code?: string | null
          company_worker_type_desc?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          creation_date_utc?: string | null
          creation_on_behalf?: string | null
          culture?: string | null
          description?: string | null
          display_name?: string | null
          email?: string | null
          etag?: string | null
          first_name: string
          has_licensed_vehicles?: boolean | null
          has_vehicles?: boolean | null
          id?: string
          identity_id?: string | null
          identity_type?: string | null
          is_deleted?: boolean
          last_modification_date_utc?: string | null
          last_modified_by?: string | null
          last_name: string
          middle_name?: string | null
          ordinal?: number | null
          private_birthday?: string | null
          private_city_of_residence?: string | null
          private_employee_number?: string | null
          private_phone_primary?: string | null
          private_phone_secondary?: string | null
          private_picture_blob_name?: string | null
          private_secondary_email?: string | null
          private_state_of_residence?: string | null
          private_zip_code?: string | null
          status?: string
          system_access_permission_level?: number | null
          system_activation_date_utc?: string | null
          system_antipassback_exemption?: boolean | null
          system_can_escort?: boolean | null
          system_custom_fields?: Json | null
          system_expiration_date_utc?: string | null
          system_external_id?: string | null
          system_external_sync_source_id?: string | null
          system_external_sync_time_utc?: string | null
          system_has_extended_time?: boolean | null
          system_horizon_id?: string | null
          system_provisioning_attributes?: Json | null
          system_resource_filters?: Json | null
          system_trigger_code?: number | null
          updated_at?: string
          worker_type_id?: string | null
        }
        Update: {
          account_id?: string | null
          company_approvers?: Json | null
          company_department_name?: string | null
          company_id?: string | null
          company_job_title?: string | null
          company_name?: string | null
          company_site_id?: string | null
          company_supervisor_name?: string | null
          company_worker_type_code?: string | null
          company_worker_type_desc?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          creation_date_utc?: string | null
          creation_on_behalf?: string | null
          culture?: string | null
          description?: string | null
          display_name?: string | null
          email?: string | null
          etag?: string | null
          first_name?: string
          has_licensed_vehicles?: boolean | null
          has_vehicles?: boolean | null
          id?: string
          identity_id?: string | null
          identity_type?: string | null
          is_deleted?: boolean
          last_modification_date_utc?: string | null
          last_modified_by?: string | null
          last_name?: string
          middle_name?: string | null
          ordinal?: number | null
          private_birthday?: string | null
          private_city_of_residence?: string | null
          private_employee_number?: string | null
          private_phone_primary?: string | null
          private_phone_secondary?: string | null
          private_picture_blob_name?: string | null
          private_secondary_email?: string | null
          private_state_of_residence?: string | null
          private_zip_code?: string | null
          status?: string
          system_access_permission_level?: number | null
          system_activation_date_utc?: string | null
          system_antipassback_exemption?: boolean | null
          system_can_escort?: boolean | null
          system_custom_fields?: Json | null
          system_expiration_date_utc?: string | null
          system_external_id?: string | null
          system_external_sync_source_id?: string | null
          system_external_sync_time_utc?: string | null
          system_has_extended_time?: boolean | null
          system_horizon_id?: string | null
          system_provisioning_attributes?: Json | null
          system_resource_filters?: Json | null
          system_trigger_code?: number | null
          updated_at?: string
          worker_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "identities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_custom_fields: {
        Row: {
          created_at: string
          id: string
          identity_id: string
          site_custom_field_id: string
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          identity_id: string
          site_custom_field_id: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          identity_id?: string
          site_custom_field_id?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "identity_custom_fields_identity_id_fkey"
            columns: ["identity_id"]
            isOneToOne: false
            referencedRelation: "identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identity_custom_fields_site_custom_field_id_fkey"
            columns: ["site_custom_field_id"]
            isOneToOne: false
            referencedRelation: "site_custom_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_field_labels: {
        Row: {
          alias: Json
          created_at: string
          display_index: number | null
          field_key: string
          id: string
          is_visible: boolean
          updated_at: string
        }
        Insert: {
          alias?: Json
          created_at?: string
          display_index?: number | null
          field_key: string
          id?: string
          is_visible?: boolean
          updated_at?: string
        }
        Update: {
          alias?: Json
          created_at?: string
          display_index?: number | null
          field_key?: string
          id?: string
          is_visible?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          accent_color: string
          account_id: string | null
          argus_api_key: string | null
          argus_base_url: string
          client_logo: string
          client_name: string
          created_at: string
          default_rule_id: string | null
          default_rule_name: string | null
          default_site_id: string | null
          default_site_name: string | null
          preferences: Json
          primary_color: string
          system_object_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accent_color?: string
          account_id?: string | null
          argus_api_key?: string | null
          argus_base_url?: string
          client_logo?: string
          client_name?: string
          created_at?: string
          default_rule_id?: string | null
          default_rule_name?: string | null
          default_site_id?: string | null
          default_site_name?: string | null
          preferences?: Json
          primary_color?: string
          system_object_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          accent_color?: string
          account_id?: string | null
          argus_api_key?: string | null
          argus_base_url?: string
          client_logo?: string
          client_name?: string
          created_at?: string
          default_rule_id?: string | null
          default_rule_name?: string | null
          default_site_id?: string | null
          default_site_name?: string | null
          preferences?: Json
          primary_color?: string
          system_object_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      site_custom_fields: {
        Row: {
          created_at: string
          definition_id: string
          display_index: number | null
          display_name_override: Json
          entity_type: string
          fillable: boolean
          id: string
          is_active: boolean
          is_required: boolean
          related_identity_field_id: string | null
          site_id: string
          updated_at: string
          value_range: Json | null
          worker_type_id: string | null
        }
        Insert: {
          created_at?: string
          definition_id: string
          display_index?: number | null
          display_name_override?: Json
          entity_type?: string
          fillable?: boolean
          id?: string
          is_active?: boolean
          is_required?: boolean
          related_identity_field_id?: string | null
          site_id: string
          updated_at?: string
          value_range?: Json | null
          worker_type_id?: string | null
        }
        Update: {
          created_at?: string
          definition_id?: string
          display_index?: number | null
          display_name_override?: Json
          entity_type?: string
          fillable?: boolean
          id?: string
          is_active?: boolean
          is_required?: boolean
          related_identity_field_id?: string | null
          site_id?: string
          updated_at?: string
          value_range?: Json | null
          worker_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_custom_fields_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "custom_field_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_custom_fields_related_identity_field_id_fkey"
            columns: ["related_identity_field_id"]
            isOneToOne: false
            referencedRelation: "site_custom_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_custom_fields_worker_type_id_fkey"
            columns: ["worker_type_id"]
            isOneToOne: false
            referencedRelation: "worker_types"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_types: {
        Row: {
          argus_worker_type_code: string | null
          code: string
          created_at: string
          display_index: number | null
          id: string
          is_active: boolean
          name: string
          name_i18n: Json
          updated_at: string
        }
        Insert: {
          argus_worker_type_code?: string | null
          code: string
          created_at?: string
          display_index?: number | null
          id?: string
          is_active?: boolean
          name: string
          name_i18n?: Json
          updated_at?: string
        }
        Update: {
          argus_worker_type_code?: string | null
          code?: string
          created_at?: string
          display_index?: number | null
          id?: string
          is_active?: boolean
          name?: string
          name_i18n?: Json
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
