import { CartItem, CartLineType, CustomerInfo, InvoiceDocument, ProductType } from './types';
import {
  CRMCustomerEventInsert,
  CRMCustomerInsert,
  CRMCustomerRow,
  CRMDocumentInsert,
  CRMDocumentItemInsert,
  CRMDocumentItemRow,
  CRMDocumentRow,
  supabase
} from './supabaseClient';

export interface CRMCustomerInput {
  displayName: string;
  companyName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  billingAddress?: string;
  shippingAddress?: string;
  vehicleDetails?: string;
  notes?: string;
  customerType?: 'CUSTOMER' | 'LEAD';
  source?: string;
  externalRef?: string;
}

export interface CRMState {
  customers: CRMCustomerRow[];
  documents: CRMDocumentRow[];
  items: CRMDocumentItemRow[];
}

export interface CRMImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export const CRM_UPDATED_EVENT = 'gp-crm-updated';

export const notifyCRMUpdated = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CRM_UPDATED_EVENT));
};

const normalizeText = (value?: string | null) => (value || '').trim();

const cleanOptional = (value?: string | null) => {
  const cleaned = normalizeText(value);
  return cleaned || null;
};

const extractEmail = (contactDetail: string) => {
  const match = contactDetail.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
};

const extractPhone = (contactDetail: string) => {
  const withoutEmail = contactDetail.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '');
  const match = withoutEmail.match(/[+0-9][0-9\s().-]{5,}/);
  return match ? match[0].replace(/\s+/g, ' ').trim() : null;
};

const getCustomerDisplayName = (customer: CustomerInfo) => {
  return normalizeText(customer.fullName) || normalizeText(customer.contactDetail) || 'Walk-in Customer';
};

const getLineUnit = (item: CartItem) => Math.max(0, item.sellingPrice - item.appliedDiscount);

const getDocumentTaxAmount = (document: InvoiceDocument) => {
  return Number((document.grandTotal - document.grandTotal / 1.15).toFixed(2));
};

const getSafeLineDescription = (item: CartItem) => {
  if (!item.description) return '';
  if (item.cartLineType === 'INVENTORY' && item.productType === ProductType.TYRE) {
    return item.description
      .split('|')
      .map(part => part.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(' | ');
  }
  return item.description;
};

export const buildCustomerInputFromInfo = (customer: CustomerInfo, source = 'POS'): CRMCustomerInput => {
  const contactDetail = normalizeText(customer.contactDetail);
  const email = extractEmail(contactDetail);
  const phone = extractPhone(contactDetail) || (!email ? contactDetail : null);

  return {
    displayName: getCustomerDisplayName(customer),
    contactName: normalizeText(customer.fullName),
    email: email || undefined,
    phone: phone || undefined,
    vehicleDetails: normalizeText(customer.vehicleDetails),
    customerType: 'CUSTOMER',
    source
  };
};

const toCustomerInsert = (input: CRMCustomerInput): CRMCustomerInsert | null => {
  const displayName = normalizeText(input.displayName || input.companyName || input.contactName);
  if (!displayName) return null;

  return {
    display_name: displayName,
    company_name: cleanOptional(input.companyName),
    contact_name: cleanOptional(input.contactName),
    contact_email: cleanOptional(input.email)?.toLowerCase() || null,
    contact_phone: cleanOptional(input.phone),
    mobile: cleanOptional(input.mobile),
    billing_address: cleanOptional(input.billingAddress),
    shipping_address: cleanOptional(input.shippingAddress),
    vehicle_details: cleanOptional(input.vehicleDetails),
    notes: cleanOptional(input.notes),
    customer_type: input.customerType || 'CUSTOMER',
    status: 'ACTIVE',
    source: input.source || 'MANUAL',
    external_ref: cleanOptional(input.externalRef)
  };
};

export const upsertCRMCustomer = async (input: CRMCustomerInput): Promise<CRMCustomerRow | null> => {
  const payload = toCustomerInsert(input);
  if (!payload) return null;

  const { data, error } = await supabase
    .from('crm_customers')
    .upsert(payload, { onConflict: 'display_name_key' })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const importCRMCustomers = async (
  customers: CRMCustomerInput[],
  createdBy = 'IMPORT'
): Promise<CRMImportResult> => {
  const payloads = customers
    .map(customer => toCustomerInsert({ ...customer, source: customer.source || 'IMPORT' }))
    .filter((customer): customer is CRMCustomerInsert => Boolean(customer));

  const skipped = customers.length - payloads.length;
  if (!payloads.length) {
    return { imported: 0, skipped, errors: [] };
  }

  const errors: string[] = [];
  let imported = 0;
  const chunkSize = 200;

  for (let index = 0; index < payloads.length; index += chunkSize) {
    const chunk = payloads.slice(index, index + chunkSize);
    const { data, error } = await supabase
      .from('crm_customers')
      .upsert(chunk, { onConflict: 'display_name_key' })
      .select('id');

    if (error) {
      errors.push(error.message);
    } else {
      imported += data?.length || chunk.length;
    }
  }

  if (imported > 0) {
    const event: CRMCustomerEventInsert = {
      event_type: 'IMPORT',
      notes: `Imported or updated ${imported} customer records.`,
      created_by: createdBy
    };
    await supabase.from('crm_customer_events').insert(event);
    notifyCRMUpdated();
  }

  return { imported, skipped, errors };
};

export const fetchCRMState = async (): Promise<CRMState> => {
  const [customersResponse, documentsResponse, itemsResponse] = await Promise.all([
    supabase.from('crm_customers').select('*').order('updated_at', { ascending: false }),
    supabase.from('crm_documents').select('*').order('issued_at', { ascending: false }),
    supabase.from('crm_document_items').select('*').order('line_index', { ascending: true })
  ]);

  if (customersResponse.error) throw customersResponse.error;
  if (documentsResponse.error) throw documentsResponse.error;
  if (itemsResponse.error) throw itemsResponse.error;

  return {
    customers: customersResponse.data || [],
    documents: documentsResponse.data || [],
    items: itemsResponse.data || []
  };
};

export const saveCRMDocumentFromPOS = async (document: InvoiceDocument): Promise<CRMDocumentRow> => {
  const customer = await upsertCRMCustomer(buildCustomerInputFromInfo(document.customer, 'POS'));
  const createdAt = new Date(document.createdAt);
  const dueAt = new Date(createdAt);
  dueAt.setDate(dueAt.getDate() + (document.documentType === 'QUOTE' ? 7 : 0));

  const documentPayload: CRMDocumentInsert = {
    reference_id: document.referenceId,
    document_type: document.documentType,
    status: document.documentType === 'INVOICE' ? 'PAID' : 'ISSUED',
    customer_id: customer?.id || null,
    customer_snapshot: {
      fullName: document.customer.fullName,
      contactDetail: document.customer.contactDetail,
      vehicleDetails: document.customer.vehicleDetails
    },
    terminal_id: document.terminalId,
    staff_name: document.staffName || null,
    vehicle_details: cleanOptional(document.customer.vehicleDetails),
    subtotal: document.subtotal,
    total_discount: document.totalDiscount,
    tax_amount: getDocumentTaxAmount(document),
    grand_total: document.grandTotal,
    source: 'POS',
    issued_at: document.createdAt,
    due_at: dueAt.toISOString()
  };

  const { data: savedDocument, error: documentError } = await supabase
    .from('crm_documents')
    .upsert(documentPayload, { onConflict: 'reference_id' })
    .select()
    .single();

  if (documentError) throw documentError;

  const { error: deleteError } = await supabase
    .from('crm_document_items')
    .delete()
    .eq('document_id', savedDocument.id);

  if (deleteError) throw deleteError;

  const itemPayloads: CRMDocumentItemInsert[] = document.items.map((item, index) => ({
    document_id: savedDocument.id,
    line_index: index,
    cart_line_type: item.cartLineType,
    inventory_item_id: item.inventoryItemId || null,
    product_type: item.productType || null,
    activity_code: item.activityCode,
    title: item.title,
    description: cleanOptional(getSafeLineDescription(item)),
    quantity: item.cartQuantity,
    unit_price: getLineUnit(item),
    discount_each: item.appliedDiscount,
    line_total: getLineUnit(item) * item.cartQuantity
  }));

  if (itemPayloads.length) {
    const { error: itemError } = await supabase.from('crm_document_items').insert(itemPayloads);
    if (itemError) throw itemError;
  }

  const event: CRMCustomerEventInsert = {
    customer_id: customer?.id || null,
    document_id: savedDocument.id,
    event_type: 'DOCUMENT_CREATED',
    notes: `${document.documentType} ${document.referenceId} saved from Quick POS.`,
    amount: document.grandTotal,
    created_by: document.staffName || document.terminalId
  };
  await supabase.from('crm_customer_events').insert(event);
  notifyCRMUpdated();

  return savedDocument;
};

export const crmDocumentToInvoiceDocument = (
  document: CRMDocumentRow,
  items: CRMDocumentItemRow[],
  customer?: CRMCustomerRow
): InvoiceDocument => {
  const snapshot = document.customer_snapshot || {};
  const fullName = String(snapshot.fullName || customer?.display_name || 'Customer');
  const contactDetail = String(
    snapshot.contactDetail ||
    [customer?.contact_phone, customer?.contact_email].filter(Boolean).join(' / ')
  );
  const vehicleDetails = String(snapshot.vehicleDetails || customer?.vehicle_details || document.vehicle_details || '');

  return {
    id: document.id,
    referenceId: document.reference_id,
    documentType: document.document_type,
    terminalId: document.terminal_id,
    staffName: document.staff_name || undefined,
    customer: {
      fullName,
      contactDetail,
      vehicleDetails
    },
    createdAt: document.issued_at,
    items: items.map((item): CartItem => ({
      id: item.id,
      cartLineType: item.cart_line_type as CartLineType,
      inventoryItemId: item.inventory_item_id || undefined,
      productType: item.product_type as ProductType | undefined,
      activityCode: item.activity_code || item.cart_line_type,
      title: item.title,
      description: item.description || '',
      quantity: Number(item.quantity),
      sellingPrice: Number(item.unit_price) + Number(item.discount_each),
      costPrice: 0,
      lastUpdated: document.issued_at.split('T')[0],
      cartQuantity: Number(item.quantity),
      appliedDiscount: Number(item.discount_each)
    })),
    subtotal: Number(document.subtotal),
    totalDiscount: Number(document.total_discount),
    grandTotal: Number(document.grand_total)
  };
};

export const crmDocumentToCart = (items: CRMDocumentItemRow[], issuedAt: string): CartItem[] => {
  return items.map((item): CartItem => ({
    id: `crm-${item.id}`,
    cartLineType: item.cart_line_type as CartLineType,
    inventoryItemId: item.inventory_item_id || undefined,
    productType: item.product_type as ProductType | undefined,
    activityCode: item.activity_code || item.cart_line_type,
    title: item.title,
    description: item.description || '',
    quantity: 999,
    sellingPrice: Number(item.unit_price) + Number(item.discount_each),
    costPrice: 0,
    lastUpdated: issuedAt.split('T')[0],
    cartQuantity: Math.max(1, Number(item.quantity)),
    appliedDiscount: Number(item.discount_each)
  }));
};

export const customerRowToCustomerInfo = (customer: CRMCustomerRow): CustomerInfo => ({
  fullName: customer.contact_name || customer.display_name,
  contactDetail: [customer.contact_phone, customer.contact_email].filter(Boolean).join(' / '),
  vehicleDetails: customer.vehicle_details || ''
});
