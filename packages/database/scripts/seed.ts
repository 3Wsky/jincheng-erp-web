/**
 * 锦程 ERP 初始化数据脚本（幂等，可重复执行）。
 *
 * 初始化内容：
 * 1. 权限码（基于 docs/11-角色权限矩阵.md 首批动作矩阵的暂定映射）
 * 2. 首批角色（系统管理员/老板/店长/库管/财务/销售/人事/运营）
 * 3. 默认组织（锦程科技）
 * 4. 默认门店（总部）
 * 5. 默认管理员账号（admin / 首次登录后必须改密）
 *
 * 运行：pnpm db:seed
 */
import { createPrismaClient, hashPassword } from "../src/index.js";
import { randomUUID } from "node:crypto";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://jincheng_erp:change_me@localhost:5432/jincheng_erp";

/** 权限码：resource:action。与 docs/11 首批动作矩阵对应（暂定）。 */
const PERMISSIONS: Array<{ code: string; resource: string; action: string }> = [
  { code: "catalog:read", resource: "catalog", action: "read" },
  { code: "catalog:write", resource: "catalog", action: "write" },
  { code: "inventory:read", resource: "inventory", action: "read" },
  { code: "inventory:write", resource: "inventory", action: "write" },
  { code: "transfer:read", resource: "transfer", action: "read" },
  { code: "transfer:write", resource: "transfer", action: "write" },
  { code: "procurement:read", resource: "procurement", action: "read" },
  { code: "procurement:write", resource: "procurement", action: "write" },
  { code: "sales:read", resource: "sales", action: "read" },
  { code: "sales:write", resource: "sales", action: "write" },
  { code: "customer:read", resource: "customer", action: "read" },
  { code: "customer:write", resource: "customer", action: "write" },
  { code: "finance:read", resource: "finance", action: "read" },
  { code: "finance:write", resource: "finance", action: "write" },
  { code: "report:read", resource: "report", action: "read" },
  { code: "organization:read", resource: "organization", action: "read" },
  { code: "organization:write", resource: "organization", action: "write" },
  { code: "account:write", resource: "account", action: "write" },
  { code: "role:read", resource: "role", action: "read" },
  { code: "audit:read", resource: "audit", action: "read" },
];

interface RoleDefinition {
  code: string;
  name: string;
  /** 允许的权限码集合；ADMIN 特殊处理为全部 */
  permissions: string[] | "ALL";
}

const ROLES: RoleDefinition[] = [
  { code: "ADMIN", name: "系统管理员", permissions: "ALL" },
  { code: "BOSS", name: "老板", permissions: ["catalog:read", "inventory:read", "transfer:read", "procurement:read", "sales:read", "customer:read", "finance:read", "report:read", "organization:read"] },
  { code: "STORE_MANAGER", name: "店长", permissions: ["catalog:read", "inventory:read", "inventory:write", "transfer:read", "transfer:write", "procurement:read", "sales:read", "sales:write", "customer:read", "customer:write", "report:read", "organization:read"] },
  { code: "WAREHOUSE_KEEPER", name: "库管", permissions: ["catalog:read", "inventory:read", "inventory:write", "transfer:read", "transfer:write", "procurement:read", "procurement:write"] },
  { code: "FINANCE", name: "财务", permissions: ["catalog:read", "inventory:read", "transfer:read", "procurement:read", "procurement:write", "sales:read", "finance:read", "finance:write", "report:read"] },
  { code: "SALES", name: "销售", permissions: ["catalog:read", "inventory:read", "transfer:read", "sales:read", "sales:write", "customer:read", "customer:write"] },
  { code: "HR", name: "人事", permissions: ["organization:read", "organization:write", "report:read"] },
  { code: "OPERATOR", name: "运营", permissions: ["catalog:read", "customer:read", "report:read"] },
];

const DEFAULT_ORGANIZATION_NAME = "锦程科技";
const DEFAULT_STORE_CODE = "HQ";
const DEFAULT_STORE_NAME = "总部";
const DEFAULT_ADMIN_USERNAME = "admin";
/** 首次登录必须修改：admin / JinCheng@2026 */
const DEFAULT_ADMIN_PASSWORD = "JinCheng@2026";
const DEFAULT_ADMIN_EMPLOYEE_NO = "E0001";
const DEFAULT_ADMIN_NAME = "系统管理员";

async function main(): Promise<void> {
  const database = createPrismaClient(connectionString);
  await database.$connect();
  console.log("[seed] 已连接数据库");

  // 1. 权限码（存在则跳过）
  const existingPermissionCodes = new Set(
    (await database.permission.findMany({ select: { code: true } })).map(
      (item) => item.code,
    ),
  );
  const permissionCreate = PERMISSIONS.filter(
    (item) => !existingPermissionCodes.has(item.code),
  );
  if (permissionCreate.length > 0) {
    await database.permission.createMany({
      data: permissionCreate.map((item) => ({ id: randomUUID(), ...item })),
    });
    console.log(`[seed] 新增权限码 ${permissionCreate.length} 个`);
  } else {
    console.log("[seed] 权限码已存在，跳过");
  }

  // 2. 角色与角色-权限关联
  const allPermissions = await database.permission.findMany({
    select: { id: true, code: true },
  });
  const permissionIdByCode = new Map(
    allPermissions.map((item) => [item.code, item.id]),
  );
  for (const role of ROLES) {
    const existing = await database.role.findUnique({
      where: { code: role.code },
      include: { permissions: { select: { permissionId: true } } },
    });
    if (existing) {
      console.log(`[seed] 角色 ${role.code} 已存在，跳过`);
      continue;
    }
    const roleId = randomUUID();
    await database.role.create({
      data: { id: roleId, code: role.code, name: role.name },
    });
    const allowedCodes =
      role.permissions === "ALL"
        ? PERMISSIONS.map((item) => item.code)
        : role.permissions;
    const linkData = allowedCodes
      .map((code) => {
        const permissionId = permissionIdByCode.get(code);
        return permissionId ? { roleId, permissionId } : null;
      })
      .filter((item): item is { roleId: string; permissionId: string } => item !== null);
    if (linkData.length > 0) {
      await database.rolePermission.createMany({ data: linkData });
    }
    console.log(`[seed] 创建角色 ${role.code}（${linkData.length} 项权限）`);
  }

  // 3. 默认组织与门店
  let organization = await database.organization.findFirst({
    where: { name: DEFAULT_ORGANIZATION_NAME },
  });
  if (!organization) {
    organization = await database.organization.create({
      data: { id: randomUUID(), name: DEFAULT_ORGANIZATION_NAME },
    });
    console.log(`[seed] 创建默认组织「${DEFAULT_ORGANIZATION_NAME}」`);
  }

  let store = await database.store.findFirst({
    where: { organizationId: organization.id, code: DEFAULT_STORE_CODE },
  });
  if (!store) {
    store = await database.store.create({
      data: {
        id: randomUUID(),
        organizationId: organization.id,
        code: DEFAULT_STORE_CODE,
        name: DEFAULT_STORE_NAME,
      },
    });
    console.log(`[seed] 创建默认门店「${DEFAULT_STORE_NAME}」`);
  }

  // 4. 默认管理员
  const adminRole = await database.role.findUnique({
    where: { code: "ADMIN" },
  });
  if (!adminRole) {
    throw new Error("初始化失败：缺少 ADMIN 角色");
  }
  const existingAdmin = await database.userAccount.findUnique({
    where: { username: DEFAULT_ADMIN_USERNAME },
  });
  if (!existingAdmin) {
    const passwordHash = await hashPassword(DEFAULT_ADMIN_PASSWORD);
    const employeeId = randomUUID();
    const accountId = randomUUID();
    await database.$transaction([
      database.employee.create({
        data: {
          id: employeeId,
          organizationId: organization.id,
          storeId: store.id,
          employeeNo: DEFAULT_ADMIN_EMPLOYEE_NO,
          name: DEFAULT_ADMIN_NAME,
          status: "ACTIVE",
        },
      }),
      database.userAccount.create({
        data: {
          id: accountId,
          employeeId,
          username: DEFAULT_ADMIN_USERNAME,
          passwordHash,
        },
      }),
      database.userRole.create({
        data: { userId: accountId, roleId: adminRole.id, dataScope: "ORGANIZATION" },
      }),
    ]);
    console.log(
      `[seed] 创建管理员账号 admin（初始密码 ${DEFAULT_ADMIN_PASSWORD}，首次登录后必须修改）`,
    );
  } else {
    console.log("[seed] 管理员账号已存在，跳过");
  }

  await database.$disconnect();
  console.log("[seed] 初始化完成");
}

main().catch(async (error) => {
  console.error("[seed] 初始化失败：", error);
  process.exitCode = 1;
});
