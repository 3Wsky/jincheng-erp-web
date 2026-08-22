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
  CreateWarehouseDto,
  ListEmployeesQueryDto,
  UpdateAccountDto,
  UpdateEmployeeDto,
  UpdateOrganizationDto,
  UpdateRoleDto,
  UpdateStoreDto,
  UpdateWarehouseDto,
} from "./organization.dto.js";
import {
  dataScopeForRole,
  missingSalesAssignmentMessage,
  requiresSalesAssignment,
  SALES_ASSIGNABLE_WAREHOUSE_TYPES,
  type SalesRoleInput,
} from "./sales-assignment.js";
import {
  moneySeparationConflictMessage,
  permissionSetViolatesMoneySeparation,
} from "./role-boundaries.js";
import {
  personalOwnerConflictMessage,
  warehouseCreateViolation,
  warehouseUpdateViolation,
} from "./warehouse-rules.js";

const employeeInclude = {
  store: { select: { id: true, name: true } },
  account: {
    select: {
      id: true,
      username: true,
      isFrozen: true,
      roles: {
        select: {
          roleId: true,
          dataScope: true,
          scopeConfig: true,
        },
      },
    },
  },
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

  /**
   * 创建门店:默认同时创建配套门店仓(type=STORE,code={code}-WH,name={name}仓),
   * 让空环境建店后即可收货/调拨;createWarehouse=false 可只建门店。
   * 门店与门店仓同事务写入,任一编码冲突整笔失败(带明确提示)。
   */
  async createStore(input: CreateStoreDto, request: AuthenticatedRequest) {
    const organization = await this.database.client.organization.findUnique({
      where: { id: input.organizationId },
      select: { id: true },
    });
    if (!organization) throw new NotFoundException("组织不存在");
    const code = input.code.trim();
    const name = input.name.trim();
    const withWarehouse = input.createWarehouse ?? true;
    const warehouseCode = `${code}-WH`;
    const warehouseName = `${name}仓`;
    const id = randomUUID();
    const warehouseId = randomUUID();
    try {
      await this.database.client.$transaction([
        this.database.client.store.create({
          data: { id, organizationId: input.organizationId, code, name },
        }),
        ...(withWarehouse
          ? [
              this.database.client.warehouse.create({
                data: {
                  id: warehouseId,
                  code: warehouseCode,
                  name: warehouseName,
                  type: "STORE" as const,
                  storeId: id,
                },
              }),
              this.database.client.auditLog.create({
                data: {
                  actorUserId: request.user.userId,
                  action: "warehouse.create",
                  resource: "warehouse",
                  resourceId: warehouseId,
                  requestId: request.requestId,
                  afterData: {
                    organizationId: input.organizationId,
                    code: warehouseCode,
                    name: warehouseName,
                    type: "STORE",
                    storeId: id,
                    createdWithStore: true,
                  },
                },
              }),
            ]
          : []),
        this.database.client.auditLog.create({
          data: {
            actorUserId: request.user.userId,
            action: "store.create",
            resource: "store",
            resourceId: id,
            requestId: request.requestId,
            afterData: {
              organizationId: input.organizationId,
              code,
              name,
              warehouseCreated: withWarehouse,
            },
          },
        }),
      ]);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        // Store 唯一键含 organizationId,Warehouse 唯一键仅 code,据此区分冲突来源
        const target = String(error.meta?.target ?? "");
        if (withWarehouse && !target.includes("organizationId")) {
          throw new ConflictException(
            `门店仓编码「${warehouseCode}」已被占用,门店与门店仓均未创建;请换一个门店编码,或取消勾选「同时创建门店仓」`,
          );
        }
        throw new ConflictException("该门店编码在当前组织下已存在");
      }
      throw error;
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
   * 地点清单:返回全部仓库(含个人仓),供组织页按类型分组展示。
   * 仓库目前是公司级主数据,不按组织再切分;仍校验组织存在以免对空组织误操作。
   */
  async listWarehouses(organizationId: string) {
    const organization = await this.database.client.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!organization) throw new NotFoundException("组织不存在");

    const warehouses = await this.database.client.warehouse.findMany({
      include: {
        store: { select: { id: true, name: true } },
        _count: { select: { serials: true } },
      },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });
    const ownerIds = [
      ...new Set(
        warehouses
          .map((warehouse) => warehouse.ownerEmployeeId)
          .filter((id): id is string => id !== null),
      ),
    ];
    const owners =
      ownerIds.length > 0
        ? await this.database.client.employee.findMany({
            where: { id: { in: ownerIds } },
            select: { id: true, name: true },
          })
        : [];
    const ownerNameById = new Map(owners.map((owner) => [owner.id, owner.name]));
    const items = warehouses.map((warehouse) => ({
      id: warehouse.id,
      code: warehouse.code,
      name: warehouse.name,
      type: warehouse.type,
      storeId: warehouse.storeId,
      storeName: warehouse.store?.name ?? null,
      ownerEmployeeId: warehouse.ownerEmployeeId,
      ownerEmployeeName: warehouse.ownerEmployeeId
        ? (ownerNameById.get(warehouse.ownerEmployeeId) ?? null)
        : null,
      serialCount: warehouse._count.serials,
    }));
    return { items, total: items.length };
  }

  /**
   * 创建仓库(API-ORG-021,organization:write):
   * - STORE 须关联本组织门店;PERSONAL 须归属本组织员工且一人一仓;
   * - COMPANY/AFTER_SALES/ABNORMAL 不关联门店/员工;
   * - 编码公司范围唯一(冲突 409);同事务写审计 warehouse.create。
   */
  async createWarehouse(input: CreateWarehouseDto, request: AuthenticatedRequest) {
    const organization = await this.database.client.organization.findUnique({
      where: { id: input.organizationId },
      select: { id: true },
    });
    if (!organization) throw new NotFoundException("组织不存在");

    const violation = warehouseCreateViolation({
      type: input.type,
      storeId: input.storeId ?? null,
      ownerEmployeeId: input.ownerEmployeeId ?? null,
    });
    if (violation) throw new UnprocessableEntityException(violation);

    const storeId = input.type === "STORE" ? (input.storeId ?? null) : null;
    const ownerEmployeeId =
      input.type === "PERSONAL" ? (input.ownerEmployeeId ?? null) : null;

    if (storeId) {
      const store = await this.database.client.store.findUnique({
        where: { id: storeId },
        select: { id: true, organizationId: true },
      });
      if (!store) throw new NotFoundException("门店不存在");
      if (store.organizationId !== input.organizationId) {
        throw new BadRequestException("门店不属于该组织，无法关联仓库");
      }
    }

    if (ownerEmployeeId) {
      const employee = await this.database.client.employee.findUnique({
        where: { id: ownerEmployeeId },
        select: { id: true, organizationId: true, status: true },
      });
      if (!employee) throw new NotFoundException("员工不存在");
      if (employee.organizationId !== input.organizationId) {
        throw new BadRequestException("员工不属于该组织，无法归属个人仓");
      }
      if (employee.status === "INACTIVE") {
        throw new UnprocessableEntityException("已停用的员工不能新建个人仓");
      }
      // 一人一仓,与 sales-assignment 的"禁止抢占他人个人仓"同源
      const existingPersonal = await this.database.client.warehouse.findMany({
        where: { type: "PERSONAL", ownerEmployeeId },
        select: { name: true, ownerEmployeeId: true },
      });
      const conflict = personalOwnerConflictMessage(
        ownerEmployeeId,
        existingPersonal,
      );
      if (conflict) throw new UnprocessableEntityException(conflict);
    }

    const code = input.code.trim();
    const name = input.name.trim();
    const id = randomUUID();
    try {
      await this.database.client.$transaction([
        this.database.client.warehouse.create({
          data: {
            id,
            code,
            name,
            type: input.type,
            storeId,
            ownerEmployeeId,
          },
        }),
        this.database.client.auditLog.create({
          data: {
            actorUserId: request.user.userId,
            action: "warehouse.create",
            resource: "warehouse",
            resourceId: id,
            requestId: request.requestId,
            afterData: {
              organizationId: input.organizationId,
              code,
              name,
              type: input.type,
              storeId,
              ownerEmployeeId,
            },
          },
        }),
      ]);
    } catch (error) {
      throwKnownConflict(
        error,
        `仓库编码「${code}」已存在（仓库编码公司范围内唯一）`,
      );
    }
    return this.warehouseDetail(id);
  }

  /**
   * 修改仓库(API-ORG-022,organization:write):可改名;门店仓可换关联门店;
   * 归属员工不可改(避免抢占他人个人仓,调整走销售账号地点划分);禁止物理删除。
   */
  async updateWarehouse(
    id: string,
    input: UpdateWarehouseDto,
    request: AuthenticatedRequest,
  ) {
    const before = await this.database.client.warehouse.findUnique({
      where: { id },
      select: { id: true, name: true, type: true, storeId: true },
    });
    if (!before) throw new NotFoundException("仓库不存在");

    const changingStoreId =
      input.storeId !== undefined && input.storeId !== before.storeId;
    const violation = warehouseUpdateViolation({
      type: before.type,
      changingStoreId,
    });
    if (violation) throw new UnprocessableEntityException(violation);

    if (changingStoreId && input.storeId) {
      const store = await this.database.client.store.findUnique({
        where: { id: input.storeId },
        select: { id: true },
      });
      if (!store) throw new NotFoundException("门店不存在");
    }

    const data: Prisma.WarehouseUpdateInput = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (changingStoreId && input.storeId) {
      data.store = { connect: { id: input.storeId } };
    }

    await this.database.client.$transaction([
      this.database.client.warehouse.update({ where: { id }, data }),
      this.database.client.auditLog.create({
        data: {
          actorUserId: request.user.userId,
          action: "warehouse.update",
          resource: "warehouse",
          resourceId: id,
          requestId: request.requestId,
          beforeData: { name: before.name, storeId: before.storeId },
          afterData: {
            name: input.name !== undefined ? input.name.trim() : before.name,
            storeId: changingStoreId ? input.storeId : before.storeId,
          },
        },
      }),
    ]);
    return this.warehouseDetail(id);
  }

  /** 单仓库返回(与 listWarehouses 条目同构,OrgWarehouseSchema) */
  private async warehouseDetail(id: string) {
    const warehouse = await this.database.client.warehouse.findUnique({
      where: { id },
      include: {
        store: { select: { name: true } },
        _count: { select: { serials: true } },
      },
    });
    if (!warehouse) throw new NotFoundException("仓库不存在");
    const owner = warehouse.ownerEmployeeId
      ? await this.database.client.employee.findUnique({
          where: { id: warehouse.ownerEmployeeId },
          select: { name: true },
        })
      : null;
    return {
      id: warehouse.id,
      code: warehouse.code,
      name: warehouse.name,
      type: warehouse.type,
      storeId: warehouse.storeId,
      storeName: warehouse.store?.name ?? null,
      ownerEmployeeId: warehouse.ownerEmployeeId,
      ownerEmployeeName: owner?.name ?? null,
      serialCount: warehouse._count.serials,
    };
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
    const ownedByEmployee = await this.loadEmployeeWarehouses(items);
    return {
      items: items.map((item) =>
        mapEmployee(item, ownedByEmployee.get(item.id) ?? []),
      ),
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
      select: {
        id: true,
        organizationId: true,
        name: true,
        status: true,
        storeId: true,
      },
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

    const roles = await this.assertAssignableRoles(input.roleIds, request);
    const sales = requiresSalesAssignment(roles);
    const storeId = input.storeId ?? employee.storeId;
    const warehouseIds = input.warehouseIds ?? [];
    if (sales) {
      const missing = missingSalesAssignmentMessage({ storeId, warehouseIds });
      if (missing) throw new BadRequestException(missing);
    }

    const username = input.username.trim();
    const usernameTaken = await this.database.client.userAccount.findUnique({
      where: { username },
      select: { id: true },
    });
    if (usernameTaken) throw new ConflictException("该登录名已被其他账号使用");

    const passwordHash = await hashPassword(input.password);
    const id = randomUUID();
    try {
      await this.database.client.$transaction(async (tx) => {
        await tx.userAccount.create({
          data: {
            id,
            employeeId: input.employeeId,
            username,
            passwordHash,
            // 新开账号首次登录必须改密(初始密码由管理员告知,不能长期使用)
            mustChangePassword: true,
            roles: {
              create: roles.map((role) => ({
                roleId: role.id,
                dataScope: salesRoleDataScope(role),
                scopeConfig: salesRoleScopeConfig(role, storeId, warehouseIds),
              })),
            },
          },
        });
        if (sales && storeId && warehouseIds.length > 0) {
          await this.assignSalesLocations(tx, {
            employeeId: employee.id,
            organizationId: employee.organizationId,
            storeId,
            warehouseIds,
          });
        }
        await tx.auditLog.create({
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
              storeId: sales ? storeId : null,
              warehouseIds: sales ? warehouseIds : [],
            },
          },
        });
      });
    } catch (error) {
      throwKnownConflict(error, "登录名已存在");
    }
    return { id, username, employeeId: input.employeeId };
  }

  async updateAccount(id: string, input: UpdateAccountDto, request: AuthenticatedRequest) {
    const account = await this.database.client.userAccount.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        isFrozen: true,
        employeeId: true,
        employee: {
          select: {
            id: true,
            organizationId: true,
            storeId: true,
          },
        },
        roles: {
          select: {
            roleId: true,
            dataScope: true,
            scopeConfig: true,
            role: {
              select: {
                id: true,
                code: true,
                permissions: {
                  select: { permission: { select: { code: true } } },
                },
              },
            },
          },
        },
      },
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

    const roles =
      input.roleIds !== undefined
        ? await this.assertAssignableRoles(input.roleIds, request)
        : account.roles.map((relation) => ({
            id: relation.role.id,
            code: relation.role.code,
            permissions: relation.role.permissions.map(
              (item) => item.permission.code,
            ),
          }));
    const sales = requiresSalesAssignment(roles);
    const changingLocations =
      input.storeId !== undefined || input.warehouseIds !== undefined;
    const changingRoles = input.roleIds !== undefined;
    const existingWarehouseIds = [
      ...new Set(account.roles.flatMap((relation) => warehouseIdsFromScope(relation.scopeConfig))),
    ];
    const storeId = input.storeId ?? account.employee.storeId;
    const warehouseIds = input.warehouseIds ?? existingWarehouseIds;

    if (sales && (changingRoles || changingLocations)) {
      const missing = missingSalesAssignmentMessage({ storeId, warehouseIds });
      if (missing) throw new BadRequestException(missing);
    }

    await this.database.client.$transaction(async (tx) => {
      await tx.userAccount.update({
        where: { id },
        data: {
          ...data,
          ...(changingRoles
            ? {
                roles: {
                  deleteMany: {},
                  create: roles.map((role) => ({
                    roleId: role.id,
                    dataScope: salesRoleDataScope(role),
                    scopeConfig: salesRoleScopeConfig(role, storeId, warehouseIds),
                  })),
                },
              }
            : {}),
        },
      });
      if (sales && (changingRoles || changingLocations) && storeId && warehouseIds.length > 0) {
        await this.assignSalesLocations(tx, {
          employeeId: account.employeeId,
          organizationId: account.employee.organizationId,
          storeId,
          warehouseIds,
        });
      }
      await tx.auditLog.create({
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
            roleIdsChanged: changingRoles,
            storeId: sales ? storeId : undefined,
            warehouseIds: sales ? warehouseIds : undefined,
          },
        },
      });
    });
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

  /** 指定角色的持有账号清单:管理员核对"谁有这个权限"用(role:read) */
  async listRoleAccounts(roleId: string) {
    const role = await this.database.client.role.findUnique({
      where: { id: roleId },
      select: { id: true },
    });
    if (!role) throw new NotFoundException("角色不存在");

    const relations = await this.database.client.userRole.findMany({
      where: { roleId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            isFrozen: true,
            employee: {
              select: {
                id: true,
                name: true,
                employeeNo: true,
                store: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    const items = relations
      .map((relation) => ({
        accountId: relation.user.id,
        username: relation.user.username,
        isFrozen: relation.user.isFrozen,
        dataScope: relation.dataScope,
        employeeId: relation.user.employee.id,
        employeeName: relation.user.employee.name,
        employeeNo: relation.user.employee.employeeNo,
        storeName: relation.user.employee.store?.name ?? null,
      }))
      .sort((a, b) => a.username.localeCompare(b.username));
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
    await this.assertMoneySeparation(input.permissionIds);
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
      await this.assertMoneySeparation(input.permissionIds);
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
  ): Promise<Array<{ id: string } & SalesRoleInput>> {
    const uniqueIds = [...new Set(roleIds)];
    const roles = await this.database.client.role.findMany({
      where: { id: { in: uniqueIds } },
      select: {
        id: true,
        code: true,
        archivedAt: true,
        permissions: { select: { permission: { select: { code: true } } } },
      },
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
    const mapped = roles.map((role) => ({
      id: role.id,
      code: role.code,
      permissions: role.permissions.map((item) => item.permission.code),
    }));
    // 钱账分离:财务(单据/审批)与出纳(付款执行)不可兼任(2026-08-12 业务确认)
    const conflict = moneySeparationConflictMessage(mapped);
    if (conflict) throw new UnprocessableEntityException(conflict);
    return mapped;
  }

  /** 自定义角色配权不得同时含采购单据写入与付款执行(钱账分离) */
  private async assertMoneySeparation(permissionIds: string[]) {
    if (permissionIds.length === 0) return;
    const permissions = await this.database.client.permission.findMany({
      where: { id: { in: permissionIds } },
      select: { code: true },
    });
    if (
      permissionSetViolatesMoneySeparation(
        permissions.map((item) => item.code),
      )
    ) {
      throw new UnprocessableEntityException(
        "钱账分离:同一角色不能同时持有 procurement:write(采购单据/审批)与 procurement:pay(付款执行)",
      );
    }
  }

  /** 销售岗:写员工门店归属,并把个人仓挂到该员工 */
  private async assignSalesLocations(
    tx: Prisma.TransactionClient,
    input: {
      employeeId: string;
      organizationId: string;
      storeId: string;
      warehouseIds: string[];
    },
  ) {
    const store = await tx.store.findUnique({
      where: { id: input.storeId },
      select: { id: true, organizationId: true },
    });
    if (!store) throw new NotFoundException("门店不存在");
    if (store.organizationId !== input.organizationId) {
      throw new BadRequestException("门店不属于该员工所在组织，无法划分");
    }

    const warehouses = await tx.warehouse.findMany({
      where: { id: { in: input.warehouseIds } },
      select: {
        id: true,
        name: true,
        type: true,
        storeId: true,
        ownerEmployeeId: true,
      },
    });
    if (warehouses.length !== new Set(input.warehouseIds).size) {
      throw new BadRequestException("部分仓库不存在，请刷新后重试");
    }

    const forbidden = warehouses.filter(
      (warehouse) =>
        !(SALES_ASSIGNABLE_WAREHOUSE_TYPES as readonly string[]).includes(
          warehouse.type,
        ),
    );
    if (forbidden.length > 0) {
      throw new BadRequestException(
        `销售只能划分门店仓或个人仓，不能划分「${forbidden.map((item) => item.name).join("、")}」`,
      );
    }

    const storeMismatch = warehouses.filter(
      (warehouse) =>
        warehouse.type === "STORE" &&
        warehouse.storeId &&
        warehouse.storeId !== input.storeId,
    );
    if (storeMismatch.length > 0) {
      throw new BadRequestException(
        `仓库「${storeMismatch.map((item) => item.name).join("、")}」不属于所选门店`,
      );
    }

    const stolen = warehouses.filter(
      (warehouse) =>
        warehouse.type === "PERSONAL" &&
        warehouse.ownerEmployeeId &&
        warehouse.ownerEmployeeId !== input.employeeId,
    );
    if (stolen.length > 0) {
      throw new ConflictException(
        `个人仓「${stolen.map((item) => item.name).join("、")}」已归属其他员工`,
      );
    }

    await tx.employee.update({
      where: { id: input.employeeId },
      data: { storeId: input.storeId },
    });

    const personalIds = warehouses
      .filter((warehouse) => warehouse.type === "PERSONAL")
      .map((warehouse) => warehouse.id);

    await tx.warehouse.updateMany({
      where: {
        ownerEmployeeId: input.employeeId,
        ...(personalIds.length > 0 ? { id: { notIn: personalIds } } : {}),
      },
      data: { ownerEmployeeId: null },
    });

    for (const warehouse of warehouses) {
      if (warehouse.type !== "PERSONAL") continue;
      await tx.warehouse.update({
        where: { id: warehouse.id },
        data: {
          ownerEmployeeId: input.employeeId,
          storeId: input.storeId,
        },
      });
    }
  }

  /** 员工列表附带已挂仓库(个人仓 owner + 销售 scopeConfig) */
  private async loadEmployeeWarehouses(records: EmployeeRecord[]) {
    const owned = new Map<
      string,
      Array<{ id: string; code: string; name: string; type: string }>
    >();
    if (records.length === 0) return owned;

    const employeeIds = records.map((record) => record.id);
    const scopedIds = [
      ...new Set(
        records.flatMap((record) =>
          (record.account?.roles ?? []).flatMap((role) =>
            warehouseIdsFromScope(role.scopeConfig),
          ),
        ),
      ),
    ];
    const warehouses = await this.database.client.warehouse.findMany({
      where: {
        OR: [
          { ownerEmployeeId: { in: employeeIds } },
          ...(scopedIds.length > 0 ? [{ id: { in: scopedIds } }] : []),
        ],
      },
      select: { id: true, code: true, name: true, type: true, ownerEmployeeId: true },
    });
    const warehouseById = new Map(warehouses.map((item) => [item.id, item]));

    for (const record of records) {
      const ids = new Set<string>();
      for (const warehouse of warehouses) {
        if (warehouse.ownerEmployeeId === record.id) ids.add(warehouse.id);
      }
      for (const role of record.account?.roles ?? []) {
        for (const warehouseId of warehouseIdsFromScope(role.scopeConfig)) {
          ids.add(warehouseId);
        }
      }
      owned.set(
        record.id,
        [...ids]
          .map((id) => warehouseById.get(id))
          .filter((item): item is NonNullable<typeof item> => item !== undefined)
          .map((item) => ({
            id: item.id,
            code: item.code,
            name: item.name,
            type: item.type,
          })),
      );
    }
    return owned;
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

function mapEmployee(
  record: EmployeeRecord,
  ownedWarehouses: Array<{ id: string; code: string; name: string; type: string }> = [],
) {
  const warehouseIds = [
    ...new Set([
      ...ownedWarehouses.map((item) => item.id),
      ...(record.account?.roles ?? []).flatMap((role) =>
        warehouseIdsFromScope(role.scopeConfig),
      ),
    ]),
  ];
  return {
    id: record.id,
    organizationId: record.organizationId,
    storeId: record.storeId,
    employeeNo: record.employeeNo,
    name: record.name,
    mobile: record.mobile,
    status: record.status,
    ownedWarehouses,
    account: record.account
      ? {
          id: record.account.id,
          username: record.account.username,
          isFrozen: record.account.isFrozen,
          roleIds: record.account.roles.map((role) => role.roleId),
          warehouseIds,
        }
      : null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function salesRoleDataScope(role: SalesRoleInput) {
  if (requiresSalesAssignment([role])) return "STORE" as const;
  return dataScopeForRole(role.code);
}

function salesRoleScopeConfig(
  role: SalesRoleInput,
  storeId: string | null,
  warehouseIds: string[],
) {
  if (!requiresSalesAssignment([role]) || !storeId) return undefined;
  return { storeId, warehouseIds };
}

function warehouseIdsFromScope(config: unknown): string[] {
  if (!config || typeof config !== "object") return [];
  const ids = (config as { warehouseIds?: unknown }).warehouseIds;
  if (!Array.isArray(ids)) return [];
  return ids.filter((id): id is string => typeof id === "string");
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
