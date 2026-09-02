import json
import re
import zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

XLSX = Path(r"D:\Descargas\Análisis Rentabilidad Sucursales - respaldo.xlsx")
OUT = Path(r"D:\Proyectos\Opervia\.analysis\excel-reconcile\output")
OUT.mkdir(parents=True, exist_ok=True)
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def shared_strings(zf):
    result = []
    with zf.open("xl/sharedStrings.xml") as stream:
        for event, elem in ET.iterparse(stream, events=("end",)):
            if elem.tag == NS + "si":
                result.append("".join(t.text or "" for t in elem.iter(NS + "t")))
                elem.clear()
    return result


def col_name(ref):
    return re.match(r"[A-Z]+", ref).group(0)


def read_cells(zf, sheet_path, strings, wanted_cols=None):
    rows = []
    with zf.open(sheet_path) as stream:
        for event, elem in ET.iterparse(stream, events=("end",)):
            if elem.tag != NS + "row":
                continue
            row = {"_row": int(elem.attrib["r"])}
            for cell in elem.findall(NS + "c"):
                ref = cell.attrib["r"]
                col = col_name(ref)
                if wanted_cols is not None and col not in wanted_cols:
                    continue
                value_node = cell.find(NS + "v")
                formula_node = cell.find(NS + "f")
                value = value_node.text if value_node is not None else None
                if value is not None and cell.attrib.get("t") == "s":
                    value = strings[int(value)]
                elif value is not None and cell.attrib.get("t") not in ("str", "inlineStr"):
                    try:
                        value = float(value)
                    except ValueError:
                        pass
                row[col] = value
                if formula_node is not None:
                    row[col + "_formula"] = formula_node.text
            rows.append(row)
            elem.clear()
    return rows


with zipfile.ZipFile(XLSX) as zf:
    strings = shared_strings(zf)
    summary_rows = read_cells(zf, "xl/worksheets/sheet6.xml", strings)
    sales_rows = read_cells(
        zf,
        "xl/worksheets/sheet2.xml",
        strings,
        {"A", "B", "C", "N", "P", "R", "U", "X", "AM", "AN", "AO"},
    )
    purchase_rows = read_cells(
        zf,
        "xl/worksheets/sheet7.xml",
        strings,
        {"B", "J", "K", "L", "M", "N", "O", "S"},
    )

sales_headers = sales_rows[0]
purchase_headers = purchase_rows[0]

monthly_sales = defaultdict(lambda: {"sales": 0.0, "cost": 0.0, "rows": 0, "invoices": set(), "min_date_serial": None, "max_date_serial": None})
monthly_by_status = defaultdict(lambda: defaultdict(lambda: {"sales": 0.0, "cost": 0.0, "rows": 0, "invoices": set()}))
invoice_totals = defaultdict(lambda: {"sales": 0.0, "cost": 0.0, "date_serial": None, "status": None, "rows": 0})
status_counts = defaultdict(int)
status_labels = defaultdict(int)
for row in sales_rows[1:]:
    status_counts[str(row.get("N"))] += 1
    status_labels[str(row.get("C"))] += 1
    if row.get("N") != 1.0:
        continue
    try:
        year = int(row["X"])
        month_value = row["U"]
        month = int(month_value) if isinstance(month_value, (int, float)) else None
        if month is None:
            month_lookup = {"ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6,
                            "jul": 7, "ago": 8, "sep": 9, "oct": 10, "nov": 11, "dic": 12}
            month = month_lookup.get(str(month_value).lower()[:3])
        if month is None:
            continue
        key = f"{year:04d}-{month:02d}"
        monthly_sales[key]["sales"] += float(row.get("P") or 0)
        monthly_sales[key]["cost"] += float(row.get("R") or 0)
        monthly_sales[key]["rows"] += 1
        date_serial = row.get("B")
        if isinstance(date_serial, (int, float)):
            current_min = monthly_sales[key]["min_date_serial"]
            current_max = monthly_sales[key]["max_date_serial"]
            monthly_sales[key]["min_date_serial"] = date_serial if current_min is None else min(current_min, date_serial)
            monthly_sales[key]["max_date_serial"] = date_serial if current_max is None else max(current_max, date_serial)
        if row.get("A") is not None:
            monthly_sales[key]["invoices"].add(str(row.get("A")))
            invoice_key = str(row.get("A")).strip()
            invoice_totals[invoice_key]["sales"] += float(row.get("P") or 0)
            invoice_totals[invoice_key]["cost"] += float(row.get("R") or 0)
            invoice_totals[invoice_key]["date_serial"] = row.get("B")
            invoice_totals[invoice_key]["status"] = row.get("C")
            invoice_totals[invoice_key]["rows"] += 1
        status_label = str(row.get("C"))
        monthly_by_status[key][status_label]["sales"] += float(row.get("P") or 0)
        monthly_by_status[key][status_label]["cost"] += float(row.get("R") or 0)
        monthly_by_status[key][status_label]["rows"] += 1
        if row.get("A") is not None:
            monthly_by_status[key][status_label]["invoices"].add(str(row.get("A")))
    except (KeyError, TypeError, ValueError):
        continue

monthly_purchases = defaultdict(lambda: {"amount": 0.0, "rows": 0})
for row in purchase_rows[1:]:
    try:
        year = int(row["M"])
        month = int(row["O"])
        key = f"{year:04d}-{month:02d}"
        monthly_purchases[key]["amount"] += float(row.get("K") or 0)
        monthly_purchases[key]["rows"] += 1
    except (KeyError, TypeError, ValueError):
        continue

for value in monthly_sales.values():
    value["invoices"] = len(value["invoices"])
for statuses in monthly_by_status.values():
    for value in statuses.values():
        value["invoices"] = len(value["invoices"])

result = {
    "sales_headers": sales_headers,
    "purchase_headers": purchase_headers,
    "summary_rows": summary_rows,
    "sales_monthly": dict(sorted(monthly_sales.items())),
    "sales_monthly_by_status": {key: dict(value) for key, value in sorted(monthly_by_status.items())},
    "purchase_monthly": dict(sorted(monthly_purchases.items())),
    "status_counts": dict(status_counts),
    "status_labels": dict(status_labels),
    "row_counts": {"sales": len(sales_rows) - 1, "purchases": len(purchase_rows) - 1},
}
(OUT / "excel_analysis.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
(OUT / "excel_invoices.json").write_text(json.dumps(invoice_totals, ensure_ascii=False), encoding="utf-8")
print(json.dumps({
    "sales_headers": sales_headers,
    "purchase_headers": purchase_headers,
    "row_counts": result["row_counts"],
    "status_counts": result["status_counts"],
    "status_labels": result["status_labels"],
    "sales_2026": {k: v for k, v in result["sales_monthly"].items() if k.startswith("2026-")},
    "purchases_2026": {k: v for k, v in result["purchase_monthly"].items() if k.startswith("2026-")},
}, ensure_ascii=False, indent=2))
