import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";

/** 单个待办条目(指向真实业务单据,点击跳对应模块处理) */
export interface TaskItem {
  id: string;
  code: string;
  title: string;
  at: Date;
}

/** 待办分组:key 稳定供前端图标/跳转映射,route 为处理入口页面 */
export interface TaskGroup {
  key: string;
  label: string;
  route: string;
  count: number;
  items: TaskItem[];
}

/** 每组最多返回的明细条数(数量以 count 为准) */
const ITEMS_PER_GROUP = 5;

/**
 * 我的待办:不建独立任务表,由业务单据状态实时推导——
 * 单据即事实,避免任务与单据状态失同步(审批流单据化待审批矩阵签字后再评估)。
 * 分组按当前用户权限过滤:出纳只见待付款、库管只见待收货/发出等。
 */
@Injectable()
export class TasksService {
  constructor(private readonly database: DatabaseService) {}

  async summary(request: AuthenticatedRequest) {
    const permissions = new Set(request.user.permissions);
    const groups: TaskGroup[] = [];

    // ---- 调拨(transfer:write 可办理) ----
    if (permissions.has("transfer:write")) {
      const [submitted, approved, locked, inTransit] = await Promise.all([
        this.transferGroup("SUBMITTED"),
        this.transferGroup("APPROVED"),
        this.transferGroup("LOCKED"),
        this.database.client.transferOrder.findMany({
          where: { status: { in: ["IN_TRANSIT", "PARTIALLY_RECEIVED"] } },
          orderBy: { updatedAt: "asc" },
          take: ITEMS_PER_GROUP,
          include: {
            fromWarehouse: { select: { name: true } },
            toWarehouse: { select: { name: true } },
            _count: { select: { lines: true } },
          },
        }),
      ]);
      this.push(groups, "transfer-approve", "调拨待审批", "/transfers", submitted);
      this.push(groups, "transfer-lock", "调拨待锁库", "/transfers", approved);
      this.push(groups, "transfer-ship", "调拨待发出", "/transfers", locked);
      const inTransitCount = await this.database.client.transferOrder.count({
        where: { status: { in: ["IN_TRANSIT", "PARTIALLY_RECEIVED"] } },
      });
      if (inTransitCount > 0) {
        groups.push({
          key: "transfer-receive",
          label: "调拨在途待接收",
          route: "/transfers",
          count: inTransitCount,
          items: inTransit.map((transfer) => ({
            id: transfer.id,
            code: transfer.code,
            title: `${transfer.fromWarehouse.name} → ${transfer.toWarehouse.name} · ${transfer._count.lines} 台`,
            at: transfer.updatedAt,
          })),
        });
      }
    }

    // ---- 采购(审批/收货需 procurement:write;付款需 procurement:pay) ----
    if (permissions.has("procurement:write")) {
      const submitted = await this.purchaseGroup({
        approvalStatus: "SUBMITTED",
      });
      this.pushPurchase(groups, "purchase-approve", "采购待审批", submitted);

      const receiving = await this.purchaseGroup({
        approvalStatus: "APPROVED",
        receiptStatus: { in: ["NOT_RECEIVED", "PARTIALLY_RECEIVED"] },
      });
      this.pushPurchase(groups, "purchase-receive", "采购待收货", receiving);
    }
    if (permissions.has("procurement:pay")) {
      const paying = await this.purchaseGroup({
        approvalStatus: "APPROVED",
        paymentStatus: { in: ["UNPAID", "PARTIALLY_PAID"] },
      });
      this.pushPurchase(groups, "purchase-pay", "采购待付款", paying);
    }

    // ---- 盘点(inventory:write 可办理) ----
    if (permissions.has("inventory:write")) {
      const active = await this.database.client.stocktakeOrder.findMany({
        where: { status: { in: ["COUNTING", "SUBMITTED", "APPROVED"] } },
        orderBy: { updatedAt: "asc" },
        take: ITEMS_PER_GROUP,
        include: { warehouse: { select: { name: true } } },
      });
      const activeCount = await this.database.client.stocktakeOrder.count({
        where: { status: { in: ["COUNTING", "SUBMITTED", "APPROVED"] } },
      });
      if (activeCount > 0) {
        const statusLabel: Record<string, string> = {
          COUNTING: "盘点中",
          SUBMITTED: "待审批",
          APPROVED: "待过账",
        };
        groups.push({
          key: "stocktake-active",
          label: "盘点进行中（仓库封存）",
          route: "/inventory/stocktakes",
          count: activeCount,
          items: active.map((stocktake) => ({
            id: stocktake.id,
            code: stocktake.code,
            title: `${stocktake.warehouse.name} · ${statusLabel[stocktake.status] ?? stocktake.status}`,
            at: stocktake.updatedAt,
          })),
        });
      }
    }

    // ---- 异常设备(inventory:read 可见,提醒推进报损/找回) ----
    if (permissions.has("inventory:read")) {
      const abnormalCount = await this.database.client.serialItem.count({
        where: { status: "ABNORMAL" },
      });
      if (abnormalCount > 0) {
        const samples = await this.database.client.serialItem.findMany({
          where: { status: "ABNORMAL" },
          orderBy: { updatedAt: "desc" },
          take: ITEMS_PER_GROUP,
          include: {
            sku: { select: { name: true } },
            currentWarehouse: { select: { name: true } },
          },
        });
        groups.push({
          key: "abnormal-serials",
          label: "异常设备待处理（盘亏/差异，待报损或找回）",
          route: "/search",
          count: abnormalCount,
          items: samples.map((serial) => ({
            id: serial.id,
            code: serial.imeiPrimary,
            title: `${serial.sku.name} · ${serial.currentWarehouse.name}`,
            at: serial.updatedAt,
          })),
        });
      }
    }

    return {
      totalCount: groups.reduce((sum, group) => sum + group.count, 0),
      groups,
    };
  }

  // ---------- 内部工具 ----------

  /** 调拨分组查询(单状态) */
  private async transferGroup(status: "SUBMITTED" | "APPROVED" | "LOCKED") {
    const [count, items] = await Promise.all([
      this.database.client.transferOrder.count({ where: { status } }),
      this.database.client.transferOrder.findMany({
        where: { status },
        orderBy: { updatedAt: "asc" },
        take: ITEMS_PER_GROUP,
        include: {
          fromWarehouse: { select: { name: true } },
          toWarehouse: { select: { name: true } },
          _count: { select: { lines: true } },
        },
      }),
    ]);
    return { count, items };
  }

  private push(
    groups: TaskGroup[],
    key: string,
    label: string,
    route: string,
    data: Awaited<ReturnType<TasksService["transferGroup"]>>,
  ): void {
    if (data.count === 0) return;
    groups.push({
      key,
      label,
      route,
      count: data.count,
      items: data.items.map((transfer) => ({
        id: transfer.id,
        code: transfer.code,
        title: `${transfer.fromWarehouse.name} → ${transfer.toWarehouse.name} · ${transfer._count.lines} 台`,
        at: transfer.updatedAt,
      })),
    });
  }

  /** 采购分组查询 */
  private async purchaseGroup(where: Record<string, unknown>) {
    const [count, items] = await Promise.all([
      this.database.client.purchaseOrder.count({ where }),
      this.database.client.purchaseOrder.findMany({
        where,
        orderBy: { updatedAt: "asc" },
        take: ITEMS_PER_GROUP,
        include: { supplier: { select: { name: true } } },
      }),
    ]);
    return { count, items };
  }

  private pushPurchase(
    groups: TaskGroup[],
    key: string,
    label: string,
    data: Awaited<ReturnType<TasksService["purchaseGroup"]>>,
  ): void {
    if (data.count === 0) return;
    groups.push({
      key,
      label,
      route: "/procurement/orders",
      count: data.count,
      items: data.items.map((order) => ({
        id: order.id,
        code: order.code,
        title: `${order.supplier.name} · ¥${order.totalAmount.toString()}`,
        at: order.updatedAt,
      })),
    });
  }
}
