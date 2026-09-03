#!/usr/bin/env python3
import argparse
import hashlib
import json
import math
import re
from pathlib import Path

import pdfplumber


def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def parse_int(value):
    digits = re.sub(r"[^0-9-]", "", clean(value))
    return max(0, int(digits or "0"))


def parse_money(value):
    normalized = clean(value).replace(" ", "").replace(",", ".")
    normalized = re.sub(r"[^0-9.-]", "", normalized)
    return float(normalized or "0")


def round_rand(value):
    return int(math.floor(value + 0.5))


def source_code(description):
    digest = hashlib.sha1(description.upper().encode("utf-8")).hexdigest()[:12].upper()
    return f"SG-ANNA-{digest}"


def parse_description(description):
    description = clean(description).upper().replace("×", "X")
    size_match = re.match(
        r"^((?:LT)?\d{2,3}/\d{2,3}(?:ZR|R)\d{2}(?:C|LT)?|"
        r"\d{2,3}R\d{2}(?:C|LT)?|"
        r"\d{2,3}X\d{1,2}(?:\.\d+)?R\d{2}(?:LT)?)\b",
        description,
    )
    if not size_match:
        raise ValueError(f"Could not parse tyre size from: {description}")

    size = size_match.group(1)
    remainder = clean(description[size_match.end():])
    specs = []
    if re.search(r"(?:^|\s)(?:\(WL\)|WL)(?:\s|$)", remainder):
        specs.append("WL")
    remainder = re.sub(r"(?:^|\s)(?:\(WL\)|WL)(?=\s|$)", " ", remainder)
    remainder = re.sub(r"\bANNAITE\b", " ", remainder)
    for spec in ("A/T", "H/T", "WSW"):
        if re.search(rf"(?:^|\s){re.escape(spec)}(?:\s|$)", remainder):
            specs.append(spec)
            remainder = re.sub(rf"(?:^|\s){re.escape(spec)}(?=\s|$)", " ", remainder)

    pattern = clean(remainder)
    if not pattern:
        raise ValueError(f"Could not parse tyre pattern from: {description}")

    return {
        "size": size,
        "brand": "ANNAITE",
        "pattern": pattern,
        "specs": " / ".join(dict.fromkeys(specs)),
    }


def extract_rows(pdf_path):
    rows = []
    with pdfplumber.open(pdf_path) as document:
        for page in document.pages:
            for table in page.extract_tables():
                for cells in table:
                    if len(cells) < 4:
                        continue
                    description = clean(cells[0])
                    if not description or description.upper() == "DESCRIPTION":
                        continue
                    parsed = parse_description(description)
                    rows.append({
                        "code": source_code(description),
                        "description": description.upper(),
                        "quantity": parse_int(cells[2]),
                        "cost": parse_money(cells[3]),
                        **parsed,
                    })

    codes = [row["code"] for row in rows]
    if len(codes) != len(set(codes)):
        raise ValueError("Duplicate Safety Grip source codes were generated.")
    return rows


def csv_cell(value):
    text = str(value)
    if any(character in text for character in ',"\n'):
        return f'"{text.replace(chr(34), chr(34) * 2)}"'
    return text


def write_typescript(rows, output_path):
    lines = ["CODE,DESCRIPTION,QUANTITY,COST EX VAT"]
    for row in rows:
        lines.append(",".join([
            csv_cell(row["code"]),
            csv_cell(row["description"]),
            str(row["quantity"]),
            f'{row["cost"]:.2f}',
        ]))
    content = "export const SAFETY_GRIP_RAW_DATA = `" + "\n".join(lines) + "`;\n"
    Path(output_path).write_text(content, encoding="utf-8")


def snapshot_item(row, source_file):
    selling_price = round_rand(row["cost"] * 1.15)
    return {
        "source_key": row["code"].lower(),
        "product_type": "TYRE",
        "product_name": row["description"],
        "supplier_sku": row["code"],
        "brand": row["brand"],
        "tyre_pattern": row["pattern"],
        "tyre_rating": "",
        "tyre_index": "",
        "tyre_specs": row["specs"],
        "category": "Passenger / SUV / LDV",
        "size": row["size"],
        "stock_location": "CPT",
        "stock_by_location": {"CPT": row["quantity"]},
        "stock_units_availability": "In stock" if row["quantity"] > 0 else "Out of stock",
        "stock_units": row["quantity"],
        "cost_price": row["cost"],
        "selling_price": selling_price,
        "supplier_lead_time": "",
        "product_url": "https://safetygrip.brilliantcloud.online/SafetyGripCustomerPortal/Main?CompanyID=SafetyGrip&ScreenId=SP504001",
        "source_file": source_file,
    }


def write_snapshot(rows, output_path, source_file, existing_snapshot_path):
    annaite_items = [snapshot_item(row, source_file) for row in rows]
    preserved_items = []
    if existing_snapshot_path:
        existing = json.loads(Path(existing_snapshot_path).read_text(encoding="utf-8"))
        preserved_items = [
            item for item in existing
            if clean(item.get("brand")).upper() != "ANNAITE"
        ]
    combined = preserved_items + annaite_items
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    Path(output_path).write_text(json.dumps(combined, indent=2) + "\n", encoding="utf-8")
    return len(preserved_items), len(combined)


def main():
    parser = argparse.ArgumentParser(description="Import a Safety Grip Annaite PDF catalogue.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--typescript-output", required=True)
    parser.add_argument("--snapshot-output")
    parser.add_argument("--existing-snapshot")
    args = parser.parse_args()

    rows = extract_rows(args.input)
    if len(rows) < 50:
        raise ValueError(f"Only {len(rows)} rows were extracted; refusing to replace the catalogue.")
    write_typescript(rows, args.typescript_output)

    summary = {
        "rows": len(rows),
        "stockUnits": sum(row["quantity"] for row in rows),
        "minCostExVat": min(row["cost"] for row in rows),
        "maxCostExVat": max(row["cost"] for row in rows),
        "typescriptOutput": str(Path(args.typescript_output).resolve()),
    }
    if args.snapshot_output:
        preserved, combined = write_snapshot(
            rows,
            args.snapshot_output,
            Path(args.input).name,
            args.existing_snapshot,
        )
        summary.update({
            "preservedNonAnnaiteRows": preserved,
            "combinedSnapshotRows": combined,
            "snapshotOutput": str(Path(args.snapshot_output).resolve()),
        })
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
