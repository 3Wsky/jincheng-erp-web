"""管家婆序列号库存 Excel → JSON 中间文件(供 Prisma 期初迁移导入使用)。

用法: python export-serial-json.py <xls路径> <输出json路径>
输出: { warehouses: [{code,name,type,count}], items: [{skuCode, skuName, serial, warehouseName}] }
"""
import json
import importlib.util
import re
import sys
from collections import Counter

import olefile

# 复用解析逻辑(文件名含连字符,用 importlib 加载)
_dir = __file__.rsplit("\\", 1)[0] if "\\" in __file__ else __file__.rsplit("/", 1)[0]
_spec = importlib.util.spec_from_file_location(
    "parse_serial_inventory_xls",
    f"{_dir}/parse-serial-inventory-xls.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
iter_records = _mod.iter_records
parse_rows = _mod.parse_rows
parse_sst = _mod.parse_sst
ct = _mod.ct

COMPANY_TYPE = {"COMPANY", "STORE", "AFTER_SALES", "ABNORMAL"}
STORE_KEYWORDS = ["店", "厅", "总库", "分销", "合作", "通讯", "国美", "演示", "外拓", "尚层", "售后", "仓"]
PERSONAL_KNOWN = {"铁路局徐杰", "移动何小妹"}


def classify(name: str) -> str:
    if name in PERSONAL_KNOWN:
        return "PERSONAL"
    if any(k in name for k in STORE_KEYWORDS):
        return "STORE" if name != "总库" else "COMPANY"
    if re.fullmatch(r"[\u4e00-\u9fa5]{2,4}", name):
        return "PERSONAL"
    return "PERSONAL"


def main():
    if len(sys.argv) < 3:
        print("用法: python export-serial-json.py <xls路径> <输出json路径>")
        sys.exit(1)
    path = sys.argv[1]
    out_path = sys.argv[2]

    ole = olefile.OleFileIO(path)
    wb = ole.openstream("Workbook").read()
    records = list(iter_records(wb))
    sst = parse_sst(records)
    rows = parse_rows(wb, sst)

    header_row = None
    for r in sorted(rows):
        if any("仓库编号" in ct(rows[r].get(c)) for c in range(20)):
            header_row = r
            break
    cols = {c: ct(rows[header_row].get(c)) for c in range(20)}
    code_col = next((c for c, h in cols.items() if "仓库编号" in h), None)
    name_col = next((c for c, h in cols.items() if "仓库全名" in h), None)
    sku_col = next((c for c, h in cols.items() if h == "编号"), None)
    sku_name_col = next((c for c, h in cols.items() if h == "商品全名"), None)
    serial_col = next((c for c, h in cols.items() if h == "序列号"), None)

    warehouse_counts = Counter()
    items = []
    seen_serials = set()
    for r in sorted(rows):
        if r <= header_row:
            continue
        code = ct(rows[r].get(code_col)) if code_col is not None else ""
        name = ct(rows[r].get(name_col)) if name_col is not None else ""
        sku_code = ct(rows[r].get(sku_col)) if sku_col is not None else ""
        sku_name = ct(rows[r].get(sku_name_col)) if sku_name_col is not None else ""
        serial = ct(rows[r].get(serial_col)) if serial_col is not None else ""
        if not name or not serial:
            continue
        if serial in seen_serials:
            continue
        seen_serials.add(serial)
        warehouse_counts[(code, name)] += 1
        items.append({
            "skuCode": sku_code,
            "skuName": sku_name,
            "serial": serial,
            "warehouseCode": code,
            "warehouseName": name,
        })

    warehouses = []
    for (code, name), count in sorted(warehouse_counts.items(), key=lambda x: -x[1]):
        warehouses.append({
            "code": name if not code else f"{name}",
            "name": name,
            "type": classify(name),
            "count": count,
        })

    payload = {"warehouses": warehouses, "items": items}
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    print(f"仓库 {len(warehouses)} 类, 序列号 {len(items)} 条 → {out_path}")


if __name__ == "__main__":
    main()
