"""管家婆「仓库全名」→ ERP WarehouseType。"""
import re

AFTER_SALES_NAMES = {"潘国杰售后", "售后"}
PERSONAL_KNOWN = {"铁路局徐杰", "移动何小妹"}
STORE_CONFIRMED = {"中山李路远仓"}
STORE_KEYWORDS = (
    "店",
    "厅",
    "总库",
    "分销",
    "合作",
    "通讯",
    "国美",
    "演示",
    "外拓",
    "尚层",
    "仓",
)


def classify(name: str) -> str:
    name = (name or "").strip()
    if not name:
        return "ABNORMAL"
    if name in AFTER_SALES_NAMES or "售后" in name:
        return "AFTER_SALES"
    if name == "总库":
        return "COMPANY"
    if name in STORE_CONFIRMED:
        return "STORE"
    if name in PERSONAL_KNOWN:
        return "PERSONAL"
    if any(k in name for k in STORE_KEYWORDS):
        return "STORE"
    if re.fullmatch(r"[\u4e00-\u9fa5]{2,4}\d*", name):
        return "PERSONAL"
    return "PERSONAL"


def employee_match_key(warehouse_name: str) -> str:
    """人名仓用于对员工档案的键：去掉末尾数字（支文玉2 → 支文玉）。"""
    return re.sub(r"\d+$", "", (warehouse_name or "").strip())
