"""Read Royal's Yellow prices and cached available stock; never execute workbook macros."""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import re
from datetime import datetime

import openpyxl


def prepare(source, destination, report_path):
    workbook = openpyxl.load_workbook(source, data_only=True)
    warehouses = ['RVTRK', 'RTCPHX', 'RTCJHB', 'RTC_CT']
    fields = ['Supplier SKU', 'Product Type', 'Product Name', 'TYRE_SIZE', 'Category',
              'Cost Price', 'Price Column', 'Snapshot Date', 'Source Sheet', 'Source Row',
              *[f'{w} Stock Units' for w in warehouses]]
    rows, issues, seen = [], [], set()
    totals = dict.fromkeys(warehouses, 0)
    for sheet_name, product_type in [('Data', 'TYRE'), ('RimsData', 'WHEEL')]:
        sheet = workbook[sheet_name]
        headers = [cell.value for cell in sheet[2]]
        for required in ['Yellow', 'ItemCode', 'ItemName', 'Size', *[f'{w}-Avail' for w in warehouses]]:
            if required not in headers:
                raise ValueError(f'{sheet_name}: missing {required}')
        refreshed = re.search(r'Refreshed On: (\d{2})-([A-Za-z]+)-(\d{4})', str(sheet['A1'].value))
        if not refreshed:
            raise ValueError('Confirm the workbook snapshot date before importing')
        snapshot_date = datetime.strptime(f'{refreshed[1]}-{refreshed[2][:3]}-{refreshed[3]}', '%d-%b-%Y').date().isoformat()
        for row_number, values in enumerate(sheet.iter_rows(min_row=3, values_only=True), 3):
            raw = dict(zip(headers, values))
            if not raw.get('ItemCode'):
                continue
            sku = str(raw['ItemCode']).strip()
            if sku in seen:
                raise ValueError(f'Duplicate SKU: {sku}')
            seen.add(sku)
            price = raw['Yellow']
            if not isinstance(price, (int, float)) or price < 0:
                raise ValueError(f'{sheet_name}!M{row_number}: invalid Yellow price')
            row = {'Supplier SKU': sku, 'Product Type': product_type,
                   'Product Name': str(raw['ItemName']).strip(), 'TYRE_SIZE': raw.get('Size') or '',
                   'Category': raw.get('Category') or 'Rims', 'Cost Price': price,
                   'Price Column': 'Yellow', 'Snapshot Date': snapshot_date,
                   'Source Sheet': sheet_name, 'Source Row': row_number}
            if price == 0:
                issues.append({'sku': sku, 'sheet': sheet_name, 'row': row_number, 'reason': 'Yellow price is zero; confirm price'})
            for warehouse in warehouses:
                quantity = raw[f'{warehouse}-Avail']
                if not isinstance(quantity, (int, float)) or int(quantity) != quantity:
                    raise ValueError(f'{sku}: invalid available units for {warehouse}')
                if quantity < 0:
                    issues.append({'sku': sku, 'warehouse': warehouse, 'original': quantity, 'reason': 'Negative availability clamped to zero'})
                row[f'{warehouse} Stock Units'] = max(0, int(quantity))
                totals[warehouse] += max(0, int(quantity))
            rows.append(row)
    output = io.StringIO(newline='')
    writer = csv.DictWriter(output, fieldnames=fields, lineterminator='\n')
    writer.writeheader()
    writer.writerows(rows)
    Path(destination).write_text('export const ROYAL_TYRES_RAW_DATA = ' + json.dumps(output.getvalue(), ensure_ascii=True) + ';\n', encoding='utf-8')
    report = {'source': Path(source).name, 'sha256': hashlib.sha256(Path(source).read_bytes()).hexdigest(),
              'snapshotDate': snapshot_date, 'priceColumn': 'Yellow', 'rows': len(rows),
              'types': {kind: sum(r['Product Type'] == kind for r in rows) for kind in ['TYRE', 'WHEEL']},
              'stockByWarehouse': totals, 'totalAvailable': sum(totals.values()),
              'excludedSheets': ['TubesAndFlapsData', 'OilsAndLubesData'],
              'exclusionReason': 'No Yellow price column', 'issues': issues}
    Path(report_path).parent.mkdir(parents=True, exist_ok=True)
    Path(report_path).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k != 'issues'}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source')
    parser.add_argument('--output', default='supplier_data/royalTyresData.ts')
    parser.add_argument('--report', default='reports/royal-workbook-import.json')
    args = parser.parse_args()
    prepare(args.source, args.output, args.report)
