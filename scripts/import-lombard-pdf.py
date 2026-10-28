"""Extract the supplied Lombard price list; conflicting fields are held for review."""
import json
import re
import sys
from decimal import Decimal, ROUND_HALF_UP
from hashlib import sha256
from pathlib import Path

import pdfplumber

source, destination = map(Path, sys.argv[1:3])
rows, rejected = [], []
category = None
categories = {'PASSENGER AND ULTRA HIGH PERFORMANCE': 'PCR', 'COMMERCIAL TYRES': 'COMMERCIAL',
              'RECREATIONAL & SUV TYRES': 'SUV / 4X4', 'MUD TERRAIN TYRES': 'MUD TERRAIN',
              'LIGHT TRUCK TYRES': 'LIGHT TRUCK'}
with pdfplumber.open(source) as pdf:
    for page_number, page in enumerate(pdf.pages, 1):
        for cells in page.extract_tables()[0]:
            if cells and str(cells[0] or '').strip() in categories:
                category = categories[cells[0].strip()]
                continue
            if len(cells) != 6 or not re.fullmatch(r'(?:RID|KUM)[A-Z0-9]+', str(cells[0] or '').strip()):
                continue
            if category is None:
                raise ValueError('A tyre row appeared before its category heading')
            sku, size_text, rim, pattern, description, price = [(x or '').strip().replace('\n', ' ') for x in cells]
            brand_match = re.search(r'\b(GOODRIDE|KUMHO)\b', description, re.I)
            if not brand_match or not re.fullmatch(r'[\d,]+\.\d{2}', price):
                raise ValueError(f'Unparseable row {sku} on page {page_number}')
            metric_col = re.fullmatch(r'(\d{3})\s+(\d{2})\s+(\d{2}(?:\.\d+)?)\]?', size_text)
            metric_desc = re.search(r'(?<!\d)(\d{3})\s*/?(\d{2})[A-Z]*R(\d{2}(?:\.\d+)?)', description, re.I)
            col_size = metric_col.groups() if metric_col else None
            desc_size = metric_desc.groups() if metric_desc else None
            if col_size and desc_size and col_size != desc_size:
                rejected.append({'sku': sku, 'page': page_number, 'reason': 'conflicting sizes', 'source': cells})
                continue
            pattern_tokens = re.sub(r'[^A-Z0-9]', '', pattern.upper())
            desc_tokens = re.sub(r'[^A-Z0-9]', '', description.upper())
            if pattern_tokens and pattern_tokens not in desc_tokens:
                rejected.append({'sku': sku, 'page': page_number, 'reason': 'conflicting patterns', 'source': cells})
                continue
            bracket = re.search(r'\[(\d{3})\s+(\d{2})\s+(\d{2}(?:\.\d+)?)\]', description)
            if col_size and bracket and col_size != bracket.groups():
                rejected.append({'sku': sku, 'page': page_number, 'reason': 'conflicting bracketed size', 'source': cells})
                continue
            commercial_suffix = 'C' if metric_desc and re.match(r'C\b', description[metric_desc.end():], re.I) else ''
            size = '/'.join(col_size[:2]) + 'R' + col_size[2] + commercial_suffix if col_size else ''
            if not size:
                flotation = re.fullmatch(r'(\d{2})\s+(\d{3,4})\s+(\d{2})', size_text)
                if flotation:
                    diameter, width, wheel = flotation.groups()
                    size = f'{diameter}X{int(width) / 100:g}R{wheel}'
                else:
                    size = description.split()[0].upper()
            clean_desc = description[brand_match.end():].strip()
            cost = Decimal(price.replace(',', ''))
            rows.append({'sku': sku, 'size': size, 'brand': brand_match.group().upper(), 'pattern': pattern, 'category': category,
                         'description': clean_desc, 'cost': float(cost),
                         'price': int((cost * Decimal('1.15')).quantize(Decimal('1'), rounding=ROUND_HALF_UP)),
                         'sourcePage': page_number})

if len(rows) + len(rejected) != 284 or len({r['sku'] for r in rows + rejected}) != 284:
    raise ValueError('Unexpected number of source rows or duplicate supplier stock codes')
destination.write_text(json.dumps({'source': source.name, 'sourceDate': '2026-07-01',
    'sha256': sha256(source.read_bytes()).hexdigest(), 'rows': rows, 'rejected': rejected}, indent=2), encoding='utf-8')
print(f'Extracted {len(rows)} rows; held {len(rejected)} conflicts for review')
for r in rejected:
    print(f"{r['sku']}: {r['reason']} (page {r['page']})")
