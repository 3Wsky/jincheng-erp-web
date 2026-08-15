/**
 * 销售账号门店+仓库划分规则(纯函数,TC-ORG-004)。
 * 内置 ADMIN/BOSS 虽含 sales:* 权限码,不按销售岗要求划分地点。
 */

export const SALES_ASSIGNABLE_WAREHOUSE_TYPES = ["STORE", "PERSONAL"] as const;

export type SalesRoleInput = {
  code: string;
  permissions: string[];
};

/** 勾选的角色里是否包含需要划分门店+仓库的销售岗 */
export function requiresSalesAssignment(roles: SalesRoleInput[]): boolean {
  return roles.some((role) => {
    if (role.code === "SALES") return true;
    // 自定义角色带销售写入权,同样要划分地点;内置非销售岗即使有 sales:* 也不强制
    if (role.code === "ADMIN" || role.code === "BOSS") return false;
    return role.permissions.includes("sales:write");
  });
}

/** 开账号时按角色写入 UserRole.dataScope */
export function dataScopeForRole(code: string): "ORGANIZATION" | "STORE" | "PERSONAL" {
  if (code === "ADMIN" || code === "BOSS") return "ORGANIZATION";
  if (code === "SALES") return "STORE";
  return "PERSONAL";
}

export function missingSalesAssignmentMessage(input: {
  storeId?: string | null;
  warehouseIds?: string[];
}): string | null {
  if (!input.storeId) return "销售权限必须先划分所属门店";
  if (!input.warehouseIds || input.warehouseIds.length === 0) {
    return "销售权限必须再划分所属仓库(门店仓或个人仓)";
  }
  return null;
}

/** 个人仓名称与员工姓名对齐时,开销售账号可预勾该仓 */
export function suggestPersonalWarehouseId(
  employeeName: string,
  warehouses: Array<{ id: string; name: string; type: string; ownerEmployeeId: string | null }>,
  employeeId?: string,
): string | null {
  const normalized = employeeName.trim();
  if (!normalized) return null;
  const owned = warehouses.find(
    (warehouse) =>
      warehouse.type === "PERSONAL" && warehouse.ownerEmployeeId === employeeId,
  );
  if (owned) return owned.id;
  const exact = warehouses.find(
    (warehouse) =>
      warehouse.type === "PERSONAL" &&
      warehouse.name.trim() === normalized &&
      (warehouse.ownerEmployeeId === null || warehouse.ownerEmployeeId === employeeId),
  );
  return exact?.id ?? null;
}
