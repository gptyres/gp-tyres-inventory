
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

export type CRMCustomerType = 'CUSTOMER' | 'LEAD';
export type CRMCustomerStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type CRMDocumentType = 'QUOTE' | 'INVOICE';
export type CRMDocumentStatus = 'DRAFT' | 'ISSUED' | 'SENT' | 'ACCEPTED' | 'CONVERTED' | 'PAID' | 'VOID';
export type CRMCustomerEventType = 'CUSTOMER_CREATED' | 'CUSTOMER_UPDATED' | 'DOCUMENT_CREATED' | 'DOCUMENT_UPDATED' | 'IMPORT' | 'NOTE';

export interface CRMCustomerRow {
  id: string;
  display_name: string;
  display_name_key?: string;
  company_name?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  mobile?: string | null;
  billing_address?: string | null;
  shipping_address?: string | null;
  vehicle_details?: string | null;
  notes?: string | null;
  customer_type: CRMCustomerType;
  status: CRMCustomerStatus;
  source: string;
  external_ref?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type CRMCustomerInsert = Omit<CRMCustomerRow, 'id' | 'display_name_key' | 'created_at' | 'updated_at'> & {
  id?: string;
};

export type CRMCustomerUpdate = Partial<Omit<CRMCustomerRow, 'id' | 'display_name_key' | 'created_at' | 'updated_at'>>;

export interface CRMDocumentRow {
  id: string;
  reference_id: string;
  document_type: CRMDocumentType;
  status: CRMDocumentStatus;
  customer_id?: string | null;
  customer_snapshot: Record<string, unknown>;
  terminal_id: string;
  staff_name?: string | null;
  vehicle_details?: string | null;
  subtotal: number;
  total_discount: number;
  tax_amount: number;
  grand_total: number;
  source: string;
  issued_at: string;
  due_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type CRMDocumentInsert = Omit<CRMDocumentRow, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
};

export type CRMDocumentUpdate = Partial<Omit<CRMDocumentRow, 'id' | 'created_at' | 'updated_at'>>;

export interface CRMDocumentItemRow {
  id: string;
  document_id: string;
  line_index: number;
  cart_line_type: string;
  inventory_item_id?: string | null;
  product_type?: string | null;
  activity_code?: string | null;
  title: string;
  description?: string | null;
  quantity: number;
  unit_price: number;
  discount_each: number;
  line_total: number;
  created_at?: string;
}

export type CRMDocumentItemInsert = Omit<CRMDocumentItemRow, 'id' | 'created_at'> & {
  id?: string;
};

export interface CRMCustomerEventRow {
  id: string;
  customer_id?: string | null;
  document_id?: string | null;
  event_type: CRMCustomerEventType;
  notes?: string | null;
  amount?: number | null;
  created_by?: string | null;
  created_at?: string;
}

export type CRMCustomerEventInsert = Omit<CRMCustomerEventRow, 'id' | 'created_at'> & {
  id?: string;
};

export interface WheelCatalogItemRow {
  id: string;
  source_root_folder_id: string;
  drive_file_id: string;
  drive_folder_id?: string | null;
  folder_path: string;
  folder_path_parts: string[];
  category?: string | null;
  rim_size?: string | null;
  pcd?: string | null;
  tags: string[];
  file_name: string;
  drive_url: string;
  storage_bucket: string;
  storage_path: string;
  public_image_url: string;
  mime_type: string;
  local_relative_path?: string | null;
  source_size_bytes?: number | null;
  content_sha256?: string | null;
  brand?: string | null;
  model?: string | null;
  pcd_aliases?: string[] | null;
  wheel_size?: string | null;
  width?: string | null;
  finish?: string | null;
  colour?: string | null;
  wheel_offset?: string | null;
  center_bore?: string | null;
  load_rating?: string | null;
  vehicle_hints?: string[] | null;
  image_ocr_text?: string | null;
  image_spec_text?: string | null;
  image_analysis_status?: 'pending' | 'completed' | 'failed' | null;
  analysis_confidence?: number | null;
  needs_review?: boolean | null;
  review_reason?: string | null;
  image_analysis_model?: string | null;
  image_analyzed_at?: string | null;
  source_modified_at?: string | null;
  active: boolean;
  imported_at: string;
  updated_at?: string;
}

export type WheelCatalogItemInsert = Omit<WheelCatalogItemRow, 'id' | 'updated_at'> & {
  id?: string;
};

export interface WheelCatalogSyncRunRow {
  id: string;
  status: 'started' | 'completed' | 'failed';
  started_at: string;
  completed_at?: string | null;
  source_label: string;
  files_scanned: number;
  files_uploaded: number;
  files_skipped: number;
  files_failed: number;
  rows_deactivated: number;
  error_message?: string | null;
}

export type WheelCatalogSyncRunInsert = Omit<WheelCatalogSyncRunRow, 'id' | 'started_at'> & {
  id?: string;
  started_at?: string;
};

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
      crm_customers: {
        Row: CRMCustomerRow;
        Insert: CRMCustomerInsert;
        Update: CRMCustomerUpdate;
        Relationships: [];
      };
      crm_documents: {
        Row: CRMDocumentRow;
        Insert: CRMDocumentInsert;
        Update: CRMDocumentUpdate;
        Relationships: [];
      };
      crm_document_items: {
        Row: CRMDocumentItemRow;
        Insert: CRMDocumentItemInsert;
        Update: Partial<CRMDocumentItemInsert>;
        Relationships: [];
      };
      crm_customer_events: {
        Row: CRMCustomerEventRow;
        Insert: CRMCustomerEventInsert;
        Update: Partial<CRMCustomerEventInsert>;
        Relationships: [];
      };
      wheel_catalog_items: {
        Row: WheelCatalogItemRow;
        Insert: WheelCatalogItemInsert;
        Update: Partial<Omit<WheelCatalogItemRow, 'id' | 'drive_file_id'>>;
        Relationships: [];
      };
      wheel_catalog_sync_runs: {
        Row: WheelCatalogSyncRunRow;
        Insert: WheelCatalogSyncRunInsert;
        Update: Partial<Omit<WheelCatalogSyncRunRow, 'id'>>;
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
