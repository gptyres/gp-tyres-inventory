
export enum ProductType {
  TYRE = 'TYRE',
  WHEEL = 'WHEEL',
  COILOVER = 'COILOVER'
}

export enum ViewMode {
  TABLE = 'TABLE',
  GRID = 'GRID',
  LIST = 'LIST'
}

export type AppView = 'DASHBOARD' | 'TRAINING_PORTAL' | 'CUSTOMER_HUB' | 'PHOTO_LIBRARY' | 'WORKSHOP_TRACKER' | 'RADAR_RED' | 'AI_AGENT_ADMIN' | 'INVENTORY' | 'ORDERS' | 'BACKORDERS' | 'SYSTEM_LOGS' | 'SUPPLIER_PORTAL' | 'SHIPPING_PORTAL' | 'PAYMENT_PORTAL' | 'TOOLS_PORTAL' | 'SUPPLIER_INVENTORY' | 'WHEEL_CATALOG' | 'WHATSAPP_PORTAL' | 'QUOTE_MODULE' | 'COURIER_LOGISTICS_ASSISTANT';
export type SupplierCatalog = 'ALL_SUPPLIERS' | 'SAILUN' | 'EXCLUSIVE_TYRES' | 'TYREWAREHOUSE' | 'ATT' | 'BRIDGESTONE' | 'SAFETY_GRIP' | 'ALINE' | 'STAMFORD' | 'TREAD_ZONE' | 'SUMITOMO_DUNLOP' | 'TYRE_LIFE_WHEELS' | 'TREADS_UNLIMITED' | 'TYRE_LIFE' | 'APEX' | 'TUBESTONE' | 'EXOTIC' | 'ARC';

// Changed to string to support dynamic config updates without type conflicts
export type StaffName = string;

export interface BaseProduct {
  id: string;
  type: ProductType;
  quantity: number;
  sellingPrice: number;
  costPrice: number; // Only visible to admin
  lastUpdated: string;
  supplierName?: string;
  supplierStockCode?: string;
  stockByLocation?: Record<string, number>;
  imageDesignKey?: string;
  imageFinishKey?: string;
  sheetRowNumber?: number;
  sheetFingerprint?: string;
  sheetSyncedAt?: string;
}

export interface TyreProduct extends BaseProduct {
  type: ProductType.TYRE;
  brand: string;
  pattern: string; // e.g., AT3G
  size: string; // e.g., 265/65/17
  loadSpeedIndex: string; // e.g., 112T
  tyreRating?: string; // e.g., 18PR
  tyreIndex?: string; // e.g., 149/146K
  tyreSpecs?: string; // e.g., TL / OWL
  location: string; // e.g., Deck, Home
}

export interface WheelProduct extends BaseProduct {
  type: ProductType.WHEEL;
  code: string;
  brand?: string;
  finish?: string;
  size: string; // e.g., 15x6.5
  pcd: string; // e.g., 5/100
  offset: string; // ET
  centerBore: string; // CB
  colour: string;
  setQuantity: number; // e.g., 4 per set
  location?: string; // e.g., JHB: 4, CPT: 2
}

export interface CoiloverProduct extends BaseProduct {
  type: ProductType.COILOVER;
  brand: string; // e.g. ARC
  series: string; // e.g., Yellow, Blue
  vehicleCompatibility: string; // e.g., VW Golf 7
}

export type InventoryItem = TyreProduct | WheelProduct | CoiloverProduct;

export type CartLineType = 'INVENTORY' | 'SUPPLIER' | 'SERVICE' | 'CUSTOM';

export interface CartItem {
  id: string;
  cartLineType: CartLineType;
  inventoryItemId?: string;
  productType?: ProductType;
  activityCode: string;
  title: string;
  description: string;
  quantity: number;
  sellingPrice: number;
  costPrice: number;
  lastUpdated: string;
  cartQuantity: number;
  appliedDiscount: number;
}

export interface CustomerInfo {
  fullName: string;
  contactDetail: string;
  vehicleDetails: string;
}

export interface InvoiceDocument {
  id: string;
  referenceId: string;
  documentType: 'INVOICE' | 'QUOTE';
  terminalId: string;
  staffName?: StaffName;
  customer: CustomerInfo;
  createdAt: string;
  items: CartItem[];
  subtotal: number;
  totalDiscount: number;
  grandTotal: number;
}

export interface WheelCatalogItem {
  id: string;
  category: string; // e.g. "17 Inch"
  subCategory: string; // e.g. "5x100"
  designName: string; // e.g. "BBS RS Replica"
  size: string;
  pcd: string;
  offset: string;
  finish: string;
  price?: number; // Optional now
  imageUrl?: string; // Generated or imported
}

export interface Order {
  id: string;
  terminalId: string; // ID of the machine (e.g., 'GP1')
  productId: string; // ID of the item
  productDescription: string; // Snapshot of product name
  quantity: number;
  unitPrice: number; // Price per unit
  totalPrice: number; // Total transaction value (total_amount)
  staffName: StaffName; // user_id
  customerName?: string; // Optional, for Reservations
  timestamp: string; // Date + Time
  type: 'SALE' | 'RESERVE' | 'REFUND'; // Context helper
  referenceId?: string; // For VOID/RETURNS to reference original ID
}

export interface Backorder {
  id: string;
  supplier: string;
  productDescription: string;
  quantity: number;
  expectedDate: string;
  status: 'PENDING' | 'RECEIVED' | 'CANCELLED';
  notes?: string;
  createdAt: string;
}

export interface LoginLog {
  id: string;
  username: string; // Terminal / User ID
  timestamp: string; // Date + Time
  status: 'SUCCESS' | 'FAILURE';
  event: string; // Event Type
}

export interface InventoryStats {
  totalItems: number;
  totalValueRetail: number;
  totalValueCost: number;
  lowStockCount: number;
}
