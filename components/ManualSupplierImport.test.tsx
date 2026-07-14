import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ManualSupplierImport } from './ManualSupplierImport';

describe('supplier file upload module', () => {
  it('renders for a portal-backed supplier in admin mode', () => {
    const html = renderToStaticMarkup(
      <ManualSupplierImport
        terminal="GP1"
        catalog="APEX"
        supplierLabel="APEX"
        visible
        onPublished={vi.fn()}
      />
    );
    expect(html).toContain('Upload Stock');
  });

  it('stays visible for every live supplier catalogue and requests admin access when needed', () => {
    const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    expect(appSource).toContain('{isLiveSupplierCatalog(activeSupplierCatalog) && (');
    expect(appSource).toContain('<ManualSupplierImport');
    expect(appSource).toContain('{supplierPortalUrl && (');
    expect(appSource).toContain('href={supplierPortalUrl}');
    expect(appSource).toContain('canOpen={isAdmin}');
    expect(appSource).toContain('onAdminRequired={() => setShowAuthModal(true)}');
  });

  it('supports dragging and dropping a supplier document into the upload area', () => {
    const componentSource = readFileSync(new URL('./ManualSupplierImport.tsx', import.meta.url), 'utf8');
    expect(componentSource).toContain('data-testid="supplier-file-dropzone"');
    expect(componentSource).toContain('onDrop={handleDrop}');
    expect(componentSource).toContain('Drag & drop your supplier file here');
  });
});
