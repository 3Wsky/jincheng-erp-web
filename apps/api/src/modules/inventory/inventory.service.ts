import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@jincheng/database";
import { DatabaseService } from "../../database/database.service.js";

/** 公司类仓库类型:总仓/门店/售后/异常库 */
const COMPANY_TYPES = ["COMPANY", "STORE", "AFTER_SALES", "ABNORMAL"] as const;

@Injectable()
export class InventoryService {
  constructor(private readonly database: DatabaseService) {}

  /**
   * 仓库总览:按仓库聚合序列号数量,区分公司仓库与个人分销仓库。
   * 板块大小由 serialCount 决定,前端按面积无缝拼接。
   */
  async overview() {
    const warehouses = await this.database.client.warehouse.findMany({
      include: {
        store: { select: { name: true } },
        _count: { select: { serials: true } },
      },
      orderBy: { name: "asc" },
    });

    // ownerEmployeeId 未建关系,单独查员工名
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
      storeName: warehouse.store?.name ?? null,
      ownerEmployeeName: warehouse.ownerEmployeeId
        ? (ownerNameById.get(warehouse.ownerEmployeeId) ?? null)
        : null,
      serialCount: warehouse._count.serials,
    }));

    const totalSerials = items.reduce((sum, item) => sum + item.serialCount, 0);
    const companySerials = items
      .filter((item) => (COMPANY_TYPES as readonly string[]).includes(item.type))
      .reduce((sum, item) => sum + item.serialCount, 0);
    const personalSerials = totalSerials - companySerials;

    return { totalSerials, companySerials, personalSerials, warehouses: items };
  }

  /**
   * 指定仓库的序列号明细(分页),支持按 SKU/IMEI/SN 搜索。
   */
  async warehouseSerials(
    warehouseId: string,
    query: { page?: number; pageSize?: number; search?: string },
  ) {
    const warehouse = await this.database.client.warehouse.findUnique({
      where: { id: warehouseId },
      select: { id: true },
    });
    if (!warehouse) {
      throw new NotFoundException("仓库不存在");
    }

    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const search = query.search?.trim();
    const where: Prisma.SerialItemWhereInput = {
      currentWarehouseId: warehouseId,
      ...(search
        ? {
            OR: [
              { imeiPrimary: { contains: search, mode: "insensitive" } },
              {
                imeiSecondary: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                serialNumber: { contains: search, mode: "insensitive" },
              },
              { sku: { code: { contains: search, mode: "insensitive" } } },
              { sku: { name: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.database.client.$transaction([
      this.database.client.serialItem.findMany({
        where,
        include: {
          sku: {
            include: { product: { select: { brand: true, modelName: true } } },
          },
        },
        orderBy: { receivedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.database.client.serialItem.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        imeiPrimary: item.imeiPrimary,
        imeiSecondary: item.imeiSecondary,
        serialNumber: item.serialNumber,
        status: item.status,
        skuCode: item.sku.code,
        skuName: item.sku.name,
        productBrand: item.sku.product.brand,
        productModel: item.sku.product.modelName,
        receivedAt: item.receivedAt,
        unitCost: item.unitCost.toString(),
      })),
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    };
  }
}
