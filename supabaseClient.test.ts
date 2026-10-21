import { createClient } from '@supabase/supabase-js';
import { expect, expectTypeOf, it, vi } from 'vitest';
import type { Database, CRMCustomerInsert, CRMCustomerRow, CRMDocumentInsert } from './supabaseClient';

it('keeps CRM queries typed and serializes the approved customer fields', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({
    id: 'customer-1', display_name: 'Test customer', customer_type: 'CUSTOMER',
    status: 'ACTIVE', source: 'portal',
  }), { headers: { 'Content-Type': 'application/json' } }));
  const client = createClient<Database>('https://example.supabase.co', 'test-only-key', {
    global: { fetch },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const customer: CRMCustomerInsert = {
    display_name: 'Test customer', customer_type: 'CUSTOMER', status: 'ACTIVE', source: 'portal',
  };
  const { data, error } = await client.from('crm_customers').insert(customer).select().single();
  expectTypeOf(data).toEqualTypeOf<CRMCustomerRow | null>();
  expectTypeOf<CRMCustomerInsert>().toExtend<Record<string, unknown>>();
  expectTypeOf<CRMDocumentInsert>().toExtend<Record<string, unknown>>();
  expect(error).toBeNull();
  expect(data?.id).toBe('customer-1');
  expect(fetch).toHaveBeenCalledOnce();
  const [, options] = fetch.mock.calls[0];
  expect(JSON.parse(String(options?.body))).toEqual(customer);
});
