import React, { useEffect, useMemo, useRef, useState } from 'react';
import { InvoiceDocument } from '../types';
import {
  CRMCustomerInput,
  CRMState,
  CRM_UPDATED_EVENT,
  crmDocumentToInvoiceDocument,
  customerRowToCustomerInfo,
  fetchCRMState,
  importCRMCustomers,
  notifyCRMUpdated,
  upsertCRMCustomer
} from '../crmSync';
import { CRMCustomerRow, CRMDocumentRow } from '../supabaseClient';

interface CustomerHubViewProps {
  currentUser: string;
  onOpenDocument: (document: InvoiceDocument) => void;
  onEditDocument: (document: InvoiceDocument) => void;
  onCreateQuoteForCustomer: (customer: CRMCustomerRow) => void;
}

type CustomerTab = 'CUSTOMER' | 'LEAD';

const emptyCustomerForm: CRMCustomerInput = {
  displayName: '',
  companyName: '',
  contactName: '',
  email: '',
  phone: '',
  mobile: '',
  billingAddress: '',
  shippingAddress: '',
  vehicleDetails: '',
  notes: '',
  customerType: 'CUSTOMER',
  source: 'MANUAL'
};

const money = (amount: number) =>
  `R${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || 'C') + (parts[1]?.[0] || '');
};

const normalizeHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const parseCSV = (text: string): string[][] => {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(current.trim());
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(current.trim());
      if (row.some(cell => cell.length > 0)) rows.push(row);
      row = [];
      current = '';
      continue;
    }

    current += char;
  }

  row.push(current.trim());
  if (row.some(cell => cell.length > 0)) rows.push(row);
  return rows;
};

const rowsToCustomers = (rows: unknown[][]): CRMCustomerInput[] => {
  if (rows.length < 2) return [];

  const headers = rows[0].map(cell => normalizeHeader(String(cell || '')));
  const findValue = (row: unknown[], aliases: string[]) => {
    const wanted = aliases.map(normalizeHeader);
    const index = headers.findIndex(header => wanted.includes(header));
    return index >= 0 ? String(row[index] || '').trim() : '';
  };

  return rows.slice(1).map((row): CRMCustomerInput => {
    const displayName =
      findValue(row, ['display name', 'customer name', 'name', 'customer', 'full name']) ||
      findValue(row, ['company name', 'company']) ||
      findValue(row, ['email']);

    return {
      displayName,
      companyName: findValue(row, ['company name', 'company']),
      contactName: findValue(row, ['contact name', 'full name', 'name']),
      email: findValue(row, ['email', 'email address', 'e-mail']),
      phone: findValue(row, ['phone', 'telephone', 'contact number']),
      mobile: findValue(row, ['mobile', 'cell', 'cellphone']),
      billingAddress: findValue(row, ['billing address', 'address', 'bill to address']),
      shippingAddress: findValue(row, ['shipping address', 'ship to address']),
      vehicleDetails: findValue(row, ['vehicle', 'vehicle details', 'car']),
      notes: findValue(row, ['notes', 'memo']),
      customerType: normalizeHeader(findValue(row, ['type', 'customer type'])) === 'lead' ? 'LEAD' : 'CUSTOMER',
      externalRef: findValue(row, ['id', 'customer id', 'external ref', 'quickbooks id']),
      source: 'IMPORT'
    };
  }).filter(customer => customer.displayName.trim().length > 0);
};

export const CustomerHubView: React.FC<CustomerHubViewProps> = ({
  currentUser,
  onOpenDocument,
  onEditDocument,
  onCreateQuoteForCustomer
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [crmState, setCRMState] = useState<CRMState>({ customers: [], documents: [], items: [] });
  const [activeTab, setActiveTab] = useState<CustomerTab>('CUSTOMER');
  const [query, setQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState<CRMCustomerInput>(emptyCustomerForm);

  const loadCRM = async () => {
    setIsLoading(true);
    setError('');
    try {
      const state = await fetchCRMState();
      setCRMState(state);
      setSelectedCustomerId(current => current || state.customers[0]?.id || null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load Customer Hub.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCRM();
    const refresh = () => loadCRM();
    window.addEventListener(CRM_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(CRM_UPDATED_EVENT, refresh);
  }, []);

  const documentsByCustomer = useMemo(() => {
    return crmState.documents.reduce<Record<string, CRMDocumentRow[]>>((acc, document) => {
      const key = document.customer_id || 'unassigned';
      acc[key] = acc[key] || [];
      acc[key].push(document);
      return acc;
    }, {});
  }, [crmState.documents]);

  const itemsByDocument = useMemo(() => {
    return crmState.items.reduce<Record<string, typeof crmState.items>>((acc, item) => {
      acc[item.document_id] = acc[item.document_id] || [];
      acc[item.document_id].push(item);
      return acc;
    }, {});
  }, [crmState.items]);

  const customers = useMemo(() => {
    const cleaned = query.trim().toLowerCase();
    return crmState.customers
      .filter(customer => customer.customer_type === activeTab)
      .filter(customer => {
        if (!cleaned) return true;
        return [
          customer.display_name,
          customer.company_name,
          customer.contact_email,
          customer.contact_phone,
          customer.mobile,
          customer.billing_address
        ].filter(Boolean).join(' ').toLowerCase().includes(cleaned);
      });
  }, [activeTab, crmState.customers, query]);

  const selectedCustomer = useMemo(() => {
    return crmState.customers.find(customer => customer.id === selectedCustomerId) || customers[0] || null;
  }, [crmState.customers, customers, selectedCustomerId]);

  const selectedDocuments = selectedCustomer ? documentsByCustomer[selectedCustomer.id] || [] : [];

  const metrics = useMemo(() => {
    const quoteDocuments = crmState.documents.filter(document => document.document_type === 'QUOTE');
    const invoiceDocuments = crmState.documents.filter(document => document.document_type === 'INVOICE');
    const paidInvoices = invoiceDocuments.filter(document => document.status === 'PAID');
    const openInvoices = invoiceDocuments.filter(document => document.status !== 'PAID' && document.status !== 'VOID');

    return {
      quoteCount: quoteDocuments.length,
      quoteValue: quoteDocuments.reduce((total, document) => total + Number(document.grand_total), 0),
      openInvoiceCount: openInvoices.length,
      openInvoiceValue: openInvoices.reduce((total, document) => total + Number(document.grand_total), 0),
      paidCount: paidInvoices.length,
      paidValue: paidInvoices.reduce((total, document) => total + Number(document.grand_total), 0),
      totalCustomers: crmState.customers.filter(customer => customer.customer_type === 'CUSTOMER').length,
      totalLeads: crmState.customers.filter(customer => customer.customer_type === 'LEAD').length
    };
  }, [crmState.customers, crmState.documents]);

  const openDocument = (document: CRMDocumentRow, mode: 'view' | 'edit') => {
    const invoiceDocument = crmDocumentToInvoiceDocument(
      document,
      itemsByDocument[document.id] || [],
      crmState.customers.find(customer => customer.id === document.customer_id)
    );

    if (mode === 'edit') onEditDocument(invoiceDocument);
    else onOpenDocument(invoiceDocument);
  };

  const handleFileImport = async (file: File | undefined) => {
    if (!file) return;

    setIsImporting(true);
    setMessage('');
    setError('');

    try {
      let rows: unknown[][];
      const lowerName = file.name.toLowerCase();

      if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
        const { default: readXlsxFile } = await import('read-excel-file');
        rows = await readXlsxFile(file);
      } else {
        const text = await file.text();
        rows = parseCSV(text);
      }

      const customersToImport = rowsToCustomers(rows);
      const result = await importCRMCustomers(customersToImport, currentUser);

      setMessage(`Imported or updated ${result.imported} customers. ${result.skipped} skipped.`);
      if (result.errors.length) setError(result.errors.join(' | '));
      await loadCRM();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Customer import failed.');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleOpenNewCustomer = () => {
    setCustomerForm({ ...emptyCustomerForm, customerType: activeTab });
    setIsFormOpen(true);
  };

  const handleOpenEditCustomer = (customer: CRMCustomerRow) => {
    setCustomerForm({
      displayName: customer.display_name,
      companyName: customer.company_name || '',
      contactName: customer.contact_name || '',
      email: customer.contact_email || '',
      phone: customer.contact_phone || '',
      mobile: customer.mobile || '',
      billingAddress: customer.billing_address || '',
      shippingAddress: customer.shipping_address || '',
      vehicleDetails: customer.vehicle_details || '',
      notes: customer.notes || '',
      customerType: customer.customer_type,
      source: customer.source,
      externalRef: customer.external_ref || ''
    });
    setIsFormOpen(true);
  };

  const handleSaveCustomer = async () => {
    if (!customerForm.displayName.trim()) {
      setError('Customer name is required.');
      return;
    }

    try {
      const saved = await upsertCRMCustomer(customerForm);
      notifyCRMUpdated();
      setMessage(`${saved?.display_name || customerForm.displayName} saved.`);
      setIsFormOpen(false);
      await loadCRM();
      if (saved) setSelectedCustomerId(saved.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Customer save failed.');
    }
  };

  return (
    <div className="min-h-full bg-gp-black p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="rounded-xl border border-gp-border bg-gp-panel p-5 shadow-lg">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gp-red">Customer Hub</p>
              <h1 className="mt-2 font-display text-3xl font-black uppercase text-gp-text-main">Customers & Leads</h1>
              <p className="mt-2 max-w-3xl text-sm text-gp-text-muted">
                Customer records, quote and invoice history, import tools, and printable documents in one place.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(event) => handleFileImport(event.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="rounded-lg border border-gp-border bg-gp-input px-4 py-2 text-xs font-black uppercase tracking-wider text-gp-text-main transition-colors hover:border-gp-red disabled:opacity-50"
              >
                {isImporting ? 'Importing' : 'Upload CSV/Excel'}
              </button>
              <button
                type="button"
                onClick={handleOpenNewCustomer}
                className="rounded-lg bg-gp-red px-4 py-2 text-xs font-black uppercase tracking-wider text-white transition-colors hover:bg-red-700"
              >
                New Customer
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-gp-border bg-gp-panel p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gp-text-muted">Customers</p>
            <p className="mt-2 font-display text-2xl font-black text-gp-text-main">{metrics.totalCustomers}</p>
            <p className="text-xs text-gp-text-muted">{metrics.totalLeads} leads tracked</p>
          </div>
          <div className="rounded-lg border border-gp-border bg-gp-panel p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gp-text-muted">Quotes</p>
            <p className="mt-2 font-display text-2xl font-black text-blue-400">{money(metrics.quoteValue)}</p>
            <p className="text-xs text-gp-text-muted">{metrics.quoteCount} saved quotes</p>
          </div>
          <div className="rounded-lg border border-gp-border bg-gp-panel p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gp-text-muted">Open Invoices</p>
            <p className="mt-2 font-display text-2xl font-black text-orange-400">{money(metrics.openInvoiceValue)}</p>
            <p className="text-xs text-gp-text-muted">{metrics.openInvoiceCount} outstanding</p>
          </div>
          <div className="rounded-lg border border-gp-border bg-gp-panel p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gp-text-muted">Paid</p>
            <p className="mt-2 font-display text-2xl font-black text-green-400">{money(metrics.paidValue)}</p>
            <p className="text-xs text-gp-text-muted">{metrics.paidCount} paid invoices</p>
          </div>
        </div>

        {(message || error) && (
          <div className={`rounded-lg border px-4 py-3 text-sm font-bold ${error ? 'border-red-700 bg-red-950/30 text-red-300' : 'border-green-700 bg-green-950/30 text-green-300'}`}>
            {error || message}
          </div>
        )}

        <div className="grid min-h-[620px] gap-5 xl:grid-cols-[minmax(420px,0.92fr)_minmax(0,1.35fr)]">
          <section className="rounded-xl border border-gp-border bg-gp-panel shadow-lg">
            <div className="border-b border-gp-border p-4">
              <div className="flex items-center gap-2">
                {(['CUSTOMER', 'LEAD'] as CustomerTab[]).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`rounded-md px-4 py-2 text-xs font-black uppercase tracking-wider transition-colors ${
                      activeTab === tab ? 'bg-gp-red text-white' : 'bg-gp-input text-gp-text-muted hover:text-gp-text-main'
                    }`}
                  >
                    {tab === 'CUSTOMER' ? 'Customers' : 'Leads'}
                  </button>
                ))}
              </div>
              <div className="relative mt-4">
                <svg className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gp-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search customers..."
                  className="h-11 w-full rounded-lg border border-gp-border bg-gp-input pl-10 pr-3 text-sm text-gp-text-main placeholder:text-gp-text-muted focus:border-gp-red focus:outline-none"
                />
              </div>
            </div>

            <div className="max-h-[560px] overflow-y-auto">
              {isLoading ? (
                <div className="p-6 text-sm font-bold text-gp-text-muted">Loading Customer Hub...</div>
              ) : customers.length === 0 ? (
                <div className="p-6 text-sm text-gp-text-muted">No {activeTab === 'CUSTOMER' ? 'customers' : 'leads'} found.</div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-gp-dark text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Contact</th>
                      <th className="px-4 py-3 text-right">Open Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gp-border">
                    {customers.map(customer => {
                      const customerDocuments = documentsByCustomer[customer.id] || [];
                      const openBalance = customerDocuments
                        .filter(document => document.document_type === 'INVOICE' && document.status !== 'PAID')
                        .reduce((total, document) => total + Number(document.grand_total), 0);

                      return (
                        <tr
                          key={customer.id}
                          onClick={() => setSelectedCustomerId(customer.id)}
                          className={`cursor-pointer transition-colors hover:bg-gp-input ${selectedCustomer?.id === customer.id ? 'bg-gp-red/10' : ''}`}
                        >
                          <td className="px-4 py-3">
                            <p className="font-black text-gp-text-main">{customer.display_name}</p>
                            {customer.company_name && <p className="mt-1 text-xs text-gp-text-muted">{customer.company_name}</p>}
                          </td>
                          <td className="px-4 py-3 text-xs text-gp-text-muted">
                            <p>{customer.contact_phone || customer.mobile || '-'}</p>
                            <p>{customer.contact_email || ''}</p>
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-gp-text-main">{money(openBalance)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-gp-border bg-gp-panel shadow-lg">
            {selectedCustomer ? (
              <div className="flex h-full flex-col">
                <div className="border-b border-gp-border p-5">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex gap-4">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gp-input text-xl font-black text-gp-text-main">
                        {initials(selectedCustomer.display_name)}
                      </div>
                      <div>
                        <h2 className="font-display text-2xl font-black text-gp-text-main">{selectedCustomer.display_name}</h2>
                        {selectedCustomer.company_name && <p className="mt-1 text-sm text-gp-text-muted">{selectedCustomer.company_name}</p>}
                        <div className="mt-3 grid gap-2 text-sm text-gp-text-muted md:grid-cols-2">
                          <p>Email: <span className="text-gp-text-main">{selectedCustomer.contact_email || '-'}</span></p>
                          <p>Phone: <span className="text-gp-text-main">{selectedCustomer.contact_phone || selectedCustomer.mobile || '-'}</span></p>
                          <p className="md:col-span-2">Billing: <span className="text-gp-text-main">{selectedCustomer.billing_address || '-'}</span></p>
                          {selectedCustomer.vehicle_details && <p className="md:col-span-2">Vehicle: <span className="text-gp-text-main">{selectedCustomer.vehicle_details}</span></p>}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onCreateQuoteForCustomer(selectedCustomer)}
                        className="rounded-lg bg-gp-red px-4 py-2 text-xs font-black uppercase tracking-wider text-white transition-colors hover:bg-red-700"
                      >
                        New Transaction
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEditCustomer(selectedCustomer)}
                        className="rounded-lg border border-gp-border bg-gp-input px-4 py-2 text-xs font-black uppercase tracking-wider text-gp-text-main transition-colors hover:border-gp-red"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 border-b border-gp-border p-5 md:grid-cols-3">
                  <div className="rounded-lg border border-gp-border bg-gp-black p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">Open Balance</p>
                    <p className="mt-2 font-display text-2xl font-black text-orange-400">
                      {money(selectedDocuments.filter(document => document.document_type === 'INVOICE' && document.status !== 'PAID').reduce((total, document) => total + Number(document.grand_total), 0))}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gp-border bg-gp-black p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">Quotes</p>
                    <p className="mt-2 font-display text-2xl font-black text-blue-400">
                      {selectedDocuments.filter(document => document.document_type === 'QUOTE').length}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gp-border bg-gp-black p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">Transactions</p>
                    <p className="mt-2 font-display text-2xl font-black text-gp-text-main">{selectedDocuments.length}</p>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="font-display text-lg font-black uppercase text-gp-text-main">Transaction List</h3>
                    <button type="button" onClick={loadCRM} className="text-xs font-bold uppercase text-gp-text-muted hover:text-gp-red">Refresh</button>
                  </div>

                  {selectedDocuments.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-gp-border bg-gp-black p-8 text-center">
                      <p className="font-bold text-gp-text-main">No saved quotes or invoices yet.</p>
                      <p className="mt-1 text-sm text-gp-text-muted">Create one from Quick POS and it will appear here.</p>
                    </div>
                  ) : (
                    <table className="w-full text-left text-sm">
                      <thead className="text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">
                        <tr className="border-b border-gp-border">
                          <th className="py-3 pr-3">Date</th>
                          <th className="px-3 py-3">Type</th>
                          <th className="px-3 py-3">No.</th>
                          <th className="px-3 py-3 text-right">Amount</th>
                          <th className="px-3 py-3">Status</th>
                          <th className="py-3 pl-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gp-border">
                        {selectedDocuments.map(document => (
                          <tr key={document.id}>
                            <td className="py-3 pr-3 text-gp-text-muted">{new Date(document.issued_at).toLocaleDateString('en-ZA')}</td>
                            <td className="px-3 py-3 font-bold text-gp-text-main">{document.document_type}</td>
                            <td className="px-3 py-3 font-mono text-gp-text-main">{document.reference_id}</td>
                            <td className="px-3 py-3 text-right font-mono font-bold text-gp-text-main">{money(Number(document.grand_total))}</td>
                            <td className="px-3 py-3">
                              <span className="rounded bg-gp-input px-2 py-1 text-[10px] font-black uppercase text-gp-text-muted">{document.status}</span>
                            </td>
                            <td className="py-3 pl-3 text-right">
                              <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => openDocument(document, 'view')} className="text-xs font-bold text-blue-400 hover:text-blue-300">
                                  View/Print
                                </button>
                                <button type="button" onClick={() => openDocument(document, 'edit')} className="text-xs font-bold text-gp-red hover:text-red-400">
                                  Edit
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-[420px] items-center justify-center p-8 text-center text-gp-text-muted">
                Select or import a customer to view their profile and transactions.
              </div>
            )}
          </section>
        </div>
      </div>

      {isFormOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-xl border border-gp-border bg-gp-panel shadow-2xl">
            <div className="flex items-center justify-between border-b border-gp-border p-4">
              <div>
                <h2 className="font-display text-xl font-black uppercase text-gp-text-main">Customer Details</h2>
                <p className="text-xs text-gp-text-muted">Compatible with QuickBooks-style customer imports.</p>
              </div>
              <button onClick={() => setIsFormOpen(false)} className="rounded p-2 text-gp-text-muted hover:bg-gp-border hover:text-gp-text-main" aria-label="Close customer form">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid max-h-[70vh] gap-3 overflow-y-auto p-4 md:grid-cols-2">
              {[
                ['displayName', 'Display Name'],
                ['companyName', 'Company Name'],
                ['contactName', 'Contact Name'],
                ['email', 'Email'],
                ['phone', 'Phone'],
                ['mobile', 'Mobile'],
                ['billingAddress', 'Billing Address'],
                ['shippingAddress', 'Shipping Address'],
                ['vehicleDetails', 'Vehicle Details'],
                ['notes', 'Notes']
              ].map(([field, label]) => (
                <label key={field} className={field === 'billingAddress' || field === 'shippingAddress' || field === 'notes' ? 'md:col-span-2' : ''}>
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">{label}</span>
                  <input
                    value={String(customerForm[field as keyof CRMCustomerInput] || '')}
                    onChange={(event) => setCustomerForm(prev => ({ ...prev, [field]: event.target.value }))}
                    className="h-10 w-full rounded border border-gp-border bg-gp-input px-3 text-sm text-gp-text-main outline-none focus:border-gp-red"
                  />
                </label>
              ))}
              <label>
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">Type</span>
                <select
                  value={customerForm.customerType}
                  onChange={(event) => setCustomerForm(prev => ({ ...prev, customerType: event.target.value as CustomerTab }))}
                  className="h-10 w-full rounded border border-gp-border bg-gp-input px-3 text-sm text-gp-text-main outline-none focus:border-gp-red"
                >
                  <option value="CUSTOMER">Customer</option>
                  <option value="LEAD">Lead</option>
                </select>
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-gp-border p-4">
              <button onClick={() => setIsFormOpen(false)} className="rounded border border-gp-border bg-gp-input px-4 py-2 text-xs font-black uppercase tracking-wider text-gp-text-main hover:bg-gp-border">
                Cancel
              </button>
              <button onClick={handleSaveCustomer} className="rounded bg-gp-red px-4 py-2 text-xs font-black uppercase tracking-wider text-white hover:bg-red-700">
                Save Customer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
