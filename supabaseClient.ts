
import { createClient } from '@supabase/supabase-js';

export interface SalesLogRow {
  id?: number | string;
  terminal_id: string;
  product_id: string;
  product_description: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  user_id: string;
  customer_name?: string | null;
  reference_id: string;
  created_at?: string;
}

export type SalesLogInsert = Omit<SalesLogRow, 'id' | 'created_at'>;

export interface SystemLogRow {
  id?: number | string;
  terminal_id: string;
  event_type: string;
  status: string;
  created_at?: string;
}

export type SystemLogInsert = Omit<SystemLogRow, 'id' | 'created_at'>;

interface Database {
  public: {
    Tables: {
      sales_log: {
        Row: SalesLogRow;
        Insert: SalesLogInsert;
        Update: Partial<SalesLogInsert>;
        Relationships: [];
      };
      system_logs: {
        Row: SystemLogRow;
        Insert: SystemLogInsert;
        Update: Partial<SystemLogInsert>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

const fallbackSupabaseUrl = 'https://vidohonhcbfhwtipzweu.supabase.co';
const fallbackSupabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpZG9ob25oY2JmaHd0aXB6d2V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzOTQ5NjYsImV4cCI6MjA4NDk3MDk2Nn0.Nth8w4DqY9NfECjP5jHoBS_Xgbp90IwxO96LMdQPinc';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || fallbackSupabaseUrl;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || fallbackSupabaseKey;

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    }
});

export const isSupabaseConfigured = () => {
    return supabaseUrl && supabaseKey && supabaseKey.length > 10;
};
