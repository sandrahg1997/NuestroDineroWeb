// Tipos de la base de datos, con el mismo formato que `supabase gen types typescript`.
// Escritos a partir de supabase/schema.sql y supabase/migrations/. Si cambias el
// esquema, actualízalos aquí (o regenéralos con el CLI de Supabase y sustituye
// este fichero): así las consultas quedan tipadas y el typecheck avisa si se pide
// una columna que no existe.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type TransactionType = "expense" | "income";

export type Database = {
  public: {
    Tables: {
      households: {
        Row: {
          id: string;
          name: string;
          invite_code: string;
          owner_id: string;
          active_period_id: string | null;
          recurring_checked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name?: string;
          invite_code?: string;
          owner_id: string;
          active_period_id?: string | null;
          recurring_checked_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          invite_code?: string;
          owner_id?: string;
          active_period_id?: string | null;
          recurring_checked_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "households_active_period_id_fkey";
            columns: ["active_period_id"];
            isOneToOne: false;
            referencedRelation: "periods";
            referencedColumns: ["id"];
          },
        ];
      };
      household_members: {
        Row: { household_id: string; user_id: string; role: "owner" | "member"; created_at: string };
        Insert: { household_id: string; user_id: string; role?: "owner" | "member"; created_at?: string };
        Update: { household_id?: string; user_id?: string; role?: "owner" | "member"; created_at?: string };
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      user_preferences: {
        Row: {
          user_id: string;
          active_household_id: string | null;
          hide_amounts: boolean;
          notify_partner_activity: boolean;
          notify_weekly_report: boolean;
          notify_recurring_reminder: boolean;
          created_at: string;
        };
        Insert: {
          user_id: string;
          active_household_id?: string | null;
          hide_amounts?: boolean;
          notify_partner_activity?: boolean;
          notify_weekly_report?: boolean;
          notify_recurring_reminder?: boolean;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          active_household_id?: string | null;
          hide_amounts?: boolean;
          notify_partner_activity?: boolean;
          notify_weekly_report?: boolean;
          notify_recurring_reminder?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_preferences_active_household_id_fkey";
            columns: ["active_household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      periods: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          start_date: string;
          end_date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          start_date: string;
          end_date: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          start_date?: string;
          end_date?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "periods_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          icon: string;
          type: TransactionType;
          is_default: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          icon?: string;
          type: TransactionType;
          is_default?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          icon?: string;
          type?: TransactionType;
          is_default?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      transactions: {
        Row: {
          id: string;
          household_id: string;
          user_id: string | null;
          concept: string;
          amount: number;
          date: string;
          category_id: string | null;
          type: TransactionType;
          note: string;
          merchant: string;
          receipt_text: string;
          recurring_id: string | null;
          activity_notified_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          user_id?: string | null;
          concept: string;
          amount: number;
          date?: string;
          category_id?: string | null;
          type: TransactionType;
          note?: string;
          merchant?: string;
          receipt_text?: string;
          recurring_id?: string | null;
          activity_notified_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          user_id?: string | null;
          concept?: string;
          amount?: number;
          date?: string;
          category_id?: string | null;
          type?: TransactionType;
          note?: string;
          merchant?: string;
          receipt_text?: string;
          recurring_id?: string | null;
          activity_notified_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_recurring_fk";
            columns: ["recurring_id"];
            isOneToOne: false;
            referencedRelation: "recurring_transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      recurring_transactions: {
        Row: {
          id: string;
          household_id: string;
          concept: string;
          amount: number;
          category_id: string | null;
          type: TransactionType;
          note: string;
          frequency: "weekly" | "monthly" | "yearly";
          next_date: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          concept: string;
          amount: number;
          category_id?: string | null;
          type: TransactionType;
          note?: string;
          frequency?: "weekly" | "monthly" | "yearly";
          next_date?: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          concept?: string;
          amount?: number;
          category_id?: string | null;
          type?: TransactionType;
          note?: string;
          frequency?: "weekly" | "monthly" | "yearly";
          next_date?: string;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_transactions_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_transactions_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      budgets: {
        Row: {
          id: string;
          household_id: string;
          category_id: string | null;
          amount: number;
          period_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          category_id?: string | null;
          amount: number;
          period_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          category_id?: string | null;
          amount?: number;
          period_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "budgets_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "periods";
            referencedColumns: ["id"];
          },
        ];
      };
      merchant_category_rules: {
        Row: { id: string; household_id: string; merchant_pattern: string; category_id: string; created_at: string };
        Insert: {
          id?: string;
          household_id: string;
          merchant_pattern: string;
          category_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          merchant_pattern?: string;
          category_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "merchant_category_rules_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          endpoint?: string;
          p256dh?: string;
          auth?: string;
          user_agent?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      period_reviews: {
        Row: {
          period_id: string;
          household_id: string;
          agreements: string;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          period_id: string;
          household_id: string;
          agreements?: string;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          period_id?: string;
          household_id?: string;
          agreements?: string;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "period_reviews_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: true;
            referencedRelation: "periods";
            referencedColumns: ["id"];
          },
        ];
      };
      challenges: {
        Row: {
          id: string;
          household_id: string;
          title: string;
          icon: string;
          kind: "no_spend" | "limit";
          category_id: string | null;
          keywords: string[];
          limit_amount: number | null;
          start_date: string;
          end_date: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          title: string;
          icon?: string;
          kind?: "no_spend" | "limit";
          category_id?: string | null;
          keywords?: string[];
          limit_amount?: number | null;
          start_date: string;
          end_date: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          title?: string;
          icon?: string;
          kind?: "no_spend" | "limit";
          category_id?: string | null;
          keywords?: string[];
          limit_amount?: number | null;
          start_date?: string;
          end_date?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "challenges_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      create_personal_household: { Args: { p_name?: string }; Returns: string };
      delete_household: { Args: { p_household_id: string }; Returns: undefined };
      get_my_households: {
        Args: Record<PropertyKey, never>;
        Returns: {
          household_id: string;
          name: string;
          member_count: number;
          is_active: boolean;
          partner_email: string | null;
        }[];
      };
      get_session_bootstrap: { Args: Record<PropertyKey, never>; Returns: Json };
      join_household: { Args: { p_invite_code: string }; Returns: string };
      process_all_due_recurring: { Args: Record<PropertyKey, never>; Returns: number };
      process_due_recurring: { Args: { p_household_id: string }; Returns: number };
      set_active_household: { Args: { p_household_id: string }; Returns: undefined };
      set_hide_amounts: { Args: { p_hidden: boolean }; Returns: undefined };
      set_notification_prefs: {
        Args: { p_partner_activity: boolean; p_weekly_report: boolean; p_recurring_reminder?: boolean };
        Returns: undefined;
      };
    };
    Enums: {
      transaction_type: TransactionType;
      recurrence_frequency: "weekly" | "monthly" | "yearly";
    };
    CompositeTypes: { [_ in never]: never };
  };
};
