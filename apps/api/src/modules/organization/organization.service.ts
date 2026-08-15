import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { hashPassword, Prisma } from "@jincheng/database";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import {
  CreateAccountDto,
  CreateEmployeeDto,
  CreateOrganizationDto,
  CreateRoleDto,
  CreateStoreDto,
  ListEmployeesQueryDto,
  UpdateAccountDto,
  UpdateEmployeeDto,
  UpdateOrganizationDto,
  UpdateRoleDto,
  UpdateStoreDto,
} from "./organization.dto.js";

const employeeInclude = {
  store: { select: { id: true, name: true } },
  account: { select: { id: true, username: true, isFrozen: true } },
} satisfies Prisma.EmployeeInclude;

type EmployeeRecord = Prisma.EmployeeGetPayload<{
  include: typeof employeeInclude;
}>;

/** 内置角色编码:不可通过管理台创建同名自定义角色(seed 权威) */
const SYSTEM_ROLE_CODES = [
  "ADMIN",
  "BOSS",
  "STORE_MANAGER",
  "WAREHOUSE_KEEPER",
  "FINANCE",
  "CASHIER",
  "SALES",
  "HR",
  "OPERATOR",
];

/** 仅内置管理员可持有:自定义角色勾选后会形成权限管理越权 */
const PRIVILEGED_PERMISSION_CODES = ["role:write"];

@Injectable()
export class OrganizationService {
  constructor(private readonly database: DatabaseService) {}

  // ---------- 组织 ----------

  async listOrganizations() {
    const items = await this.database.client.organization.findMany({
      orderBy: { createdAt: "asc" },
    });
    return { items, total: items.length };
  }

  async createOrganization(input: CreateOrganizationDto, request: AuthenticatedRequest) {
    const name = input.name.trim();
    const id = randomUUID();
    await this.database.client.$transaction([
      this.database.client.organization.create({
        data: { id, name },
      }),
      this.database.client.auditLog.create({
        data: {
          actorUserId: request.user.userId,
          action: "organization.create",
          resource: "organization",
          resourceId: id,
          requestId: request.requestId,
          afterData: { name },
        },
      }),
    ]);
    return this.database.client.organization.findUniqueOrThrow({ where: { id } });
  }

  async updateOrganization(
    id: string,
    input: UpdateOrganizationDto,
    request: AuthenticatedRequest,
  ) {
    const before = await this.database.client.organization.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("组织不存在");
    const name = input.name.trim();
    await this.database.client.$transaction([
      this.database.client.organization.update({
        where: { id },
        data: { name },
      }),
      this.database.client.auditLog.create({
        data: {
          actorUserId: request.user.userId,
          action: "organization.update",
          resource: "organization",
          resourceId: id,
          requestId: request.requestId,
          beforeData: { name: before.name },
          afterData: { name },
        },
      }),
    ]);
    return this.database.client.organization.findUniqueOrThrow({ where: { id } });
  }

  // ---------- 门店 ----------

  async listStores(organizationId: string) {
    const organization = await this.database.client.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!organization) throw new NotFoundException("组织不存在");
    const items = await this.database.client.store.findMany({
      where: { organizationId },
      orderBy: [{ code: "asc" }],
    });
    return { items, total: items.length };
  }

  async createStore(input: CreateStoreDto, request: AuthenticatedRequest) {
    const organization = await this.database.client.organization.findUnique({
      where: { id: input.organizationId },
      select: { id: true },
    });
    if (!organization) throw new NotFoundException("组织不存在");
    const code = input.code.trim();
    const name = input.name.trim();
    const id = randomUUID();
    try {
      await this.database.client.$transaction([
        this.database.client.store.create({
          data: { id, organizationId: input.organizationId, code, name },
        }),
        this.database.client.auditLog.create({
          data: {
            actorUserId: request.user.userId,
            action: "store.create",
            resource: "store",
            resourceId: id,
            requestId: request.requestId,
            afterData: { organizationId: input.organizationId, code, name },
          },
        }),
      ]);
    } catch (error) {
      throwKnownConflict(error, "该门店编码在当前组织下已存在");
    }
    return this.database.client.store.findUniqueOrThrow({ where: { id } });
  }

  async updateStore(id: string, input: UpdateStoreDto, request: AuthenticatedRequest) {
    const before = await this.database.client.store.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("门店不存在");
    const data: Prisma.StoreUpdateInput = {};
    if (input.code !== undefined) data.code = input.code.trim();
    if (input.name !== undefined) data.name = input.name.trim();
    await this.database.client.$transaction([
      this.database.client.store.update({ where: { id }, data }),
      this.database.client.auditLog.create({
        data: {
          actorUserId: request.user.userId,
          action: "store.update",
          resource: "store",
          resourceId: id,
          requestId: request.requestId,
          beforeData: { code: before.code, name: before.name },
          afterData: { code: data.code ?? before.code, name: data.name ?? before.name },
        },
      }),
    ]);
    return this.database.client.store.findUniqueOrThrow({ where: { id } });
  }

  /**
   * 从门店类仓库同步门店主数据（幂等可重跑）：
   * - 只处理 type=STORE 的仓库；总仓/售后/异常不是门店，个人仓归属员工，均跳过；
   * - 仓库已关联门店的跳过；同编码门店已存在则只补关联，不重复创建；
   * - 汇总结果写入一条审计日志（含操作人与新建清单）。
   */
  async syncStoresFromWarehouses(
    organizationId: string,
    request: AuthenticatedRequest,
  ) {
    const organization = await this.database.client.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!organization) throw new NotFoundException("组织不存在");

    const warehouses = await this.database.client.warehouse.findMany({
      where: { type: "STORE" },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, storeId: true },
    });

    let storesCreated = 0;
    let warehousesLinked = 0;
    let alreadyLinked = 0;
    const createdNames: string[] = [];

    await this.database.client.$transaction(
      async (tx) => {
        for (const warehouse of warehouses) {
          if (warehouse.storeId) {
            alreadyLinked += 1;
            continue;
          }
          let store = await tx.store.findUnique({
            where: {
              organizationId_code: {
                organizationId,
                code: warehouse.code,
              },
            },
            select: { id: true },
          });
          if (!store) {
            store = await tx.store.create({
              data: {
                id: randomUUID(),
                organizationId,
                code: warehouse.code,
                name: warehouse.name,
              },
              select: { id: true },
            });
            storesCreated += 1;
            createdNames.push(warehouse.name);
          }
          await tx.warehouse.update({
            where: { id: warehouse.id },
            data: { storeId: store.id },
          });
          warehousesLinked += 1;
        }
        await tx.auditLog.create({
          data: {
            actorUserId: request.user.userId,
            action: "store.sync_from_warehouses",
            resource: "store",
            resourceId: organizationId,
            requestId: request.requestId,
            afterData: {
              storeWarehouses: warehouses.length,
              storesCreated,
              warehousesLinked,
              alreadyLinked,
              createdNames,
            },
          },
        });
      },
      { timeout: 30_000 },
    );

    return {
      storeWarehouses: warehouses.length,
      storesCreated,
      warehousesLinked,
      alreadyLinked,
    };
  }

  // ---------- 员工 ----------

  async listEmployees(organizationId: string, query: ListEmployeesQueryDto) {
    const organization = await this.database.client.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!organization) throw new NotFoundException("组织不存在");

    const page = Math.max(1, query.page);
    const pageSize = Math.min(100, Math.max(1, query.pageSize));
    const search = query.search?.trim();
    const where: Prisma.EmployeeWhereInput = {
      organizationId,
      status: query.status,
      storeId: query.storeId,
      ...(search
        ? {
            OR: [
              { employeeNo: { contains: search, mode: "insensitive" } },
              { name: { contains: search, mode: "insensitive" } },
              { mobile: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.database.client.$transaction([
      this.database.client.employee.findMany({
        where,
        include: employeeInclude,
        orderBy: [{ employeeNo: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.database.client.employee.count({ where }),
    ]);
    return {
      items: items.map(mapEmployee),
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    };
  }

  async createEmployee(input: CreateEmployeeDto, request: AuthenticatedRequest) {
    const organization = await this.database.client.organization.findUnique({
      where: { id: input.organizationId },
      select: { id: true },
    });
    if (!organization) throw new NotFoundException("组织不存在");
    if (input.storeId) {
      const store = await this.database.client.store.findUnique({
        where: { id: input.storeId },
        select: { id: true, organizationId: true },
      });
      if (!store) throw new NotFoundException("门店不存在");
      if (store.organizationId !== input.organizationId) {
        throw new BadRequestException("门店不属于该组织，无法归属员工");
      }
    }
    const employeeNo = input.employeeNo.trim();
    const name = input.name.trim();
    const mobile = input.mobile?.trim() || null;
    const id = randomUUID();
    try {
      await this.database.client.$transaction([
        this.database.client.employee.create({
          data: {
            id,
            organizationId: input.organizationId,
            storeId: input.storeId ?? null,
            employeeNo,
            name,
            mobile,
            status: input.status ?? "ACTIVE",
          },
        }),
        this.database.client.auditLog.create({
          data: {
            actorUserId: request.user.userId,
            action: "employee.create",
            resource: "employee",
            resourceId: id,
            requestId: request.requestId,
            afterData: {
              organizationId: input.organizationId,
              storeId: input.storeId ?? null,
              employeeNo,
              name,
              mobile,
            },
          },
        }),
      ]);
    } catch (error) {
      throwKnownConflict(error, "该员工编号在当前组织下已存在");
    }
    return this.database.client.employee.findUniqueOrThrow({
      where: { id },
      include: employeeInclude,
    });
  }

  async updateEmployee(id: string, input: UpdateEmployeeDto, request: AuthenticatedRequest) {
    const before = await this.database.client.employee.findUnique({
      where: { id },
      include: employeeInclude,
    });
    if (!before) throw new NotFoundException("员工不存在");
    if (input.storeId) {
      const store = await this.database.client.store.findUnique({
        where: { id: input.storeId },
        select: { id: true, organizationId: true },
      });
      if (!store) throw new NotFoundException("门店不存在");
      if (store.organizationId !== before.organizationId) {
        throw new BadRequestException("门店不属于该员工所在组织，无法归属");
      }
    }
    const data: Prisma.EmployeeUpdateInput = {};
    if (input.storeId !== undefined) {
      data.store = input.storeId
        ? { connect: { id: input.storeId } }
        : { disconnect: true };
    }
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.mobile !== undefined) data.mobile = input.mobile?.trim() || null;
    if (input.status !== undefined) data.status = input.status;

    await this.database.client.$transaction([
      this.database.client.employee.update({ where: { id }, data }),
      this.database.client.auditLog.create({
        data: {
          actorUserId: request.user.userId,
          action: "employee.update",
          resource: "employee",
          resourceId: id,
          requestId: request.requestId,
          beforeData: {
            storeId: before.storeId,
            name: before.name,
            mobile: before.mobile,
            status: before.status,
          },
          afterData: {
            storeId: input.storeId !== undefined ? input.storeId : before.storeId,
            name: input.name !== undefined ? input.name.trim() : before.name,
            mobile:
              input.mobile !== undefined
                ? (input.mobile?.trim() || null)
                : before.mobile,
            status: input.status ?? before.status,
          },
        },
      }),
    ]);
    return this.database.client.employee.findUniqueOrThrow({
      where: { id },
      include: employeeInclude,
    });
  }

  // ---------- 账号 ----------

  async createAccount(input: CreateAccountDto, request: AuthenticatedRequest) {
    const employee = await this.database.client.employee.findUnique({
      where: { id: input.employeeId },
      select: { id: true, organizationId: true, name: true, status: true },
    });
    if (!employee) throw new NotFoundException("员工不存在");
    if (employee.status === "INACTIVE") {
      throw new BadRequestException("已离职或停用的员工不能开通账号");
    }
    const existing = await this.database.client.userAccount.findUnique({
      where: { employeeId: input.employeeId },
      select: { id: true },
    });
    if (existing) throw new ConflictException("该员工已有登录账号");

    await this.assertAssignableRoles(input.roleIds, request);

    const username = input.username.trim();
    const usernameTaken = await this.database.client.userAccount.findUnique({
      where: { username },
      select: { id: true },
    });
    if (usernameTaken) throw new ConflictException("该登录名已被其他账号使用");

    const passwordHash = await hashPassword(input.password);
    const id = randomUUID();
    try {
      await this.database.client.$transaction([
        this.database.client.userAccount.create({
          data: {
            id,
            employeeId: input.employeeId,
            username,
            passwordHash,
            // 新开账号首次登录必须改密(初始密码由管理员告知,不能长期使用)
            mustChangePassword: true,
            roles: {
              create: input.roleIds.map((roleId) => ({
                roleId,
                dataScope: "PERSONAL",
              })),
            },
          },
        }),
        this.database.client.auditLog.create({
          data: {
            actorUserId: request.user.userId,
            action: "account.create",
            resource: "user_account",
            resourceId: id,
            requestId: request.requestId,
            afterData: {
              employeeId: input.employeeId,
              username,
              roleIds: input.roleIds,
            },
          },
        }),
      ]);
    } catch (error) {
      throwKnownConflict(error, "登录名已存在");
    }
    return { id, username, employeeId: input.employeeId };
  }

  async updateAccount(id: string, input: UpdateAccountDto, request: AuthenticatedRequest) {
    const account = await this.database.client.userAccount.findUnique({
      where: { id },
      select: { id: true, username: true, isFrozen: true },
    });
    if (!account) throw new NotFoundException("账号不存在");
    // 防锁死:冻结/改角色前确保系统仍有可用管理员(2026-08-13)
    await this.assertNotLastAdmin(id, input);

    const data: Prisma.UserAccountUpdateInput = {};
    if (input.isFrozen !== undefined) data.isFrozen = input.isFrozen;
    if (input.password !== undefined) {
      data.passwordHash = await hashPassword(input.password);
      // 管理员重置密码:吊销旧令牌(passwordChangedAt),并要求用户首登改密
      data.passwordChangedAt = new Date();
      data.mustChangePassword = true;
    }
    if (input.roleIds !== undefined) {
      await this.assertAssignableRoles(input.roleIds, request);
    }

    await this.database.client.$transaction([
      this.database.client.userAccount.update({
        where: { id },
        data: {
          ...data,
          ...(input.roleIds !== undefined
            ? {
                roles: {
                  deleteMany: {},
                  create: input.roleIds.map((roleId) => ({
                    roleId,
                    dataScope: "PERSONAL",
                  })),
                },
              }
            : {}),
        },
      }),
      this.database.client.auditLog.create({
        data: {
          actorUserId: request.user.userId,
          action: "account.update",
          resource: "user_account",
          resourceId: id,
          requestId: request.requestId,
          beforeData: { username: account.username, isFrozen: account.isFrozen },
          afterData: {
            isFrozen: input.isFrozen ?? account.isFrozen,
            passwordChanged: input.password !== undefined,
            roleIdsChanged: input.roleIds !== undefined,
          },
        },
      }),
    ]);
    return this.database.client.userAccount.findUnique({
      where: { id },
      select: { id: true, username: true, isFrozen: true, employeeId: true },
    });
  }

  // ---------- 角色与权限 ----------

  async listRoles() {
    const roles = await this.database.client.role.findMany({
      orderBy: [{ isSystem: "desc" }, { code: "asc" }],
      include: {
        permissions: {
          include: { permission: { select: { code: true } } },
        },
        _count: { select: { users: true } },
      },
    });
    const items = roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      isSystem: role.isSystem,
      archivedAt: role.archivedAt,
      accountCount: role._count.users,
      permissions: role.permissions
        .map((item) => item.permission.code)
        .sort(),
    }));
    return { items, total: items.length };
  }

  async listPermissions() {
    const items = await this.database.client.permission.findMany({
      orderBy: [{ resource: "asc" }, { action: "asc" }],
    });
    return { items, total: items.length };
  }

  /**
   * 创建自定义角色(role:write,仅管理员):isSystem=false,可在管理台配权/停用。
   * 内置角色由 seed 权威管理(防误改破坏钱账分离等已确认规则),不走本接口。
   */
  async createRole(input: CreateRoleDto, request: AuthenticatedRequest) {
    const code = input.code.trim();
    if (SYSTEM_ROLE_CODES.includes(code)) {
      throw new UnprocessableEntityException(
        `「${code}」是内置角色编码,由种子脚本权威管理,请换一个编码`,
      );
    }
    await this.assertPermissionIds(input.permissionIds);
    await this.assertNoPrivilegedPermissions(input.permissionIds);
    const id = randomUUID();
    try {
      await this.database.client.$transaction([
        this.database.client.role.create({
          data: {
            id,
            code: input.code.trim(),
            name: input.name.trim(),
            isSystem: false,
            permissions: {
              create: input.permissionIds.map((permissionId) => ({
                permissionId,
              })),
            },
          },
        }),
        this.database.client.auditLog.create({
          data: {
            actorUserId: request.user.userId,
            action: "role.create",
            resource: "role",
            resourceId: id,
            requestId: request.requestId,
            afterData: {
              code: input.code.trim(),
              name: input.name.trim(),
              permissionCount: input.permissionIds.length,
            },
          },
        }),
      ]);
    } catch (error) {
      throwKnownConflict(error, "角色编码已存在");
    }
    return this.roleDetail(id);
  }

  /** 更新自定义角色(名称/权限);内置角色与已停用角色拒绝修改 */
  async updateRole(
    id: string,
    input: UpdateRoleDto,
    request: AuthenticatedRequest,
  ) {
    const role = await this.loadEditableRole(id);
    if (input.permissionIds !== undefined) {
      await this.assertPermissionIds(input.permissionIds);
      await this.assertNoPrivilegedPermissions(input.permissionIds);
    }

    const beforeCodes = role.permissions.map((item) => item.permission.code).sort();
    await this.database.client.$transaction([
      this.database.client.role.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.permissionIds !== undefined
            ? {
                permissions: {
                  deleteMany: {},
                  create: input.permissionIds.map((permissionId) => ({
                    permissionId,
                  })),
                },
              }
            : {}),
        },
      }),
      this.database.client.auditLog.create({
        data: {
          actorUserId: request.user.userId,
          action: "role.update",
          resource: "role",
          resourceId: id,
          requestId: request.requestId,
          beforeData: { name: role.name, permissions: beforeCodes },
          afterData: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.permissionIds !== undefined
              ? { permissionCount: input.permissionIds.length }
              : {}),
          },
        },
      }),
    ]);
    return this.roleDetail(id);
  }

  /**
   * 停用自定义角色(软删,不物理删除):有账号挂载时拒绝,
   * 需先在账号管理里移除该角色。已登录账号的令牌权限在下次请求时按库重新校验。
   */
  async archiveRole(id: string, request: AuthenticatedRequest) {
    const role = await this.loadEditableRole(id);
    const accountCount = await this.database.client.userRole.count({
      where: { roleId: id },
    });
    if (accountCount > 0) {
      throw new UnprocessableEntityException(
        `该角色仍有 ${accountCount} 个账号挂载,请先在账号管理中移除后再停用`,
      );
    }
    const archivedAt = new Date();
    await this.database.client.$transaction([
      this.database.client.role.update({
        where: { id },
        data: { archivedAt },
      }),
      this.database.client.auditLog.create({
        data: {
          actorUserId: request.user.userId,
          action: "role.archive",
          resource: "role",
          resourceId: id,
          requestId: request.requestId,
          beforeData: { code: role.code, archivedAt: null },
          afterData: { archivedAt: archivedAt.toISOString() },
        },
      }),
    ]);
    return this.roleDetail(id);
  }

  /** 恢复已停用的自定义角色 */
  async restoreRole(id: string, request: AuthenticatedRequest) {
    const role = await this.database.client.role.findUnique({
      where: { id },
      select: { id: true, code: true, isSystem: true, archivedAt: true },
    });
    if (!role) throw new NotFoundException("角色不存在");
    if (role.isSystem) {
      throw new UnprocessableEntityException("内置角色由种子脚本权威管理,不可在管理台操作");
    }
    if (!role.archivedAt) {
      throw new UnprocessableEntityException("角色未停用,无需恢复");
    }
    await this.database.client.$transaction([
      this.database.client.role.update({
        where: { id },
        data: { archivedAt: null },
      }),
      this.database.client.auditLog.create({
        data: {
          actorUserId: request.user.userId,
          action: "role.restore",
          resource: "role",
          resourceId: id,
          requestId: request.requestId,
          beforeData: { code: role.code, archivedAt: role.archivedAt.toISOString() },
          afterData: { archivedAt: null },
        },
      }),
    ]);
    return this.roleDetail(id);
  }

  /** 单角色返回(与 listRoles 条目同构) */
  private async roleDetail(id: string) {
    const role = await this.database.client.role.findUnique({
      where: { id },
      include: {
        permissions: { include: { permission: { select: { code: true } } } },
        _count: { select: { users: true } },
      },
    });
    if (!role) throw new NotFoundException("角色不存在");
    return {
      id: role.id,
      code: role.code,
      name: role.name,
      isSystem: role.isSystem,
      archivedAt: role.archivedAt,
      accountCount: role._count.users,
      permissions: role.permissions.map((item) => item.permission.code).sort(),
    };
  }

  /** 加载可编辑角色:不存在 404;内置或已停用 422 */
  private async loadEditableRole(id: string) {
    const role = await this.database.client.role.findUnique({
      where: { id },
      include: {
        permissions: { include: { permission: { select: { code: true } } } },
      },
    });
    if (!role) throw new NotFoundException("角色不存在");
    if (role.isSystem) {
      throw new UnprocessableEntityException(
        "内置角色由种子脚本权威管理,不可在管理台修改(防止破坏钱账分离等已确认规则)",
      );
    }
    if (role.archivedAt) {
      throw new UnprocessableEntityException("角色已停用,请先恢复后再修改");
    }
    return role;
  }

  /**
   * 开账号/改角色时校验:角色必须存在且未停用;
   * 系统管理员角色仅持有 role:write 的人(内置 ADMIN)可授予,防人事越权提权。
   */
  private async assertAssignableRoles(
    roleIds: string[],
    request: AuthenticatedRequest,
  ) {
    const uniqueIds = [...new Set(roleIds)];
    const roles = await this.database.client.role.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, code: true, archivedAt: true },
    });
    if (roles.length !== uniqueIds.length) {
      throw new BadRequestException("部分角色不存在，请刷新后重试");
    }
    const archived = roles.filter((role) => role.archivedAt);
    if (archived.length > 0) {
      throw new UnprocessableEntityException(
        `已停用角色不能分配:${archived.map((role) => role.code).join("、")}`,
      );
    }
    const grantingAdmin = roles.some((role) => role.code === "ADMIN");
    if (grantingAdmin && !request.user.permissions.includes("role:write")) {
      throw new UnprocessableEntityException(
        "只有系统管理员可以分配「系统管理员」角色",
      );
    }
  }

  /** 自定义角色禁止持有角色管理权,避免自建角色接管权限管理台 */
  private async assertNoPrivilegedPermissions(permissionIds: string[]) {
    if (permissionIds.length === 0) return;
    const privileged = await this.database.client.permission.findMany({
      where: {
        id: { in: permissionIds },
        code: { in: PRIVILEGED_PERMISSION_CODES },
      },
      select: { code: true },
    });
    if (privileged.length > 0) {
      throw new UnprocessableEntityException(
        `自定义角色不能授予 ${privileged.map((item) => item.code).join("、")}(仅内置管理员持有)`,
      );
    }
  }

  /** 校验权限码 ID 均存在 */
  private async assertPermissionIds(permissionIds: string[]) {
    if (permissionIds.length === 0) return;
    const found = await this.database.client.permission.count({
      where: { id: { in: permissionIds } },
    });
    if (found !== new Set(permissionIds).size) {
      throw new BadRequestException("部分权限码不存在,请刷新后重试");
    }
  }

  /**
   * 防锁死校验(2026-08-13):禁止冻结最后一个可用管理员账号,
   * 或移除其 ADMIN 角色——避免系统再无人能进入权限管理。
   */
  private async assertNotLastAdmin(
    accountId: string,
    input: { isFrozen?: boolean; roleIds?: string[] },
  ) {
    const adminRole = await this.database.client.role.findUnique({
      where: { code: "ADMIN" },
      select: { id: true },
    });
    if (!adminRole) return;

    const targetHasAdmin = await this.database.client.userRole.findUnique({
      where: { userId_roleId: { userId: accountId, roleId: adminRole.id } },
      select: { userId: true },
    });
    if (!targetHasAdmin) return;

    const willFreeze = input.isFrozen === true;
    const willRemoveAdmin =
      input.roleIds !== undefined && !input.roleIds.includes(adminRole.id);
    if (!willFreeze && !willRemoveAdmin) return;

    const activeAdminCount = await this.database.client.userRole.count({
      where: { roleId: adminRole.id, user: { isFrozen: false } },
    });
    if (activeAdminCount <= 1) {
      throw new UnprocessableEntityException(
        "系统必须保留至少一个可用的管理员账号,不能冻结最后一个管理员或移除其管理员角色",
      );
    }
  }
}

function mapEmployee(record: EmployeeRecord) {
  return {
    id: record.id,
    organizationId: record.organizationId,
    storeId: record.storeId,
    employeeNo: record.employeeNo,
    name: record.name,
    mobile: record.mobile,
    status: record.status,
    account: record.account,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function throwKnownConflict(error: unknown, message: string): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new ConflictException(message);
  }
  throw error;
}
