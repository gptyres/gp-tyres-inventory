
import { createClient } from '@supabase/supabase-js';

export interface InventoryItemRow {
  id: string;
  type: 'TYRE' | 'WHEEL' | 'COILOVER';
  item: Record<string, unknown>;
  quantity: number;
  selling_price: number;
  cost_price: number;
  last_updated: string;
  updated_at?: string;
}

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
      inventory_items: {
        Row: InventoryItemRow;
        Insert: Omit<InventoryItemRow, 'updated_at'>;
        Update: Partial<Omit<InventoryItemRow, 'id'>>;
        Relationships: [];
      };
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

const fallbackSupabaseUrl = 'https://moiybakshvuvppesbnpt.supabase.co';
const fallbackSupabaseKey = 'sb_publishable_CmagmxnGcxu9bGWdwWfwjQ_2y_ZXw9j';

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
