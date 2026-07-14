
import React, { useState, useEffect } from 'react';
import { AppView, ProductType, SupplierCatalog } from '../types';
import gpLogo from '../assets/gp-tyres-logo-transparent.png';

interface SidebarProps {
  currentView: AppView;
  activeFilter: ProductType | 'ALL';
  onChangeView: (view: AppView) => void;
  onFilterChange: (filter: ProductType | 'ALL') => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  currentUser?: string;
  isAdmin: boolean;
  onPortalSelect: (name: string, url: string, view: AppView) => void;
  isDesktopOpen: boolean;
  onOpenDataSync: () => void;
  onOpenCashUp: () => void;
  activeSupplierCatalog: SupplierCatalog;
  onSupplierCatalogChange: (catalog: SupplierCatalog) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  currentView, 
  activeFilter, 
  onChangeView, 
  onFilterChange,
  isOpen,
  setIsOpen,
  currentUser,
  isAdmin,
  onPortalSelect,
  isDesktopOpen,
  onOpenDataSync,
  onOpenCashUp,
  activeSupplierCatalog,
  onSupplierCatalogChange
}) => {
  const [productsOpen, setProductsOpen] = useState(true);
  const [ordersOpen, setOrdersOpen] = useState(true);
  const [suppliersOpen, setSuppliersOpen] = useState(true);
  const [shippingOpen, setShippingOpen] = useState(true);
  const [paymentOpen, setPaymentOpen] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(true);
  const [commsOpen, setCommsOpen] = useState(true);
  const [time, setTime] = useState(new Date());
  
  // Track selected portal name locally to highlight correct button
  const [selectedPortalName, setSelectedPortalName] = useState<string>('');

  // Real-time clock effect
  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleDashboardClick = () => {
    onChangeView('DASHBOARD');
    setSelectedPortalName('');
    if (window.innerWidth < 1024) setIsOpen(false);
  };

  const handleProductClick = (filter: ProductType | 'ALL') => {
    onChangeView('INVENTORY');
    onFilterChange(filter);
    setSelectedPortalName('');
    if (window.innerWidth < 1024) setIsOpen(false);
  };

  const handleWheelCatalogClick = () => {
    onChangeView('WHEEL_CATALOG');
    setSelectedPortalName('');
    if (window.innerWidth < 1024) setIsOpen(false);
  }

  const handleOrderClick = (view: AppView) => {
    onChangeView(view);
    setSelectedPortalName('');
    if (window.innerWidth < 1024) setIsOpen(false);
  };

  const handleSupplierClick = (catalog: SupplierCatalog) => {
    onSupplierCatalogChange(catalog);
    onChangeView('SUPPLIER_INVENTORY');
    setSelectedPortalName(catalog);
    if (window.innerWidth < 1024) setIsOpen(false);
  };

  const handlePortalClick = (name: string, url: string, view: AppView) => {
    onPortalSelect(name, url, view);
    setSelectedPortalName(name);
    if (window.innerWidth < 1024) setIsOpen(false);
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/80 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-gp-dark border-r border-gp-border flex flex-col shadow-2xl
        transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
        lg:static lg:shadow-none
        ${/* Mobile: Transform based toggle */ ''}
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        ${/* Desktop: Margin based toggle - Disable transform to allow layout flow */ ''}
        lg:transform-none
        ${isDesktopOpen ? 'lg:ml-0' : 'lg:-ml-64'}
      `}>
        
        {/* Logo Area */}
        <div className="p-6 border-b border-gp-border flex flex-col items-center relative whitespace-nowrap shrink-0">
          <div className="flex flex-col w-full items-center">
            <img 
              src={gpLogo}
              alt="GP Tyres & Mags" 
              className="w-full max-w-[160px] h-auto mb-3"
            />
            <span className="text-xs text-gp-text-muted font-bold tracking-[0.2em] uppercase block text-center">
              Inventory Tracker
            </span>
            {currentUser && (
               <span className="mt-3 px-2 py-0.5 bg-gp-input border border-gp-border rounded text-[9px] font-mono text-gp-text-muted">
                 ID: {currentUser}
               </span>
            )}
          </div>
          <button onClick={() => setIsOpen(false)} className="lg:hidden text-gp-text-muted absolute top-6 right-4">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-2 whitespace-nowrap">
          
          {/* Dashboard */}
          <button 
            onClick={handleDashboardClick}
            className={`flex items-center w-full px-3 py-2 rounded transition-colors ${currentView === 'DASHBOARD' ? 'bg-gp-red/10 text-gp-red' : 'text-gp-text-muted hover:text-gp-text-main hover:bg-gp-border'}`}
          >
            <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="font-bold text-sm">Dashboard</span>
          </button>

          <button
            onClick={() => handleOrderClick('TRAINING_PORTAL')}
            className={`flex items-center w-full px-3 py-2 rounded transition-colors ${currentView === 'TRAINING_PORTAL' ? 'bg-gp-red/10 text-gp-red' : 'text-gp-text-muted hover:text-gp-text-main hover:bg-gp-border'}`}
          >
            <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5S19.832 5.477 21 6.253v13C19.832 18.477 18.246 18 16.5 18s-3.332.477-4.5 1.253" />
            </svg>
            <span className="font-bold text-sm">Training Portal</span>
          </button>

          <button
            onClick={() => handleOrderClick('CUSTOMER_HUB')}
            className={`flex items-center w-full px-3 py-2 rounded transition-colors ${currentView === 'CUSTOMER_HUB' ? 'bg-gp-red/10 text-gp-red' : 'text-gp-text-muted hover:text-gp-text-main hover:bg-gp-border'}`}
          >
            <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-4-4h-1M9 20H4v-2a4 4 0 014-4h1m8-4a4 4 0 10-8 0 4 4 0 008 0zm-8 0a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <span className="font-bold text-sm">Customer Hub</span>
          </button>

          <button
            onClick={() => handleOrderClick('PHOTO_LIBRARY')}
            className={`flex items-center w-full px-3 py-2 rounded transition-colors ${currentView === 'PHOTO_LIBRARY' ? 'bg-gp-red/10 text-gp-red' : 'text-gp-text-muted hover:text-gp-text-main hover:bg-gp-border'}`}
          >
            <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h3l1.5-2h7L17 7h3v12H4V7Zm4 6a4 4 0 1 0 8 0 4 4 0 0 0-8 0Z" />
            </svg>
            <span className="font-bold text-sm">Photo Library</span>
          </button>

          {/* Products Group */}
          <div>
            <button 
              onClick={() => setProductsOpen(!productsOpen)}
              className={`flex items-center w-full px-3 py-3 rounded transition-all ${productsOpen ? 'bg-gp-red text-white shadow-[0_0_15px_rgba(255,0,0,0.4)]' : 'text-gp-text-muted hover:bg-gp-border'}`}
            >
              <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <span className="font-bold text-sm flex-1 text-left">Products</span>
              <svg className={`w-4 h-4 transition-transform ${productsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {productsOpen && (
              <div className="mt-2 space-y-1 pl-4">
                <button 
                  onClick={() => handleProductClick('ALL')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'INVENTORY' && activeFilter === 'ALL' ? 'text-gp-red bg-gp-red/10' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  Available Stock
                </button>
                <button 
                  onClick={() => handleProductClick(ProductType.TYRE)}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'INVENTORY' && activeFilter === ProductType.TYRE ? 'text-gp-red bg-gp-red/10' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  Tyres
                </button>
                <button 
                  onClick={() => handleProductClick(ProductType.COILOVER)}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'INVENTORY' && activeFilter === ProductType.COILOVER ? 'text-gp-red bg-gp-red/10' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  Accessories
                </button>
                <button 
                  onClick={handleWheelCatalogClick}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors border-l-2 ${currentView === 'WHEEL_CATALOG' ? 'border-gp-red text-gp-text-main bg-gp-input' : 'border-transparent text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  Wheel Catalogue
                </button>
              </div>
            )}
          </div>

          {/* Supplier Catalogues Group */}
          <div>
            <button 
              onClick={() => setSuppliersOpen(!suppliersOpen)}
              className="flex items-center w-full px-3 py-3 mt-4 text-gp-text-muted hover:text-gp-text-main hover:bg-gp-border rounded transition-colors"
            >
              <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <span className="font-bold text-sm flex-1 text-left">Supplier Catalogues</span>
              <svg className={`w-4 h-4 transition-transform ${suppliersOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {suppliersOpen && (
              <div className="mt-2 space-y-1 pl-4">
                <button
                  onClick={() => handleSupplierClick('ALL_SUPPLIERS')}
                  className={`block w-full text-left px-4 py-2 text-xs font-bold rounded transition-colors ${currentView === 'SUPPLIER_INVENTORY' && activeSupplierCatalog === 'ALL_SUPPLIERS' ? 'text-gp-red bg-gp-red/10 border-l-2 border-gp-red' : 'text-gp-text-main bg-gp-input/60 hover:bg-gp-border'}`}
                >
                  All Supplier Stock
                </button>
                <button 
                  onClick={() => handleSupplierClick('SAILUN')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'SUPPLIER_INVENTORY' && activeSupplierCatalog === 'SAILUN' ? 'text-gp-red bg-gp-red/10 border-l-2 border-gp-red' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  Sailun (Inc. VAT)
                </button>
                <button
                  onClick={() => handleSupplierClick('EXCLUSIVE_TYRES')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'SUPPLIER_INVENTORY' && activeSupplierCatalog === 'EXCLUSIVE_TYRES' ? 'text-gp-red bg-gp-red/10 border-l-2 border-gp-red' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  EXCLUSIVE TYRES
                </button>
                <button
                  onClick={() => handleSupplierClick('TYREWAREHOUSE')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'SUPPLIER_INVENTORY' && activeSupplierCatalog === 'TYREWAREHOUSE' ? 'text-gp-red bg-gp-red/10 border-l-2 border-gp-red' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  TYREWAREHOUSE
                </button>
                <button
                  onClick={() => handleSupplierClick('ATT')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'SUPPLIER_INVENTORY' && activeSupplierCatalog === 'ATT' ? 'text-gp-red bg-gp-red/10 border-l-2 border-gp-red' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  ATT
                </button>
                <button
                  onClick={() => handleSupplierClick('BRIDGESTONE')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'SUPPLIER_INVENTORY' && activeSupplierCatalog === 'BRIDGESTONE' ? 'text-gp-red bg-gp-red/10 border-l-2 border-gp-red' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  BRIDGESTONE
                </button>
                <button
                  onClick={() => handleSupplierClick('SAFETY_GRIP')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'SUPPLIER_INVENTORY' && activeSupplierCatalog === 'SAFETY_GRIP' ? 'text-gp-red bg-gp-red/10 border-l-2 border-gp-red' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  SAFETY GRIP
                </button>
                <button
                  onClick={() => handleSupplierClick('ALINE')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'SUPPLIER_INVENTORY' && activeSupplierCatalog === 'ALINE' ? 'text-gp-red bg-gp-red/10 border-l-2 border-gp-red' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  ALINE
                </button>
                <button
                  onClick={() => handleSupplierClick('STAMFORD')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'SUPPLIER_INVENTORY' && activeSupplierCatalog === 'STAMFORD' ? 'text-gp-red bg-gp-red/10 border-l-2 border-gp-red' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  STAMFORD
                </button>
                <button
                  onClick={() => handleSupplierClick('APEX')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'SUPPLIER_INVENTORY' && activeSupplierCatalog === 'APEX' ? 'text-gp-red bg-gp-red/10 border-l-2 border-gp-red' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  APEX
                </button>
                <button
                  onClick={() => handleSupplierClick('TUBESTONE')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'SUPPLIER_INVENTORY' && activeSupplierCatalog === 'TUBESTONE' ? 'text-gp-red bg-gp-red/10 border-l-2 border-gp-red' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  TUBESTONE
                </button>
                <button
                  onClick={() => handleSupplierClick('EXOTIC')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'SUPPLIER_INVENTORY' && activeSupplierCatalog === 'EXOTIC' ? 'text-gp-red bg-gp-red/10 border-l-2 border-gp-red' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  EXOTIC
                </button>
                <button
                  onClick={() => handleSupplierClick('ARC')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'SUPPLIER_INVENTORY' && activeSupplierCatalog === 'ARC' ? 'text-gp-red bg-gp-red/10 border-l-2 border-gp-red' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  ARC
                </button>
                <button
                  onClick={() => handleSupplierClick('TREAD_ZONE')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'SUPPLIER_INVENTORY' && activeSupplierCatalog === 'TREAD_ZONE' ? 'text-gp-red bg-gp-red/10 border-l-2 border-gp-red' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  TREAD ZONE
                </button>
                <button
                  onClick={() => handleSupplierClick('SUMITOMO_DUNLOP')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'SUPPLIER_INVENTORY' && activeSupplierCatalog === 'SUMITOMO_DUNLOP' ? 'text-gp-red bg-gp-red/10 border-l-2 border-gp-red' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  SUMITOMO/DUNLOP
                </button>
                <button
                  onClick={() => handleSupplierClick('TREADS_UNLIMITED')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'SUPPLIER_INVENTORY' && activeSupplierCatalog === 'TREADS_UNLIMITED' ? 'text-gp-red bg-gp-red/10 border-l-2 border-gp-red' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  TREADS UNLIMITED
                </button>
                <button
                  onClick={() => handleSupplierClick('TYRE_LIFE')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'SUPPLIER_INVENTORY' && activeSupplierCatalog === 'TYRE_LIFE' ? 'text-gp-red bg-gp-red/10 border-l-2 border-gp-red' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  TYRE LIFE
                </button>
                <button
                  onClick={() => handleSupplierClick('TYRE_LIFE_WHEELS')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'SUPPLIER_INVENTORY' && activeSupplierCatalog === 'TYRE_LIFE_WHEELS' ? 'text-gp-red bg-gp-red/10 border-l-2 border-gp-red' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  TYRE LIFE WHEELS
                </button>
              </div>
            )}
          </div>

          {/* Communications Group */}
          <div>
            <button 
              onClick={() => setCommsOpen(!commsOpen)}
              className="flex items-center w-full px-3 py-3 mt-4 text-gp-text-muted hover:text-gp-text-main hover:bg-gp-border rounded transition-colors"
            >
              <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="font-bold text-sm flex-1 text-left">Communication</span>
              <svg className={`w-4 h-4 transition-transform ${commsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {commsOpen && (
              <div className="mt-2 space-y-1 pl-4">
                <button 
                  onClick={() => handlePortalClick('WhatsApp', 'https://web.whatsapp.com/', 'WHATSAPP_PORTAL')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'WHATSAPP_PORTAL' ? 'text-gp-text-main hover:bg-gp-border border-l-2 border-gp-red bg-gp-input' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  WhatsApp Web
                </button>
              </div>
            )}
          </div>

          {/* Shipping Group */}
          <div>
            <button 
              onClick={() => setShippingOpen(!shippingOpen)}
              className="flex items-center w-full px-3 py-3 mt-4 text-gp-text-muted hover:text-gp-text-main hover:bg-gp-border rounded transition-colors"
            >
              <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
              </svg>
              <span className="font-bold text-sm flex-1 text-left">Shipping</span>
              <svg className={`w-4 h-4 transition-transform ${shippingOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {shippingOpen && (
              <div className="mt-2 space-y-1 pl-4">
                <button 
                  onClick={() => handlePortalClick('SWE', 'https://siyweb45531.pperfect.com/pponline/', 'SHIPPING_PORTAL')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'SHIPPING_PORTAL' && selectedPortalName === 'SWE' ? 'text-gp-text-main hover:bg-gp-border border-l-2 border-gp-red bg-gp-input' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  SWE
                </button>
                <button 
                  onClick={() => handlePortalClick('Tracking', 'https://SWE.pperfect.com', 'SHIPPING_PORTAL')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'SHIPPING_PORTAL' && selectedPortalName === 'Tracking' ? 'text-gp-text-main hover:bg-gp-border border-l-2 border-gp-red bg-gp-input' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  Tracking
                </button>
                <button 
                  onClick={() => handlePortalClick('The Courier Guy', 'https://portal.thecourierguy.co.za/', 'SHIPPING_PORTAL')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'SHIPPING_PORTAL' && selectedPortalName === 'The Courier Guy' ? 'text-gp-text-main hover:bg-gp-border border-l-2 border-gp-red bg-gp-input' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  The Courier Guy
                </button>
                <button 
                  onClick={() => handlePortalClick('ITT', 'https://ittweb41184.pperfect.com/pponline/', 'SHIPPING_PORTAL')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'SHIPPING_PORTAL' && selectedPortalName === 'ITT' ? 'text-gp-text-main hover:bg-gp-border border-l-2 border-gp-red bg-gp-input' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  ITT
                </button>
                <button 
                  onClick={() => handlePortalClick('Bigfoot', 'https://bfweb11897.pperfect.com/pponline/', 'SHIPPING_PORTAL')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'SHIPPING_PORTAL' && selectedPortalName === 'Bigfoot' ? 'text-gp-text-main hover:bg-gp-border border-l-2 border-gp-red bg-gp-input' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  Bigfoot
                </button>
              </div>
            )}
          </div>

          {/* Payment Gateway Group */}
          <div>
            <button 
              onClick={() => setPaymentOpen(!paymentOpen)}
              className="flex items-center w-full px-3 py-3 mt-4 text-gp-text-muted hover:text-gp-text-main hover:bg-gp-border rounded transition-colors"
            >
              <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              <span className="font-bold text-sm flex-1 text-left">Payment Gateway</span>
              <svg className={`w-4 h-4 transition-transform ${paymentOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {paymentOpen && (
              <div className="mt-2 space-y-1 pl-4">
                <button 
                  onClick={() => handlePortalClick('PayFast', 'https://my.payfast.io/login', 'PAYMENT_PORTAL')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'PAYMENT_PORTAL' && selectedPortalName === 'PayFast' ? 'text-gp-text-main hover:bg-gp-border border-l-2 border-gp-red bg-gp-input' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  PayFast
                </button>
                <button 
                  onClick={() => handlePortalClick('PayFlex', 'https://merchant.payflex.co.za/merchant-users', 'PAYMENT_PORTAL')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'PAYMENT_PORTAL' && selectedPortalName === 'PayFlex' ? 'text-gp-text-main hover:bg-gp-border border-l-2 border-gp-red bg-gp-input' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  PayFlex
                </button>
                <button 
                  onClick={() => handlePortalClick('PayJustNow', 'https://partners.payjustnow.com/', 'PAYMENT_PORTAL')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'PAYMENT_PORTAL' && selectedPortalName === 'PayJustNow' ? 'text-gp-text-main hover:bg-gp-border border-l-2 border-gp-red bg-gp-input' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  PayJustNow
                </button>
              </div>
            )}
          </div>

          {/* Tools Group */}
          <div>
            <button 
              onClick={() => setToolsOpen(!toolsOpen)}
              className="flex items-center w-full px-3 py-3 mt-4 text-gp-text-muted hover:text-gp-text-main hover:bg-gp-border rounded transition-colors"
            >
              <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="font-bold text-sm flex-1 text-left">Tools</span>
              <svg className={`w-4 h-4 transition-transform ${toolsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {toolsOpen && (
              <div className="mt-2 space-y-1 pl-4">
                <button
                  onClick={() => handleOrderClick('QUOTE_MODULE')}
                  className={`block w-full text-left px-4 py-2 text-xs font-bold rounded transition-colors ${currentView === 'QUOTE_MODULE' ? 'text-gp-red bg-gp-red/10 border-l-2 border-gp-red' : 'text-gp-text-main bg-gp-input/60 hover:bg-gp-border'}`}
                >
                  Quote Module
                </button>
                <button 
                  onClick={() => handlePortalClick('Virtual Garage', 'https://gp-tyres-mags-virtual-garage-195826084752.us-west1.run.app/', 'TOOLS_PORTAL')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'TOOLS_PORTAL' && selectedPortalName === 'Virtual Garage' ? 'text-gp-text-main hover:bg-gp-border border-l-2 border-gp-red bg-gp-input' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  Virtual Garage
                </button>
                <button 
                  onClick={() => handlePortalClick('Shipping Calculator', 'https://gp-tyres-mags-calculator-1006145536003.us-west1.run.app/', 'TOOLS_PORTAL')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'TOOLS_PORTAL' && selectedPortalName === 'Shipping Calculator' ? 'text-gp-text-main hover:bg-gp-border border-l-2 border-gp-red bg-gp-input' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  Shipping Calculator
                </button>
                <button 
                  onClick={() => handlePortalClick('Tyre Size Comparison', 'https://tiresize.com/comparison/', 'TOOLS_PORTAL')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'TOOLS_PORTAL' && selectedPortalName === 'Tyre Size Comparison' ? 'text-gp-text-main hover:bg-gp-border border-l-2 border-gp-red bg-gp-input' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  Tyre Size Comparison
                </button>
                <button 
                  onClick={() => handlePortalClick('Wheel Spec', 'https://www.wheel-size.com/', 'TOOLS_PORTAL')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'TOOLS_PORTAL' && selectedPortalName === 'Wheel Spec' ? 'text-gp-text-main hover:bg-gp-border border-l-2 border-gp-red bg-gp-input' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  Wheel Spec
                </button>
              </div>
            )}
          </div>

          {/* Orders Group */}
          <div>
            <button 
              onClick={() => setOrdersOpen(!ordersOpen)}
              className="flex items-center w-full px-3 py-3 mt-4 text-gp-text-muted hover:text-gp-text-main hover:bg-gp-border rounded transition-colors"
            >
              <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13L5.4 5M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span className="font-bold text-sm flex-1 text-left">Orders & Stock</span>
              <svg className={`w-4 h-4 transition-transform ${ordersOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {ordersOpen && (
              <div className="mt-2 space-y-1 pl-4">
                <button 
                  onClick={() => handleOrderClick('ORDERS')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'ORDERS' ? 'text-gp-red bg-gp-red/10' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  Order History
                </button>
                <button 
                  onClick={() => handleOrderClick('BACKORDERS')}
                  className={`block w-full text-left px-4 py-2 text-xs font-medium rounded transition-colors ${currentView === 'BACKORDERS' ? 'text-gp-red bg-gp-red/10' : 'text-gp-text-muted hover:text-gp-text-main'}`}
                >
                  Backorders <span className="ml-1 text-[9px] bg-gp-red text-white px-1.5 rounded-full font-bold">NEW</span>
                </button>
              </div>
            )}
          </div>

          {/* Admin Controls (Only Visible when Admin) */}
          {isAdmin && (
            <div className="mt-4 pt-4 border-t border-gp-border">
                <p className="px-3 text-[10px] font-bold uppercase text-gp-text-muted mb-2 tracking-wider">Admin Controls</p>
                <button 
                  onClick={() => handleOrderClick('SYSTEM_LOGS')}
                  className={`flex items-center w-full px-3 py-2 rounded transition-colors ${currentView === 'SYSTEM_LOGS' ? 'bg-gp-red/10 text-gp-red' : 'text-gp-text-muted hover:text-gp-text-main hover:bg-gp-border'}`}
                >
                  <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="font-bold text-sm">System Logs</span>
                </button>
                <button 
                  onClick={onOpenDataSync}
                  className="flex items-center w-full px-3 py-2 rounded transition-colors text-gp-text-muted hover:text-gp-text-main hover:bg-gp-border mt-1"
                >
                  <svg className="w-5 h-5 mr-3 flex-shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span className="font-bold text-sm">Data Sync (Cloud)</span>
                </button>
                <button 
                  onClick={onOpenCashUp}
                  className="flex items-center w-full px-3 py-2 rounded transition-colors text-gp-text-muted hover:text-gp-text-main hover:bg-gp-border mt-1"
                >
                  <svg className="w-5 h-5 mr-3 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span className="font-bold text-sm">Cash Up Shift</span>
                </button>
            </div>
          )}

        </nav>

        {/* Sidebar Footer with System Time */}
        <div className="p-4 border-t border-gp-border bg-gp-overlay whitespace-nowrap shrink-0">
          <div className="flex flex-col gap-3">
            
            {/* Digital Clock */}
            <div className="bg-gp-black border border-gp-border rounded p-2 text-center shadow-inner">
              <div className="text-2xl font-mono font-bold text-gp-text-main tracking-widest leading-none">
                {time.toLocaleTimeString('en-GB', { hour12: false })}
              </div>
              <div className="text-[10px] text-gp-red font-bold uppercase tracking-wider mt-1 border-t border-gp-border pt-1">
                {time.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
              </div>
            </div>

            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] text-gp-text-muted uppercase font-bold">System Status</span>
              <span className="text-[10px] text-green-500 font-bold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                ONLINE
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
