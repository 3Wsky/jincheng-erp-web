import { Injectable } from "@nestjs/common";
import { Prisma } from "@jincheng/database";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";

export interface AuditEntry {
  action: string;
  resource: string;
  resourceId: string;
  actorUserId?: string | null;
  requestId?: string;
  ipAddress?: string;
  beforeData?: Prisma.InputJsonObject;
  afterData?: Prisma.InputJsonObject;
}

export interface OutboxEntry {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Prisma.InputJsonObject;
}

/**
 * 审计与 Outbox 基础服务。
 *
 * - 业务写入必须同时落审计日志（AGENTS.md 第 4 条）。
 * - outbox 用于未来的事件发布：先落库，再由独立 worker 推送到外部平台，
 *   保证「本地事务」与「对外通知」不因网络失败而不同步。
 */
@Injectable()
export class AuditService {
  constructor(private readonly database: DatabaseService) {}

  /**
   * 在独立事务中写入审计日志（无 outbox）。适合登录等非业务单据场景。
   */
  async record(entry: AuditEntry): Promise<void> {
    await this.database.client.auditLog.create({
      data: {
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId,
        beforeData: entry.beforeData,
        afterData: entry.afterData,
        requestId: entry.requestId ?? randomUUID(),
        ipAddress: entry.ipAddress,
      },
    });
  }

  /**
   * 在传入事务中写入审计日志与 outbox 事件。业务模块应在同一事务内调用，
   * 保证业务数据、审计、事件三者原子提交。
   */
  async writeWithEvent(
    tx: Prisma.TransactionClient,
    entry: AuditEntry,
    outbox: OutboxEntry,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId,
        beforeData: entry.beforeData,
        afterData: entry.afterData,
        requestId: entry.requestId ?? randomUUID(),
        ipAddress: entry.ipAddress,
      },
    });
    await tx.outboxEvent.create({
      data: {
        aggregateType: outbox.aggregateType,
        aggregateId: outbox.aggregateId,
        eventType: outbox.eventType,
        payload: outbox.payload,
      },
    });
  }

  /**
   * 分页查询审计日志（系统设置 → 审计查询）。
   */
  async listAuditLogs(query: {
    page?: number;
    pageSize?: number;
    resource?: string;
    resourceId?: string;
    action?: string;
    actorUserId?: string;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const where: Prisma.AuditLogWhereInput = {
      resource: query.resource || undefined,
      resourceId: query.resourceId || undefined,
      action: query.action || undefined,
      actorUserId: query.actorUserId || undefined,
    };
    const [items, total] = await this.database.client.$transaction([
      this.database.client.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          actor: {
            select: {
              id: true,
              username: true,
              employee: { select: { name: true } },
            },
          },
        },
      }),
      this.database.client.auditLog.count({ where }),
    ]);
    return {
      items: items.map((item) => ({
        id: item.id.toString(),
        actorUserId: item.actorUserId,
        actorName: item.actor?.employee?.name ?? null,
        actorUsername: item.actor?.username ?? null,
        action: item.action,
        resource: item.resource,
        resourceId: item.resourceId,
        requestId: item.requestId,
        ipAddress: item.ipAddress,
        beforeData: item.beforeData,
        afterData: item.afterData,
        createdAt: item.createdAt,
      })),
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    };
  }

  /**
   * 查询待发布事件数量（运维/健康检查用）。
   */
  async countPendingOutbox(): Promise<number> {
    return this.database.client.outboxEvent.count({
      where: { publishedAt: null },
    });
  }
}
