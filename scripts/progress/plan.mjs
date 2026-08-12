/**
 * 进度探测基线：把 docs/ 里的规划转成可机读数据，供 probe.mjs 对照“计划 vs 实际”。
 *
 * 来源：
 * - docs/10-API接口清单.md   （接口编号、路径、状态）
 * - docs/08-页面与菜单清单.md（页面路由）
 * - apps/web/src/lib/erp-navigation.ts（导航模块）
 * - packages/database/prisma/schema.prisma（数据表清单）
 *
 * 文档发生变化时，同步维护本文件。
 */

/** Prisma schema 声明的全部数据表（用于核对数据库结构是否齐全） */
export const DB_TABLES = [
  "Organization",
  "Store",
  "Employee",
  "UserAccount",
  "Role",
  "Permission",
  "UserRole",
  "RolePermission",
  "Product",
  "Sku",
  "SkuBarcode",
  "SkuExternalIdentity",
  "CatalogImportBatch",
  "CatalogImportDocument",
  "CatalogImportRow",
  "Warehouse",
  "SerialItem",
  "InventoryMovement",
  "TransferOrder",
  "TransferLine",
  "Supplier",
  "PurchaseOrder",
  "PurchaseLine",
  "PurchasePayment",
  "PurchaseReceipt",
  "PurchaseReceiptItem",
  "StocktakeOrder",
  "StocktakeScan",
  "StocktakeDifference",
  "AuditLog",
  "OutboxEvent",
];

/**
 * 已进入实现阶段的接口（docs/10 明细表，VERIFY = 已实现待验收）。
 * path 不含全局前缀 /api/v1；{id} 之类占位符用于和 OpenAPI 路径匹配。
 */
export const PLANNED_APIS = [
  { id: "API-AUTH-001", method: "POST", path: "/auth/login", module: "auth" },
  { id: "API-AUTH-002", method: "GET", path: "/auth/me", module: "auth" },
  { id: "API-AUTH-003", method: "PATCH", path: "/auth/password", module: "auth" },
  { id: "API-AUTH-004", method: "POST", path: "/auth/logout", module: "auth" },
  { id: "API-ORG-001", method: "GET", path: "/organizations", module: "organization" },
  { id: "API-ORG-002", method: "POST", path: "/organizations", module: "organization" },
  { id: "API-ORG-003", method: "PATCH", path: "/organizations/{id}", module: "organization" },
  { id: "API-ORG-004", method: "GET", path: "/organizations/{organizationId}/stores", module: "organization" },
  { id: "API-ORG-005", method: "POST", path: "/stores", module: "organization" },
  { id: "API-ORG-006", method: "PATCH", path: "/stores/{id}", module: "organization" },
  { id: "API-ORG-007", method: "GET", path: "/organizations/{organizationId}/employees", module: "organization" },
  { id: "API-ORG-008", method: "POST", path: "/employees", module: "organization" },
  { id: "API-ORG-009", method: "PATCH", path: "/employees/{id}", module: "organization" },
  { id: "API-ORG-010", method: "POST", path: "/accounts", module: "organization" },
  { id: "API-ORG-011", method: "PATCH", path: "/accounts/{id}", module: "organization" },
  { id: "API-ORG-012", method: "GET", path: "/roles", module: "organization" },
  { id: "API-ORG-013", method: "GET", path: "/permissions", module: "organization" },
  { id: "API-ORG-014", method: "POST", path: "/organizations/{organizationId}/stores/sync-from-warehouses", module: "organization" },
  { id: "API-CAT-001", method: "GET", path: "/catalog/products", module: "catalog" },
  { id: "API-CAT-002", method: "POST", path: "/catalog/products", module: "catalog" },
  { id: "API-CAT-003", method: "PATCH", path: "/catalog/products/{id}", module: "catalog" },
  { id: "API-CAT-004", method: "POST", path: "/catalog/products/{id}/skus", module: "catalog" },
  { id: "API-CAT-005", method: "PATCH", path: "/catalog/skus/{id}", module: "catalog" },
  { id: "API-CAT-006", method: "POST", path: "/catalog/imports/bytestar/preview", module: "catalog" },
  { id: "API-CAT-007", method: "POST", path: "/catalog/imports/{id}/apply", module: "catalog" },
  { id: "API-CAT-008", method: "GET", path: "/catalog/imports", module: "catalog" },
  { id: "API-CAT-009", method: "POST", path: "/catalog/prices/sync-from-feed", module: "catalog" },
  { id: "API-INV-001", method: "GET", path: "/inventory/overview", module: "inventory" },
  { id: "API-INV-002", method: "GET", path: "/inventory/warehouses/{id}/serials", module: "inventory" },
  { id: "API-INV-003", method: "GET", path: "/inventory/search", module: "inventory" },
  { id: "API-INV-004", method: "GET", path: "/inventory/serials/{id}", module: "inventory" },
  { id: "API-INV-005", method: "GET", path: "/inventory/search/summary", module: "inventory" },
  { id: "API-TRF-001", method: "GET", path: "/transfers", module: "transfer" },
  { id: "API-TRF-002", method: "POST", path: "/transfers", module: "transfer" },
  { id: "API-TRF-003", method: "GET", path: "/transfers/{id}", module: "transfer" },
  { id: "API-TRF-004", method: "POST", path: "/transfers/{id}/submit", module: "transfer" },
  { id: "API-TRF-005", method: "POST", path: "/transfers/{id}/approve", module: "transfer" },
  { id: "API-TRF-006", method: "POST", path: "/transfers/{id}/reject", module: "transfer" },
  { id: "API-TRF-007", method: "POST", path: "/transfers/{id}/lock", module: "transfer" },
  { id: "API-TRF-008", method: "POST", path: "/transfers/{id}/ship", module: "transfer" },
  { id: "API-TRF-009", method: "POST", path: "/transfers/{id}/receive", module: "transfer" },
  { id: "API-TRF-010", method: "POST", path: "/transfers/{id}/exceptions", module: "transfer" },
  { id: "API-TRF-011", method: "POST", path: "/transfers/{id}/complete", module: "transfer" },
  { id: "API-TRF-012", method: "POST", path: "/transfers/{id}/cancel", module: "transfer" },
  { id: "API-PUR-001", method: "GET", path: "/suppliers", module: "procurement" },
  { id: "API-PUR-002", method: "POST", path: "/suppliers", module: "procurement" },
  { id: "API-PUR-003", method: "PATCH", path: "/suppliers/{id}", module: "procurement" },
  { id: "API-PUR-004", method: "GET", path: "/purchase-orders", module: "procurement" },
  { id: "API-PUR-005", method: "POST", path: "/purchase-orders", module: "procurement" },
  { id: "API-PUR-006", method: "GET", path: "/purchase-orders/{id}", module: "procurement" },
  { id: "API-PUR-007", method: "POST", path: "/purchase-orders/{id}/submit", module: "procurement" },
  { id: "API-PUR-008", method: "POST", path: "/purchase-orders/{id}/approve", module: "procurement" },
  { id: "API-PUR-009", method: "POST", path: "/purchase-orders/{id}/reject", module: "procurement" },
  { id: "API-PUR-010", method: "POST", path: "/purchase-orders/{id}/cancel", module: "procurement" },
  { id: "API-PUR-011", method: "POST", path: "/purchase-orders/{id}/payments", module: "procurement" },
  { id: "API-PUR-012", method: "POST", path: "/purchase-orders/{id}/receipts", module: "procurement" },
  { id: "API-PUR-013", method: "POST", path: "/purchase-orders/{id}/complete", module: "procurement" },
  { id: "API-STK-001", method: "GET", path: "/stocktakes", module: "stocktake" },
  { id: "API-STK-002", method: "POST", path: "/stocktakes", module: "stocktake" },
  { id: "API-STK-003", method: "GET", path: "/stocktakes/{id}", module: "stocktake" },
  { id: "API-STK-004", method: "POST", path: "/stocktakes/{id}/start", module: "stocktake" },
  { id: "API-STK-005", method: "POST", path: "/stocktakes/{id}/scan", module: "stocktake" },
  { id: "API-STK-006", method: "POST", path: "/stocktakes/{id}/submit", module: "stocktake" },
  { id: "API-STK-007", method: "POST", path: "/stocktakes/{id}/approve", module: "stocktake" },
  { id: "API-STK-008", method: "POST", path: "/stocktakes/{id}/reject", module: "stocktake" },
  { id: "API-STK-009", method: "POST", path: "/stocktakes/{id}/post", module: "stocktake" },
  { id: "API-STK-010", method: "POST", path: "/stocktakes/{id}/cancel", module: "stocktake" },
  { id: "API-SYS-001", method: "GET", path: "/health", module: "system" },
  { id: "API-SYS-002", method: "GET", path: "/audit/logs", module: "audit" },
  { id: "API-SYS-003", method: "GET", path: "/audit/outbox/pending", module: "audit" },
];

/**
 * 尚未进入实现阶段的模块（docs/10 汇总表只有编号区间）。
 * prefixes 用于在 OpenAPI 里探测“是否已经出现任何实现”。
 */
export const FUTURE_MODULES = [
  // 全局查货(API-INV-003/004)、调拨(API-TRF-001~012)、采购(API-PUR-001~013)、盘点(API-STK-001~010)均已实现,进入 PLANNED_APIS
  { id: "sales", name: "销售管理", apiRange: "API-SAL-001~030", plannedCount: 30, prefixes: ["/sales-orders", "/sales-returns", "/sales"], phase: "阶段3", blocked: true, blockedReason: "销售单来源与毛利口径未签字（docs/04）" },
  { id: "crm", name: "客户管理", apiRange: "API-CRM-001~020", plannedCount: 20, prefixes: ["/customers", "/customer-merges", "/crm"], phase: "阶段3~4", blocked: false },
  { id: "tasks", name: "待办审批", apiRange: "API-TASK-001~010", plannedCount: 10, prefixes: ["/tasks", "/approvals"], phase: "阶段2~4", blocked: false },
  { id: "finance", name: "财务中心", apiRange: "API-SAL/PUR 资金部分", plannedCount: 12, prefixes: ["/finance", "/payments", "/ledger"], phase: "阶段4", blocked: true, blockedReason: "收款确认与支付方式未确认（docs/04）" },
  { id: "reports", name: "经营报表", apiRange: "API-RPT-001~020", plannedCount: 20, prefixes: ["/reports", "/exports"], phase: "阶段4~6", blocked: false },
  { id: "integrations", name: "外部集成", apiRange: "API-INT-001~020", plannedCount: 20, prefixes: ["/integrations", "/sync-jobs", "/webhooks"], phase: "阶段6", blocked: false },
];

/**
 * 网站端模块看板：与左侧导航一一对应。
 * pageFile 存在 = 页面已实现；不存在 = 走 [...slug] 占位页。
 * apiModule 关联 PLANNED_APIS.module 或 FUTURE_MODULES.id。
 */
export const NAV_MODULES = [
  { id: "dashboard", name: "经营工作台", group: "经营总览", route: "/", pageFile: "apps/web/src/app/page.tsx", apiModule: null, note: "指标已接真实接口（库存总览/货品主档/在途调拨，2026-08-12）" },
  { id: "search", name: "全局查货", group: "经营总览", route: "/search", pageFile: "apps/web/src/app/search/page.tsx", apiModule: "inventory" },
  { id: "tasks", name: "我的待办", group: "经营总览", route: "/tasks", pageFile: "apps/web/src/app/tasks/page.tsx", apiModule: "tasks" },
  { id: "catalog", name: "货品中心", group: "进销存", route: "/catalog/products", pageFile: "apps/web/src/app/catalog/products/page.tsx", apiModule: "catalog" },
  { id: "inventory", name: "库存管理", group: "进销存", route: "/inventory", pageFile: "apps/web/src/app/inventory/page.tsx", apiModule: "inventory" },
  { id: "stocktake", name: "盘点管理", group: "进销存", route: "/inventory/stocktakes", pageFile: "apps/web/src/app/inventory/stocktakes/page.tsx", apiModule: "stocktake" },
  { id: "procurement", name: "采购管理", group: "进销存", route: "/procurement/orders", pageFile: "apps/web/src/app/procurement/orders/page.tsx", apiModule: "procurement" },
  { id: "transfer", name: "调拨管理", group: "进销存", route: "/transfers", pageFile: "apps/web/src/app/transfers/page.tsx", apiModule: "transfer" },
  { id: "sales", name: "销售管理", group: "进销存", route: "/sales/orders", pageFile: "apps/web/src/app/sales/orders/page.tsx", apiModule: "sales" },
  { id: "crm", name: "客户管理", group: "客户与经营", route: "/crm/customers", pageFile: "apps/web/src/app/crm/customers/page.tsx", apiModule: "crm" },
  { id: "finance", name: "财务中心", group: "客户与经营", route: "/finance/ledger", pageFile: "apps/web/src/app/finance/ledger/page.tsx", apiModule: "finance" },
  { id: "reports", name: "经营报表", group: "客户与经营", route: "/reports/daily", pageFile: "apps/web/src/app/reports/daily/page.tsx", apiModule: "reports" },
  { id: "executive", name: "老板驾驶舱", group: "客户与经营", route: "/reports/executive", pageFile: "apps/web/src/app/reports/executive/page.tsx", apiModule: "reports" },
  { id: "organization", name: "组织与员工", group: "组织与系统", route: "/admin/organization", pageFile: "apps/web/src/app/admin/organization/page.tsx", apiModule: "organization" },
  { id: "roles", name: "权限与审批", group: "组织与系统", route: "/admin/roles", pageFile: "apps/web/src/app/admin/roles/page.tsx", apiModule: "organization" },
  { id: "integrations", name: "集成中心", group: "组织与系统", route: "/integrations", pageFile: "apps/web/src/app/integrations/page.tsx", apiModule: "integrations" },
  { id: "system", name: "系统设置", group: "组织与系统", route: "/system/health", pageFile: "apps/web/src/app/system/health/page.tsx", apiModule: "audit" },
];