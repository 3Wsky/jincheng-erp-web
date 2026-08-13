import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  Prisma,
  TransferExceptionType,
  TransferLineStatus,
  TransferStatus,
} from "@jincheng/database";
import { randomBytes, randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { StocktakeFreezeService } from "../stocktake/stocktake-freeze.service.js";
import {
  CreateTransferDto,
  ListTransfersQueryDto,
  MarkTransferExceptionsDto,
  ReceiveTransferDto,
  RejectTransferDto,
} from "./transfer.dto.js";

/**
 * 根据明细状态聚合主单接收阶段状态(docs/12 调拨状态机)。
 * 导出为纯函数便于单元测试(TC-TRF-002):
 * - 还有在途行(SHIPPED) → 有已处理行则 PARTIALLY_RECEIVED,否则维持 IN_TRANSIT;
 * - 在途清零 → 有差异行则 EXCEPTION(差异确认),否则 RECEIVED(全部接收)。
 */
export function aggregateReceivingStatus(lineStatuses: {
  shipped: number;
  received: number;
  exception: number;
}): TransferStatus {
  if (lineStatuses.shipped > 0) {
    return lineStatuses.received > 0 || lineStatuses.exception > 0
      ? TransferStatus.PARTIALLY_RECEIVED
      : TransferStatus.IN_TRANSIT;
  }
  return lineStatuses.exception > 0
    ? TransferStatus.EXCEPTION
    : TransferStatus.RECEIVED;
}

/** 生成调拨单号:TRF-YYYYMMDD-4位十六进制,唯一约束兜底冲突重试 */
export function generateTransferCode(now = new Date()): string {
  const ymd = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const suffix = randomBytes(2).toString("hex").toUpperCase();
  return `TRF-${ymd}-${suffix}`;
}

/** 列表/详情共用的主单 include */
const transferInclude = {
  fromWarehouse: { select: { id: true, code: true, name: true, type: true } },
  toWarehouse: { select: { id: true, code: true, name: true, type: true } },
  _count: { select: { lines: true } },
} satisfies Prisma.TransferOrderInclude;

@Injectable()
export class TransferService {
  constructor(
    private readonly database: DatabaseService,
    private readonly freeze: StocktakeFreezeService,
  ) {}

  // ---------- 查询 ----------

  async list(query: ListTransfersQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const where: Prisma.TransferOrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.warehouseId
        ? {
            OR: [
              { fromWarehouseId: query.warehouseId },
              { toWarehouseId: query.warehouseId },
            ],
          }
        : {}),
      ...(query.search?.trim()
        ? { code: { contains: query.search.trim(), mode: "insensitive" } }
        : {}),
    };

    const [items, total] = await this.database.client.$transaction([
      this.database.client.transferOrder.findMany({
        where,
        include: transferInclude,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.database.client.transferOrder.count({ where }),
    ]);

    const actorNames = await this.resolveActorNames(
      items.flatMap((item) => [item.createdById]),
    );

    return {
      items: items.map((item) => ({
        id: item.id,
        code: item.code,
        status: item.status,
        fromWarehouse: item.fromWarehouse,
        toWarehouse: item.toWarehouse,
        lineCount: item._count.lines,
        remark: item.remark,
        createdByName: actorNames.get(item.createdById) ?? null,
        createdAt: item.createdAt,
        shippedAt: item.shippedAt,
        receivedAt: item.receivedAt,
      })),
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    };
  }

  async detail(id: string) {
    const transfer = await this.database.client.transferOrder.findUnique({
      where: { id },
      include: {
        ...transferInclude,
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
    if (!transfer) throw new NotFoundException("调拨单不存在");

    const actorNames = await this.resolveActorNames([
      transfer.createdById,
      transfer.approvedById,
      transfer.shippedById,
      ...transfer.lines.map((line) => line.receivedById),
    ]);

    return {
      id: transfer.id,
      code: transfer.code,
      status: transfer.status,
      fromWarehouse: transfer.fromWarehouse,
      toWarehouse: transfer.toWarehouse,
      remark: transfer.remark,
      rejectedReason: transfer.rejectedReason,
      createdByName: actorNames.get(transfer.createdById) ?? null,
      approvedByName: transfer.approvedById
        ? (actorNames.get(transfer.approvedById) ?? null)
        : null,
      shippedByName: transfer.shippedById
        ? (actorNames.get(transfer.shippedById) ?? null)
        : null,
      createdAt: transfer.createdAt,
      submittedAt: transfer.submittedAt,
      approvedAt: transfer.approvedAt,
      lockedAt: transfer.lockedAt,
      shippedAt: transfer.shippedAt,
      receivedAt: transfer.receivedAt,
      completedAt: transfer.completedAt,
      cancelledAt: transfer.cancelledAt,
      lines: transfer.lines.map((line) => ({
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
        exceptionType: line.exceptionType,
        exceptionNote: line.exceptionNote,
        receivedByName: line.receivedById
          ? (actorNames.get(line.receivedById) ?? null)
          : null,
        receivedAt: line.receivedAt,
      })),
    };
  }

  // ---------- 命令:建单与流转 ----------

  /**
   * 创建调拨草稿(DRAFT):校验来源仓/目标仓/序列号归属与可用状态。
   */
  async create(input: CreateTransferDto, request: AuthenticatedRequest) {
    if (input.fromWarehouseId === input.toWarehouseId) {
      throw new BadRequestException("调出仓与调入仓不能相同");
    }
    const [fromWarehouse, toWarehouse] = await Promise.all([
      this.database.client.warehouse.findUnique({
        where: { id: input.fromWarehouseId },
        select: { id: true, name: true },
      }),
      this.database.client.warehouse.findUnique({
        where: { id: input.toWarehouseId },
        select: { id: true, name: true },
      }),
    ]);
    if (!fromWarehouse) throw new NotFoundException("调出仓不存在");
    if (!toWarehouse) throw new NotFoundException("调入仓不存在");
    // 盘点封存中禁止建单(提前拦截,锁定/发出/接收在事务内再各拦一次)
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
        serial.status !== "NORMAL",
    );
    if (unavailable.length > 0) {
      throw new UnprocessableEntityException(
        `以下序列号不在调出仓的正常库存中:${unavailable
          .slice(0, 5)
          .map((serial) => serial.imeiPrimary)
          .join("、")}${unavailable.length > 5 ? " 等" : ""}`,
      );
    }

    const transferId = randomUUID();
    // 单号唯一约束兜底,冲突时重试
    for (let attempt = 0; ; attempt += 1) {
      const code = generateTransferCode();
      try {
        await this.database.client.$transaction([
          this.database.client.transferOrder.create({
            data: {
              id: transferId,
              code,
              fromWarehouseId: input.fromWarehouseId,
              toWarehouseId: input.toWarehouseId,
              remark: input.remark?.trim() || null,
              createdById: request.user.userId,
            },
          }),
          this.database.client.transferLine.createMany({
            data: serials.map((serial) => ({
              id: randomUUID(),
              transferId,
              serialId: serial.id,
              skuId: serial.skuId,
            })),
          }),
          this.database.client.auditLog.create({
            data: {
              actorUserId: request.user.userId,
              action: "transfer.create",
              resource: "transfer",
              resourceId: transferId,
              requestId: request.requestId,
              afterData: {
                code,
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
    return this.detail(transferId);
  }

  /** DRAFT → SUBMITTED */
  async submit(id: string, request: AuthenticatedRequest) {
    await this.transition(id, request, {
      action: "transfer.submit",
      from: [TransferStatus.DRAFT],
      to: TransferStatus.SUBMITTED,
      data: { submittedAt: new Date() },
    });
    return this.detail(id);
  }

  /** SUBMITTED → APPROVED(审批分级规则待权限矩阵签字,当前 transfer:write 即可审批) */
  async approve(id: string, request: AuthenticatedRequest) {
    await this.transition(id, request, {
      action: "transfer.approve",
      from: [TransferStatus.SUBMITTED],
      to: TransferStatus.APPROVED,
      data: { approvedById: request.user.userId, approvedAt: new Date() },
    });
    return this.detail(id);
  }

  /** SUBMITTED → REJECTED */
  async reject(id: string, input: RejectTransferDto, request: AuthenticatedRequest) {
    await this.transition(id, request, {
      action: "transfer.reject",
      from: [TransferStatus.SUBMITTED],
      to: TransferStatus.REJECTED,
      data: {
        approvedById: request.user.userId,
        rejectedReason: input.reason.trim(),
      },
    });
    return this.detail(id);
  }

  /**
   * DRAFT/SUBMITTED/APPROVED → CANCELLED(未锁库存前才允许取消,docs/12 通用规则;
   * 已审批未锁库无库存影响,2026-08-13 补充;已锁库需先解锁退回)
   */
  async cancel(id: string, request: AuthenticatedRequest) {
    await this.transition(id, request, {
      action: "transfer.cancel",
      from: [
        TransferStatus.DRAFT,
        TransferStatus.SUBMITTED,
        TransferStatus.APPROVED,
      ],
      to: TransferStatus.CANCELLED,
      data: { cancelledAt: new Date() },
    });
    return this.detail(id);
  }

  /**
   * 解锁退回:LOCKED → APPROVED,释放已锁定的序列号(LOCKED → NORMAL,计数校验)。
   * 场景:审批锁库后对方取消需求/发不出货,退回后可重新锁定或撤单(2026-08-13 补充)。
   */
  async unlock(id: string, request: AuthenticatedRequest) {
    await this.database.client.$transaction(async (tx) => {
      await this.transitionInTx(tx, id, request, {
        action: "transfer.unlock",
        from: [TransferStatus.LOCKED],
        to: TransferStatus.APPROVED,
        data: { lockedAt: null },
      });

      const lines = await tx.transferLine.findMany({
        where: { transferId: id, status: TransferLineStatus.LOCKED },
        select: { serialId: true },
      });
      const serialIds = lines.map((line) => line.serialId);
      if (serialIds.length > 0) {
        const released = await tx.serialItem.updateMany({
          where: { id: { in: serialIds }, status: "LOCKED" },
          data: { status: "NORMAL" },
        });
        if (released.count !== serialIds.length) {
          throw new ConflictException(
            "解锁失败:部分设备状态已变化,请刷新后重试",
          );
        }
        await tx.transferLine.updateMany({
          where: { transferId: id, status: TransferLineStatus.LOCKED },
          data: { status: TransferLineStatus.PENDING },
        });
      }
    });
    return this.detail(id);
  }

  /**
   * APPROVED → LOCKED:锁定来源库存。
   * 序列号 NORMAL → LOCKED 用 updateMany 原子校验,数量不符即回滚,
   * 防止并发下同一台设备被两张单据同时锁定。
   */
  async lock(id: string, request: AuthenticatedRequest) {
    await this.database.client.$transaction(async (tx) => {
      const transfer = await this.transitionInTx(tx, id, request, {
        action: "transfer.lock",
        from: [TransferStatus.APPROVED],
        to: TransferStatus.LOCKED,
        data: { lockedAt: new Date() },
      });
      // 盘点封存检查:与库存变动同一事务
      await this.freeze.assertNotFrozen(
        [transfer.fromWarehouseId, transfer.toWarehouseId],
        tx,
      );

      const lines = await tx.transferLine.findMany({
        where: { transferId: id, status: TransferLineStatus.PENDING },
        select: { serialId: true },
      });
      if (lines.length === 0) {
        throw new UnprocessableEntityException("调拨单没有待锁定明细");
      }
      const serialIds = lines.map((line) => line.serialId);
      const locked = await tx.serialItem.updateMany({
        where: {
          id: { in: serialIds },
          status: "NORMAL",
          currentWarehouseId: transfer.fromWarehouseId,
        },
        data: { status: "LOCKED" },
      });
      if (locked.count !== serialIds.length) {
        throw new ConflictException(
          `锁定失败:${serialIds.length - locked.count} 台设备已不在调出仓正常库存(可能被其他单据占用),请刷新后重试`,
        );
      }
      await tx.transferLine.updateMany({
        where: { transferId: id, status: TransferLineStatus.PENDING },
        data: { status: TransferLineStatus.LOCKED },
      });
    });
    return this.detail(id);
  }

  /**
   * LOCKED → IN_TRANSIT:发出/出库。
   * 序列号 LOCKED → IN_TRANSIT(位置仍在调出仓,接收确认前不进入可售库存),
   * 同事务写 TRANSFER_OUT 库存流水(一机一条)。
   */
  async ship(id: string, request: AuthenticatedRequest) {
    await this.database.client.$transaction(async (tx) => {
      const transfer = await this.transitionInTx(tx, id, request, {
        action: "transfer.ship",
        from: [TransferStatus.LOCKED],
        to: TransferStatus.IN_TRANSIT,
        data: { shippedById: request.user.userId, shippedAt: new Date() },
      });
      // 盘点封存检查:与库存变动同一事务
      await this.freeze.assertNotFrozen(
        [transfer.fromWarehouseId, transfer.toWarehouseId],
        tx,
      );

      const lines = await tx.transferLine.findMany({
        where: { transferId: id, status: TransferLineStatus.LOCKED },
        select: { serialId: true, skuId: true },
      });
      if (lines.length === 0) {
        throw new UnprocessableEntityException("调拨单没有已锁定明细");
      }
      const serialIds = lines.map((line) => line.serialId);
      const shipped = await tx.serialItem.updateMany({
        where: { id: { in: serialIds }, status: "LOCKED" },
        data: { status: "IN_TRANSIT" },
      });
      if (shipped.count !== serialIds.length) {
        throw new ConflictException("发出失败:部分设备状态已变化,请刷新后重试");
      }
      await tx.transferLine.updateMany({
        where: { transferId: id, status: TransferLineStatus.LOCKED },
        data: { status: TransferLineStatus.SHIPPED },
      });
      const occurredAt = new Date();
      await tx.inventoryMovement.createMany({
        data: lines.map((line) => ({
          id: randomUUID(),
          documentId: id,
          documentType: "TRANSFER",
          movementType: "TRANSFER_OUT" as const,
          skuId: line.skuId,
          serialId: line.serialId,
          quantity: 1,
          fromWarehouseId: transfer.fromWarehouseId,
          toWarehouseId: transfer.toWarehouseId,
          occurredAt,
        })),
      });
    });
    return this.detail(id);
  }

  /**
   * 扫码接收(支持部分接收):IN_TRANSIT/PARTIALLY_RECEIVED 下,
   * 行 SHIPPED → RECEIVED,序列号 IN_TRANSIT → NORMAL 并落位调入仓,
   * 写 TRANSFER_IN 流水;主单按明细聚合推进(docs/12)。
   */
  async receive(id: string, input: ReceiveTransferDto, request: AuthenticatedRequest) {
    await this.database.client.$transaction(async (tx) => {
      const transfer = await tx.transferOrder.findUnique({
        where: { id },
        select: { id: true, status: true, toWarehouseId: true, code: true },
      });
      if (!transfer) throw new NotFoundException("调拨单不存在");
      this.assertStatus(transfer.status, [
        TransferStatus.IN_TRANSIT,
        TransferStatus.PARTIALLY_RECEIVED,
      ]);
      // 盘点封存检查:调入仓封存期间禁止接收入库
      await this.freeze.assertNotFrozen([transfer.toWarehouseId], tx);

      const serialIds = [...new Set(input.serialIds)];
      const lines = await tx.transferLine.findMany({
        where: { transferId: id, serialId: { in: serialIds } },
        select: { serialId: true, status: true },
      });
      const lineBySerial = new Map(lines.map((line) => [line.serialId, line]));
      const invalid = serialIds.filter(
        (serialId) =>
          lineBySerial.get(serialId)?.status !== TransferLineStatus.SHIPPED,
      );
      if (invalid.length > 0) {
        throw new UnprocessableEntityException(
          `以下设备不属于本单在途明细,无法接收:${invalid.slice(0, 5).join("、")}${invalid.length > 5 ? " 等" : ""}`,
        );
      }

      const received = await tx.serialItem.updateMany({
        where: { id: { in: serialIds }, status: "IN_TRANSIT" },
        data: { status: "NORMAL", currentWarehouseId: transfer.toWarehouseId },
      });
      if (received.count !== serialIds.length) {
        throw new ConflictException("接收失败:部分设备状态已变化,请刷新后重试");
      }
      const receivedAt = new Date();
      await tx.transferLine.updateMany({
        where: { transferId: id, serialId: { in: serialIds } },
        data: {
          status: TransferLineStatus.RECEIVED,
          receivedById: request.user.userId,
          receivedAt,
        },
      });
      const lineSkus = await tx.transferLine.findMany({
        where: { transferId: id, serialId: { in: serialIds } },
        select: { serialId: true, skuId: true },
      });
      const fromWarehouseId = (
        await tx.transferOrder.findUniqueOrThrow({
          where: { id },
          select: { fromWarehouseId: true },
        })
      ).fromWarehouseId;
      await tx.inventoryMovement.createMany({
        data: lineSkus.map((line) => ({
          id: randomUUID(),
          documentId: id,
          documentType: "TRANSFER",
          movementType: "TRANSFER_IN" as const,
          skuId: line.skuId,
          serialId: line.serialId,
          quantity: 1,
          fromWarehouseId,
          toWarehouseId: transfer.toWarehouseId,
          occurredAt: receivedAt,
        })),
      });

      await this.refreshReceivingStatus(tx, id, transfer.status, {
        request,
        action: "transfer.receive",
        extra: { receivedCount: serialIds.length },
      });
    });
    return this.detail(id);
  }

  /**
   * 差异登记(少货/错货/损坏/拒收/超时):行 SHIPPED → EXCEPTION,
   * 序列号 IN_TRANSIT → ABNORMAL(位置保留在调出仓,待差异处理单据闭环);
   * 目标方确认前不进入正常可售库存(docs/12)。
   */
  async markExceptions(
    id: string,
    input: MarkTransferExceptionsDto,
    request: AuthenticatedRequest,
  ) {
    await this.database.client.$transaction(async (tx) => {
      const transfer = await tx.transferOrder.findUnique({
        where: { id },
        select: { id: true, status: true },
      });
      if (!transfer) throw new NotFoundException("调拨单不存在");
      this.assertStatus(transfer.status, [
        TransferStatus.IN_TRANSIT,
        TransferStatus.PARTIALLY_RECEIVED,
      ]);

      const serialIds = input.exceptions.map((item) => item.serialId);
      if (new Set(serialIds).size !== serialIds.length) {
        throw new BadRequestException("差异明细存在重复序列号");
      }
      const lines = await tx.transferLine.findMany({
        where: { transferId: id, serialId: { in: serialIds } },
        select: { serialId: true, status: true },
      });
      const lineBySerial = new Map(lines.map((line) => [line.serialId, line]));
      const invalid = serialIds.filter(
        (serialId) =>
          lineBySerial.get(serialId)?.status !== TransferLineStatus.SHIPPED,
      );
      if (invalid.length > 0) {
        throw new UnprocessableEntityException(
          `以下设备不属于本单在途明细,无法登记差异:${invalid.slice(0, 5).join("、")}${invalid.length > 5 ? " 等" : ""}`,
        );
      }

      const marked = await tx.serialItem.updateMany({
        where: { id: { in: serialIds }, status: "IN_TRANSIT" },
        data: { status: "ABNORMAL" },
      });
      if (marked.count !== serialIds.length) {
        throw new ConflictException("差异登记失败:部分设备状态已变化,请刷新后重试");
      }
      for (const exception of input.exceptions) {
        await tx.transferLine.updateMany({
          where: { transferId: id, serialId: exception.serialId },
          data: {
            status: TransferLineStatus.EXCEPTION,
            exceptionType: exception.type as TransferExceptionType,
            exceptionNote: exception.note?.trim() || null,
          },
        });
      }

      await this.refreshReceivingStatus(tx, id, transfer.status, {
        request,
        action: "transfer.exception",
        extra: {
          exceptionCount: input.exceptions.length,
          types: input.exceptions.map((item) => item.type),
        },
      });
    });
    return this.detail(id);
  }

  /** RECEIVED → COMPLETED:双方对账完成。差异单(EXCEPTION)需先由差异处理闭环(阶段 2 后续) */
  async complete(id: string, request: AuthenticatedRequest) {
    await this.transition(id, request, {
      action: "transfer.complete",
      from: [TransferStatus.RECEIVED],
      to: TransferStatus.COMPLETED,
      data: { completedAt: new Date() },
    });
    return this.detail(id);
  }

  // ---------- 内部工具 ----------

  /** 校验当前状态是否在允许的前置状态内,否则 422(docs/12:跳步必须返回明确业务错误) */
  private assertStatus(current: TransferStatus, allowed: TransferStatus[]): void {
    if (!allowed.includes(current)) {
      throw new UnprocessableEntityException(
        `当前状态(${current})不允许该操作,期望状态:${allowed.join("/")}`,
      );
    }
  }

  /**
   * 通用状态转换(独立事务):updateMany + 前置状态条件保证原子性,
   * 并发下重复提交只有一个成功,其余返回 409/422。
   */
  private async transition(
    id: string,
    request: AuthenticatedRequest,
    options: {
      action: string;
      from: TransferStatus[];
      to: TransferStatus;
      data?: Prisma.TransferOrderUpdateManyMutationInput;
    },
  ) {
    return this.database.client.$transaction(async (tx) =>
      this.transitionInTx(tx, id, request, options),
    );
  }

  /** 通用状态转换(事务内版本):返回转换后的主单关键字段 */
  private async transitionInTx(
    tx: Prisma.TransactionClient,
    id: string,
    request: AuthenticatedRequest,
    options: {
      action: string;
      from: TransferStatus[];
      to: TransferStatus;
      data?: Prisma.TransferOrderUpdateManyMutationInput;
    },
  ) {
    const transfer = await tx.transferOrder.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        status: true,
        fromWarehouseId: true,
        toWarehouseId: true,
      },
    });
    if (!transfer) throw new NotFoundException("调拨单不存在");
    this.assertStatus(transfer.status, options.from);

    const updated = await tx.transferOrder.updateMany({
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
        resource: "transfer",
        resourceId: id,
        requestId: request.requestId,
        beforeData: { status: transfer.status },
        afterData: { status: options.to, code: transfer.code },
      },
    });
    return transfer;
  }

  /**
   * 接收/差异之后按明细聚合刷新主单状态,并写审计。
   * 进入 RECEIVED 时记录 receivedAt(全部明细处理完成时间)。
   */
  private async refreshReceivingStatus(
    tx: Prisma.TransactionClient,
    id: string,
    previousStatus: TransferStatus,
    audit: {
      request: AuthenticatedRequest;
      action: string;
      extra?: Prisma.InputJsonObject;
    },
  ): Promise<void> {
    const groups = await tx.transferLine.groupBy({
      by: ["status"],
      where: { transferId: id },
      _count: { _all: true },
    });
    const countOf = (status: TransferLineStatus) =>
      groups.find((group) => group.status === status)?._count._all ?? 0;
    const nextStatus = aggregateReceivingStatus({
      shipped: countOf(TransferLineStatus.SHIPPED),
      received: countOf(TransferLineStatus.RECEIVED),
      exception: countOf(TransferLineStatus.EXCEPTION),
    });

    await tx.transferOrder.update({
      where: { id },
      data: {
        status: nextStatus,
        ...(nextStatus === TransferStatus.RECEIVED ||
        nextStatus === TransferStatus.EXCEPTION
          ? { receivedAt: new Date() }
          : {}),
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: audit.request.user.userId,
        action: audit.action,
        resource: "transfer",
        resourceId: id,
        requestId: audit.request.requestId,
        beforeData: { status: previousStatus },
        afterData: { status: nextStatus, ...(audit.extra ?? {}) },
      },
    });
  }

  /** 批量解析操作人姓名(操作人字段不建外键,单独查询) */
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
