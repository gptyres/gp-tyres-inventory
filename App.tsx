
import React, { lazy, Suspense, useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { InventoryView } from './components/InventoryView';
import { StatsDashboard } from './components/StatsDashboard';
import { SheetInventorySyncStatus } from './components/SheetInventorySyncStatus';
import { DashboardView } from './components/DashboardView';
import { OrdersView } from './components/OrdersView';
import { BackordersView } from './components/BackordersView';
import { SystemLogsView } from './components/SystemLogsView';
import { StockActionModal } from './components/StockActionModal';
import { SellModal } from './components/SellModal';
import { AdminAuthModal } from './components/AdminAuthModal';
import { SupplierSyncButton } from './components/SupplierSyncButton';
import { ManualSupplierImport } from './components/ManualSupplierImport';
import { BackorderModal } from './components/BackorderModal';
import { DataSyncModal } from './components/DataSyncModal';
import { ReserveModal } from './components/ReserveModal';
import { ShiftReconciliationModal } from './components/ShiftReconciliationModal';
import { LoginScreen } from './components/LoginScreen';
const ChatBot = lazy(() => import('./components/ChatBot').then((module) => ({ default: module.ChatBot })));
const WheelCatalogView = lazy(() => import('./components/WheelCatalogView').then((module) => ({ default: module.WheelCatalogView })));
const POSModal = lazy(() => import('./components/POSModal').then((module) => ({ default: module.POSModal })));
const InvoiceModal = lazy(() => import('./components/InvoiceModal').then((module) => ({ default: module.InvoiceModal })));
const QuoteModuleView = lazy(() => import('./components/QuoteModuleView').then((module) => ({ default: module.QuoteModuleView })));
const TrainingPortalView = lazy(() => import('./components/TrainingPortalView').then((module) => ({ default: module.TrainingPortalView })));
const CustomerHubView = lazy(() => import('./components/CustomerHubView').then((module) => ({ default: module.CustomerHubView })));
const PhotoLibraryView = lazy(() => import('./components/photo-library/PhotoLibraryView').then((module) => ({ default: module.PhotoLibraryView })));
const RadarRedView = lazy(() => import('./components/RadarRedView').then((module) => ({ default: module.RadarRedView })));
import { ProductType, ViewMode, InventoryItem, InventoryStats, StaffName, AppView, Order, TyreProduct, WheelProduct, CoiloverProduct, Backorder, LoginLog, WheelCatalogItem, SupplierCatalog, CartItem, InvoiceDocument, CustomerInfo } from './types';
import { PricingPOSQuoteLine } from './pricing-processor/types';
import { MOCK_INVENTORY, MOCK_BACKORDERS, INVENTORY_DATA_VERSION } from './constants';
import { supabase, isSupabaseConfigured, InventoryItemRow, SalesLogInsert, SalesLogRow, SystemLogInsert, SystemLogRow, CRMCustomerRow } from './supabaseClient';
import { flushPendingSupabaseWrites, insertSystemLogEntries } from './supabaseSync';
import {
  deleteGlobalInventoryItem,
  fetchGlobalInventory,
  mapInventoryRowToItem,
  mergeInventoryItems,
  processInventoryTransaction,
  seedGlobalInventoryIfEmpty,
  StockAdjustment,
  upsertGlobalInventoryItem
} from './inventorySync';
import { customerRowToCustomerInfo, saveCRMDocumentFromPOS } from './crmSync';
import {
  invalidateSupplierCatalogCache,
  loadAllSupplierPOSItems,
  loadSupplierCatalogItems
} from './supplierCatalogLoader';
import { authenticateAdminSession, clearAdminSession } from './supplierSync';
import { isRegistryBackedSupplierCatalog, isLiveSupplierCatalog } from './supplierCatalogMapping';
import { syncPortalInventoryItemsToSheet } from './sheetInventoryStatus';

import {
  searchInventory,
  searchOrders,
  searchBackorders
} from './utils';

const POS_REFERENCE_COUNTERS: Record<InvoiceDocument['documentType'], { storageKey: string; startAt: number }> = {
  INVOICE: {
    storageKey: 'gp-pos-next-invoice-number',
    startAt: 3177
  },
  QUOTE: {
    storageKey: 'gp-pos-next-quote-number',
    startAt: 5122
  }
};

const formatPOSReferenceNumber = (value: number) => String(value).padStart(6, '0');

const LoadingPanel: React.FC<{ label?: string }> = ({ label = 'Loading...' }) => (
  <div className="flex min-h-64 items-center justify-center p-6 text-gp-text-muted">
    <div className="flex items-center gap-3 rounded-lg border border-gp-border bg-gp-panel px-4 py-3 text-xs font-black uppercase tracking-wider">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-gp-red border-t-transparent" />
      {label}
    </div>
  </div>
);

const hasSheetSyncedTyres = (inventoryItems: InventoryItem[]) => (
  inventoryItems.some(item => item.type === ProductType.TYRE && Boolean(item.sheetSyncedAt))
);

const filterSheetManagedInventory = (inventoryItems: InventoryItem[]) => {
  if (!hasSheetSyncedTyres(inventoryItems)) return inventoryItems;
  return inventoryItems.filter(item => item.type !== ProductType.TYRE || Boolean(item.sheetSyncedAt));
};

const App: React.FC = () => {
  // --- AUTH STATE ---
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  // --- DATA STATE (with Persistence) ---
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [backorders, setBackorders] = useState<Backorder[]>([]);
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);
  
  // --- UI STATE ---
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');
  
  // Portal State
  const [currentPortal, setCurrentPortal] = useState<{name: string, url: string} | null>(null);
  const [activeSupplierCatalog, setActiveSupplierCatalog] = useState<SupplierCatalog>('SAILUN');
  
  // Theme State
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('gp-theme');
    if (saved) return saved === 'dark';
    return true; // Default to dark
  });
  
  // Navigation State
  const [currentView, setCurrentView] = useState<AppView>('DASHBOARD');
  const [activeFilter, setActiveFilter] = useState<ProductType | 'ALL'>('ALL');
  
  // Mobile Sidebar
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Desktop Sidebar
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);
  // Search Visibility
  const [isSearchVisible, setIsSearchVisible] = useState(true);
  
  // Chat State
  const [isChatOpen, setIsChatOpen] = useState(false);
  
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.GRID);
  const [isScrollToTopVisible, setIsScrollToTopVisible] = useState(false);
  const mainScrollContainerRef = useRef<HTMLElement | null>(null);
  const activeScrollContainerRef = useRef<HTMLElement | null>(null);
  
  // Modal States
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
  const [isBackorderModalOpen, setIsBackorderModalOpen] = useState(false);
  const [isDataSyncModalOpen, setIsDataSyncModalOpen] = useState(false);
  const [isReserveModalOpen, setIsReserveModalOpen] = useState(false);
  const [isCashUpModalOpen, setIsCashUpModalOpen] = useState(false);
  const [isPOSOpen, setIsPOSOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [posCart, setPOSCart] = useState<CartItem[]>([]);
  const [invoiceDocument, setInvoiceDocument] = useState<InvoiceDocument | null>(null);
  const [editingPOSDocument, setEditingPOSDocument] = useState<InvoiceDocument | null>(null);
  const [isCompletingPOS, setIsCompletingPOS] = useState(false);
  const [supplierItems, setSupplierItems] = useState<InventoryItem[]>([]);
  const [isSupplierCatalogLoading, setIsSupplierCatalogLoading] = useState(false);
  const [supplierCatalogError, setSupplierCatalogError] = useState('');
  const [supplierCatalogRefreshVersion, setSupplierCatalogRefreshVersion] = useState(0);
  const [allSupplierPOSItems, setAllSupplierPOSItems] = useState<InventoryItem[]>([]);
  const [isSupplierPOSLoading, setIsSupplierPOSLoading] = useState(false);
  const [posCustomerInfo, setPOSCustomerInfo] = useState<CustomerInfo>({
    fullName: '',
    contactDetail: '',
    vehicleDetails: ''
  });
  
  const [selectedItem, setSelectedItem] = useState<InventoryItem | undefined>(undefined);
  const [selectedBackorder, setSelectedBackorder] = useState<Backorder | undefined>(undefined);

  useEffect(() => {
    const handleScroll = (event: Event) => {
      const mainContainer = mainScrollContainerRef.current;
      const scrollContainer = event.target;
      if (!mainContainer || !(scrollContainer instanceof HTMLElement) || !mainContainer.contains(scrollContainer)) return;

      activeScrollContainerRef.current = scrollContainer;
      setIsScrollToTopVisible(scrollContainer.scrollTop > 480);
    };

    document.addEventListener('scroll', handleScroll, true);
    return () => document.removeEventListener('scroll', handleScroll, true);
  }, []);

  useEffect(() => {
    const scrollContainer = activeScrollContainerRef.current || mainScrollContainerRef.current;
    scrollContainer?.scrollTo({ top: 0 });
    activeScrollContainerRef.current = mainScrollContainerRef.current;
    setIsScrollToTopVisible(false);
  }, [currentView, activeSupplierCatalog]);

  const handleScrollToTop = useCallback(() => {
    const scrollContainer = activeScrollContainerRef.current || mainScrollContainerRef.current;
    scrollContainer?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchQuery(searchQuery), 150);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const shouldLoadSupplierCatalog = (
    currentView === 'SUPPLIER_INVENTORY'
    && (activeSupplierCatalog !== 'ALL_SUPPLIERS' || debouncedSearchQuery.trim().length >= 2)
  );

  // --- SUPPLIER DATA: lazy loaded and cached by supplierCatalogLoader ---
  useEffect(() => {
    let cancelled = false;

    const loadSupplierItems = async () => {
      if (currentView !== 'SUPPLIER_INVENTORY') return;

      if (!shouldLoadSupplierCatalog) {
        setSupplierItems([]);
        setIsSupplierCatalogLoading(false);
        setSupplierCatalogError('');
        return;
      }

      setIsSupplierCatalogLoading(true);
      setSupplierCatalogError('');

      try {
        const loadedItems = await loadSupplierCatalogItems(activeSupplierCatalog);
        if (!cancelled) setSupplierItems(loadedItems);
      } catch (error) {
        console.error('Supplier catalogue load failed', error);
        if (!cancelled) {
          setSupplierItems([]);
          setSupplierCatalogError('Could not load this supplier catalogue. Please try again.');
        }
      } finally {
        if (!cancelled) setIsSupplierCatalogLoading(false);
      }
    };

    void loadSupplierItems();
    return () => {
      cancelled = true;
    };
  }, [currentView, activeSupplierCatalog, shouldLoadSupplierCatalog, supplierCatalogRefreshVersion]);

  useEffect(() => {
    let cancelled = false;

    const loadPOSSupplierItems = async () => {
      if (!isPOSOpen || allSupplierPOSItems.length > 0) return;
      setIsSupplierPOSLoading(true);

      try {
        const loadedItems = await loadAllSupplierPOSItems();
        if (!cancelled) setAllSupplierPOSItems(loadedItems);
      } catch (error) {
        console.error('Quick POS supplier catalogue load failed', error);
      } finally {
        if (!cancelled) setIsSupplierPOSLoading(false);
      }
    };

    void loadPOSSupplierItems();
    return () => {
      cancelled = true;
    };
  }, [isPOSOpen, allSupplierPOSItems.length]);

  const supplierCatalogMeta: Record<SupplierCatalog, { label: string; note: string; portalUrl?: string }> = {
    ALL_SUPPLIERS: {
      label: 'All Supplier Stock',
      note: 'Search every supplier catalogue at once. Enter at least 2 characters to show results; supplier names appear in the location field.'
    },
    SAILUN: {
      label: 'Sailun (Inc. VAT)',
      note: 'Viewing External Supplier Data. Prices calculated with 15% VAT added to Nett Price.'
    },
    EXCLUSIVE_TYRES: {
      label: 'EXCLUSIVE TYRES',
      note: 'Viewing External Supplier Data. Prices use the Cost + VAT values from Exclusive Tyres.',
      portalUrl: 'https://etonline.co.za/#/'
    },
    TYREWAREHOUSE: {
      label: 'TYREWAREHOUSE',
      note: 'Viewing External Supplier Data. Prices use the discounted selling price from the latest TyreWarehouse file.',
      portalUrl: 'https://www.tyrewarehouse.co.za/eshop/index.html'
    },
    ATT: {
      label: 'ATT',
      note: 'Viewing External Supplier Data. Prices use ATT selling prices.',
      portalUrl: 'https://onlinestore.autoandtrucktyres.co.za/#!/evo-client-portal/dashboard'
    },
    BRIDGESTONE: {
      label: 'BRIDGESTONE',
      note: 'Viewing Bridgestone and Firestone supplier stock. Prices include VAT and are rounded to the nearest R25.',
      portalUrl: 'https://www.bsafonline.co.za/'
    },
    SAFETY_GRIP: {
      label: 'SAFETY GRIP',
      note: 'Viewing External Supplier Data. Prices are calculated with 15% VAT added to the supplied price.'
    },
    ALINE: {
      label: 'ALINE',
      note: 'Viewing External Supplier Data. Recommended selling prices include VAT and are a guide only, not the final selling price. Branch wheel stock is shown by location.',
      portalUrl: 'https://www.alinewheels.co.za/login-2/?arm_redirect=https%3A%2F%2Fwww.alinewheels.co.za%2Fedit_profile%2F'
    },
    STAMFORD: {
      label: 'STAMFORD',
      note: 'Viewing External Supplier Data. Prices are matched by SKU, with branch stock shown in the location field.',
      portalUrl: 'https://orders.stamford.co.za/'
    },
    APEX: {
      label: 'APEX',
      note: 'Viewing External Supplier Data. Prices use APEX selling prices, with lead time shown in the location field.',
      portalUrl: 'https://app.stockfinder.co.za/login'
    },
    TUBESTONE: {
      label: 'TUBESTONE',
      note: 'Viewing External Supplier Data. Quantity uses total stock, with branch stock shown in the location field.',
      portalUrl: 'https://portal.tubestone.co.za/index.php?c=website.account.home/dashboard'
    },
    EXOTIC: {
      label: 'EXOTIC',
      note: 'Viewing External Supplier Data. Alloy wheels are ignored; tyre stock uses branch availability from Exotic.',
      portalUrl: 'https://exotic.ewtgroup.co.za/'
    },
    ARC: {
      label: 'ARC',
      note: 'Viewing External Supplier Suspension Data. Prices use the supplied lowest selling price; exact unit counts are not provided in the supplier file.'
    },
    TREAD_ZONE: {
      label: 'TREAD ZONE',
      note: 'Viewing External Supplier Data. Quantity uses total stock, with branch stock shown in the location field.',
      portalUrl: 'https://treadzone.b2b.storehub.io/'
    },
    SUMITOMO_DUNLOP: {
      label: 'SUMITOMO/DUNLOP',
      note: 'Viewing External Supplier Data. Quantity uses total stock, with branch stock shown in the location field.',
      portalUrl: 'https://sumitomorubbersouthafrica.my.site.com/sumitomorubbersouthafrica/B2BLoginPage?ec=302&startURL=%2Fsumitomorubbersouthafrica%2Fs%2F'
    },
    TREADS_UNLIMITED: {
      label: 'TREADS UNLIMITED',
      note: 'Viewing External Supplier Data. Quantity uses national stock, with regional stock shown in the location field.',
      portalUrl: 'https://xpress.treads.co.za/Account/Login?ReturnUrl=%2FTyres'
    },
    TYRE_LIFE: {
      label: 'TYRE LIFE',
      note: 'Viewing External Supplier Data. Quantity uses total stock, with branch stock shown in the location field.',
      portalUrl: 'https://dealers.tyrelifesolutions.co.za/dealer/dashboard'
    },
    TYRE_LIFE_WHEELS: {
      label: 'TYRE LIFE WHEELS',
      note: 'Viewing External Supplier Wheel Data. Prices already include VAT, with branch wheel stock shown in the location field.',
      portalUrl: 'https://dealers.tyrelifesolutions.co.za/dealer/dashboard'
    }
  };

  const supplierCatalogLabel = supplierCatalogMeta[activeSupplierCatalog].label;
  const supplierCatalogNote = supplierCatalogMeta[activeSupplierCatalog].note;
  const supplierPortalUrl = supplierCatalogMeta[activeSupplierCatalog].portalUrl;
  const supplierHasLiveSync = isLiveSupplierCatalog(activeSupplierCatalog);
  const supplierUsesPortalWorker = isRegistryBackedSupplierCatalog(activeSupplierCatalog);

  // Helper to determine transaction type based on amount and fields
  const inferTransactionType = (row: any): 'SALE' | 'RESERVE' | 'REFUND' => {
    const amount = Number(row.total_amount);
    if (amount < 0) return 'REFUND';
    if (amount === 0 && row.customer_name) return 'RESERVE';
    return 'SALE';
  };

  const readStoredArray = <T,>(storageKey: string): T[] => {
    try {
      const storedValue = localStorage.getItem(storageKey);
      if (!storedValue) return [];
      const parsedValue = JSON.parse(storedValue);
      return Array.isArray(parsedValue) ? parsedValue : [];
    } catch (error) {
      console.warn(`Ignoring invalid saved ${storageKey} data`, error);
      return [];
    }
  };

  const mapSalesLogRowToOrder = (row: SalesLogRow): Order => ({
    id: row.reference_id || row.id?.toString() || `db-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    terminalId: row.terminal_id,
    productId: row.product_id,
    productDescription: row.product_description,
    quantity: Number(row.quantity) || 0,
    unitPrice: Number(row.unit_price) || 0,
    totalPrice: Number(row.total_amount) || 0,
    staffName: row.user_id,
    customerName: row.customer_name || undefined,
    timestamp: row.created_at || new Date().toISOString(),
    type: inferTransactionType(row),
    referenceId: row.reference_id
  });

  const mapSystemLogRowToLoginLog = (row: SystemLogRow): LoginLog => ({
    id: row.id?.toString() || `db-log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    username: row.terminal_id,
    timestamp: row.created_at || new Date().toISOString(),
    status: row.status as LoginLog['status'],
    event: row.event_type
  });

  const mergeOrdersUnique = (incomingOrders: Order[], existingOrders: Order[]) => {
    const seen = new Set(existingOrders.map(order => order.referenceId || order.id));
    const uniqueIncoming = incomingOrders.filter(order => {
      const key = order.referenceId || order.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return [...uniqueIncoming, ...existingOrders];
  };

  const mergeLoginLogsUnique = (incomingLogs: LoginLog[], existingLogs: LoginLog[]) => {
    const merged = [...existingLogs];

    incomingLogs.forEach(incomingLog => {
      const incomingTime = new Date(incomingLog.timestamp).getTime();
      const duplicateIndex = merged.findIndex(existingLog => {
        if (existingLog.id === incomingLog.id) return true;
        const existingTime = new Date(existingLog.timestamp).getTime();
        return (
          existingLog.username === incomingLog.username &&
          existingLog.event === incomingLog.event &&
          existingLog.status === incomingLog.status &&
          Number.isFinite(incomingTime) &&
          Number.isFinite(existingTime) &&
          Math.abs(existingTime - incomingTime) < 15000
        );
      });

      if (duplicateIndex >= 0) {
        merged.splice(duplicateIndex, 1);
      }
      merged.unshift(incomingLog);
    });

    return merged;
  };

  const fetchAllRows = async <T,>(
    tableName: 'sales_log' | 'system_logs',
    orderColumn = 'created_at',
    pageSize = 1000
  ): Promise<T[]> => {
    const rows: T[] = [];

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await (supabase.from(tableName) as any)
        .select('*')
        .order(orderColumn, { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      rows.push(...((data || []) as T[]));

      if (!data || data.length < pageSize) break;
    }

    return rows;
  };

  // --- INITIAL LOAD & SYNC ---
  useEffect(() => {
    const loadCachedInventory = (): InventoryItem[] => {
      const storedItems = localStorage.getItem('gp-inventory');
      const appliedSeedVersion = localStorage.getItem('gp-inventory-seed-version');
      if (storedItems && appliedSeedVersion === INVENTORY_DATA_VERSION) {
        try {
          return JSON.parse(storedItems);
        } catch (error) {
          console.warn('Ignoring invalid saved inventory data', error);
        }
      }
      return MOCK_INVENTORY;
    };

    // 1. Load cached inventory immediately, then replace with Supabase source of truth.
    const cachedInventory = loadCachedInventory();
    setItems(filterSheetManagedInventory(cachedInventory));
    localStorage.setItem('gp-inventory', JSON.stringify(cachedInventory));
    localStorage.setItem('gp-inventory-seed-version', INVENTORY_DATA_VERSION);

    const fetchInventory = async () => {
      if (!isSupabaseConfigured()) return;

      try {
        let globalInventory = await fetchGlobalInventory();

        if (globalInventory.length === 0) {
          const seededCount = await seedGlobalInventoryIfEmpty(cachedInventory.length ? cachedInventory : MOCK_INVENTORY);
          if (seededCount > 0) {
            console.info(`[SUPABASE] Seeded ${seededCount} inventory item(s) into global stock.`);
          }
          globalInventory = await fetchGlobalInventory();
        }

        if (globalInventory.length > 0) {
          setItems(filterSheetManagedInventory(globalInventory));
        }
      } catch (error) {
        console.error('[SUPABASE] Inventory Fetch Error:', error);
      }
    };
    fetchInventory();

    // 2. Load Local Backorders
    const storedBackorders = readStoredArray<Backorder>('gp-backorders');
    setBackorders(storedBackorders.length ? storedBackorders : MOCK_BACKORDERS);

    const storedOrders = readStoredArray<Order>('gp-orders');
    if (storedOrders.length) setOrders(storedOrders);

    const storedLogs = readStoredArray<LoginLog>('gp-login-logs');
    if (storedLogs.length) setLoginLogs(storedLogs);

    const flushQueuedWrites = async () => {
      const result = await flushPendingSupabaseWrites();
      if (result.salesSynced || result.systemSynced) {
        console.info(`[SUPABASE] Synced ${result.salesSynced} queued sales log(s) and ${result.systemSynced} queued system log(s).`);
      }
    };

    flushQueuedWrites();
    window.addEventListener('online', flushQueuedWrites);

    // 3. Supabase: Fetch Sales Log (Financial History)
    const fetchOrders = async () => {
      if (isSupabaseConfigured()) {
        try {
          const data = await fetchAllRows<SalesLogRow>('sales_log');
          const mappedOrders: Order[] = data.map(mapSalesLogRowToOrder);
          setOrders(prev => mergeOrdersUnique(mappedOrders, prev));
        } catch (error) {
          console.error('[SUPABASE] Sales Log Fetch Error:', error);
          const storedOrders = localStorage.getItem('gp-orders');
          if (storedOrders) setOrders(JSON.parse(storedOrders));
        }
      } else {
         const fallbackOrders = readStoredArray<Order>('gp-orders');
         if (fallbackOrders.length) setOrders(fallbackOrders);
      }
    };
    fetchOrders();

    // 4. Supabase: Fetch System Logs (Security)
    const fetchLogs = async () => {
        if (!isSupabaseConfigured()) {
            const fallbackLogs = readStoredArray<LoginLog>('gp-login-logs');
            if (fallbackLogs.length) setLoginLogs(fallbackLogs);
            return;
        }

        try {
            const data = await fetchAllRows<SystemLogRow>('system_logs');
            const mappedLogs: LoginLog[] = data.map(mapSystemLogRowToLoginLog);
            setLoginLogs(prev => mergeLoginLogsUnique(mappedLogs.reverse(), prev));
        } catch (error) {
            console.error('[SUPABASE] System Logs Fetch Error:', error);
            const fallbackLogs = readStoredArray<LoginLog>('gp-login-logs');
            if (fallbackLogs.length) setLoginLogs(fallbackLogs);
        }
    };
    fetchLogs();

    // 5. Real-time Subscriptions
    if (isSupabaseConfigured()) {
        const inventoryChannel = supabase
            .channel('public:inventory_items')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, (payload: any) => {
                if (payload.eventType === 'DELETE') {
                  const deletedId = (payload.old as InventoryItemRow | undefined)?.id;
                  if (deletedId) setItems(prev => prev.filter(item => item.id !== deletedId));
                  return;
                }

                if (payload.new) {
                  const changedItem = mapInventoryRowToItem(payload.new as InventoryItemRow);
                  setItems(prev => filterSheetManagedInventory(mergeInventoryItems(prev, [changedItem])));
                }
            })
            .subscribe((status, error) => {
                if (error) console.error('[SUPABASE] Inventory realtime subscription error:', error);
                if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn(`[SUPABASE] Inventory realtime status: ${status}`);
            });

        // Sales Log Subscription
        const salesChannel = supabase
            .channel('public:sales_log')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sales_log' }, (payload) => {
                const newOrder = mapSalesLogRowToOrder(payload.new as SalesLogRow);
                setOrders(prev => mergeOrdersUnique([newOrder], prev));
            })
            .subscribe((status, error) => {
                if (error) console.error('[SUPABASE] Sales realtime subscription error:', error);
                if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn(`[SUPABASE] Sales realtime status: ${status}`);
            });

        // System Log Subscription
        const logsChannel = supabase
            .channel('public:system_logs')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'system_logs' }, (payload) => {
                const newLog = mapSystemLogRowToLoginLog(payload.new as SystemLogRow);
                setLoginLogs(prev => mergeLoginLogsUnique([newLog], prev));
            })
            .subscribe((status, error) => {
                if (error) console.error('[SUPABASE] System log realtime subscription error:', error);
                if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn(`[SUPABASE] System log realtime status: ${status}`);
            });

        return () => {
            window.removeEventListener('online', flushQueuedWrites);
            supabase.removeChannel(inventoryChannel);
            supabase.removeChannel(salesChannel);
            supabase.removeChannel(logsChannel);
        };
    }

    return () => {
      window.removeEventListener('online', flushQueuedWrites);
    };
  }, []);

  // --- PERSISTENCE EFFECTS ---
  useEffect(() => {
    if (items.length > 0) {
      localStorage.setItem('gp-inventory', JSON.stringify(items));
    }
  }, [items]);

  useEffect(() => {
    localStorage.setItem('gp-orders', JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    if (backorders.length > 0) localStorage.setItem('gp-backorders', JSON.stringify(backorders));
  }, [backorders]);

  useEffect(() => {
    if (loginLogs.length > 0) localStorage.setItem('gp-login-logs', JSON.stringify(loginLogs));
  }, [loginLogs]);

  // Viewport resize handler
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setViewMode(ViewMode.LIST);
      } else {
        setViewMode(prev => prev === ViewMode.LIST ? ViewMode.GRID : prev);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Apply Theme Class
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('gp-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('gp-theme', 'light');
    }
  }, [isDarkMode]);

  // --- FILTERING ---
  const filteredItems = useMemo(() => {
    // If viewing supplier inventory, filter that list instead of main inventory
    let sourceList = currentView === 'SUPPLIER_INVENTORY' ? supplierItems : items;
    
    let result = sourceList;
    if (
      currentView === 'SUPPLIER_INVENTORY' &&
      activeSupplierCatalog === 'ALL_SUPPLIERS' &&
      debouncedSearchQuery.trim().length < 2
    ) {
      return [];
    }
    if (activeFilter !== 'ALL' && currentView !== 'SUPPLIER_INVENTORY') {
      result = result.filter(item => item.type === activeFilter);
    }
    result = searchInventory(result, debouncedSearchQuery);
    return result;
  }, [items, supplierItems, activeFilter, debouncedSearchQuery, currentView, activeSupplierCatalog]);

  const filteredOrders = useMemo(() => {
    return searchOrders(orders, debouncedSearchQuery);
  }, [orders, debouncedSearchQuery]);

  const filteredBackorders = useMemo(() => {
    return searchBackorders(backorders, debouncedSearchQuery);
  }, [backorders, debouncedSearchQuery]);

  // --- STATS ---
  const stats: InventoryStats = useMemo(() => {
    return items.reduce(
      (acc, item) => ({
        totalItems: acc.totalItems + item.quantity,
        totalValueRetail: acc.totalValueRetail + (item.quantity * item.sellingPrice),
        totalValueCost: acc.totalValueCost + (item.quantity * item.costPrice),
        lowStockCount: acc.lowStockCount + (item.quantity < 4 ? 1 : 0),
      }),
      { totalItems: 0, totalValueRetail: 0, totalValueCost: 0, lowStockCount: 0 }
    );
  }, [items]);

  // --- HANDLERS ---

  const handleLoginAttempt = async (username: string, success: boolean) => {
    const logData: SystemLogInsert = {
        terminal_id: username, // "Terminal / User ID"
        event_type: 'SYSTEM_LOGIN', // "Event Type"
        status: success ? 'SUCCESS' : 'FAILURE', // "Status"
        // Date/Time is auto-handled by Supabase created_at
    };

    // 1. Sync to Supabase
    const syncResult = await insertSystemLogEntries([logData]);
    if (!syncResult.ok) {
      console.warn('[SUPABASE] System login log queued for retry:', syncResult.error);
    }

    // 2. Local State (Optimistic)
    const newLog: LoginLog = {
      id: `log-${Date.now()}`,
      username: username,
      timestamp: new Date().toISOString(),
      status: success ? 'SUCCESS' : 'FAILURE',
      event: 'SYSTEM_LOGIN'
    };
    setLoginLogs(prev => mergeLoginLogsUnique([newLog], prev));
  };

  const handleAdminAccess = async (staffName: string, password: string) => {
    try {
      await authenticateAdminSession(staffName, password);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Admin authentication failed.'
      };
    }

    const fullUsername = `${currentUser} (${staffName})`;
    
    // 1. Sync to Supabase
    const syncResult = await insertSystemLogEntries([{
        terminal_id: fullUsername,
        event_type: 'ADMIN_ACCESS',
        status: 'SUCCESS'
    }]);
    if (!syncResult.ok) {
      console.warn('[SUPABASE] Admin access log queued for retry:', syncResult.error);
    }

    // 2. Local State
    const newLog: LoginLog = {
        id: `log-${Date.now()}`,
        username: fullUsername,
        timestamp: new Date().toISOString(),
        status: 'SUCCESS',
        event: 'ADMIN_ACCESS'
    };
    setLoginLogs(prev => mergeLoginLogsUnique([newLog], prev));
    setIsAdmin(true);
    return { ok: true };
  };

  const logAdminControlEvent = async (eventType: string, staffName: StaffName, status = 'SUCCESS') => {
    const terminalName = `${currentUser || 'UNKNOWN'} (${staffName})`;
    const syncResult = await insertSystemLogEntries([{
      terminal_id: terminalName,
      event_type: eventType,
      status
    }]);

    if (!syncResult.ok) {
      console.warn(`[SUPABASE] Admin control log queued for retry: ${eventType}`, syncResult.error);
    }

    const newLog: LoginLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      username: terminalName,
      timestamp: new Date().toISOString(),
      status: status as LoginLog['status'],
      event: eventType
    };
    setLoginLogs(prev => mergeLoginLogsUnique([newLog], prev));
  };

  const handleLoginSuccess = (username: string) => {
    setCurrentUser(username);
  };

  const handleAdminToggle = () => {
    if (isAdmin) {
      void clearAdminSession();
      setIsAdmin(false);
      if (currentView === 'SYSTEM_LOGS') {
        setCurrentView('INVENTORY');
      }
    } else {
      setShowAuthModal(true);
    }
  };

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  const handleSupplierSyncCompleted = useCallback(() => {
    invalidateSupplierCatalogCache();
    setAllSupplierPOSItems([]);
    setSupplierCatalogRefreshVersion((version) => version + 1);
  }, []);

  // POS HELPERS
  const getInventoryCartTitle = (item: InventoryItem): string => {
    if (item.type === ProductType.TYRE) return `${(item as TyreProduct).size} ${(item as TyreProduct).brand}`.trim();
    if (item.type === ProductType.WHEEL) return `${(item as WheelProduct).code} ${(item as WheelProduct).size}`.trim();
    return `${(item as CoiloverProduct).brand} ${(item as CoiloverProduct).vehicleCompatibility}`.trim();
  };

  const getInventoryCartDescription = (item: InventoryItem): string => {
    if (item.type === ProductType.TYRE) {
      const tyre = item as TyreProduct;
      return [tyre.pattern, tyre.loadSpeedIndex].filter(Boolean).join(' | ');
    }
    if (item.type === ProductType.WHEEL) {
      const wheel = item as WheelProduct;
      return [wheel.pcd, wheel.offset ? `ET${wheel.offset}` : '', wheel.colour].filter(Boolean).join(' | ');
    }
    return (item as CoiloverProduct).series;
  };

  const getSupplierCartDescription = (item: InventoryItem): string => {
    if (item.type === ProductType.TYRE) {
      const tyre = item as TyreProduct;
      return [tyre.pattern, tyre.loadSpeedIndex].filter(Boolean).join(' | ');
    }
    if (item.type === ProductType.WHEEL) {
      const wheel = item as WheelProduct;
      return [wheel.pcd, wheel.offset ? `ET${wheel.offset}` : '', wheel.colour].filter(Boolean).join(' | ');
    }
    return (item as CoiloverProduct).series;
  };

  const createInventoryCartItem = (item: InventoryItem, cartQuantity = 1, appliedDiscount = 0): CartItem => ({
    id: `inv-${item.id}`,
    cartLineType: 'INVENTORY',
    inventoryItemId: item.id,
    productType: item.type,
    activityCode: item.id,
    title: getInventoryCartTitle(item),
    description: getInventoryCartDescription(item),
    quantity: item.quantity,
    sellingPrice: item.sellingPrice,
    costPrice: item.costPrice,
    lastUpdated: item.lastUpdated,
    cartQuantity: Math.min(item.quantity, Math.max(1, cartQuantity)),
    appliedDiscount: Math.min(item.sellingPrice, Math.max(0, appliedDiscount))
  });

  const createSupplierCartItem = (item: InventoryItem, cartQuantity = 1, appliedDiscount = 0): CartItem => ({
    id: `sup-${item.id}`,
    cartLineType: 'SUPPLIER',
    inventoryItemId: item.id,
    productType: item.type,
    activityCode: item.type,
    title: getInventoryCartTitle(item),
    description: getSupplierCartDescription(item),
    quantity: item.quantity,
    sellingPrice: item.sellingPrice,
    costPrice: item.costPrice,
    lastUpdated: item.lastUpdated,
    cartQuantity: Math.min(item.quantity, Math.max(1, cartQuantity)),
    appliedDiscount: Math.min(item.sellingPrice, Math.max(0, appliedDiscount))
  });

  const getPOSLineDescription = (item: CartItem): string => item.title;

  const calculatePOSTotals = (cart: CartItem[]) => {
    return cart.reduce(
      (acc, item) => {
        const unitPrice = Math.max(0, item.sellingPrice - item.appliedDiscount);
        return {
          subtotal: acc.subtotal + item.sellingPrice * item.cartQuantity,
          totalDiscount: acc.totalDiscount + item.appliedDiscount * item.cartQuantity,
          grandTotal: acc.grandTotal + unitPrice * item.cartQuantity
        };
      },
      { subtotal: 0, totalDiscount: 0, grandTotal: 0 }
    );
  };

  const buildPOSDocument = (
    documentType: InvoiceDocument['documentType'],
    cart: CartItem[],
    referenceId: string,
    staffName?: StaffName,
    createdAt = new Date().toISOString()
  ): InvoiceDocument => {
    const totals = calculatePOSTotals(cart);
    return {
      id: referenceId,
      referenceId,
      documentType,
      terminalId: currentUser || 'UNKNOWN',
      staffName,
      customer: {
        fullName: posCustomerInfo.fullName.trim(),
        contactDetail: posCustomerInfo.contactDetail.trim(),
        vehicleDetails: posCustomerInfo.vehicleDetails.trim()
      },
      createdAt,
      items: cart.map(item => ({ ...item })),
      ...totals
    };
  };

  const getHighestKnownInvoiceNumber = () => {
    return orders.reduce((highest, order) => {
      const possibleReference = order.referenceId || order.id;
      const match = possibleReference?.match(/^(\d{6})(?:-\d+)?$/);
      if (!match) return highest;
      return Math.max(highest, Number.parseInt(match[1], 10));
    }, 0);
  };

  const getNextPOSReference = (documentType: InvoiceDocument['documentType']) => {
    const counter = POS_REFERENCE_COUNTERS[documentType];
    const storedValue = Number.parseInt(localStorage.getItem(counter.storageKey) || '', 10);
    const knownNextInvoiceValue = documentType === 'INVOICE' ? getHighestKnownInvoiceNumber() + 1 : counter.startAt;
    const nextValue = Math.max(
      Number.isFinite(storedValue) ? storedValue : counter.startAt,
      knownNextInvoiceValue,
      counter.startAt
    );
    localStorage.setItem(counter.storageKey, String(nextValue + 1));
    return formatPOSReferenceNumber(nextValue);
  };

  const handlePOSAddItem = (item: InventoryItem) => {
    if (item.quantity <= 0) return;

    setPOSCart(prev => {
      const existing = prev.find(cartItem => cartItem.cartLineType === 'INVENTORY' && cartItem.inventoryItemId === item.id);
      if (existing) {
        return prev.map(cartItem => {
          if (cartItem.cartLineType !== 'INVENTORY' || cartItem.inventoryItemId !== item.id) return cartItem;
          return {
            ...createInventoryCartItem(item, cartItem.cartQuantity + 1, cartItem.appliedDiscount),
            cartQuantity: Math.min(item.quantity, cartItem.cartQuantity + 1),
            appliedDiscount: Math.min(cartItem.appliedDiscount, item.sellingPrice)
          };
        });
      }

      return [
        ...prev,
        createInventoryCartItem(item)
      ];
    });
  };

  const handlePOSAddSupplierItem = (item: InventoryItem) => {
    if (item.quantity <= 0) return;

    setPOSCart(prev => {
      const existing = prev.find(cartItem => cartItem.cartLineType === 'SUPPLIER' && cartItem.inventoryItemId === item.id);
      if (existing) {
        return prev.map(cartItem => {
          if (cartItem.cartLineType !== 'SUPPLIER' || cartItem.inventoryItemId !== item.id) return cartItem;
          return {
            ...createSupplierCartItem(item, cartItem.cartQuantity + 1, cartItem.appliedDiscount),
            cartQuantity: Math.min(item.quantity, cartItem.cartQuantity + 1),
            appliedDiscount: Math.min(cartItem.appliedDiscount, item.sellingPrice)
          };
        });
      }

      return [
        ...prev,
        createSupplierCartItem(item)
      ];
    });
  };

  const handlePOSAddService = (service: { title: string; price: number }) => {
    const serviceId = `service-${service.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

    setPOSCart(prev => {
      const existing = prev.find(item => item.id === serviceId);
      if (existing) {
        return prev.map(item => (
          item.id === serviceId
            ? { ...item, cartQuantity: Math.min(999, item.cartQuantity + 1) }
            : item
        ));
      }

      return [
        ...prev,
        {
          id: serviceId,
          cartLineType: 'SERVICE',
          activityCode: 'SERVICE',
          title: service.title,
          description: 'GP Tyres & Mags service',
          quantity: 999,
          sellingPrice: service.price,
          costPrice: 0,
          lastUpdated: new Date().toISOString().split('T')[0],
          cartQuantity: 1,
          appliedDiscount: 0
        }
      ];
    });
  };

  const handlePOSAddManualLine = (line: { title: string; description: string; quantity: number; unitPrice: number }) => {
    setPOSCart(prev => [
      ...prev,
      {
        id: `custom-${Date.now()}-${prev.length}`,
        cartLineType: 'CUSTOM',
        activityCode: 'CUSTOM',
        title: line.title,
        description: line.description,
        quantity: 999,
        sellingPrice: Math.max(0, line.unitPrice),
        costPrice: 0,
        lastUpdated: new Date().toISOString().split('T')[0],
        cartQuantity: Math.max(1, line.quantity),
        appliedDiscount: 0
      }
    ]);
  };

  const handleQuoteModulePushToPOS = (lines: PricingPOSQuoteLine[]) => {
    if (!lines.length) return;
    const timestamp = Date.now();
    const today = new Date().toISOString().split('T')[0];

    setPOSCart(prev => [
      ...prev,
      ...lines.map((line, index): CartItem => ({
        id: `quote-module-${timestamp}-${index}-${line.sourceRecordId}`,
        cartLineType: 'CUSTOM',
        activityCode: 'TYRE',
        title: line.title,
        description: line.description,
        quantity: 999,
        sellingPrice: Math.max(0, line.unitPrice),
        costPrice: 0,
        lastUpdated: today,
        cartQuantity: Math.max(1, line.quantity),
        appliedDiscount: 0
      }))
    ]);
    setIsPOSOpen(true);
  };

  const handleOpenCRMDocument = (document: InvoiceDocument) => {
    setInvoiceDocument(document);
    setIsInvoiceModalOpen(true);
  };

  const handleEditCRMDocument = (document: InvoiceDocument) => {
    setPOSCustomerInfo(document.customer);
    setPOSCart(document.items.map((item, index) => ({
      ...item,
      id: `edit-${document.referenceId}-${index}-${item.id}`,
      quantity: item.cartLineType === 'INVENTORY' || item.cartLineType === 'SUPPLIER'
        ? Math.max(item.quantity, item.cartQuantity, 1)
        : 999
    })));
    setEditingPOSDocument(document);
    setIsInvoiceModalOpen(false);
    setIsPOSOpen(true);
  };

  const handleCreateQuoteForCustomer = (customer: CRMCustomerRow) => {
    setPOSCustomerInfo(customerRowToCustomerInfo(customer));
    setPOSCart([]);
    setEditingPOSDocument(null);
    setIsPOSOpen(true);
  };

  const handlePOSRemoveItem = (itemId: string) => {
    setPOSCart(prev => prev.filter(item => item.id !== itemId));
  };

  const handlePOSUpdateQuantity = (itemId: string, quantity: number) => {
    setPOSCart(prev => prev.flatMap(item => {
      if (item.id !== itemId) return [item];

      if (item.cartLineType === 'SUPPLIER') {
        return [{ ...item, cartQuantity: Math.min(item.quantity, Math.max(1, quantity)) }];
      }

      if (item.cartLineType !== 'INVENTORY') {
        return [{ ...item, cartQuantity: Math.min(999, Math.max(1, quantity)) }];
      }

      const currentStock = items.find(stockItem => stockItem.id === item.inventoryItemId)?.quantity ?? 0;
      if (currentStock <= 0) return [];
      return [{ ...item, quantity: currentStock, cartQuantity: Math.min(currentStock, Math.max(1, quantity)) }];
    }));
  };

  const handlePOSUpdateDiscount = (itemId: string, discount: number) => {
    setPOSCart(prev => prev.map(item => (
      item.id === itemId
        ? { ...item, appliedDiscount: Math.min(item.sellingPrice, Math.max(0, discount)) }
        : item
    )));
  };

  const handlePOSUpdateLineTotal = (itemId: string, lineTotal: number) => {
    setPOSCart(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const cartQuantity = Math.max(1, item.cartQuantity);
      return {
        ...item,
        sellingPrice: Math.max(0, lineTotal) / cartQuantity,
        appliedDiscount: 0
      };
    }));
  };

  const handlePOSGenerateQuote = async (staffName?: StaffName) => {
    if (posCart.length === 0) return;
    const referenceId = editingPOSDocument?.documentType === 'QUOTE'
      ? editingPOSDocument.referenceId
      : getNextPOSReference('QUOTE');
    const quoteDocument = buildPOSDocument('QUOTE', posCart, referenceId, staffName);
    try {
      await saveCRMDocumentFromPOS(quoteDocument);
    } catch (error) {
      console.error('[SUPABASE] Quote was generated but not saved to Customer Hub:', error);
      alert(`Quote was generated, but Customer Hub save failed. ${error instanceof Error ? error.message : ''}`.trim());
    }
    setInvoiceDocument(quoteDocument);
    setIsInvoiceModalOpen(true);
    setIsPOSOpen(false);
    setEditingPOSDocument(null);
  };

  const mirrorInventoryToGoogleSheet = (
    changedItems: InventoryItem[],
    reason: string,
    operation: 'upsert' | 'delete' = 'upsert'
  ) => {
    void syncPortalInventoryItemsToSheet(changedItems, operation, reason).catch((error) => {
      console.warn('[GOOGLE SHEET] Portal stock saved, but Sheet mirror sync did not complete:', error);
    });
  };

  const handlePOSCompleteSale = async (staffName: StaffName) => {
    if (posCart.length === 0 || isCompletingPOS) return;

    if (editingPOSDocument?.documentType === 'INVOICE') {
      setIsCompletingPOS(true);
      const editedInvoice = buildPOSDocument(
        'INVOICE',
        posCart,
        editingPOSDocument.referenceId,
        staffName,
        editingPOSDocument.createdAt || new Date().toISOString()
      );

      try {
        await saveCRMDocumentFromPOS(editedInvoice);
        setInvoiceDocument(editedInvoice);
        setIsInvoiceModalOpen(true);
        setIsPOSOpen(false);
        setEditingPOSDocument(null);
      } catch (error) {
        console.error('[SUPABASE] Invoice edit save failed:', error);
        alert(`Invoice changes could not be saved. ${error instanceof Error ? error.message : ''}`.trim());
      } finally {
        setIsCompletingPOS(false);
      }
      return;
    }

    const stockById = new Map<string, InventoryItem>(items.map(item => [item.id, item] as const));
    const stockIssues = posCart.filter(cartItem => {
      if (cartItem.cartLineType !== 'INVENTORY' || !cartItem.inventoryItemId) return false;
      const currentStock = stockById.get(cartItem.inventoryItemId)?.quantity ?? 0;
      return currentStock < cartItem.cartQuantity;
    });

    if (stockIssues.length > 0) {
      alert(`Stock changed for ${stockIssues.map(getPOSLineDescription).join(', ')}. Please review the cart before completing the sale.`);
      return;
    }

    setIsCompletingPOS(true);

    const referenceId = getNextPOSReference('INVOICE');
    const createdAt = new Date().toISOString();
    const soldCart: CartItem[] = posCart.map(cartItem => {
      if (cartItem.cartLineType !== 'INVENTORY' || !cartItem.inventoryItemId) return { ...cartItem };
      const liveItem = stockById.get(cartItem.inventoryItemId);
      if (!liveItem) return { ...cartItem };
      return createInventoryCartItem(liveItem, cartItem.cartQuantity, cartItem.appliedDiscount);
    });
    const invoice = buildPOSDocument('INVOICE', soldCart, referenceId, staffName, createdAt);

    try {
      const salesLogEntries: SalesLogInsert[] = soldCart.map((item, index) => {
        const unitPrice = Math.max(0, item.sellingPrice - item.appliedDiscount);
        return {
          terminal_id: currentUser || 'UNKNOWN',
          product_id: item.inventoryItemId || item.id,
          product_description: getPOSLineDescription(item),
          quantity: item.cartQuantity,
          unit_price: unitPrice,
          total_amount: unitPrice * item.cartQuantity,
          user_id: staffName,
          customer_name: posCustomerInfo.fullName.trim(),
          reference_id: `${referenceId}-${String(index + 1).padStart(2, '0')}`
        };
      });

      const stockAdjustments: StockAdjustment[] = soldCart
        .filter(item => item.cartLineType === 'INVENTORY' && Boolean(item.inventoryItemId))
        .map(item => ({
          item_id: item.inventoryItemId as string,
          delta: -item.cartQuantity
        }));

      const updatedInventory = await processInventoryTransaction(stockAdjustments, salesLogEntries);
      if (updatedInventory.length > 0) {
        setItems(prev => mergeInventoryItems(prev, updatedInventory));
        mirrorInventoryToGoogleSheet(updatedInventory, 'pos-sale');
      }

      const newOrders: Order[] = soldCart.map((item, index) => {
        const unitPrice = Math.max(0, item.sellingPrice - item.appliedDiscount);
        const lineReferenceId = `${referenceId}-${String(index + 1).padStart(2, '0')}`;
        return {
          id: lineReferenceId,
          terminalId: currentUser || 'UNKNOWN',
          productId: item.inventoryItemId || item.id,
          productDescription: getPOSLineDescription(item),
          quantity: item.cartQuantity,
          unitPrice,
          totalPrice: unitPrice * item.cartQuantity,
          staffName,
          customerName: posCustomerInfo.fullName.trim(),
          timestamp: createdAt,
          type: 'SALE',
          referenceId: lineReferenceId
        };
      });

      setOrders(prev => mergeOrdersUnique(newOrders, prev));
      try {
        await saveCRMDocumentFromPOS(invoice);
      } catch (crmError) {
        console.error('[SUPABASE] Invoice was processed but not saved to Customer Hub:', crmError);
        alert(`Sale was processed, but Customer Hub save failed. ${crmError instanceof Error ? crmError.message : ''}`.trim());
      }
      setInvoiceDocument(invoice);
      setIsInvoiceModalOpen(true);
      setIsPOSOpen(false);
      setEditingPOSDocument(null);
      setPOSCart([]);
      setPOSCustomerInfo({ fullName: '', contactDetail: '', vehicleDetails: '' });
    } catch (error) {
      console.error('[SUPABASE] POS transaction failed:', error);
      alert(`Sale could not be completed because global stock could not be updated. ${error instanceof Error ? error.message : ''}`.trim());
    } finally {
      setIsCompletingPOS(false);
    }
  };

  // STOCK HANDLERS
  const handleStockAction = async (item: InventoryItem, action: 'ADD' | 'EDIT' | 'DELETE', staffName: StaffName) => {
    console.info(`[AUDIT] ${action} by ${staffName} on ${item.id} (Terminal: ${currentUser})`);

    try {
      if (action === 'DELETE') {
        await deleteGlobalInventoryItem(item.id);
        setItems(prev => prev.filter(i => i.id !== item.id));
        mirrorInventoryToGoogleSheet([item], 'portal-stock-delete', 'delete');
        await logAdminControlEvent(`STOCK_${action}_${item.id}`, staffName);
        return;
      }

      const savedItem = await upsertGlobalInventoryItem(item);
      setItems(prev => mergeInventoryItems(prev, [savedItem]));
      mirrorInventoryToGoogleSheet([savedItem], `portal-stock-${action.toLowerCase()}`);
      await logAdminControlEvent(`STOCK_${action}_${item.id}`, staffName);
    } catch (error) {
      console.error('[SUPABASE] Stock action failed:', error);
      await logAdminControlEvent(`STOCK_${action}_${item.id}`, staffName, 'FAILURE');
      alert(`Stock change was not saved globally. ${error instanceof Error ? error.message : ''}`.trim());
    }
  };

  const handleSell = async (item: InventoryItem, quantity: number, staffName: StaffName, finalUnitPrice: number) => {
    let desc = '';
    if (item.type === ProductType.TYRE) desc = `${(item as TyreProduct).size} ${(item as TyreProduct).brand}`;
    else if (item.type === ProductType.WHEEL) desc = `${(item as WheelProduct).code} ${(item as WheelProduct).size}`;
    else desc = `${(item as CoiloverProduct).brand} ${(item as CoiloverProduct).vehicleCompatibility}`;

    const uniqueRefId = `${currentUser}-ord-${Date.now()}`;
    
    // Supabase Insert Data (Schema: sales_log)
    const salesLogEntry: SalesLogInsert = {
        terminal_id: currentUser || 'UNKNOWN',
        product_id: item.id,
        product_description: desc,
        quantity: quantity,
        unit_price: finalUnitPrice,
        total_amount: quantity * finalUnitPrice,
        user_id: staffName,
        reference_id: uniqueRefId
        // timestamp auto-generated
    };

    try {
      const updatedInventory = await processInventoryTransaction(
        [{ item_id: item.id, delta: -quantity }],
        [salesLogEntry]
      );
      if (updatedInventory.length > 0) {
        setItems(prev => mergeInventoryItems(prev, updatedInventory));
        mirrorInventoryToGoogleSheet(updatedInventory, 'quick-sale');
      }
    } catch (error) {
      console.error('[SUPABASE] Sale transaction failed:', error);
      alert(`Sale could not be completed because global stock could not be updated. ${error instanceof Error ? error.message : ''}`.trim());
      return;
    }

    const newOrder: Order = {
      id: uniqueRefId,
      terminalId: currentUser || 'UNKNOWN',
      productId: item.id,
      productDescription: desc,
      quantity: quantity,
      unitPrice: finalUnitPrice,
      totalPrice: quantity * finalUnitPrice,
      staffName: staffName,
      timestamp: new Date().toISOString(),
      type: 'SALE',
      referenceId: uniqueRefId
    };

    setOrders(prev => mergeOrdersUnique([newOrder], prev));
  };

  const handleReserveConfirm = async (item: InventoryItem, quantity: number, customerName: string, staffName: StaffName) => {
    let desc = '';
    if (item.type === ProductType.TYRE) desc = `${(item as TyreProduct).size} ${(item as TyreProduct).brand}`;
    else if (item.type === ProductType.WHEEL) desc = `${(item as WheelProduct).code} ${(item as WheelProduct).size}`;
    else desc = `${(item as CoiloverProduct).brand} ${(item as CoiloverProduct).vehicleCompatibility}`;

    const uniqueRefId = `${currentUser}-res-${Date.now()}`;

    // Supabase Insert
    const salesLogEntry: SalesLogInsert = {
        terminal_id: currentUser || 'UNKNOWN',
        product_id: item.id,
        product_description: desc,
        quantity: quantity,
        unit_price: 0,
        total_amount: 0, // Reserve signaled by 0 amount + customer_name
        user_id: staffName,
        customer_name: customerName,
        reference_id: uniqueRefId
    };

    try {
      const updatedInventory = await processInventoryTransaction(
        [{ item_id: item.id, delta: -quantity }],
        [salesLogEntry]
      );
      if (updatedInventory.length > 0) {
        setItems(prev => mergeInventoryItems(prev, updatedInventory));
        mirrorInventoryToGoogleSheet(updatedInventory, 'reserve-stock');
      }
    } catch (error) {
      console.error('[SUPABASE] Reserve transaction failed:', error);
      alert(`Reserve could not be completed because global stock could not be updated. ${error instanceof Error ? error.message : ''}`.trim());
      return;
    }

    const newOrder: Order = {
      id: uniqueRefId,
      terminalId: currentUser || 'UNKNOWN',
      productId: item.id,
      productDescription: desc,
      quantity: quantity,
      unitPrice: 0,
      totalPrice: 0,
      staffName: staffName,
      customerName: customerName,
      timestamp: new Date().toISOString(),
      type: 'RESERVE',
      referenceId: uniqueRefId
    };

    setOrders(prev => mergeOrdersUnique([newOrder], prev));
  };

  const handleRefund = async (order: Order) => {
    if (!isAdmin) return alert("Admin privileges required for refund.");
    if (order.type === 'REFUND') return;
    
    if (window.confirm(`Are you sure you want to refund order ${order.referenceId || order.id}? Stock will be returned.`)) {
        const uniqueRefId = `${currentUser}-ref-${Date.now()}`;

        // Supabase Insert (Negative Value)
        const salesLogEntry: SalesLogInsert = {
            terminal_id: currentUser || 'UNKNOWN',
            product_id: order.productId,
            product_description: order.productDescription,
            quantity: order.quantity,
            unit_price: order.unitPrice,
            total_amount: -Math.abs(order.totalPrice), // Negative indicates refund
            user_id: currentUser || 'ADMIN', 
            reference_id: uniqueRefId
        };

        try {
            const shouldReturnStock = items.some(item => item.id === order.productId);
            const updatedInventory = await processInventoryTransaction(
                shouldReturnStock ? [{ item_id: order.productId, delta: order.quantity }] : [],
                [salesLogEntry]
            );
            if (updatedInventory.length > 0) {
                setItems(prev => mergeInventoryItems(prev, updatedInventory));
                mirrorInventoryToGoogleSheet(updatedInventory, 'refund-stock');
            }
        } catch (error) {
            console.error('[SUPABASE] Refund transaction failed:', error);
            alert(`Refund could not be completed because global stock could not be updated. ${error instanceof Error ? error.message : ''}`.trim());
            return;
        }

        // Create Refund Record Locally
        const refundOrder: Order = {
            ...order,
            id: uniqueRefId,
            totalPrice: -order.totalPrice,
            timestamp: new Date().toISOString(),
            type: 'REFUND',
            referenceId: uniqueRefId
        };
        setOrders(prev => mergeOrdersUnique([refundOrder], prev));
    }
  };

  // Bulk Delete Handler
  const handleBulkDelete = async (ids: string[]) => {
    if (!isAdmin) return;
    if (window.confirm(`Are you sure you want to delete ${ids.length} items? This cannot be undone.`)) {
      try {
        const deletedItems = items.filter(item => ids.includes(item.id));
        await Promise.all(ids.map(id => deleteGlobalInventoryItem(id)));
        setItems(prev => prev.filter(item => !ids.includes(item.id)));
        mirrorInventoryToGoogleSheet(deletedItems, 'portal-bulk-stock-delete', 'delete');
        await logAdminControlEvent(`BULK_STOCK_DELETE_${ids.length}`, currentUser || 'ADMIN');
      } catch (error) {
        console.error('[SUPABASE] Bulk delete failed:', error);
        await logAdminControlEvent(`BULK_STOCK_DELETE_${ids.length}`, currentUser || 'ADMIN', 'FAILURE');
        alert(`Some stock could not be deleted globally. ${error instanceof Error ? error.message : ''}`.trim());
      }
    }
  };

  // BACKORDER HANDLERS
  const handleBackorderSave = (backorder: Backorder) => {
    if (selectedBackorder) {
       setBackorders(prev => prev.map(bo => bo.id === backorder.id ? backorder : bo));
    } else {
       setBackorders(prev => [backorder, ...prev]);
    }
  };

  const handleBackorderDelete = (id: string) => {
    setBackorders(prev => prev.filter(bo => bo.id !== id));
  };

  const handleBackorderReceived = (id: string) => {
    setBackorders(prev => prev.map(bo => bo.id === id ? { ...bo, status: 'RECEIVED' } : bo));
  };

  // PORTAL HANDLER
  const handlePortalSelect = (name: string, url: string, view: AppView) => {
    setCurrentPortal({ name, url });
    setCurrentView(view);
  };

  const handleDashboardNavigate = (view: AppView, filter?: ProductType | 'ALL') => {
    setCurrentView(view);
    if (filter) {
      setActiveFilter(filter);
    }
  };

  // SYNC HANDLERS (Manual Backup)
  const handleExportData = () => {
    const data = {
        sourceTerminal: currentUser,
        exportDate: new Date().toISOString(),
        orders,
        loginLogs,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GP_SYNC_${currentUser}_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportData = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const json = JSON.parse(e.target?.result as string);
            
            if (json.orders && Array.isArray(json.orders)) {
                setOrders(prev => {
                    return mergeOrdersUnique(json.orders as Order[], prev)
                      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                });
            }

            if (json.loginLogs && Array.isArray(json.loginLogs)) {
                setLoginLogs(prev => {
                    return mergeLoginLogsUnique(json.loginLogs as LoginLog[], prev)
                      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                });
            }

            alert(`Sync Complete! Merged data from ${json.sourceTerminal || 'Unknown Terminal'}.`);
            setIsDataSyncModalOpen(false);

        } catch (err) {
            console.error("Import failed", err);
            alert("Failed to import data. Invalid file format.");
        }
    };
    reader.readAsText(file);
  };

  // MODAL OPENERS
  const openAddModal = () => {
    if (currentView === 'BACKORDERS') {
      setSelectedBackorder(undefined);
      setIsBackorderModalOpen(true);
    } else {
      setSelectedItem(undefined);
      setIsStockModalOpen(true);
    }
  };

  const openEditModal = (item: InventoryItem) => {
    setSelectedItem(item);
    setIsStockModalOpen(true);
  };

  const openDeleteModal = (item: InventoryItem) => {
    setSelectedItem(item);
    setIsStockModalOpen(true);
  };

  const openSellModal = (item: InventoryItem) => {
    setSelectedItem(item);
    setIsSellModalOpen(true);
  };

  const openReserveModal = (item: InventoryItem) => {
    setSelectedItem(item);
    setIsReserveModalOpen(true);
  };

  const handleSidebarToggle = () => {
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(true);
    } else {
      setIsDesktopSidebarOpen(!isDesktopSidebarOpen);
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-[100dvh] bg-gp-black text-gp-text-main">
        <LoginScreen onLogin={handleLoginSuccess} onAttempt={handleLoginAttempt} />
      </div>
    );
  }

  let searchPlaceholder = "Search inventory (e.g. 195 40 17, Dunlop...)";
  if (currentView === 'ORDERS') {
      searchPlaceholder = "Search order history...";
  } else if (currentView === 'BACKORDERS') {
      searchPlaceholder = "Search backorders...";
  } else if (currentView === 'WHEEL_CATALOG') {
      searchPlaceholder = "Search Wheel Catalog (Name, Size, PCD...)";
  } else if (currentView === 'SUPPLIER_INVENTORY') {
      searchPlaceholder = `Search ${supplierCatalogLabel} Catalog...`;
  } else if (currentView === 'QUOTE_MODULE') {
      searchPlaceholder = "Quote Module uses the paste box below...";
  } else if (currentView === 'TRAINING_PORTAL') {
      searchPlaceholder = "Search training content inside the portal...";
  } else if (currentView === 'CUSTOMER_HUB') {
      searchPlaceholder = "Search customers inside Customer Hub...";
  } else if (currentView === 'PHOTO_LIBRARY') {
      searchPlaceholder = "Search inside the photo library...";
  } else if (currentView === 'RADAR_RED') {
      searchPlaceholder = "RADAR RED resources are available inside the folder...";
  }

  const topNavTitle = currentView === 'TRAINING_PORTAL'
    ? 'TRAINING PORTAL'
    : currentView === 'CUSTOMER_HUB'
      ? 'CUSTOMER HUB'
      : currentView === 'PHOTO_LIBRARY'
        ? 'PHOTO LIBRARY'
        : currentView === 'RADAR_RED'
          ? 'RADAR RED'
      : undefined;
  const shouldShowTopSearch = currentView === 'TRAINING_PORTAL' || currentView === 'CUSTOMER_HUB' || currentView === 'PHOTO_LIBRARY' || currentView === 'RADAR_RED'
    ? false
    : isSearchVisible || currentView === 'WHEEL_CATALOG';

  return (
    <div className="flex h-screen bg-gp-black font-sans text-gp-text-main overflow-hidden transition-colors duration-300 relative">
      <Sidebar 
        currentView={currentView}
        activeFilter={activeFilter}
        onChangeView={setCurrentView}
        onFilterChange={setActiveFilter}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        currentUser={currentUser}
        isAdmin={isAdmin}
        onPortalSelect={handlePortalSelect}
        isDesktopOpen={isDesktopSidebarOpen}
        onOpenDataSync={() => setIsDataSyncModalOpen(true)}
        onOpenCashUp={() => setIsCashUpModalOpen(true)}
        activeSupplierCatalog={activeSupplierCatalog}
        onSupplierCatalogChange={setActiveSupplierCatalog}
      />

      <div className="flex-1 flex flex-col overflow-hidden relative">
        <Navbar 
          isAdmin={isAdmin}
          toggleAdmin={handleAdminToggle}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onMenuClick={handleSidebarToggle}
          isDarkMode={isDarkMode}
          toggleTheme={toggleTheme}
          isSearchVisible={shouldShowTopSearch}
          toggleSearch={() => setIsSearchVisible(!isSearchVisible)}
          toggleChat={() => setIsChatOpen(prev => !prev)}
          isChatOpen={isChatOpen}
          placeholder={searchPlaceholder}
          pageTitle={topNavTitle}
        />

        <main ref={mainScrollContainerRef} className={`flex-1 overflow-y-auto ${(currentView === 'SUPPLIER_PORTAL' || currentView === 'SHIPPING_PORTAL' || currentView === 'PAYMENT_PORTAL' || currentView === 'TOOLS_PORTAL' || currentView === 'WHATSAPP_PORTAL' || currentView === 'QUOTE_MODULE' || currentView === 'TRAINING_PORTAL' || currentView === 'CUSTOMER_HUB' || currentView === 'PHOTO_LIBRARY' || currentView === 'RADAR_RED') ? '' : 'pb-20'}`}>
          {currentView === 'DASHBOARD' && (
            <DashboardView 
              currentUser={currentUser}
              stats={stats}
              isAdmin={isAdmin}
              onNavigate={handleDashboardNavigate}
              onPortalSelect={handlePortalSelect}
            />
          )}

          {(currentView === 'INVENTORY' || currentView === 'SUPPLIER_INVENTORY' || currentView === 'WHEEL_CATALOG') && (
            <>
              {currentView === 'INVENTORY' && (
                <StatsDashboard stats={stats} visible={isAdmin} />
              )}
              
              <div className="max-w-7xl mx-auto px-4 mt-6 flex flex-col md:flex-row justify-between items-center border-b border-gp-border pb-4 gap-4">
                <h2 className="text-gp-text-muted text-xs uppercase tracking-widest font-bold flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full animate-pulse ${currentView === 'SUPPLIER_INVENTORY' ? 'bg-blue-500' : 'bg-gp-red'}`}></span>
                  {currentView === 'WHEEL_CATALOG'
                    ? 'Wheel Catalogue'
                    : currentView === 'SUPPLIER_INVENTORY'
                    ? `${supplierCatalogLabel} Catalog (${filteredItems.length})`
                    : activeFilter === 'ALL' ? 'Full Inventory' : `${activeFilter} Inventory (${filteredItems.length})`}
                </h2>
                {currentView === 'INVENTORY' && <SheetInventorySyncStatus visible compact />}
              </div>
              <div className="max-w-7xl mx-auto mt-4 px-2 md:px-4">
                {currentView === 'SUPPLIER_INVENTORY' && (
                    <div className="mb-4 grid gap-4 rounded-xl border border-blue-900/30 bg-blue-900/10 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(560px,620px)] lg:items-start">
                      <div className="flex items-center gap-3">
                        <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <p className="text-xs text-blue-400"><strong>READ ONLY MODE:</strong> {supplierCatalogNote}</p>
                      </div>
                      {(supplierPortalUrl || supplierHasLiveSync) && (
                        <div className="grid w-full items-start gap-2 sm:grid-cols-3" aria-label={`${supplierCatalogLabel} supplier actions`}>
                          {supplierPortalUrl && (
                            <a
                              href={supplierPortalUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-11 w-full min-w-0 items-center justify-center whitespace-nowrap rounded-lg border border-red-400/60 bg-gp-red px-4 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-gp-red/20 transition hover:-translate-y-px hover:bg-red-700 active:translate-y-0"
                            >
                              Live Portal
                            </a>
                          )}
                          <SupplierSyncButton
                            terminal={currentUser}
                            catalog={activeSupplierCatalog}
                            supplierLabel={supplierCatalogLabel}
                            visible={supplierHasLiveSync}
                            canTrigger={isAdmin && supplierUsesPortalWorker}
                            workerRequired={supplierUsesPortalWorker}
                            onAdminRequired={() => setShowAuthModal(true)}
                            onCompleted={handleSupplierSyncCompleted}
                          />
                          {isLiveSupplierCatalog(activeSupplierCatalog) && (
                            <ManualSupplierImport
                              terminal={currentUser}
                              catalog={activeSupplierCatalog}
                              supplierLabel={supplierCatalogLabel}
                              visible
                              canOpen={isAdmin}
                              onAdminRequired={() => setShowAuthModal(true)}
                              onPublished={handleSupplierSyncCompleted}
                            />
                          )}
                        </div>
                      )}
                    </div>
                )}
                {currentView === 'WHEEL_CATALOG' ? (
                  <Suspense fallback={<LoadingPanel label="Loading wheel catalogue..." />}>
                    <WheelCatalogView searchQuery={debouncedSearchQuery} isAdmin={isAdmin} />
                  </Suspense>
                ) : isSupplierCatalogLoading ? (
                  <LoadingPanel label={`Loading ${supplierCatalogLabel} stock...`} />
                ) : supplierCatalogError ? (
                  <div className="m-4 rounded-lg border border-gp-red/40 bg-gp-red/10 p-4 text-sm font-bold text-gp-red">
                    {supplierCatalogError}
                  </div>
                ) : (
                  <InventoryView
                    items={filteredItems}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    isAdmin={isAdmin}
                    onEdit={openEditModal}
                    onDelete={openDeleteModal}
                    onSell={openSellModal}
                    onReserve={openReserveModal}
                    onBulkDelete={handleBulkDelete}
                    isReadOnly={currentView === 'SUPPLIER_INVENTORY'}
                    showSupplierName={currentView === 'SUPPLIER_INVENTORY' && activeSupplierCatalog === 'ALL_SUPPLIERS'}
                    priceLabel={currentView === 'SUPPLIER_INVENTORY' && activeSupplierCatalog === 'ALINE' ? 'Recommended Selling Price' : undefined}
                  />
                )}
              </div>
            </>
          )}

          {currentView === 'ORDERS' && (
            <OrdersView orders={filteredOrders} onRefund={handleRefund} />
          )}

          {currentView === 'BACKORDERS' && (
            <BackordersView 
              backorders={filteredBackorders} 
              onMarkReceived={handleBackorderReceived}
              onDelete={handleBackorderDelete}
              onEdit={(bo) => { setSelectedBackorder(bo); setIsBackorderModalOpen(true); }}
            />
          )}

          {currentView === 'SYSTEM_LOGS' && isAdmin && (
            <SystemLogsView logs={loginLogs} />
          )}

          {currentView === 'QUOTE_MODULE' && (
            <Suspense fallback={<LoadingPanel label="Loading quote module..." />}>
              <QuoteModuleView onPushToPOSQuote={handleQuoteModulePushToPOS} />
            </Suspense>
          )}

          {currentView === 'TRAINING_PORTAL' && (
            <Suspense fallback={<LoadingPanel label="Loading training portal..." />}>
              <TrainingPortalView currentUser={currentUser} />
            </Suspense>
          )}

          {currentView === 'CUSTOMER_HUB' && (
            <Suspense fallback={<LoadingPanel label="Loading customer hub..." />}>
              <CustomerHubView
                currentUser={currentUser}
                onOpenDocument={handleOpenCRMDocument}
                onEditDocument={handleEditCRMDocument}
                onCreateQuoteForCustomer={handleCreateQuoteForCustomer}
              />
            </Suspense>
          )}

          {currentView === 'PHOTO_LIBRARY' && (
            <Suspense fallback={<LoadingPanel label="Loading customer photo library..." />}>
              <PhotoLibraryView isAdmin={isAdmin} />
            </Suspense>
          )}

          {currentView === 'RADAR_RED' && (
            <Suspense fallback={<LoadingPanel label="Loading RADAR RED resources..." />}>
              <RadarRedView />
            </Suspense>
          )}

          {(currentView === 'SUPPLIER_PORTAL' || currentView === 'SHIPPING_PORTAL' || currentView === 'PAYMENT_PORTAL' || currentView === 'TOOLS_PORTAL' || currentView === 'WHATSAPP_PORTAL') && currentPortal && (
            <div className="w-full h-full flex flex-col bg-gp-black relative">
              <div className="bg-gp-input border-b border-gp-border p-2 flex items-center gap-2 sticky top-0 z-10 shadow-sm">
                <div className="flex-1 bg-gp-panel border border-gp-border rounded flex items-center px-3 py-1.5 gap-2 overflow-hidden mx-2">
                    <span className="text-xs text-gp-text-muted truncate font-mono flex-1">{currentPortal.url}</span>
                </div>
                <a href={currentPortal.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-gp-red hover:bg-red-700 text-white px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all">
                    <span>Open External</span>
                </a>
              </div>
              <div className="flex-1 relative w-full h-full bg-white">
                 <iframe id="supplier-frame" src={currentPortal.url} className="absolute inset-0 w-full h-full border-none" title={`Portal: ${currentPortal.name}`} sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals" />
              </div>
            </div>
          )}
        </main>

        {isChatOpen && (
          <Suspense fallback={null}>
            <ChatBot isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} onMinimize={() => setIsChatOpen(false)} />
          </Suspense>
        )}

        <button
          type="button"
          onClick={handleScrollToTop}
          className={`fixed bottom-7 right-24 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-gp-border bg-gp-panel text-gp-text-main shadow-lg transition-all hover:-translate-y-0.5 hover:border-gp-red hover:text-gp-red active:translate-y-0 ${isScrollToTopVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'}`}
          title="Scroll to top"
          aria-label="Scroll to top"
          aria-hidden={!isScrollToTopVisible}
          tabIndex={isScrollToTopVisible ? 0 : -1}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
          </svg>
        </button>

        <button
          onClick={() => {
            setEditingPOSDocument(null);
            setIsPOSOpen(true);
          }}
          className="fixed bottom-6 right-6 z-50 flex items-center justify-center rounded-full bg-gp-red p-4 text-white shadow-[0_0_20px_rgba(255,0,0,0.6)] transition-transform hover:scale-105 hover:bg-red-700 active:scale-95"
          title="Open Quick POS"
          aria-label="Open Quick POS"
        >
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
          </svg>
        </button>

        {(currentView === 'INVENTORY' || currentView === 'BACKORDERS') && (
          <button onClick={openAddModal} className="fixed bottom-24 right-6 z-30 rounded-full border border-gp-border bg-gp-panel p-3 text-gp-text-main shadow-lg transition-transform hover:scale-105 hover:bg-gp-border active:scale-95" title={currentView === 'BACKORDERS' ? "Add Backorder" : "Add New Stock"} aria-label={currentView === 'BACKORDERS' ? "Add Backorder" : "Add New Stock"}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </button>
        )}
      </div>

      <StockActionModal isOpen={isStockModalOpen} onClose={() => setIsStockModalOpen(false)} onSave={handleStockAction} initialItem={selectedItem} isAdmin={isAdmin} />
      <SellModal isOpen={isSellModalOpen} onClose={() => setIsSellModalOpen(false)} onSell={handleSell} item={selectedItem} />
      <BackorderModal isOpen={isBackorderModalOpen} onClose={() => setIsBackorderModalOpen(false)} onSave={handleBackorderSave} initialData={selectedBackorder} />
      <AdminAuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} onLogin={handleAdminAccess} />
      <DataSyncModal isOpen={isDataSyncModalOpen} onClose={() => setIsDataSyncModalOpen(false)} onExport={handleExportData} onImport={handleImportData} />
      <ReserveModal isOpen={isReserveModalOpen} onClose={() => setIsReserveModalOpen(false)} onReserve={handleReserveConfirm} item={selectedItem} />
      <ShiftReconciliationModal isOpen={isCashUpModalOpen} onClose={() => setIsCashUpModalOpen(false)} orders={orders} />
      {isPOSOpen && (
        <Suspense fallback={<LoadingPanel label="Opening Quick POS..." />}>
          <POSModal
            isOpen={isPOSOpen}
            onClose={() => {
              setIsPOSOpen(false);
              setEditingPOSDocument(null);
            }}
            items={items}
            supplierItems={allSupplierPOSItems}
            cart={posCart}
            customerInfo={posCustomerInfo}
            onCustomerInfoChange={setPOSCustomerInfo}
            onAddItem={handlePOSAddItem}
            onAddSupplierItem={handlePOSAddSupplierItem}
            onAddService={handlePOSAddService}
            onAddManualLine={handlePOSAddManualLine}
            onRemoveItem={handlePOSRemoveItem}
            onUpdateQuantity={handlePOSUpdateQuantity}
            onUpdateDiscount={handlePOSUpdateDiscount}
            onUpdateLineTotal={handlePOSUpdateLineTotal}
            onCompleteSale={handlePOSCompleteSale}
            onGenerateQuote={handlePOSGenerateQuote}
            isCompletingSale={isCompletingPOS || isSupplierPOSLoading}
            quoteActionLabel={editingPOSDocument?.documentType === 'QUOTE' ? 'Update Quote' : 'Generate Quote'}
            saleActionLabel={editingPOSDocument?.documentType === 'INVOICE' ? 'Save Invoice' : 'Complete Sale'}
          />
        </Suspense>
      )}
      {isInvoiceModalOpen && (
        <Suspense fallback={<LoadingPanel label="Loading invoice..." />}>
          <InvoiceModal
            isOpen={isInvoiceModalOpen}
            document={invoiceDocument}
            onClose={() => setIsInvoiceModalOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
};

export default App;
