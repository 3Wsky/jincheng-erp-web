import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { hashPassword, Prisma } from "@jincheng/database";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import {
  CreateAccountDto,
  CreateEmployeeDto,
  CreateOrganizationDto,
  CreateStoreDto,
  ListEmployeesQueryDto,
  UpdateAccountDto,
  UpdateEmployeeDto,
  UpdateOrganizationDto,
  UpdateStoreDto,
} from "./organization.dto.js";

const employeeInclude = {
  store: { select: { id: true, name: true } },
  account: { select: { id: true, username: true, isFrozen: true } },
} satisfies Prisma.EmployeeInclude;

type EmployeeRecord = Prisma.EmployeeGetPayload<{
  include: typeof employeeInclude;
}>;

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

    const roles = await this.database.client.role.findMany({
      where: { id: { in: input.roleIds } },
      select: { id: true },
    });
    if (roles.length !== input.roleIds.length) {
      throw new BadRequestException("部分角色不存在，请刷新后重试");
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
      await this.database.client.$transaction([
        this.database.client.userAccount.create({
          data: {
            id,
            employeeId: input.employeeId,
            username,
            passwordHash,
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

    const data: Prisma.UserAccountUpdateInput = {};
    if (input.isFrozen !== undefined) data.isFrozen = input.isFrozen;
    if (input.password !== undefined) {
      data.passwordHash = await hashPassword(input.password);
    }
    if (input.roleIds !== undefined) {
      const roles = await this.database.client.role.findMany({
        where: { id: { in: input.roleIds } },
        select: { id: true },
      });
      if (roles.length !== input.roleIds.length) {
        throw new BadRequestException("部分角色不存在，请刷新后重试");
      }
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
      orderBy: { code: "asc" },
      include: {
        permissions: {
          include: { permission: { select: { code: true } } },
        },
      },
    });
    const items = roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
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
