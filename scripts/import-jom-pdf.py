"""Extract JOM's two-page stock report using aligned numeric columns, not whitespace.

Usage: bundled-python scripts/import-jom-pdf.py <supplier.pdf>
The PDF remains the authority; no embedded instructions are executed.
"""
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import pdfplumber

source = Path(sys.argv[1])
root = Path(__file__).resolve().parents[1]
rows = []
with pdfplumber.open(source) as document:
    assert len(document.pages) == 2, "Recheck layout before importing a different report"
    for page_number, page in enumerate(document.pages, 1):
        lines = {}
        for char in page.chars:
            lines.setdefault(round(char['top'], 1), []).append(char)
        for chars in lines.values():
            # Stock codes occupy a separate column, including codes with spaces.
            code = ''.join(c['text'] for c in chars if 245 <= c['x0'] < 305).strip()
            if not re.fullmatch(r'(?:\d{5,6}|FK\d{5}(?:BZP)?|GF \d{6}|SM[A-Z]{2}\d{4})', code):
                continue
            price_chars = [c for c in chars if c['x0'] >= 550]
            price_text = ''.join(c['text'] for c in price_chars).strip()
            assert re.fullmatch(r'[\d,]+\.\d{2}', price_text), (code, price_text)
            # The final quantity digit is right-aligned at x=517.35. Some long
            # descriptions overflow towards it, so a broad crop is unsafe.
            candidates = [i for i,c in enumerate(chars) if abs(c['x1'] - 517.35) < .5 and c['text'].isdigit()]
            assert candidates, (code, 'Quantity column missing')
            end = candidates[-1]
            start = end
            while start > 0 and chars[start-1]['text'].isdigit() and abs(chars[start-1]['x1'] - chars[start]['x0']) < .1:
                start -= 1
            quantity = int(''.join(c['text'] for c in chars[start:end+1]))
            description = ''.join(c['text'] for c in chars[:start] if c['x0'] >= 307).strip()
            assert description, code
            rows.append({
                'supplierSku': code, 'description': description,
                'stockUnits': quantity, 'priceIncludingVat': float(price_text.replace(',', '')),
                'warehouse': 'Main Warehouse', 'sourcePage': page_number,
            })

assert len({r['supplierSku'] for r in rows}) == len(rows), 'Duplicate stock codes'
assert sum(r['stockUnits'] for r in rows) == 2581, 'Does not reconcile with printed grand total'
assert all(r['priceIncludingVat'] > 0 for r in rows)
data = {
    'sourceFile': source.name, 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'sourceReportedAt': '2026-09-18T08:27:56+02:00',
    'importedAt': datetime.now(timezone.utc).isoformat(),
    'warehouse': 'Main Warehouse', 'priceTaxBasis': 'INCLUDES_VAT',
    'totalStockUnits': 2581, 'rows': rows,
}
target = root / 'supplier_data/jomData.json'
target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'rows':len(rows), 'stockUnits':2581, 'target':str(target)}))
