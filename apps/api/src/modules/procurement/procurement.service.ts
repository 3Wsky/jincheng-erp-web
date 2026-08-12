import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  Prisma,
  PurchaseApprovalStatus,
  PurchasePaymentStatus,
  PurchaseReceiptStatus,
} from "@jincheng/database";
import { randomBytes, randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { StocktakeFreezeService } from "../stocktake/stocktake-freeze.service.js";
import {
  CreatePurchaseOrderDto,
  CreatePurchasePaymentDto,
  CreatePurchaseReceiptDto,
  CreateSupplierDto,
  ListPurchaseOrdersQueryDto,
  ListSuppliersQueryDto,
  RejectPurchaseOrderDto,
  UpdateSupplierDto,
} from "./procurement.dto.js";

/**
 * 付款维度聚合(docs/12 第 3 节):
 * 导出为纯函数便于单元测试(TC-PUR-002):
 * - paidAmount <= 0 → UNPAID;
 * - 0 < paidAmount < totalAmount → PARTIALLY_PAID;
 * - paidAmount >= totalAmount → PAID。
 */
export function aggregatePaymentStatus(
  paidAmount: string | number,
  totalAmount: string | number,
): PurchasePaymentStatus {
  const paid = new Prisma.Decimal(paidAmount);
  const total = new Prisma.Decimal(totalAmount);
  if (paid.lte(0)) return PurchasePaymentStatus.UNPAID;
  return paid.gte(total)
    ? PurchasePaymentStatus.PAID
    : PurchasePaymentStatus.PARTIALLY_PAID;
}

/**
 * 收货维度聚合(docs/12 第 3 节):按全部明细行判定:
 * - 全部行 receivedQuantity >= quantity → RECEIVED;
 * - 任一行 receivedQuantity > 0 → PARTIALLY_RECEIVED;
 * - 否则 NOT_RECEIVED(空明细同样视为未收货)。
 */
export function aggregateReceiptStatus(
  lines: Array<{ quantity: number; receivedQuantity: number }>,
): PurchaseReceiptStatus {
  if (lines.length === 0) return PurchaseReceiptStatus.NOT_RECEIVED;
  if (lines.every((line) => line.receivedQuantity >= line.quantity)) {
    return PurchaseReceiptStatus.RECEIVED;
  }
  return lines.some((line) => line.receivedQuantity > 0)
    ? PurchaseReceiptStatus.PARTIALLY_RECEIVED
    : PurchaseReceiptStatus.NOT_RECEIVED;
}

/** 生成采购单号:PUR-YYYYMMDD-4位十六进制,唯一约束兜底冲突重试 */
export function generatePurchaseCode(now = new Date()): string {
  return `PUR-${formatYmd(now)}-${randomBytes(2).toString("hex").toUpperCase()}`;
}

/** 生成收货批次号:RCP-YYYYMMDD-4位十六进制,唯一约束兜底冲突重试 */
export function generateReceiptCode(now = new Date()): string {
  return `RCP-${formatYmd(now)}-${randomBytes(2).toString("hex").toUpperCase()}`;
}

function formatYmd(now: Date): string {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
}

/** 列表共用的主单 include(明细行只取数量做聚合展示) */
const orderListInclude = {
  supplier: { select: { id: true, code: true, name: true } },
  warehouse: { select: { id: true, code: true, name: true, type: true } },
  lines: { select: { quantity: true, receivedQuantity: true } },
} satisfies Prisma.PurchaseOrderInclude;

@Injectable()
export class ProcurementService {
  constructor(
    private readonly database: DatabaseService,
    private readonly freeze: StocktakeFreezeService,
  ) {}

  // ---------- 供应商 ----------

  async listSuppliers(query: ListSuppliersQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const search = query.search?.trim();
    const where: Prisma.SupplierWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: "insensitive" } },
              { name: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.database.client.$transaction([
      this.database.client.supplier.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.database.client.supplier.count({ where }),
    ]);
    return {
      items,
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    };
  }

  async createSupplier(input: CreateSupplierDto, request: AuthenticatedRequest) {
    const id = randomUUID();
    try {
      const [supplier] = await this.database.client.$transaction([
        this.database.client.supplier.create({
          data: {
            id,
            code: input.code.trim(),
            name: input.name.trim(),
            contactName: input.contactName?.trim() || null,
            contactPhone: input.contactPhone?.trim() || null,
          },
        }),
        this.database.client.auditLog.create({
          data: {
            actorUserId: request.user.userId,
            action: "supplier.create",
            resource: "supplier",
            resourceId: id,
            requestId: request.requestId,
            afterData: { code: input.code.trim(), name: input.name.trim() },
          },
        }),
      ]);
      return supplier;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException(`供应商编码已存在:${input.code.trim()}`);
      }
      throw error;
    }
  }

  async updateSupplier(
    id: string,
    input: UpdateSupplierDto,
    request: AuthenticatedRequest,
  ) {
    if (
      input.name === undefined &&
      input.contactName === undefined &&
      input.contactPhone === undefined &&
      input.status === undefined
    ) {
      throw new BadRequestException("至少提供一个待修改字段");
    }
    const supplier = await this.database.client.supplier.findUnique({
      where: { id },
    });
    if (!supplier) throw new NotFoundException("供应商不存在");

    const data: Prisma.SupplierUpdateInput = {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.contactName !== undefined
        ? { contactName: input.contactName.trim() || null }
        : {}),
      ...(input.contactPhone !== undefined
        ? { contactPhone: input.contactPhone.trim() || null }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    };
    const [updated] = await this.database.client.$transaction([
      this.database.client.supplier.update({ where: { id }, data }),
      this.database.client.auditLog.create({
        data: {
          actorUserId: request.user.userId,
          action: "supplier.update",
          resource: "supplier",
          resourceId: id,
          requestId: request.requestId,
          beforeData: {
            name: supplier.name,
            contactName: supplier.contactName,
            contactPhone: supplier.contactPhone,
            status: supplier.status,
          },
          afterData: { ...input },
        },
      }),
    ]);
    return updated;
  }

  // ---------- 采购单查询 ----------

  async listOrders(query: ListPurchaseOrdersQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const where: Prisma.PurchaseOrderWhereInput = {
      ...(query.approvalStatus ? { approvalStatus: query.approvalStatus } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.search?.trim()
        ? { code: { contains: query.search.trim(), mode: "insensitive" } }
        : {}),
    };
    const [items, total] = await this.database.client.$transaction([
      this.database.client.purchaseOrder.findMany({
        where,
        include: orderListInclude,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.database.client.purchaseOrder.count({ where }),
    ]);
    const actorNames = await this.resolveActorNames(
      items.map((item) => item.createdById),
    );
    return {
      items: items.map((item) => ({
        id: item.id,
        code: item.code,
        approvalStatus: item.approvalStatus,
        paymentStatus: item.paymentStatus,
        receiptStatus: item.receiptStatus,
        supplier: item.supplier,
        warehouse: item.warehouse,
        totalAmount: item.totalAmount.toString(),
        paidAmount: item.paidAmount.toString(),
        orderedQuantitySum: item.lines.reduce((sum, line) => sum + line.quantity, 0),
        receivedQuantitySum: item.lines.reduce(
          (sum, line) => sum + line.receivedQuantity,
          0,
        ),
        lineCount: item.lines.length,
        remark: item.remark,
        createdByName: actorNames.get(item.createdById) ?? null,
        createdAt: item.createdAt,
        completedAt: item.completedAt,
      })),
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    };
  }

  async detail(id: string) {
    const order = await this.database.client.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, code: true, name: true } },
        warehouse: { select: { id: true, code: true, name: true, type: true } },
        lines: {
          orderBy: { createdAt: "asc" },
          include: {
            sku: {
              select: {
                code: true,
                name: true,
                product: { select: { brand: true, modelName: true } },
              },
            },
          },
        },
        payments: { orderBy: { paidAt: "asc" } },
        receipts: {
          orderBy: { receivedAt: "asc" },
          include: {
            items: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                purchaseLineId: true,
                serialId: true,
                imeiPrimary: true,
              },
            },
          },
        },
      },
    });
    if (!order) throw new NotFoundException("采购单不存在");

    const actorNames = await this.resolveActorNames([
      order.createdById,
      order.approvedById,
      ...order.payments.map((payment) => payment.createdById),
      ...order.receipts.map((receipt) => receipt.receivedById),
    ]);

    return {
      id: order.id,
      code: order.code,
      approvalStatus: order.approvalStatus,
      paymentStatus: order.paymentStatus,
      receiptStatus: order.receiptStatus,
      supplier: order.supplier,
      warehouse: order.warehouse,
      totalAmount: order.totalAmount.toString(),
      paidAmount: order.paidAmount.toString(),
      // 已付未到/到货未付由前端用以下原始数展示:已付 X/总额 Y、已收 N/共 M 台
      orderedQuantitySum: order.lines.reduce((sum, line) => sum + line.quantity, 0),
      receivedQuantitySum: order.lines.reduce(
        (sum, line) => sum + line.receivedQuantity,
        0,
      ),
      remark: order.remark,
      rejectedReason: order.rejectedReason,
      createdByName: actorNames.get(order.createdById) ?? null,
      approvedByName: order.approvedById
        ? (actorNames.get(order.approvedById) ?? null)
        : null,
      createdAt: order.createdAt,
      submittedAt: order.submittedAt,
      approvedAt: order.approvedAt,
      completedAt: order.completedAt,
      cancelledAt: order.cancelledAt,
      lines: order.lines.map((line) => ({
        id: line.id,
        skuId: line.skuId,
        skuCode: line.sku.code,
        skuName: line.sku.name,
        productBrand: line.sku.product.brand,
        productModel: line.sku.product.modelName,
        quantity: line.quantity,
        unitPrice: line.unitPrice.toString(),
        lineTotal: line.unitPrice.mul(line.quantity).toString(),
        receivedQuantity: line.receivedQuantity,
      })),
      payments: order.payments.map((payment) => ({
        id: payment.id,
        amount: payment.amount.toString(),
        method: payment.method,
        note: payment.note,
        paidAt: payment.paidAt,
        createdByName: actorNames.get(payment.createdById) ?? null,
        createdAt: payment.createdAt,
      })),
      receipts: order.receipts.map((receipt) => ({
        id: receipt.id,
        code: receipt.code,
        note: receipt.note,
        receivedAt: receipt.receivedAt,
        receivedByName: actorNames.get(receipt.receivedById) ?? null,
        itemCount: receipt.items.length,
        items: receipt.items,
      })),
    };
  }

  // ---------- 采购单命令 ----------

  /**
   * 创建采购草稿(DRAFT):校验供应商/收货仓/SKU 存在且启用,
   * totalAmount = Σ 行小计(Decimal 精确累加)。
   */
  async create(input: CreatePurchaseOrderDto, request: AuthenticatedRequest) {
    const skuIds = input.lines.map((line) => line.skuId);
    if (new Set(skuIds).size !== skuIds.length) {
      throw new BadRequestException("明细行存在重复 SKU,请合并数量后提交");
    }

    const [supplier, warehouse, skus] = await Promise.all([
      this.database.client.supplier.findUnique({
        where: { id: input.supplierId },
        select: { id: true, name: true, status: true },
      }),
      this.database.client.warehouse.findUnique({
        where: { id: input.warehouseId },
        select: { id: true, name: true },
      }),
      this.database.client.sku.findMany({
        where: { id: { in: skuIds } },
        select: { id: true, code: true, status: true },
      }),
    ]);
    if (!supplier) throw new NotFoundException("供应商不存在");
    if (supplier.status !== "ACTIVE") {
      throw new UnprocessableEntityException(`供应商已停用:${supplier.name}`);
    }
    if (!warehouse) throw new NotFoundException("收货仓不存在");

    const skuById = new Map(skus.map((sku) => [sku.id, sku]));
    const missingSkus = skuIds.filter((skuId) => !skuById.has(skuId));
    if (missingSkus.length > 0) {
      throw new UnprocessableEntityException(
        `SKU 不存在:${missingSkus.slice(0, 5).join("、")}${missingSkus.length > 5 ? " 等" : ""}`,
      );
    }
    const inactiveSkus = skus.filter((sku) => sku.status !== "ACTIVE");
    if (inactiveSkus.length > 0) {
      throw new UnprocessableEntityException(
        `以下 SKU 已停用:${inactiveSkus
          .slice(0, 5)
          .map((sku) => sku.code)
          .join("、")}${inactiveSkus.length > 5 ? " 等" : ""}`,
      );
    }

    // 总额 = Σ 数量 × 单价(Decimal 精确计算,禁止浮点)
    const totalAmount = input.lines.reduce(
      (sum, line) => sum.add(new Prisma.Decimal(line.unitPrice).mul(line.quantity)),
      new Prisma.Decimal(0),
    );
    if (totalAmount.lte(0)) {
      throw new UnprocessableEntityException("采购总额必须大于 0,请检查单价");
    }

    const orderId = randomUUID();
    // 单号唯一约束兜底,冲突时重试
    for (let attempt = 0; ; attempt += 1) {
      const code = generatePurchaseCode();
      try {
        await this.database.client.$transaction([
          this.database.client.purchaseOrder.create({
            data: {
              id: orderId,
              code,
              supplierId: input.supplierId,
              warehouseId: input.warehouseId,
              totalAmount,
              remark: input.remark?.trim() || null,
              createdById: request.user.userId,
            },
          }),
          this.database.client.purchaseLine.createMany({
            data: input.lines.map((line) => ({
              id: randomUUID(),
              purchaseOrderId: orderId,
              skuId: line.skuId,
              quantity: line.quantity,
              unitPrice: new Prisma.Decimal(line.unitPrice),
            })),
          }),
          this.database.client.auditLog.create({
            data: {
              actorUserId: request.user.userId,
              action: "procurement.create",
              resource: "procurement",
              resourceId: orderId,
              requestId: request.requestId,
              afterData: {
                code,
                supplierId: input.supplierId,
                warehouseId: input.warehouseId,
                lineCount: input.lines.length,
                totalAmount: totalAmount.toString(),
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
    return this.detail(orderId);
  }

  /** DRAFT → SUBMITTED */
  async submit(id: string, request: AuthenticatedRequest) {
    await this.transition(id, request, {
      action: "procurement.submit",
      from: [PurchaseApprovalStatus.DRAFT],
      to: PurchaseApprovalStatus.SUBMITTED,
      data: { submittedAt: new Date() },
    });
    return this.detail(id);
  }

  /** SUBMITTED → APPROVED(审批分级按金额/角色的规则待权限矩阵签字,当前 procurement:write 即可审批) */
  async approve(id: string, request: AuthenticatedRequest) {
    await this.transition(id, request, {
      action: "procurement.approve",
      from: [PurchaseApprovalStatus.SUBMITTED],
      to: PurchaseApprovalStatus.APPROVED,
      data: { approvedById: request.user.userId, approvedAt: new Date() },
    });
    return this.detail(id);
  }

  /** SUBMITTED → REJECTED(必填原因) */
  async reject(
    id: string,
    input: RejectPurchaseOrderDto,
    request: AuthenticatedRequest,
  ) {
    await this.transition(id, request, {
      action: "procurement.reject",
      from: [PurchaseApprovalStatus.SUBMITTED],
      to: PurchaseApprovalStatus.REJECTED,
      data: {
        approvedById: request.user.userId,
        rejectedReason: input.reason.trim(),
      },
    });
    return this.detail(id);
  }

  /** DRAFT/SUBMITTED → CANCELLED(审批通过后不允许取消,需走冲销/反向单据,docs/12 通用规则) */
  async cancel(id: string, request: AuthenticatedRequest) {
    await this.transition(id, request, {
      action: "procurement.cancel",
      from: [PurchaseApprovalStatus.DRAFT, PurchaseApprovalStatus.SUBMITTED],
      to: PurchaseApprovalStatus.CANCELLED,
      data: { cancelledAt: new Date() },
    });
    return this.detail(id);
  }

  /**
   * 登记付款:仅审批通过后允许;事务内创建付款单据 + 主单 paidAmount 累加
   * + paymentStatus 重算 + 审计(AGENTS 第 1 条:资金变化由单据驱动)。
   * 累计付款不得超过订单总额(超付/预付容差规则待签字,当前一律拒绝)。
   */
  async addPayment(
    id: string,
    input: CreatePurchasePaymentDto,
    request: AuthenticatedRequest,
  ) {
    const amount = new Prisma.Decimal(input.amount);
    if (amount.lte(0)) {
      throw new UnprocessableEntityException("付款金额必须大于 0");
    }
    await this.database.client.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.findUnique({
        where: { id },
        select: {
          id: true,
          code: true,
          approvalStatus: true,
          paymentStatus: true,
          totalAmount: true,
          paidAmount: true,
        },
      });
      if (!order) throw new NotFoundException("采购单不存在");
      if (order.approvalStatus !== PurchaseApprovalStatus.APPROVED) {
        throw new UnprocessableEntityException(
          `当前审批状态(${order.approvalStatus})不允许登记付款,需先审批通过`,
        );
      }
      const newPaid = order.paidAmount.add(amount);
      if (newPaid.gt(order.totalAmount)) {
        throw new UnprocessableEntityException(
          `累计付款(${newPaid.toString()})不能超过订单总额(${order.totalAmount.toString()})`,
        );
      }
      const paidAt = new Date();
      await tx.purchasePayment.create({
        data: {
          id: randomUUID(),
          purchaseOrderId: id,
          amount,
          method: input.method.trim(),
          note: input.note?.trim() || null,
          createdById: request.user.userId,
          paidAt,
        },
      });
      const nextStatus = aggregatePaymentStatus(
        newPaid.toString(),
        order.totalAmount.toString(),
      );
      // paidAmount 前置值条件:并发付款只有一个成功,其余 409(与调拨 updateMany 模式一致)
      const updated = await tx.purchaseOrder.updateMany({
        where: {
          id,
          approvalStatus: PurchaseApprovalStatus.APPROVED,
          paidAmount: order.paidAmount,
        },
        data: { paidAmount: newPaid, paymentStatus: nextStatus },
      });
      if (updated.count !== 1) {
        throw new ConflictException("付款进度已被其他操作变更,请刷新后重试");
      }
      await tx.auditLog.create({
        data: {
          actorUserId: request.user.userId,
          action: "procurement.payment",
          resource: "procurement",
          resourceId: id,
          requestId: request.requestId,
          beforeData: {
            paymentStatus: order.paymentStatus,
            paidAmount: order.paidAmount.toString(),
          },
          afterData: {
            paymentStatus: nextStatus,
            paidAmount: newPaid.toString(),
            amount: amount.toString(),
            method: input.method.trim(),
            code: order.code,
          },
        },
      });
    });
    return this.detail(id);
  }

  /**
   * 扫码收货:仅审批通过后允许;事务内:
   * 1. 校验行属于本单且不超收(超收容差待签字,当前一律拒绝);
   * 2. 校验 IMEI 公司范围内不存在(一机一码,AGENTS 第 2 条);
   * 3. 逐台创建 SerialItem(unitCost 按行单价暂记——成本分摊规则待签字);
   * 4. 创建收货批次 + 明细;行 receivedQuantity 累加(前置值防并发);
   * 5. 主单收货维度按全部行聚合重算;
   * 6. 每台写一条 PURCHASE_RECEIPT 库存流水(单据驱动库存,AGENTS 第 1 条);
   * 7. 同事务落审计。
   */
  async addReceipt(
    id: string,
    input: CreatePurchaseReceiptDto,
    request: AuthenticatedRequest,
  ) {
    // 归集各行的 IMEI(同一行可能拆多个 item,合并计数)
    const imeisByLine = new Map<string, string[]>();
    for (const item of input.items) {
      const existing = imeisByLine.get(item.purchaseLineId) ?? [];
      imeisByLine.set(item.purchaseLineId, [
        ...existing,
        ...item.imeis.map((imei) => imei.trim()),
      ]);
    }
    const allImeis = [...imeisByLine.values()].flat();
    const duplicates = allImeis.filter(
      (imei, index) => allImeis.indexOf(imei) !== index,
    );
    if (duplicates.length > 0) {
      throw new BadRequestException(
        `本次收货存在重复 IMEI:${[...new Set(duplicates)].slice(0, 5).join("、")}`,
      );
    }

    // 收货批次号唯一约束兜底,冲突时重试(IMEI 冲突不重试,直接 409)
    for (let attempt = 0; ; attempt += 1) {
      const receiptCode = generateReceiptCode();
      try {
        await this.database.client.$transaction(async (tx) => {
          const order = await tx.purchaseOrder.findUnique({
            where: { id },
            select: {
              id: true,
              code: true,
              approvalStatus: true,
              receiptStatus: true,
              warehouseId: true,
            },
          });
          if (!order) throw new NotFoundException("采购单不存在");
          if (order.approvalStatus !== PurchaseApprovalStatus.APPROVED) {
            throw new UnprocessableEntityException(
              `当前审批状态(${order.approvalStatus})不允许收货,需先审批通过`,
            );
          }
          // 盘点封存检查:收货仓盘点期间禁止入库(与库存变动同一事务)
          await this.freeze.assertNotFrozen([order.warehouseId], tx);

          const lines = await tx.purchaseLine.findMany({
            where: { purchaseOrderId: id, id: { in: [...imeisByLine.keys()] } },
            select: {
              id: true,
              skuId: true,
              quantity: true,
              receivedQuantity: true,
              unitPrice: true,
            },
          });
          if (lines.length !== imeisByLine.size) {
            throw new UnprocessableEntityException("部分明细行不属于本采购单");
          }
          for (const line of lines) {
            const count = imeisByLine.get(line.id)!.length;
            if (line.receivedQuantity + count > line.quantity) {
              throw new UnprocessableEntityException(
                `超收:该行已收 ${line.receivedQuantity}/共 ${line.quantity} 台,本次 ${count} 台超出订购数量(超收容差规则待签字,当前拒绝)`,
              );
            }
          }

          // IMEI 公司范围唯一(imeiPrimary 唯一约束兜底并发写入)
          const existingSerials = await tx.serialItem.findMany({
            where: { imeiPrimary: { in: allImeis } },
            select: { imeiPrimary: true },
          });
          if (existingSerials.length > 0) {
            throw new ConflictException(
              `以下 IMEI 已存在于系统,不允许重复入库:${existingSerials
                .slice(0, 5)
                .map((serial) => serial.imeiPrimary)
                .join("、")}${existingSerials.length > 5 ? " 等" : ""}`,
            );
          }

          const receiptId = randomUUID();
          const receivedAt = new Date();
          const serialRows: Prisma.SerialItemCreateManyInput[] = [];
          const receiptItems: Prisma.PurchaseReceiptItemCreateManyInput[] = [];
          for (const line of lines) {
            for (const imei of imeisByLine.get(line.id)!) {
              const serialId = randomUUID();
              serialRows.push({
                id: serialId,
                skuId: line.skuId,
                imeiPrimary: imei,
                currentWarehouseId: order.warehouseId,
                status: "NORMAL",
                // 成本分摊规则待签字:当前按行单价暂记 unitCost
                unitCost: line.unitPrice,
                receivedAt,
              });
              receiptItems.push({
                id: randomUUID(),
                receiptId,
                purchaseLineId: line.id,
                serialId,
                imeiPrimary: imei,
              });
            }
          }
          await tx.serialItem.createMany({ data: serialRows });
          await tx.purchaseReceipt.create({
            data: {
              id: receiptId,
              purchaseOrderId: id,
              code: receiptCode,
              receivedById: request.user.userId,
              receivedAt,
              note: input.note?.trim() || null,
            },
          });
          await tx.purchaseReceiptItem.createMany({ data: receiptItems });

          // 行 receivedQuantity 累加:前置值条件防并发,失败即整个事务回滚
          for (const line of lines) {
            const count = imeisByLine.get(line.id)!.length;
            const updatedLine = await tx.purchaseLine.updateMany({
              where: { id: line.id, receivedQuantity: line.receivedQuantity },
              data: { receivedQuantity: line.receivedQuantity + count },
            });
            if (updatedLine.count !== 1) {
              throw new ConflictException(
                "收货进度已被其他操作变更,请刷新后重试",
              );
            }
          }

          // 主单收货维度按全部行聚合重算
          const allLines = await tx.purchaseLine.findMany({
            where: { purchaseOrderId: id },
            select: { quantity: true, receivedQuantity: true },
          });
          const nextStatus = aggregateReceiptStatus(allLines);
          await tx.purchaseOrder.update({
            where: { id },
            data: { receiptStatus: nextStatus },
          });

          // 一机一条 PURCHASE_RECEIPT 流水:documentId 关联采购主单
          await tx.inventoryMovement.createMany({
            data: serialRows.map((serial) => ({
              id: randomUUID(),
              documentId: id,
              documentType: "PURCHASE",
              movementType: "PURCHASE_RECEIPT" as const,
              skuId: serial.skuId,
              serialId: serial.id as string,
              quantity: 1,
              toWarehouseId: order.warehouseId,
              occurredAt: receivedAt,
            })),
          });

          await tx.auditLog.create({
            data: {
              actorUserId: request.user.userId,
              action: "procurement.receipt",
              resource: "procurement",
              resourceId: id,
              requestId: request.requestId,
              beforeData: { receiptStatus: order.receiptStatus },
              afterData: {
                receiptStatus: nextStatus,
                receiptCode,
                receivedCount: allImeis.length,
                code: order.code,
              },
            },
          });
        });
        break;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          const target = JSON.stringify(error.meta?.target ?? "");
          // 并发下 IMEI 撞唯一约束:提示冲突而非重试
          if (target.includes("imei")) {
            throw new ConflictException(
              "部分 IMEI 已被并发写入,请刷新后重试",
            );
          }
          if (attempt < 2) continue; // 收货批次号冲突,重试
        }
        throw error;
      }
    }
    return this.detail(id);
  }

  /**
   * 完成采购单:校验审批/付款/收货三维度全部满足(docs/12:主单完成由聚合结果决定,
   * 不能手工勾选),写 completedAt(completedAt 非空即已完成,不引入第四个状态字段)。
   */
  async complete(id: string, request: AuthenticatedRequest) {
    await this.database.client.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.findUnique({
        where: { id },
        select: {
          id: true,
          code: true,
          approvalStatus: true,
          paymentStatus: true,
          receiptStatus: true,
          completedAt: true,
        },
      });
      if (!order) throw new NotFoundException("采购单不存在");
      if (order.completedAt) {
        throw new UnprocessableEntityException("采购单已完成,不允许重复操作");
      }
      const missing: string[] = [];
      if (order.approvalStatus !== PurchaseApprovalStatus.APPROVED) {
        missing.push(`审批未通过(当前 ${order.approvalStatus})`);
      }
      if (order.paymentStatus !== PurchasePaymentStatus.PAID) {
        missing.push(`付款未完成(当前 ${order.paymentStatus})`);
      }
      if (order.receiptStatus !== PurchaseReceiptStatus.RECEIVED) {
        missing.push(`收货未完成(当前 ${order.receiptStatus})`);
      }
      if (missing.length > 0) {
        throw new UnprocessableEntityException(
          `不满足完成条件:${missing.join("；")}`,
        );
      }
      const completedAt = new Date();
      const updated = await tx.purchaseOrder.updateMany({
        where: {
          id,
          approvalStatus: PurchaseApprovalStatus.APPROVED,
          paymentStatus: PurchasePaymentStatus.PAID,
          receiptStatus: PurchaseReceiptStatus.RECEIVED,
          completedAt: null,
        },
        data: { completedAt },
      });
      if (updated.count !== 1) {
        throw new ConflictException("状态已被其他操作变更,请刷新后重试");
      }
      await tx.auditLog.create({
        data: {
          actorUserId: request.user.userId,
          action: "procurement.complete",
          resource: "procurement",
          resourceId: id,
          requestId: request.requestId,
          beforeData: { completedAt: null },
          afterData: { completedAt: completedAt.toISOString(), code: order.code },
        },
      });
    });
    return this.detail(id);
  }

  // ---------- 内部工具 ----------

  /**
   * 审批维度通用状态转换:updateMany + 前置状态条件保证原子性,
   * 并发下重复提交只有一个成功,其余返回 409;跳步返回 422(docs/12 通用规则)。
   */
  private async transition(
    id: string,
    request: AuthenticatedRequest,
    options: {
      action: string;
      from: PurchaseApprovalStatus[];
      to: PurchaseApprovalStatus;
      data?: Prisma.PurchaseOrderUpdateManyMutationInput;
    },
  ) {
    return this.database.client.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.findUnique({
        where: { id },
        select: { id: true, code: true, approvalStatus: true },
      });
      if (!order) throw new NotFoundException("采购单不存在");
      if (!options.from.includes(order.approvalStatus)) {
        throw new UnprocessableEntityException(
          `当前审批状态(${order.approvalStatus})不允许该操作,期望状态:${options.from.join("/")}`,
        );
      }
      const updated = await tx.purchaseOrder.updateMany({
        where: { id, approvalStatus: { in: options.from } },
        data: { ...options.data, approvalStatus: options.to },
      });
      if (updated.count !== 1) {
        throw new ConflictException("状态已被其他操作变更,请刷新后重试");
      }
      await tx.auditLog.create({
        data: {
          actorUserId: request.user.userId,
          action: options.action,
          resource: "procurement",
          resourceId: id,
          requestId: request.requestId,
          beforeData: { approvalStatus: order.approvalStatus },
          afterData: { approvalStatus: options.to, code: order.code },
        },
      });
      return order;
    });
  }

  /** 批量解析操作人姓名(操作人字段不建外键,单独查询,与调拨模式一致) */
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
