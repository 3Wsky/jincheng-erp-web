import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, SerialStatus } from "@jincheng/database";
import { DatabaseService } from "../../database/database.service.js";

/** 公司类仓库类型:总仓/门店/售后/异常库 */
const COMPANY_TYPES = ["COMPANY", "STORE", "AFTER_SALES", "ABNORMAL"] as const;

/**
 * 全局查货匹配条件:一个关键字同时覆盖 IMEI 主/副、序列号、SKU 编码/名称、
 * 单条码与多条码、品牌与型号(REQ-GOODS-005 / AC-F-004)。
 * 导出为纯函数,便于不连数据库做单元测试(TC-INV-004)。
 */
export function buildSerialSearchWhere(
  keyword: string,
): Prisma.SerialItemWhereInput {
  const q = keyword.trim();
  return {
    OR: [
      { imeiPrimary: { contains: q, mode: "insensitive" } },
      { imeiSecondary: { contains: q, mode: "insensitive" } },
      { serialNumber: { contains: q, mode: "insensitive" } },
      { sku: { code: { contains: q, mode: "insensitive" } } },
      { sku: { name: { contains: q, mode: "insensitive" } } },
      { sku: { barcode: { contains: q, mode: "insensitive" } } },
      {
        sku: {
          barcodes: { some: { value: { contains: q, mode: "insensitive" } } },
        },
      },
      { sku: { product: { brand: { contains: q, mode: "insensitive" } } } },
      {
        sku: { product: { modelName: { contains: q, mode: "insensitive" } } },
      },
    ],
  };
}

export interface SerialSearchQuery {
  q: string;
  status?: SerialStatus;
  warehouseId?: string;
  /** 下钻过滤:聚合视图点击某商品后仅看该 SKU 的明细 */
  skuId?: string;
  page?: number;
  pageSize?: number;
}

/** 聚合视图的状态归类:找货场景先看可售,在途/锁定为次要信息 */
export function classifySerialStatus(
  status: SerialStatus,
): "available" | "pending" | "other" {
  if (status === "NORMAL") return "available";
  if (
    status === "LOCKED" ||
    status === "IN_TRANSIT" ||
    status === "PENDING_CONFIRM"
  ) {
    return "pending";
  }
  return "other";
}

/** 配件识别关键词(管家婆商品名无品类字段,按名称启发式判别) */
const ACCESSORY_NAME_PATTERN =
  /保护壳|保护套|手机壳|钢化膜|保护膜|贴膜|水凝膜|液冷壳|磁吸壳|磁吸支架|充电器|充电线|数据线|充电宝|耳机|支架|适配器|车充|底座|表带|皮套|背包|鼠标|键盘|手写笔|碎屏|延保|保障|服务|会员|音箱|音响|保护屏/;

/**
 * 商品分组归类(2026-08-12 验收反馈:视觉焦点放在真机上,手机壳与演示机往下排):
 * - demo:名称以「演」开头(管家婆演示机命名约定);
 * - accessory:名称命中配件关键词;
 * - primary:其余(真机/主商品)。
 * 导出为纯函数便于单元测试(TC-INV-007)。
 */
export function classifySkuGroupKind(
  skuName: string,
): "primary" | "accessory" | "demo" {
  const name = skuName.trim();
  if (name.startsWith("演")) return "demo";
  if (ACCESSORY_NAME_PATTERN.test(name)) return "accessory";
  return "primary";
}

/** 分组排序权重:真机 → 配件 → 演示机 */
const KIND_ORDER: Record<ReturnType<typeof classifySkuGroupKind>, number> = {
  primary: 0,
  accessory: 1,
  demo: 2,
};

/** 去空格小写(连写匹配的归一化口径) */
export function compactText(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

/**
 * 连写关键词的词边界匹配(TC-INV-009,2026-08-12 验收反馈:
 * 搜 mate80pro 不应命中 Mate 80 Pro Max):
 * 关键词在归一化商品名中出现,且出现位置之后不能紧跟字母或 +
 * (字母=型号延伸如 max;+=Pro+ 是另一型号);数字/中文/结尾视为边界。
 */
export function hasCompactTokenMatch(
  compactName: string,
  compactKeyword: string,
): boolean {
  let index = compactName.indexOf(compactKeyword);
  while (index !== -1) {
    const next = compactName[index + compactKeyword.length];
    if (next === undefined || !/[a-z+]/.test(next)) return true;
    index = compactName.indexOf(compactKeyword, index + 1);
  }
  return false;
}

/**
 * 颜色提取(2026-08-12 验收需求:按颜色分类):
 * 取商品名中最后一个"颜色词"(≤4 字修饰 + 颜色字结尾),
 * 覆盖「极夜黑」「皓月银」「星云粉」及「黑色素皮表带」中的「黑色」。
 * 导出为纯函数便于单元测试(TC-INV-008)。
 */
export function parseSkuColor(skuName: string): string | null {
  const matches = skuName.match(
    /[\u4e00-\u9fa5]{0,4}?[黑白金银绿蓝紫红粉灰青棕橙黄]色?/g,
  );
  if (!matches || matches.length === 0) return null;
  // 结尾的颜色词最能代表配色;去掉尾缀「色」统一口径(黑色→黑 与 极夜黑 并存)
  const last = matches[matches.length - 1]!;
  return last.length > 1 && last.endsWith("色") ? last.slice(0, -1) : last;
}

/**
 * 规格提取(按品类自适应,2026-08-12 与业务确认的分类口径):
 * - 手机/平板:内存+存储容量对(12GB+512GB / 8+256 → 归一化 12+512);
 * - 电脑:CPU 型号 + 容量对(i5 16+512);
 * - 手表:表盘尺寸(42mm);
 * - 显示器/平板:屏幕尺寸(28.2寸,无容量对时使用);
 * - 耳机/配件:无规格(仅按颜色分类)。
 * 导出为纯函数便于单元测试(TC-INV-008)。
 */
export function parseSkuSpec(skuName: string): string | null {
  const parts: string[] = [];
  const cpu = skuName.match(/\b(i[3579]|R[579]|Ultra\s?[579]?)\b/i);
  if (cpu) parts.push(cpu[1]!.toLowerCase().replace(/\s/g, ""));

  const capacity = skuName.match(
    /(\d+)\s*(?:GB|G)?\s*\+\s*(\d+)\s*(TB|T|GB|G)?/i,
  );
  if (capacity) {
    const storageUnit = capacity[3]?.toUpperCase().startsWith("T") ? "T" : "";
    parts.push(`${capacity[1]}+${capacity[2]}${storageUnit}`);
  } else {
    // 无容量对时用尺寸类规格:表盘 mm 或屏幕寸
    const dial = skuName.match(/(\d{2})\s*mm/i);
    if (dial) {
      parts.push(`${dial[1]}mm`);
    } else {
      const screen = skuName.match(/(\d+(?:\.\d+)?)\s*英?寸/);
      if (screen) parts.push(`${screen[1]}寸`);
    }
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

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

  /**
   * 连写容错:业务方习惯连写型号(如 mate80promax),而商品名带空格(Mate 80 Pro Max)。
   * 把关键字与商品名/型号都去掉空格后匹配,返回命中的 SKU id 集合。
   * SQL LIKE 取候选后在应用层做词边界校验(见 hasCompactTokenMatch),
   * 防止 mate80pro 误命中 Mate 80 Pro Max / Pro+(2026-08-12 验收反馈)。
   * 试点期全表表达式扫描(1600+ SKU)可接受;数据量上来后加表达式索引。
   */
  private async matchSkuIdsIgnoringSpaces(keyword: string): Promise<string[]> {
    const compact = keyword.trim().replace(/\s+/g, "").toLowerCase();
    if (compact.length < 2) return [];
    // 转义 LIKE 通配符,防止用户输入 % _ 干扰匹配
    const escaped = compact.replace(/[\\%_]/g, "\\$&");
    const pattern = `%${escaped}%`;
    const rows = await this.database.client.$queryRaw<
      Array<{ id: string; name: string; modelName: string }>
    >`
      SELECT s.id, s.name, p."modelName"
      FROM "Sku" s
      JOIN "Product" p ON p.id = s."productId"
      WHERE replace(lower(s.name), ' ', '') LIKE ${pattern}
         OR replace(lower(p."modelName"), ' ', '') LIKE ${pattern}
      LIMIT 1000
    `;
    return rows
      .filter(
        (row) =>
          hasCompactTokenMatch(compactText(row.name), compact) ||
          hasCompactTokenMatch(compactText(row.modelName), compact),
      )
      .map((row) => row.id);
  }

  /** 关键字条件 = 九维度 contains + 连写容错(供列表与聚合视图共用) */
  private async buildKeywordWhere(
    keyword: string,
  ): Promise<Prisma.SerialItemWhereInput> {
    const keywordWhere = buildSerialSearchWhere(keyword);
    const compactSkuIds = await this.matchSkuIdsIgnoringSpaces(keyword);
    if (compactSkuIds.length > 0) {
      keywordWhere.OR!.push({ skuId: { in: compactSkuIds } });
    }
    return keywordWhere;
  }

  /** 聚合视图返回的 SKU 组上限(命中过多时按可售数取前 N,提示细化关键词) */
  private static readonly SUMMARY_GROUP_LIMIT = 50;

  /**
   * 查货聚合视图(AC-F-004 找货第一步):回答「这款商品在哪个仓库有几台」。
   * 按 SKU × 仓库 × 状态聚合,可售(NORMAL)优先展示,在途/锁定与其他状态为次要计数。
   */
  async searchSummary(q: string) {
    const keywordWhere = await this.buildKeywordWhere(q);
    const groups = await this.database.client.serialItem.groupBy({
      by: ["skuId", "currentWarehouseId", "status"],
      where: keywordWhere,
      _count: { _all: true },
    });

    // skuId → warehouseId → {available,pending,other}
    interface WarehouseBucket {
      available: number;
      pending: number;
      other: number;
    }
    const skuMap = new Map<string, Map<string, WarehouseBucket>>();
    let totalSerials = 0;
    for (const group of groups) {
      totalSerials += group._count._all;
      const warehouseMap =
        skuMap.get(group.skuId) ?? new Map<string, WarehouseBucket>();
      const bucket = warehouseMap.get(group.currentWarehouseId) ?? {
        available: 0,
        pending: 0,
        other: 0,
      };
      bucket[classifySerialStatus(group.status)] += group._count._all;
      warehouseMap.set(group.currentWarehouseId, bucket);
      skuMap.set(group.skuId, warehouseMap);
    }

    const skuIds = [...skuMap.keys()];
    const warehouseIds = [
      ...new Set(
        [...skuMap.values()].flatMap((warehouseMap) => [...warehouseMap.keys()]),
      ),
    ];
    const [skus, warehouses] = await Promise.all([
      skuIds.length > 0
        ? this.database.client.sku.findMany({
            where: { id: { in: skuIds } },
            select: {
              id: true,
              code: true,
              name: true,
              retailPrice: true,
              product: { select: { brand: true, modelName: true } },
            },
          })
        : Promise.resolve([]),
      warehouseIds.length > 0
        ? this.database.client.warehouse.findMany({
            where: { id: { in: warehouseIds } },
            select: {
              id: true,
              name: true,
              type: true,
              store: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
    ]);
    const skuById = new Map(skus.map((sku) => [sku.id, sku]));
    const warehouseById = new Map(
      warehouses.map((warehouse) => [warehouse.id, warehouse]),
    );

    const skuGroups = [...skuMap.entries()]
      .map(([skuId, warehouseMap]) => {
        const sku = skuById.get(skuId);
        const skuName = sku?.name ?? "未知商品";
        const warehouseEntries = [...warehouseMap.entries()]
          .map(([warehouseId, bucket]) => {
            const warehouse = warehouseById.get(warehouseId);
            return {
              warehouseId,
              warehouseName: warehouse?.name ?? "未知仓库",
              warehouseType: warehouse?.type ?? "COMPANY",
              storeName: warehouse?.store?.name ?? null,
              available: bucket.available,
              pending: bucket.pending,
              other: bucket.other,
            };
          })
          // 可售多的仓库排前面;全占用的仓库沉底
          .sort((a, b) => b.available - a.available || b.pending - a.pending);
        const availableTotal = warehouseEntries.reduce(
          (sum, entry) => sum + entry.available,
          0,
        );
        const pendingTotal = warehouseEntries.reduce(
          (sum, entry) => sum + entry.pending,
          0,
        );
        const otherTotal = warehouseEntries.reduce(
          (sum, entry) => sum + entry.other,
          0,
        );
        return {
          skuId,
          skuCode: sku?.code ?? "",
          skuName,
          kind: classifySkuGroupKind(skuName),
          color: parseSkuColor(skuName),
          spec: parseSkuSpec(skuName),
          productBrand: sku?.product.brand ?? null,
          productModel: sku?.product.modelName ?? null,
          retailPrice: sku?.retailPrice?.toString() ?? null,
          availableTotal,
          pendingTotal,
          otherTotal,
          warehouses: warehouseEntries,
        };
      })
      // 真机优先(视觉焦点),配件次之,演示机沉底;同类内按可售数倒序
      .sort(
        (a, b) =>
          KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
          b.availableTotal - a.availableTotal,
      );

    const truncated = skuGroups.length > InventoryService.SUMMARY_GROUP_LIMIT;
    const visibleGroups = skuGroups.slice(
      0,
      InventoryService.SUMMARY_GROUP_LIMIT,
    );

    // 分类聚合(facets):只统计「有可售库存的真机」——配件/演示机统一归拢在
    // 次要区不参与分类,无货商品不进分类桶(2026-08-12 验收口径)。
    // 规格×颜色的交叉联动由前端基于分组数据本地计算。
    const colorBuckets = new Map<string, number>();
    const specBuckets = new Map<string, number>();
    for (const group of visibleGroups) {
      if (group.kind !== "primary" || group.availableTotal === 0) continue;
      if (group.color) {
        colorBuckets.set(group.color, (colorBuckets.get(group.color) ?? 0) + 1);
      }
      if (group.spec) {
        specBuckets.set(group.spec, (specBuckets.get(group.spec) ?? 0) + 1);
      }
    }
    const toFacet = (buckets: Map<string, number>) =>
      [...buckets.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "zh-CN"));

    return {
      totalSerials,
      skuCount: skuGroups.length,
      truncated,
      facets: {
        colors: toFacet(colorBuckets),
        specs: toFacet(specBuckets),
      },
      skuGroups: visibleGroups,
    };
  }

  /**
   * 全局查货(AC-F-004):跨仓按关键字检索序列号,支持状态与仓库过滤。
   * 返回分页结果 + 状态分布聚合;成本字段沿用 inventory:read 口径,
   * 字段级脱敏待权限矩阵签字后接入(docs/11)。
   */
  async search(query: SerialSearchQuery) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    // 关键字匹配 = 九维度 contains + 忽略空格的连写容错(命中 SKU 集合)
    const keywordWhere = await this.buildKeywordWhere(query.q);
    // baseWhere 不含状态过滤:byStatus 聚合始终反映全部状态分布,
    // 前端选中某状态后仍能看到并切换到其他状态
    const baseWhere: Prisma.SerialItemWhereInput = {
      ...keywordWhere,
      ...(query.warehouseId ? { currentWarehouseId: query.warehouseId } : {}),
      ...(query.skuId ? { skuId: query.skuId } : {}),
    };
    const where: Prisma.SerialItemWhereInput = {
      ...baseWhere,
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total, statusGroups] = await this.database.client.$transaction([
      this.database.client.serialItem.findMany({
        where,
        include: {
          sku: {
            include: { product: { select: { brand: true, modelName: true } } },
          },
          currentWarehouse: {
            select: {
              id: true,
              name: true,
              type: true,
              store: { select: { name: true } },
            },
          },
          responsibleEmployee: { select: { id: true, name: true } },
        },
        orderBy: { receivedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.database.client.serialItem.count({ where }),
      this.database.client.serialItem.groupBy({
        by: ["status"],
        where: baseWhere,
        _count: { _all: true },
      }),
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
        retailPrice: item.sku.retailPrice?.toString() ?? null,
        warehouseId: item.currentWarehouse.id,
        warehouseName: item.currentWarehouse.name,
        warehouseType: item.currentWarehouse.type,
        storeName: item.currentWarehouse.store?.name ?? null,
        responsibleEmployeeName: item.responsibleEmployee?.name ?? null,
        receivedAt: item.receivedAt,
        unitCost: item.unitCost.toString(),
      })),
      byStatus: statusGroups
        .map((group) => ({ status: group.status, count: group._count._all }))
        .sort((a, b) => b.count - a.count),
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    };
  }

  /**
   * 单机档案(AC-F-005):序列号详情 + 全部库存流水时间线。
   * 时间线按发生时间正序,承接期初导入(OPENING_BALANCE)与未来单据流水。
   */
  async serialDetail(id: string) {
    const serial = await this.database.client.serialItem.findUnique({
      where: { id },
      include: {
        sku: {
          include: {
            product: {
              select: { brand: true, modelName: true, category: true },
            },
          },
        },
        currentWarehouse: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            store: { select: { name: true } },
          },
        },
        responsibleEmployee: { select: { id: true, name: true } },
        movements: {
          orderBy: { occurredAt: "asc" },
          include: {
            fromWarehouse: { select: { name: true } },
            toWarehouse: { select: { name: true } },
          },
        },
      },
    });
    if (!serial) {
      throw new NotFoundException("序列号不存在");
    }

    return {
      id: serial.id,
      imeiPrimary: serial.imeiPrimary,
      imeiSecondary: serial.imeiSecondary,
      serialNumber: serial.serialNumber,
      status: serial.status,
      skuCode: serial.sku.code,
      skuName: serial.sku.name,
      productBrand: serial.sku.product.brand,
      productModel: serial.sku.product.modelName,
      productCategory: serial.sku.product.category,
      retailPrice: serial.sku.retailPrice?.toString() ?? null,
      warehouseId: serial.currentWarehouse.id,
      warehouseCode: serial.currentWarehouse.code,
      warehouseName: serial.currentWarehouse.name,
      warehouseType: serial.currentWarehouse.type,
      storeName: serial.currentWarehouse.store?.name ?? null,
      responsibleEmployeeName: serial.responsibleEmployee?.name ?? null,
      unitCost: serial.unitCost.toString(),
      receivedAt: serial.receivedAt,
      createdAt: serial.createdAt,
      updatedAt: serial.updatedAt,
      movements: serial.movements.map((movement) => ({
        id: movement.id,
        documentId: movement.documentId,
        documentType: movement.documentType,
        movementType: movement.movementType,
        quantity: movement.quantity,
        fromWarehouseName: movement.fromWarehouse?.name ?? null,
        toWarehouseName: movement.toWarehouse?.name ?? null,
        occurredAt: movement.occurredAt,
      })),
    };
  }
}
