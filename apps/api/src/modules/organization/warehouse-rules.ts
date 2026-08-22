/**
 * 仓库创建/修改的类型约束规则(纯函数,TC-ORG-006)。
 *
 * 2026-08-22 起仓库可由管理员在组织页创建(API-ORG-021/022),不再只靠管家婆期初导入:
 * - STORE 门店仓必须关联门店,不挂员工;
 * - PERSONAL 个人仓必须指定归属员工,同一员工只能有一个个人仓
 *   (门店归属在开通销售账号划分地点时写入,对齐 sales-assignment);
 * - COMPANY/AFTER_SALES/ABNORMAL 不关联门店也不挂员工;
 * - 仓库禁止物理删除(AGENTS 第 4 条),修改仅限改名与门店仓换关联门店。
 */

export const WAREHOUSE_TYPES = [
  "COMPANY",
  "STORE",
  "PERSONAL",
  "AFTER_SALES",
  "ABNORMAL",
] as const;

export type WarehouseTypeInput = (typeof WAREHOUSE_TYPES)[number];

/** 建仓入参的类型约束:违规返回中文错误提示,通过返回 null */
export function warehouseCreateViolation(input: {
  type: WarehouseTypeInput;
  storeId?: string | null;
  ownerEmployeeId?: string | null;
}): string | null {
  if (input.type === "STORE") {
    if (!input.storeId) return "门店仓必须关联所属门店";
    if (input.ownerEmployeeId) return "门店仓不能设置归属员工";
    return null;
  }
  if (input.type === "PERSONAL") {
    if (!input.ownerEmployeeId) return "个人仓必须指定归属员工";
    if (input.storeId) {
      return "个人仓不在创建时关联门店(开通销售账号划分地点时写入)";
    }
    return null;
  }
  if (input.storeId) return "公司总仓/售后仓/异常仓不能关联门店";
  if (input.ownerEmployeeId) {
    return "公司总仓/售后仓/异常仓不能设置归属员工";
  }
  return null;
}

/**
 * 个人仓一人一仓:该员工已有个人仓时返回冲突提示(422),否则 null。
 * 与 sales-assignment 的"禁止抢占他人个人仓"同源——创建即挂定员工,
 * 不允许重复建仓造成责任归属分裂。
 */
export function personalOwnerConflictMessage(
  ownerEmployeeId: string,
  existingPersonalWarehouses: Array<{
    name: string;
    ownerEmployeeId: string | null;
  }>,
): string | null {
  const owned = existingPersonalWarehouses.find(
    (warehouse) => warehouse.ownerEmployeeId === ownerEmployeeId,
  );
  if (owned) {
    return `该员工已有个人仓「${owned.name}」,一名员工只能有一个个人仓`;
  }
  return null;
}

/**
 * 改仓入参约束:只有门店仓可以调整关联门店;
 * 归属员工不可在此修改(避免抢占他人个人仓,调整走销售账号地点划分)。
 */
export function warehouseUpdateViolation(input: {
  type: WarehouseTypeInput;
  changingStoreId: boolean;
}): string | null {
  if (input.changingStoreId && input.type !== "STORE") {
    return "只有门店仓可以调整关联门店";
  }
  return null;
}
