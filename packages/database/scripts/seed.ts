/**
 * 锦程 ERP 初始化数据脚本（幂等，可重复执行）。
 *
 * 初始化内容：
 * 1. 权限码（基于 docs/11-角色权限矩阵.md 首批动作矩阵的暂定映射）
 * 2. 首批角色（系统管理员/老板/店长/库管/财务/销售/人事/运营）
 * 3. 默认组织（锦程科技）
 * 4. 默认门店（总部）+ 默认仓库（总部仓 HQ-WH / 公司总仓 HQ-COMPANY，
 *    仅空环境创建；已有仓库——含管家婆期初导入——则跳过）
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
  // 付款执行独立于单据操作:钱账分离(2026-08-12 业务确认财务/出纳分设)
  { code: "procurement:pay", resource: "procurement", action: "pay" },
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
  // 角色管理(创建/配权/停用自定义角色):仅系统管理员(2026-08-13 权限管理台)
  { code: "role:write", resource: "role", action: "write" },
  { code: "audit:read", resource: "audit", action: "read" },
];

interface RoleDefinition {
  code: string;
  name: string;
  /** 允许的权限码集合；ADMIN 特殊处理为全部 */
  permissions: string[] | "ALL";
}

/**
 * 首批角色矩阵(2026-08-12 业务确认核心五岗:管理员/财务/出纳/库管/人事;
 * 店长/销售/老板/运营保留供门店端上线使用)。
 * 钱账分离:财务管账与审核(procurement:write + finance:write),
 * 出纳执行付款(procurement:pay),两者不互相兼有。
 */
const ROLES: RoleDefinition[] = [
  { code: "ADMIN", name: "系统管理员", permissions: "ALL" },
  { code: "BOSS", name: "老板", permissions: ["catalog:read", "inventory:read", "transfer:read", "procurement:read", "sales:read", "customer:read", "finance:read", "report:read", "organization:read"] },
  { code: "STORE_MANAGER", name: "店长", permissions: ["catalog:read", "inventory:read", "inventory:write", "transfer:read", "transfer:write", "procurement:read", "sales:read", "sales:write", "customer:read", "customer:write", "report:read", "organization:read"] },
  { code: "WAREHOUSE_KEEPER", name: "库管", permissions: ["catalog:read", "inventory:read", "inventory:write", "transfer:read", "transfer:write", "procurement:read", "procurement:write"] },
  { code: "FINANCE", name: "财务", permissions: ["catalog:read", "inventory:read", "transfer:read", "procurement:read", "procurement:write", "sales:read", "customer:read", "finance:read", "finance:write", "report:read", "audit:read"] },
  { code: "CASHIER", name: "出纳", permissions: ["catalog:read", "inventory:read", "procurement:read", "procurement:pay", "finance:read", "report:read"] },
  { code: "SALES", name: "销售", permissions: ["catalog:read", "inventory:read", "transfer:read", "sales:read", "sales:write", "customer:read", "customer:write"] },
  { code: "HR", name: "人事", permissions: ["organization:read", "organization:write", "account:write", "role:read", "report:read"] },
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
  // 角色权限以本文件定义为权威来源:已存在的角色同步权限(删除重建关联),
  // 避免矩阵调整(如 2026-08-12 新增出纳/钱账分离)无法落库。
  // isSystem=true:内置角色在权限管理台锁定(不可改/不可停用),自定义角色不受影响。
  for (const role of ROLES) {
    const existing = await database.role.findUnique({
      where: { code: role.code },
      select: { id: true, isSystem: true },
    });
    const roleId = existing?.id ?? randomUUID();
    if (!existing) {
      await database.role.create({
        data: { id: roleId, code: role.code, name: role.name, isSystem: true },
      });
    } else if (!existing.isSystem) {
      await database.role.update({
        where: { id: roleId },
        data: { isSystem: true },
      });
    }
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
    await database.$transaction([
      database.rolePermission.deleteMany({ where: { roleId } }),
      database.rolePermission.createMany({ data: linkData }),
    ]);
    console.log(
      `[seed] ${existing ? "同步角色" : "创建角色"} ${role.code}（${linkData.length} 项权限）`,
    );
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

  // 3.1 默认仓库：仅在还没有任何仓库的空环境创建（已有仓库——
  // 含管家婆期初导入的库——则跳过，避免在生产数据上重复插入）。
  // 没有仓库就无法采购收货/调拨/盘点，空库 seed 后必须可直接开单。
  const warehouseCount = await database.warehouse.count();
  if (warehouseCount === 0) {
    await database.warehouse.createMany({
      data: [
        {
          id: randomUUID(),
          code: `${DEFAULT_STORE_CODE}-WH`,
          name: `${DEFAULT_STORE_NAME}仓`,
          type: "STORE",
          storeId: store.id,
        },
        {
          id: randomUUID(),
          code: `${DEFAULT_STORE_CODE}-COMPANY`,
          name: "公司总仓",
          type: "COMPANY",
        },
      ],
    });
    console.log(
      `[seed] 创建默认仓库「${DEFAULT_STORE_NAME}仓」(门店仓)与「公司总仓」`,
    );
  } else {
    console.log(`[seed] 已存在 ${warehouseCount} 个仓库，跳过默认仓创建`);
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
          // 种子密码是公开值,首次登录必须修改
          mustChangePassword: true,
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
