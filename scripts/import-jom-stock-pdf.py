"""Merge a JOM units-only report into existing prices, matching exact stock codes."""
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from pypdf import PdfReader

source = Path(sys.argv[1])
target = Path(sys.argv[2])
previous = json.loads(target.read_text(encoding='utf-8'))
old = {row['supplierSku']: row for row in previous['rows']}
if len(old) != len(previous['rows']):
    raise ValueError('Duplicate existing stock codes')

document = PdfReader(source)
text = '\n'.join(page.extract_text() or '' for page in document.pages)
timestamp = re.search(r'(20\d{2}/\d{2}/\d{2} \d{2}:\d{2}:\d{2})', text)
total = re.search(r'Grand Totals:\s*([\d,]+)', text)
if not timestamp or not total or 'Stock Code Stock Description Level' not in text:
    raise ValueError('Could not verify JOM report headings, date and total')
rows = []
for page_number, page in enumerate(document.pages, 1):
    for line in (page.extract_text() or '').splitlines():
        match = re.fullmatch(r'((?:GF +)?[A-Z0-9]+) +(.+?) +(\d+)', line)
        if not match:
            continue
        sku, description, quantity = match.groups()
        if not re.fullmatch(r'(?:\d{5,6}|FK\d{5}(?:BZP)?|GF \d{6}|SM[A-Z]{2}\d{4})', sku):
            continue
        existing = old.get(sku)
        if existing and re.sub(r'\s+', ' ', existing['description'].strip()).upper() != re.sub(r'\s+', ' ', description.strip()).upper():
            raise ValueError(f'Description changed for stock code {sku}; review before importing')
        rows.append({'supplierSku': sku, 'description': existing['description'] if existing else description,
                     'stockUnits': int(quantity), 'priceIncludingVat': existing['priceIncludingVat'] if existing else None,
                     'warehouse': 'Main Warehouse', 'sourcePage': page_number})

if len({row['supplierSku'] for row in rows}) != len(rows):
    raise ValueError('Duplicate stock codes in the report')
printed_total = int(total.group(1).replace(',', ''))
if not rows or sum(row['stockUnits'] for row in rows) != printed_total:
    raise ValueError('Extracted units do not match the report total')
new_codes = {r['supplierSku'] for r in rows}
missing = [dict(row, stockUnits=None) for sku, row in old.items() if sku not in new_codes]
data = {'sourceFile': source.name, 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'sourceReportedAt': datetime.strptime(timestamp.group(1), '%Y/%m/%d %H:%M:%S').isoformat() + '+02:00',
        'importedAt': datetime.now(timezone.utc).isoformat(), 'warehouse': 'Main Warehouse',
        'priceTaxBasis': previous['priceTaxBasis'],
        'priceSourceFile': previous.get('priceSourceFile', previous['sourceFile']),
        'priceSourceSha256': previous.get('priceSourceSha256', previous['sourceSha256']),
        'priceSourceReportedAt': previous.get('priceSourceReportedAt', previous['sourceReportedAt']),
        'totalStockUnits': printed_total, 'rows': rows + missing}
target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'reportedRows': len(rows), 'totalStockUnits': printed_total,
                  'newWithoutPrice': [r['supplierSku'] for r in rows if r['priceIncludingVat'] is None],
                  'notInReport': [r['supplierSku'] for r in missing]}))
