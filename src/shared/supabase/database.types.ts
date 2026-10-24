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
      account_events: {
        Row: {
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          shop_id: string | null
          target_user_id: string | null
          tenant_id: string | null
          type: Database["public"]["Enums"]["account_event_type"]
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          shop_id?: string | null
          target_user_id?: string | null
          tenant_id?: string | null
          type: Database["public"]["Enums"]["account_event_type"]
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          shop_id?: string | null
          target_user_id?: string | null
          tenant_id?: string | null
          type?: Database["public"]["Enums"]["account_event_type"]
        }
        Relationships: [
          {
            foreignKeyName: "account_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          full_name: string
          phone_e164: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name: string
          phone_e164: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          phone_e164?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_contacts: {
        Row: {
          phone_e164: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          phone_e164: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          phone_e164?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_contacts_user_id_tenant_id_fkey"
            columns: ["user_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id", "tenant_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          created_by: string | null
          full_name: string
          must_change_password: boolean
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["account_status"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          full_name: string
          must_change_password?: boolean
          role: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["account_status"]
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          full_name?: string
          must_change_password?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["account_status"]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_members: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          revoked_at: string | null
          revoked_by: string | null
          shop_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          shop_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          shop_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_members_shop_id_tenant_id_fkey"
            columns: ["shop_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "shop_members_user_id_tenant_id_fkey"
            columns: ["user_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id", "tenant_id"]
          },
        ]
      }
      shops: {
        Row: {
          archived_at: string | null
          city: string | null
          created_at: string
          created_by: string | null
          currency: string
          district: string | null
          id: string
          locale: string
          name: string
          phone_e164: string | null
          tenant_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          district?: string | null
          id?: string
          locale?: string
          name: string
          phone_e164?: string | null
          tenant_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          district?: string | null
          id?: string
          locale?: string
          name?: string
          phone_e164?: string | null
          tenant_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shops_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          created_by: string | null
          default_currency: string
          default_locale: string
          default_timezone: string
          id: string
          name: string
          status: Database["public"]["Enums"]["tenant_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_currency?: string
          default_locale?: string
          default_timezone?: string
          id?: string
          name: string
          status?: Database["public"]["Enums"]["tenant_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_currency?: string
          default_locale?: string
          default_timezone?: string
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      srv_check_password_reset: {
        Args: { p_actor: string; p_user_id: string }
        Returns: string
      }
      srv_create_member: {
        Args: {
          p_actor: string
          p_full_name: string
          p_phone: string
          p_role: Database["public"]["Enums"]["app_role"]
          p_shop_ids: string[]
          p_user_id: string
        }
        Returns: undefined
      }
      srv_create_shop: {
        Args: {
          p_actor: string
          p_city?: string
          p_district?: string
          p_name: string
          p_phone?: string
          p_tenant_id: string
        }
        Returns: string
      }
      srv_create_tenant: {
        Args: {
          p_actor: string
          p_owner_id: string
          p_owner_name: string
          p_owner_phone: string
          p_shop_city?: string
          p_shop_district?: string
          p_shop_name?: string
          p_tenant_name: string
        }
        Returns: string
      }
      srv_record_password_change: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      srv_record_password_reset: {
        Args: { p_actor: string; p_user_id: string }
        Returns: undefined
      }
      srv_set_member_shops: {
        Args: { p_actor: string; p_shop_ids: string[]; p_user_id: string }
        Returns: Json
      }
      srv_set_member_status: {
        Args: {
          p_actor: string
          p_status: Database["public"]["Enums"]["account_status"]
          p_user_id: string
        }
        Returns: undefined
      }
      srv_set_tenant_status: {
        Args: {
          p_actor: string
          p_status: Database["public"]["Enums"]["tenant_status"]
          p_tenant_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      account_event_type:
        | "tenant_created"
        | "tenant_suspended"
        | "tenant_reactivated"
        | "shop_created"
        | "member_created"
        | "member_disabled"
        | "member_enabled"
        | "member_shops_changed"
        | "password_reset"
        | "password_changed"
      account_status: "active" | "disabled"
      app_role: "owner" | "manager" | "accountant"
      tenant_status: "active" | "suspended"
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
      account_event_type: [
        "tenant_created",
        "tenant_suspended",
        "tenant_reactivated",
        "shop_created",
        "member_created",
        "member_disabled",
        "member_enabled",
        "member_shops_changed",
        "password_reset",
        "password_changed",
      ],
      account_status: ["active", "disabled"],
      app_role: ["owner", "manager", "accountant"],
      tenant_status: ["active", "suspended"],
    },
  },
} as const
