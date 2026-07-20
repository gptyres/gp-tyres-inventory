import { describe, expect, it } from 'vitest';
import {
  applyReviewedSource,
  buildImportCandidates,
  parseSupplierTyreRows,
  selectBatch,
  summarizeBatch
} from './tyre-image-import-workflow.mjs';

describe('tyre image import workflow', () => {
  it('groups repeated supplier tyre SKUs by brand and pattern', () => {
    const rows = parseSupplierTyreRows('TYREWAREHOUSE', 'warehouse', [
      'SKU,Size,Brand,Pattern,Category,Stock Location,Stock Units Availability,Stock Units,Selling Price',
      'sku-1,265/60R18,Dunlop,Grandtrek AT3G,SUV,JHB,Available,4 units,R2999',
      'sku-1,265/60R18,Dunlop,Grandtrek AT3G,SUV,CPT,Available,2 units,R2999',
      'sku-2,265/65R17,Dunlop,Grandtrek AT3G,SUV,JHB,Available,3 units,R2999',
      'sku-3,265/65R17,Sailun,Terramax RT,SUV,JHB,Available,7 units,R1999'
    ].join('\n'));

    const candidates = buildImportCandidates(rows);
    const dunlop = candidates.find((candidate) => candidate.id === 'DUNLOP::GRANDTREK AT3G');

    expect(dunlop).toMatchObject({
      brandKey: 'DUNLOP',
      patternKey: 'GRANDTREK AT3G',
      affectedSuppliers: ['TYREWAREHOUSE'],
      totalAvailableStock: 9
    });
    expect(dunlop.affectedSkus).toEqual(['sku-1', 'sku-2']);
    expect(candidates).toHaveLength(2);
  });

  it('reads refreshed supplier catalogues by header instead of stale column positions', () => {
    const rows = parseSupplierTyreRows('APEX', 'apex', [
      'Supplier SKU,TYRE_SIZE,TYRE_BRAND,TYRE_PATTERN,TYRE_RATING,TYRE_INDEX,TYRE_SPECS,Category,Product Name,Cost Price,Selling Price,Cape Town Stock Units,Total Stock Units',
      '307672,35X12.50R15,BF GOODRICH,MUD TERRAIN T/A KM3 GO,LRC,,LT,Tyres,LT 35X12 MUD TERRAIN T/A KM3 LRC GO,R5991,R6900,1 units,1 unit'
    ].join('\n'));

    expect(rows).toEqual([expect.objectContaining({
      supplier: 'APEX',
      supplierStockCode: '307672',
      brand: 'BF GOODRICH',
      pattern: 'MUD TERRAIN T/A KM3 GO',
      quantity: 1,
      finishKey: 'BF GOODRICH',
      designKey: 'MUD TERRAIN T A KM3 GO'
    })]);
  });

  it('supports Exotic and Bridgestone structured image-import rows', () => {
    const exotic = parseSupplierTyreRows('EXOTIC', 'structured', [
      'Supplier SKU,TYRE_SIZE,TYRE_BRAND,TYRE_PATTERN,Category,Total Stock Units',
      'D1107017D61554H,110/70-17,Diamond,110/70-17 Diamond D-615 Motorcycle Tyre 54H TL,Motorcycle Tyres,5 units'
    ].join('\n'));
    const bridgestone = parseSupplierTyreRows('BRIDGESTONE', 'structured', [
      'Brand,Requested Pattern,Portal Pattern,Description,Size,SKU,Stock Type,Stock Location,Stock Units',
      'BRIDGESTONE,ALENZA 001,ALENZA 001,215/60R17 ALENZA 001 96H,215/60R17,021640,rep,National,4'
    ].join('\n'));

    expect(exotic[0]).toMatchObject({
      brand: 'Diamond',
      pattern: '110/70-17 Diamond D-615 Motorcycle Tyre 54H TL',
      quantity: 5,
      finishKey: 'DIAMOND',
      designKey: 'D 615 MOTORCYCLE'
    });
    expect(bridgestone[0]).toMatchObject({
      brand: 'BRIDGESTONE',
      pattern: 'ALENZA 001',
      quantity: 4,
      finishKey: 'BRIDGESTONE',
      designKey: 'ALENZA 001'
    });
  });

  it('uses affected SKU count and stock totals to prioritize batches', () => {
    const rows = [
      { supplier: 'A', supplierStockCode: '1', brand: 'Brand A', pattern: 'Pattern A', quantity: 1, finishKey: 'BRAND A', designKey: 'PATTERN A' },
      { supplier: 'A', supplierStockCode: '2', brand: 'Brand B', pattern: 'Pattern B', quantity: 10, finishKey: 'BRAND B', designKey: 'PATTERN B' },
      { supplier: 'B', supplierStockCode: '3', brand: 'Brand B', pattern: 'Pattern B', quantity: 10, finishKey: 'BRAND B', designKey: 'PATTERN B' },
      { supplier: 'C', supplierStockCode: '4', brand: 'Brand C', pattern: 'Pattern C', quantity: 100, finishKey: 'BRAND C', designKey: 'PATTERN C' }
    ];

    const batch = selectBatch(buildImportCandidates(rows), { candidates: [] }, { batchSize: 2 });

    expect(batch.map((candidate) => candidate.id)).toEqual([
      'BRAND B::PATTERN B',
      'BRAND C::PATTERN C'
    ]);
  });

  it('resumes pending and failed candidates without reprocessing uploaded rows', () => {
    const candidates = [
      { id: 'A::ONE', affectedSuppliers: ['ONE'], brandKey: 'A', status: 'pending' },
      { id: 'B::TWO', affectedSuppliers: ['TWO'], brandKey: 'B', status: 'pending' },
      { id: 'C::THREE', affectedSuppliers: ['THREE'], brandKey: 'C', status: 'pending' }
    ];
    const manifest = {
      candidates: [
        { id: 'A::ONE', status: 'uploaded' },
        { id: 'B::TWO', status: 'failed' }
      ]
    };

    expect(selectBatch(candidates, manifest, { batchSize: 10 }).map((candidate) => candidate.id)).toEqual([
      'B::TWO',
      'C::THREE'
    ]);

    expect(selectBatch(candidates, manifest, { batchSize: 10, force: true }).map((candidate) => candidate.id)).toEqual([
      'A::ONE',
      'B::TWO',
      'C::THREE'
    ]);
  });

  it('accepts only reviewed exact sources with matching brand and pattern', () => {
    const candidate = {
      id: 'DUNLOP::GRANDTREK AT3G',
      brand: 'Dunlop',
      pattern: 'Grandtrek AT3G',
      brandKey: 'DUNLOP',
      patternKey: 'GRANDTREK AT3G',
      checkedSourceUrls: []
    };

    expect(applyReviewedSource(candidate, {
      brand: 'Dunlop',
      pattern: 'Grandtrek AT3G',
      confidence: 'exact',
      imageUrl: 'https://example.test/at3g.png',
      sourcePageUrl: 'https://example.test/product'
    })).toMatchObject({
      status: 'exact',
      confidence: 'exact',
      matchedImageUrl: 'https://example.test/at3g.png'
    });

    expect(applyReviewedSource(candidate, {
      brand: 'Dunlop',
      pattern: 'Grandtrek AT5',
      confidence: 'exact',
      imageUrl: 'https://example.test/at5.png'
    })).toMatchObject({
      status: 'ambiguous',
      confidence: 'exact'
    });
  });

  it('summarizes dry-run statuses without upload counts', () => {
    expect(summarizeBatch([
      { status: 'exact' },
      { status: 'ambiguous' },
      { status: 'missing' },
      { status: 'failed' },
      { status: 'skipped_existing' }
    ])).toEqual({
      candidateCount: 5,
      pendingCount: 0,
      exactCount: 1,
      ambiguousCount: 1,
      missingCount: 1,
      failedCount: 1,
      skippedCount: 1,
      uploadedCount: 0
    });
  });
});
