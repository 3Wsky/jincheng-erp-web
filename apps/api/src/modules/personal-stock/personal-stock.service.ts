import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  PersonalStockLineStatus,
  PersonalStockStatus,
  PersonalStockType,
  Prisma,
  SerialStatus,
  WarehouseType,
} from "@jincheng/database";
import { randomBytes, randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { StocktakeFreezeService } from "../stocktake/stocktake-freeze.service.js";
import {
  CreatePersonalStockDto,
  ListPersonalStockQueryDto,
  MinePersonalStockQueryDto,
} from "./personal-stock.dto.js";

const PUBLIC_WAREHOUSE_TYPES: WarehouseType[] = [
  WarehouseType.STORE,
  WarehouseType.COMPANY,
];

const LOCKABLE_STATUSES: SerialStatus[] = [
  SerialStatus.NORMAL,
  SerialStatus.PERSONAL,
];

const IN_STOCK_STATUSES: SerialStatus[] = [
  SerialStatus.NORMAL,
  SerialStatus.PERSONAL,
  SerialStatus.LOCKED,
];

export type PersonalStockScope = "SELF" | "STORE" | "ORGANIZATION";

/**
 * 我的库存可见范围(AC-F-007):销售看本人,店长看本店,管理员/老板/组织范围看全部。
 * 导出便于单元测试(TC-PST-001)。
 */
export function resolvePersonalStockScope(
  user: AuthenticatedRequest["user"],
): PersonalStockScope {
  const codes = new Set(user.roles.map((role) => role.code));
  const scopes = new Set(user.roles.map((role) => role.dataScope));
  if (
    codes.has("ADMIN") ||
    codes.has("BOSS") ||
    scopes.has("ORGANIZATION")
  ) {
    return "ORGANIZATION";
  }
  if (codes.has("STORE_MANAGER") || scopes.has("STORE")) {
    return "STORE";
  }
  return "SELF";
}

/** 生成个人库存单号:PST-YYYYMMDD-4位十六进制 */
export function generatePersonalStockCode(now = new Date()): string {
  const ymd = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const suffix = randomBytes(2).toString("hex").toUpperCase();
  return `PST-${ymd}-${suffix}`;
}

const warehouseSelect = {
  id: true,
  code: true,
  name: true,
  type: true,
  storeId: true,
  ownerEmployeeId: true,
} satisfies Prisma.WarehouseSelect;

const orderInclude = {
  fromWarehouse: { select: warehouseSelect },
  toWarehouse: { select: warehouseSelect },
  fromEmployee: { select: { id: true, name: true } },
  toEmployee: { select: { id: true, name: true } },
  _count: { select: { lines: true } },
} satisfies Prisma.PersonalStockOrderInclude;

@Injectable()
export class PersonalStockService {
  constructor(
    private readonly database: DatabaseService,
    private readonly freeze: StocktakeFreezeService,
  ) {}

  // ---------- 我的库存 ----------

  async mine(query: MinePersonalStockQueryDto, request: AuthenticatedRequest) {
    const scope = resolvePersonalStockScope(request.user);
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 50));
    const personalWhere = this.personalWarehouseWhere(scope, request.user);
    const [
      personalWarehouses,
      publicWarehouses,
      handoverWarehouses,
    ] = await Promise.all([
      this.database.client.warehouse.findMany({
        where: personalWhere,
        select: {
          ...warehouseSelect,
          store: { select: { name: true } },
          _count: {
            select: {
              serials: { where: { status: { in: IN_STOCK_STATUSES } } },
            },
          },
        },
        orderBy: { name: "asc" },
      }),
      this.database.client.warehouse.findMany({
        where: { type: { in: PUBLIC_WAREHOUSE_TYPES } },
        select: {
          ...warehouseSelect,
          store: { select: { name: true } },
          _count: {
            select: {
              serials: { where: { status: { in: IN_STOCK_STATUSES } } },
            },
          },
        },
        orderBy: { name: "asc" },
      }),
      this.database.client.warehouse.findMany({
        where: this.handoverWarehouseWhere(scope, request.user),
        select: {
          ...warehouseSelect,
          store: { select: { name: true } },
        },
        orderBy: { name: "asc" },
      }),
    ]);

    const ownerIds = [
      ...new Set(
        [...personalWarehouses, ...handoverWarehouses]
          .map((warehouse) => warehouse.ownerEmployeeId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const owners = await this.database.client.employee.findMany({
      where: { id: { in: ownerIds } },
      select: { id: true, name: true, status: true },
    });
    const ownerById = new Map(owners.map((owner) => [owner.id, owner]));

    const serialWhere: Prisma.SerialItemWhereInput = {
      status: { in: IN_STOCK_STATUSES },
      currentWarehouse: personalWhere,
      ...(query.warehouseId ? { currentWarehouseId: query.warehouseId } : {}),
    };
    const [items, total] = await this.database.client.$transaction([
      this.database.client.serialItem.findMany({
        where: serialWhere,
        include: {
          sku: {
            include: { product: { select: { brand: true, modelName: true } } },
          },
          currentWarehouse: {
            select: {
              id: true,
              name: true,
              ownerEmployeeId: true,
            },
          },
        },
        orderBy: { receivedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.database.client.serialItem.count({ where: serialWhere }),
    ]);

    const myPersonalWarehouseId =
      personalWarehouses.find(
        (warehouse) => warehouse.ownerEmployeeId === request.user.employeeId,
      )?.id ?? null;

    return {
      scope,
      myPersonalWarehouseId,
      warehouses: personalWarehouses.map((warehouse) =>
        this.toLocation(warehouse, ownerById),
      ),
      publicWarehouses: publicWarehouses.map((warehouse) =>
        this.toLocation(warehouse, ownerById),
      ),
      handoverTargets: handoverWarehouses.flatMap((warehouse) => {
        const owner = warehouse.ownerEmployeeId
          ? ownerById.get(warehouse.ownerEmployeeId)
          : undefined;
        if (!owner || owner.status === "INACTIVE") return [];
        return [
          {
            employeeId: owner.id,
            employeeName: owner.name,
            warehouseId: warehouse.id,
            warehouseName: warehouse.name,
            storeName: warehouse.store?.name ?? null,
          },
        ];
      }),
      items: items.map((item) => ({
        id: item.id,
        imeiPrimary: item.imeiPrimary,
        serialNumber: item.serialNumber,
        status: item.status,
        skuCode: item.sku.code,
        skuName: item.sku.name,
        productBrand: item.sku.product.brand,
        productModel: item.sku.product.modelName,
        warehouseId: item.currentWarehouse.id,
        warehouseName: item.currentWarehouse.name,
        ownerEmployeeId: item.currentWarehouse.ownerEmployeeId,
        ownerEmployeeName: item.currentWarehouse.ownerEmployeeId
          ? (ownerById.get(item.currentWarehouse.ownerEmployeeId)?.name ?? null)
          : null,
        receivedAt: item.receivedAt,
      })),
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    };
  }

  // ---------- 单据查询 ----------

  async list(query: ListPersonalStockQueryDto, request: AuthenticatedRequest) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const visibility = this.orderVisibilityWhere(request.user);
    const where: Prisma.PersonalStockOrderWhereInput = {
      AND: [
        visibility,
        ...(query.status ? [{ status: query.status }] : []),
        ...(query.type ? [{ type: query.type }] : []),
      ],
    };

    const [items, total] = await this.database.client.$transaction([
      this.database.client.personalStockOrder.findMany({
        where,
        include: orderInclude,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.database.client.personalStockOrder.count({ where }),
    ]);
    const actorNames = await this.resolveActorNames(
      items.map((item) => item.createdById),
    );

    return {
      items: items.map((item) => ({
        id: item.id,
        code: item.code,
        type: item.type,
        status: item.status,
        fromWarehouse: this.toWarehouse(item.fromWarehouse),
        toWarehouse: this.toWarehouse(item.toWarehouse),
        fromEmployeeName: item.fromEmployee?.name ?? null,
        toEmployeeName: item.toEmployee?.name ?? null,
        lineCount: item._count.lines,
        remark: item.remark,
        createdByName: actorNames.get(item.createdById) ?? null,
        createdAt: item.createdAt,
        submittedAt: item.submittedAt,
        confirmedAt: item.confirmedAt,
      })),
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    };
  }

  async detail(id: string, request: AuthenticatedRequest) {
    const order = await this.database.client.personalStockOrder.findUnique({
      where: { id },
      include: {
        ...orderInclude,
        lines: {
          orderBy: { createdAt: "asc" },
          include: {
            serial: {
              select: {
                id: true,
                imeiPrimary: true,
                serialNumber: true,
                status: true,
              },
            },
            sku: {
              select: {
                code: true,
                name: true,
                product: { select: { brand: true, modelName: true } },
              },
            },
          },
        },
      },
    });
    if (!order) throw new NotFoundException("个人库存单据不存在");
    this.assertCanView(order, request.user);

    const actorNames = await this.resolveActorNames([
      order.createdById,
      order.confirmedById,
    ]);

    return {
      id: order.id,
      code: order.code,
      type: order.type,
      status: order.status,
      fromWarehouse: this.toWarehouse(order.fromWarehouse),
      toWarehouse: this.toWarehouse(order.toWarehouse),
      fromEmployeeId: order.fromEmployeeId,
      fromEmployeeName: order.fromEmployee?.name ?? null,
      toEmployeeId: order.toEmployeeId,
      toEmployeeName: order.toEmployee?.name ?? null,
      remark: order.remark,
      createdByName: actorNames.get(order.createdById) ?? null,
      confirmedByName: order.confirmedById
        ? (actorNames.get(order.confirmedById) ?? null)
        : null,
      createdAt: order.createdAt,
      submittedAt: order.submittedAt,
      confirmedAt: order.confirmedAt,
      cancelledAt: order.cancelledAt,
      lines: order.lines.map((line) => ({
        id: line.id,
        serialId: line.serialId,
        imeiPrimary: line.serial.imeiPrimary,
        serialNumber: line.serial.serialNumber,
        serialStatus: line.serial.status,
        skuCode: line.sku.code,
        skuName: line.sku.name,
        productBrand: line.sku.product.brand,
        productModel: line.sku.product.modelName,
        status: line.status,
      })),
    };
  }

  // ---------- 命令 ----------

  async create(input: CreatePersonalStockDto, request: AuthenticatedRequest) {
    if (input.fromWarehouseId === input.toWarehouseId) {
      throw new BadRequestException("调出仓与调入仓不能相同");
    }
    const [fromWarehouse, toWarehouse] = await Promise.all([
      this.database.client.warehouse.findUnique({
        where: { id: input.fromWarehouseId },
        select: warehouseSelect,
      }),
      this.database.client.warehouse.findUnique({
        where: { id: input.toWarehouseId },
        select: warehouseSelect,
      }),
    ]);
    if (!fromWarehouse) throw new NotFoundException("调出仓不存在");
    if (!toWarehouse) throw new NotFoundException("调入仓不存在");

    const type = input.type as PersonalStockType;
    this.assertWarehouseRoute(type, fromWarehouse, toWarehouse);
    this.assertCreatePermission(type, fromWarehouse, toWarehouse, request.user);
    await this.freeze.assertNotFrozen([
      input.fromWarehouseId,
      input.toWarehouseId,
    ]);

    const serialIds = [...new Set(input.serialIds)];
    const serials = await this.database.client.serialItem.findMany({
      where: { id: { in: serialIds } },
      select: {
        id: true,
        skuId: true,
        imeiPrimary: true,
        status: true,
        currentWarehouseId: true,
      },
    });
    const foundIds = new Set(serials.map((serial) => serial.id));
    const missing = serialIds.filter((serialId) => !foundIds.has(serialId));
    if (missing.length > 0) {
      throw new UnprocessableEntityException(
        `序列号不存在:${missing.slice(0, 5).join("、")}${missing.length > 5 ? " 等" : ""}`,
      );
    }
    const unavailable = serials.filter(
      (serial) =>
        serial.currentWarehouseId !== input.fromWarehouseId ||
        !LOCKABLE_STATUSES.includes(serial.status),
    );
    if (unavailable.length > 0) {
      throw new UnprocessableEntityException(
        `以下序列号不在调出仓的可领用/可归还库存中:${unavailable
          .slice(0, 5)
          .map((serial) => serial.imeiPrimary)
          .join("、")}${unavailable.length > 5 ? " 等" : ""}`,
      );
    }

    const fromEmployeeId =
      type === PersonalStockType.ISSUE ? null : fromWarehouse.ownerEmployeeId;
    const toEmployeeId =
      type === PersonalStockType.RETURN ? null : toWarehouse.ownerEmployeeId;

    const orderId = randomUUID();
    for (let attempt = 0; ; attempt += 1) {
      const code = generatePersonalStockCode();
      try {
        await this.database.client.$transaction([
          this.database.client.personalStockOrder.create({
            data: {
              id: orderId,
              code,
              type,
              fromWarehouseId: input.fromWarehouseId,
              toWarehouseId: input.toWarehouseId,
              fromEmployeeId,
              toEmployeeId,
              remark: input.remark?.trim() || null,
              createdById: request.user.userId,
            },
          }),
          this.database.client.personalStockLine.createMany({
            data: serials.map((serial) => ({
              id: randomUUID(),
              orderId,
              serialId: serial.id,
              skuId: serial.skuId,
            })),
          }),
          this.database.client.auditLog.create({
            data: {
              actorUserId: request.user.userId,
              action: "personal-stock.create",
              resource: "personal-stock",
              resourceId: orderId,
              requestId: request.requestId,
              afterData: {
                code,
                type,
                fromWarehouseId: input.fromWarehouseId,
                toWarehouseId: input.toWarehouseId,
                serialCount: serials.length,
              },
            },
          }),
        ]);
        break;
      } catch (error) {
        const isCodeConflict =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002";
        if (!isCodeConflict || attempt >= 2) throw error;
      }
    }
    return this.detail(orderId, request);
  }

  /** DRAFT → SUBMITTED,同事务锁库(NORMAL/PERSONAL → LOCKED) */
  async submit(id: string, request: AuthenticatedRequest) {
    await this.database.client.$transaction(async (tx) => {
      const current = await tx.personalStockOrder.findUnique({
        where: { id },
        select: {
          createdById: true,
          fromEmployeeId: true,
          toEmployeeId: true,
        },
      });
      if (!current) throw new NotFoundException("个人库存单据不存在");
      this.assertCanAct(current, request.user);
      const order = await this.transitionInTx(tx, id, request, {
        action: "personal-stock.submit",
        from: [PersonalStockStatus.DRAFT],
        to: PersonalStockStatus.SUBMITTED,
        data: { submittedAt: new Date() },
      });
      await this.freeze.assertNotFrozen(
        [order.fromWarehouseId, order.toWarehouseId],
        tx,
      );

      const lines = await tx.personalStockLine.findMany({
        where: { orderId: id, status: PersonalStockLineStatus.PENDING },
        include: { serial: { select: { id: true, status: true } } },
      });
      if (lines.length === 0) {
        throw new UnprocessableEntityException("单据没有待锁定明细");
      }
      for (const line of lines) {
        if (!LOCKABLE_STATUSES.includes(line.serial.status)) {
          throw new ConflictException(
            "锁定失败:部分设备已不在可领用库存,请刷新后重试",
          );
        }
        const locked = await tx.serialItem.updateMany({
          where: {
            id: line.serialId,
            status: { in: LOCKABLE_STATUSES },
            currentWarehouseId: order.fromWarehouseId,
          },
          data: { status: SerialStatus.LOCKED },
        });
        if (locked.count !== 1) {
          throw new ConflictException(
            "锁定失败:部分设备已被其他单据占用,请刷新后重试",
          );
        }
        await tx.personalStockLine.update({
          where: { id: line.id },
          data: {
            status: PersonalStockLineStatus.LOCKED,
            lockedFromStatus: line.serial.status,
          },
        });
      }
    });
    return this.detail(id, request);
  }

  /**
   * SUBMITTED → CONFIRMED:移仓 + 写流水。
   * 领用/归还由库管(inventory:write)确认;转交必须接收方本人确认。
   */
  async confirm(id: string, request: AuthenticatedRequest) {
    await this.database.client.$transaction(async (tx) => {
      const preview = await tx.personalStockOrder.findUnique({
        where: { id },
        select: {
          id: true,
          type: true,
          status: true,
          toEmployeeId: true,
          fromWarehouseId: true,
          toWarehouseId: true,
        },
      });
      if (!preview) throw new NotFoundException("个人库存单据不存在");
      this.assertConfirmPermission(preview, request.user);

      const order = await this.transitionInTx(tx, id, request, {
        action: "personal-stock.confirm",
        from: [PersonalStockStatus.SUBMITTED],
        to: PersonalStockStatus.CONFIRMED,
        data: {
          confirmedById: request.user.userId,
          confirmedAt: new Date(),
        },
      });
      await this.freeze.assertNotFrozen(
        [order.fromWarehouseId, order.toWarehouseId],
        tx,
      );

      const toWarehouse = await tx.warehouse.findUniqueOrThrow({
        where: { id: order.toWarehouseId },
        select: { ownerEmployeeId: true },
      });
      const lines = await tx.personalStockLine.findMany({
        where: { orderId: id, status: PersonalStockLineStatus.LOCKED },
        select: { serialId: true, skuId: true },
      });
      if (lines.length === 0) {
        throw new UnprocessableEntityException("单据没有已锁定明细");
      }
      const serialIds = lines.map((line) => line.serialId);
      const nextStatus =
        order.type === PersonalStockType.RETURN
          ? SerialStatus.NORMAL
          : SerialStatus.PERSONAL;
      const nextResponsible =
        order.type === PersonalStockType.RETURN
          ? null
          : toWarehouse.ownerEmployeeId;
      const moved = await tx.serialItem.updateMany({
        where: { id: { in: serialIds }, status: SerialStatus.LOCKED },
        data: {
          status: nextStatus,
          currentWarehouseId: order.toWarehouseId,
          responsibleEmployeeId: nextResponsible,
        },
      });
      if (moved.count !== serialIds.length) {
        throw new ConflictException("确认失败:部分设备状态已变化,请刷新后重试");
      }
      await tx.personalStockLine.updateMany({
        where: { orderId: id, status: PersonalStockLineStatus.LOCKED },
        data: { status: PersonalStockLineStatus.DONE },
      });

      const occurredAt = new Date();
      const movementType =
        order.type === PersonalStockType.RETURN
          ? ("PERSONAL_RETURN" as const)
          : ("PERSONAL_ISSUE" as const);
      const documentType =
        order.type === PersonalStockType.HANDOVER
          ? "PERSONAL_HANDOVER"
          : order.type === PersonalStockType.RETURN
            ? "PERSONAL_RETURN"
            : "PERSONAL_ISSUE";
      await tx.inventoryMovement.createMany({
        data: lines.map((line) => ({
          id: randomUUID(),
          documentId: id,
          documentType,
          movementType,
          skuId: line.skuId,
          serialId: line.serialId,
          quantity: 1,
          fromWarehouseId: order.fromWarehouseId,
          toWarehouseId: order.toWarehouseId,
          occurredAt,
        })),
      });
    });
    return this.detail(id, request);
  }

  /** DRAFT 直接取消;SUBMITTED 取消时解锁并恢复锁库前状态 */
  async cancel(id: string, request: AuthenticatedRequest) {
    await this.database.client.$transaction(async (tx) => {
      const current = await tx.personalStockOrder.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          createdById: true,
          fromEmployeeId: true,
          toEmployeeId: true,
          fromWarehouseId: true,
          toWarehouseId: true,
          type: true,
          code: true,
        },
      });
      if (!current) throw new NotFoundException("个人库存单据不存在");
      this.assertStatus(current.status, [
        PersonalStockStatus.DRAFT,
        PersonalStockStatus.SUBMITTED,
      ]);
      this.assertCanAct(current, request.user);

      if (current.status === PersonalStockStatus.SUBMITTED) {
        const lines = await tx.personalStockLine.findMany({
          where: { orderId: id, status: PersonalStockLineStatus.LOCKED },
          select: { id: true, serialId: true, lockedFromStatus: true },
        });
        for (const line of lines) {
          const restoreStatus =
            line.lockedFromStatus ?? SerialStatus.NORMAL;
          const released = await tx.serialItem.updateMany({
            where: { id: line.serialId, status: SerialStatus.LOCKED },
            data: { status: restoreStatus },
          });
          if (released.count !== 1) {
            throw new ConflictException(
              "取消失败:部分设备状态已变化,请刷新后重试",
            );
          }
        }
        await tx.personalStockLine.updateMany({
          where: { orderId: id, status: PersonalStockLineStatus.LOCKED },
          data: { status: PersonalStockLineStatus.PENDING },
        });
      }

      await this.transitionInTx(tx, id, request, {
        action: "personal-stock.cancel",
        from: [current.status],
        to: PersonalStockStatus.CANCELLED,
        data: { cancelledAt: new Date() },
      });
    });
    return this.detail(id, request);
  }

  // ---------- 内部规则 ----------

  private assertWarehouseRoute(
    type: PersonalStockType,
    fromWarehouse: { type: WarehouseType; ownerEmployeeId: string | null },
    toWarehouse: { type: WarehouseType; ownerEmployeeId: string | null },
  ): void {
    if (type === PersonalStockType.ISSUE) {
      if (!PUBLIC_WAREHOUSE_TYPES.includes(fromWarehouse.type)) {
        throw new UnprocessableEntityException(
          "领用必须从门店仓或公司总仓调出",
        );
      }
      if (
        toWarehouse.type !== WarehouseType.PERSONAL ||
        !toWarehouse.ownerEmployeeId
      ) {
        throw new UnprocessableEntityException(
          "领用目标必须是已划分主人的个人仓",
        );
      }
      return;
    }
    if (type === PersonalStockType.RETURN) {
      if (
        fromWarehouse.type !== WarehouseType.PERSONAL ||
        !fromWarehouse.ownerEmployeeId
      ) {
        throw new UnprocessableEntityException("归还必须从个人仓调出");
      }
      if (!PUBLIC_WAREHOUSE_TYPES.includes(toWarehouse.type)) {
        throw new UnprocessableEntityException(
          "归还目标必须是门店仓或公司总仓",
        );
      }
      return;
    }
    if (
      fromWarehouse.type !== WarehouseType.PERSONAL ||
      toWarehouse.type !== WarehouseType.PERSONAL ||
      !fromWarehouse.ownerEmployeeId ||
      !toWarehouse.ownerEmployeeId
    ) {
      throw new UnprocessableEntityException(
        "转交必须在两名员工的个人仓之间进行",
      );
    }
    if (fromWarehouse.ownerEmployeeId === toWarehouse.ownerEmployeeId) {
      throw new UnprocessableEntityException("不能转交给自己");
    }
  }

  private assertCreatePermission(
    type: PersonalStockType,
    fromWarehouse: { ownerEmployeeId: string | null },
    toWarehouse: { ownerEmployeeId: string | null },
    user: AuthenticatedRequest["user"],
  ): void {
    if (user.permissions.includes("inventory:write")) return;
    const ownWarehouseOwnerId =
      type === PersonalStockType.ISSUE
        ? toWarehouse.ownerEmployeeId
        : fromWarehouse.ownerEmployeeId;
    if (ownWarehouseOwnerId !== user.employeeId) {
      throw new ForbiddenException(
        "销售只能对自己的个人仓发起领用、归还或转交;代领用需要库管权限",
      );
    }
  }

  private assertConfirmPermission(
    order: { type: PersonalStockType; toEmployeeId: string | null },
    user: AuthenticatedRequest["user"],
  ): void {
    if (order.type === PersonalStockType.HANDOVER) {
      if (order.toEmployeeId !== user.employeeId) {
        throw new ForbiddenException("转交必须由接收方本人确认");
      }
      return;
    }
    if (!user.permissions.includes("inventory:write")) {
      throw new ForbiddenException("领用/归还需库管确认入库");
    }
  }

  private assertCanView(
    order: {
      createdById: string;
      fromEmployeeId: string | null;
      toEmployeeId: string | null;
      fromWarehouse: { storeId: string | null };
      toWarehouse: { storeId: string | null };
    },
    user: AuthenticatedRequest["user"],
  ): void {
    if (this.canSeeAllOrders(user)) return;
    if (this.isInvolved(order, user)) return;
    const scope = resolvePersonalStockScope(user);
    if (
      scope === "STORE" &&
      user.storeId &&
      (order.fromWarehouse.storeId === user.storeId ||
        order.toWarehouse.storeId === user.storeId)
    ) {
      return;
    }
    throw new NotFoundException("个人库存单据不存在");
  }

  private assertCanAct(
    order: {
      createdById: string;
      fromEmployeeId: string | null;
      toEmployeeId: string | null;
    },
    user: AuthenticatedRequest["user"],
  ): void {
    if (user.permissions.includes("inventory:write")) return;
    if (this.isInvolved(order, user) || order.createdById === user.userId) {
      return;
    }
    throw new ForbiddenException("无权操作该单据");
  }

  private isInvolved(
    order: {
      createdById: string;
      fromEmployeeId: string | null;
      toEmployeeId: string | null;
    },
    user: AuthenticatedRequest["user"],
  ): boolean {
    return (
      order.createdById === user.userId ||
      order.fromEmployeeId === user.employeeId ||
      order.toEmployeeId === user.employeeId
    );
  }

  private canSeeAllOrders(user: AuthenticatedRequest["user"]): boolean {
    return resolvePersonalStockScope(user) === "ORGANIZATION";
  }

  private orderVisibilityWhere(
    user: AuthenticatedRequest["user"],
  ): Prisma.PersonalStockOrderWhereInput {
    if (this.canSeeAllOrders(user)) return {};
    const scope = resolvePersonalStockScope(user);
    const involved: Prisma.PersonalStockOrderWhereInput[] = [
      { createdById: user.userId },
      { fromEmployeeId: user.employeeId },
      { toEmployeeId: user.employeeId },
    ];
    if (scope === "STORE" && user.storeId) {
      return {
        OR: [
          ...involved,
          { fromWarehouse: { storeId: user.storeId } },
          { toWarehouse: { storeId: user.storeId } },
        ],
      };
    }
    return { OR: involved };
  }

  private personalWarehouseWhere(
    scope: PersonalStockScope,
    user: AuthenticatedRequest["user"],
  ): Prisma.WarehouseWhereInput {
    const base: Prisma.WarehouseWhereInput = { type: WarehouseType.PERSONAL };
    if (scope === "ORGANIZATION") return base;
    if (scope === "STORE") {
      return {
        ...base,
        OR: [
          ...(user.storeId ? [{ storeId: user.storeId }] : []),
          { ownerEmployeeId: user.employeeId },
        ],
      };
    }
    return { ...base, ownerEmployeeId: user.employeeId };
  }

  private handoverWarehouseWhere(
    scope: PersonalStockScope,
    user: AuthenticatedRequest["user"],
  ): Prisma.WarehouseWhereInput {
    const base: Prisma.WarehouseWhereInput = {
      type: WarehouseType.PERSONAL,
      ownerEmployeeId: { not: user.employeeId },
    };
    if (scope !== "ORGANIZATION" && user.storeId) {
      return { ...base, storeId: user.storeId };
    }
    return base;
  }

  private toLocation(
    warehouse: {
      id: string;
      name: string;
      type: WarehouseType;
      ownerEmployeeId: string | null;
      store: { name: string } | null;
      _count?: { serials: number };
    },
    ownerById: Map<string, { name: string }>,
  ) {
    return {
      id: warehouse.id,
      name: warehouse.name,
      type: warehouse.type,
      ownerEmployeeId: warehouse.ownerEmployeeId,
      ownerEmployeeName: warehouse.ownerEmployeeId
        ? (ownerById.get(warehouse.ownerEmployeeId)?.name ?? null)
        : null,
      storeName: warehouse.store?.name ?? null,
      serialCount: warehouse._count?.serials ?? 0,
    };
  }

  private toWarehouse(warehouse: {
    id: string;
    code: string;
    name: string;
    type: WarehouseType;
  }) {
    return {
      id: warehouse.id,
      code: warehouse.code,
      name: warehouse.name,
      type: warehouse.type,
    };
  }

  private assertStatus(
    current: PersonalStockStatus,
    allowed: PersonalStockStatus[],
  ): void {
    if (!allowed.includes(current)) {
      throw new UnprocessableEntityException(
        `当前状态(${current})不允许该操作,期望状态:${allowed.join("/")}`,
      );
    }
  }

  private async transitionInTx(
    tx: Prisma.TransactionClient,
    id: string,
    request: AuthenticatedRequest,
    options: {
      action: string;
      from: PersonalStockStatus[];
      to: PersonalStockStatus;
      data?: Prisma.PersonalStockOrderUpdateManyMutationInput;
    },
  ) {
    const order = await tx.personalStockOrder.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        status: true,
        type: true,
        fromWarehouseId: true,
        toWarehouseId: true,
        createdById: true,
        fromEmployeeId: true,
        toEmployeeId: true,
      },
    });
    if (!order) throw new NotFoundException("个人库存单据不存在");
    this.assertStatus(order.status, options.from);
    const updated = await tx.personalStockOrder.updateMany({
      where: { id, status: { in: options.from } },
      data: { ...options.data, status: options.to },
    });
    if (updated.count !== 1) {
      throw new ConflictException("状态已被其他操作变更,请刷新后重试");
    }
    await tx.auditLog.create({
      data: {
        actorUserId: request.user.userId,
        action: options.action,
        resource: "personal-stock",
        resourceId: id,
        requestId: request.requestId,
        beforeData: { status: order.status },
        afterData: { status: options.to, code: order.code, type: order.type },
      },
    });
    return order;
  }

  private async resolveActorNames(
    userIds: Array<string | null | undefined>,
  ): Promise<Map<string, string>> {
    const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
    if (ids.length === 0) return new Map();
    const accounts = await this.database.client.userAccount.findMany({
      where: { id: { in: ids } },
      select: { id: true, employee: { select: { name: true } } },
    });
    return new Map(
      accounts.map((account) => [account.id, account.employee.name]),
    );
  }
}
