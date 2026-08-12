import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  Prisma,
  StocktakeDifferenceType,
  StocktakeStatus,
} from "@jincheng/database";
import { randomBytes, randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { StocktakeFreezeService } from "./stocktake-freeze.service.js";
import {
  CreateStocktakeDto,
  ListStocktakesQueryDto,
  RejectStocktakeDto,
  ScanStocktakeDto,
} from "./stocktake.dto.js";

/** 生成盘点单号:STK-YYYYMMDD-4位十六进制,唯一约束兜底重试 */
export function generateStocktakeCode(now = new Date()): string {
  const ymd = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const suffix = randomBytes(2).toString("hex").toUpperCase();
  return `STK-${ymd}-${suffix}`;
}

/** 账面在库口径:实物应在仓的状态(在途设备实物已发出,不参与盘点基数) */
export const BOOK_STATUSES = ["NORMAL", "LOCKED", "ABNORMAL"] as const;

export interface StocktakeScanInput {
  imei: string;
  /** 按 IMEI 主/副匹配到的序列号(系统外设备为 null) */
  serialId: string | null;
  /** 匹配序列号的当前仓库(用于识别串仓) */
  serialCurrentWarehouseId: string | null;
  serialWarehouseName: string | null;
}

export interface StocktakeDifferenceDraft {
  type: StocktakeDifferenceType;
  serialId: string | null;
  imei: string;
  note: string | null;
}

/**
 * 差异计算纯函数(TC-STK-002):
 * - 盘亏 MISSING:账面在库但实盘未扫到;
 * - 盘盈 UNEXPECTED:实盘扫到但账面无(系统外)或当前位置在其他仓(串仓)。
 * 导出便于不连数据库做单元测试。
 */
export function computeStocktakeDifferences(params: {
  warehouseId: string;
  bookSerials: Array<{ id: string; imeiPrimary: string }>;
  scans: StocktakeScanInput[];
}): StocktakeDifferenceDraft[] {
  const differences: StocktakeDifferenceDraft[] = [];
  const matchedSerialIds = new Set<string>();

  for (const scan of params.scans) {
    if (scan.serialId && scan.serialCurrentWarehouseId === params.warehouseId) {
      matchedSerialIds.add(scan.serialId);
      continue;
    }
    differences.push({
      type: StocktakeDifferenceType.UNEXPECTED,
      serialId: scan.serialId,
      imei: scan.imei,
      note: scan.serialId
        ? `串仓:账面位置为「${scan.serialWarehouseName ?? "未知仓库"}」`
        : "系统外设备:无序列号档案,需人工确认来源(采购补录或修正单据)",
    });
  }

  for (const serial of params.bookSerials) {
    if (!matchedSerialIds.has(serial.id)) {
      differences.push({
        type: StocktakeDifferenceType.MISSING,
        serialId: serial.id,
        imei: serial.imeiPrimary,
        note: "盘亏:账面在库但实盘未扫到",
      });
    }
  }
  return differences;
}

const stocktakeInclude = {
  warehouse: { select: { id: true, code: true, name: true, type: true } },
  _count: { select: { scans: true, differences: true } },
} satisfies Prisma.StocktakeOrderInclude;

@Injectable()
export class StocktakeService {
  constructor(
    private readonly database: DatabaseService,
    private readonly freeze: StocktakeFreezeService,
  ) {}

  // ---------- 查询 ----------

  async list(query: ListStocktakesQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const where: Prisma.StocktakeOrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
    };
    const [items, total] = await this.database.client.$transaction([
      this.database.client.stocktakeOrder.findMany({
        where,
        include: stocktakeInclude,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.database.client.stocktakeOrder.count({ where }),
    ]);
    const actorNames = await this.resolveActorNames(
      items.map((item) => item.createdById),
    );
    return {
      items: items.map((item) => ({
        id: item.id,
        code: item.code,
        status: item.status,
        warehouse: item.warehouse,
        snapshotCount: item.snapshotCount,
        scanCount: item._count.scans,
        differenceCount: item._count.differences,
        remark: item.remark,
        createdByName: actorNames.get(item.createdById) ?? null,
        createdAt: item.createdAt,
        startedAt: item.startedAt,
        postedAt: item.postedAt,
      })),
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    };
  }

  async detail(id: string) {
    const stocktake = await this.database.client.stocktakeOrder.findUnique({
      where: { id },
      include: {
        ...stocktakeInclude,
        differences: { orderBy: [{ type: "asc" }, { createdAt: "asc" }] },
      },
    });
    if (!stocktake) throw new NotFoundException("盘点单不存在");

    // 账面在库数(实时):开盘前供预览,开盘后因封存保持稳定
    const bookCount = await this.database.client.serialItem.count({
      where: {
        currentWarehouseId: stocktake.warehouseId,
        status: { in: [...BOOK_STATUSES] },
      },
    });
    // 已录入的实盘清单(对照勾选盘点需要与账面比对;盘点单通常数百条,一次返回)
    const scans = await this.database.client.stocktakeScan.findMany({
      where: { stocktakeId: id },
      select: { imei: true, serialId: true },
    });
    const matchedCount = scans.filter((scan) => scan.serialId !== null).length;

    const actorNames = await this.resolveActorNames([
      stocktake.createdById,
      stocktake.approvedById,
    ]);

    // 差异附带商品信息(按序列号批量查)
    const differenceSerialIds = stocktake.differences
      .map((difference) => difference.serialId)
      .filter((serialId): serialId is string => serialId !== null);
    const serials =
      differenceSerialIds.length > 0
        ? await this.database.client.serialItem.findMany({
            where: { id: { in: differenceSerialIds } },
            select: {
              id: true,
              status: true,
              sku: { select: { code: true, name: true } },
              currentWarehouse: { select: { name: true } },
            },
          })
        : [];
    const serialById = new Map(serials.map((serial) => [serial.id, serial]));

    return {
      id: stocktake.id,
      code: stocktake.code,
      status: stocktake.status,
      warehouse: stocktake.warehouse,
      snapshotCount: stocktake.snapshotCount,
      bookCount,
      scanCount: stocktake._count.scans,
      matchedCount,
      scans,
      remark: stocktake.remark,
      rejectedReason: stocktake.rejectedReason,
      createdByName: actorNames.get(stocktake.createdById) ?? null,
      approvedByName: stocktake.approvedById
        ? (actorNames.get(stocktake.approvedById) ?? null)
        : null,
      createdAt: stocktake.createdAt,
      startedAt: stocktake.startedAt,
      submittedAt: stocktake.submittedAt,
      approvedAt: stocktake.approvedAt,
      postedAt: stocktake.postedAt,
      cancelledAt: stocktake.cancelledAt,
      differences: stocktake.differences.map((difference) => {
        const serial = difference.serialId
          ? serialById.get(difference.serialId)
          : undefined;
        return {
          id: difference.id,
          type: difference.type,
          imei: difference.imei,
          serialId: difference.serialId,
          skuCode: serial?.sku.code ?? null,
          skuName: serial?.sku.name ?? null,
          serialStatus: serial?.status ?? null,
          note: difference.note,
        };
      }),
    };
  }

  // ---------- 命令 ----------

  /** 创建盘点草稿(DRAFT):同仓库不允许并存未完结盘点单 */
  async create(input: CreateStocktakeDto, request: AuthenticatedRequest) {
    const warehouse = await this.database.client.warehouse.findUnique({
      where: { id: input.warehouseId },
      select: { id: true, name: true },
    });
    if (!warehouse) throw new NotFoundException("仓库不存在");

    const active = await this.database.client.stocktakeOrder.findFirst({
      where: {
        warehouseId: input.warehouseId,
        status: {
          in: [
            StocktakeStatus.DRAFT,
            ...StocktakeFreezeService.FROZEN_STATUSES,
          ],
        },
      },
      select: { code: true, status: true },
    });
    if (active) {
      throw new ConflictException(
        `该仓库已有未完结盘点单(${active.code},状态 ${active.status}),不允许重复创建`,
      );
    }

    const stocktakeId = randomUUID();
    for (let attempt = 0; ; attempt += 1) {
      const code = generateStocktakeCode();
      try {
        await this.database.client.$transaction([
          this.database.client.stocktakeOrder.create({
            data: {
              id: stocktakeId,
              code,
              warehouseId: input.warehouseId,
              remark: input.remark?.trim() || null,
              createdById: request.user.userId,
            },
          }),
          this.database.client.auditLog.create({
            data: {
              actorUserId: request.user.userId,
              action: "stocktake.create",
              resource: "stocktake",
              resourceId: stocktakeId,
              requestId: request.requestId,
              afterData: { code, warehouseId: input.warehouseId },
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
    return this.detail(stocktakeId);
  }

  /**
   * 开始盘点:DRAFT → COUNTING,仓库进入封存窗口(禁止调拨与出入库),
   * 同时记录账面在库数快照。
   */
  async start(id: string, request: AuthenticatedRequest) {
    await this.database.client.$transaction(async (tx) => {
      const stocktake = await this.transitionInTx(tx, id, request, {
        action: "stocktake.start",
        from: [StocktakeStatus.DRAFT],
        to: StocktakeStatus.COUNTING,
        data: { startedAt: new Date() },
      });
      const bookCount = await tx.serialItem.count({
        where: {
          currentWarehouseId: stocktake.warehouseId,
          status: { in: [...BOOK_STATUSES] },
        },
      });
      await tx.stocktakeOrder.update({
        where: { id },
        data: { snapshotCount: bookCount },
      });
    });
    return this.detail(id);
  }

  /** 录入实盘(COUNTING):按 IMEI 主/副匹配账面序列号,单内去重(重复扫描忽略) */
  async scan(id: string, input: ScanStocktakeDto, request: AuthenticatedRequest) {
    const stocktake = await this.database.client.stocktakeOrder.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!stocktake) throw new NotFoundException("盘点单不存在");
    if (stocktake.status !== StocktakeStatus.COUNTING) {
      throw new UnprocessableEntityException(
        `当前状态(${stocktake.status})不允许录入实盘,仅盘点中(COUNTING)可录入`,
      );
    }

    const imeis = [...new Set(input.imeis.map((imei) => imei.trim()).filter(Boolean))];
    // 按 IMEI 主/副批量匹配序列号档案
    const serials = await this.database.client.serialItem.findMany({
      where: {
        OR: [{ imeiPrimary: { in: imeis } }, { imeiSecondary: { in: imeis } }],
      },
      select: {
        id: true,
        imeiPrimary: true,
        imeiSecondary: true,
      },
    });
    const serialByImei = new Map<string, string>();
    for (const serial of serials) {
      serialByImei.set(serial.imeiPrimary, serial.id);
      if (serial.imeiSecondary) serialByImei.set(serial.imeiSecondary, serial.id);
    }

    const result = await this.database.client.$transaction(async (tx) => {
      const inserted = await tx.stocktakeScan.createMany({
        data: imeis.map((imei) => ({
          id: randomUUID(),
          stocktakeId: id,
          imei,
          serialId: serialByImei.get(imei) ?? null,
          scannedById: request.user.userId,
        })),
        skipDuplicates: true,
      });
      await tx.auditLog.create({
        data: {
          actorUserId: request.user.userId,
          action: "stocktake.scan",
          resource: "stocktake",
          resourceId: id,
          requestId: request.requestId,
          afterData: { submitted: imeis.length, inserted: inserted.count },
        },
      });
      return inserted.count;
    });
    return { inserted: result, duplicated: imeis.length - result };
  }

  /** 提交盘点:COUNTING → SUBMITTED,计算并固化差异快照 */
  async submit(id: string, request: AuthenticatedRequest) {
    await this.database.client.$transaction(async (tx) => {
      const stocktake = await this.transitionInTx(tx, id, request, {
        action: "stocktake.submit",
        from: [StocktakeStatus.COUNTING],
        to: StocktakeStatus.SUBMITTED,
        data: { submittedAt: new Date() },
      });

      const [bookSerials, scans] = await Promise.all([
        tx.serialItem.findMany({
          where: {
            currentWarehouseId: stocktake.warehouseId,
            status: { in: [...BOOK_STATUSES] },
          },
          select: { id: true, imeiPrimary: true },
        }),
        tx.stocktakeScan.findMany({
          where: { stocktakeId: id },
          select: { imei: true, serialId: true },
        }),
      ]);
      // 扫描匹配的序列号当前位置(识别串仓)
      const scanSerialIds = scans
        .map((scan) => scan.serialId)
        .filter((serialId): serialId is string => serialId !== null);
      const scanSerials =
        scanSerialIds.length > 0
          ? await tx.serialItem.findMany({
              where: { id: { in: scanSerialIds } },
              select: {
                id: true,
                currentWarehouseId: true,
                currentWarehouse: { select: { name: true } },
              },
            })
          : [];
      const scanSerialById = new Map(
        scanSerials.map((serial) => [serial.id, serial]),
      );

      const differences = computeStocktakeDifferences({
        warehouseId: stocktake.warehouseId,
        bookSerials,
        scans: scans.map((scan) => {
          const serial = scan.serialId
            ? scanSerialById.get(scan.serialId)
            : undefined;
          return {
            imei: scan.imei,
            serialId: scan.serialId,
            serialCurrentWarehouseId: serial?.currentWarehouseId ?? null,
            serialWarehouseName: serial?.currentWarehouse.name ?? null,
          };
        }),
      });

      // 重新提交前先清旧快照(差异为计算快照,非业务事实)
      await tx.stocktakeDifference.deleteMany({ where: { stocktakeId: id } });
      if (differences.length > 0) {
        await tx.stocktakeDifference.createMany({
          data: differences.map((difference) => ({
            id: randomUUID(),
            stocktakeId: id,
            ...difference,
          })),
        });
      }
      await tx.auditLog.create({
        data: {
          actorUserId: request.user.userId,
          action: "stocktake.difference",
          resource: "stocktake",
          resourceId: id,
          requestId: request.requestId,
          afterData: {
            missing: differences.filter(
              (difference) => difference.type === StocktakeDifferenceType.MISSING,
            ).length,
            unexpected: differences.filter(
              (difference) =>
                difference.type === StocktakeDifferenceType.UNEXPECTED,
            ).length,
          },
        },
      });
    });
    return this.detail(id);
  }

  /** 审批通过:SUBMITTED → APPROVED(审批分级待权限矩阵签字,当前 inventory:write 即可) */
  async approve(id: string, request: AuthenticatedRequest) {
    await this.transition(id, request, {
      action: "stocktake.approve",
      from: [StocktakeStatus.SUBMITTED],
      to: StocktakeStatus.APPROVED,
      data: { approvedById: request.user.userId, approvedAt: new Date() },
    });
    return this.detail(id);
  }

  /** 驳回重盘:SUBMITTED → COUNTING,清除差异快照(仓库保持封存) */
  async reject(id: string, input: RejectStocktakeDto, request: AuthenticatedRequest) {
    await this.database.client.$transaction(async (tx) => {
      await this.transitionInTx(tx, id, request, {
        action: "stocktake.reject",
        from: [StocktakeStatus.SUBMITTED],
        to: StocktakeStatus.COUNTING,
        data: { rejectedReason: input.reason.trim(), submittedAt: null },
      });
      await tx.stocktakeDifference.deleteMany({ where: { stocktakeId: id } });
    });
    return this.detail(id);
  }

  /**
   * 过账:APPROVED → POSTED,解除封存。
   * 盘亏设备转 ABNORMAL 并写 STOCK_LOSS 流水(留档不删,AGENTS 第 4 条;
   * 后续由报损/找回单据闭环——待签字)。
   * 盘盈/串仓不自动入库或移仓(成本与归属信息不足,需人工走采购补录或修正单据——待签字)。
   */
  async post(id: string, request: AuthenticatedRequest) {
    await this.database.client.$transaction(async (tx) => {
      const stocktake = await this.transitionInTx(tx, id, request, {
        action: "stocktake.post",
        from: [StocktakeStatus.APPROVED],
        to: StocktakeStatus.POSTED,
        data: { postedAt: new Date() },
      });

      const missing = await tx.stocktakeDifference.findMany({
        where: { stocktakeId: id, type: StocktakeDifferenceType.MISSING },
        select: { serialId: true },
      });
      const missingSerialIds = missing
        .map((difference) => difference.serialId)
        .filter((serialId): serialId is string => serialId !== null);
      if (missingSerialIds.length > 0) {
        // 盘亏设备仍占账面位置,转异常状态等待报损/找回闭环
        const serials = await tx.serialItem.findMany({
          where: { id: { in: missingSerialIds } },
          select: { id: true, skuId: true },
        });
        await tx.serialItem.updateMany({
          where: { id: { in: missingSerialIds } },
          data: { status: "ABNORMAL" },
        });
        const occurredAt = new Date();
        await tx.inventoryMovement.createMany({
          data: serials.map((serial) => ({
            id: randomUUID(),
            documentId: id,
            documentType: "STOCKTAKE",
            movementType: "STOCK_LOSS" as const,
            skuId: serial.skuId,
            serialId: serial.id,
            quantity: 1,
            fromWarehouseId: stocktake.warehouseId,
            toWarehouseId: null,
            occurredAt,
          })),
        });
      }
      await tx.auditLog.create({
        data: {
          actorUserId: request.user.userId,
          action: "stocktake.post.loss",
          resource: "stocktake",
          resourceId: id,
          requestId: request.requestId,
          afterData: { lossCount: missingSerialIds.length },
        },
      });
    });
    return this.detail(id);
  }

  /** 取消:DRAFT/COUNTING → CANCELLED(解除封存;已提交的需先驳回) */
  async cancel(id: string, request: AuthenticatedRequest) {
    await this.transition(id, request, {
      action: "stocktake.cancel",
      from: [StocktakeStatus.DRAFT, StocktakeStatus.COUNTING],
      to: StocktakeStatus.CANCELLED,
      data: { cancelledAt: new Date() },
    });
    return this.detail(id);
  }

  // ---------- 内部工具(与调拨模块同模式) ----------

  private assertStatus(
    current: StocktakeStatus,
    allowed: StocktakeStatus[],
  ): void {
    if (!allowed.includes(current)) {
      throw new UnprocessableEntityException(
        `当前状态(${current})不允许该操作,期望状态:${allowed.join("/")}`,
      );
    }
  }

  private async transition(
    id: string,
    request: AuthenticatedRequest,
    options: {
      action: string;
      from: StocktakeStatus[];
      to: StocktakeStatus;
      data?: Prisma.StocktakeOrderUpdateManyMutationInput;
    },
  ) {
    return this.database.client.$transaction(async (tx) =>
      this.transitionInTx(tx, id, request, options),
    );
  }

  private async transitionInTx(
    tx: Prisma.TransactionClient,
    id: string,
    request: AuthenticatedRequest,
    options: {
      action: string;
      from: StocktakeStatus[];
      to: StocktakeStatus;
      data?: Prisma.StocktakeOrderUpdateManyMutationInput;
    },
  ) {
    const stocktake = await tx.stocktakeOrder.findUnique({
      where: { id },
      select: { id: true, code: true, status: true, warehouseId: true },
    });
    if (!stocktake) throw new NotFoundException("盘点单不存在");
    this.assertStatus(stocktake.status, options.from);

    const updated = await tx.stocktakeOrder.updateMany({
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
        resource: "stocktake",
        resourceId: id,
        requestId: request.requestId,
        beforeData: { status: stocktake.status },
        afterData: { status: options.to, code: stocktake.code },
      },
    });
    return stocktake;
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
