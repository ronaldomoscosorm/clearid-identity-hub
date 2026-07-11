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
      custom_field_definitions: {
        Row: {
          created_at: string
          custom_field_name: string
          custom_field_type: string | null
          display_index: number | null
          display_name: string | null
          etag: string | null
          id: string
          is_deleted: boolean
          is_read_only: boolean
          section_name: string | null
          synchronization_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_field_name: string
          custom_field_type?: string | null
          display_index?: number | null
          display_name?: string | null
          etag?: string | null
          id?: string
          is_deleted?: boolean
          is_read_only?: boolean
          section_name?: string | null
          synchronization_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          custom_field_name?: string
          custom_field_type?: string | null
          display_index?: number | null
          display_name?: string | null
          etag?: string | null
          id?: string
          is_deleted?: boolean
          is_read_only?: boolean
          section_name?: string | null
          synchronization_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      identities: {
        Row: {
          account_id: string | null
          company_data: Json | null
          country_code: string | null
          created_at: string
          creation_date_utc: string | null
          culture: string | null
          description: string | null
          display_name: string | null
          email: string | null
          etag: string | null
          external_id: string | null
          first_name: string
          id: string
          identity_id: string | null
          identity_type: string | null
          last_modification_date_utc: string | null
          last_name: string
          middle_name: string | null
          picture: Json | null
          private_data: Json | null
          score: number | null
          site_id: string | null
          status: string
          system_data: Json | null
          updated_at: string
          user_id: string
          worker_type_code: string | null
        }
        Insert: {
          account_id?: string | null
          company_data?: Json | null
          country_code?: string | null
          created_at?: string
          creation_date_utc?: string | null
          culture?: string | null
          description?: string | null
          display_name?: string | null
          email?: string | null
          etag?: string | null
          external_id?: string | null
          first_name: string
          id?: string
          identity_id?: string | null
          identity_type?: string | null
          last_modification_date_utc?: string | null
          last_name: string
          middle_name?: string | null
          picture?: Json | null
          private_data?: Json | null
          score?: number | null
          site_id?: string | null
          status?: string
          system_data?: Json | null
          updated_at?: string
          user_id?: string
          worker_type_code?: string | null
        }
        Update: {
          account_id?: string | null
          company_data?: Json | null
          country_code?: string | null
          created_at?: string
          creation_date_utc?: string | null
          culture?: string | null
          description?: string | null
          display_name?: string | null
          email?: string | null
          etag?: string | null
          external_id?: string | null
          first_name?: string
          id?: string
          identity_id?: string | null
          identity_type?: string | null
          last_modification_date_utc?: string | null
          last_name?: string
          middle_name?: string | null
          picture?: Json | null
          private_data?: Json | null
          score?: number | null
          site_id?: string | null
          status?: string
          system_data?: Json | null
          updated_at?: string
          user_id?: string
          worker_type_code?: string | null
        }
        Relationships: []
      }
      identity_custom_fields: {
        Row: {
          created_at: string
          custom_field_name: string
          custom_field_value: string | null
          definition_id: string | null
          id: string
          identity_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_field_name: string
          custom_field_value?: string | null
          definition_id?: string | null
          id?: string
          identity_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          custom_field_name?: string
          custom_field_value?: string | null
          definition_id?: string | null
          id?: string
          identity_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "identity_custom_fields_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "custom_field_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identity_custom_fields_identity_id_fkey"
            columns: ["identity_id"]
            isOneToOne: false
            referencedRelation: "identities"
            referencedColumns: ["id"]
          },
        ]
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
