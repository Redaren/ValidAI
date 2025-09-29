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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      documents: {
        Row: {
          created_at: string
          deleted_at: string | null
          document_type: string | null
          id: string
          metadata: Json | null
          mime_type: string
          name: string
          organization_id: string
          original_filename: string
          size_bytes: number
          storage_path: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          document_type?: string | null
          id?: string
          metadata?: Json | null
          mime_type: string
          name: string
          organization_id: string
          original_filename: string
          size_bytes: number
          storage_path: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          document_type?: string | null
          id?: string
          metadata?: Json | null
          mime_type?: string
          name?: string
          organization_id?: string
          original_filename?: string
          size_bytes?: number
          storage_path?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      operations: {
        Row: {
          area: string
          configuration: Json | null
          created_at: string
          description: string | null
          id: string
          name: string
          operation_type: Database["public"]["Enums"]["operation_type"]
          output_schema: Json | null
          position: number
          processor_id: string
          prompt: string
          required: boolean
          updated_at: string
          validation_rules: Json | null
        }
        Insert: {
          area?: string
          configuration?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          operation_type: Database["public"]["Enums"]["operation_type"]
          output_schema?: Json | null
          position: number
          processor_id: string
          prompt: string
          required?: boolean
          updated_at?: string
          validation_rules?: Json | null
        }
        Update: {
          area?: string
          configuration?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          operation_type?: Database["public"]["Enums"]["operation_type"]
          output_schema?: Json | null
          position?: number
          processor_id?: string
          prompt?: string
          required?: boolean
          updated_at?: string
          validation_rules?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "operations_processor_id_fkey"
            columns: ["processor_id"]
            isOneToOne: false
            referencedRelation: "processors"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          joined_at: string | null
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          joined_at?: string | null
          organization_id: string
          role: string
          user_id: string
        }
        Update: {
          joined_at?: string | null
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          created_by: string
          id: string
          name: string
          plan_type: string | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          id?: string
          name: string
          plan_type?: string | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          id?: string
          name?: string
          plan_type?: string | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      processors: {
        Row: {
          area_configuration: Json | null
          configuration: Json | null
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
          document_type: string | null
          id: string
          name: string
          organization_id: string
          published_at: string | null
          status: Database["public"]["Enums"]["processor_status"]
          system_prompt: string | null
          tags: string[] | null
          updated_at: string
          visibility: Database["public"]["Enums"]["processor_visibility"]
        }
        Insert: {
          area_configuration?: Json | null
          configuration?: Json | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string | null
          document_type?: string | null
          id?: string
          name: string
          organization_id: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["processor_status"]
          system_prompt?: string | null
          tags?: string[] | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["processor_visibility"]
        }
        Update: {
          area_configuration?: Json | null
          configuration?: Json | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          document_type?: string | null
          id?: string
          name?: string
          organization_id?: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["processor_status"]
          system_prompt?: string | null
          tags?: string[] | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["processor_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "processors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_organization: {
        Args: { org_name: string; org_slug?: string }
        Returns: Json
      }
      create_processor_with_operations: {
        Args: {
          p_area_configuration?: Json
          p_configuration?: Json
          p_description?: string
          p_document_type?: string
          p_name: string
          p_operations?: Json
          p_status?: Database["public"]["Enums"]["processor_status"]
          p_system_prompt?: string
          p_tags?: string[]
          p_visibility?: Database["public"]["Enums"]["processor_visibility"]
        }
        Returns: {
          operations_created: number
          processor_id: string
          processor_name: string
          processor_status: Database["public"]["Enums"]["processor_status"]
        }[]
      }
      generate_unique_org_slug: {
        Args: { base_name: string }
        Returns: string
      }
      get_current_organization: {
        Args: Record<PropertyKey, never>
        Returns: {
          created_at: string
          created_by: string
          organization_id: string
          organization_name: string
          organization_slug: string
          plan_type: string
          updated_at: string
          user_role: string
        }[]
      }
      get_current_organization_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_ordered_operations: {
        Args: { p_processor_id: string }
        Returns: {
          area: string
          configuration: Json
          display_order: number
          operation_description: string
          operation_id: string
          operation_name: string
          operation_type: Database["public"]["Enums"]["operation_type"]
          output_schema: Json
          position: number
          prompt: string
          required: boolean
          validation_rules: Json
        }[]
      }
      get_organization_members: {
        Args: { org_id: string }
        Returns: {
          avatar_url: string
          full_name: string
          joined_at: string
          organization_id: string
          role: string
          user_id: string
        }[]
      }
      get_user_organizations: {
        Args: Record<PropertyKey, never>
        Returns: {
          created_at: string
          created_by: string
          joined_at: string
          organization_id: string
          organization_name: string
          organization_slug: string
          plan_type: string
          updated_at: string
          user_role: string
        }[]
      }
      get_user_organizations_safe: {
        Args: { user_uuid: string }
        Returns: {
          created_at: string
          created_by: string
          joined_at: string
          organization_id: string
          organization_name: string
          organization_slug: string
          plan_type: string
          updated_at: string
          user_role: string
        }[]
      }
      get_user_processors: {
        Args: { p_include_archived?: boolean }
        Returns: {
          created_at: string
          created_by: string
          created_by_name: string
          document_type: string
          is_owner: boolean
          operation_count: number
          processor_description: string
          processor_id: string
          processor_name: string
          published_at: string
          status: Database["public"]["Enums"]["processor_status"]
          tags: string[]
          updated_at: string
          visibility: Database["public"]["Enums"]["processor_visibility"]
        }[]
      }
      storage_check_document_access: {
        Args: { file_path: string }
        Returns: boolean
      }
      user_can_view_org_members: {
        Args: { org_id: string; user_uuid: string }
        Returns: boolean
      }
      validate_processor_ownership: {
        Args: { p_processor_id: string; p_require_owner?: boolean }
        Returns: boolean
      }
    }
    Enums: {
      operation_type:
        | "extraction"
        | "validation"
        | "rating"
        | "classification"
        | "analysis"
      processor_status: "draft" | "published" | "archived"
      processor_visibility: "personal" | "organization"
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
      operation_type: [
        "extraction",
        "validation",
        "rating",
        "classification",
        "analysis",
      ],
      processor_status: ["draft", "published", "archived"],
      processor_visibility: ["personal", "organization"],
    },
  },
} as const