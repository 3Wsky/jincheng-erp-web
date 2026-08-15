/**
 * 角色权限边界规则(纯函数,TC-ORG-005)。
 *
 * 钱账分离(2026-08-12 业务确认,docs/11):
 * - procurement:write = 采购单据/审批(财务管账),procurement:pay = 付款执行(出纳);
 * - 同一角色不能同时持有两者;同一账号的角色组合也不能同时命中两者;
 * - 内置系统管理员(ADMIN)是技术兜底角色,种子持有全部权限码,不受此限制。
 */

export const MONEY_SEPARATION_WRITE = "procurement:write";
export const MONEY_SEPARATION_PAY = "procurement:pay";

/** 单个权限集合(自定义角色配权)是否违反钱账分离 */
export function permissionSetViolatesMoneySeparation(codes: string[]): boolean {
  return (
    codes.includes(MONEY_SEPARATION_WRITE) &&
    codes.includes(MONEY_SEPARATION_PAY)
  );
}

export type BoundaryRoleInput = {
  code: string;
  permissions: string[];
};

/**
 * 账号角色组合是否违反钱账分离(忽略 ADMIN);
 * 返回带冲突角色编码的提示语,无冲突返回 null。
 */
export function moneySeparationConflictMessage(
  roles: BoundaryRoleInput[],
): string | null {
  const involved = roles.filter((role) => role.code !== "ADMIN");
  const writeHolders = involved.filter((role) =>
    role.permissions.includes(MONEY_SEPARATION_WRITE),
  );
  const payHolders = involved.filter((role) =>
    role.permissions.includes(MONEY_SEPARATION_PAY),
  );
  if (writeHolders.length === 0 || payHolders.length === 0) return null;
  const codes = [
    ...new Set([...writeHolders, ...payHolders].map((role) => role.code)),
  ];
  return `钱账分离:同一账号不能同时持有采购单据/审批权限与付款执行权限(冲突角色:${codes.join("、")})`;
}
