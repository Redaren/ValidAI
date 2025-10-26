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
      admin_users: {
        Row: {
          created_at: string | null
          created_by: string | null
          email: string
          id: string
          notes: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          email: string
          id?: string
          notes?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          email?: string
          id?: string
          notes?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      app_tiers: {
        Row: {
          app_id: string
          created_at: string | null
          description: string | null
          display_name: string
          features: Json
          id: string
          is_active: boolean | null
          limits: Json
          price_monthly: number | null
          price_yearly: number | null
          tier_name: string
          updated_at: string | null
        }
        Insert: {
          app_id: string
          created_at?: string | null
          description?: string | null
          display_name: string
          features?: Json
          id?: string
          is_active?: boolean | null
          limits?: Json
          price_monthly?: number | null
          price_yearly?: number | null
          tier_name: string
          updated_at?: string | null
        }
        Update: {
          app_id?: string
          created_at?: string | null
          description?: string | null
          display_name?: string
          features?: Json
          id?: string
          is_active?: boolean | null
          limits?: Json
          price_monthly?: number | null
          price_yearly?: number | null
          tier_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_tiers_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
        ]
      }
      apps: {
        Row: {
          app_url: string | null
          created_at: string | null
          description: string | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          app_url?: string | null
          created_at?: string | null
          description?: string | null
          icon_url?: string | null
          id: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          app_url?: string | null
          created_at?: string | null
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          billing_period_end: string
          billing_period_start: string
          created_at: string | null
          created_by: string | null
          currency: string | null
          due_date: string
          id: string
          invoice_number: string
          issue_date: string
          line_items: Json
          notes: string | null
          organization_id: string
          paid_date: string | null
          payment_method: string | null
          payment_reference: string | null
          pdf_url: string | null
          status: string
          subtotal: number
          tax: number | null
          total: number
          updated_at: string | null
        }
        Insert: {
          billing_period_end: string
          billing_period_start: string
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          due_date: string
          id?: string
          invoice_number: string
          issue_date: string
          line_items: Json
          notes?: string | null
          organization_id: string
          paid_date?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          pdf_url?: string | null
          status?: string
          subtotal: number
          tax?: number | null
          total: number
          updated_at?: string | null
        }
        Update: {
          billing_period_end?: string
          billing_period_start?: string
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          due_date?: string
          id?: string
          invoice_number?: string
          issue_date?: string
          line_items?: Json
          notes?: string | null
          organization_id?: string
          paid_date?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          pdf_url?: string | null
          status?: string
          subtotal?: number
          tax?: number | null
          total?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_app_subscriptions: {
        Row: {
          app_id: string
          assigned_at: string | null
          assigned_by: string | null
          billing_period_end: string | null
          billing_period_start: string | null
          created_at: string | null
          id: string
          last_invoice_date: string | null
          last_payment_date: string | null
          notes: string | null
          organization_id: string
          status: string
          tier_id: string
          tier_name: string
          updated_at: string | null
        }
        Insert: {
          app_id: string
          assigned_at?: string | null
          assigned_by?: string | null
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string | null
          id?: string
          last_invoice_date?: string | null
          last_payment_date?: string | null
          notes?: string | null
          organization_id: string
          status?: string
          tier_id: string
          tier_name: string
          updated_at?: string | null
        }
        Update: {
          app_id?: string
          assigned_at?: string | null
          assigned_by?: string | null
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string | null
          id?: string
          last_invoice_date?: string | null
          last_payment_date?: string | null
          notes?: string | null
          organization_id?: string
          status?: string
          tier_id?: string
          tier_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_app_subscriptions_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_app_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_app_subscriptions_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "app_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_app_usage: {
        Row: {
          app_id: string
          created_at: string | null
          id: string
          organization_id: string
          period_end: string
          period_start: string
          quantity: number
          subscription_id: string
          updated_at: string | null
          usage_type: string
        }
        Insert: {
          app_id: string
          created_at?: string | null
          id?: string
          organization_id: string
          period_end: string
          period_start: string
          quantity?: number
          subscription_id: string
          updated_at?: string | null
          usage_type: string
        }
        Update: {
          app_id?: string
          created_at?: string | null
          id?: string
          organization_id?: string
          period_end?: string
          period_start?: string
          quantity?: number
          subscription_id?: string
          updated_at?: string | null
          usage_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_app_usage_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_app_usage_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_app_usage_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "organization_app_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string
          expires_at: string
          id: string
          invited_at: string | null
          invited_by: string | null
          organization_id: string
          role: string
          status: string
          updated_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          organization_id: string
          role: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          organization_id?: string
          role?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          invited_by: string | null
          joined_at: string | null
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          invited_by?: string | null
          joined_at?: string | null
          organization_id: string
          role: string
          user_id: string
        }
        Update: {
          invited_by?: string | null
          joined_at?: string | null
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey1"
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
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string | null
          email_notifications: boolean | null
          language: string | null
          push_notifications: boolean | null
          theme: string | null
          timezone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email_notifications?: boolean | null
          language?: string | null
          push_notifications?: boolean | null
          theme?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email_notifications?: boolean | null
          language?: string | null
          push_notifications?: boolean | null
          theme?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      validai_documents: {
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
            referencedRelation: "validai_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      validai_llm_global_settings: {
        Row: {
          configuration: Json | null
          created_at: string
          display_name: string
          id: string
          is_active: boolean | null
          is_default: boolean | null
          model_name: string
          provider: string
          updated_at: string
        }
        Insert: {
          configuration?: Json | null
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          model_name: string
          provider: string
          updated_at?: string
        }
        Update: {
          configuration?: Json | null
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          model_name?: string
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      validai_operation_results: {
        Row: {
          cache_hit: boolean | null
          completed_at: string | null
          error_message: string | null
          error_type: string | null
          execution_order: number
          execution_time_ms: number | null
          id: string
          model_used: string | null
          operation_id: string | null
          operation_snapshot: Json
          response_text: string | null
          retry_count: number | null
          run_id: string
          started_at: string
          status: string
          structured_output: Json | null
          thinking_blocks: Json | null
          tokens_used: Json | null
        }
        Insert: {
          cache_hit?: boolean | null
          completed_at?: string | null
          error_message?: string | null
          error_type?: string | null
          execution_order: number
          execution_time_ms?: number | null
          id?: string
          model_used?: string | null
          operation_id?: string | null
          operation_snapshot: Json
          response_text?: string | null
          retry_count?: number | null
          run_id: string
          started_at?: string
          status?: string
          structured_output?: Json | null
          thinking_blocks?: Json | null
          tokens_used?: Json | null
        }
        Update: {
          cache_hit?: boolean | null
          completed_at?: string | null
          error_message?: string | null
          error_type?: string | null
          execution_order?: number
          execution_time_ms?: number | null
          id?: string
          model_used?: string | null
          operation_id?: string | null
          operation_snapshot?: Json
          response_text?: string | null
          retry_count?: number | null
          run_id?: string
          started_at?: string
          status?: string
          structured_output?: Json | null
          thinking_blocks?: Json | null
          tokens_used?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "operation_results_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "validai_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "validai_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      validai_operations: {
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
            referencedRelation: "validai_processors"
            referencedColumns: ["id"]
          },
        ]
      }
      validai_organization_members: {
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
            referencedRelation: "validai_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      validai_organizations: {
        Row: {
          created_at: string | null
          created_by: string
          id: string
          llm_configuration: Json | null
          name: string
          plan_type: string | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          id?: string
          llm_configuration?: Json | null
          name: string
          plan_type?: string | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          id?: string
          llm_configuration?: Json | null
          name?: string
          plan_type?: string | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      validai_processors: {
        Row: {
          area_configuration: Json | null
          configuration: Json | null
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
          id: string
          name: string
          organization_id: string
          published_at: string | null
          status: Database["public"]["Enums"]["processor_status"]
          system_prompt: string | null
          tags: string[] | null
          updated_at: string
          usage_description: string | null
          visibility: Database["public"]["Enums"]["processor_visibility"]
        }
        Insert: {
          area_configuration?: Json | null
          configuration?: Json | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["processor_status"]
          system_prompt?: string | null
          tags?: string[] | null
          updated_at?: string
          usage_description?: string | null
          visibility?: Database["public"]["Enums"]["processor_visibility"]
        }
        Update: {
          area_configuration?: Json | null
          configuration?: Json | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["processor_status"]
          system_prompt?: string | null
          tags?: string[] | null
          updated_at?: string
          usage_description?: string | null
          visibility?: Database["public"]["Enums"]["processor_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "processors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "validai_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      validai_profiles: {
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
      validai_runs: {
        Row: {
          completed_at: string | null
          completed_operations: number
          deleted_at: string | null
          document_id: string | null
          error_message: string | null
          failed_operations: number
          id: string
          organization_id: string
          processor_id: string | null
          snapshot: Json
          started_at: string
          status: string
          total_operations: number
          trigger_type: string
          triggered_by: string | null
        }
        Insert: {
          completed_at?: string | null
          completed_operations?: number
          deleted_at?: string | null
          document_id?: string | null
          error_message?: string | null
          failed_operations?: number
          id?: string
          organization_id: string
          processor_id?: string | null
          snapshot: Json
          started_at?: string
          status?: string
          total_operations?: number
          trigger_type?: string
          triggered_by?: string | null
        }
        Update: {
          completed_at?: string | null
          completed_operations?: number
          deleted_at?: string | null
          document_id?: string | null
          error_message?: string | null
          failed_operations?: number
          id?: string
          organization_id?: string
          processor_id?: string | null
          snapshot?: Json
          started_at?: string
          status?: string
          total_operations?: number
          trigger_type?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "runs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "validai_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "validai_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_processor_id_fkey"
            columns: ["processor_id"]
            isOneToOne: false
            referencedRelation: "validai_processors"
            referencedColumns: ["id"]
          },
        ]
      }
      validai_workbench_executions: {
        Row: {
          citations: Json | null
          created_at: string
          error_message: string | null
          execution_time_ms: number | null
          id: string
          model_used: string | null
          organization_id: string
          partial_response: string | null
          processor_id: string
          prompt: string
          response: string | null
          settings: Json
          status: string
          thinking_blocks: Json | null
          tokens_used: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          citations?: Json | null
          created_at?: string
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          model_used?: string | null
          organization_id: string
          partial_response?: string | null
          processor_id: string
          prompt: string
          response?: string | null
          settings?: Json
          status: string
          thinking_blocks?: Json | null
          tokens_used?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          citations?: Json | null
          created_at?: string
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          model_used?: string | null
          organization_id?: string
          partial_response?: string | null
          processor_id?: string
          prompt?: string
          response?: string | null
          settings?: Json
          status?: string
          thinking_blocks?: Json | null
          tokens_used?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workbench_executions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "validai_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbench_executions_processor_id_fkey"
            columns: ["processor_id"]
            isOneToOne: false
            referencedRelation: "validai_processors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_assign_member: {
        Args: { p_organization_id: string; p_role: string; p_user_id: string }
        Returns: {
          invited_by: string
          joined_at: string
          organization_id: string
          role: string
          user_email: string
          user_full_name: string
          user_id: string
        }[]
      }
      admin_assign_subscription: {
        Args: {
          p_app_id: string
          p_notes?: string
          p_organization_id: string
          p_tier_id: string
          p_tier_name: string
        }
        Returns: {
          app_id: string
          billing_period_end: string
          billing_period_start: string
          created_at: string
          id: string
          notes: string
          organization_id: string
          status: string
          tier_id: string
          tier_name: string
          updated_at: string
        }[]
      }
      admin_cancel_subscription: {
        Args: { cancellation_reason?: string; subscription_id: string }
        Returns: {
          app_id: string
          id: string
          notes: string
          organization_id: string
          status: string
          updated_at: string
        }[]
      }
      admin_get_organization: {
        Args: { org_id: string }
        Returns: {
          created_at: string
          description: string
          id: string
          is_active: boolean
          member_count: number
          name: string
          updated_at: string
        }[]
      }
      admin_get_user: {
        Args: { p_user_id: string }
        Returns: {
          avatar_url: string
          created_at: string
          email: string
          full_name: string
          id: string
          organization_count: number
          updated_at: string
        }[]
      }
      admin_get_user_preferences: {
        Args: { p_user_id: string }
        Returns: {
          created_at: string
          email_notifications: boolean
          id: string
          language: string
          push_notifications: boolean
          theme: string
          timezone: string
          updated_at: string
          user_id: string
        }[]
      }
      admin_list_all_subscriptions: {
        Args: never
        Returns: {
          app_description: string
          app_id: string
          app_name: string
          assigned_at: string
          billing_period_end: string
          billing_period_start: string
          created_at: string
          id: string
          notes: string
          organization_id: string
          organization_name: string
          status: string
          tier_display_name: string
          tier_features: Json
          tier_id: string
          tier_limits: Json
          tier_name: string
          updated_at: string
        }[]
      }
      admin_list_all_users: {
        Args: never
        Returns: {
          avatar_url: string
          created_at: string
          email: string
          full_name: string
          id: string
          organization_count: number
          updated_at: string
        }[]
      }
      admin_list_app_tiers: {
        Args: { p_app_id: string }
        Returns: {
          app_id: string
          created_at: string
          description: string
          display_name: string
          features: Json
          id: string
          is_active: boolean
          limits: Json
          price_monthly: number
          price_yearly: number
          tier_name: string
        }[]
      }
      admin_list_organization_invitations: {
        Args: { org_id: string }
        Returns: {
          email: string
          expires_at: string
          id: string
          invited_at: string
          invited_by: string
          inviter_email: string
          inviter_full_name: string
          organization_id: string
          role: string
          status: string
        }[]
      }
      admin_list_organization_members: {
        Args: { org_id: string }
        Returns: {
          invited_by: string
          joined_at: string
          organization_id: string
          role: string
          user_avatar_url: string
          user_email: string
          user_full_name: string
          user_id: string
        }[]
      }
      admin_list_organization_subscriptions: {
        Args: { org_id: string }
        Returns: {
          app_description: string
          app_id: string
          app_name: string
          billing_period_end: string
          billing_period_start: string
          created_at: string
          id: string
          notes: string
          organization_id: string
          status: string
          tier_display_name: string
          tier_features: Json
          tier_id: string
          tier_limits: Json
          tier_name: string
          updated_at: string
        }[]
      }
      admin_list_organizations: {
        Args: never
        Returns: {
          created_at: string
          description: string
          id: string
          is_active: boolean
          member_count: number
          name: string
          updated_at: string
        }[]
      }
      admin_list_user_memberships: {
        Args: { p_user_id: string }
        Returns: {
          joined_at: string
          organization_id: string
          organization_is_active: boolean
          organization_name: string
          role: string
        }[]
      }
      admin_update_organization: {
        Args: {
          org_description: string
          org_id: string
          org_is_active: boolean
          org_name: string
        }
        Returns: {
          created_at: string
          description: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }[]
      }
      admin_update_subscription_tier: {
        Args: {
          admin_notes?: string
          new_tier_id: string
          new_tier_name: string
          subscription_id: string
        }
        Returns: {
          app_id: string
          id: string
          notes: string
          organization_id: string
          status: string
          tier_id: string
          tier_name: string
          updated_at: string
        }[]
      }
      check_org_feature_access: {
        Args: { app_id: string; feature_name: string; org_id: string }
        Returns: boolean
      }
      create_organization: {
        Args: { org_name: string; org_slug?: string }
        Returns: Json
      }
      create_processor_with_operations: {
        Args: {
          p_area_configuration: Json
          p_configuration: Json
          p_description: string
          p_document_type: string
          p_name: string
          p_operations: Json
          p_status: Database["public"]["Enums"]["processor_status"]
          p_system_prompt: string
          p_tags: string[]
          p_visibility: Database["public"]["Enums"]["processor_visibility"]
        }
        Returns: {
          id: string
          name: string
          operation_count: number
          status: Database["public"]["Enums"]["processor_status"]
        }[]
      }
      decrypt_api_key: {
        Args: { p_ciphertext: string; p_org_id: string }
        Returns: string
      }
      delete_processor_area: {
        Args: {
          p_area_name: string
          p_processor_id: string
          p_target_area?: string
        }
        Returns: undefined
      }
      encrypt_api_key: {
        Args: { p_org_id: string; p_plaintext: string }
        Returns: string
      }
      generate_unique_org_slug: { Args: { base_name: string }; Returns: string }
      get_available_llm_models: { Args: never; Returns: Json }
      get_billing_usage_summary: {
        Args: { org_id: string; period_end: string; period_start: string }
        Returns: {
          app_id: string
          app_name: string
          tier_display_name: string
          tier_name: string
          tier_price: number
          total_amount: number
          usage_items: Json
        }[]
      }
      get_current_organization: {
        Args: never
        Returns: {
          created_at: string
          description: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }[]
      }
      get_current_organization_id: { Args: never; Returns: string }
      get_llm_config_for_run:
        | {
            Args: { p_processor_id?: string; p_user_id?: string }
            Returns: Json
          }
        | { Args: { p_processor_id?: string }; Returns: Json }
      get_ordered_operations: {
        Args: { p_processor_id: string }
        Returns: {
          area: string
          configuration: Json
          description: string
          display_order: number
          id: string
          name: string
          operation_type: Database["public"]["Enums"]["operation_type"]
          output_schema: Json
          position: number
          prompt: string
          required: boolean
          validation_rules: Json
        }[]
      }
      get_organization_apps: {
        Args: { org_id?: string }
        Returns: {
          app_description: string
          app_id: string
          app_name: string
          current_usage: Json
          features: Json
          limits: Json
          status: string
          tier_display_name: string
          tier_name: string
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
      get_processor_with_operations: {
        Args: { p_processor_id: string }
        Returns: {
          area_configuration: Json
          configuration: Json
          created_at: string
          created_by: string
          created_by_name: string
          operations: Json
          processor_description: string
          processor_id: string
          processor_name: string
          published_at: string
          status: Database["public"]["Enums"]["processor_status"]
          system_prompt: string
          tags: string[]
          updated_at: string
          usage_description: string
          visibility: Database["public"]["Enums"]["processor_visibility"]
        }[]
      }
      get_user_apps_with_admin: {
        Args: never
        Returns: {
          app_description: string
          app_id: string
          app_name: string
          current_usage: Json
          features: Json
          is_platform_app: boolean
          limits: Json
          status: string
          tier_display_name: string
          tier_name: string
        }[]
      }
      get_user_organizations: {
        Args: never
        Returns: {
          is_active: boolean
          joined_at: string
          organization_description: string
          organization_id: string
          organization_name: string
          user_role: string
        }[]
      }
      get_user_organizations_safe: {
        Args: { user_uuid: string }
        Returns: {
          created_at: string
          created_by: string
          id: string
          joined_at: string
          name: string
          plan_type: string
          role: string
          slug: string
          updated_at: string
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
      get_user_processors_debug: {
        Args: {
          p_include_archived?: boolean
          p_org_id: string
          p_user_id: string
        }
        Returns: {
          created_at: string
          created_by: string
          creator_name: string
          description: string
          document_type: string
          id: string
          is_owner: boolean
          name: string
          operation_count: number
          published_at: string
          status: Database["public"]["Enums"]["processor_status"]
          tags: string[]
          updated_at: string
          visibility: Database["public"]["Enums"]["processor_visibility"]
        }[]
      }
      increment_app_usage: {
        Args: {
          app_id: string
          increment_by?: number
          org_id: string
          usage_type: string
        }
        Returns: undefined
      }
      increment_run_progress: {
        Args: { p_run_id: string; p_status: string }
        Returns: undefined
      }
      is_org_admin: { Args: never; Returns: boolean }
      is_playze_admin: { Args: never; Returns: boolean }
      remove_organization_member: {
        Args: { org_id: string; target_user_id: string }
        Returns: {
          message: string
          success: boolean
        }[]
      }
      rename_processor_area: {
        Args: { p_new_name: string; p_old_name: string; p_processor_id: string }
        Returns: undefined
      }
      set_organization_llm_config: {
        Args: {
          p_api_keys: Json
          p_available_models: Json
          p_default_model_id: string
        }
        Returns: Json
      }
      storage_check_document_access: {
        Args: { file_path: string }
        Returns: boolean
      }
      update_organization_member_role: {
        Args: { new_role: string; org_id: string; target_user_id: string }
        Returns: {
          message: string
          success: boolean
        }[]
      }
      user_can_view_org_members: {
        Args: { org_id: string; user_uuid: string }
        Returns: boolean
      }
      user_organization_id: { Args: never; Returns: string }
      user_role_in_org: { Args: { org_id: string }; Returns: string }
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
        | "generic"
        | "traffic_light"
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
        "generic",
        "traffic_light",
      ],
      processor_status: ["draft", "published", "archived"],
      processor_visibility: ["personal", "organization"],
    },
  },
} as const
