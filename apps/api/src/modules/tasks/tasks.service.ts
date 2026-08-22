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

/** 到期日期短格式(待办标题用) */
function formatDueDate(at: Date): string {
  return `${at.getMonth() + 1}/${at.getDate()}`;
}

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

    // ---- 个人库存(AC-F-007):领用/归还待库管确认;转交待接收方确认 ----
    if (permissions.has("inventory:write")) {
      const pending = await this.personalStockGroup({
        status: "SUBMITTED",
        type: { in: ["ISSUE", "RETURN"] },
      });
      this.pushPersonalStock(
        groups,
        "personal-confirm",
        "个人库存待确认（领用/归还）",
        pending,
      );
    }
    if (permissions.has("inventory:read") && request.user.employeeId) {
      const handovers = await this.personalStockGroup({
        status: "SUBMITTED",
        type: "HANDOVER",
        toEmployeeId: request.user.employeeId,
      });
      this.pushPersonalStock(
        groups,
        "personal-handover",
        "个人库存转交待接收",
        handovers,
      );
    }

    // ---- 到期回访(customer:read 可见;REQ-PEOPLE-012:next_followup_at 到期自动进待办) ----
    if (permissions.has("customer:read")) {
      const dueFollowups = await this.dueFollowups();
      if (dueFollowups.length > 0) {
        groups.push({
          key: "followup-due",
          label: "客户回访到期",
          route: "/crm/customers",
          count: dueFollowups.length,
          items: dueFollowups.slice(0, ITEMS_PER_GROUP).map((row) => ({
            id: row.customerId,
            code: row.customerName,
            title: `约定 ${formatDueDate(row.nextFollowupAt)} 回访${row.note ? ` · ${row.note}` : ""}`,
            at: row.nextFollowupAt,
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

  /**
   * 到期回访:每个客户取最新一条回访记录,其 nextFollowupAt 已到期且之后无新回访
   * (回访后 nextFollowupAt 由新记录接管,旧提醒自动消失);已作废客户不提醒。
   */
  private async dueFollowups() {
    return this.database.client.$queryRaw<
      Array<{
        customerId: string;
        customerName: string;
        nextFollowupAt: Date;
        note: string | null;
      }>
    >`
      SELECT latest."customerId" AS "customerId",
             c.name              AS "customerName",
             latest."nextFollowupAt" AS "nextFollowupAt",
             latest.note         AS note
      FROM (
        SELECT DISTINCT ON ("customerId")
               "customerId", "nextFollowupAt", note, "occurredAt"
        FROM "FollowupRecord"
        ORDER BY "customerId", "occurredAt" DESC
      ) latest
      JOIN "Customer" c ON c.id = latest."customerId"
      WHERE latest."nextFollowupAt" IS NOT NULL
        AND latest."nextFollowupAt" <= NOW()
        AND c."archivedAt" IS NULL
      ORDER BY latest."nextFollowupAt" ASC
      LIMIT 200
    `;
  }

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

  private async personalStockGroup(where: Record<string, unknown>) {
    const [count, items] = await Promise.all([
      this.database.client.personalStockOrder.count({ where }),
      this.database.client.personalStockOrder.findMany({
        where,
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

  private pushPersonalStock(
    groups: TaskGroup[],
    key: string,
    label: string,
    data: Awaited<ReturnType<TasksService["personalStockGroup"]>>,
  ): void {
    if (data.count === 0) return;
    groups.push({
      key,
      label,
      route: "/inventory/personal",
      count: data.count,
      items: data.items.map((order) => ({
        id: order.id,
        code: order.code,
        title: `${order.fromWarehouse.name} → ${order.toWarehouse.name} · ${order._count.lines} 台`,
        at: order.updatedAt,
      })),
    });
  }
}
