import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SupplierSyncButton } from './SupplierSyncButton';

describe('SupplierSyncButton', () => {
  it('keeps the admin sync action enabled while worker status is loading', () => {
    const html = renderToStaticMarkup(
      <SupplierSyncButton
        terminal="GP1"
        catalog="APEX"
        supplierLabel="APEX"
        visible
        canTrigger
        onCompleted={vi.fn()}
      />
    );
    expect(html).toContain('Sync APEX');
    expect(html).toContain('Checking sync worker status');
    expect(html).not.toContain(' disabled=');
    expect(html).toContain('aria-busy');
  });

  it('uses the supplier currently open in the portal', () => {
    const html = renderToStaticMarkup(
      <SupplierSyncButton
        terminal="GP1"
        catalog="EXOTIC"
        supplierLabel="EXOTIC"
        visible
        canTrigger
        onCompleted={vi.fn()}
      />
    );
    expect(html).toContain('Sync EXOTIC');
    expect(html).not.toContain('Sync Supplier Portals');
    expect(html).not.toContain('Sync Queued');
  });

  it('keeps active progress supplier-scoped and blocks offline queue creation', () => {
    const apiSource = readFileSync(new URL('../api/supplier-sync.ts', import.meta.url), 'utf8');
    expect(apiSource).toContain('globalActiveJob?.target_catalog === requestedCatalog');
    expect(apiSource).toContain('blockingJob');
    expect(apiSource).toContain('if (!currentStatus.worker.online)');
    expect(apiSource).toContain('response.status(503)');
  });

  it('shows sync timing in sales mode without exposing the trigger button', () => {
    const html = renderToStaticMarkup(
      <SupplierSyncButton
        terminal="GP1"
        catalog="APEX"
        supplierLabel="APEX"
        visible
        canTrigger={false}
        onCompleted={vi.fn()}
      />
    );
    expect(html).toContain('Last successful sync:');
    expect(html).toContain('Never synced');
    expect(html).not.toContain('<button');
  });

  it('is placed before the existing Live Supplier Portal action', () => {
    const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    const syncButtonPosition = appSource.indexOf('<SupplierSyncButton');
    const livePortalPosition = appSource.indexOf('Live Supplier Portal');
    expect(syncButtonPosition).toBeGreaterThan(-1);
    expect(livePortalPosition).toBeGreaterThan(syncButtonPosition);
    expect(appSource).toContain('catalog={activeSupplierCatalog}');
  });
});
