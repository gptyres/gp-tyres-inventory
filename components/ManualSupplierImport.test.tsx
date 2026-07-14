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

  it('is mounted only for admins while the live portal remains available to sales', () => {
    const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    expect(appSource).toContain('{isAdmin && supplierHasLiveSync && (');
    expect(appSource).toContain('<ManualSupplierImport');
    expect(appSource).toContain('{supplierPortalUrl && (');
    expect(appSource).toContain('href={supplierPortalUrl}');
    expect(appSource).toContain('isAdmin ? Number(supplierCanSync) + Number(supplierHasLiveSync) : 0');
  });

  it('supports dragging and dropping a supplier document into the upload area', () => {
    const componentSource = readFileSync(new URL('./ManualSupplierImport.tsx', import.meta.url), 'utf8');
    expect(componentSource).toContain('data-testid="supplier-file-dropzone"');
    expect(componentSource).toContain('onDrop={handleDrop}');
    expect(componentSource).toContain('Drag & drop your supplier file here');
  });
});
