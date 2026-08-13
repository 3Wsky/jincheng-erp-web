import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma } from "@jincheng/database";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import {
  CreateCustomerDto,
  CreateFollowupDto,
  ListCustomersQueryDto,
  UpdateCustomerDto,
} from "./crm.dto.js";

/**
 * 手机号脱敏(docs/11:完整手机号默认中间位脱敏;明文可见角色待 Field 维度签字,
 * 当前对所有角色一律脱敏,包括管理员——docs/11:系统管理员不默认拥有客户明文读取权):
 * - 11 位手机号 → 前 3 后 4(138****5678);
 * - 其他长度 ≥ 7 → 前 2 后 2;
 * - 更短(4~6 位,如座机分机)→ 全掩码。
 * 导出为纯函数便于单元测试(TC-CRM-002)。
 */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  if (trimmed.length >= 11) {
    return `${trimmed.slice(0, 3)}${"*".repeat(trimmed.length - 7)}${trimmed.slice(-4)}`;
  }
  if (trimmed.length >= 7) {
    return `${trimmed.slice(0, 2)}${"*".repeat(trimmed.length - 4)}${trimmed.slice(-2)}`;
  }
  return "*".repeat(trimmed.length);
}

/** 规范化手机号:去空格与连字符,便于查询与重复识别(不改变存储原值语义) */
export function normalizePhone(phone: string): string {
  return phone.replace(/[\s-]/g, "");
}

@Injectable()
export class CrmService {
  constructor(private readonly database: DatabaseService) {}

  // ---------- 客户主档 ----------

  async list(query: ListCustomersQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const search = query.search?.trim();
    const where: Prisma.CustomerWhereInput = {
      ...(query.includeArchived ? {} : { archivedAt: null }),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { phone: { contains: normalizePhone(search) } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.database.client.$transaction([
      this.database.client.customer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          ownerStore: { select: { name: true } },
          ownerEmployee: { select: { name: true } },
          followups: {
            orderBy: { occurredAt: "desc" },
            take: 1,
            select: { occurredAt: true, nextFollowupAt: true },
          },
          _count: { select: { followups: true } },
        },
      }),
      this.database.client.customer.count({ where }),
    ]);
    return {
      items: items.map((customer) => {
        const latest = customer.followups[0] ?? null;
        return {
          id: customer.id,
          name: customer.name,
          phoneMasked: maskPhone(customer.phone),
          sourceChannel: customer.sourceChannel,
          ownerStoreName: customer.ownerStore?.name ?? null,
          ownerEmployeeName: customer.ownerEmployee?.name ?? null,
          remark: customer.remark,
          archivedAt: customer.archivedAt,
          lastFollowupAt: latest?.occurredAt ?? null,
          nextFollowupAt: latest?.nextFollowupAt ?? null,
          followupCount: customer._count.followups,
          createdAt: customer.createdAt,
        };
      }),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 建档(AC-F-015 重复识别):同组织同手机号存在未作废客户时返回 409 并附已有客户摘要;
   * 显式 allowDuplicate=true 才放行(受控建重;合并单据待去重规则签字后实现)。
   * 手机号不加数据库唯一约束——重复客户需保留以待受控合并,不能靠约束一刀切。
   */
  async create(input: CreateCustomerDto, request: AuthenticatedRequest) {
    const organization = await this.database.client.organization.findFirst({
      select: { id: true },
    });
    if (!organization) {
      throw new UnprocessableEntityException("组织未初始化,请先运行种子数据");
    }
    const phone = input.phone ? normalizePhone(input.phone) : null;

    if (phone && !input.allowDuplicate) {
      const existing = await this.database.client.customer.findFirst({
        where: { organizationId: organization.id, phone, archivedAt: null },
        include: { ownerEmployee: { select: { name: true } } },
      });
      if (existing) {
        throw new ConflictException({
          message: `手机号已存在客户「${existing.name}」,如确认是不同客户请选择仍然创建`,
          duplicate: {
            id: existing.id,
            name: existing.name,
            phoneMasked: maskPhone(existing.phone),
            ownerEmployeeName: existing.ownerEmployee?.name ?? null,
          },
        });
      }
    }

    await this.assertOwnerRefs(input.ownerStoreId, input.ownerEmployeeId);

    const id = randomUUID();
    await this.database.client.$transaction([
      this.database.client.customer.create({
        data: {
          id,
          organizationId: organization.id,
          name: input.name.trim(),
          phone,
          sourceChannel: input.sourceChannel?.trim() || null,
          ownerStoreId: input.ownerStoreId ?? null,
          ownerEmployeeId: input.ownerEmployeeId ?? null,
          remark: input.remark?.trim() || null,
          createdById: request.user.userId,
        },
      }),
      this.database.client.auditLog.create({
        data: {
          actorUserId: request.user.userId,
          action: "customer.create",
          resource: "customer",
          resourceId: id,
          requestId: request.requestId,
          // 审计不落手机号明文,防审计读取面扩大泄露(明文权限待签字)
          afterData: {
            name: input.name.trim(),
            phoneMasked: maskPhone(phone),
            sourceChannel: input.sourceChannel ?? null,
            allowDuplicate: input.allowDuplicate ?? false,
          },
        },
      }),
    ]);
    return this.detail(id);
  }

  async detail(id: string) {
    const customer = await this.database.client.customer.findUnique({
      where: { id },
      include: {
        ownerStore: { select: { id: true, name: true } },
        ownerEmployee: { select: { id: true, name: true } },
        identities: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            sourceSystem: true,
            sourceId: true,
            createdAt: true,
          },
        },
        followups: { orderBy: { occurredAt: "desc" } },
      },
    });
    if (!customer) throw new NotFoundException("客户不存在");

    const nameMap = await this.resolveUserNames([
      customer.createdById,
      ...customer.followups.map((followup) => followup.createdById),
    ]);
    return {
      id: customer.id,
      name: customer.name,
      phoneMasked: maskPhone(customer.phone),
      sourceChannel: customer.sourceChannel,
      ownerStoreId: customer.ownerStore?.id ?? null,
      ownerStoreName: customer.ownerStore?.name ?? null,
      ownerEmployeeId: customer.ownerEmployee?.id ?? null,
      ownerEmployeeName: customer.ownerEmployee?.name ?? null,
      remark: customer.remark,
      archivedAt: customer.archivedAt,
      createdByName: nameMap.get(customer.createdById) ?? null,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
      identities: customer.identities,
      followups: customer.followups.map((followup) => ({
        id: followup.id,
        method: followup.method,
        result: followup.result,
        note: followup.note,
        intentProduct: followup.intentProduct,
        expectedBuyAt: followup.expectedBuyAt,
        nextFollowupAt: followup.nextFollowupAt,
        occurredAt: followup.occurredAt,
        createdByName: nameMap.get(followup.createdById) ?? null,
      })),
    };
  }

  async update(
    id: string,
    input: UpdateCustomerDto,
    request: AuthenticatedRequest,
  ) {
    const customer = await this.database.client.customer.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        phone: true,
        sourceChannel: true,
        ownerStoreId: true,
        ownerEmployeeId: true,
        remark: true,
        archivedAt: true,
      },
    });
    if (!customer) throw new NotFoundException("客户不存在");
    if (customer.archivedAt) {
      throw new UnprocessableEntityException("客户已作废,不可修改");
    }
    await this.assertOwnerRefs(
      input.ownerStoreId ?? undefined,
      input.ownerEmployeeId ?? undefined,
    );

    const data: Prisma.CustomerUpdateInput = {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.phone !== undefined
        ? { phone: input.phone ? normalizePhone(input.phone) : null }
        : {}),
      ...(input.sourceChannel !== undefined
        ? { sourceChannel: input.sourceChannel?.trim() || null }
        : {}),
      ...(input.ownerStoreId !== undefined
        ? { ownerStore: input.ownerStoreId ? { connect: { id: input.ownerStoreId } } : { disconnect: true } }
        : {}),
      ...(input.ownerEmployeeId !== undefined
        ? { ownerEmployee: input.ownerEmployeeId ? { connect: { id: input.ownerEmployeeId } } : { disconnect: true } }
        : {}),
      ...(input.remark !== undefined
        ? { remark: input.remark?.trim() || null }
        : {}),
    };
    await this.database.client.$transaction([
      this.database.client.customer.update({ where: { id }, data }),
      this.database.client.auditLog.create({
        data: {
          actorUserId: request.user.userId,
          action: "customer.update",
          resource: "customer",
          resourceId: id,
          requestId: request.requestId,
          beforeData: {
            name: customer.name,
            phoneMasked: maskPhone(customer.phone),
            sourceChannel: customer.sourceChannel,
            ownerStoreId: customer.ownerStoreId,
            ownerEmployeeId: customer.ownerEmployeeId,
            remark: customer.remark,
          },
          afterData: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.phone !== undefined
              ? { phoneMasked: maskPhone(input.phone) }
              : {}),
            ...(input.sourceChannel !== undefined
              ? { sourceChannel: input.sourceChannel }
              : {}),
            ...(input.ownerStoreId !== undefined
              ? { ownerStoreId: input.ownerStoreId }
              : {}),
            ...(input.ownerEmployeeId !== undefined
              ? { ownerEmployeeId: input.ownerEmployeeId }
              : {}),
            ...(input.remark !== undefined ? { remark: input.remark } : {}),
          },
        },
      }),
    ]);
    return this.detail(id);
  }

  /** 作废(软删,AGENTS 第 4 条:重要历史数据不物理删除);回访历史保留可追溯 */
  async archive(id: string, request: AuthenticatedRequest) {
    const archivedAt = new Date();
    const updated = await this.database.client.customer.updateMany({
      where: { id, archivedAt: null },
      data: { archivedAt },
    });
    if (updated.count !== 1) {
      throw new ConflictException("客户不存在或已作废");
    }
    await this.database.client.auditLog.create({
      data: {
        actorUserId: request.user.userId,
        action: "customer.archive",
        resource: "customer",
        resourceId: id,
        requestId: request.requestId,
        beforeData: { archivedAt: null },
        afterData: { archivedAt: archivedAt.toISOString() },
      },
    });
    return this.detail(id);
  }

  // ---------- 回访(AC-F-016) ----------

  /**
   * 添加回访:实名到客户与员工(REQ-PEOPLE-009,员工取登录态);
   * 同日同人同客多次记录全部保留(REQ-PEOPLE-011:日志不丢,统计口径计 1 在查询层处理)。
   */
  async addFollowup(
    customerId: string,
    input: CreateFollowupDto,
    request: AuthenticatedRequest,
  ) {
    const customer = await this.database.client.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true, archivedAt: true },
    });
    if (!customer) throw new NotFoundException("客户不存在");
    if (customer.archivedAt) {
      throw new UnprocessableEntityException("客户已作废,不可添加回访");
    }

    const id = randomUUID();
    await this.database.client.$transaction([
      this.database.client.followupRecord.create({
        data: {
          id,
          customerId,
          createdById: request.user.userId,
          method: input.method?.trim() || null,
          result: input.result,
          note: input.note?.trim() || null,
          intentProduct: input.intentProduct?.trim() || null,
          expectedBuyAt: input.expectedBuyAt
            ? new Date(input.expectedBuyAt)
            : null,
          nextFollowupAt: input.nextFollowupAt
            ? new Date(input.nextFollowupAt)
            : null,
        },
      }),
      this.database.client.auditLog.create({
        data: {
          actorUserId: request.user.userId,
          action: "customer.followup",
          resource: "customer",
          resourceId: customerId,
          requestId: request.requestId,
          afterData: {
            followupId: id,
            result: input.result,
            method: input.method ?? null,
            nextFollowupAt: input.nextFollowupAt ?? null,
          },
        },
      }),
    ]);
    return this.detail(customerId);
  }

  // ---------- 内部工具 ----------

  /** 校验归属门店/员工引用存在,避免脏引用 */
  private async assertOwnerRefs(
    ownerStoreId?: string,
    ownerEmployeeId?: string,
  ) {
    if (ownerStoreId) {
      const store = await this.database.client.store.findUnique({
        where: { id: ownerStoreId },
        select: { id: true },
      });
      if (!store) throw new UnprocessableEntityException("归属门店不存在");
    }
    if (ownerEmployeeId) {
      const employee = await this.database.client.employee.findUnique({
        where: { id: ownerEmployeeId },
        select: { id: true },
      });
      if (!employee) throw new UnprocessableEntityException("归属员工不存在");
    }
  }

  /** 批量解析操作人姓名(与其他模块同模式) */
  private async resolveUserNames(
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
