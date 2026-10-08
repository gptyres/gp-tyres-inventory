"""Read product metadata through existing office portal adapters, without publishing stock."""
import argparse
import json
import logging
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--automation-root', required=True)
parser.add_argument('--supplier', choices=['TYREWAREHOUSE', 'STAMFORD'], required=True)
parser.add_argument('--out', required=True)
args = parser.parse_args()
root = Path(args.automation_root).resolve()
sys.path.insert(0, str(root))
from sync_all_suppliers import load_dotenv, load_suppliers, load_local_credentials, LOCAL_CREDENTIALS_CSV
load_dotenv(root / '.env')
load_local_credentials(LOCAL_CREDENTIALS_CSV, load_suppliers())
logging.disable(logging.CRITICAL)

def metadata(product):
    return {key: value for key, value in product.items()
            if re.search(r'load|speed|rating|description|specification', key, re.I)
            and isinstance(value, (str, int, float))}

rows = []
if args.supplier == 'TYREWAREHOUSE':
    import tyrewarehouse_discounted_sync as adapter
    products = adapter.TyrewarehouseDiscountedScraper(adapter.TyrewarehouseDiscountedSettings.from_environment(root)).scrape()
    for _, product in products:
        brand, pattern = adapter.split_brand_and_pattern(str(product.get('product_name', '')))
        size = adapter.find_tyrewarehouse_size(product.get('product_specifications', ''), product.get('product_name', ''))
        rows.append(dict(catalog=args.supplier, sku=str(product.get('product_no', '')), size=size,
                         brand=brand, pattern=pattern, raw=metadata(product)))
else:
    import stamford_sync as adapter
    original = adapter.flatten_catalogue
    def capture(payload):
        for group in payload:
            for pattern in group.get('TreadPatterns') or []:
                for product in pattern.get('Sizes') or []:
                    rows.append(dict(catalog=args.supplier, sku=str(product.get('sku', '')),
                                     size=product.get('Size', ''), brand=adapter.canonical_brand(group.get('Brand')),
                                     pattern=pattern.get('TreadPattern', ''), raw=metadata(product)))
        return original(payload)
    adapter.flatten_catalogue = capture
    adapter.StamfordScraper(adapter.StamfordSettings.from_environment(root)).scrape()

output = Path(args.out).resolve()
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps({'fetchedAt': datetime.now(timezone.utc).isoformat(), 'rows': rows}, indent=2), encoding='utf-8')
print(json.dumps({'supplier': args.supplier, 'products': len(rows), 'output': str(output)}))
