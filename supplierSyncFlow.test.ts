import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('supplier portal synchronization contract', () => {
  it('sends only the selected catalogue and binds the terminal on the server', () => {
    const client = read('./supplierSync.ts');
    const api = read('./api/supplier-sync.ts');

    expect(client).toContain('JSON.stringify({ catalog })');
    expect(client).not.toContain('JSON.stringify({ terminal, catalog })');
    expect(api).toContain('REGISTRY_SUPPLIER_BY_CATALOG[requestedCatalog]');
    expect(api).toContain('staffSession.terminalId');
  });

  it('queues an all-enabled job for the combined supplier catalogue', () => {
    const api = read('./api/supplier-sync.ts');

    expect(api).toContain("if (catalog === 'ALL_SUPPLIERS')");
    expect(api).toContain("scope: isAllSuppliers ? 'ALL_ENABLED' : 'SINGLE_SUPPLIER'");
    expect(api).toContain('target_catalog: isAllSuppliers ? null : requestedCatalog');
  });

  it('prevents overlapping jobs at the database boundary', () => {
    const migration = read('./supabase/migrations/20260713074309_supplier_portal_sync.sql');

    expect(migration).toContain('supplier_sync_jobs_one_active_idx');
    expect(migration).toContain("where status in ('queued', 'running')");
    expect(migration).toContain('for update skip locked');
  });

  it('keeps the previous snapshot active until a complete staging snapshot is ready', () => {
    const migration = read('./supabase/migrations/20260713074309_supplier_portal_sync.sql');

    expect(migration).toContain("snapshot.status = 'staging'");
    expect(migration).toContain('snapshot.row_count > 0');
    expect(migration.indexOf("set status = 'active'")).toBeLessThan(
      migration.indexOf("set status = 'retired'")
    );
  });

  it('does not return raw worker failures or trust a browser terminal value', () => {
    const api = read('./api/supplier-sync.ts');

    expect(api).toContain('safeFailureMessage');
    expect(api).toContain('Existing catalogue kept.');
    expect(api).not.toContain('body.terminal.trim()');
    expect(api).not.toContain('json({ error: message })');
  });
});
